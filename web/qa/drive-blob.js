/* R90 isolated browser-only Google Drive Blob transport QA.
   NEVER fetch /api/qa/* or send file/token to a Worker.
   Google OAuth access tokens live in closure memory only. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const root = byId('drive-blob-test');
  if (!root) return;
  const connect = byId('connect-google');
  const disconnect = byId('clear-token');
  const fileInput = byId('blob-file');
  const upload = byId('upload-blob');
  const selected = byId('selected-name');
  const status = byId('blob-status');
  const result = byId('result');
  const resultInfo = byId('result-info');
  const resultLink = byId('result-link');
  const clientId = root.dataset.googleClientId;
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const PDF = 'application/pdf';
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  let token = '';
  let expiresAt = 0;
  let sending = false;

  function message(text, kind = '') {
    status.textContent = text;
    status.dataset.kind = kind;
  }
  function chosenFile() {
    const f = fileInput.files && fileInput.files[0];
    return f || null;
  }
  function fileMime(f) {
    const lower = f.name.toLowerCase();
    return lower.endsWith('.pdf') ? PDF : lower.endsWith('.docx') ? DOCX : null;
  }
  function validFile(f) {
    return !!f && f.size >= 22 && f.size <= 1500000 && !!fileMime(f) &&
      (!f.type || f.type === 'application/octet-stream' || f.type === fileMime(f));
  }
  function authorized() {
    return token.length > 10 && Date.now() < expiresAt - 60000;
  }
  function refreshButtons() {
    upload.disabled = sending || !authorized() || !validFile(chosenFile());
    connect.disabled = sending;
    disconnect.hidden = !authorized();
  }
  function showFile() {
    const f = chosenFile();
    selected.textContent = f ? f.name + ' · ' + f.size.toLocaleString('vi-VN') + ' byte' : 'Chưa chọn tệp.';
    if (f && !validFile(f)) message('Chỉ chọn PDF/DOCX mẫu từ 22 byte đến 1,5 MB.', 'error');
    refreshButtons();
  }
  fileInput.addEventListener('change', showFile);

  connect.addEventListener('click', () => {
    if (!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(clientId || '')) {
      message('OAuth Client ID chưa hợp lệ.', 'error'); return;
    }
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      message('Thư viện đăng nhập Google chưa tải xong hoặc đang bị trình duyệt chặn. Hãy kiểm tra kết nối rồi thử lại.', 'error');
      return;
    }
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        include_granted_scopes: false,
        callback: response => {
          if (!response || response.error || !response.access_token) {
            message('Google chưa cấp quyền: ' + String(response && response.error || 'không xác định').slice(0,80), 'error');
            return;
          }
          token = response.access_token;
          expiresAt = Date.now() + Math.max(0, Number(response.expires_in || 0)) * 1000;
          message('Đã cấp quyền Google Drive trong trình duyệt. Chọn tệp mẫu để thử upload.', 'success');
          result.hidden = true;
          refreshButtons();
        },
        error_callback: e => {
          message('Không mở được Google: ' + String(e && e.type || 'popup bị chặn') + '. Nếu Google báo origin_mismatch, cần cập nhật JavaScript origin.', 'error');
        }
      });
      message('Đang mở màn hình cấp quyền Google…');
      client.requestAccessToken({prompt: 'consent'});
    } catch (e) {
      message('Không khởi tạo được Google OAuth trong trình duyệt.', 'error');
    }
  });

  disconnect.addEventListener('click', () => {
    // No server-side grant and no persistent browser storage to clear.
    token = '';
    expiresAt = 0;
    result.hidden = true;
    message('Đã xóa quyền tạm thời khỏi bộ nhớ trang. Quyền Google ngoài trang không bị thu hồi.');
    refreshButtons();
  });

  function safeId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(id);
  }
  async function googleFetch(url, options) {
    const response = await fetch(url, {
      ...options,
      headers: {...(options && options.headers || {}), Authorization: 'Bearer ' + token},
      credentials: 'omit',
      redirect: 'error',
      mode: 'cors',
      cache: 'no-store'
    });
    if (!response.ok) {
      let code = '';
      try {
        const data = await response.clone().json();
        code = String(data && data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason || '').slice(0,50);
      } catch { /* no provider body is displayed */ }
      throw new Error('Google Drive HTTP ' + response.status + (code ? ' · ' + code : ''));
    }
    return response;
  }
  async function uploadBlob(f) {
    // Google's documented multipart/related upload: one Blob, one POST.
    const mime = fileMime(f);
    const boundary = 'ai_law_blob_' + crypto.randomUUID().replaceAll('-', '');
    const metadata = JSON.stringify({name: f.name, mimeType: mime});
    const body = new Blob([
      '--' + boundary + '\r\n',
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      metadata,
      '\r\n--' + boundary + '\r\n',
      'Content-Type: ' + mime + '\r\n\r\n',
      f,
      '\r\n--' + boundary + '--'
    ], {type: 'multipart/related; boundary=' + boundary});
    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,trashed';
    const uploaded = await (await googleFetch(url, {
      method: 'POST', headers: {'Content-Type': 'multipart/related; boundary=' + boundary}, body
    })).json();
    if (!safeId(uploaded.id)) throw new Error('Google nhận upload nhưng chưa trả về ID hợp lệ. Kiểm tra Drive trước khi tải lại.');
    message('Google đã nhận Blob. Đang xác minh tệp trực tiếp với Google…');
    const checkUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(uploaded.id) +
      '?fields=id,name,mimeType,size,trashed,webViewLink';
    const verified = await (await googleFetch(checkUrl, {method:'GET'})).json();
    if (verified.id !== uploaded.id || verified.trashed === true ||
        verified.name !== f.name || verified.mimeType !== mime || Number(verified.size) !== f.size)
      throw new Error('Google đã trả ID nhưng metadata chưa khớp. Kiểm tra Drive trước khi tải lại.');
    return verified;
  }
  upload.addEventListener('click', async () => {
    const f = chosenFile();
    if (sending || !authorized()) {message('Hãy kết nối Google lại trước khi tải tệp.', 'error');return;}
    if (!validFile(f)) {message('Tệp PDF/DOCX không hợp lệ hoặc vượt quá 1,5 MB.', 'error');return;}
    sending = true;
    result.hidden = true;
    refreshButtons();
    message('Đang gửi Blob trực tiếp từ trình duyệt đến Google Drive…');
    try {
      const proof = await uploadBlob(f);
      resultInfo.textContent = proof.name + ' · ' + Number(proof.size).toLocaleString('vi-VN') + ' byte';
      resultLink.href = 'https://drive.google.com/file/d/' + encodeURIComponent(proof.id) + '/view';
      result.hidden = false;
      message('PASS: Google Drive đã lưu và xác minh tệp. Không đi qua Cloudflare Worker.', 'success');
    } catch (e) {
      const text = String(e && e.message || '');
      message('Upload chưa hoàn tất: ' + (text.startsWith('Google Drive HTTP') || text.startsWith('Google đã') ?
        text : 'Trình duyệt chưa gửi/đọc được phản hồi từ Google. Hãy kiểm tra quyền Google hoặc CORS; không thử lại ngay nếu tệp đã xuất hiện trên Drive.'), 'error');
    } finally {
      sending = false;
      refreshButtons();
    }
  });
  refreshButtons();
})();
