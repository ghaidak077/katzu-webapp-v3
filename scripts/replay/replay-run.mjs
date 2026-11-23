#!/usr/bin/env node
/**
 * The two things the replay run could not do before: finish across several sittings, and remember
 * its own results.
 *
 * WHY THIS EXISTS
 * The 69-case corpus needs ~11 minutes of paced live turns, and the Groq free tier answered
 * `429` (retry_after 56181 s) after 29 turns of 46 on 2026-11-16 — so the recall gate has never
 * had a full denominator. Two consequences, both fixed here:
 *
 * 1. **Batch + resume.** A capture may be split into batches; `planRemaining` says which cases are
 *    still missing and how long the next batch will take at the paced interval (~9 s, the measured
 *    live cadence). Several partial captures can be merged by the scorer, so a quota wall costs a
 *    sitting, not the whole run.
 * 2. **Store the score.** The gate numbers printed once and vanished with the terminal. `recordResult`
 *    writes one JSON per scored run so the next run can compare against the last one instead of
 *    quoting a number from memory.
 *
 * Nothing here touches the network or a secret; it is scheduling and arithmetic over files.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The measured cadence: below ~9 s the free tier starts dropping history and answering 429. */
export const PACING_MS = 9000;

/** Cases captured in any number of partial captures, keyed by id (later files win). */
export const mergeCaptures = (captures) => {
  const byId = new Map();
  for (const capture of captures) {
    const turns = Array.isArray(capture) ? capture : (capture?.turns ?? []);
    for (const turn of turns) if (turn?.id) byId.set(turn.id, turn);
  }
  return [...byId.values()];
};

/**
 * What is left to capture, in batches that fit inside one sitting.
 *
 * `estimatedMinutes` is for the remainder, not the corpus — the number a person needs before
 * deciding whether to start now. A case counts as captured only with HTTP 200 and a reply body, so
 * a 429 recorded mid-run is retried rather than scored as a model failure.
 */
export const planRemaining = ({ cases, capturedIds = [], batchSize = 12, pacingMs = PACING_MS }) => {
  const done = new Set(capturedIds);
  const remaining = cases.filter((item) => !done.has(item.id));
  const batches = [];
  for (let at = 0; at < remaining.length; at += batchSize) {
    batches.push(remaining.slice(at, at + batchSize).map((item) => item.id));
  }
  return {
    captured: cases.length - remaining.length,
    total: cases.length,
    remaining: remaining.length,
    batches,
    pacingMs,
    estimatedMinutes: Number(((remaining.length * pacingMs) / 60000).toFixed(1)),
  };
};

/** A capture turn that is worth scoring: the route answered with a body. */
export const usableTurn = (turn) => turn?.status === 200 && Boolean(turn?.body?.reply_de);

/**
 * One scored run, stored under `.tmp/replay-results/` (untracked: it is machine state, and the
 * ledger carries the numbers that matter). The file name sorts by time, so `readResults` is the
 * history in order without parsing dates.
 */
export const recordResult = (dir, result) => {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `${stamp}.json`);
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  return path;
};

/** Every stored run, oldest first. A malformed file is skipped rather than crashing the history. */
export const readResults = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      try {
        return [{ file: name, ...JSON.parse(readFileSync(join(dir, name), 'utf8')) }];
      } catch {
        return [];
      }
    });
};
