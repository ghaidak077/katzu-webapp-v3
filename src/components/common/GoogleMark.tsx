import React from 'react';

/**
 * Google's official brand palette, as published for the "G" mark.
 *
 * These are NOT design tokens. A third-party logo must never be recoloured to
 * match our theme, so these four values are the one reviewed exemption to the
 * drift audit — the reason lives here, next to the values, rather than in an
 * ignore-list inside the audit script.
 */
const G_BLUE = '#4285F4'; // design-audit: allow — official Google brand blue
const G_GREEN = '#34A853'; // design-audit: allow — official Google brand green
const G_YELLOW = '#FBBC05'; // design-audit: allow — official Google brand yellow
const G_RED = '#EA4335'; // design-audit: allow — official Google brand red

/**
 * The official Google "G" mark.
 *
 * This SVG was duplicated byte-for-byte in SignInScreen and WelcomeScreen, so
 * the official brand colours were declared twice — the exact thing the design
 * system exists to prevent. It now has one home.
 *
 * `aria-hidden` because every caller already renders a visible Arabic label
 * beside it — the mark is decorative, and announcing "Google" in addition to
 * "المتابعة باستخدام Google" would be a duplicate.
 */
export const GoogleMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden focusable="false">
    <path
      fill={G_BLUE}
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill={G_GREEN}
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill={G_YELLOW}
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill={G_RED}
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

/**
 * "Continue with Google" — the app's one Google sign-in control.
 *
 * Both auth screens were assembling this button with slightly different padding,
 * gap and border treatments. As one component the control is identical in both
 * places, and its geometry is measured rather than eyeballed.
 *
 * The white fill is Google's own button spec (white surface, dark label) and is
 * kept verbatim: recolouring it would make it a different, unofficial control.
 */
export const GoogleSignInButton: React.FC<{
  onClick: () => void;
  isLoading?: boolean;
  label?: string;
  className?: string;
}> = ({ onClick, isLoading, label, className }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={isLoading}
    aria-busy={isLoading || undefined}
    className={
      'w-full min-h-control flex items-center justify-center gap-3 rounded-control bg-white text-black ' +
      'font-bold shadow-md transition-colors duration-fast ease-out pointer-hover:bg-neutral-200 ' +
      'disabled:opacity-60 disabled:pointer-events-none ' +
      (className ?? '')
    }
  >
    <GoogleMark className="w-5 h-5 flex-shrink-0" />
    <span className="font-arabic text-body">{label ?? 'المتابعة باستخدام Google'}</span>
  </button>
);