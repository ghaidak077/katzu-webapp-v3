import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { useModalDialog } from '@/components/ui/useModalDialog';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
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

  // Same reason as BottomSheet: one rendered state cannot animate. A modal is
  // centred, so it fades and grows rather than sliding — and it grows from 95%,
  // never from 0, because nothing in the real world appears from nothing.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setMounted(false);
      return;
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Real dialog semantics: focus in, Tab trapped, Escape to close, focus back to
  // the trigger. Called before the early return so hook order never changes.
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalDialog(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  // V20: the scrim's blur honours the renderer tier — on a reduced device the
  // dim alone separates the dialog (a full-screen blur is the single most
  // expensive backdrop on the screen, and it sits BEHIND content the learner
  // is reading). `.kz-scrim` drops its blur under .kz-lite.
  return (
    <div
      data-mounted={mounted || undefined}
      className="kz-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity duration-fast ease-out data-[mounted]:opacity-100 opacity-0"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <GlassSurface
        tier="floating"
        className={cn(
          'relative w-full max-w-lg rounded-3xl p-6 z-10 max-h-[90vh] overflow-y-auto text-text-primary',
          'transition-[opacity,transform] duration-panels ease-spring',
          mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
          className
        )}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-label={title ? undefined : 'نافذة حوار'}
          tabIndex={-1}
        >
          <div className="flex items-center justify-between pb-4 border-b border-border-subtle mb-4">
            {title ? (
              <h3 id={titleId} className="text-lg font-bold font-arabic text-text-primary">{title}</h3>
            ) : <div />}
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="p-1.5 min-h-touch min-w-touch flex items-center justify-center rounded-full pointer-hover:bg-surface-subtle text-text-secondary pointer-hover:text-text-primary transition-colors duration-fast ease-out"
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
