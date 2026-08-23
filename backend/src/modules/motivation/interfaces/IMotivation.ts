/**
 * Motivation system — backend interfaces (mirror of frontend/motivation.types).
 *
 * These shapes describe the JSON returned by the three motivation
 * endpoints. They are response types, not stored Mongo documents.
 * The frontend imports its own copy from `@/types/motivation.types`.
 *
 * Keep in sync with `frontend/src/types/motivation.types.ts`.
 */

// ── Badge taxonomy ──────────────────────────────────────────────────────────

export type BadgeTier = 'entry' | 'apprentice' | 'courtier' | 'royalty';

export interface Badge {
  id: string;
  name: string;
  sanskrit: string;
  emoji: string;
  tier: BadgeTier;
  criteria: string;
  description: string;
}

export interface BadgeProgress {
  badge: Badge;
  earned: boolean;
  earnedAt: Date | null;
  progress: { current: number; target: number };
}

// ── Status snapshots ───────────────────────────────────────────────────────

export type StatusMetric =
  | 'retention'
  | 'streak'
  | 'ef_stability'
  | 'volume'
  | 'stuck_cards';

export type StatusUnit = 'percent' | 'days' | 'count' | 'score';

export interface StatusValue {
  value: number;
  unit: StatusUnit;
}

export interface StatusSnapshot {
  metric: StatusMetric;
  allTime: StatusValue;
  last30Days: StatusValue;
}

// ── Leaderboard ────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  rank: number | null;
  retention30d: number | null;
  coverage: number;
  isOptedOut: boolean;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  currentUserRank: number | null;
  currentUserPercentile: number | null;
  totalStudents: number;
}

// ── Mentor view ────────────────────────────────────────────────────────────

export type LearnerCategory =
  | 'all-rounder'
  | 'mastery-only'
  | 'sprinter'
  | 'quiet';

export interface LearnerCategoryRow {
  studentId: string;
  studentName: string;
  category: LearnerCategory;
  retention30d: number | null;
  coverage: number;
}

export interface StuckCardRow {
  studentId: string;
  studentName: string;
  stuckCount: number;
  dippingCount: number;
}

export interface NextBadgeProximity {
  studentId: string;
  studentName: string;
  badgeId: string;
  badgeName: string;
  distance: number;
  unit: string;
}

export interface MentorViewResponse {
  stuckCards: StuckCardRow[];
  nextBadges: NextBadgeProximity[];
  learnerCategories: LearnerCategoryRow[];
}

// ── Top-level motivation response ──────────────────────────────────────────

export interface MotivationResponse {
  studentId: string;
  badges: BadgeProgress[];
  status: StatusSnapshot[];
  asOf: Date;
}
