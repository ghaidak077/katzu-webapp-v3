import React from 'react';
import { cn } from '../ui/Button';

export interface AudioWaveformProps {
  isPlaying: boolean;
  className?: string;
  bars?: number;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isPlaying,
  className,
  bars = 5,
}) => {
  return (
    <div className={cn('flex items-center gap-1 h-5 px-1', className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'w-1 bg-primary rounded-full transition-all duration-300',
            isPlaying
              ? 'animate-pulse'
              : 'h-1.5 opacity-40'
          )}
          style={{
            height: isPlaying ? `${Math.max(25, (i + 1) * 20 % 100)}%` : '6px',
            animationDelay: `${i * 120}ms`,
            animationDuration: '600ms',
          }}
        />
      ))}
    </div>
  );
};
