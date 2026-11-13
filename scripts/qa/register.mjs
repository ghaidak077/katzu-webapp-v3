/**
 * Lets Node load the app's TypeScript modules the way Vite does.
 *
 * Node 24 strips types natively, but its ESM resolver does not add the missing
 * extensions this repo's TS uses (`./germanLexicon.generated`). Without this
 * hook `germanChecker.ts` cannot be imported from a script, so the QA harness
 * would have to re-implement the local checker — exactly the drift the harness
 * exists to catch. Import this module before any `*.ts` app module.
 */
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.')) throw error;
      for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        try {
          return nextResolve(specifier + suffix, context);
        } catch {
          /* try the next suffix */
        }
      }
      throw error;
    }
  },
});
