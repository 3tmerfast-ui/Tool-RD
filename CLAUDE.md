# CLAUDE.md — Tool-RD (TH version 1.0 / Team3T AI)

Tool nội bộ thiết kế / redesign sản phẩm POD phong cách Etsy (Ornament, Suncatcher,
Clipboard, Doormat…) và T-Shirt / Baseball Jersey. Frontend React + Vite, không có
backend riêng: tạo ảnh qua 3 engine chọn được (Flow extension / Mindesk / MuseAI on-prem),
phân tích ảnh qua OpenRouter, lưu trữ qua Google Apps Script + Sheets/Drive.

Chi tiết kiến trúc đầy đủ: `ARCHITECTURE.md`. File này là hướng dẫn làm việc nhanh.

## Lệnh

```bash
npm install
npm run dev        # http://localhost:3000 (host 0.0.0.0) — có proxy /muse cho MuseAI
npm run build      # build production ra dist/
npx tsc --noEmit   # type-check (không có test tự động)
```

Không có test suite / linter. Sau khi sửa: chạy `npx tsc --noEmit` + `npm run build`,
và nếu đụng tới luồng tạo ảnh thì test thật (xem mục MuseAI bên dưới).

## Cấu trúc

```
App.tsx                      # Component gốc: state, ProcessStage, auth, điều phối luồng
types.ts                     # Enum, kiểu, hằng số (PRODUCT_TYPES, PRODUCT_MATERIALS, TSHIRT_STYLES…)
components/
  Header.tsx                 # Header + dropdown chọn engine tạo ảnh/video
  RedesignDetailModal.tsx    # Chi tiết 1 mẫu: remix, mockup AI, video, tải file in, ghép mockup
  ResultsPanel.tsx, ThemeInputModal.tsx, TshirtPromptModal.tsx, TextLayerEditor.tsx, …
services/
  imageEngine.ts             # CHỌN ENGINE + generateImage / generateImages / generateVideo
  museService.ts             # Client MuseAI Bridge on-prem (batch song song, ảnh + video)
  flowExtensionService.ts    # Client Chrome extension điều khiển Google Labs Flow
  mindeskService.ts          # Client Book BE queue (app.3tify.com)
  geminiPodService.ts        # Luồng POD/Ornament (tên cũ, KHÔNG còn gọi Gemini)
  geminiService.ts           # Luồng T-Shirt / Jersey (tên cũ, KHÔNG còn gọi Gemini)
  openRouterService.ts       # Phân tích ảnh vision -> JSON (google/gemini-2.5-flash)
  productKnowledge.ts        # Guide thiết kế Etsy theo loại sản phẩm / kiểu áo
  imageUtils.ts              # Cắt nền thật (@imgly/background-removal), white->transparent
  googleSheetService.ts      # RPC tới Google Apps Script (auth, lịch sử, ảnh, mockup)
extension/                   # Chrome extension MV3 "Flow Image Bridge"
*.txt                        # Mã Google Apps Script backend (paste vào Apps Script)
docs/                        # PRODUCT_KNOWLEDGE_BASE.md, CHATGPT_ANALYZER_BOT.md
```

Lưu ý: `geminiService.ts` / `geminiPodService.ts` giữ tên + chữ ký hàm cũ để `App.tsx`
không phải sửa — mọi tạo ảnh bên trong phải đi qua `imageEngine.ts`, **không** gọi thẳng
`generateFlowImage` / `generateMindeskImage` / `generateMuseImages`.

## Luồng chính

1. Upload ảnh → `cleanupProductImage` = cắt nền thật trên ảnh gốc (không dùng AI sinh ảnh).
2. `analyzeProductDesign` → OpenRouter trả `ProductAnalysis` (description, critique,
   detectedComponents, redesignPrompt, detectedProductType).
3. Generate:
   - POD: `generateProductRedesigns` → 6 biến thể (`NUM_REDESIGNS`), reference image làm style anchor.
   - T-Shirt: 3 layout (A/B/C), KHÔNG truyền reference (tránh copy chữ/font).
     Baseball Jersey sinh 2 file in riêng: front + back (xếp `[f0,b0,f1,b1,…]`, `backs[i]` khớp `fronts[i]`, back lỗi = `""`).
4. Chi tiết mẫu (`RedesignDetailModal`): remix, mockup AI 6 bối cảnh (`generateProductMockups`,
   bối cảnh theo loại: apparel / desk / hanging), **Tạo Video** (chỉ MuseAI), tải file in.
5. Lưu lịch sử lên Sheets/Drive qua `googleSheetService`.

## Engine tạo ảnh / video (`services/imageEngine.ts`)

