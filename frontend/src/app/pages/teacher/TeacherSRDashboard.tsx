"use client"

import React, { useState } from "react"
import {
  useGetSchedule,
  useBoostReview,
  useSetExamPrepMode,
  useSetPaused,
  useResetQuestion,
  useGetCourses,
  useGetCourseStudentsRich,
} from "@/hooks/spaced-repetition-hooks"
import { studentDisplay, courseDisplay } from "@/lib/spaced-repetition-api"
import { CourseSelectCard } from "@/components/sr-teacher/CourseSelectCard"
import { StudentListPanel } from "@/components/sr-teacher/StudentListPanel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Zap, Pause, Play, RotateCcw, Brain, Clock, AlertCircle } from "lucide-react"
import { toast } from "sonner"

function retentionColor(ef: number) {
  if (ef >= 2.5) return "text-green-600"
  if (ef >= 1.8) return "text-yellow-600"
  return "text-red-600"
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
  const boost = useBoostReview(studentId)
  const examPrep = useSetExamPrepMode(studentId)
  const pause = useSetPaused(studentId)
  const reset = useResetQuestion(studentId)

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
      const r = await boost.mutateAsync({ questionId })
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

  const studentItems = items ?? []
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
      {/* Global stats */}
      {/* Header (updated 2026-08-03): now shows the selected student's
          name + email instead of a hardcoded "knob-test@example.com".
          Falls back to an empty selection hint when no student is picked. */}
      <div className="flex items-center gap-3">
        <Brain className="w-8 h-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold">Spaced Repetition — Teacher Controls</h1>
          <p className="text-muted-foreground text-sm">
            {studentId ? (
              <>
                <span className="font-medium text-foreground">{studentDisplay(studentId).name}</span>
                <span className="text-xs"> ({studentDisplay(studentId).email})</span>
                &nbsp;·&nbsp; {studentItems.length} cards &nbsp;
                {overdueCount > 0 && <span className="text-red-500">· {overdueCount} overdue</span>}
              </>
            ) : (
              <>Pick a course and student below to view their review schedule.</>
            )}
          </p>
        </div>
      </div>

      {/* Selector section (added 2026-08-03): replaces the hardcoded
          STUDENT_ID with a course picker + student picker. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CourseSelectCard
          courses={coursesList}
          selectedCourseId={courseId || null}
          onSelect={(id) => {
            setCourseId(id)
            setSelectedStudents([]) // clear stale selection on course switch
          }}
        />
        <StudentListPanel
          students={courseId ? richStudents : undefined}
          selectedStudentIds={selectedStudents}
          onToggle={toggleStudent}
          onToggleAll={toggleSelectAll}
          hideSelectAll
        />
      </div>

      {/* Student-scoped view (added 2026-08-03): stats + global controls +
          per-card list only render once a student is picked. The selector
          pair above is always visible so the teacher can switch contexts. */}
      {studentId && (
        <>
      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{studentItems.length}</div>
            <div className="text-xs text-muted-foreground">Total cards</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={`text-2xl font-bold ${overdueCount > 0 ? "text-red-500" : "text-green-500"}`}>
              {overdueCount}
            </div>
            <div className="text-xs text-muted-foreground">Overdue now</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={`text-2xl font-bold ${retentionColor(parseFloat(String(avgEF)))}`}>
              {avgEF}
            </div>
            <div className="text-xs text-muted-foreground">Avg EF (retention)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={`text-2xl font-bold ${isPaused ? "text-orange-500" : "text-green-500"}`}>
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
            <Zap className="w-4 h-4" /> Global Controls
          </CardTitle>
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
            <Brain className="w-4 h-4" /> Student Cards ({studentItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {studentItems.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No review items. Complete a course first.</p>
          ) : (
            <div className="space-y-2">
              {studentItems.map(item => (
                <div
                  key={item._id}
                  className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm gap-3"
                >
                  {/* Left: metadata */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge variant="outline" className="text-xs shrink-0" title={item.course_id}>
                      {courseDisplay(item.course_id).name}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono shrink-0" title={item.question_id}>
                      Q:{item.question_id.slice(0, 8)}
                    </span>
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

      {!studentId && (
        <Card className="bg-card/60 border-border/50 border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No student selected yet — pick one above to view their schedule.
          </CardContent>
        </Card>
      )}
    </div>
  )
}