/**
 * Speech-to-text for the live conversation.
 *
 * WHY THIS ROUTE EXISTS AT ALL
 * Until now the app transcribed with the browser's Web Speech API
 * (`webkitSpeechRecognition`). On the device most of this app's learners actually
 * hold — an Android phone — that API failed in three ways at once, all reported
 * from a real session:
 *
 *  1. it recorded nothing. Chrome's recognizer and the app's own `getUserMedia`
 *     analyser stream (which the orb needs for its amplitude) compete for the
 *     microphone, and the recognizer lost;
 *  2. it plays an Android system beep when it opens the mic, and no web API can
 *     suppress a sound the OS, not the page, makes;
 *  3. it does not exist at all in Firefox and is inconsistent in iOS Safari, so
 *     "speak German" was silently unavailable on those browsers.
 *
 * So the browser now only *records* — `MediaRecorder`, which is reliable on every
 * target platform — and the recognition happens here, on the same Workers AI
 * binding this worker already holds. One provider, one bill, no new backend, and
 * no dependency on a browser's speech service.
 *
 * It is also a quality win, not only a bug fix: Whisper large-v3-turbo transcribes
 * an Arabic speaker's German accent far more accurately than Chrome's Android
 * recognizer, which is the difference between the grammar coach grading the
 * learner's sentence and grading its own transcription error.
 *
 * COST / LATENCY: $0.000513 per audio minute, measured, and a 10-second sentence
 * is ~1 second of wall time. `vad_filter` is on so silence is not billed and does
 * not become a hallucinated sentence, and the client caps a recording at 20s.
 *
 * NO ENTITLEMENT GATE, ON PURPOSE. Every other AI route checks the learner's plan.
 * This one cannot: transcription is the microphone, and refusing it would mean a
 * free learner whose session quota is spent can no longer be *heard* even though
 * the app offers them review and every other screen. Abuse is bounded by its own
 * rate-limit budget instead (separate from the conversation budget, so speaking
 * does not spend the learner's turns), and the recorded audio is never stored.
 */

/** Whisper input is base64 inside the JSON body, which the worker's global JSON
 * limit does not cover: a 20-second Opus sentence is ~60 KB and base64 adds a
 * third on top. This is the ceiling that keeps the route bounded anyway. */
export const MAX_TRANSCRIPTION_BASE64_CHARS = 400000;

/** Containers a browser MediaRecorder realistically produces (plus the ones our
 * own tests use). Anything else is rejected before it reaches the model. */
const ALLOWED_MIME = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/aac",
];

const baseMime = (value) => String(value || "").split(";")[0].trim().toLowerCase();

/**
 * @param {Request} request
 * @param {object} env
 * @param {object} cors
 * @param {object} deps worker-scoped internals, injected at the call site
 */
export async function handleTranscribeRoute(request, env, cors, deps) {
  const { json, extractIdToken, verifyGoogleIdToken, checkGlobalRateLimit } = deps;

  if (!env?.AI || typeof env.AI.run !== "function") {
    return json(
      {
        error: "stt_unavailable",
        code: "STT_UNAVAILABLE",
        message: "التعرف الصوتي غير متاح في هذا الإصدار من الخادم. اكتب جملتك بالألمانية — النتيجة نفسها.",
      },
      503,
      cors
    );
  }

  const body = await request.json().catch(() => null);
  const audio = typeof body?.audio === "string" ? body.audio : "";
  if (!audio) {
    return json({ error: "audio_required", message: "لم يصل أي صوت لتعرّفه." }, 400, cors);
  }
  if (audio.length > MAX_TRANSCRIPTION_BASE64_CHARS) {
    return json(
      {
        error: "audio_too_large",
        code: "AUDIO_TOO_LARGE",
        message: "التسجيل أطول من المسموح. سجّل جملة واحدة قصيرة.",
      },
      413,
      cors
    );
  }

  const mime = baseMime(body?.mime);
  if (mime && !ALLOWED_MIME.includes(mime)) {
    return json(
      { error: "unsupported_audio_format", code: "AUDIO_FORMAT", message: `صيغة التسجيل ${mime} غير مدعومة.` },
      415,
      cors
    );
  }

  const idToken = extractIdToken(request, body || {});
  if (!idToken) {
    return json(
      { error: "unauthenticated", code: "UNAUTHENTICATED", message: "يرجى تسجيل الدخول لمتابعة التحدث." },
      401,
      cors
    );
  }
  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json(
      { error: "invalid_id_token", code: "UNAUTHENTICATED", message: "انتهت جلسة الدخول. سجّل الدخول من جديد." },
      401,
      cors
    );
  }

  // Its own budget: speaking is not a conversation turn. A learner who hesitates
  // and retries three times must not burn three turns of their daily allowance.
  const rate = await checkGlobalRateLimit(account.sub, env, { scope: "stt", perMinute: 40, perDay: 800 });
  if (!rate.allowed) {
    return json(
      {
        error: "rate_limit_exceeded",
        code: "RATE_LIMIT_EXCEEDED",
        message: "وصلت إلى الحد الأقصى للتسجيل مؤقتاً. جرّب بعد لحظات أو اكتب جملتك.",
        retry_after: rate.retryAfter,
      },
      429,
      cors
    );
  }

  try {
    const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio,
      task: "transcribe",
      // The learner speaks German, always. Telling the model so removes the
      // detect-language pass and the mistranscriptions it produces on a short,
      // accented clip.
      language: "de",
      // Short, independent clips with a pause before the first word: without VAD
      // the model likes to invent a sentence for the silence.
      vad_filter: true,
      // Each recording is one self-contained sentence. Conditioning on the
      // previous text is what makes it repeat itself instead of stopping.
      condition_on_previous_text: false,
      hallucination_silence_threshold: 2,
    });

    const text = String(result?.text || "")
      .replace(/\s+/g, " ")
      .trim();
    return json(
      {
        text,
        word_count: Number(result?.word_count || 0),
        // An empty transcript is a real answer, not an error: the client turns it
        // into "لم نسمع جملة واضحة" with the typed path kept open.
        empty: text.length === 0,
      },
      200,
      cors
    );
  } catch (err) {
    console.error("[ai/transcribe] failed:", String(err?.message || err).slice(0, 200));
    return json(
      {
        error: "stt_failed",
        code: "STT_FAILED",
        message: "تعذر التعرف على صوتك الآن. أعد المحاولة أو اكتب جملتك بالألمانية.",
        detail: String(err?.message || "").slice(0, 180),
      },
      502,
      cors
    );
  }
}
