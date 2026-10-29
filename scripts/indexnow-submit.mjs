#!/usr/bin/env node
/**
 * Tell IndexNow (Bing, Yandex, Seznam, Naver) that the site changed.
 *
 *   npm run seo:indexnow            # every public URL, after a deploy
 *   npm run seo:indexnow -- --dry-run
 *   npm run seo:indexnow -- https://website.katzuai.com/guides/a1-visa
 *
 * WHY A SCRIPT AND NOT A DEPLOY HOOK
 * IndexNow is not a ranking signal; it is a "please re-fetch" note that saves a
 * crawler a polling cycle. Running it once by hand after a deploy is honest and
 * reversible. A hook that fires on every build would submit on a branch push,
 * and a submission for a URL that is not live yet is noise the engine learns to
 * distrust.
 *
 * The key is public by design: the service fetches `/<key>.txt` from the host to
 * prove the same person owns both. The file is emitted by the site build from
 * `scripts/site-seo.mjs`, so the key here and the key on disk cannot drift.
 */

import { INDEXNOW_ENDPOINT, indexNowPayload, siteUrls } from './site-seo.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const urls = args.filter((arg) => /^https:\/\//.test(arg));
const payload = indexNowPayload(urls.length ? urls : siteUrls());

const describe = (status) => {
  if (status === 200) return 'OK — URLs accepted';
  if (status === 202) return 'Accepted — key is being validated (first submission)';
  if (status === 400) return 'Bad request — malformed payload';
  if (status === 403) return 'Forbidden — key file not reachable at keyLocation';
  if (status === 422) return 'Unprocessable — URLs do not belong to host, or key mismatch';
  if (status === 429) return 'Too many requests — wait, then submit again';
  return `Unexpected status ${status}`;
};

console.log(`indexnow: ${payload.urlList.length} URL(s) for ${payload.host}`);
for (const url of payload.urlList) console.log(`  ${url}`);

if (dryRun) {
  console.log('indexnow: dry run, nothing sent');
  process.exit(0);
}

const response = await fetch(INDEXNOW_ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
});

console.log(`indexnow: ${response.status} ${describe(response.status)}`);
if (!response.ok) {
  const body = await response.text().catch(() => '');
  if (body) console.log(body.slice(0, 400));
  process.exit(1);
}
