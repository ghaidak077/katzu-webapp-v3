/**
 * Content negotiation for website.katzuai.com.
 *
 * A client that sends `Accept: text/markdown` gets the page's markdown twin from
 * `/md/<page>.md`; every browser, crawler and default request keeps getting the
 * HTML it has always got. The twin is built by `scripts/build-website.mjs` from
 * the same rendered `<main>`, so it cannot say anything the page does not say.
 *
 * WHY A PAGES FUNCTION AND NOT `_headers`
 * `_headers` can set response headers but it cannot choose a representation, and
 * `_redirects` cannot read a request header. This is the only place in the
 * current setup — a static Pages project behind the `katzu-website` Worker, which
 * forwards `accept` and nothing credential-bearing — where the request can be
 * inspected before the asset is chosen.
 *
 * WHAT IS DELIBERATELY NOT NEGOTIATED
 * Assets (`/assets/*`), the crawler files (`/robots.txt`, `/sitemap.xml`,
 * `/llms.txt`) and `404.html` have no twin. A request for one of them falls
 * through to the static asset exactly as before, so a bad `Accept` header can
 * never turn a working URL into a 404.
 */

/** Only paths with a generated twin are negotiable. */
export function markdownPathFor(pathname) {
  let path = pathname;
  if (path === '/' || path === '') return '/md/index.md';
  if (path.endsWith('/')) path = path.slice(0, -1);
  if (!/^\/(?:pricing|help|affiliate|guides(?:\/[a-z0-9-]+)?)$/.test(path)) return null;
  return `/md${path}.md`;
}

/** `text/markdown` in the Accept header, with its q-value above zero. */
export function wantsMarkdown(accept) {
  if (!accept) return false;
  return accept.split(',').some((part) => {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    if (type !== 'text/markdown') return false;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return q === undefined || Number.parseFloat(q.slice(2)) > 0;
  });
}

const MARKDOWN_HEADERS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  Vary: 'Accept',
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'public, max-age=300',
};

/** The HTML answer, with `Vary: Accept` because the same URL has two representations. */
function variedHtml(response) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Accept');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readTwin(context, request, url, mdPath) {
  const assetRequest = new Request(new URL(mdPath, url.origin).toString(), {
    method: 'GET',
    headers: request.headers,
  });
  // `env.ASSETS` is the static binding Pages injects; `next(request)` is the
  // documented rewrite path and the fallback when it is absent.
  if (context.env && context.env.ASSETS) return context.env.ASSETS.fetch(assetRequest);
  return context.next(assetRequest);
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();

  // Source, not a page. Pages excludes the directory from the upload, but the
  // dev server does not, and a 404 is the same answer in both places.
  if (url.pathname.startsWith('/functions/')) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const mdPath = markdownPathFor(url.pathname);
  if (!mdPath) return context.next();

  if (!wantsMarkdown(request.headers.get('accept'))) return variedHtml(await context.next());

  const twin = await readTwin(context, request, url, mdPath);
  // A missing twin is not a missing page: the HTML answer is always correct.
  if (twin.status !== 200) return variedHtml(await context.next());

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: MARKDOWN_HEADERS });
  }
  return new Response(await twin.text(), { status: 200, headers: MARKDOWN_HEADERS });
}
