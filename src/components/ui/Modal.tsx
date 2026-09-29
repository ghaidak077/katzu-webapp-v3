import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from './Button';
import { GlassSurface } from '@/components/glass/GlassSurface';

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

  if (!isOpen) return null;

  // V20: the scrim's blur honours the renderer tier — on a reduced device the
  // dim alone separates the dialog (a full-screen blur is the single most
  // expensive backdrop on the screen, and it sits BEHIND content the learner
  // is reading). `.kz-scrim` drops its blur under .kz-lite.
  return (
    <div className="kz-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <GlassSurface
        tier="floating"
        className={cn(
          'relative w-full max-w-lg rounded-3xl p-6 z-10 max-h-[90vh] overflow-y-auto text-text-primary',
          className
        )}
      >
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle mb-4">
          {title ? (
            <h3 className="text-lg font-bold font-arabic text-text-primary">{title}</h3>
          ) : <div />}
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-subtle text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </GlassSurface>
    </div>
  );
};
