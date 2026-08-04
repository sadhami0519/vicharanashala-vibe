"use client"

import { useState, useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import {
  useGetSchedule,
  useBoostReview,
  useSetExamPrepMode,
  useSetPaused,
  useResetQuestion,
  useGetCourses,
  useGetCourseStudentsRich,
} from "@/hooks/spaced-repetition-hooks"
import { spacedRepetitionKeys } from "@/hooks/spaced-repetition-hooks"
import { studentDisplay, courseDisplay, getQuestionSummary } from "@/lib/spaced-repetition-api"
import { CourseSelectCard } from "@/components/sr-teacher/CourseSelectCard"
import { StudentListPanel } from "@/components/sr-teacher/StudentListPanel"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Zap, Pause, Play, RotateCcw, BookOpen, Clock, AlertCircle, GraduationCap } from "lucide-react"
import { toast } from "sonner"

function retentionColor(ef: number) {
  if (ef >= 2.5) return "text-green-600"
  if (ef >= 1.8) return "text-yellow-600"
  return "text-red-600"
}

// Per-card left-stripe color (added 2026-08-04). Mirrors retentionColor() but
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
// efStripeClass(), but rendered as `border-t-{color}-500` for the four
// overview tiles at the top of the student dashboard.
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

export default function TeacherSRDashboard() {
  // Selection state (added 2026-08-03): replaced hardcoded STUDENT_ID with
  // a course+student selector pair. Schedule fetch is gated on having a
  // selected student id (useGetSchedule handles the empty case gracefully).
  const [courseId, setCourseId] = useState<string>("")
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])

  // `studentId` is the currently focused student (first selected). For this
  // page we treat selection as single-student (the dashboard shows one
  // student's data at a time). If you ever extend this to multi-student,
  // you'll want to either loop or aggregate.
  const studentId = selectedStudents[0] ?? ""

  const { data: coursesData } = useGetCourses()
  const coursesList = coursesData
  const { data: studentsData } = useGetCourseStudentsRich(courseId)
  const richStudents = studentsData?.students

  const { data: items, isLoading, error, refetch } = useGetSchedule(studentId)
  const boost = useBoostReview()
  const examPrep = useSetExamPrepMode(studentId, courseId)
  const pause = useSetPaused(studentId, courseId)
  const reset = useResetQuestion(studentId)

  // Day 2 (2026-08-04): per-card question body preview. Fan out one
  // query per unique question id so each card row can render the body
  // text instead of a raw id slice. `useQueries` with the same queryKey
  // as `useGetQuestionSummary` keeps the cache shared if a single-card
  // caller ever appears later.
  //
  // `studentItems` is read BEFORE the early returns below; we useMemo
  // `studentItems` derivation from `items` so the query inputs are
  // stable across re-renders. The `[]` fallback when items are absent
  // keeps the useQueries call shape clean (no conditional hook).
  const studentItems = useMemo(() => items ?? [], [items])
  const uniqueQuestionIds = useMemo(
    () => Array.from(new Set(studentItems.map(i => i.question_id))),
    [studentItems],
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

  const toggleStudent = (id: string) => {
    setSelectedStudents(prev =>
      prev.includes(id) ? [] : [id] // single-select semantics
    )
  }
  const toggleSelectAll = () => {
    setSelectedStudents(prev => (prev.length > 0 ? [] : prev))
    // No-op: single-select doesn't have a meaningful select-all for this page.
  }

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function handleBoost(questionId: string) {
    setActionLoading(questionId + "-boost")
    try {
      const r = await boost.mutateAsync({ studentId, questionId })
      toast.success(r.message)
      await refetch()
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Boost failed")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReset(questionId: string) {
    if (!confirm("Reset this question? Student will relearn from scratch.")) return
    setActionLoading(questionId + "-reset")
    try {
      const r = await reset.mutateAsync(questionId)
      toast.success(r.message)
      await refetch()
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Reset failed")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleExamPrep(enabled: boolean) {
    setActionLoading("exam-prep")
    try {
      const r = await examPrep.mutateAsync(enabled)
      toast.success(r.message)
      await refetch()
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Exam-prep toggle failed")
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePause(paused: boolean) {
    setActionLoading("pause")
    try {
      const r = await pause.mutateAsync(paused)
      toast.success(r.message)
      await refetch()
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Pause toggle failed")
    } finally {
      setActionLoading(null)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
    </div>
  )
  if (error) return (
    <div className="p-6 text-red-500 flex items-center gap-2">
      <AlertCircle className="w-4 h-4" /> Failed to load: {String(error)}
    </div>
  )

  const overdueCount = studentItems.filter(i => new Date(i.next_review_at).getTime() < Date.now()).length
  const pausedCount = studentItems.filter(i => i.is_paused).length
  const examModeCount = studentItems.filter(i => i.exam_prep_mode).length
  const avgEF = studentItems.length
    ? (studentItems.reduce((s, i) => s + i.EF, 0) / studentItems.length).toFixed(2)
    : "—"
  const isPaused = pausedCount === studentItems.length && studentItems.length > 0
  const isExamMode = examModeCount > 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Page header (restructured 2026-08-04, course-first IA) ────────
          Replaces the previous student-name-as-header. New accent colour
          (violet) so this page has its own identity distinct from the
          student's blue dashboard and the orange/indigo badges inside
          the card list. The 1px violet left-border is the "soul" cue
          that ties the whole page together at a glance. */}
      <div className="flex items-center gap-3 border-l-4 border-violet-500 pl-4 -ml-4">
        <BookOpen className="w-7 h-7 text-violet-600" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-semibold">Teacher review controls</h1>
          <p className="text-sm text-muted-foreground">
            Pick a course, then a student, to view and adjust their review schedule.
          </p>
        </div>
      </div>

      {/* ── Section 1: Courses (always visible, top of page) ────────────
          Search-first by design: the CourseSelectCard already renders its
          search bar inside, so the very first thing a teacher sees is a
          filterable list of their courses. Selection state stays fully
          controlled by the page so changing courses clears the student
          picker (handled below in onSelect). */}
      <Card className="border-violet-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">1</span>
            Choose a course
          </CardTitle>
          <CardDescription>
            Search by name or paste a course id. Your active courses appear first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseSelectCard
            courses={coursesList}
            selectedCourseId={courseId || null}
            onSelect={(id) => {
              setCourseId(id)
              setSelectedStudents([]) // clear stale selection on course switch
            }}
          />
        </CardContent>
      </Card>

      {/* ── Section 2: Students (visible when courseId is set) ──────────
          Rendered as a soft "ghost" card before a course is picked so
          the teacher can see what comes next without it being prominent.
          Once a course is picked, the ghost swaps to the real picker
          with a coloured header chip ("Course: X") for context. */}
      {!courseId ? (
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
              Choose a student
            </CardTitle>
            <CardDescription>
              Search by name or email. Single-select; pick the student you want to review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StudentListPanel
              students={courseId ? richStudents : undefined}
              selectedStudentIds={selectedStudents}
              onToggle={toggleStudent}
              onToggleAll={toggleSelectAll}
              hideSelectAll
              headerSlot={
                <Badge
                  variant="outline"
                  className="border-violet-300 bg-violet-50 text-violet-800 text-xs"
                >
                  Course: {courseDisplay(courseId).name}
                </Badge>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* ── Section 3: Student dashboard (visible when studentId is set) ─
          Three sub-cards: stats overview, global controls, per-card list.
          Stats get coloured top-borders (added 2026-08-04) so the four
          tiles read like a quick health check at a glance. Per-card
          rows get a coloured left-stripe so the retention story is
          visible without reading every number. */}
      {studentId && (
        <>
          {/* Student context header */}
          <Card className="bg-gradient-to-br from-violet-50/40 via-background to-background border-violet-200/60">
            <CardContent className="py-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-violet-700" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {studentDisplay(studentId).name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {studentDisplay(studentId).email}
                      &nbsp;·&nbsp;
                      <span className="text-violet-700">{courseDisplay(courseId).name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {studentItems.length > 0 && (
                    <>
                      <span className="font-medium text-foreground">{studentItems.length}</span>
                      <span>cards</span>
                      {overdueCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-rose-600">{overdueCount}</span>
                          <span className="text-rose-600">overdue</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className={`border-t-2 ${statAccentClass("total", studentItems.length, isPaused)}`}>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{studentItems.length}</div>
                <div className="text-xs text-muted-foreground">Total cards</div>
              </CardContent>
            </Card>
            <Card className={`border-t-2 ${statAccentClass("overdue", overdueCount, isPaused)}`}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${overdueCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {overdueCount}
                </div>
                <div className="text-xs text-muted-foreground">Overdue now</div>
              </CardContent>
            </Card>
            <Card className={`border-t-2 ${statAccentClass("ef", avgEF, isPaused)}`}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${retentionColor(parseFloat(String(avgEF)))}`}>
                  {avgEF}
                </div>
                <div className="text-xs text-muted-foreground">Avg EF (retention)</div>
              </CardContent>
            </Card>
            <Card className={`border-t-2 ${statAccentClass("status", 0, isPaused)}`}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${isPaused ? "text-amber-600" : "text-emerald-600"}`}>
                  {isPaused ? "PAUSED" : "Active"}
                </div>
                <div className="text-xs text-muted-foreground">Review status</div>
              </CardContent>
            </Card>
          </div>

          {/* Global controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-600" /> Global Controls
              </CardTitle>
              <CardDescription>
                Affects every review item for this student in this course.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                variant={isExamMode ? "default" : "outline"}
                size="sm"
                onClick={() => handleExamPrep(!isExamMode)}
                disabled={!!actionLoading}
              >
                {actionLoading === "exam-prep" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Zap className="w-4 h-4 mr-1" />
                )}
                {isExamMode ? "Disable Exam-Prep Mode" : "Enable Exam-Prep Mode"}
              </Button>
              <Button
                variant={isPaused ? "destructive" : "outline"}
                size="sm"
                onClick={() => handlePause(!isPaused)}
                disabled={!!actionLoading}
              >
                {actionLoading === "pause" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : isPaused ? (
                  <Play className="w-4 h-4 mr-1" />
                ) : (
                  <Pause className="w-4 h-4 mr-1" />
                )}
                {isPaused ? "Resume All Reviews" : "Pause All Reviews"}
              </Button>
            </CardContent>
          </Card>

          {/* Per-card list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Student Cards ({studentItems.length})
              </CardTitle>
              <CardDescription>
                Each row is colour-coded by its retention strength — emerald is strong, amber is steady, rose needs work.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {studentItems.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">No review items. Complete a course first.</p>
              ) : (
                <div className="space-y-2">
                  {studentItems.map(item => (
                    <div
                      key={item._id}
                      className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm gap-3 border-l-4 ${efStripeClass(item.EF)} bg-card hover:bg-muted/30 motion-safe:transition-colors`}
                    >
                      {/* Left: metadata */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge variant="outline" className="text-xs shrink-0" title={item.course_id}>
                          {courseDisplay(item.course_id).name}
                        </Badge>
                        {/* Question body preview (Day 2, 2026-08-04).
                            Replaces the raw Q:abc12345 slice with a human-readable
                            body. Falls back to the id slice when the summary
                            query hasn't resolved yet (or has errored). The
                            truncation + title= keeps it readable at the
                            max-w-5xl row width while still showing the full
                            text on hover. */}
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
                        {/* Boost */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => handleBoost(item.question_id)}
                          disabled={actionLoading === item.question_id + "-boost"}
                          title="Boost: make due immediately"
                        >
                          {actionLoading === item.question_id + "-boost" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Zap className="w-3 h-3 text-orange-500" />
                          )}
                          <span className="ml-1">Boost</span>
                        </Button>

                        {/* Remediation hint is display-only in this demo */}
                        {item.remediation_hint && (
                          <span className="text-xs text-amber-600 max-w-32 truncate" title={item.remediation_hint}>
                            💡 {item.remediation_hint}
                          </span>
                        )}

                        {/* Reset */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive"
                          onClick={() => handleReset(item.question_id)}
                          disabled={actionLoading === item.question_id + "-reset"}
                          title="Reset: delete this card, student must relearn"
                        >
                          {actionLoading === item.question_id + "-reset" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          <span className="ml-1">Reset</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}