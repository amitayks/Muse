import type { ReactNode } from 'react';
import { MonitorPlay, Clapperboard } from 'lucide-react';
import type { TweetMedia } from '../types/draft';
import { isMediaTargeted, type MediaPlatform } from '../lib/mediaTargets';
import { PlatformTogglePill, XLogo, InstagramLogo, LinkedInLogo, type ProgressState } from './shared';
import { useTranslation } from '../i18n';

interface Props {
  media: TweetMedia;
  /** ALL platforms the user has connected — every one renders a pill (active or dimmed). */
  platforms: MediaPlatform[];
  /** Draft-level enabled platforms — a pill is highlighted only when its platform is a destination. */
  enabled: Partial<Record<MediaPlatform, boolean>>;
  onToggle: (platform: MediaPlatform, next: boolean) => void;
  disabled?: boolean;
  /**
   * Pre-upload ("warm") progress for THIS media item, per platform. A platform with a state gets a
   * progress ring around its icon; absent / undefined ⇒ no ring (the pill looks exactly as before).
   */
  progress?: Partial<Record<MediaPlatform, ProgressState>>;
}

const PLATFORM_META: Record<MediaPlatform, { icon: ReactNode; labelKey: string }> = {
  x: { icon: <XLogo size={16} />, labelKey: 'platform.x' },
  instagram_post: { icon: <InstagramLogo size={16} />, labelKey: 'platform.igPost' },
  instagram_story: { icon: <MonitorPlay size={16} />, labelKey: 'platform.igStory' },
  instagram_reel: { icon: <Clapperboard size={16} />, labelKey: 'platform.igReel' },
  linkedin: { icon: <LinkedInLogo size={16} />, labelKey: 'platform.linkedin' },
};

/**
 * A row of platform pills under one media item. EVERY connected platform is shown; a pill is
 * highlighted (active) when that platform is a draft destination AND this media is targeted to it.
 * Highlighting a dimmed pill makes the platform a destination (handled by the parent) and includes
 * this media; un-highlighting just removes this media from that platform. Nothing is hidden.
 */
export function MediaTargetRow({ media, platforms, enabled, onToggle, disabled, progress }: Props) {
  const { t } = useTranslation();
  if (platforms.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'var(--sp-xs)' }}>
      {platforms.map((p) => {
        const meta = PLATFORM_META[p];
        const active = !!enabled[p] && isMediaTargeted(media, p);
        return (
          <PlatformTogglePill
            key={p}
            label={t(meta.labelKey)}
            icon={meta.icon}
            active={active}
            disabled={disabled}
            onToggle={(next) => onToggle(p, next)}
            progressState={progress?.[p]}
          />
        );
      })}
    </div>
  );
}
