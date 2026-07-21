import { LayoutDashboard, Flag, BookOpen, Megaphone, FileText, SquareTerminal, Brain, type LucideIcon } from "lucide-react";

export type StudentNavItem = {
  /** Stable identifier — used for keys and conditional logic. */
  key: string;
  title: string;
  to: string;
  icon: LucideIcon;
  /** Only render when this capability is present (e.g. HP System). */
  requires?: "hpSystem";
  /** Show the "new" indicator dot when true (e.g. unseen announcements). */
  indicator?: "announcements";
};

/**
 * Single source of truth for the student primary navigation.
 * Order here is the order shown in the sidebar.
 */
export const STUDENT_NAV_ITEMS: StudentNavItem[] = [
  { key: "dashboard", title: "Dashboard", to: "/student", icon: LayoutDashboard },
  { key: "flags", title: "My Flags", to: "/student/issues", icon: Flag },
  { key: "courses", title: "Courses", to: "/student/courses", icon: BookOpen },
  { key: "hp-system", title: "HP System", to: "/student/hp-system/cohorts", icon: SquareTerminal, requires: "hpSystem" },
  { key: "announcements", title: "Announcements", to: "/student/announcements", icon: Megaphone, indicator: "announcements" },
  { key: "submissions", title: "My Submissions", to: "/student/submissions", icon: FileText },
  // Spaced repetition — review dashboard is the demo-day landing target.
  // Lands on /student/review/dashboard (RetentionDashboard) so the student
  // sees per-course retention health + a "Practice cards" CTA, instead of
  // being dropped straight into the session card loop. The session itself
  // (/student/review) is reached from inside the dashboard's CTA, or via
  // the dashboard's deep-link `?courseId=<id>` search param.
  // Icon: matches the teacher sidebar's "Review Scheduler" entry, so the
  // two surfaces feel like the same feature.
  // See backend module: src/modules/spacedRepetition/.
  { key: "review", title: "Review", to: "/student/review/dashboard", icon: Brain },
];
