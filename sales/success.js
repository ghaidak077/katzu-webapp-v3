/**
 * Katzu sales site — post-payment page.
 *
 * The redirect back from the payment provider proves NOTHING: this page only
 * shows a code after the Worker reports, for this order's claim token, that the
 * signature-verified provider webhook settled the payment and a code was minted.
 *
 * Config must stay in sync with sales.js (same two values). Duplicated on purpose
 * so this page has no dependency on the landing bundle.
 */

const CONFIG = {
  workerUrl: 'https://katzu-test.ghaidakalosh008.workers.dev',
  appOrigin: 'https://katzu-webapp-v3.pages.dev',
  telegram: 'https://t.me/FILL_TELEGRAM_HANDLE',
};

const ORDERS_KEY = 'katzu_sales_orders_v1';
const POLL_INTERVAL_MS = 6000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;

const $ = (id) => document.getElementById(id);

function readOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveOrder() {
  const params = new URLSearchParams(window.location.search);
  let orderId = params.get('order') || '';
  let token = params.get('token') || '';

  if (!orderId || !token) {
    const saved = readOrders()[0];
    if (saved) {
      orderId = orderId || saved.order_id;
      token = token || saved.claim_token;
    }
  }
  return { orderId, token };
}

function panel(name) {
  ['pending', 'delivered', 'failed', 'unknown'].forEach((id) => {
    const el = $(id);
    if (el) el.hidden = id !== name;
  });
}

function wireSupport() {
  const support = $('support');
  const openApp = $('open-app');
  const ready = CONFIG.telegram && !CONFIG.telegram.includes('FILL_');

  if (support) {
    if (ready) {
      support.setAttribute('href', CONFIG.telegram);
      support.setAttribute('target', '_blank');
    } else {
      support.hidden = true;
    }
  }
  if (openApp) openApp.setAttribute('href', CONFIG.appOrigin);
}

async function fetchOrder(orderId, token) {
  const url = `${CONFIG.workerUrl}/crypto/order?id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return { notFound: true };
  const data = await res.json().catch(() => ({}));
  return { ...data, httpStatus: res.status };
}

function showDelivered(order) {
  panel('delivered');
  const codeEl = $('code');
  codeEl.textContent = order.code; // textContent only: server data is never injected as HTML
  const note = $('delivered-note');
  const months = order.months || 1;
  note.textContent = `هذا الكود يمنحك ${months} شهر من Katzu Pro، ومرة واحدة فقط. احتفظ به.`;

  const copy = $('copy-code');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(order.code);
      copy.textContent = 'تم النسخ ✓';
    } catch {
      // Clipboard can be blocked (older browsers / insecure context): the code is
      // selectable on screen, so this is not a dead end.
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copy.textContent = 'انسخ يدوياً (محدَّد)';
    }
  });
}

async function poll(orderId, token) {
  const startedAt = Date.now();
  const statusText = $('status-text');

  const tick = async () => {
    let order;
    try {
      order = await fetchOrder(orderId, token);
    } catch {
      statusText.textContent = 'تعذّر الوصول إلى الخادم — سنعيد المحاولة…';
      return schedule();
    }

    if (order.notFound) {
      panel('unknown');
      return undefined;
    }
    if (order.delivered && order.code) {
      showDelivered(order);
      return undefined;
    }
    if (order.status === 'failed' || order.status === 'expired') {
      panel('failed');
      return undefined;
    }

    statusText.textContent =
      order.status === 'paid'
        ? 'تم استلام الدفع، جارٍ إصدار الكود…'
        : 'بانتظار تأكيد الشبكة…';

    return schedule();
  };

  const schedule = () => {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      statusText.textContent = 'تأخّر التأكيد. راسلنا على تيليجرام مع رقم الطلب.';
      return undefined;
    }
    setTimeout(tick, POLL_INTERVAL_MS);
    return undefined;
  };

  await tick();
}

document.addEventListener('DOMContentLoaded', () => {
  wireSupport();
  const { orderId, token } = resolveOrder();
  if (!orderId || !token) {
    panel('unknown');
    return;
  }
  $('order-ref').textContent = `رقم الطلب: ${orderId}`;
  poll(orderId, token);
});
