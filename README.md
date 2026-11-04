# AI MP3 Tag Editor

Ứng dụng Windows desktop hỗ trợ quản lý metadata và ảnh bìa cho file MP3 local, có tích hợp Google Gemini để đề xuất thông tin bài hát.

## Mục lục

- [Tính năng](#tính-năng)
- [Công nghệ](#công-nghệ)
- [Yêu cầu](#yêu-cầu)
- [Cài đặt và chạy development](#cài-đặt-và-chạy-development)
- [Đóng gói Windows](#đóng-gói-windows)
- [Cấu hình Gemini API Key](#cấu-hình-gemini-api-key)
- [Quy trình sử dụng](#quy-trình-sử-dụng)
- [Quyền riêng tư và dữ liệu](#quyền-riêng-tư-và-dữ-liệu)
- [Giới hạn hiện tại](#giới-hạn-hiện-tại)

## Tính năng

### Quản lý thư viện MP3

- Chọn một thư mục và quét MP3 trong toàn bộ thư mục con.
- Hoặc chọn nhiều file MP3 riêng lẻ từ máy tính.
- Đọc metadata ID3 hiện có: Title, Artist, Album, Album Artist, Genre, Year, Track, Composer và Comment.
- Tìm kiếm nhanh trong danh sách bài hát.

### AI metadata với Gemini

- Phân tích tên file và metadata hiện có.
- Có thể gửi audio MP3 lên Gemini để phân tích nội dung âm thanh.
- Đề xuất metadata; người dùng có thể chỉnh sửa trước khi ghi.
- Hỗ trợ xử lý tuần tự nhiều file để tránh tạo quá nhiều request đồng thời.

### Album artwork

- Tìm ảnh bìa theo Artist và Album thông qua Apple iTunes Search API.
- Hiển thị danh sách ảnh tìm được để người dùng chọn.
- Cho phép chọn ảnh JPEG hoặc PNG từ máy tính.
- Preview ảnh trước khi nhúng.
- Nhúng ảnh bìa vào ID3 APIC (front cover).
- Đọc và hiển thị ảnh bìa đã có trong MP3.

### An toàn dữ liệu

- Tạo bản backup byte-for-byte trước khi ghi metadata hoặc ảnh bìa.
- Hỗ trợ khôi phục file từ bản backup.
- Không tự động ghi thay đổi AI khi chưa được người dùng xác nhận.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Desktop runtime | Electron |
| UI | React + TypeScript |
| Build tool | electron-vite + Vite |
| MP3 metadata | music-metadata |
| ID3 writer | node-id3 |
| AI | Google Gemini Interactions API |
| Album artwork search | Apple iTunes Search API |

## Yêu cầu

- Windows 10/11 x64.
- Node.js 20 trở lên.
- npm.
- Gemini API Key lấy từ [Google AI Studio](https://aistudio.google.com/apikey).

## Cài đặt và chạy development

Clone repository:

```bash
git clone https://github.com/tchiphuong/ai-mp3-tag-editor.git
cd ai-mp3-tag-editor
```

Cài dependencies:

```bash
npm install
```

Chạy ứng dụng:

```bash
npm run dev
```

## Đóng gói Windows

Tạo bộ cài Windows x64:

```bash
npm run dist
```

File cài đặt được tạo trong thư mục:

```text
release/
```

## Cấu hình Gemini API Key

Không cần tạo file `.env` và không cần nhập API Key vào source code.

1. Mở ứng dụng Windows.
2. Chọn **Settings**.
3. Dán Gemini API Key vào ô **Google AI Studio API key**.
4. Chọn **Save API settings**.
5. API Key được mã hóa bằng Electron `safeStorage` và lưu trong thư mục dữ liệu ứng dụng của Windows user hiện tại.

Ứng dụng chỉ nhận trạng thái đã cấu hình từ renderer; giá trị API Key được giải mã trong Electron main process khi thực hiện request Gemini. API Key không được commit lên repository.

Lấy API Key tại [Google AI Studio](https://aistudio.google.com/apikey).

## Quy trình sử dụng

1. Mở ứng dụng và cấu hình Gemini API Key trong Settings.
2. Chọn **Choose folder** hoặc **Add MP3 files**.
3. Chọn bài hát trong danh sách.
4. Bật **Analyze audio** nếu muốn gửi nội dung âm thanh cho Gemini. Tắt tùy chọn này nếu chỉ muốn phân tích tên file và tag hiện có.
5. Chọn **AI suggest** hoặc **AI fill all**.
6. Kiểm tra và chỉnh sửa các trường metadata được đề xuất.
7. Chọn **Save tags** để ghi ID3 vào MP3.
8. Trong phần **Album artwork**, chọn **Find cover** để tìm ảnh từ iTunes hoặc **Choose image** để dùng ảnh local.
9. Chọn ảnh phù hợp, xem preview và nhấn **Embed cover**.
10. Dùng **Restore backup** nếu cần khôi phục file trước khi chỉnh sửa.

## Quyền riêng tư và dữ liệu

- MP3 được đọc và chỉnh sửa trực tiếp trên ổ đĩa local bằng Electron main process.
- Khi **Analyze audio** được bật, dữ liệu audio được gửi tới Google Gemini API. Không có backend trung gian do dự án vận hành.
- Khi **Analyze audio** tắt, ứng dụng chỉ gửi tên file và metadata hiện có để Gemini đề xuất thông tin.
- Tìm ảnh bìa sử dụng Apple iTunes Search API; request tìm kiếm chứa thông tin Artist/Album. Ảnh được tải về khi người dùng chọn nhúng.
- Gemini API Key được lưu mã hóa bằng Electron `safeStorage` trong dữ liệu ứng dụng Windows.
- Backup được lưu cạnh file MP3 trong thư mục ẩn `.mp3-tag-editor-backups`.

## Giới hạn hiện tại

- Phân tích audio inline hiện giới hạn file dưới 14 MB để chừa dung lượng cho phần prompt và payload request. Hỗ trợ Files API cho file lớn sẽ được bổ sung sau.
- Ảnh bìa tìm kiếm phụ thuộc kết quả Apple iTunes Store; một số album hoặc bản phát hành khu vực có thể không có kết quả.
- Gemini có thể đề xuất sai bài hát hoặc metadata. Luôn kiểm tra trước khi lưu.
- Ứng dụng hiện tập trung vào MP3 và ID3; chưa hỗ trợ ghi metadata cho FLAC, WAV hoặc M4A.

## Tài liệu tham khảo

- [Gemini API – Audio understanding](https://ai.google.dev/gemini-api/docs/audio)
- [Apple – iTunes Search API](https://performance-partners.apple.com/search-api)
- [Electron – safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