| Engine | Giá trị | Ảnh | Video | Song song | Yêu cầu |
|---|---|---|---|---|---|
| Flow extension | `flow` | ✅ | ❌ | ❌ tuần tự (nghỉ 1.5–2s) | Chrome + extension + đăng nhập labs.google |
| Mindesk (Book BE) | `mindesk` | ✅ | ❌ | ❌ tuần tự | `VITE_BOOK_BE_URL` + `VITE_BOOK_AUTH_TOKEN` |
| MuseAI on-prem | `muse` | ✅ | ✅ | ✅ batch | Dev: proxy `/muse` (Tailnet). Vercel: Tailscale Funnel `:8443` + API key |

Thứ tự chọn engine (`getImageProvider()`):
1. `localStorage('image_provider')` — dropdown trên Header, lưu theo từng máy/trình duyệt.
2. `VITE_IMAGE_PROVIDER` trong `.env.local` (`flow` | `mindesk` | `muse`).
3. Mindesk nếu đã cấu hình, ngược lại Flow (hành vi cũ).

API:
- `generateImage(req)` — 1 ảnh.
- `generateImages(reqs, onImage?, gapMs)` — nhiều ảnh. MuseAI: 1 batch song song;
  engine khác: tuần tự. `onImage(index, img)` gọi ngay khi từng ảnh xong (thứ tự hoàn thành,
  dùng để stream `onPartial`). Trả mảng theo thứ tự request (`null` = lỗi), ném lỗi nếu
  không ảnh nào thành công.
- `generateVideo(prompt, referenceImage?)` — chỉ MuseAI, trả blob URL MP4.

Khi thêm tính năng tạo nhiều ảnh mới: gom thành 1 lần `generateImages([...])`, đừng
viết vòng `for` gọi `generateImage` — nếu không sẽ mất tính năng song song của MuseAI.

## MuseAI on-prem (`services/museService.ts`)

- Server: MuseAI In-Browser Bridge (repo anh em `../MuseAI`, xem `../MuseAI/README.md`).
  Chạy 24/7 trên máy Windows 3090 `desktop-bpavqpt`, Tailscale `http://100.126.145.3:8770`,
  code `D:\MuseAI`, task `MuseAI_Bridge`, log `D:\MuseAI\logs\museai.log`.
  Hiện chạy `bridge/server.py` (1 account, tối đa 5 worker song song) — `bridge/pool.py`
  (multi-account) có cùng API nên client không cần sửa nếu chuyển.
- Kiểm tra nhanh: `curl http://100.126.145.3:8770/v1/status` → `"bridge_ready": true`.
- Luồng: `POST /v1/batch/async {items:[{prompt, files:[dataURL|http]}], concurrency, timeout_ms}`
  → poll `GET /v1/batch/status?id=…` mỗi 3s → mỗi result có `media: ["/media/xxx.webp|mp4"]`
  → tải về: ảnh → dataURL, video → blob URL.
- Song song: `concurrency = min(VITE_MUSE_CONCURRENCY (mặc định 3, 1–5), số item)`.
  Khuyến nghị 2–3 cho image-to-video nặng.
- Retry: item lỗi 503 / "busy" / "bận" (hoặc không có kết quả) → chờ 30s, gửi lại 1 lần.
- Timeout mỗi item: ảnh 180s, video 300s. Thực đo: 2 ảnh song song ~34s tổng
  (~29s/ảnh); video 5s image-to-video ~65s, 960x960.
- Muse là chat-based: prompt ảnh được bọc tiền tố "Tạo 1 ẢNH tĩnh (image, KHÔNG phải video),
  tỉ lệ khung hình X" — tỉ lệ khung chỉ là gợi ý trong prompt, không phải tham số cứng.
- Bridge trả `/media/*` với `application/octet-stream` → `fetchMedia` gắn lại MIME theo đuôi
  file (webp/png/jpg/mp4…). Đừng bỏ bước này, `<img>` với dataURL octet-stream sẽ lỗi.
- **Hai cách gọi bridge**:
  - **Dev** (`npm run dev`, máy trong Tailnet): `VITE_MUSE_BASE_URL` để trống → gọi `/muse/*`,
    Vite proxy chuyển tới `MUSE_API_URL` (xem `vite.config.ts`).
  - **Vercel** (`tool-rd.vercel.app`): bridge public qua **Tailscale Funnel** tại
    `https://desktop-bpavqpt.tail476398.ts.net:8443` (443 đã dùng cho Storyling). Env Production
    trên Vercel đã đặt `VITE_MUSE_BASE_URL` + `VITE_MUSE_API_KEY` (đổi env → phải redeploy).
