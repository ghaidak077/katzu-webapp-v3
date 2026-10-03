import React from 'react';
import { cn } from '@/lib/cn';

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
            // `scaleY` from the bottom edge, not `height`: this bar animates on
            // a timer while audio plays, so an animated `height` was forcing
            // layout on every frame of the most performance-sensitive screen in
            // the app. `h-1.5` gives the bar its physical size; the transform
            // only changes how much of it is showing.
            'w-1 h-full bg-primary rounded-full origin-bottom transition-transform duration-fast',
            isPlaying
              ? 'animate-pulse'
              : 'opacity-40'
          )}
          style={{
            transform: isPlaying ? `scaleY(${Math.max(0.25, (((i + 1) * 20) % 100) / 100)})` : 'scaleY(0.3)',
            animationDelay: `${i * 120}ms`,
            animationDuration: '600ms',
          }}
        />
      ))}
    </div>
  );
};
