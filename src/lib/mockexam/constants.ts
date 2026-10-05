/**
 * The level the mock runs at, in one place.
 *
 * The app shows this on the level chip and uses it for turn pacing; the worker
 * independently forces the same level for any turn that carries a verified mock
 * grant. Two copies of one number would let the learner be told A1 and examined
 * at B1, so the client and the server both read it from their own constant and a
 * test pins the pair (`tests/mockExam.test.ts` asserts the server side).
 */
export const MOCK_EXAM_LEVEL = 'B1' as const;