- **Bảo vệ phía bridge** (`../MuseAI/bridge/server.py`, `security_middleware`) với request đi
  qua Funnel (header `Tailscale-Funnel-Request`):
  - Chỉ cho `GET /v1/status`, `POST /v1/batch/async`, `GET /v1/batch/status?id=`, `GET /media/<file>`;
    mọi endpoint khác (vd `/v1/eval`) → 403.
  - Bắt buộc `X-API-Key` = `MUSE_API_KEY` (trong `../MuseAI/.env`); bridge chưa có key → chặn hết.
  - `files` trong batch **chỉ nhận `data:` URL** (chặn đọc file local / SSRF) → `toDataUrl`
    trong `museService.ts` đổi ảnh http (link Drive) sang dataURL qua proxy Apps Script trước khi gửi.
  - CORS chỉ cho origin trong `MUSE_CORS_ORIGINS` (mặc định `https://tool-rd.vercel.app,http://localhost:3000`).
  - Truy cập trong Tailnet/local (`100.126.145.3:8770`) không bị ràng buộc gì.
  - `bridge/pool.py` (multi-account) **chưa** có middleware này — đừng Funnel nó.
- Bật Funnel trên máy Windows (Admin): `powershell -ExecutionPolicy Bypass -File deploy\windows\enable_funnel.ps1`
  trong `D:\MuseAI` — tạo key nếu thiếu, bật `tailscale funnel --bg --https=8443`, restart task
  `MuseAI_Bridge`. `run_daemon.ps1` nạp `.env` vào môi trường trước khi chạy bridge.
- API key nằm trong bundle frontend (giống OpenRouter key) — tool nội bộ; lộ key thì đổi trong
  `../MuseAI/.env` + Vercel env rồi redeploy.
- `MUSE_API_KEY` bật phía bridge → đặt `VITE_MUSE_API_KEY` (gửi header `X-API-Key`).

Test tay nhanh (không cần UI):
```bash
curl -s -X POST http://100.126.145.3:8770/v1/batch/async -H 'Content-Type: application/json' \
  -d '{"items":[{"prompt":"Tạo 1 ẢNH tĩnh, tỉ lệ 1:1. A watercolor sunflower suncatcher on pure white"}],"concurrency":1}'
curl -s "http://100.126.145.3:8770/v1/batch/status?id=<batch_id>"
```

## Biến môi trường (`.env.local`, không commit — xem `.env.example`)

| Biến | Dùng cho |
|---|---|
| `VITE_OPENROUTER_API_KEY` | Phân tích ảnh (lộ ra bundle frontend — tool nội bộ) |
| `VITE_FLOW_EXTENSION_ID` | (tuỳ chọn) ép extension ID nếu beacon không tự nhận |
| `VITE_BOOK_BE_URL`, `VITE_BOOK_AUTH_TOKEN` | Engine Mindesk |
| `VITE_IMAGE_PROVIDER` | Engine mặc định: `flow` / `mindesk` / `muse` |
| `MUSE_API_URL` | Target proxy `/muse` (mặc định `http://100.126.145.3:8770`) — không có `VITE_`, chỉ dev server đọc |
| `VITE_MUSE_BASE_URL` | Base URL frontend gọi MuseAI (mặc định `/muse`; Vercel: URL Funnel `:8443`) |
| `VITE_MUSE_API_KEY` | API key bridge (bắt buộc khi đi qua Funnel) |
| `VITE_MUSE_CONCURRENCY` | Số item song song trên bridge (1–5, mặc định 3) |

`GEMINI_API_KEY` không còn dùng. `GOOGLE_SCRIPT_URL` nằm cứng trong `services/googleSheetService.ts`.

## Quy ước

- UI text, comment, commit message: **tiếng Việt**. Commit dạng `feat: …` / `fix: …`.
- Comment giải thích *vì sao* (quyết định sản phẩm/in ấn), giống code hiện có.
- Prompt tạo ảnh viết tiếng Anh, có các khối `STYLE LOCK`, `ORIGINALITY`, `OUTPUT FORMAT` —
  giữ nguyên tinh thần: không copy chữ/font/bố cục đối thủ (tránh bị report Etsy), file in
  nền trắng phẳng, mockup giữ nguyên artwork.
- Lỗi tạo ảnh phải nổi lên UI (alert có thông báo thật), không nuốt lỗi im lặng.
- Không commit `.env.local`, token, cookie; `.vercel` đã ignore.
- Backend Apps Script (`*.txt`) sửa xong phải paste lại vào Apps Script và deploy thủ công.
