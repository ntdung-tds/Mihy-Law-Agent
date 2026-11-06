# R67 — Tài khoản của tôi (Account Center, QA-only)

**Yêu cầu Owner:** xây dựng trang riêng, đẹp và dễ dùng trên mobile/desktop để xem và quản lý thông tin cá nhân, avatar, mật khẩu, gói Demo/Pro và quyền truy cập. Đây là yêu cầu bổ sung được Owner chủ động đưa ra; baseline SRS v1.1.15 không tự sửa.

## Nguyên tắc thiết kế và an toàn

- Trang riêng `/account` chỉ hoạt động khi có cookie QA hợp lệ; tài nguyên `/account.css`, `/account.js` cũng được bảo vệ như `/app`.
- Desktop truy cập qua thanh bên và avatar trên đầu trang; mobile qua `Chức năng → Tài khoản của tôi`. Thanh 5 mục đã duyệt không thay đổi.
- Bốn phần có nhãn rõ ràng: **Thông tin cá nhân**, **Gói & quyền**, **Bảo mật**, **Không gian làm việc**; dễ đọc trên 320/390/1440, nút chạm tối thiểu 44px trong các tác vụ chính, thông báo và phản hồi aria-live.
- Trường được phép tự cập nhật: họ tên hiển thị, số điện thoại, chức danh, giới thiệu ngắn và avatar. Email đăng nhập **chỉ đọc**; đổi email cần luồng xác minh riêng chưa nằm trong R67.
- Avatar: tệp JPG/PNG/WebP không quá 5MB được cắt vuông bằng canvas trong trình duyệt, chuẩn hóa JPEG nhỏ (<= 32KB, 256px), bỏ EXIF từ ảnh gốc. Backend chỉ chấp nhận data:image/jpeg;base64 được kiểm tra magic bytes/SOF/dimensions và giới hạn kích thước. Lưu dưới tài khoản QA trên D1, không đặt tệp công khai hoặc sao chép ảnh khách hàng.
- Mật khẩu: tái sử dụng API R66 yêu cầu mật khẩu hiện tại, xác thực lại, thu hồi toàn bộ phiên; **không** tạo cơ chế tự khôi phục bằng email hay thay thế luật xác thực.
- **Gói dịch vụ** `demo` và `pro` là nhãn metadata do vận hành cấp, người dùng không thể tự thay đổi. Không mở thanh toán/nâng cấp/billing/SaaS hoặc khẳng định Pro đang vận hành. Gói thử nghiệm mặc định `demo` với nhãn QA. **Vai trò phân quyền** `lawyer` / `tenant_admin` được đọc trực tiếp từ membership đang active, không sửa qua API tài khoản. Đổi gói không thay quyền tài liệu, và ngược lại.
- `qa_account_profiles(installation_id,user_id)` độc lập với tenant, tham chiếu FK principal; không nhân bản danh tính theo workspace. Tất cả GET/POST suy ra user_id từ phiên hợp lệ, không chấp nhận email, user_id, tenant_id, role hoặc plan tự chọn từ request.
- D1 migration `deployment/cloudflare/migrations/r67_qa_account_profiles.sql` **chỉ QA**; chạy sau khi CI PASS và kiểm tra schema trước khi deploy. Không cập nhật production; không ghi mật khẩu, JWT hoặc dữ liệu pháp lý vào repo.

## Tiêu chí nghiệm thu và cổng triển khai

1. **PASS CI:** API từ chối truy cập ẩn danh, CSRF, input thừa thay quyền/gói/tenant, ảnh SVG/PNG giả mạo và quá lớn; danh sách workspace không lộ tenant khác; schema kiểm tra FK, CHECK & bảo toàn `plan_code`; đồng thời kiểm tra hồi quy R66/GUI.
2. **PASS Chromium synthetic:** 320/390/1440, không tràn ngang, đủ 4 phần, form sửa hồ sơ cập nhật, ảnh upload/remove, phân biệt Demo/Pro, thay mật khẩu và redirect, không lộ mật khẩu trong URL. Đây là **test UI có API mô phỏng**, không phải test tài khoản thật.
3. **PASS QA deploy:** migrate D1, upload backend/site mới, kiểm tra exact source readback, binding D1/QA_AUTH/secret, bảo toàn R63 bottom nav và URL QA.
4. **Owner acceptance:** truy cập thực tế trên mobile bằng tài khoản được cấp, lưu tên/ảnh QA, kiểm tra quyền của chính tài khoản và đổi mật khẩu thực tế. Không coi việc dựng giao diện là nghiệm thu dữ liệu hoặc bảo mật production.

**Tham khảo:** OWASP Authentication/Session Management/File Upload cheat sheets; WCAG 2.2 AA. Những quy tắc này định hướng kiểm soát chứ không thay đổi SRS đã duyệt.
