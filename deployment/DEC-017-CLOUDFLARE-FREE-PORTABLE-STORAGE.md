# DEC-017 — Lưu mốc R41; Cloudflare Free + Google Drive trước, triển khai/lưu trữ đa nhà cung cấp sau

**Owner direction, 2026-11-04 — APPROVED AS DELIVERY DIRECTION; NOT IMPLEMENTED.**

**Không sửa baseline SRS v1.1.15.** Ghi các khác biệt cần đối chiếu vào `srs_changed.md`; chủ dự án nghiệm thu cuối. Không tự triển khai production, không dùng dữ liệu pháp lý thật chưa được phép, không mở rộng sang IAICT SaaS.

## 1. Đóng băng mốc R41 để khi có máy chủ tiếp tục

- **R41 đã được merge trên `main`**, PR #57, commit `f61e8540cca8947559f03a52eaefa0ffa04f179e`; [GitHub Actions 41794614580](https://github.com/ntdung-tds/Mihy-Law-Agent/actions/runs/41794614580) PASS cả 8/8 jobs (Chromium desktop/mobile viewport + hai Docker/PG16, các tài khoản QA kiểm thử). Đây là **bộ cài đặt/test riêng**, chưa phải staging lâu dài.
- **R40**: Bộ 10 tài khoản QA-01..QA-10 và mật khẩu/hash do chủ sở hữu lưu trong thư mục **Drive riêng tư**; **KHÔNG đưa URL mật khẩu, password, hash, JWT, private key lên GitHub**. Bộ mật khẩu thật do chủ dự án lưu **chưa được áp dụng** vào staging cố định.
- **BLOCKED**: Không có Docker/VPS host riêng được kết nối; Cloudflare Containers từng trả HTTP 401, không có Tunnel. Sau này khi chủ dự án cung cấp server, tiếp tục `deployment/standalone/QA_R41_OPERATIONS.md` và **dùng lại chính bộ QA đã lưu**, không tạo lại hoặc đổi key.
- Không xóa, ghi đè hay thay đổi đường triển khai riêng R41. **Đây là phương án song hành**, không bị Cloudflare Free thay thế.

## 2. Thứ tự triển khai mới

1. **Hiện tại:** một bản AI Law **độc lập**, chạy giao diện/API phù hợp giới hạn trên **Cloudflare Workers Free**; **Google Drive do đơn vị cấu hình** là nơi lưu tệp hồ sơ. IAICT ở bản này chỉ là **một đơn vị khách hàng thông thường**, không phải SaaS operator.
2. Metadata có cấu trúc (identity/tenant/membership, MatterACL, hồ sơ, id tệp, tác vụ, audit) phải nằm trong **database**, không sử dụng Google Drive như database quan hệ. **Cloudflare D1 có thể được đánh giá cho nonproduction**; PostgreSQL16 hiện tại vẫn là triển khai độc lập R41. Chuyển từ PG16/RLS sang D1/SQLite không mặc nhiên tương đương: bắt buộc kiểm tra bảo mật quyền truy cập, ACID, migration, audit, dữ liệu tổ chức, query/transaction và test phủ nhận quyền; phải được chốt nếu lệch SRS. Không tự coi việc chuyển DB là đã chấp thuận.
3. Trợ lý AI dùng nhà cung cấp/model được cấu hình; Worker Free chỉ điều phối request vừa giới hạn, **không chạy inference nặng, chuyển đổi tài liệu lớn hoặc job CPU kéo dài ngay trong Worker**. Chi phí API AI, dung lượng Drive, dung lượng cloud bên ngoài không thuộc Free của Cloudflare.
4. Sau này **từng đơn vị có thể chọn hạ tầng**: Cloudflare; VPS/Docker; máy chủ riêng; private cloud; AWS; Azure; Google Cloud, hoặc hạ tầng phù hợp khác, theo quyền và cấu hình của chính đơn vị. **SaaS tập trung IAICT vẫn DEFERRED** cho đến khi chủ dự án chuyển ưu tiên.

## 3. Storage Adapter — một giao diện nghiệp vụ, nhiều nơi lưu

Hệ thống xử lý tệp qua **một hợp đồng trừu tượng**, không gọi API Google Drive trực tiếp trong từng màn hình hoặc workflow AI:

`put(file, tenant, matter, policy)`, `get(file_id, authorized_context)`, `delete(file_id, authorized_context)`, `metadata(file_id)`, `health()` và `list_if_authorized()` theo yêu cầu SRS.

