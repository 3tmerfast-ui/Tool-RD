# Kiến trúc hệ thống — TH version 1.0 Tool

Công cụ AI thiết kế/redesign sản phẩm (POD, T-shirt, Ornament/Suncatcher) cho boutique
phong cách Etsy. Frontend React + Vite gọi Google Gemini để làm sạch ảnh, phân tích và
sinh thiết kế; backend dùng Google Apps Script + Google Sheets/Drive để lưu user, lịch sử
thiết kế và ảnh.

## 1. Tổng quan công nghệ

| Lớp | Công nghệ |
|-----|-----------|
| UI | React 19, TypeScript, Vite 6 |
| Icon | lucide-react |
| AI | `@google/genai` (Gemini 2.5 Flash Image, Gemini 3 Flash Preview) |
| Backend | Google Apps Script (`doPost`) |
| Lưu trữ | Google Sheets (data) + Google Drive (ảnh) |
| Auth/State | localStorage (phiên đăng nhập, system key) |

## 2. Sơ đồ luồng

```
┌────────────────────┐      gọi @google/genai       ┌────────────────────┐
│  React Frontend    │ ───────────────────────────▶ │  Google Gemini API │
│  (Vite, App.tsx)   │   clean / analyze / generate  └────────────────────┘
│                    │
│  - LoginScreen     │      fetch POST (text/plain)  ┌────────────────────┐
│  - Header/Tabs     │ ───────────────────────────▶ │ Google Apps Script │
│  - FileUpload      │   action-based RPC            │   doPost(e)        │
│  - ResultsPanel    │ ◀─────────────────────────── │                    │
│  - History/Admin   │      JSON response            └─────────┬──────────┘
└────────────────────┘                                         │
                                                     ┌──────────┴──────────┐
                                                     │ Google Sheets:      │
                                                     │  Users / Designs /  │
                                                     │  Config / UserPrefs │
                                                     │ Google Drive:       │
                                                     │  ảnh sản phẩm/mockup │
                                                     └─────────────────────┘
```

## 3. Cấu trúc thư mục

```
.
├── index.html / index.tsx        # Điểm vào, mount React + ErrorBoundary
├── App.tsx                       # Component gốc: state, điều phối luồng, auth
├── types.ts                      # Kiểu dữ liệu, enum, hằng số (sản phẩm, màu, dây)
├── vite.config.ts                # Inject GEMINI_API_KEY vào process.env khi build
├── components/                   # Thành phần UI
│   ├── LoginScreen.tsx           # Đăng nhập / đăng ký
│   ├── Header.tsx                # Header + chuyển tab
│   ├── FileUpload.tsx            # Tải ảnh lên
│   ├── ResultsPanel.tsx          # Hiển thị kết quả redesign
│   ├── DesignAnalysisModal.tsx   # Modal phân tích thiết kế
│   ├── RedesignDetailModal.tsx   # Chi tiết / chỉnh sửa redesign (lớn nhất)
│   ├── TshirtPromptModal.tsx     # Prompt riêng cho luồng T-shirt
│   ├── HistorySidebar.tsx        # Lịch sử thiết kế (cloud)
│   ├── AdminDashboard.tsx        # Quản trị user, phân quyền, system key
│   ├── ApiKeyModal.tsx           # Nhập/lưu API key
│   └── ErrorBoundary.tsx         # Bắt lỗi React
├── services/                     # Tầng truy cập dịch vụ ngoài
│   ├── geminiService.ts          # Luồng AI cho T-shirt (clean/analyze/generate)
│   ├── geminiPodService.ts       # Luồng AI cho POD/Ornament + tách nhân vật
│   └── googleSheetService.ts     # RPC tới Apps Script (auth, lịch sử, ảnh)
└── *.txt                         # Mã backend Google Apps Script (xem mục 6)
```

## 4. Frontend

### App.tsx (điều phối trung tâm)
- Quản lý state: xác thực, quyền (`POD` / `TSHIRT` / `ADMIN`), tab đang chọn, ảnh gốc/đã
  xử lý, phân tích, redesign, `ProcessStage` (IDLE → UPLOADING → CLEANING → ANALYZING →
  REVIEW → GENERATING → COMPLETE).
- Khôi phục phiên từ `localStorage` (`app_username`, `app_permissions`).
- Tải lịch sử từ cloud (`getDesignsFromSheet`); admin xem được toàn bộ.
- Chọn service theo tab: `geminiService` (T-shirt) hoặc `geminiPodService` (POD).

