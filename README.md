# Katzu PWA

Katzu is an Arabic-first German conversation practice app for learners preparing to move, work, or study in Germany. It focuses on realistic speaking and listening practice, with honest progress tracking and offline curriculum access.

## Local development

**Prerequisites:** Node.js satisfying `package.json` engines (`^22.22.2 || ^24.15.0 || >=26.0.0`) and npm. CI pins Node 24.15.0; use a supported version rather than the historical Node 20 guidance.

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

## Engineering roadmap

Read [AGENTS.md](AGENTS.md) (or the [Claude entry point](CLAUDE.md)), the
[excellence roadmap](plans/008-katzu-excellence-master-plan.md), and
[current execution status](docs/agent/EXCELLENCE-STATUS.md). Historical logs are not current readiness claims.
For production-bundle browser verification use `E2E_TARGET=preview npx playwright test --reporter=line`;
ordinary Playwright mode defaults to the development server. Backend mocks do not prove real D1 concurrency.

See [DEPLOY.md](./DEPLOY.md) for Cloudflare Worker, D1/KV, Google Identity Services, and Cloudflare Pages deployment steps.
