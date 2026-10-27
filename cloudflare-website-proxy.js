/**
 * website.katzuai.com — serves the standalone marketing landing page.
 *
 * The landing is its own Cloudflare Pages project (`katzu-landing`), so editing
 * or deploying the app never touches it. This Worker only exists to put that
 * project on the katzuai.com domain without moving DNS by hand: a Workers
 * custom domain provisions the record and certificate automatically.
 *
 * Why a subdomain and not katzuai.com/website: the app is a PWA whose service
 * worker claims scope "/" and answers every navigation with the app shell, so
 * any path on katzuai.com would show the app to returning learners instead of
 * the landing.
 *
 * Security posture: a public, static page with no accounts. Only safe request
 * headers are forwarded (never Cookie/Authorization or the browser's `cf-*`
 * metadata), only read methods are accepted, and the origin is a constant, so
 * neither the path nor the query can ever redirect the request elsewhere.
 */

const LANDING_ORIGIN = 'https://katzu-landing.pages.dev';

// Static content negotiation and conditional/range requests only. Deliberately
// excludes Cookie, Authorization and every other credential-bearing header:
// whatever cookies exist for *.katzuai.com must never reach the Pages origin.
const FORWARD_HEADERS = [
  'accept',
  'accept-encoding',
  'accept-language',
  'user-agent',
  'if-none-match',
  'if-modified-since',
  'range',
  'if-range',
];

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const url = new URL(request.url);
    // Concatenating onto a constant origin cannot change the host: URL parsing
    // normalises `//host` and `..` inside the path before it is fetched.
    const target = new URL(LANDING_ORIGIN + url.pathname + url.search);

    const headers = new Headers();
    for (const name of FORWARD_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    return fetch(new Request(target.toString(), {
      method: request.method,
      headers,
      redirect: 'manual',
    }));
  },
};
