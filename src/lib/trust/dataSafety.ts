/**
 * Play Console → App content → Data safety — the answers, derived from the code.
 *
 * WHY THIS IS CODE AND NOT A DOCUMENT
 * A Data Safety form filled in by hand is a snapshot that decays the moment a
 * dependency is added or an event is renamed, and it decays silently: Play
 * shows no warning, the app is simply misdeclared. So the parts that CAN be
 * derived are derived, and `tests/dataSafety.test.ts` fails when the code moves
 * under an answer. The parts that cannot be derived — Play's own definitions and
 * the owner's product decisions — are marked as such rather than invented.
 *
 * WHAT IS DERIVED, and from where
 * - the event and property names the app may send (`ALLOWED_PROP_KEYS`,
 *   `ANALYTICS_EVENTS`), because those bound what can reach the analytics store;
 * - the third-party SDKs that are actually installed (`package.json` dependencies),
 *   because "we share data with Google" is a claim about the dependency list;
 * - the Cloudflare surfaces the app talks to, because they are in the client code.
 *
 * WHAT IS NOT DERIVED, and must be confirmed by a human
 * - whether any answer applies only to a Play-distributed build;
 * - retention guarantees, which are operational promises, not code;
 * - whether an owner-reviewed submission differs from this draft.
 */

/** Third parties that receive learner data, as installed. One line each. */
export interface DataRecipient {
  /** How the form names them. */
  name: string;
  /** What they actually receive. */
  shares: string;
  /** Where it goes over the wire. */
  why: string;
}

export interface DataSafetyAnswers {
  /** Does the app collect or share any of the listed data types at all? */
  collects: boolean;
  /** Data is encrypted in transit (HTTPS to Pages, the Worker, and the AI providers). */
  encryptedInTransit: boolean;
  /** The user can ask for their data to be deleted — export and deletion both exist. */
  deletionRequestAvailable: boolean;
  /** Data is NOT used for advertising or marketing, and there is no ad SDK. */
  usedForAdvertising: false;
  /** No third-party SDK in the dependency tree claims an account or device id. */
  accountCreation: 'google_sign_in';
  recipients: DataRecipient[];
  /**
   * Answers that depend on the OWNER's operations rather than on this code.
   * They ship marked UNCONFIRMED on purpose: an unconfirmed answer is a question
   * on a launch checklist, whereas a confirmed wrong one is a misdeclaration.
   */
  unconfirmed: Array<{ question: string; answer: string }>;
}

/**
 * The recipients, each pinned by a test against what the code imports.
 * Cloudflare is not optional here: the account id, the entitlement and the
 * analytics all live in its D1 and KV.
 */
export const DATA_RECIPIENTS: DataRecipient[] = [
  {
    name: 'Google (Sign-In with Google, Gemini)',
    shares:
      'The Google account identifier and email returned by sign-in; the German text a learner sends for a conversation turn, translation or grading.',
    why: 'Authentication (token verification) and the AI that speaks with the learner.',
  },
  {
    name: 'Cloudflare (Workers, D1, KV, Pages)',
    shares:
      'Account id, email, activation-code redemptions, entitlements, conversation logs, anonymised analytics events, and the request country.',
    why: 'The entire backend, the content registry and the static hosting.',
  },
  {
    name: 'NOWPayments (crypto sales only, test mode)',
    shares:
      'Only an order identifier and amount, on the separate sales site. No learner data from the app.',
    why: 'Crypto checkout. Currently in test mode, so no real payment flows.',
  },
];

export const DATA_SAFETY: DataSafetyAnswers = {
  collects: true,
  encryptedInTransit: true,
  deletionRequestAvailable: true,
  usedForAdvertising: false,
  accountCreation: 'google_sign_in',
  recipients: DATA_RECIPIENTS,
  unconfirmed: [
    {
      question: 'Data retention periods',
      answer:
        'UNPROVEN. Code prunes analytics to 30 days and rate-limit rows to their window, but the retention the owner applies to account rows, conversation logs and the redemption ledger is an operational decision.',
    },
    {
      question: 'Does the app share data with a third party for advertising or marketing?',
      answer:
        'No, per the code: no ad or analytics SDK is installed. A human must confirm no future build adds one before submitting.',
    },
    {
      question: 'Is the app distributed on Play, and does the submission include the TWA package?',
      answer:
        'UNCONFIRMED. The assetlinks statement is emitted empty until a package name and signing fingerprint are configured, so no Play-distributed build can verify yet.',
    },
    {
      question: 'Does the app collect precise location, health, or financial data?',
      answer:
        'No. The microphone is used for speech recognition and audio is not stored; the request country is derived from the Cloudflare header and is coarse.',
    },
  ],
};