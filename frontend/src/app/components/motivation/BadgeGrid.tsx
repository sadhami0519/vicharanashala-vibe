/**
 * BadgeGrid — renders the 12 court-rank badges as a 3-column grid.
 *
 * Earned badges are full colour. Locked badges are greyed out but
 * still show the criteria (clicking a locked badge opens the
 * detail panel with progress toward earning it).
 *
 * Uses the badge catalogue from `BADGE_CATALOGUE` to fill in any
 * missing IDs in the response, so the grid always shows all 12.
 */

import { cn } from '@/utils/utils';
import {
  getBadgesByTier,
} from '@/lib/motivation-api';
import {
  Badge,
  BadgeProgress,
  BadgeTier,
} from '@/types/motivation.types';

export interface BadgeGridProps {
  /** Progress per badge, returned by the API. */
  badges: BadgeProgress[];
  isLoading?: boolean;
}

export function BadgeGrid({
  badges,
  isLoading = false,
}: BadgeGridProps): React.JSX.Element {
  // Build a lookup so we can merge API progress with the catalogue.
  const progressById = new Map<string, BadgeProgress>();
  for (const p of badges) progressById.set(p.badge.id, p);

  if (isLoading) {
    return <BadgeGridSkeleton />;
  }

  const tiers = getBadgesByTier();

  return (
    <section aria-label="Badges">
      <h3 className="text-base font-semibold mb-3">Badges</h3>
      <div className="space-y-4">
        {(['entry', 'apprentice', 'courtier', 'royalty'] as const).map(
          (tier) => {
            const tierBadges = tiers[tier];
            if (tierBadges.length === 0) return null;
            return (
              <div key={tier}>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  {TIER_LABEL[tier]}
                </p>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {tierBadges.map((badge) => {
                    const progress = progressById.get(badge.id);
                    return (
                      <BadgeCard
                        key={badge.id}
                        badge={badge}
                        progress={progress}
                      />
                    );
                  })}
                </div>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}

// ── Tier label ─────────────────────────────────────────────────────────────

const TIER_LABEL: Record<BadgeTier, string> = {
  entry: 'Tier 1 — Entry',
  apprentice: 'Tier 2 — Apprentice',
  courtier: 'Tier 3 — Courtier',
  royalty: 'Tier 4 — Royalty',
};

// ── Single badge card ──────────────────────────────────────────────────────

interface BadgeCardProps {
  badge: Badge;
  /** If undefined, treat as locked with 0/0 progress. */
  progress?: BadgeProgress;
}

function BadgeCard({ badge, progress }: BadgeCardProps): React.JSX.Element {
  const earned = progress?.earned ?? false;
  const current = progress?.progress.current ?? 0;
  const target = progress?.progress.target ?? 0;
  const pct =
    target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        'p-3 rounded-lg border',
        earned
          ? 'border-[#FFA500] bg-gradient-to-br from-[#FFD700]/10 to-[#FFA500]/10'
          : 'border-border bg-muted/30 grayscale opacity-70',
        'hover:opacity-100 hover:grayscale-0 transition-all duration-200',
      )}
      role="button"
      tabIndex={0}
      aria-label={`${badge.name} — ${earned ? 'earned' : 'locked'}. ${badge.criteria}`}
    >
      <span className="text-3xl mb-1" aria-hidden="true">
        {badge.emoji}
      </span>
      <span
        className={cn(
          'text-xs font-medium',
          earned ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {badge.name}
      </span>
      {!earned && target > 0 && (
        <div className="w-full mt-2">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FFA500] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {current} / {target}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function BadgeGridSkeleton(): React.JSX.Element {
  return (
    <section aria-label="Badges" aria-busy="true">
      <h3 className="text-base font-semibold mb-3">Badges</h3>
      <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-border bg-muted/30 animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}