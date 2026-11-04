# AI Law R41 — cài đặt QA độc lập, lưu tài khoản, truy cập qua SSH (NONPRODUCTION ONLY)

**Trạng thái:** Hướng dẫn vận hành và gói mã nguồn để cài đặt trên máy Docker được **Chủ dự án cho phép**. Việc PR/CI PASS **không chứng minh đã có một server staging thường trực**. Môi trường hiện tại không có quyền Cloudflare Containers, không có Cloudflare Tunnel và không có Docker host kết nối để thực hiện triển khai lâu dài.

**Ranh giới đã duyệt:** AI Law bản triển khai riêng trước. IAICT là một tổ chức khách hàng bình thường của một bản cài đặt riêng, **không phải SaaS operator**. Định hướng SaaS để sau. SRS v1.1.15 giữ nguyên. Không có production, không đưa hồ sơ pháp lý thật vào hệ thống R41.

## 1. Bộ QA và lưu bí mật

- **10 QA actor đã chốt ở R40** theo [R40 inventory](../../tests/acceptance/R40_STANDALONE_QA_INVENTORY.json): QA-01..QA-09 ở bản riêng PRIMARY (gồm IAICT, tổ chức thứ hai và cá nhân); QA-10 ở bản riêng SECONDARY. Không thêm role mới; chỉ dùng `lawyer` và `tenant_admin` đã có.
- Bộ mật khẩu/hash của 10 tài khoản được lưu trong thư mục riêng tư **AI Law R40 QA Credentials Private** trên Google Drive, và chủ dự án đã nhận tệp JSON riêng tư. **Không gửi qua email hoặc nhét vào GitHub**, không dùng mật khẩu mẫu.
- Tải/copy chính JSON gốc từ Drive hoặc tệp riêng tư đã bàn giao; *nội dung phải có schema_version=1 và 10 account*, không có dấu BEGIN/END bên trong tệp.
- Mọi mật khẩu trong JSON chỉ có hiệu lực sau khi **người quản trị cài đặt trên QA PostgreSQL**. Với QA-06/QA-07, kết quả từ chối quyền/đăng nhập là đúng test case.

## 2. Trên máy Linux Docker độc lập được phép dùng làm QA

Yêu cầu Python 3.12+, Docker Engine, Docker Compose v2; tiếp cận bằng SSH được cấp phép. Dùng một checkout sạch của repository này; không cần Cloudflare, không lệ thuộc SaaS hoặc tên miền của IAICT.

Tạo thư mục/tệp riêng ngoài Git, chỉ chủ sở hữu đọc:

```bash
umask 077
mkdir -p "$HOME/.ai-law-qa"
chmod 700 "$HOME/.ai-law-qa"
# Sao chép JSON gốc từ thư mục Drive riêng tư vào:
# $HOME/.ai-law-qa/qa-credentials.json
chmod 600 "$HOME/.ai-law-qa/qa-credentials.json"

python -m pip install -r requirements-r0-auth.txt "argon2-cffi==25.1.0"
export AI_LAW_NONPROD_QA=explicitly-approved-qa-only
export AI_LAW_QA_HOME="$HOME/.ai-law-qa"
export AI_LAW_QA_CREDENTIALS="$AI_LAW_QA_HOME/qa-credentials.json"

# Chỉ thực hiện INIT MỘT LẦN CHO MỖI BẢN; không chạy lại để đổi khóa!
bash deployment/standalone/qa_staging.sh init primary
bash deployment/standalone/qa_staging.sh init secondary

# Kiểm tra trước khi chạy, không tiết lộ mật khẩu:
bash deployment/standalone/qa_staging.sh preflight primary
bash deployment/standalone/qa_staging.sh preflight secondary

# Lên các container: API/auth/PostgreSQL không mở cổng ra host.
bash deployment/standalone/qa_staging.sh up primary
bash deployment/standalone/qa_staging.sh up secondary

# Áp dụng ĐÚNG bộ tài khoản R40 đã lưu lên PostgreSQL QA.
bash deployment/standalone/qa_staging.sh provision primary
bash deployment/standalone/qa_staging.sh provision secondary

# Đăng nhập thật từng QA account và kiểm tra RLS/MatterACL:
bash deployment/standalone/qa_staging.sh verify primary
bash deployment/standalone/qa_staging.sh verify secondary
```

**Giữ dữ liệu:** Không dùng `docker compose down -v` hoặc `docker volume prune`; đó là xóa database và làm mất tài khoản. Dùng `bash deployment/standalone/qa_staging.sh stop primary` rồi `up primary` để khởi động lại mà vẫn giữ PostgreSQL named volume và bộ secret ban đầu. Tệp `installation.env` chỉ tạo một lần, chmod0600; không tự tạo khóa RSA/DB mới khi restart. Việc `provision` chạy lại phải idempotent, và database sẽ chặn bundle khác để chống đổi mật khẩu ngầm.

