# Katzu PWA

Katzu is an Arabic-first German conversation practice app for learners preparing to move, work, or study in Germany. It focuses on realistic speaking and listening practice, with honest progress tracking and offline curriculum access.

## Local development

**Prerequisites:** Node.js 20+ and npm.

```bash
npm install
copy .env.example .env
npm run dev
```

Set `VITE_GOOGLE_CLIENT_ID` and `VITE_WORKER_URL` for a functional sign-in and Worker-backed AI experience. Gemini secrets belong only in Cloudflare Worker configuration; never put them in `.env` values that Vite exposes to the browser.

## Verification

```bash
npm run lint
npm test -- --run
npm run build
```

See [DEPLOY.md](./DEPLOY.md) for Cloudflare Worker, D1/KV, Google Identity Services, and Cloudflare Pages deployment steps.
