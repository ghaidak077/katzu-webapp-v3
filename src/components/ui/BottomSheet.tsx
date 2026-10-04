import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { useModalDialog } from '@/components/ui/useModalDialog';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // A CSS transition needs two rendered states to interpolate between, and
  // `isOpen` alone gives us one: `if (!isOpen) return null` means the sheet's
  // first painted frame is already its final position, so the transition class
  // below was inert. Mounting in the resting position and settling on the
  // next frame gives the sheet something to travel from. The rAF is cancelled
  // on teardown, so a fast re-open lands cleanly instead of restarting.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setMounted(false);
      return;
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Same dialog contract as `Modal`: the sheet is the only interactive surface
  // while open, so focus enters it, stays inside it, and returns on close.
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalDialog(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  return (
    <div
      data-mounted={mounted || undefined}
      className="kz-scrim fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-fast ease-out data-[mounted]:opacity-100 opacity-0"
    >
      <div className="fixed inset-0" onClick={onClose} />
      <GlassSurface
        tier="floating"
        className={cn(
          'relative w-full max-w-xl rounded-t-3xl p-6 z-10 max-h-[85vh] overflow-y-auto text-text-primary',
          // Rise from the bottom edge of the screen, not fade in place. `ease-out`
          // because this is an entrance: it must feel like it responded instantly.
          'transition-transform duration-panels ease-spring',
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
          className
        )}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-label={title ? undefined : 'نافذة سفلية'}
          tabIndex={-1}
        >
          <div className="w-12 h-1.5 bg-border-subtle rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle">
            {title ? <h3 id={titleId} className="text-lg font-bold font-arabic">{title}</h3> : <div />}
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="p-1.5 min-h-touch min-w-touch flex items-center justify-center rounded-full pointer-hover:bg-surface-highest text-text-secondary pointer-hover:text-text-primary transition-colors duration-fast ease-out"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      </GlassSurface>
    </div>
  );
};
