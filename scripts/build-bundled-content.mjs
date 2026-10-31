/**
 * Build the panel's read-only snapshot of bundled content.
 *
 * Why: 223 opener glosses and 892 word glosses ship inside the app bundle and
 * cannot be edited at runtime. The admin panel still has to show them, flag what
 * needs Arabic proofreading and export a corrections file a build step can
 * consume. That needs a static, panel-servable copy.
 *
 * Source is the generated TS itself (transpiled with the repo's TypeScript), so
 * the snapshot cannot drift from what learners actually receive without the
 * build being re-run. `npm run build:bundled-content` regenerates it, and
 * `tests/adminContentApi.test.ts` fails when the counts disagree.
 *
 * Output is deterministic: no timestamp, insertion order preserved.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadGenerated(relativePath) {
  const source = readFileSync(join(root, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const module = { exports: {} };
  // The generated files contain a plain object literal and no imports.
  new Function("exports", "module", compiled.outputText)(module.exports, module);
  return module.exports;
}

const { OPENER_GLOSSES } = loadGenerated("src/lib/conversation/openerGlosses.generated.ts");
const { WORD_GLOSSARY } = loadGenerated("src/lib/vocabulary/wordGlossary.generated.ts");

const openers = Object.entries(OPENER_GLOSSES).map(([german, ar]) => ({ key: german, ar }));
const glosses = Object.entries(WORD_GLOSSARY).map(([word, gloss]) => ({
  key: word,
  lemma: gloss.lemma || word,
  ar: gloss.ar || "",
  pos: gloss.pos || "",
  level: gloss.level || "",
}));

const payload = {
  format: "katzu-bundled-content-v1",
  counts: { openers: openers.length, glosses: glosses.length },
  openers,
  glosses,
};

const target = join(root, "admin-worker", "public", "bundled-content.json");
writeFileSync(target, JSON.stringify(payload) + "\n", "utf8");
console.log(`bundled content: ${openers.length} openers, ${glosses.length} glosses -> ${target}`);
