# Katzu Sales (`katzu-sales`)

The **separate** sales property. It exists for exactly one job: sell an activation
code. It is not part of the app bundle and must never be merged into it — the app
only ever redeems a code through its existing `/verify` endpoint.

```
sales/
├── index.html     landing: what Katzu is, price, crypto checkout, local (Syria) payment
├── success.html   after payment: polls the Worker and shows the activation code
├── sales.js       landing script (config + checkout)
├── success.js     success-page script (config + polling)
├── sales.css      AMOLED/M3 styles shared by both pages
├── _headers       Pages security headers + CSP (allows only the Worker as a connect target)
└── assets/        Cairo font + mascot images copied from the app
```

## Configure before publishing

Two files hold every operator-specific value. Nothing in them is secret — the
payment API key and IPN secret live only as Worker secrets.

1. `sales.js` → `CONFIG`
   - `workerUrl` — the Worker that owns `/crypto/*`
   - `telegram`, `syriatelNumber`, `mtnNumber`, `bankDetails` — the **local Syria
     payment** details. While these still read `FILL ...`, the Telegram buttons are
     disabled and a visible warning lists exactly what is missing, so an unfilled
     value can never ship as a dead CTA.
2. `success.js` → `CONFIG` (`workerUrl`, `appOrigin`, `telegram`)

Links to the app and to `/privacy` / `/terms` are **absolute URLs in
`index.html`**, not JS-rewritten: they must resolve for crawlers and for store
reviewers that never execute JavaScript. Change the app domain there and in
`success.js` when a custom domain goes live.

## Deploy

Cloudflare Pages, new project `katzu-sales`, pointing at this directory:

- **Build command:** none (plain static files) — leave it empty
- **Build output directory:** `sales`
- **Root directory:** repository root

Then add the site's origin to the Worker's `ALLOWED_ORIGINS` (already present in
`wrangler.toml`) and keep `SALES_ORIGIN` pointed at it, because the crypto checkout
is posted from a browser on that origin and CORS is strict in production.

Custom domain: update `SALES_ORIGIN` and `ALLOWED_ORIGINS` in `wrangler.toml`, then
redeploy the Worker.

## Flow

1. Buyer opens the sales site and chooses a payment method.
2. Crypto → the page asks the Worker for an invoice (`POST /crypto/checkout`), which
   returns `checkout_url` plus an `order_id` and a `claim_token` stored in the
   buyer's browser.
3. The provider sends an IPN to `POST /crypto/webhook`. Only a signature-verified
   notification settles an order and mints a code.
4. `success.html` polls `GET /crypto/order` with the claim token until the code is
   delivered, then shows it to copy.
5. Local (Syria) → no automation by design; the buyer sends proof on Telegram and
   the operator mints a code by hand from the admin dashboard (`POST /admin/generate`).
