"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Zap, PauseCircle, PlayCircle, GraduationCap, Users, BookOpen, BrainCircuit, MessageSquareText, RotateCcw, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { 
  useBoostReview, 
  useSetRemediationHint, 
  useBulkUpdateNotifications, 
  useBulkUpdateExamPrep,
  useGetCourseStudents,
  useResetReview
} from "@/hooks/spaced-repetition-hooks";
import { resetMockState } from "@/lib/spaced-repetition-api";
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

  // Fetch students who have schedules for this course
  const { data: studentsData, isLoading: isLoadingStudents } = useGetCourseStudents(courseId);
  
  // Create a list of objects with a simulated "Name" so the UI is human-readable.
  // We will replace this simulation once the backend passes real names.
  const enrolledStudents = (studentsData?.studentIds || []).map(id => ({
    id,
    name: `Student ${id.substring(0, 5).toUpperCase()}` // Simulated Name
  }));

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
      onSuccess: (data) => toast.success(`Updated notifications for ${data.updatedCount} students`),
      onError: (err) => toast.error(err.message)
    });
  };

  const handleBulkExamPrep = (enabled: boolean) => {
    if (!courseId || selectedStudents.length === 0) return toast.error("Course ID and students required");
    bulkExamPrepMutation.mutate({ courseId, studentIds: selectedStudents, enabled }, {
      onSuccess: (data) => toast.success(`${enabled ? 'Enabled' : 'Disabled'} Exam-Prep mode for ${data.updatedCount} students`),
      onError: (err) => toast.error(err.message)
    });
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
          
          {/* LEFT COLUMN: Selection Funnel */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="bg-card/60 backdrop-blur-sm border-border/50 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5 text-primary"/> 1. Select Targets</CardTitle>
                <CardDescription>Enter a Course ID to load enrolled students.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input 
                  placeholder="Enter Course ID..." 
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="h-11 border-primary/20"
                />
                
                {courseId && (
                  <div className="border border-border/50 rounded-xl bg-background/50 overflow-hidden flex flex-col h-[380px]">
                    <div className="p-3 bg-muted/30 border-b flex justify-between items-center shrink-0">
                      <span className="font-medium text-sm">
                        {isLoadingStudents ? <Loader2 className="h-4 w-4 animate-spin" /> : `${enrolledStudents.length} Students`}
                      </span>
                      <Button variant="ghost" size="sm" onClick={toggleSelectAll} disabled={isLoadingStudents || enrolledStudents.length === 0} className="h-8 text-xs">
                        {selectedStudents.length === enrolledStudents.length && enrolledStudents.length > 0 ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                    
                    <div className="overflow-y-auto p-2 flex-1 space-y-1">
                      {enrolledStudents.length === 0 && !isLoadingStudents ? (
                        <p className="text-sm text-muted-foreground text-center p-4">No students found with active schedules.</p>
                      ) : (
                        enrolledStudents.map(student => {
                          const isSelected = selectedStudents.includes(student.id);
                          return (
                            <button
                              key={student.id}
                              onClick={() => toggleStudent(student.id)}
                              className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-sm transition-colors text-left ${isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}
                            >
                              {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                              {student.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
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
    </div>
  );
}