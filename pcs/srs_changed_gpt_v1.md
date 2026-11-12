# SRS change register — Mihy Law AI Agent (gpt v1)

**Ngày ghi nhận:** 13/11/2026 (Việt Nam)  
**Lệnh Chủ dự án:** “Làm đủ nhé, trừ ký số”.  
**Nguồn:** Tệp do Chủ dự án cung cấp `mihy_chucnang_gpt_v1.docx`, *Báo cáo danh mục chức năng AI cho luật sư cá nhân và văn phòng luật — Đề xuất v1.0, 11/11/2026*.  
**Phạm vi đích:** F01–F36 theo `pcs/mihy_scope_gpt_v1.json`; giữ nguyên phân nhóm A–G, mức P0/P1/P2 và khả năng theo mô hình cá nhân/văn phòng.

## Quyết định thay đổi phạm vi — đã có chỉ đạo của Chủ dự án

1. **Bao gồm 36 mã chức năng** F01–F36: 18 P0, 16 P1, 2 P2. Không coi 11 UC source-only hiện có tương đương hoàn tất 36 chức năng.
2. **Ngoại lệ duy nhất theo chỉ đạo:** loại **ký số/ký điện tử** và các màn hình, API, tích hợp chứng thư số, luồng ký liên quan. **Không bỏ toàn bộ F31**: email, lịch, Word, lưu trữ, API ngoài vẫn thuộc phạm vi.
3. **Hai chế độ:** luật sư cá nhân và văn phòng luật; riêng F23 là chức năng của văn phòng, F21/F26/F27/F32/F33/F36 ở cấp độ theo đúng bảng nguồn; không cố ép quy trình văn phòng đầy đủ lên cá nhân.
4. **Lưu trữ F35:** danh mục đích bao gồm Drive/OneDrive/NAS/VPS/cloud, bản lưu và khôi phục. Lệnh này cập nhật phạm vi **đích**, không làm mất trạng thái QA lỗi/đang tạm dừng của OAuth trước đó; cần xử lý lại khi có thiết kế/kiểm thử an toàn, không đẩy dữ liệu thật.
5. **Ràng buộc an toàn:** System Admin SaaS tuyệt đối không đọc/xem/sửa/xóa/tìm/xuất dữ liệu nghiệp vụ khách hàng; quyền hồ sơ/tệp/tác vụ theo Tenant; AI phải dẫn nguồn, hiệu lực và điều chưa chắc chắn; luật sư phê duyệt trước phát hành. Chủ dự án nghiệm thu cuối.

## Kiểm soát SRS và nghiệm thu

- **SRS v1.1.15 là baseline đã chốt, hiện chưa sửa hoặc tự nâng phiên bản.** Tệp F01–F36 được ghi rõ là *danh mục cấp cao, chưa phải SRS*; cần đối chiếu từng F với yêu cầu, luồng nghiệp vụ, màn hình, API, mô hình dữ liệu, test case và release gate của SRS. Các chỗ chưa có đặc tả **PENDING_DECOMPOSITION**, không tự suy diễn thành yêu cầu đã được nghiệm thu.
- Mỗi F là một mã đích **NOT_ASSESSED / NOT_RUN** tại thời điểm lập danh mục; bất kỳ mã nào chỉ có menu, mock, API text-only hoặc unit test đều chưa được đóng DONE.
- Tách công việc nhỏ theo P0 → P1 → P2 (được phép xử lý chéo phụ thuộc), viết test trước, chạy CI thực, sửa lỗi lặp; ghi PASS/FAIL/BLOCKED/NOT_RUN trung thực. Trước khi merge/promote cần kiểm thử dương/âm cho người dùng cá nhân, nhiều vai trò Tenant, MatterACL, tệp và đặc thù từng nghiệp vụ, trích nguồn và phê duyệt.
- **Không merge/deploy production** hay sử dụng dữ liệu khách hàng thật khi chưa đủ release gates và Chủ dự án nghiệm thu. Không xem việc hoàn tất CI mock là hoàn tất nghiệp vụ.
- Những SRS yêu cầu kỹ thuật bên ngoài bảng F01–F36 vẫn giữ nguyên trừ khi Chủ dự án thay đổi rõ ràng; tài liệu này chỉ đăng ký phạm vi mới và loại trừ ký.

## Đối chiếu sơ bộ các công việc đang có

- UC01–UC11: là **đường chức năng QA văn bản mẫu** trên một endpoint, chỉ là đầu vào để đối chiếu F01/F04/F07–F11/F13… khi đủ bằng chứng; không tự chốt mapping hay nghiệm thu.
- R138–R146: các draft PR UI/model/numeric/quote QA hiện có có giá trị kiểm thử nguồn mẫu, không chứng minh F07 OCR, F03 hiệu lực, F19 xung đột lợi ích, F20 liên kết Matter, F35 khôi phục hay F36 triển khai thật.
- R126 multi-account Cloudflare QA vẫn **BLOCKED/NOT_RUN**; tài liệu Word/PDF/OCR tích hợp, hệ thống nguồn luật chính thức, kiểm toán/backup/restore, phê duyệt luật sư/Owner đều cần QA thực tế.
- **Bước triển khai ưu tiên sau đăng ký:** đối chiếu từng F thuộc P0 với SRS và mã; mở task triển khai kiểm thử đầu–cuối nhỏ theo phụ thuộc; kiểm tra F07–F10, F18–F22, F32–F36 và trục quyền/nguồn trước khi gọi DONE. Không đưa ký số/ký điện tử vào backlog, màn hình hay endpoint.

**Tham chiếu:** `pcs/mihy_scope_gpt_v1.json`. Hồ sơ này là nhật ký thay đổi phạm vi, **không thay thế SRS đã chốt**.