**Hai bản cài đặt độc lập:** `ai_law_qa_primary` (browser port 18080) và `ai_law_qa_secondary` (browser port 18081), dùng hai network, hai volume, hai khóa ký RSA và cấu hình DB khác nhau. QA-10 chỉ vào bản thứ hai. Cổng gateway **chỉ** bind `127.0.0.1`; PostgreSQL, auth và API không công khai cổng host.

## 3. Chủ dự án đăng nhập từ máy của mình

**Cách an toàn đã hỗ trợ:** Dùng SSH tunneling từ máy có quyền vào host QA, không tự mở HTTP hoặc PostgreSQL ra Internet. Ví dụ trên máy có OpenSSH:

```bash
ssh -N -L 18080:127.0.0.1:18080 -L 18081:127.0.0.1:18081 <approved-qa-ssh-user>@<approved-qa-host>
```

Trong **trình duyệt trên chính máy đã tạo SSH tunnel**, mở `http://127.0.0.1:18080/` (primary) hoặc `http://127.0.0.1:18081/` (secondary). Đăng nhập bằng email/mật khẩu QA đã lưu ở Drive, chọn đúng không gian làm việc (người không là thành viên sẽ bị từ chối). Màn hình R39 hiển thị TaskRun `fixture-run` kỹ thuật; các thẻ AI pháp lý chưa được nối đều ghi **Chưa kết nối**.

SSH mã hóa lưu lượng đường truyền; cookie ở localhost là `HttpOnly`+`SameSite=Strict` nhưng **chưa có flag Secure vì local HTTP**. Không dùng cách này để mở public URL. Muốn QA trên điện thoại bên ngoài SSH tunnel phải thiết kế lớp truy cập an toàn (TLS/Access/VPN theo SRS và phê duyệt phù hợp) và kiểm thử lại; R41 **không** giả vờ hỗ trợ mobile public login.

## 4. Kiểm thử thực, kiểm thử lại, bằng chứng

`tests/browser/test_r41_staging_browser.py` dùng Chromium thật trên desktop1440/mobile390/320px với chính tệp QA mà người vận hành cung cấp. Test đăng nhập QA-02,03,04,08,10, kiểm tra QA-05 và QA-07 bị từ chối, cookie phiên, refresh, logout, CSRF và một GET run đã được cấp quyền.

Sau khi hai bản QA đang chạy, trên **host**:

```bash
python -m pip install "playwright==1.55.0"
python -m playwright install --with-deps chromium
python tests/browser/test_r41_staging_browser.py "$AI_LAW_QA_CREDENTIALS"
```

Trên GitHub Actions, job `standalone-staging-kit` thực hiện đủ init → up → provision → verify → browser → stop → up → verify → browser; dùng **bộ mật khẩu CI ngẫu nhiên**, không lấy tệp Owner trên Drive. Kết thúc job, nó **xóa** 2 volume CI và thông tin đăng nhập CI. Vì vậy, CI PASS xác minh **khả năng** dùng bộ cài đặt độc lập và giữ dữ liệu khi restart, **không** đồng nghĩa staging chủ dự án đã được kích hoạt.

## 5. An toàn và cổng nghiệm thu chưa hoàn thành

Bộ R41 vẫn sử dụng các dịch vụ `r0_core/standalone_password_auth.py` và `r0_core/standalone_browser_gateway.py` test-only với issuer `example.invalid`. Không dùng chúng làm IdP được chấp thuận cho production. Danh sách không gian làm việc hiển thị trên màn hình trước đăng nhập vẫn là danh sách **giả lập QA**; quyền truy cập thực được kiểm tra qua PostgreSQL membership/MatterACL, song việc liệt kê workspace theo danh tính đã xác thực cần hoàn thiện sau.

Chưa có ở R41: hệ thống staging thật có SSH/host đã kết nối vào phiên công cụ; IdP/MFA production-approved; backup/restore/rollback được nghiệm thu; upload hồ sơ, lưu trữ/tìm kiếm/tóm tắt/dịch/AI pháp lý chạy thực; toàn bộ test case TC12A/B; người dùng điện thoại vật lý và nghiệm thu cuối. Mọi đánh giá chức năng chỉ tính những phép thử đã thực thi. **Không triển khai production, không đưa dữ liệu khách hàng thật, không thay đổi SRS baseline và không mở rộng sang SaaS.**
