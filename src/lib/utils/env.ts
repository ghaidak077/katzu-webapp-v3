/**
 * Build-mode flags without importing `vite/client` types into every file.
 * Development-only surfaces (the design-system page) read this so they can never
 * end up in a production bundle's routing table.
 */
interface ViteEnv {
  DEV?: boolean;
  PROD?: boolean;
}

const env = (import.meta as unknown as { env?: ViteEnv }).env;

export const isDevBuild = env?.DEV === true;
