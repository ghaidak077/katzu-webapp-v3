# 13 — Checkout & payment copy (manual transfer → code; hosted checkout later)

Psychology target: scam fear and effort, not price. Every message is calm, concrete, and time-bounded — zero humor (doc 04 ban), all ⚠️ native read.

## Step 1 — Order intent (landing pricing button → short form)
Title: «اطلب باقتك — بدون فيزا»
Fields: الاسم · البريد أو رقم واتساب · الباقة (single/pass) · (اختياري) تاريخ امتحانك — «بنستخدمه لنرسل لك جدول تدريب مقترح» (commitment lever + doc 16 pipeline, disclosed honestly).
Button: «أكمل الطلب»

## Step 2 — Payment instructions (shown immediately)
> **خطوتان فقط:**
> ١. حوّل {السعر} € إلى:
> IBAN: {IBAN} — اسم المستلم: {name} — Bank/Wise
> ٢. أرسل صورة التحويل واتساب أو رد على الإيميل — **الرقم: {whatsapp}**
> ⏱️ الكود بيوصلك خلال **٣ ساعات كحد أقصى** (٧ أيام بالأسبوع، ٩ص–٩م بتوقيت ألمانيا).
> [FACT: response window is a commitment to keep — set with owner availability; ASSUMPTION 3h sustainable solo]
Trust footer: «إذا ما وصل الكود خلال المدة، الاسترجاع كامل — بدون نقاش.» [pairs with 05 refund policy; FOR VERIFICATION with lawyer]

## Step 3 — Payment received + code delivery (WhatsApp/email template)
> وصل التحويل، شكراً {الاسم} 🌟
> كود تفعيلك (يُستخدم مرة واحدة، صالح حتى {expiry}):
> **{DE-XXM-XXXXXXXX-XXXXXXXX}**
> التفعيل: {APP_URL} ← تسجيل الدخول ← شاشة الاشتراك ← «لديّ كود بالفعل»
> أول خطوة: المحاكاة التشخيصية — ١٠ دقائق بتخبرك وين واقف بالضبط.
> أي مشكلة؟ رد على هالرسالة مباشرة.
Code format FACT: DE-<months>M-<nonce>-<signature> (PRODUCT-SPEC). Expiry shown (05 terms).

## Step 4 — Payment confirmation for the ledger-owner (internal)
Manual check list: IBAN matches the order → amount matches cell → send code → mark sheet (doc 07 columns) → set day-1 follow-up (doc 17). Target: the buyer never waits overnight.

## Hosted-checkout copy (when provider lands — copy ready now)
Button: «ادفع آمن — بطاقة أو Apple Pay»
Under it: «معالجة الدفع عبر {provider}. ما بنشوف ولا بنحفظ بيانات بطاقتك.»
Abandoned-cart (one message, day 1, email only): «طلبك محفوظ — باقتك انتظرك. إذا في أي سؤال بيمنعك، رد هون.» (no fake urgency; no discount push — 05 banned).

## Failed/edge replies (canned, also in doc 14)
- Amount mismatch: «التحويل وصل بس المبلغ ناقص {فرق} €. أكمل الفرق وبنفعّل فوراً، أو بترجعلك كامل — قرارك.»
- Unidentifiable transfer: «وصل تحويل ما قدرنا نربطه بطلب. ابعثلنا الاسم كما هو في التحويل واسم البنك — بنحلها بسرعة.»
- Refund: «تم الإرجاع {المبلغ} € لنفس الحساب. بيوصل خلال {3–5} أيام عمل حسب البنك. ملاحظتك سجلتها — هي اللي بتخلي التطبيق أحسن.» (refund = data point, not defeat; log reason in doc 19 metrics)
- Chargeback threat / angry: escalate to owner personally, apologize once, refund fast, log.
