# Katzu — Screen audit, part 4: Account, paywall, trust and marketing

Part of the [screen audit index](SCREEN-AUDIT.md). Scope, severity key and status key are there.

## 12. Welcome, sign-in and paywall — ✅

### 12a. Welcome — `src/features/auth/WelcomeScreen.tsx`

**Purpose:** the front door. Optional display name, then sign-up, sign-in, or a no-account demo.

**What works**
- Name is optional and the copy says what happens when it is blank («متعلم»), and what is stored (name only, no email).
- The Google button is `type="button"`, so it does not submit the name form.
- Demo lesson without an account is offered.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **Five ways in on one screen** (name+start, demo, Google, sign-in link, sign-up link). The primary "ابدأ رحلتك الآن" always goes to *sign-up*, even for a returning user who types nothing. A returning learner who taps it is sent to create an account they already have. | `handleStart`, footer buttons |
| P1 | **Name write has no error handling.** `await db.users.update(...)` runs without try/catch inside an async submit handler. If IndexedDB fails (private mode, quota), the promise rejects, the sign-up step never opens, and nothing is shown. | `handleStart` |
| P2 | The Google button sends the learner to sign-in mode, but the name typed above is silently dropped. The button sits inside the same form as the name field. | form layout |
| P2 | The fine print ("نستخدم الاسم داخل المحادثة فقط، ولا بريد ولا بيانات شخصية") is good, but it appears under the field the user is about to fill, so it reads as a warning. | micro copy |
| P3 | Header badge mixes English ("Katzu AI") into an Arabic-only screen. | badge |
| P3 | Background uses `bg-black` and `text-text-primary` tokens while the paywall uses `kz-*` tokens. Two token systems on adjacent screens. | styling |

### 12b. Sign-in / sign-up — `src/features/auth/SignInScreen.tsx`

**Purpose:** Google sign-in for both modes, with a session exchange before any local state is written.

**What works**
- Exactly one visible sign-in choice at a time: Google's rendered button, or Katzu's fallback when Google refuses the origin (e.g. localhost). A 700 ms check decides which.
- The raw Google ID token is exchanged for a server session and is never stored in IndexedDB (a comment and code both confirm this).
- If the session exchange fails, sign-in stops with an honest message; no fallback token is stored.
- Subscription and progress/review-queue restore run after sign-in; failures are logged and do not block entry.
- The loading state uses `role="status"` and `aria-live`.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P0 | **A developer setup screen is shown to learners when `VITE_GOOGLE_CLIENT_ID` is missing.** It names the env var, the Cloudflare Pages dashboard and `.env`. It is a build-configuration failure, but the learner sees it. Acceptable on a dev build; a launch blocker if a production build can ship without the ID. | `!googleClientId` branch |
| P1 | **The "guest preview" button on that same screen cannot work.** It calls `completeUserAuth(..., 'preview_guest_token')`, which then calls `exchangeGoogleToken('preview_guest_token')`. That fails and shows the "تعذر تأمين جلسة الدخول" error. The button is a dead end that looks like a feature. | `Button onClick` in the missing-ID branch |
| P1 | **The fallback button gives no feedback when Google's One Tap prompt does not show.** `handleTriggerGooglePrompt` calls `accounts.id.prompt()` without a notification callback. Browsers that suppress One Tap (FedCM, dismissed prompts) show nothing, and the learner taps again with no message. | `handleTriggerGooglePrompt` |
| P1 | **Errors are not announced.** The error box (`errorMessage`) has no `role="alert"` or `aria-live`. The success box has none either. A screen-reader user taps Google, hears nothing, and does not learn that sign-in failed. | error and success boxes |
| P2 | **Sign-in and sign-up do the same thing for Google users.** An unknown Google account is created on first sign-in, so the mode switch changes copy and analytics only. A learner who picks the wrong tab is not told. | `mode` |
| P2 | **The failure copy is generic.** Every failure in the credential handler returns "فشل التحقق من تسجيل الدخول عبر Google، يرجى المحاولة ثانية", whether the cause is a network drop, a missing email, or a bad token. The retry has no hint about the cause. | `handleGoogleCredentialResponse` catch |
| P2 | **The footer promise is a security claim the code does not show.** "حسابك وبياناتك محمية ومشفرة" ("your account and data are protected and encrypted"). Confirm encryption-at-rest and in transit before launch, or soften the wording. | footer |
| P2 | The loading text is shown below the button, but the button is not disabled while loading on the fallback path (`isLoading` is passed, check that `GoogleSignInButton` disables it). | loading state |
| P3 | The `Lock` icon and the error headline are developer-style copy, not learner-style. | missing-ID branch |

