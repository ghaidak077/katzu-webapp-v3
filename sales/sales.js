/**
 * Katzu sales site — landing + crypto checkout.
 *
 * ONE FILE TO CONFIGURE: everything operator-specific lives in CONFIG below.
 * Nothing here is secret — the API key stays on the Worker.
 *
 * NOTE: this page sells a CODE. It never talks to the Katzu app: the buyer pays
 * here, gets a signed activation code, and types it into the app's existing
 * redemption screen.
 */

const CONFIG = {
  // Worker that owns /crypto/* (the same worker the app uses).
  workerUrl: 'https://katzu-test.ghaidakalosh008.workers.dev',
  // App/policy links are absolute in index.html (they must resolve without
  // JavaScript), so the app origin is not repeated here.

  // ---- FILL THESE BEFORE PUBLISHING (local Syria payment) --------------------
  telegram: 'https://t.me/FILL_TELEGRAM_HANDLE',
  syriatelNumber: 'FILL — رقم Syriatel Cash',
  mtnNumber: 'FILL — رقم MTN Cash',
  bankDetails: 'FILL — اسم المصرف ورقم الحساب والاسم',
  // ---------------------------------------------------------------------------

  localAmountLabel: 'ما يعادل 5$ بسعر الصرف اليوم',
};

const ORDERS_KEY = 'katzu_sales_orders_v1';
const PLACEHOLDER = /^FILL/;
const isPlaceholder = (value) => typeof value !== 'string' || !value.trim() || PLACEHOLDER.test(value.trim()) || value.includes('FILL_');

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Order bookkeeping (browser-local only: it is the buyer's copy of the claim
// token that unlocks the code on the success page).
// ---------------------------------------------------------------------------

function readOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrder(order) {
  try {
    const orders = readOrders().filter((o) => o.order_id !== order.order_id);
    orders.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 25)));
  } catch {
    /* private mode: the success URL in the address bar is still the source of truth */
  }
}

// ---------------------------------------------------------------------------
// Static wiring: links, copyable numbers, local payment contact
// ---------------------------------------------------------------------------

function applyConfig() {
  // NOTE: app/policy links are absolute in index.html, not rewritten here, so they
  // resolve without JavaScript (crawlers, store reviewers, JS disabled).
  const telegramReady = !isPlaceholder(CONFIG.telegram);
  const telegramLinks = ['telegram-local', 'footer-telegram'].map($).filter(Boolean);
  telegramLinks.forEach((el) => {
    if (telegramReady) {
      el.setAttribute('href', CONFIG.telegram);
      el.setAttribute('target', '_blank');
    } else {
      el.removeAttribute('href');
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('is-disabled');
    }
  });

  const fields = [
    ['__FILL_SYRIATEL_NUMBER__', CONFIG.syriatelNumber],
    ['__FILL_MTN_NUMBER__', CONFIG.mtnNumber],
    ['__FILL_BANK_DETAILS__', CONFIG.bankDetails],
  ];
  fields.forEach(([placeholder, value]) => {
    document.querySelectorAll(`[data-copy="${placeholder}"]`).forEach((el) => {
      el.textContent = value;
      el.dataset.copy = value;
    });
    // The copy button is looked up by its ORIGINAL placeholder target, before the
    // rewrite above changes the sibling's data-copy value. Wiring it after the
    // rewrite silently left the buttons with nothing to copy.
    document.querySelectorAll(`.copy-mini[data-copy-target="${placeholder}"]`).forEach((btn) => {
      btn.setAttribute('data-copy-value', value);
    });
  });

  document.querySelectorAll('.copy-mini').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy-value') || '';
      if (!text || isPlaceholder(text)) return;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'تم النسخ';
        setTimeout(() => { btn.textContent = 'نسخ'; }, 1800);
      } catch {
        /* clipboard unavailable: the number is visible on screen anyway */
      }
    });
  });

  // An unfilled value must be loud, not a silently broken call to action.
  const unfilled = [
    ['قناة التواصل (تيليجرام)', CONFIG.telegram],
    ['رقم Syriatel Cash', CONFIG.syriatelNumber],
    ['رقم MTN Cash', CONFIG.mtnNumber],
    ['تفاصيل الحوالة المصرفية', CONFIG.bankDetails],
  ].filter(([, value]) => isPlaceholder(value)).map(([label]) => label);

  if (unfilled.length && $('telegram-error')) {
    $('telegram-error').hidden = false;
    $('telegram-error').textContent = `لم تُضبط بعد في إعدادات الموقع: ${unfilled.join('، ')} — اضبطها قبل الإطلاق.`;
  }

  const localHint = document.querySelector('.method .hint');
  if (localHint && CONFIG.localAmountLabel) {
    localHint.textContent = `أرسل بعد الدفع: المبلغ (${CONFIG.localAmountLabel})، الطريقة، والاسم — ثم استلم الكود على تيليجرام.`;
  }
}

