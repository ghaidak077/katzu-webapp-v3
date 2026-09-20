import React from 'react';
import { cn } from '../ui/Button';

export type MascotSticker =
  | 'welcome'
  | 'avatar'
  | 'badge'
  | 'barista'
  | 'celebrating'
  | 'listening'
  | 'peace'
  | 'practice'
  | 'profile_card'
  | 'progress_mascot'
  | 'scenario_host'
  | 'settings_mascot'
  | 'thumbs_up'
  | 'trail_guide'
  | 'trail_header'
  | 'word_insight';

export interface KatzuMascotProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  name: MascotSticker;
  glow?: boolean;
}

const stickerMap: Record<MascotSticker, string> = {
  welcome: '/assets/mascot/katzu_welcome.png',
  avatar: '/assets/mascot/katzu_avatar.png',
  badge: '/assets/mascot/katzu_badge.png',
  barista: '/assets/mascot/katzu_barista.png',
  celebrating: '/assets/mascot/katzu_celebrating.png',
  listening: '/assets/mascot/katzu_listening.png',
  peace: '/assets/mascot/katzu_peace.png',
  practice: '/assets/mascot/katzu_practice.png',
  profile_card: '/assets/mascot/katzu_profile_card.png',
  progress_mascot: '/assets/mascot/katzu_progress_mascot.png',
  scenario_host: '/assets/mascot/katzu_scenario_host.png',
  settings_mascot: '/assets/mascot/katzu_settings_mascot.png',
  thumbs_up: '/assets/mascot/katzu_thumbs_up.png',
  trail_guide: '/assets/mascot/katzu_trail_guide.png',
  trail_header: '/assets/mascot/katzu_trail_header.png',
  word_insight: '/assets/mascot/katzu_word_insight.png',
};

export const KatzuMascot: React.FC<KatzuMascotProps> = ({
  name,
  glow = false,
  className,
  alt = 'Katzu Cat',
  ...props
}) => {
  return (
    <img
      src={stickerMap[name] || stickerMap.avatar}
      alt={alt}
      className={cn(
        'object-contain select-none transition-transform pointer-events-none',
        glow && 'filter drop-shadow-[0_0_20px_rgba(139,111,232,0.45)]',
        className
      )}
      loading="lazy"
      {...props}
    />
  );
};
