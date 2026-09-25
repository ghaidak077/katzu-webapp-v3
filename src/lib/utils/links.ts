/**
 * External links the app hands to the learner.
 *
 * The sales site is a separate property (a Cloudflare Pages project of its own)
 * that sells activation codes — the app itself only ever redeems a code through
 * `/verify` and never takes a payment. Overridable at build time with
 * `VITE_SALES_URL`; the production value is the default so nothing has to be
 * configured for the link to work.
 */
const env = (import.meta as any).env || {};

export const SALES_URL: string = String(env.VITE_SALES_URL || 'https://katzu-sales.pages.dev').replace(/\/+$/, '');

export const PRO_PRICE_LABEL = '5 دولار / شهر';
