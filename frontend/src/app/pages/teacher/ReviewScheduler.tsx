"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Zap, PauseCircle, PlayCircle, GraduationCap, BookOpen, BrainCircuit, MessageSquareText, RotateCcw, Ban, Power, Send, Library } from "lucide-react";
import { toast } from "sonner";
import {
  useBoostReview,
  useSetRemediationHint,
  useBulkUpdateNotifications,
  useBulkUpdateExamPrep,
  useGetCourses,
  useGetCourseStudentsRich,
  useResetReview,
  useBulkSetStudentSRDisabled,
  useGetAssignableQuestions,
  useAssignReview,
} from "@/hooks/spaced-repetition-hooks";
import { resetMockState, studentDisplay } from "@/lib/spaced-repetition-api";
import { CourseSelectCard } from "@/components/sr-teacher/CourseSelectCard";
import { StudentListPanel } from "@/components/sr-teacher/StudentListPanel";
import { InfoPopover } from "@/components/InfoPopover";
import {
  SPACED_REPETITION_INFO_TITLE,
  SpacedRepetitionInfoBody,
} from "@/components/spaced-repetition-info";

export default function ReviewScheduler() {
  // Global Selection State
  const [courseId, setCourseId] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  
  // Card-Specific State
  const [questionId, setQuestionId] = useState("");
  const [hintText, setHintText] = useState("");

  // API Hooks
  const boostMutation = useBoostReview(""); // ID passed at mutation time for loops
  const hintMutation = useSetRemediationHint(""); 
  const resetMutation = useResetReview("");
  const bulkNotifyMutation = useBulkUpdateNotifications();
  const bulkExamPrepMutation = useBulkUpdateExamPrep();
  const bulkSRDisabledMutation = useBulkSetStudentSRDisabled();

  // Fetch courses for the teacher (added 2026-08-03) + students in the selected course.
  // The course list drives CourseSelectCard; the student list drives StudentListPanel.
  const { data: coursesData } = useGetCourses();
  const coursesList = coursesData;
  const { data: studentsData } = useGetCourseStudentsRich(courseId);
  
  // Derive the visible list of enrolled students with id + name.
  // Both fields are kept (id is still needed by bulk mutations).
  const enrolledStudents = (studentsData?.students || []).map(s => ({
    id: s.id,
    name: s.name,
  }));
  // `students` for the new panel component (rich shape, with email).
  const richStudents = studentsData?.students;

  const toggleSelectAll = () => {
    if (selectedStudents.length === enrolledStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(enrolledStudents.map(s => s.id));
    }
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  // --- Handlers ---

  const handleCardAction = (actionName: string, mutationHook: any, payload: any) => {
    if (selectedStudents.length === 0) return toast.error("Please select at least one student");
    if (!questionId) return toast.error("A Question ID is required for this action");

    // Fan-out for card actions since backend expects them per-student
    selectedStudents.forEach(studentId => {
      mutationHook.mutate(
        { studentId, ...payload }, // Assumes we adjust the hook to take studentId in the variable object
        {
          onSuccess: () => toast.success(`${actionName} successful for selected student(s)`),
          onError: (err: any) => toast.error(`Error: ${err.message}`)
        }
      );
    });
  };

  const handleBulkNotify = (optOut: boolean) => {
    if (!courseId || selectedStudents.length === 0) return toast.error("Course ID and students required");
    bulkNotifyMutation.mutate({ courseId, studentIds: selectedStudents, optOut }, {
      // Bug 3 fix (2026-08-01): the server now returns a pre-formatted
      // `message` that distinguishes student count from item count
      // (e.g. "Updated notifications for 3 students (6 review items).").
      // Previously this template read `data.updatedCount` which was
      // actually the item count and was being mislabelled as a student
      // count. Trust the server message — both backend and mock paths
      // produce identical wording.
      onSuccess: (data) => toast.success(data.message),
      onError: (err) => toast.error(err.message)
    });
  };

  const handleBulkExamPrep = (enabled: boolean) => {
    if (!courseId || selectedStudents.length === 0) return toast.error("Course ID and students required");
    bulkExamPrepMutation.mutate({ courseId, studentIds: selectedStudents, enabled }, {
      // See `handleBulkNotify` for why we render `data.message` instead
      // of building the string here (Bug 3 fix, 2026-08-01).
      onSuccess: (data) => toast.success(data.message),
      onError: (err) => toast.error(err.message)
    });
  };

  const handleBulkSRDisabled = (sr_disabled: boolean) => {
    if (selectedStudents.length === 0) return toast.error("Please select at least one student");
    bulkSRDisabledMutation.mutate({ studentIds: selectedStudents, sr_disabled }, {
      onSuccess: (data) => toast.success(
        sr_disabled
          ? `Disabled SR for ${data.updatedCount} student(s)`
          : `Re-enabled SR for ${data.updatedCount} student(s)`,
      ),
      onError: (err) => toast.error(err.message),
    });
  };

  // --- Manual Review Assignment (Knob 7, Phase C, 2026-07-21, multi-student 2026-08-05) ---

  // Dialog open state + selected question inside the picker. The dialog
  // now supports MULTIPLE students (Phase 3 / Teacher Dashboard Plan C
  // bulleted 2026-08-05): the teacher picks 1+ students in the targets
  // panel, the dialog pre-fills a checkbox strip of all of them, and
  // the teacher can uncheck any they want to skip. Submit fans out
  // assign-per-student via Promise.allSettled — backend `/assign` is
  // idempotent on the (student_id, question_id) unique index, so a
  // 409 collision is safely reported as "skipped" without retrying.
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignForStudents, setAssignForStudents] = useState<string[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("");

  // Fetch the assignable question catalogue for the current course.
  // We only fire when the dialog is open AND the courseId is set, so the
  // list isn't pulled for every teacher sitting on the dashboard.
  const { data: assignableData, isLoading: isLoadingAssignable } =
    useGetAssignableQuestions(courseId, assignDialogOpen);

  // The assign mutation. We don't pass studentId to the hook (it's a
  // per-student fan-out inside `submitAssign`), so we just call
  // mutateAsync() in a loop.
  const assignMutation = useAssignReview();

  const openAssignDialog = () => {
    if (!courseId) return toast.error("Pick a course first.");
    if (selectedStudents.length === 0) {
      return toast.error("Select at least one student to assign a review to.");
    }
    // Pre-populate the dialog with all currently-selected students. The
    // teacher can uncheck any they want to skip before submitting.
    setAssignForStudents(selectedStudents);
    setSelectedQuestionId("");
    setAssignDialogOpen(true);
  };

  const toggleAssignStudent = (studentId: string) => {
    setAssignForStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(sId => sId !== studentId)
        : [...prev, studentId],
    );
  };

  const submitAssign = async () => {
    if (assignForStudents.length === 0) {
      return toast.error("Pick at least one student to assign to.");
    }
    if (!selectedQuestionId) return toast.error("Pick a question first.");
    if (!courseId) return;

    // Fan-out via Promise.allSettled so each student's failure is
    // isolated. Backend `/assign` is idempotent on (student_id,
    // question_id), so a 409 just means "already in that student's
    // queue" — we count it as skipped without retrying.
    const results = await Promise.allSettled(
      assignForStudents.map((studentId) =>
        assignMutation.mutateAsync({
          studentId,
          questionId: selectedQuestionId,
          courseId,
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;

    // Multi-student summary toast. Single-student case keeps the old
    // autoEnabled-aware wording so the auto-re-enable message stays
    // visible when relevant.
    if (assignForStudents.length === 1) {
      const only = results[0];
      if (only.status === "fulfilled") {
        const data = only.value as { autoEnabled?: boolean };
        if (data.autoEnabled) {
          toast.success(
            "Assigned. SR was disabled for this student — re-enabled to make the assignment actionable.",
          );
        } else {
          toast.success(`Assigned "${selectedQuestionId}" to the student's queue.`);
        }
      } else {
        const err = only.reason as Error & { status?: number };
        if (err.status === 409) {
          toast.warning(
            "Already in this student's queue. Use Force Due (Boost) instead.",
          );
        } else {
          toast.error(`Assign failed: ${err.message}`);
        }
      }
    } else if (failed === 0) {
      toast.success(`Assigned to all ${succeeded} students.`);
    } else if (succeeded === 0) {
      toast.error(`Failed to assign to any of the ${failed} students.`);
    } else {
      toast.warning(
        `Assigned to ${succeeded}. ${failed} skipped (already in queue or error).`,
      );
    }

    setAssignDialogOpen(false);
    setSelectedQuestionId("");
    setAssignForStudents([]);
  };

  return (
    <div className="flex-1 md:p-6 p-3 bg-gradient-to-br from-background via-background to-muted/20 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 rounded-2xl blur-3xl"></div>
          <div className="relative bg-card/90 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-r from-primary to-accent p-3 rounded-xl">
                <GraduationCap className="h-8 w-8 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  Review Scheduler
                  <InfoPopover title={SPACED_REPETITION_INFO_TITLE}>
                    <SpacedRepetitionInfoBody />
                  </InfoPopover>
                </h1>
                <p className="text-muted-foreground">Select a course and target students to manage their spaced repetition queues.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: Selection Funnel (CourseSelectCard + StudentListPanel,
              added 2026-08-03 to replace the previous free-text Input + inline list.
              Both new components are self-contained Cards; the section header
              is preserved above as a description. */}
          <div className="lg:col-span-5 space-y-6">
            <CourseSelectCard
              courses={coursesList}
              selectedCourseId={courseId || null}
              onSelect={(id) => {
                setCourseId(id);
                setSelectedStudents([]); // clear stale selection from a previous course
              }}
            />
            <StudentListPanel
              students={courseId ? richStudents : undefined}
              selectedStudentIds={selectedStudents}
              onToggle={toggleStudent}
              onToggleAll={toggleSelectAll}
            />
          </div>

          {/* RIGHT COLUMN: Actions */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Global Actions */}
            <Card className={`bg-card/60 backdrop-blur-sm border-border/50 shadow-sm transition-opacity ${selectedStudents.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary"/> 2. Global Schedule Controls</CardTitle>
                <CardDescription>Applies to the {selectedStudents.length} selected student(s).</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => handleBulkNotify(true)} className="h-11 justify-start">
                  <PauseCircle className="mr-2 h-4 w-4 text-amber-500" /> Pause Reminders
                </Button>
                <Button variant="outline" onClick={() => handleBulkNotify(false)} className="h-11 justify-start">
                  <PlayCircle className="mr-2 h-4 w-4 text-emerald-500" /> Resume Reminders
                </Button>
                <Button variant="outline" onClick={() => handleBulkExamPrep(true)} className="h-11 justify-start border-primary/30 hover:bg-primary/5">
                  <BrainCircuit className="mr-2 h-4 w-4 text-primary" /> Enable Exam-Prep
                </Button>
                <Button variant="outline" onClick={() => handleBulkExamPrep(false)} className="h-11 justify-start">
                  Disable Exam-Prep
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleBulkSRDisabled(true)}
                  className="h-11 justify-start border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  title="Turn off SR entirely for the selected students. Reviews stop accumulating and reminders stop firing."
                >
                  <Ban className="mr-2 h-4 w-4" /> Disable SR
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleBulkSRDisabled(false)}
                  className="h-11 justify-start"
                  title="Re-enable SR for the selected students. Their next course completion will seed a new schedule."
                >
                  <Power className="mr-2 h-4 w-4 text-emerald-500" /> Re-enable SR
                </Button>
              </CardContent>
            </Card>

            {/* Card Specific Actions */}
            <Card className={`bg-card/60 backdrop-blur-sm border-border/50 shadow-sm transition-opacity ${selectedStudents.length === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-primary"/> 3. Card-Specific Adjustments</CardTitle>
                <CardDescription>Target a specific concept for the {selectedStudents.length} selected student(s).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input 
                  placeholder="Enter Target Question ID..." 
                  value={questionId}
                  onChange={(e) => setQuestionId(e.target.value)}
                  className="h-11 border-primary/20 bg-background"
                />
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button onClick={() => handleCardAction("Boost", boostMutation, { questionId })} className="bg-gradient-to-r from-primary to-accent h-11">
                    <Zap className="mr-2 h-4 w-4" /> Force Due (Boost)
                  </Button>
                  <Button variant="destructive" onClick={() => handleCardAction("Reset", resetMutation, { questionId })} className="h-11">
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset History
                  </Button>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <Input 
                    placeholder="Type a remediation hint..." 
                    value={hintText}
                    onChange={(e) => setHintText(e.target.value)}
                    className="h-11 bg-background"
                  />
                  <Button variant="secondary" onClick={() => handleCardAction("Hint", hintMutation, { questionId, hint: hintText || null })} className="h-11 px-6">
                    <MessageSquareText className="mr-2 h-4 w-4" /> Set Hint
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Manual Review Assignment (Knob 7, Phase C, 2026-07-21). Sits between
                per-card adjustments and the demo controls because it’s a teacher
                action, not demo bookkeeping. */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" /> 4. Manual Review Assignment
                </CardTitle>
                <CardDescription>
                  Put a specific question on a single student's next-review queue.
                  Use this to surface a tricky concept they missed in class, or to
                  target a remediation question at one learner.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5 border border-border/40">
                  Select <span className="font-medium">one or more</span> students in
                  the targets panel above, then click the button below to open the
                  question picker. The dialog pre-fills with your selection — uncheck
                  any you want to skip before submitting.
                </div>
                <Button
                  variant="default"
                  className="w-full h-11 justify-start"
                  onClick={openAssignDialog}
                  disabled={!courseId || selectedStudents.length === 0}
                  title={
                    !courseId
                      ? 'Pick a course first'
                      : selectedStudents.length === 0
                        ? 'Select one or more students in the targets panel'
                        : 'Open the question picker'
                  }
                >
                  <Send className="mr-2 h-4 w-4" /> Assign a Review to{' '}
                  {selectedStudents.length === 1
                    ? studentDisplay(selectedStudents[0]).name
                    : `${selectedStudents.length} Students`}
                </Button>
              </CardContent>
            </Card>

            {/* Demo controls — mock data only. Visible only when USE_MOCK is true. */}
            <Card className="bg-amber-50/40 dark:bg-amber-950/10 border-amber-300/40 border-dashed shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
                  <RotateCcw className="h-4 w-4" /> Demo Controls (mock data only)
                </CardTitle>
                <CardDescription className="text-xs">
                  Teacher mutations (boost, hint, reset, bulk opt-out, bulk exam-prep) and
                  student recall responses persist to localStorage so the student dashboard reflects them
                  after a logout/login cycle. Use this button to reset everything back to seed state for
                  a clean demo re-run.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm('Reset all mock data? This will reload the page.')) {
                      resetMockState();
                    }
                  }}
                  className="h-9 border-amber-400/60 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset Mock State
                </Button>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>

      {/* Manual Review Assignment dialog (Knob 7). Lives at the root so
          it overlays the entire page regardless of which Card the user
          triggered from. */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Assign a Review
            </DialogTitle>
            <DialogDescription>
              {assignForStudents.length === 1 ? (
                <>
                  Pick a question to put on{' '}
                  <span className="font-medium text-foreground">
                    {studentDisplay(assignForStudents[0]).name}
                  </span>
                  's next-review queue. The student will see it on their next
                  visit to the review screen.
                </>
              ) : assignForStudents.length > 1 ? (
                <>
                  Pick a question to put on{' '}
                  <span className="font-medium text-foreground">
                    {assignForStudents.length} students
                  </span>
                  ' next-review queues. Uncheck any you want to skip.
                </>
              ) : (
                'Pick a question.'
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Student checkbox strip (added 2026-08-05, Phase 3). Pre-fills
              with the teacher selection from the targets panel; the
              teacher can drop any before submitting. Renders only when
              there are 2+ students (single-student case is already
              conveyed in the description above). */}
          {assignForStudents.length > 1 && (
            <div
              className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5"
              data-testid="assign-student-strip"
            >
              <div className="text-xs font-medium text-muted-foreground pb-1">
                Recipients ({assignForStudents.length})
              </div>
              <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1">
                {assignForStudents.map((studentId) => {
                  const checked = true; // always pre-checked; toggle removes
                  return (
                    <label
                      key={studentId}
                      className="flex items-center gap-2 rounded-sm px-2 py-1 cursor-pointer hover:bg-background/60"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleAssignStudent(studentId)}
                        aria-label={`Remove ${studentDisplay(studentId).name} from assignment`}
                      />
                      <span className="text-sm">
                        {studentDisplay(studentId).name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {isLoadingAssignable ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading question
                catalogue…
              </div>
            ) : (assignableData?.questions ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
                No questions found in this course's banks. Add banks to the course first.
              </div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 pb-1">
                  <Library className="h-3.5 w-3.5" />
                  {assignableData?.questions.filter((q) => q.fromCourse).length ?? 0}{' '}
                  from this course ·{' '}
                  {assignableData?.questions.filter((q) => !q.fromCourse).length ?? 0}{' '}
                  cross-bank
                </div>
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                  {assignableData?.questions.map((q) => {
                    const isSelected = selectedQuestionId === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setSelectedQuestionId(q.id)}
                        className={
                          'w-full text-left rounded-md border p-3 transition-colors ' +
                          (isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border hover:bg-muted/40')
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium leading-snug">
                            {q.body}
                          </div>
                          {q.fromCourse ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5">
                              Course
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide font-medium rounded-full bg-muted text-muted-foreground px-2 py-0.5">
                              Cross-bank
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 text-xs text-muted-foreground">
                          from{' '}
                          <span className="italic">
                            {q.bankTitles.filter(Boolean).join(', ') || 'Unknown bank'}
                          </span>{' '}
                          · <span className="font-mono">{q.type}</span>
                        </div>
                        {q.hint && (
                          <div className="mt-1.5 text-xs text-muted-foreground italic">
                            Hint: {q.hint}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAssignDialogOpen(false);
                setSelectedQuestionId('');
                setAssignForStudents([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAssign}
              disabled={!selectedQuestionId || assignForStudents.length === 0 || assignMutation.isPending}
            >
              {assignMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assigning…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />{' '}
                  {assignForStudents.length > 1
                    ? `Assign to ${assignForStudents.length} Students`
                    : 'Assign'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}