### 12c. Paywall — `src/features/offers/PaywallScreen.tsx`

**Purpose:** choose a product. Exam Pass first, Monthly second, one-off mock as a link.

**What works**
- No price is invented: prices come from one `/pricing` source. If it fails, the screen shows no price and no buy button, and offers the free mock instead.
- No "unlimited" or "guaranteed pass" promises. Fair-use limits are written on the card.
- Payment steps are written for the region the server resolved, with a timing and caveat line.
- The redemption flow is reused and opens in place.
- Analytics fires on view and click, with the group and cell actually shown.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P0 | **The refund policy is not published.** While the refund line is the unpublished placeholder, the screen says so and points to a contact page. This is honest, but it means a learner is asked to buy with no refund terms. Launch blocker until the owner fills `REFUND_TEXT`. | `REFUND_UNPUBLISHED_AR`, `isOwnerFilled` |
| P1 | **The purchase instructions open below the card list, not beside the card tapped.** On a phone, a learner who taps the lower card may not see the panel appear. Nothing scrolls to it. | `overlay === 'purchase'` |
| P1 | **Buying happens off-app.** The steps say to buy the code on the official sales page and come back. The learner leaves, buys, and returns. A clear "I already bought it" path exists (`لديّ كود`), but the first CTA on the Exam Pass card is "فعّل بكود" ("activate with code"), which hides that the learner must buy first. | Exam Pass card CTA |
| P2 | **Cards disappear into a bare "loading" line.** While pricing loads, the product cards render their copy with no price and no button. A learner can read the offer but has nothing to tap until prices load. | `loaded` state |
| P2 | **Close goes to the trail, not back.** "إغلاق" always navigates to `/app/trail`, so a learner who opened the paywall from the mock results loses their place. | header close |
| P2 | **The refund question link is only shown when the policy is unpublished.** Once published, the policy text is shown inline with no link to the full terms. | refund card |
| P3 | Heading says "الاشتراك" (subscription) but one of the three options is a one-off mock, not a subscription. | title |

## 13. Empty, error and offline states

| Sev | Finding | Where |
|---|---|---|
| P1 | **"Reload the page" is the recovery in several places** (Trail no-content, Journey no-content, Demo content unavailable). A reload can fail offline and gives no feedback while it runs. Replace with a retry action that re-runs the load and shows progress. | Trail, Journey, Demo |
| P2 | **Auth gate shows "جاري التحقق من الحساب..." with `role="status"` and `aria-live`.** Good, but there is no timeout or offline message if the check hangs. | `AppShell` auth gate |
| P2 | **Sign-in errors are not announced** (see §12b). | sign-in |
| P2 | **Empty states are good where they exist** (Review, Practice, Study, Listening). The Trail path has none (§1). | multiple |
| P3 | **Offline status is shown on the Journey home** (§3). Other screens that need the network (Ask Katzu, Mock, Conversation) do not show an offline state before the request fails. | Ask, Mock, Conversation |

## 14. Trust pages — `src/features/settings/TrustInfoScreen.tsx` ✅

**What works**
- Trust text is generated from fields, and the owner-only parts are explicit `{{OWNER_FILL}}` placeholders. The strict launch check fails while any placeholder is left, so an unfinished legal page cannot ship silently.
- Back navigation is safe on a public page (no history dependency).

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P0 | **If the owner does not fill the placeholders before launch, visitors see the "يُكمل هذا البند قبل النشر" ("to be completed before publishing") text.** This is honest, but it is a launch blocker. Run `LAUNCH_STRICT=1 npm run check:launch` before release. | `OWNER_PENDING_AR` |
| P3 | The page shows an outstanding count to visitors only in code, not in the UI. Confirm the count is not shown. | `outstanding` |

