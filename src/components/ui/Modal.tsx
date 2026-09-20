import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from './Button';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative w-full max-w-lg bg-surface-card border border-border-subtle rounded-3xl p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto text-text-primary',
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
      </div>
    </div>
  );
};
