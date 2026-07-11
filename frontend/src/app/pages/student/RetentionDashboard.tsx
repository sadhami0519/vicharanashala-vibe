'use client';

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Brain,
  Sparkles,
  TrendingUp,
  Calendar,
  BellOff,
  Bell,
  ChevronRight,
  BookOpen,
  Inbox,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import {
  useGetSchedule,
  useGetCourseRetention,
  useUpdateNotificationPreference,
} from '@/hooks/spaced-repetition-hooks';
import { ReviewItem } from '@/types/spaced-repetition.types';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Map a raw EF (typically 1.3–3.0) to a 0–100 retention health %.
 * EF 1.3 → 0, EF 3.0 → 100, clamped. Linear mapping for simplicity.
 */
function efToRetentionPercent(ef: number): number {
  const clamped = Math.max(1.3, Math.min(3.0, ef));
  return Math.round(((clamped - 1.3) / (3.0 - 1.3)) * 100);
}

function retentionBand(percent: number): {
  label: string;
  chipClass: string;
} {
  if (percent >= 75) {
    return { label: 'Strong', chipClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }
  if (percent >= 50) {
    return { label: 'Steady', chipClass: 'bg-amber-100 text-amber-700 border-amber-200' };
  }
  return { label: 'Needs work', chipClass: 'bg-rose-100 text-rose-700 border-rose-200' };
}

function isOverdue(item: ReviewItem): boolean {
  return new Date(item.next_review_at).getTime() < Date.now();
}

function formatDue(item: ReviewItem): string {
  const t = new Date(item.next_review_at).getTime();
  const ms = t - Date.now();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (ms < 0) {
    const overdueDays = Math.abs(days);
    return overdueDays === 0
      ? 'Due today'
      : `Overdue ${overdueDays}d`;
  }
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Friendly course name lookup. In production this would resolve through a
// course catalog; the dashboard renders the raw id when no label is known.
const COURSE_LABELS: Record<string, string> = {
  'mock-course-1': 'Algebra Foundations',
  'mock-course-2': 'World History 101',
};

function courseLabel(courseId: string): string {
  return COURSE_LABELS[courseId] ?? courseId;
}

// ── Per-course retention card ─────────────────────────────────────────────

function CourseRetentionCard({
  studentId,
  courseId,
}: {
  studentId: string;
  courseId: string;
}) {
  const { data, isLoading } = useGetCourseRetention(studentId, courseId);
  const updatePref = useUpdateNotificationPreference(studentId);

  function handleOptOutChange(checked: boolean) {
    updatePref.mutate(
      { courseId, optOut: checked },
      {
        onSuccess: res => {
          toast.success(
            checked
              ? `Muted review reminders for ${courseLabel(courseId)} (${res.updatedCount} cards)`
              : `Unmuted review reminders for ${courseLabel(courseId)}`,
          );
        },
        onError: err => {
          toast.error(
            err instanceof Error
              ? `Couldn't update preference: ${err.message}`
              : "Couldn't update preference.",
          );
        },
      },
    );
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-4 w-2/5 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  const retentionPercent = efToRetentionPercent(data.averageEF);
  const band = retentionBand(retentionPercent);
  const optedOut = data.items.some(i => i.notification_opt_out);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {courseLabel(data.courseId)}
            </CardTitle>
            <CardDescription className="text-xs">
              {data.totalItems} card{data.totalItems === 1 ? '' : 's'} tracked
            </CardDescription>
          </div>
          <Badge variant="outline" className={band.chipClass}>
            {band.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Counts row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border bg-rose-50/50 border-rose-200/60 p-2">
            <div className="text-lg font-semibold text-rose-700">
              {data.overdueCount}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Due now
            </div>
          </div>
          <div className="rounded-md border bg-amber-50/50 border-amber-200/60 p-2">
            <div className="text-lg font-semibold text-amber-700">
              {data.dueSoonCount}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Due ≤ 7d
            </div>
          </div>
          <div className="rounded-md border bg-emerald-50/50 border-emerald-200/60 p-2">
            <div className="text-lg font-semibold text-emerald-700">
              {retentionPercent}%
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Retention
            </div>
          </div>
        </div>

        {/* Retention bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Retention health</span>
            <span>avg EF {data.averageEF.toFixed(2)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${
                retentionPercent >= 75
                  ? 'bg-emerald-500'
                  : retentionPercent >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${retentionPercent}%` }}
            />
          </div>
        </div>

        {/* Opt-out toggle */}
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            {optedOut ? (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Bell className="h-4 w-4 text-muted-foreground" />
            )}
            <span>Review reminders</span>
          </div>
          <Switch
            checked={!optedOut}
            onCheckedChange={checked => handleOptOutChange(!checked)}
            disabled={updatePref.isPending}
            aria-label={
              optedOut
                ? `Re-enable review reminders for ${courseLabel(data.courseId)}`
                : `Mute review reminders for ${courseLabel(data.courseId)}`
            }
          />
        </div>

        {/* CTA — only show if there are due-now cards */}
        {data.overdueCount > 0 && (
          <Link
            to="/student/review"
            aria-label={`Start review session for ${courseLabel(data.courseId)} (${data.overdueCount} due now)`}
            className="flex items-center justify-between text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Start review for this course
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ── Schedule row ──────────────────────────────────────────────────────────

function ScheduleRow({ item }: { item: ReviewItem }) {
  const overdue = isOverdue(item);
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`h-2 w-2 shrink-0 rounded-full ${
            overdue ? 'bg-rose-500' : 'bg-emerald-500'
          }`}
        />
        <div className="min-w-0">
          <div className="font-medium truncate">
            {courseLabel(item.course_id)}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Q {item.question_id} • EF {item.EF.toFixed(2)} • last reviewed{' '}
            {formatDate(item.last_reviewed_at)}
          </div>
        </div>
      </div>
      <div
        className={`text-xs font-medium whitespace-nowrap ${
          overdue ? 'text-rose-600' : 'text-muted-foreground'
        }`}
      >
        {formatDue(item)}
      </div>
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────

export default function RetentionDashboard() {
  const { user } = useAuthStore();
  const studentId = user?.uid ?? '';

  const { data: schedule, isLoading: isScheduleLoading } =
    useGetSchedule(studentId);

  // Distinct courseIds from the schedule.
  const courseIds = useMemo(() => {
    if (!schedule) return [] as string[];
    return Array.from(new Set(schedule.map(i => i.course_id))).sort();
  }, [schedule]);

  // Top-level due-now count (cross-course).
  const dueNowCount = useMemo(() => {
    if (!schedule) return 0;
    return schedule.filter(isOverdue).length;
  }, [schedule]);

  // Schedule sorted: overdue first, then by next_review_at ascending.
  const sortedSchedule = useMemo(() => {
    if (!schedule) return [] as ReviewItem[];
    return [...schedule].sort(
      (a, b) =>
        new Date(a.next_review_at).getTime() -
        new Date(b.next_review_at).getTime(),
    );
  }, [schedule]);

  if (!user) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardHeader>
          <CardTitle>Retention dashboard</CardTitle>
          <CardDescription>Sign in to view your review health.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mt-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Brain className="h-6 w-6" /> Retention dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            How well you're holding each course — and what's due next.
          </p>
        </div>
        <Button asChild>
          <Link to="/student/review">
            {dueNowCount > 0 ? `Review ${dueNowCount} due now` : 'Start review'}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-rose-700" />
            </div>
            <div>
              <div className="text-2xl font-semibold leading-tight">
                {isScheduleLoading ? (
                  <Skeleton className="h-7 w-10 inline-block" />
                ) : (
                  dueNowCount
                )}
              </div>
              <div className="text-xs text-muted-foreground">Due right now</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <div className="text-2xl font-semibold leading-tight">
                {isScheduleLoading ? (
                  <Skeleton className="h-7 w-10 inline-block" />
                ) : (
                  courseIds.length
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Active courses
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <div className="text-2xl font-semibold leading-tight">
                {isScheduleLoading ? (
                  <Skeleton className="h-7 w-10 inline-block" />
                ) : (
                  sortedSchedule.length
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Tracked cards
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-course retention grid */}
      <section>
        <h2 className="text-lg font-semibold mb-3">By course</h2>
        {isScheduleLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : courseIds.length === 0 ? (
          <Card className="border-2 border-dashed border-muted/60 bg-gradient-to-br from-muted/30 via-background to-background">
            <CardContent className="flex flex-col items-center gap-4 py-12 px-6 text-center">
              <div className="rounded-full bg-primary/10 p-4 ring-1 ring-primary/20">
                <BookOpen className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h3 className="text-base font-semibold tracking-tight">
                  No review schedules yet
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Complete a quiz in any course and we'll automatically seed a
                  spaced-repetition schedule for the questions you attempted.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link
                  to="/student/courses"
                  aria-label="Browse courses to start learning"
                >
                  Browse courses
                  <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courseIds.map(courseId => (
              <CourseRetentionCard
                key={courseId}
                studentId={studentId}
                courseId={courseId}
              />
            ))}
          </div>
        )}
      </section>

      {/* Full schedule list */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Upcoming schedule</h2>
        <Card>
          <CardContent className="py-4 space-y-2">
            {isScheduleLoading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : sortedSchedule.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="rounded-full bg-muted p-2">
                  <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Inbox zero</p>
                  <p className="text-xs text-muted-foreground">
                    Nothing due in the next few weeks.
                  </p>
                </div>
              </div>
            ) : (
              sortedSchedule.map(item => (
                <ScheduleRow key={item._id} item={item} />
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}