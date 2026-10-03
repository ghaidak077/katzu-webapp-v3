import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The app's one class-name helper: `clsx` for conditional composition,
 * `tailwind-merge` so a caller's `className` can override a component's own
 * Tailwind class instead of fighting it.
 *
 * This lives in `lib/` rather than in a component. It used to be exported from
 * `components/ui/Button`, which meant every button, surface, sheet and effect in
 * the app had to import a utility from a button — a layering inversion that
 * also made the button the single point of failure for the whole UI. Re-exported
 * from the old path for one release; new code imports from here.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };