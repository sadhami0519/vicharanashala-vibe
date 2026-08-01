/**
 * StudentProfileModal — drill-in modal that opens when a student
 * taps another student's row in the leaderboard. Shows:
 *
 *   - Header: student name + course context + opt-out status
 *   - Hero stats: retention (30d), coverage, avg EF (the new
 *     SM-2 Easiness Factor proxy — never visible elsewhere in
 *     the motivation UI; this modal is the only place it's shown)
 *   - BadgeGrid: full 12-badge progress arc for the student
 *   - Loading + empty + error states (fail-open, never crash)
 *
 * Behaviour:
 *   - Mounted via `<StudentProfileModal studentId courseId onClose />`.
 *   - Uses Radix Dialog for focus trap + Escape key + body scroll
 *     lock. Reuses the same shadcn/ui `Dialog` primitives as the
 *     other motivation modals.
 *   - Calls `getStudentProfile(studentId, courseId)` directly via
 *     `useQuery` (no separate hook — the surface area is small
 *     enough that wrapping it adds noise without benefit). When
 *     the future live backend endpoint ships, the mock branch
 *     in `getStudentProfile` flips off and this modal automatically
 *     talks to the real endpoint.
 *
 * Fail-open semantics:
 *   - Unknown studentId: empty profile returned, modal renders
 *     the empty-state badge grid (no crash).
 *   - Network error on live endpoint: a small "Couldn't load"
 *     notice renders above the grid; the modal still closes
 *     cleanly via Escape or backdrop click.
 *   - Live endpoint not yet implemented (currently the case):
 *     the mock branch handles the request — no error UI shown.
 */

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Award, Activity, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { BadgeGrid } from './BadgeGrid';
import { getStudentProfile } from '@/lib/motivation-api';

export interface StudentProfileModalProps {
  /** The cohort student's Firebase UID. */
  studentId: string | null;
  /** The leaderboard's course context, so the header can show
   *  e.g. "European Capitals". */
  courseId: string | null;
  /** Controlled close handler. */
  onClose: () => void;
}

export function StudentProfileModal({
  studentId,
  courseId,
  onClose,
}: StudentProfileModalProps) {
  // Open only when both ids are present; `enabled: false` short-circuits
  // the network call so the modal doesn't show a "loading" flash when
  // it's just not visible.
  const query = useQuery({
    queryKey: ['student-profile', studentId, courseId],
    queryFn: () => getStudentProfile(studentId!, courseId!),
    enabled: !!studentId && !!courseId,
    staleTime: 30_000,
    retry: 1,
  });

  const open = !!studentId && !!courseId;
  const profile = query.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className="max-w-2xl w-[min(640px,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto p-0"
        aria-describedby="student-profile-description"
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold truncate">
                {profile?.studentName ?? 'Student profile'}
              </DialogTitle>
              <DialogDescription
                id="student-profile-description"
                className="text-xs text-muted-foreground mt-0.5"
              >
                Course: <span className="font-mono">{courseId ?? '—'}</span>
                {profile?.isOptedOut && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    opted out
                  </span>
                )}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 -mr-1 -mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close profile"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Hero stats row */}
          <section className="grid grid-cols-3 gap-3">
            <StatTile
              icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Retention 30d"
              value={
                profile?.retention30d != null
                  ? `${profile.retention30d}%`
                  : '—'
              }
              isLoading={query.isLoading}
            />
            <StatTile
              icon={<Award className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Coverage"
              value={
                profile?.coverage != null
                  ? `${profile.coverage}%`
                  : '—'
              }
              isLoading={query.isLoading}
            />
            <StatTile
              icon={<Activity className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Avg EF (30d)"
              value={
                profile?.avgEf != null ? profile.avgEf.toFixed(2) : '—'
              }
              isLoading={query.isLoading}
              subtitle="SM-2 Easiness Factor"
            />
          </section>

          {/* Network error notice (fail-open: modal still usable) */}
          {query.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Couldn't load live profile data. Showing whatever we have.
            </div>
          )}

          {/* Badge grid — the main attraction */}
          <section>
            <h3 className="text-sm font-semibold mb-2 text-foreground">
              Badges
            </h3>
            <BadgeGrid
              badges={profile?.badges ?? []}
              isLoading={query.isLoading}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLoading?: boolean;
  /** Optional sub-label, e.g. "SM-2 Easiness Factor". */
  subtitle?: string;
}

function StatTile({ icon, label, value, isLoading, subtitle }: StatTileProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {isLoading ? (
          <span className="inline-block h-5 w-12 rounded bg-muted animate-pulse" />
        ) : (
          value
        )}
      </div>
      {subtitle && (
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {subtitle}
        </div>
      )}
    </div>
  );
}