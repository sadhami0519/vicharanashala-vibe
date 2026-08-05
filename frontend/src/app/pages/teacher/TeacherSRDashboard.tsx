"use client"

import { useState, useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import {
  useBoostReview,
  useSetExamPrepMode,
  useSetPaused,
  useResetQuestion,
  useGetCourses,
  useGetCourseStudentsRich,
} from "@/hooks/spaced-repetition-hooks"
import { spacedRepetitionKeys } from "@/hooks/spaced-repetition-hooks"
import { studentDisplay, courseDisplay, getQuestionSummary, getSchedule, bulkUpdateExamPrepMode } from "@/lib/spaced-repetition-api"
import { CourseMultiSelectCard } from "@/components/sr-teacher/CourseMultiSelectCard"
import { StudentListPanel } from "@/components/sr-teacher/StudentListPanel"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Zap, Pause, Play, RotateCcw, BookOpen, Clock, AlertCircle, GraduationCap, ChevronDown, ChevronRight, Users } from "lucide-react"
import { toast } from "sonner"
import type { ReviewItem } from "@/types/spaced-repetition.types"

function retentionColor(ef: number) {
  if (ef >= 2.5) return "text-green-600"
  if (ef >= 1.8) return "text-yellow-600"
  return "text-red-600"
}

// Per-card left-stripe colour (added 2026-08-04). Mirrors retentionColor() but
// returns a Tailwind class for `border-l-{color}-{weight}` so a glance at the
// card list tells the retention story without reading every number.
//   >= 2.5 → emerald  (strong)
//   >= 1.8 → amber    (steady)
//   <  1.8 → rose     (needs work)
function efStripeClass(ef: number): string {
  if (ef >= 2.5) return "border-l-emerald-500"
  if (ef >= 1.8) return "border-l-amber-500"
  return "border-l-rose-500"
}

// Stat-card top-border accent (added 2026-08-04). Same band thresholds as
// efStripeClass(), but rendered as `border-t-{color}-500`.
function statAccentClass(kind: "total" | "overdue" | "ef" | "status", value: number | string, isPaused: boolean): string {
  switch (kind) {
    case "total":
      return "border-t-slate-300"
    case "overdue":
      return typeof value === "number" && value > 0 ? "border-t-rose-500" : "border-t-emerald-500"
    case "ef": {
      const n = typeof value === "string" ? parseFloat(value) : value
      if (!Number.isFinite(n)) return "border-t-slate-300"
      if (n >= 2.5) return "border-t-emerald-500"
      if (n >= 1.8) return "border-t-amber-500"
      return "border-t-rose-500"
    }
    case "status":
      return isPaused ? "border-t-amber-500" : "border-t-emerald-500"
  }
}

/**
 * Per-student aggregate stats derived from a schedule.
 * Used by the per-student card header (always visible) and by the
 * aggregate header (summed across all selected students).
 */
function computeStudentStats(items: ReviewItem[]): {
  total: number
  overdue: number
  pausedCount: number
  examModeCount: number
  avgEF: string
  isPaused: boolean
  isExamMode: boolean
} {
  const overdue = items.filter(i => new Date(i.next_review_at).getTime() < Date.now()).length
  const pausedCount = items.filter(i => i.is_paused).length
  const examModeCount = items.filter(i => i.exam_prep_mode).length
  const avgEF = items.length
    ? (items.reduce((s, i) => s + i.EF, 0) / items.length).toFixed(2)
    : "—"
  const isPaused = pausedCount === items.length && items.length > 0
  const isExamMode = examModeCount > 0
  return { total: items.length, overdue, pausedCount, examModeCount, avgEF, isPaused, isExamMode }
}