// ---------------------------------------------------------------------------
// Crypto checkout
// ---------------------------------------------------------------------------

async function checkCryptoAvailability() {
  const badge = $('crypto-badge');
  const button = $('crypto-buy');
  const hint = $('crypto-hint');
  if (!button) return;

  try {
    const res = await fetch(`${CONFIG.workerUrl}/crypto/health`, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (res.ok && data?.ready) {
      badge.textContent = data.environment === 'live_mode' ? 'متاح' : 'متاح (وضع التجربة)';
      badge.classList.add('badge-ok');
      button.disabled = false;
      hint.textContent = `السعر: ${data.price_usd ?? data.priceUsd} $ مقابل ${data.months ?? 1} شهر من Pro.`;
      button.dataset.price = String(data.priceUsd ?? '');
      return;
    }
    badge.textContent = 'غير متاح حالياً';
    badge.classList.add('badge-warn');
    button.disabled = true;
    hint.textContent = 'بوابة الدفع بالعملة الرقمية غير مهيأة بعد. استخدم الدفع المحلي في الأسفل.';
  } catch {
    badge.textContent = 'تعذّر الاتصال';
    badge.classList.add('badge-warn');
    button.disabled = true;
    hint.textContent = 'تعذّر الوصول إلى خادم الدفع. استخدم الدفع المحلي في الأسفل.';
  }
}

async function startCryptoCheckout() {
  const button = $('crypto-buy');
  const errorBox = $('crypto-error');
  if (!button) return;

  errorBox.hidden = true;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'جارٍ تجهيز الفاتورة…';

  try {
    const res = await fetch(`${CONFIG.workerUrl}/crypto/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.checkout_url) {
      saveOrder({
        order_id: data.order_id,
        claim_token: data.claim_token,
        created_at: new Date().toISOString(),
        months: data.months,
        price_usd: data.price_usd,
      });
      window.location.assign(data.checkout_url);
      return;
    }

    errorBox.hidden = false;
    errorBox.textContent = data?.message || 'تعذّر بدء عملية الدفع. حاول مرة أخرى.';
  } catch {
    errorBox.hidden = false;
    errorBox.textContent = 'تعذّر الاتصال ببوابة الدفع. تحقّق من اتصالك بالإنترنت.';
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

// ---------------------------------------------------------------------------
// "Already bought?" — the buyer's locally stored orders
// ---------------------------------------------------------------------------

function renderRecover() {
  const orders = readOrders();
  const box = $('recover');
  const list = $('recover-list');
  const empty = $('recover-empty');
  if (!box || !list || !empty) return;

  if (!orders.length) {
    box.hidden = true;
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  box.hidden = false;
  list.replaceChildren();

  orders.forEach((order) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'btn btn-ghost';
    link.href = `/success.html?order=${encodeURIComponent(order.order_id)}&token=${encodeURIComponent(order.claim_token)}`;
    const when = order.created_at ? new Date(order.created_at).toLocaleString('ar') : '';
    link.textContent = `استعادة الطلب ${order.order_id}${when ? ` — ${when}` : ''}`;
    li.appendChild(link);
    list.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyConfig();
  renderRecover();
  const buy = $('crypto-buy');
  if (buy) {
    buy.addEventListener('click', startCryptoCheckout);
    checkCryptoAvailability();
  }
});
