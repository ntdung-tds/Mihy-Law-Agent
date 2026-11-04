/* R44 QA mobile-first page, no external assets, and no stored credentials. */
export const qaHtml = `<!doctype html><html lang="vi"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0d2444"><meta name="robots" content="noindex,nofollow">
<title>AI Law — Không gian pháp lý QA</title><link rel="stylesheet" href="/assets/theme.css">
<script defer src="/assets/app.js"></script></head><body>
<header><div class="brand"><span class="brand-icon">AL</span><span>AI Law</span></div><span class="env-label">KIỂM THỬ QA</span></header>
<main>
<p id="loading" class="loading" role="status">Đang kiểm tra phiên đăng nhập…</p>
<section id="login" class="login-wrap" hidden>
<p class="eyebrow">KHÔNG GIAN LÀM VIỆC</p><h1>Chào mừng<br>trở lại.</h1>
<p class="intro">Đăng nhập để truy cập không gian pháp lý được cấp cho bạn.</p>
<div class="panel"><h2>Đăng nhập AI Law</h2>
<p class="hint">Đăng nhập bảo mật bằng email đã được cấp quyền.</p>
<a class="access-button" id="access-login" href="/v1/auth/access-login">Đăng nhập bằng email Cloudflare</a>
<p class="divider-text">Hoặc dùng tài khoản QA đã kích hoạt</p>
<form id="login-form">
<label for="login-email">Địa chỉ email</label>
<input id="login-email" type="email" autocomplete="username" placeholder="email@example.com" required maxlength="254">
<label for="login-password">Mật khẩu</label>
<div class="password-row"><input id="login-password" type="password" autocomplete="current-password" required maxlength="128">
<button type="button" id="toggle-password" class="secondary-button" aria-label="Hiện mật khẩu">Hiện</button></div>
<p id="login-error" class="error" role="alert" hidden></p>
<button type="submit" id="login-submit" class="primary-button">Đăng nhập</button>
</form>
<div class="notice">ⓘ Đây là môi trường QA. Không dùng hồ sơ khách hàng thật hoặc tài khoản production.</div>
</div><p class="foot">AI Law · Bản triển khai độc lập · Cloudflare</p></section>
<section id="dashboard" class="dashboard" hidden>
<div class="dash-heading"><div><p class="eyebrow">TỔNG QUAN</p><h1>Không gian pháp lý</h1><p id="user-email" class="muted"></p></div>
<button id="logout" class="secondary-button" type="button">Đăng xuất</button></div>
<div class="workspace-panel"><div><p class="muted">ĐƠN VỊ ĐANG LÀM VIỆC</p>
<p id="current-workspace" class="workspace-name"></p><span id="current-role" class="role"></span></div>
<div id="switch-wrap" hidden><label for="workspace">Chuyển không gian</label>
<select id="workspace"></select><button type="button" id="switch" class="primary-button">Chuyển</button></div></div>
<div id="signed-in-status" class="success" role="status">✓ Đăng nhập thành công. Phiên QA đã được xác thực trên Cloudflare.</div>
<h2 class="section-heading">Các chức năng AI Law</h2>
<div class="features">
<article><span class="feature-icon">▤</span><h3>Hồ sơ và tài liệu</h3><p>Chưa kết nối lưu trữ</p></article>
<article><span class="feature-icon">✎</span><h3>Hợp đồng, văn bản</h3><p>Chưa kết nối AI</p></article>
<article><span class="feature-icon">⊞</span><h3>Phân tích tài liệu</h3><p>Chưa kết nối AI</p></article>
<article><span class="feature-icon">⌕</span><h3>Tra cứu pháp lý</h3><p>Chưa kết nối AI</p></article></div>
<p class="foot">Môi trường kiểm thử đăng nhập, phiên và phân quyền không gian làm việc.</p>
</section></main></body></html>`;
export function renderLayout(){
 return new Response(qaHtml,{status:200,headers:{
  "Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store",
  "X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
  "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
 }});
}