export default function TeacherSRDashboard() {
  // Selection state (added 2026-08-03, multi-select 2026-08-05 Phase 3):
  // both courses AND students are now multi-select. Section 3 (the
  // dashboard) only renders once both arrays have at least one entry.
  // The first course in `selectedCourses` is treated as the "primary"
  // course for context-chip rendering and the student-roster query
  // (the roster app still fetches one course at a time backend-side).
  const [selectedCourses, setSelectedCourses] = useState<string[]>([])
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const primaryCourseId = selectedCourses[0] ?? ""

  // `expandedStudentIds` is the inline-expand drill-down state (added
  // 2026-08-05, Phase 3). A Set keyed by studentId lets us toggle
  // individual cards without re-rendering the whole list. Default: all
  // collapsed (the per-student summary is the dense view; expanding
  // reveals the per-card list).
  const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(new Set())

  const toggleStudentExpanded = (studentId: string) => {
    setExpandedStudentIds(prev => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  // Course → student-roster query. The backend's `getCourseStudentsRich`
  // is per-course, so when multiple courses are selected we union their
  // rosters. For the demo this is good enough; production would want a
  // backend `getCoursesStudentsRich(courseIds[])` endpoint.
  const { data: studentsData } = useGetCourseStudentsRich(primaryCourseId)
  const richStudents = studentsData?.students

  // Fan-out: one `useGetSchedule` per selected student. Aggregating
  // across all selected students lets us render the cohort stats header
  // and per-student cards without a separate "load each student"
  // gesture. `useQueries` shares the same queryKey with `useGetSchedule`
  // so the cache is deduped if a single-student caller ever appears.
  // The queryFn calls the underlying `getSchedule` directly (calling
  // the hook itself inside queryFn would return a `UseQueryResult`,
  // not a Promise — not what `useQueries` expects).
  const scheduleQueries = useQueries({
    queries: selectedStudents.map(studentId => ({
      queryKey: spacedRepetitionKeys.schedule(studentId),
      queryFn: () => getSchedule(studentId),
    })),
  })

  // Flatten to a `studentId → items[]` map. If any query is still
  // loading we show a spinner; if any errored we surface the first.
  const studentItems: Record<string, ReviewItem[]> = useMemo(() => {
    const map: Record<string, ReviewItem[]> = {}
    selectedStudents.forEach((sid, idx) => {
      const q = scheduleQueries[idx]
      if (q?.data) map[sid] = q.data
    })
    return map
  }, [selectedStudents, scheduleQueries])

  const isLoading = selectedStudents.length > 0 && scheduleQueries.some(q => q.isLoading)
  const firstError = scheduleQueries.find(q => q.error)?.error
  const error = firstError ? String(firstError) : null

  // Per-card question body preview (Day 2, 2026-08-04). Fan out one
  // query per unique question id across ALL selected students, then
  // dedupe into a Map for O(1) lookup in the per-card render.
  const allItemsAcrossStudents = useMemo(
    () => Object.values(studentItems).flat(),
    [studentItems],
  )
  const uniqueQuestionIds = useMemo(
    () => Array.from(new Set(allItemsAcrossStudents.map(i => i.question_id))),
    [allItemsAcrossStudents],
  )
  const questionSummaryQueries = useQueries({
    queries: uniqueQuestionIds.map(id => ({
      queryKey: spacedRepetitionKeys.questionSummary(id),
      queryFn: () => getQuestionSummary(id),
      enabled: !!id,
    })),
  })
  const questionSummaryById = useMemo(() => {
    const map = new Map<string, { body: string; type: string; bankTitles: string[] }>()
    questionSummaryQueries.forEach((q, idx) => {
      const id = uniqueQuestionIds[idx]
      if (id && q.data?.question) {
        map.set(id, q.data.question)
      }
    })
    return map
  }, [questionSummaryQueries, uniqueQuestionIds])

  // Aggregate stats across the entire selection (all students × all
  // courses). Used by the "Cohort at a glance" header strip.
  const aggregateStats = useMemo(() => {
    const items = allItemsAcrossStudents
    return computeStudentStats(items)
  }, [allItemsAcrossStudents])

  // Per-student cards (one entry per selected student). Each card is
  // collapsible (inline-expand drill-down) to reveal the per-card list.
  const studentContextCards = useMemo(() => {
    return selectedStudents.map(sid => {
      const items = studentItems[sid] ?? []
      const stats = computeStudentStats(items)
      return {
        studentId: sid,
        items,
        stats,
        isExpanded: expandedStudentIds.has(sid),
      }
    })
  }, [selectedStudents, studentItems, expandedStudentIds])

  // ── Bulk global controls (added 2026-08-05, Phase 3) ────────────────
  // For multi-student scope, exam-prep is per-course. We fan out
  // `bulkUpdateExamPrepMode` across the selected courses (one HTTP
  // round-trip per course, all selected students in that course).
  // `Promise.allSettled` isolates failures per course. The summary
  // toast tells the teacher exactly how many course-stamps updated.
  //
  // Confirmation threshold: silent for ≤20 pairs, window.confirm() for
  // >20 (per the 2026-08-05 design lock-in). The threshold matches the
  // "wait, did I mean to do that?" moment where a click could be a
  // misclick on a busy desk.
  const BULK_CONFIRM_THRESHOLD = 20

  async function bulkToggleExamPrep(enabled: boolean) {
    if (selectedCourses.length === 0 || selectedStudents.length === 0) {
      return toast.error("Select at least one course and one student.")
    }
    const totalPairs = selectedCourses.length * selectedStudents.length
    if (totalPairs > BULK_CONFIRM_THRESHOLD) {
      const ok = window.confirm(
        `You're about to ${enabled ? "enable" : "disable"} Exam-Prep Mode for ${totalPairs} (course × student) pairs. Continue?`,
      )
      if (!ok) return
    }
    const results = await Promise.allSettled(
      selectedCourses.map(courseId =>
        bulkUpdateExamPrepMode(courseId, selectedStudents, enabled),
      ),
    )
    const succeeded = results.filter(r => r.status === "fulfilled").length
    const failed = selectedCourses.length - succeeded
    // The dual-count response (per the bulk endpoints) carries the
    // item-level totals. We only surface the simpler pair-count here
    // because the dashboard is the cohort view, not the per-course
    // per-item view (which is ReviewScheduler).
    if (failed === 0) {
      toast.success(`Exam-Prep ${enabled ? "enabled" : "disabled"} across ${succeeded} course${succeeded === 1 ? "" : "s"} (${totalPairs} pair${totalPairs === 1 ? "" : "s"}).`)
    } else if (succeeded === 0) {
      toast.error(`Failed to update any of the ${failed} courses.`)
    } else {
      toast.warning(`Updated ${succeeded} course${succeeded === 1 ? "" : "s"}. ${failed} skipped.`)
    }
    // Refetch all affected schedules.
    scheduleQueries.forEach(q => q.refetch())
  }

  // Per-card (single-student, single-question) mutations. These stay
  // scoped to the per-student card they're rendered in — the expanded
  // view passes them a studentId + questionId directly.
  const boost = useBoostReview()
  const reset = useResetQuestion("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function handleBoost(studentId: string, questionId: string) {
    setActionLoading(`${studentId}-${questionId}-boost`)
    try {
      const r = await boost.mutateAsync({ studentId, questionId })
      toast.success(r.message)
      // Refetch this student's schedule so the inline UI updates.
      const idx = selectedStudents.indexOf(studentId)
      if (idx >= 0) scheduleQueries[idx]?.refetch()
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Boost failed")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReset(studentId: string, questionId: string) {
    if (!confirm("Reset this question? Student will relearn from scratch.")) return
    setActionLoading(`${studentId}-${questionId}-reset`)
    try {
      const r = await reset.mutateAsync(questionId)
      toast.success(r.message)
      const idx = selectedStudents.indexOf(studentId)
      if (idx >= 0) scheduleQueries[idx]?.refetch()
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Reset failed")
    } finally {
      setActionLoading(null)
    }
  }

  // Per-student global controls (exam-prep / pause). These are scoped
  // to a single student × all selected courses. The student-card
  // header renders these buttons so the teacher can adjust one student
  // at a time without affecting the cohort.
  function PerStudentGlobalControls({ studentId }: { studentId: string }) {
    // Lightweight per-student mutations. We use a single primary
    // course for the toggle (the first selected course) — hovering
    // shows a tooltip explaining the scope.
    const examPrep = useSetExamPrepMode(studentId, primaryCourseId)
    const pause = useSetPaused(studentId, primaryCourseId)
    const items = studentItems[studentId] ?? []
    const stats = computeStudentStats(items)
    const isExamMode = stats.isExamMode
    const isPaused = stats.isPaused

    async function toggleExamPrep() {
      try {
        const r = await examPrep.mutateAsync(!isExamMode)
        toast.success(r.message)
        const idx = selectedStudents.indexOf(studentId)
        if (idx >= 0) scheduleQueries[idx]?.refetch()
      } catch (e: unknown) {
        toast.error((e as Error)?.message ?? "Exam-prep toggle failed")
      }
    }
    async function togglePause() {
      try {
        const r = await pause.mutateAsync(!isPaused)
        toast.success(r.message)
        const idx = selectedStudents.indexOf(studentId)
        if (idx >= 0) scheduleQueries[idx]?.refetch()
      } catch (e: unknown) {
        toast.error((e as Error)?.message ?? "Pause toggle failed")
      }
    }

    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant={isExamMode ? "default" : "outline"}
          size="sm"
          onClick={toggleExamPrep}
          disabled={examPrep.isPending}
          className="h-7 text-xs"
          title={`Toggle Exam-Prep mode for this student in ${courseDisplay(primaryCourseId).name || "the selected course"}`}
        >
          {examPrep.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Zap className="w-3 h-3" />
          )}
        </Button>
        <Button
          variant={isPaused ? "destructive" : "outline"}
          size="sm"
          onClick={togglePause}
          disabled={pause.isPending}
          className="h-7 text-xs"
          title={`Toggle reviews for this student in ${courseDisplay(primaryCourseId).name || "the selected course"}`}
        >
          {pause.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isPaused ? (
            <Play className="w-3 h-3" />
          ) : (
            <Pause className="w-3 h-3" />
          )}
        </Button>
      </div>
    )
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
    </div>
  )
  if (error) return (
    <div className="p-6 text-red-500 flex items-center gap-2">
      <AlertCircle className="w-4 h-4" /> Failed to load: {error}
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Page header (restructured 2026-08-04, course-first IA) ────────
          Replaces the previous student-name-as-header. New accent colour
          (violet) so this page has its own identity distinct from the
          student's blue dashboard and the orange/indigo badges inside
          the card list. */}
      <div className="flex items-center gap-3 border-l-4 border-violet-500 pl-4 -ml-4">
        <BookOpen className="w-7 h-7 text-violet-600" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-semibold">Teacher review controls</h1>
          <p className="text-sm text-muted-foreground">
            Pick one or more courses, then one or more students, to view and adjust their review schedules.
          </p>
        </div>
      </div>

      {/* ── Section 1: Courses (always visible, top of page) ────────────
          Multi-select. Selection state stays fully controlled by the
          page so changing courses clears the student picker (handled
          below). The new CourseMultiSelectCard has its own search bar
          inside, so the very first thing a teacher sees is a filterable
          list with checkboxes. */}
      <Card className="border-violet-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">1</span>
            Choose courses
          </CardTitle>
          <CardDescription>
            Multi-select. Use the checkboxes to build a cohort across multiple courses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseMultiSelectCard
            courses={useGetCourses().data}
            selectedCourseIds={selectedCourses}
            onToggle={(id) => {
              setSelectedCourses(prev =>
                prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
              )
              setSelectedStudents([]) // clear stale selection on course change
            }}
            onToggleAll={() => {
              setSelectedCourses(prev =>
                prev.length > 0 ? [] : ((useGetCourses().data ?? []).map(c => c.id))
              )
              setSelectedStudents([])
            }}
          />
        </CardContent>
      </Card>

      {/* ── Section 2: Students (visible when at least one course is picked) ──
          Rendered as a soft "ghost" card before any course is picked so
          the teacher can see what comes next without it being prominent.
          Once a course is picked, the ghost swaps to the real picker
          with a coloured header chip ("Course: X") for context. */}
      {selectedCourses.length === 0 ? (
        <Card className="border-2 border-dashed border-violet-200/70 bg-violet-50/30">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <GraduationCap className="w-6 h-6 mx-auto mb-2 text-violet-400" aria-hidden="true" />
            Pick a course above to see its enrolled students.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-violet-200/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">2</span>
              Choose students
            </CardTitle>
            <CardDescription>
              Multi-select. Search by name or email. The dashboard below aggregates stats across all selected students.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StudentListPanel
              students={primaryCourseId ? richStudents : undefined}
              selectedStudentIds={selectedStudents}
              onToggle={(id) => {
                setSelectedStudents(prev =>
                  prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
                )
              }}
              onToggleAll={() => {
                const all = (richStudents ?? []).map(s => s.id)
                setSelectedStudents(prev =>
                  prev.length === all.length ? [] : all
                )
              }}
              headerSlot={
                selectedCourses.length === 1 ? (
                  <Badge
                    variant="outline"
                    className="border-violet-300 bg-violet-50 text-violet-800 text-xs"
                  >
                    Course: {courseDisplay(selectedCourses[0]).name}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-violet-300 bg-violet-50 text-violet-800 text-xs"
                  >
                    <Users className="w-3 h-3 mr-1" aria-hidden="true" />
                    {selectedCourses.length} courses
                  </Badge>
                )
              }
            />
          </CardContent>
        </Card>
      )}

      {/* ── Section 3: Cohort dashboard (visible when BOTH pickers have entries) ──
          Added 2026-08-05, Phase 3: hides everything below until the
          teacher has picked at least one course AND one student. The
          pickers "occupy center stage" until then (per Emie's
          instruction). Once both are picked, the dashboard unfolds:
          aggregate stats header → bulk global controls → per-student
          cards (collapsible). */}
      {selectedCourses.length > 0 && selectedStudents.length > 0 && (
        <>
          {/* Aggregate cohort header */}
          <Card className="bg-gradient-to-br from-violet-50/40 via-background to-background border-violet-200/60">
            <CardContent className="py-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                    <Users className="w-5 h-5 text-violet-700" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {selectedStudents.length} student{selectedStudents.length === 1 ? "" : "s"}
                      {" across "}
                      {selectedCourses.length} course{selectedCourses.length === 1 ? "" : "s"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Cohort view · stats are aggregated across all selected students
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {aggregateStats.total > 0 && (
                    <>
                      <span className="font-medium text-foreground">{aggregateStats.total}</span>
                      <span>cards</span>
                      {aggregateStats.overdue > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-rose-600">{aggregateStats.overdue}</span>
                          <span className="text-rose-600">overdue</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats overview — aggregate across the cohort */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className={`border-t-2 ${statAccentClass("total", aggregateStats.total, aggregateStats.isPaused)}`}>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{aggregateStats.total}</div>
                <div className="text-xs text-muted-foreground">Total cards</div>
              </CardContent>
            </Card>
            <Card className={`border-t-2 ${statAccentClass("overdue", aggregateStats.overdue, aggregateStats.isPaused)}`}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${aggregateStats.overdue > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {aggregateStats.overdue}
                </div>
                <div className="text-xs text-muted-foreground">Overdue now</div>
              </CardContent>
            </Card>
            <Card className={`border-t-2 ${statAccentClass("ef", aggregateStats.avgEF, aggregateStats.isPaused)}`}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${retentionColor(parseFloat(String(aggregateStats.avgEF)))}`}>
                  {aggregateStats.avgEF}
                </div>
                <div className="text-xs text-muted-foreground">Avg EF (retention)</div>
              </CardContent>
            </Card>
            <Card className={`border-t-2 ${statAccentClass("status", 0, aggregateStats.isPaused)}`}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${aggregateStats.isPaused ? "text-amber-600" : "text-emerald-600"}`}>
                  {aggregateStats.isPaused ? "PAUSED" : "Active"}
                </div>
                <div className="text-xs text-muted-foreground">Cohort status</div>
              </CardContent>
            </Card>
          </div>

          {/* Bulk global controls (across the cohort) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-600" /> Bulk Global Controls
              </CardTitle>
              <CardDescription>
                Affects every review item for the selected students in the selected courses
                ({selectedCourses.length} × {selectedStudents.length} = {selectedCourses.length * selectedStudents.length} pairs).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkToggleExamPrep(true)}
                title="Enable Exam-Prep mode for every selected (course × student) pair"
              >
                <Zap className="w-4 h-4 mr-1" /> Enable Exam-Prep (all)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkToggleExamPrep(false)}
                title="Disable Exam-Prep mode for every selected (course × student) pair"
              >
                Disable Exam-Prep (all)
              </Button>
              <span className="text-xs text-muted-foreground self-center italic">
                Per-student toggle is on each card below.
              </span>
            </CardContent>
          </Card>

          {/* Per-student cards (inline-expand drill-down) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-600" />
                Per-student breakdown ({studentContextCards.length})
              </CardTitle>
              <CardDescription>
                Click a row to expand and see the per-card list for that student.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {studentContextCards.map(({ studentId, items, stats, isExpanded }) => {
                const display = studentDisplay(studentId)
                return (
                  <div
                    key={studentId}
                    className="rounded-lg border border-border bg-card hover:bg-muted/30 motion-safe:transition-colors"
                    data-testid={`student-card-${studentId}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleStudentExpanded(studentId)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={isExpanded}
                      aria-controls={`student-card-detail-${studentId}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                        )}
                        <div className="shrink-0 w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
                          <GraduationCap className="w-3.5 h-3.5 text-violet-700" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground truncate">{display.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{display.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-foreground">{stats.total}</span>
                          <span>cards</span>
                        </div>
                        {stats.overdue > 0 && (
                          <div className="flex flex-col items-end">
                            <span className="font-medium text-rose-600">{stats.overdue}</span>
                            <span>overdue</span>
                          </div>
                        )}
                        <div className="flex flex-col items-end">
                          <span className={`font-medium ${retentionColor(parseFloat(String(stats.avgEF)))}`}>
                            {stats.avgEF}
                          </span>
                          <span>EF</span>
                        </div>
                        {stats.isPaused && (
                          <Badge variant="secondary" className="text-xs">Paused</Badge>
                        )}
                        {stats.isExamMode && (
                          <Badge className="text-xs bg-indigo-600">Exam</Badge>
                        )}
                        <PerStudentGlobalControls studentId={studentId} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div
                        id={`student-card-detail-${studentId}`}
                        className="border-t border-border px-3 py-3 space-y-2"
                        data-testid={`student-card-detail-${studentId}`}
                      >
                        {items.length === 0 ? (
                          <p className="text-muted-foreground text-sm py-2">No review items. Complete a course first.</p>
                        ) : (
                          items.map(item => (
                            <div
                              key={item._id}
                              className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm gap-3 border-l-4 ${efStripeClass(item.EF)} bg-background hover:bg-muted/30 motion-safe:transition-colors`}
                            >
                              {/* Left: metadata */}
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Badge variant="outline" className="text-xs shrink-0" title={item.course_id}>
                                  {courseDisplay(item.course_id).name}
                                </Badge>
                                {questionSummaryById.get(item.question_id) ? (
                                  <span
                                    className="text-xs text-foreground/80 truncate max-w-64 shrink"
                                    title={questionSummaryById.get(item.question_id)?.body}
                                  >
                                    {questionSummaryById.get(item.question_id)?.body}
                                  </span>
                                ) : (
                                  <span
                                    className="text-xs text-muted-foreground font-mono shrink-0"
                                    title={item.question_id}
                                  >
                                    Q:{item.question_id.slice(0, 8)}
                                  </span>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-xs font-bold ${retentionColor(item.EF)}`}>
                                    EF {item.EF.toFixed(2)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{item.interval_days}d</span>
                                </div>
                                {item.is_paused && (
                                  <Badge variant="secondary" className="text-xs shrink-0">Paused</Badge>
                                )}
                                {item.exam_prep_mode && (
                                  <Badge className="text-xs bg-indigo-600 shrink-0">Exam</Badge>
                                )}
                                {item.remediation_hint && (
                                  <Badge variant="default" className="text-xs bg-amber-600 shrink-0" title={item.remediation_hint}>
                                    Hint
                                  </Badge>
                                )}
                                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                  <Clock className="w-3 h-3" />
                                  <span className="whitespace-nowrap">
                                    {new Date(item.next_review_at).toLocaleString()}
                                  </span>
                                </div>
                              </div>

                              {/* Right: per-card actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                {item.remediation_hint && (
                                  <span className="text-xs text-amber-600 max-w-32 truncate" title={item.remediation_hint}>
                                    💡 {item.remediation_hint}
                                  </span>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => handleBoost(studentId, item.question_id)}
                                  disabled={actionLoading === `${studentId}-${item.question_id}-boost`}
                                  title="Boost: make due immediately"
                                >
                                  {actionLoading === `${studentId}-${item.question_id}-boost` ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Zap className="w-3 h-3 text-orange-500" />
                                  )}
                                  <span className="ml-1">Boost</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-destructive"
                                  onClick={() => handleReset(studentId, item.question_id)}
                                  disabled={actionLoading === `${studentId}-${item.question_id}-reset`}
                                  title="Reset: delete this card, student must relearn"
                                >
                                  {actionLoading === `${studentId}-${item.question_id}-reset` ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3" />
                                  )}
                                  <span className="ml-1">Reset</span>
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