### Service AI (`geminiService.ts`, `geminiPodService.ts`)
- `getAiClient()`: gộp key từ `localStorage('app_system_key')` và `process.env.API_KEY`,
  tách theo `,;\n`, **chọn ngẫu nhiên 1 key** để cân tải/né quota.
- `executeWithRetry()`: retry kèm exponential backoff + jitter khi gặp 429/quota.
- Hàm chính: `cleanupProductImage`, `analyzeProductDesign` (trả JSON theo schema),
  `generateProductRedesigns` (sinh 3 ảnh 1:1), `extractDesignElements`,
  `detectAndSplitCharacters` (POD), `validateToken`.
- Model: `gemini-2.5-flash-image` (ảnh), `gemini-3-flash-preview` (phân tích).

### Service backend (`googleSheetService.ts`)
- Gọi `GOOGLE_SCRIPT_URL` bằng `fetch` POST `text/plain` (né CORS preflight).
- Bao gồm: `sendDataToSheet`, `logoutUser`, `getDesignsFromSheet`, `updateDesignInSheet`,
  `deleteDesignFromSheet`, `getImageBase64` (proxy ảnh né CORS), `getPublicIP`.

## 5. Mô hình dữ liệu (types.ts)
- `ProductAnalysis`: description, designCritique, redesignPrompt, detectedComponents.
- Enum: `DesignMode` (NEW_CONCEPT / ENHANCE_EXISTING / CLEAN_ONLY), `AppTab`
  (POD / TSHIRT / TOOLS), `RopeType`, `ProcessStage`.
- Hằng số: `PRODUCT_TYPES`, `PRODUCT_MATERIALS`, `COLOR_OPTIONS`, `ROPE_OPTIONS`.
- `HistoryItem`: bản ghi một thiết kế (ảnh gốc/đã xử lý, redesign, metadata).

## 6. Backend (Google Apps Script)

Toàn bộ backend là các file `.txt` (paste vào Apps Script). `BeDS.txt` là chú thích chỉ
dẫn; logic được tách thành các file sau:

| File | Vai trò |
|------|---------|
| `main.txt` | `doPost(e)` — router theo `action`, `LockService` chống ghi đua |
| `auth.txt` | register / login / logout / heartbeat (sheet `Users`) |
| `users.txt` | lấy danh sách user, cập nhật phân quyền |
| `design.txt` | log/get/update/delete thiết kế (sheet `Designs` + Drive) |
| `config.txt` | lưu/đọc API key hệ thống (sheet `Config`) |
| `preferences.txt` | lưu/đọc tuỳ chọn người dùng (sheet `UserPrefs`) |
| `mockups.txt` | quản lý mockup template |
| `storage.txt` | proxy tải ảnh về base64 (DriveApp / UrlFetchApp) né CORS |

**Sheets sử dụng:** `Users`, `Designs`, `Config`, `UserPrefs` (+ mockups).
**Drive folder:** `ProductPerfect_Images`, `ProductPerfect_MockupTemplates`.
Ảnh sinh ra được lưu Drive, chia sẻ `ANYONE_WITH_LINK`, trả về link thumbnail `w2500`.

**Các action backend:** `register`, `login`, `logout`, `heartbeat`, `log_design`,
`update_design`, `save_config`, `get_config`, `get_users`, `update_permission`,
`save_mockup`, `get_mockups`, `log_final_mockup`, `get_image_base64`, `get_designs`,
`save_pref`, `get_pref`.

## 7. Biến môi trường & bảo mật

Khoá API **không** được hard-code trong mã. Tạo file `.env.local` (đã được `.gitignore`
bỏ qua) dựa trên `.env.example`:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

- `vite.config.ts` inject biến này vào `process.env.API_KEY` / `process.env.GEMINI_API_KEY`.
- Có thể nhập thêm key lúc chạy qua `ApiKeyModal` (lưu `localStorage('app_system_key')`).
- `GOOGLE_SCRIPT_URL` cấu hình trong `services/googleSheetService.ts`.
- Token GitHub / credential cá nhân **không** commit vào repo.

## 8. Chạy cục bộ

```bash
npm install
# tạo .env.local và điền GEMINI_API_KEY
npm run dev      # http://localhost:3000
npm run build    # build production
npm run preview  # xem thử bản build
```
