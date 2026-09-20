import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from './Button';

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm transition-opacity">
      <div className="fixed inset-0" onClick={onClose} />
      <div
        className={cn(
          'relative w-full max-w-xl bg-surface-raised border-t border-border-subtle rounded-t-3xl p-6 shadow-2xl z-10 max-h-[85vh] overflow-y-auto transform transition-transform animate-slide-up text-text-primary',
          className
        )}
      >
        <div className="w-12 h-1.5 bg-border-subtle rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle">
          {title ? <h3 className="text-lg font-bold font-arabic">{title}</h3> : <div />}
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-highest text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
