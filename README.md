# Auto CS Backend (MVP)

Backend service for the "Auto CS Manager" Chrome extension.  
Provides a single endpoint `/api/generate` that:
- Applies free/pro (license) policy
- Calls an OpenAI LLM (Responses API) to generate concise Korean CS replies
- Returns structured JSON that the extension expects

Note: The frontend extension is already implemented and expects this backend at:
`POST https://auto-cs.example.com/api/generate` (you can use your local server URL for testing)

## 0) Environment Choice (Node 18+ & Express)

We chose a single Node.js (>=18) + Express server because:
- Very simple to install and run locally
- Easy to test with curl or Postman
- Straightforward CORS control for Chrome extension requests
- Fits initial low-traffic needs and can be deployed cheaply on free tiers (Render, Railway, etc.)

Storage for daily usage is kept in an in-memory `Map` for the MVP.  
It resets on server restarts (acceptable for now). In the future, we can migrate to Cloudflare Workers KV or Vercel KV.

## 1) Folder Structure

```
auto-cs-backend/
  ├─ package.json
  ├─ .env.example
  ├─ README.md
  └─ src/
     ├─ index.js            # Entry point (Express app, CORS, routes)
     └─ api/
        └─ generate.js      # POST /api/generate route implementation
```

## 2) Entry Point and Route

- Entry: `src/index.js`
- Route: `POST /api/generate` handled by `src/api/generate.js`

CORS policy (MVP):
- Access-Control-Allow-Origin: `*`
- Access-Control-Allow-Methods: `POST, OPTIONS`
- Access-Control-Allow-Headers: `Content-Type`
- `OPTIONS` preflight returns `204`

In production, consider restricting origins to your extension/app domain(s).

## 3) Storage (Daily Usage Counter)

- In-memory `Map` keyed by: `usage:${clientId}:${YYYY-MM-DD}` → `count`
- Daily limit for free users: `5`
- Pro users (license `GOOD_SELLER_2025`) have no daily limit (`todayLimit = 999`)
- In this MVP, the store resets on server restart. Future options: Cloudflare Workers KV, Vercel KV, Redis.

## 4) Environment Variables

- `OPENAI_API_KEY` – Your OpenAI API key (DO NOT hardcode in code)
- `PORT` (optional) – Server port, defaults to `3000`

Copy `.env.example` to `.env` and fill in your values.

## 5) Local Development

Requirements:
- Node.js v18 or later

Install dependencies:
```
npm install
```

Run in development:
```
npm run dev
```

The server will start at `http://localhost:3000`.

## 6) API Spec

Endpoint:
```
POST /api/generate
Content-Type: application/json
```

Request JSON:
```json
{
  "licenseKey": "프로 라이선스 키 또는 빈 문자열",
  "tone": "friendly|business|principle",
  "clipboardText": "클립보드에서 읽은 고객 문의 내용",
  "clientId": "cs_xxx 형태의 고유 사용자 ID"
}
```

Response JSON (success):
```json
{
  "ok": true,
  "reply": "생성된 답변 텍스트",
  "todayUsage": 3,
  "todayLimit": 5,
  "isPro": false,
  "message": "복사 완료! 붙여넣기(Ctrl+V) 하세요"
}
```

Response JSON (free limit exceeded):
```json
{
  "ok": false,
  "reply": "",
  "todayUsage": 5,
  "todayLimit": 5,
  "isPro": false,
  "message": "무료 사용량이 끝났습니다. 프로 버전을 구매하세요."
}
```

Response JSON (server/LLM error):
```json
{
  "ok": false,
  "reply": "",
  "todayUsage": 0,
  "todayLimit": 5,
  "isPro": false,
  "message": "오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
}
```

## 7) LLM Model & Prompt

- Model: `gpt-4.1-mini` (OpenAI Responses API) – chosen for cost and stability
- Prompting:
  - System: 10-year seller, always Korean, polite/clear, within 200 chars
  - User: includes `tone` and the `clipboardText`
  - Sensitive topics (refund/returns/delays): start with empathy/apology, then propose steps/solution
- Tone handling:
  - `friendly`: softer and warm expressions
  - `business`: polite, restrained tone
  - `principle`: clear policies without being rude

## 8) Test with curl

Free user example:
```
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "",
    "tone": "friendly",
    "clipboardText": "상품이 파손되어 도착했는데 어떻게 해야 하나요?",
    "clientId": "cs_test_123"
  }'
```

Pro user example:
```
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "GOOD_SELLER_2025",
    "tone": "business",
    "clipboardText": "반품 접수 방법을 알고 싶어요.",
    "clientId": "cs_test_123"
  }'
```

Expected behavior:
- Free user: first 1–5 calls return `ok:true` with a Korean, polite reply; `todayUsage` increments. From the 6th call on, returns `ok:false` with the upgrade message.
- Pro user: unlimited `ok:true` responses.

## 9) Deployment Options (Summary)

- **Render**: Create a Web Service; set `OPENAI_API_KEY`, `PORT`; deploy from repo. Free tier available.
- **Railway**: Similar to Render; one-click deploys, free tier credits.
- **Vercel**: Supports Node server; alternatively, port this logic into an Edge Function/Serverless Function at `/api/generate`.

CORS:
- MVP allows `*`. After deploying to a real domain (e.g., `https://auto-cs.example.com`), consider whitelisting only the extension/app origins.

## 10) Notes

- This is an MVP: no auth/user system. Monetization relies on the shared license key check (`GOOD_SELLER_2025`).
- The in-memory counter resets on server restarts; production should use durable storage.
- The route intentionally returns `200` even for limit/LLM errors so the extension can handle all cases consistently.