# AI Law — QA nghiệm thu tác vụ văn bản R109 (không gồm Drive/OneDrive)

**Môi trường duy nhất:** https://ai-law-web-qa.iaict-platform.workers.dev/app#assistant
**Hệ thống:** Chỉ dữ liệu GIẢ LẬP. Không nhập hợp đồng, hồ sơ vụ việc, thông tin khách hàng thật.
**Nghiệm thu cuối:** Chủ dự án; các chức năng pháp lý R0/R1 chưa trở thành production.

## Thao tác trên điện thoại

1. Mở link bằng Chrome, đăng nhập tài khoản AI Law QA hiện có.
2. Trong **Tài liệu**, tạo một hồ sơ thử nghiệm nếu chưa có; chọn **Trợ lý AI**.
3. Tại bảng **Thực hiện nghiệp vụ với AI**, chọn hồ sơ QA, chọn UC, dán đoạn mẫu dưới đây.
4. Tích xác nhận chỉ dùng dữ liệu giả lập, bấm **Tạo bản nháp QA**.
5. Chỉ xem kết quả trong trang. Hệ thống không lưu nội dung/prompt/kết quả vào D1, không tải file qua Drive.
6. Đối chiếu kết quả với nguồn mẫu, ghi PASS/FAIL kèm lỗi; kiểm tra sau đăng xuất không được truy cập API.

## Dữ liệu mẫu an toàn (không phải luật thật)

Nguồn A:
> Điều 1. Bên A bàn giao 10 bộ tài liệu vào ngày 15 tháng 9 năm 2026. Bên B thanh toán 2.000.000 đồng sau khi nghiệm thu đủ 10 bộ tài liệu.
> 
> Điều 2. Nếu giao thiếu tài liệu, hai bên lập biên bản ghi nhận số lượng đã giao và hẹn ngày hoàn tất.

Nguồn B cho UC06/UC08:
> Điều 1. Bên A bàn giao 12 bộ tài liệu vào ngày 30 tháng 9 năm 2026. Bên B thanh toán 3.000.000 đồng trong vòng 5 ngày sau nghiệm thu.

## Danh mục kiểm thử đủ 11 UC

| UC | Kiểm tra QA trên văn bản mẫu | Trạng thái thực tế |
|---|---|---|
| UC01 | Sinh bản nháp theo sự kiện A, đánh dấu thông tin còn thiếu | Model draft tích hợp, cần Owner E2E |
| UC02 | Rà soát quyền/nghĩa vụ từ A, không tự tạo luật | Model draft tích hợp, cần Owner E2E |
| UC03 | Chọn Tiếng Anh, dịch A và đối chiếu số liệu | Model draft, chưa bảo đảm bố cục DOCX |
| UC04 | Tóm tắt A, so đúng ngày/số lượng/số tiền | Model draft, cần Owner E2E |
| UC05 | Phân tích nội dung A, cảnh báo điểm mơ hồ | Model draft, cần Owner E2E |
| UC06 | So sánh A/B, nêu khác biệt 10/12, 15/30, 2/3 triệu | Model draft, không xác minh hiệu lực pháp luật |
| UC07 | Dán nguồn có lỗi chính tả; kiểm tra không đổi quyền/nghĩa vụ | Model draft; Word Track Changes E2E vẫn NOT_RUN |
| UC08 | Phân tích A/B là hai hồ sơ mẫu và chỉ ra mâu thuẫn | Model draft, chưa xử lý file/hồ sơ thật |
| UC09 | Nhập câu hỏi “Bên B thanh toán khi nào?” và nguồn A | Trả lời theo nguồn mẫu, không tra cứu luật quốc gia |
| UC10 | Tìm “bàn giao tháng 9” trong A | Local search trên nguồn mẫu; CHƯA kết nối kho bản án |
| UC11 | Tìm “thanh toán” trong A | Local search trên nguồn mẫu; CHƯA kết nối cơ sở dữ liệu pháp luật |

## Bằng chứng kỹ thuật

- CI [R109 Actions #42397098574](https://github.com/ntdung-tds/Mihy-Law-Agent/actions/runs/42397098574): PASS 9/9 của mã R109, gồm Node, SQLite, API, PG RLS và Chromium synthetic.
- QA D1: đã tạo bảng `qa_legal_ai_quota` năm cột, không chứa nguồn/đầu ra AI; tài khoản 12 lượt/ngày; 1 hồ sơ QA cũ được bảo toàn.
- Backend `ai-law-standalone-cf-qa`: Worker AI binding hoạt động; model `@cf/meta/llama-3.1-8b-instruct` có phản hồi tiếng Việt với dữ liệu giả lập. QA source deploy `8cee0745-05a1-45a1-bf36-1bdd934bc223`, 10 module, readback PASS.
- Website `ai-law-web-qa`: deploy `66d6e4ff-0c81-40ab-8636-2416825f2bc1`, 27 module, readback PASS. Legacy Drive/OAuth và QA_AUTH được giữ nguyên.
- Cloudflare Browser Rendering `/health` PASS; /login và /app probe tiếp theo BLOCKED HTTP 429 bởi dịch vụ Browser Rendering. **Không được gọi đó là E2E đăng nhập thành công.**
- Real Owner signed-in Android/desktop AI task QA: **NOT_RUN** tại thời điểm ghi. Chủ dự án nghiệm thu cuối.

## Chặn nghiệm thu bản hoàn chỉnh

- Không có kho văn bản pháp luật/bản án có kiểm chứng, hiệu lực thời gian, nguồn công khai và quy trình cập nhật; UC10/11 mới tìm trong văn bản dán.
- Không tích hợp DOCX/PDF thật vào UI vì Owner đang tạm dừng Drive/OneDrive; POC DOCX Track Changes vẫn ON_HOLD, Word Desktop chấp nhận/từ chối thay đổi NOT_RUN.
- Bản nháp AI chưa có đánh giá chất lượng pháp lý độc lập, kiểm chứng dẫn chiếu hoặc phê duyệt luật sư; không dùng dữ liệu thật.
- Bộ SRS v1.1.15 là baseline riêng tư, chưa được mở trong lần này để ánh xạ từng clause/test; không tự khẳng định đủ toàn bộ yêu cầu.

**Release gate:** Production BLOCKED. Mọi thay đổi ngoài phạm vi lưu trữ; không merge PR R103/R104 (Drive) và không sửa Google OAuth trong R109.