- **Làm trước:** `google_drive`, dùng OAuth 2.0/grant thực sự của **đơn vị** và scope hẹp nhất khả dụng (ưu tiên `drive.file` khi phù hợp). Không dùng Google Drive connector của ChatGPT như một token cho Worker, không hardcode refresh token.
- **Mở rộng khi cần, không đánh dấu đã triển khai:** `microsoft_onedrive` (Microsoft Graph, phân quyền tổ chức), `nas` (kết nối HTTPS/gateway/VPN có chứng thực, không giả định Worker có quyền truy cập mạng LAN), `s3_compatible` (S3, MinIO/VPS), `azure_blob`, `google_cloud_storage`, hoặc driver phù hợp được duyệt.
- Mỗi **đơn vị / bản cài đặt** tự cấu hình provider, folder/bucket/drive ID, chính sách khóa, credential và bảo mật; không dùng chung dữ liệu/tokens giữa đơn vị. File ID mang theo `provider`, `installation_id`, `tenant_id`, `matter_id`, `external_object_id` và metadata cần thiết — **không lưu URL share công khai như quyền truy cập**.
- Kiểm tra MatterACL/tenant **trước** đọc/ghi/tải xuống/chia sẻ; phân quyền/nhật ký/thu hồi quyền/retention/backup và xử lý mất kết nối phải theo đúng SRS. Không để tenant admin hoặc IAICT đọc hồ sơ không được cấp quyền. Mã hóa, chia sẻ, xóa, đối chiếu đồng bộ và khả năng xuất dữ liệu cần kiểm thử thực tế trước nghiệm thu.
- Google Drive API có chính sách OAuth và hạn mức; cần rà soát **điều khoản dùng Drive API**, đặc biệt cấm một số cách dùng backup nội dung ứng dụng hoặc CDN khi không có văn bản đồng ý. Không hứa Google Drive phù hợp cho mọi mô hình pháp lý trước khi đối chiếu quyền và pháp lý.

## 4. Giới hạn Cloudflare Free và các quyết định kỹ thuật còn mở

Tại lần kiểm tra 04/11/2026:
- Workers Free: **100.000 requests/ngày; 10 ms CPU/request; 128 MB memory** (theo Cloudflare, không phải cam kết vô hạn). [Giới hạn chính thức](https://developers.cloudflare.com/workers/platform/limits/).
- D1 Free: **5 GB tổng dung lượng, 5 triệu dòng đọc/ngày, 100.000 dòng ghi/ngày**. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
- **Workers không thể chạy nguyên Docker Compose + PostgreSQL16 của R41**. Để có thể triển khai Workers Free cần một adapter runtime/API/storage/database thật, và kiểm chứng lại SRS, bảo mật, giới hạn. Đừng clone thành hai sản phẩm nghiệp vụ; giữ core về quy tắc phân quyền, workflow, hợp đồng và bộ test; các lớp tích hợp phải phù hợp từng môi trường. Có thể cần cấu trúc shared contract thay vì trực tiếp chạy cùng binary.
- Google Drive bản riêng sử dụng quyền do đơn vị quản lý; cần OAuth 2.0, đồng ý scope và tuân thủ [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) / [Drive API terms](https://developers.google.com/workspace/drive/api/terms). **Kết nối ChatGPT tới Drive không có nghĩa Worker đã được cấp quyền**.
- Cloudflare D1/Workers/Google Drive có thể thử ở mức nonproduction theo phạm vi được chốt; **chưa có Worker AI Law mới, D1 AI Law, luồng upload/download OAuth hay tài khoản QA đăng nhập Cloudflare thực** sau quyết định DEC-017. Không thay thế demo R31 để báo đã xong.

## 5. Bước tiếp theo — task có kiểm thử, không tự nới SRS

- R42-A: inventory Worker/D1 hiện có của Cloudflare, đánh giá các yêu cầu SRS về IAM/RLS/AI/file và phác adapter (không động vào Worker IAICT Portal hoặc các demo cũ). Đảm bảo định danh per-install/per-tenant.
- R42-B: một **POC Cloudflare Free nonproduction** nhỏ để gọi API + database metadata nếu phù hợp, và thử Google Drive thật bằng **tài khoản/thư mục được cấp quyền kiểm thử**, không sử dụng hồ sơ khách hàng hay QA credentials qua client-side JavaScript.
- R42-C: thử put/get/list/delete, revoked access, cross-tenant denial, file size, quota, token expiry, retry, audit và export; kết quả có bằng chứng PASS/FAIL/BLOCKED/NOT_RUN, vòng sửa-test lại.
- R42-D: báo cáo Owner; các khác biệt thực sự với SRS v1.1.15 chỉ đề xuất trong `srs_changed.md`, baseline giữ nguyên cho đến khi Owner quyết định. Không tự triển khai production.

**Mức cam kết đã lưu:** Khả thi về mặt thiết kế; **không xác nhận tất cả nhà cung cấp đã tích hợp hoặc bản Cloudflare đã vận hành**.
