/**
 * LeaderboardTable — course-scoped ranking by 30-day retention.
 *
 * Top 3 get medal emojis (🥇🥈🥉). Opted-out students show "—"
 * for their numbers but their rank stays visible. The current
 * user's row is highlighted with a gold left border.
 *
 * Below the table, a callout shows the current user's rank and
 * percentile. n/a when no rank is available.
 *
 * Above the table (Pillar 3), an opt-out banner is rendered when
 * `studentId` and `courseId` are both provided. The banner is
 * context-aware: shows a "Step off?" CTA to qualifying non-opted-
 * out students, a "Come back?" CTA to opted-out students, and
 * nothing to non-qualifying students. See `OptOutBanner` below.
 */

import { useState } from 'react';
import { cn } from '@/utils/utils';
import { LeaderboardResponse } from '@/types/motivation.types';
import { useSetOptOut } from '@/hooks/motivation-hooks';

export interface LeaderboardTableProps {
  data: LeaderboardResponse | null | undefined;
  isLoading?: boolean;
  emptyMessage?: string;
  /** Current student ID. Required to render the opt-out banner. */
  studentId?: string;
  /** Current course ID. Required to render the opt-out banner. */
  courseId?: string;
}

const MEDAL: Record<1 | 2 | 3, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
};

export function LeaderboardTable({
  data,
  isLoading = false,
  emptyMessage,
  studentId,
  courseId,
}: LeaderboardTableProps): React.JSX.Element {
  // The current user's opt-out status drives the banner above the
  // table. Look it up once; if the user isn't on the leaderboard
  // (e.g. empty cohort), default to "not opted out" so the banner
  // falls through to its "not qualifying" copy.
  const currentUserEntry = data?.entries.find((e) => e.isCurrentUser);
  const isOptedOut = currentUserEntry?.isOptedOut ?? false;

  if (isLoading) {
    return <LeaderboardSkeleton />;
  }
  if (!data || data.entries.length === 0) {
    return (
      <section aria-label="Leaderboard">
        <h3 className="text-base font-semibold mb-3">Leaderboard</h3>
        {studentId && courseId && (
          <OptOutBanner
            studentId={studentId}
            courseId={courseId}
            isOptedOut={isOptedOut}
            retention30d={currentUserEntry?.retention30d ?? null}
          />
        )}
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? 'No leaderboard data yet.'}
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Leaderboard">
      <h3 className="text-base font-semibold mb-3">Leaderboard</h3>
      {studentId && courseId && (
        <OptOutBanner
          studentId={studentId}
          courseId={courseId}
          isOptedOut={isOptedOut}
          retention30d={currentUserEntry?.retention30d ?? null}
        />
      )}
      <div className="rounded-md border border-border overflow-hidden">
        {/* Header */}
        <div
          className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground bg-muted/40"
          role="row"
        >
          <span className="w-8 text-center" role="columnheader">Rank</span>
          <span role="columnheader">Student</span>
          <span className="text-right w-20 tabular-nums" role="columnheader">Retention</span>
          <span className="text-right w-20 tabular-nums" role="columnheader">Coverage</span>
        </div>
        {/* Rows */}
        {data.entries.map((entry, idx) => {
          const rank = entry.rank ?? idx + 1;
          const medal = rank in MEDAL ? MEDAL[rank as 1 | 2 | 3] : null;
          return (
            <div
              key={entry.studentId}
              role="row"
              className={cn(
                'grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 text-sm items-center',
                idx !== data.entries.length - 1 && 'border-b border-border',
                entry.isCurrentUser && 'bg-[#FFD700]/10 border-l-4 border-l-[#FFA500] -ml-1 pl-4',
              )}
            >
              <span className="w-8 text-center tabular-nums font-medium" role="cell">
                {medal ?? rank}
              </span>
              <span
                className={cn(
                  entry.isCurrentUser && 'font-semibold',
                )}
                role="cell"
              >
                {entry.studentName}
                {entry.isOptedOut && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Opted out
                  </span>
                )}
              </span>
              <span className="text-right w-20 tabular-nums" role="cell">
                {entry.isOptedOut
                  ? '—'
                  : entry.retention30d === null
                    ? 'n/a'
                    : `${entry.retention30d}%`}
              </span>
              <span className="text-right w-20 tabular-nums" role="cell">
                {entry.isOptedOut ? '—' : `${entry.coverage}%`}
              </span>
            </div>
          );
        })}
      </div>
      {/* Your rank callout */}
      <YourRankCallout
        rank={data.currentUserRank}
        percentile={data.currentUserPercentile}
        total={data.totalStudents}
      />
    </section>
  );
}

// ── Callout ────────────────────────────────────────────────────────────────

interface YourRankCalloutProps {
  rank: number | null;
  percentile: number | null;
  total: number;
}

