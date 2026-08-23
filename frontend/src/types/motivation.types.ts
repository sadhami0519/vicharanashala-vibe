/**
 * Motivation System — shared types.
 *
 * Mirrors the structure of `spaced-repetition.types.ts`. Pure types,
 * no runtime code. Single source of truth for the frontend motivation
 * surfaces and the API contracts.
 *
 * No imports — keep this file import-free so it can be safely imported
 * from anywhere without creating a dependency cycle.
 */

// ── Badge taxonomy ─────────────────────────────────────────────────────────

/** The 12 court-rank badges. String literal union for type safety. */
export type BadgeId =
  // Tier 1 — Entry
  | 'dwarapala'
  | 'pranam'
  | 'kanchuki'
  // Tier 2 — Apprentice
  | 'sipahi'
  | 'sukh-dukh'
  | 'vaidya'
  // Tier 3 — Courtier
  | 'kohinoor'
  | 'pundit'
  | 'simha'
  // Tier 4 — Royalty
  | 'rajkumar'
  | 'mantri'
  | 'vikram';

/** Tiers in order. Used for grouping badges in the UI. */
export type BadgeTier = 'entry' | 'apprentice' | 'courtier' | 'royalty';

/**
 * A single badge's definition. Lives in the badge catalogue (the
 * static list of all 12 badges) AND is embedded in `BadgeProgress`
 * for earned/locked badges returned by the API.
 */
export interface Badge {
  /** Unique ID. */
  id: BadgeId;
  /** Display name, e.g. "Dwarapala". */
  name: string;
  /** Translation/transliteration, e.g. "door-keeper". */
  sanskrit: string;
  /** Emoji used in v1. SVG upgrade in v1.1. */
  emoji: string;
  /** Tier, used for grouping in the UI. */
  tier: BadgeTier;
  /** Short description, e.g. "You're at the gate." */
  description: string;
  /**
   * Human-readable criteria. The actual computation lives in
   * `MotivationService.computeBadgeProgress()` on the backend.
   * Surfaced in the UI when a student clicks a locked badge.
   */
  criteria: string;
}

/**
 * A student's progress toward a single badge. Whether earned or
 * locked, this is what the API returns per badge.
 */
export interface BadgeProgress {
  /** The badge definition. */
  badge: Badge;
  /** True if the student has earned this badge. */
  earned: boolean;
  /** When the badge was earned. Undefined for locked badges. */
  earnedAt?: Date;
  /**
   * Progress toward the badge. Always present, even when earned
   * (so the UI can show "100% of 10 reviews").
   */
  progress: {
    /** Current count toward the threshold. */
    current: number;
    /** Threshold for the badge. */
    target: number;
    /** Human-readable unit, e.g. "reviews", "cards recovered", "days". */
    unit: string;
  };
}

// ── Status cards ───────────────────────────────────────────────────────────

export type StatusMetric =
  | 'retention'
  | 'streak'
  | 'ef_stability'
  | 'volume'
  | 'stuck_cards';

export type StatusUnit = 'percent' | 'count' | 'days' | 'score';

/** A single numeric value with its unit. */
export interface StatusValue {
  value: number;
  unit: StatusUnit;
}

/**
 * All-time and 30-day snapshot of a single metric. The UI shows
 * these side by side in the status cards table.
 */
export interface StatusSnapshot {
  metric: StatusMetric;
  allTime: StatusValue;
  last30Days: StatusValue;
}

// ── Leaderboard ────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  /** 30-day retention as a percentage 0–100. `null` if n/a. */
  retention30d: number | null;
  /** Coverage as a percentage 0–100. */
  coverage: number;
  /** 1-based rank. Hidden if the student opted out. */
  rank: number | null;
  /** True if the student has opted out of this course's leaderboard. */
  isOptedOut: boolean;
  /** True if this entry is the current authenticated user. */
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  courseId: string;
  entries: LeaderboardEntry[];
  /** The current user's rank on this leaderboard. `null` if n/a. */
  currentUserRank: number | null;
  /** The current user's percentile. `null` if n/a. */
  currentUserPercentile: number | null;
  /** Total students enrolled in the course (including opted-out). */
  totalStudents: number;
}

// ── Mentor view ────────────────────────────────────────────────────────────

export type LearnerCategory =
  | 'mastery-only'
  | 'all-rounder'
  | 'sprinter'
  | 'quiet';

export interface StuckCardRow {
  studentId: string;
  studentName: string;
  /** Items with n=0 after 3+ reviews. */
  stuckCount: number;
  /** Items currently in the 2nd-attempt dip (n=1, recently). */
  dippingCount: number;
}

export interface NextBadgeProximity {
  studentId: string;
  studentName: string;
  badgeId: BadgeId;
  badgeName: string;
  /** Distance to the badge threshold. */
  distance: number;
  /** Same unit as the badge's `progress.unit`. */
  unit: string;
}

export interface LearnerCategoryRow {
  studentId: string;
  studentName: string;
  retention30d: number | null;
  coverage: number;
  category: LearnerCategory;
}

export interface MentorViewResponse {
  courseId: string;
  stuckCards: StuckCardRow[];
  nextBadges: NextBadgeProximity[];
  learnerCategories: LearnerCategoryRow[];
}

// ── API responses ──────────────────────────────────────────────────────────

/**
 * Shape of `GET /api/motivation/me`. Returns the student's own
 * earned/locked badges and their status card snapshots.
 */
export interface MotivationMeResponse {
  studentId: string;
  badges: BadgeProgress[];
  status: StatusSnapshot[];
}