## 15. Account deletion request — `src/features/settings/DeletionRequestScreen.tsx` ✅

**What works**
- Email is validated with an `role="alert"` message.
- Signed-out users get a pre-filled email draft. Nothing is sent from the page; the learner sends it themselves. That is the honest version.
- Failed deletion says so with a `role="alert"` and a support email for manual completion.
- On success, the local data is wiped as well as the server data, and the learner is sent to sign-in after 1.5 s.
- Back goes to the profile or home, never to history.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **Signed-in users are deleted on one tap, with no typed confirmation or second step.** The copy says "فوراً دون انتظار رد" (immediately, without waiting). Profile requires the typed phrase `أريد حذف حسابي`; this page does not. Add the same confirmation. | `handleRequest`, signed-in branch |
| P2 | **The signed-out path depends on a mail client.** `window.location.href = draftHref(...)` does nothing useful on a phone without a configured mail app. The fallback link exists, but a learner may tap twice and think it failed. | draft branch |
| P2 | **The success state is shown for 1.5 s before the redirect.** A learner who reads slowly may miss it. Keep it on screen until they tap. | `setTimeout` |
| P3 | The `busy` state does not disable the Back button, so a learner can leave mid-delete and not know whether it finished. | `busy` |

## 16. Demo lesson — `src/features/demo/DemoScreen.tsx` ⚠️ (loading and unavailable states read)

**What works**
- The unavailable state is honest: it says content must load once, and that the app will not show unreal content.
- Voice errors use `role="alert"`.
- The live caption shows the learner's own speech in German (`dir="ltr"`).
- The send button is disabled until the input has text.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **The retry is `window.location.reload()`.** Offline, the reload fails and the learner has no other action on this screen except the top bar. | L142 |
| P2 | **The loading line pulses with no timeout.** If the content never arrives, the learner waits on "جارٍ تحضير الدرس التجريبي…" forever. | loading state |
| P3 | The live caption uses `truncate`, so a long sentence shows only its start. | caption |

## 17. Subscription redemption — `src/features/auth/SubscriptionRedemptionScreen.tsx` ⚠️ (form, alerts and state read; 423 lines)

**What works**
- A redeem link pre-fills the code from the URL, so the learner is not asked to retype it.
- The submit button is disabled until a code is entered and shows a loading state.
- Errors are `role="alert"`; success is `aria-live="polite"`.
- Reduced motion is respected for the confetti (it was the one animation that ignored it before).
- When there is no code, the learner is offered the free mock and the paywall rather than a dead end.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **Several silent `catch` blocks** (L48, L61, L126, L155) hide errors. Verify each one shows the learner what to do when the code is genuinely wrong. | redeem flow |
| P2 | **The referral field is a second input on a screen whose main job is one code.** Verify whether it is clearly optional. | referral input |
| P3 | Two visual systems: `text-text-*` on this screen versus `kz-*` in the journey screens. | styling |

## 18. Landing page and video — `src/features/marketing/LandingScreen.tsx` ⚠️ (video block read, L245–269)

**What works**
- The hero video is only shown when the server really returns a `video/*` type. A missing file cannot show a broken player (the check is against the SPA fallback that returns HTML with a 200).
- The video has an Arabic `aria-label`.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **The `<track kind="captions" />` has no `src`.** It provides no captions, so it does not help deaf or hard-of-hearing visitors, and it may be flagged by an accessibility checker. Add a captions file or remove the track. | video element |
| P3 | `preload="none"` means a learner who taps play waits for the first byte. Acceptable; consider a poster image. | video |

## 19. Developer design system — `/dev/system` (`src/features/dev/DesignSystemScreen.tsx`)

- Registered only when the dev flag is on (`AppShell` L117–119, L303). A learner cannot reach it in a production build.
- **P3:** Confirm in the production build that the route is absent (not just hidden). Not verified in this pass.