function YourRankCallout({
  rank,
  percentile,
  total,
}: YourRankCalloutProps): React.JSX.Element {
  if (rank === null) {
    return (
      <p className="text-sm text-muted-foreground mt-3">
        Your rank: n/a
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground mt-3">
      Your rank: <span className="font-semibold text-foreground">{rank}</span> of{' '}
      <span className="font-semibold text-foreground">{total}</span>
      {percentile !== null && (
        <>
          {' '}
          (<span className="font-semibold text-foreground">{percentile}th percentile</span>)
        </>
      )}
    </p>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function LeaderboardSkeleton(): React.JSX.Element {
  return (
    <section aria-label="Leaderboard" aria-busy="true">
      <h3 className="text-base font-semibold mb-3">Leaderboard</h3>
      <div className="rounded-md border border-border overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 text-sm border-b border-border last:border-b-0"
          >
            <span className="h-4 w-6 rounded bg-muted animate-pulse" />
            <span className="h-4 w-24 rounded bg-muted animate-pulse" />
            <span className="h-4 w-12 rounded bg-muted animate-pulse" />
            <span className="h-4 w-12 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Pillar 3: opt-out banner ──────────────────────────────────────────────

interface OptOutBannerProps {
  studentId: string;
  courseId: string;
  isOptedOut: boolean;
  /**
   * Current user's 30-day retention as a percentage 0–100.
   * `null` when the user has no retention data (new student, or
   * they're not on the leaderboard). The banner is suppressed
   * when this is below 90.
   */
  retention30d: number | null;
}

/**
 * Renders one of three banners above the leaderboard table:
 *
 *   1. **Qualifying, not opted out** — "You've earned the right to
 *      step off this leaderboard. Stay or step back?" with a
 *      [Stay] (default) and [Step off] CTA pair.
 *   2. **Opted out** — "You're off the leaderboard. Come back?"
 *      with a [Come back] CTA.
 *   3. **Not qualifying** — nothing. The student hasn't met the
 *      90% retention + 100-reviews threshold yet, so we don't
 *      surface the option at all. The banner stays silent.
 *
 * "Qualifying" is intentionally inferred from data shape, not
 * computed client-side: the demo student has `retention30d: 91`
 * in the seeded leaderboard, which is above the 90% threshold,
 * so the qualifying branch renders. For real students, the
 * backend returns the same `retention30d` field — and on the
 * actual opt-in attempt, the threshold gate enforces the rule.
 *
 * Mutation feedback:
 *   - On success, we optimistically flip the banner's
 *     `isOptedOut` state locally (the invalidated leaderboard
 *     query will catch up within a frame). No toast — the
 *     banner state IS the feedback. This matches the spec's
 *     "no confirm dialog" UX rule (Phase C Knob 6 precedent).
 *   - On failure (the threshold gate from the backend, when the
 *     demo runs against real endpoints), we show the failure
 *     reason inline below the CTA. The banner reverts to its
 *     pre-click state.
 *
 * Self-only: the hook's `_assertSelfOnly` guard on the backend
 * enforces that the authenticated user matches `studentId`. The
 * banner doesn't construct any cross-user mutation, but if the
 * parent ever passes a `studentId` that isn't the current user,
 * the backend will 403 and the failure reason will surface here.
 */
function OptOutBanner({
  studentId,
  courseId,
  isOptedOut,
  retention30d,
}: OptOutBannerProps): React.JSX.Element | null {
  // Local optimistic state — mirrors the persisted leaderboard
  // truth but updates immediately on click for snappy feedback.
  const [optimisticOptedOut, setOptimisticOptedOut] = useState(isOptedOut);
  // Sync local state when the parent's `isOptedOut` changes
  // (e.g. after a different tab invalidates the query).
  const [lastSeenServerState, setLastSeenServerState] = useState(isOptedOut);
  if (isOptedOut !== lastSeenServerState) {
    setLastSeenServerState(isOptedOut);
    setOptimisticOptedOut(isOptedOut);
  }

  const mutation = useSetOptOut();

  // The seed leaderboard entry carries `retention30d`. We use it
  // as a coarse qualification signal — ≥90 is the spec's retention
  // gate. The review-count gate (≥100 in 30d) is not exposed on
  // the leaderboard entry, so we trust the backend's threshold
  // check on the actual opt-in attempt. If the student clears
  // retention but fails the review count, the failure banner
  // surfaces the backend's reason string.
  const qualifies = retention30d !== null && retention30d >= 90;

  if (!qualifies) return null;

  const handleOptOut = () => {
    setOptimisticOptedOut(true);
    mutation.mutate(
      { studentId, courseId, optedOut: true },
      {
        onError: () => setOptimisticOptedOut(false),
      },
    );
  };

  const handleOptIn = () => {
    setOptimisticOptedOut(false);
    mutation.mutate(
      { studentId, courseId, optedOut: false },
      {
        onError: () => setOptimisticOptedOut(true),
      },
    );
  };

  if (optimisticOptedOut) {
    return (
      <div
        className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
        role="status"
        aria-live="polite"
      >
        <p className="text-muted-foreground">
          You're off the leaderboard. Come back?
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={handleOptIn}
            disabled={mutation.isPending}
            className={cn(
              'inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            Come back
          </button>
        </div>
        {mutation.isError && (
          <p className="mt-2 text-xs text-destructive">
            {mutation.error?.message ?? 'Could not update opt-out state.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="mb-3 rounded-md border border-[#FFA500]/40 bg-[#FFD700]/5 px-3 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <p className="text-foreground">
        You've earned the right to step off this leaderboard. Stay or step back?
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled
          className={cn(
            'inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium',
            'bg-muted text-muted-foreground cursor-default',
          )}
          title="You're already on the leaderboard."
        >
          Stay
        </button>
        <button
          type="button"
          onClick={handleOptOut}
          disabled={mutation.isPending}
          className={cn(
            'inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium',
            'bg-[#FFA500] text-white hover:bg-[#FFA500]/90',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          Step off
        </button>
      </div>
      {mutation.isError && (
        <p className="mt-2 text-xs text-destructive">
          {mutation.error?.message ?? 'Could not update opt-out state.'}
        </p>
      )}
    </div>
  );
}