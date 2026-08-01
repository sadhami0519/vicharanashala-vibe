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

// ── Opt-out (Pillar 3) ──────────────────────────────────────────────────────

/**
 * Shape of `PATCH /api/motivation/students/:studentId/courses/:courseId/opt-out`.
 *
 * Mirrors `IMotivation.OptOutResponse` on the backend exactly:
 *   - `optedOut` reflects the requested final state (true = now opted out)
 *   - `changed` is `true` iff the user's opt-out state transitioned —
 *     i.e. the doc was newly created (first opt-in) or removed
 *     (first opt-out-of-an-opt-out). Repeated ops that just refresh
 *     the timestamp report `changed: false`. Used to decide whether
 *     to toast "you've opted out" vs "you were already opted out".
 *   - `optedOutAt` is the timestamp of the upserted doc on opt-in;
 *     `null` on opt-out (the doc no longer exists).
 *
 * The mutation is idempotent — same body twice returns the same
 * payload with `changed: false` on the second call.
 */
export interface OptOutResponse {
  studentId: string;
  courseId: string;
  optedOut: boolean;
  changed: boolean;
  optedOutAt: Date | null;
}

/**
 * Error shape when the threshold gate blocks an opt-in attempt
 * (HTTP 403) or any other request failure (HTTP 404 if the
 * student/course pair doesn't exist, 5xx for transient backend
 * failures). The `reason` is human-readable — the backend
 * surfaces the actual current value (e.g. "currently 78") so the
 * UI can show "you have 78 of 100 reviews" rather than a generic
 * "you don't qualify".
 */
export interface OptOutError {
  status: number;
  reason: string;
}

/**
 * Thin discriminated union used by the API layer to surface
 * threshold-gate failures without throwing. The hook layer
 * converts this into a TanStack Query `error`.
 */
export type OptOutResult =
  | { ok: true; response: OptOutResponse }
  | { ok: false; error: OptOutError };

// ── Student profile (drill-in from leaderboard) ────────────────────────────

/**
 * Shape of `GET /api/motivation/students/:studentId/profile`
 * (the future live endpoint — the mock layer returns this
 * shape directly via `getStudentProfile()` in
 * `lib/motivation-api.ts`).
 *
 * Returned when a student taps another student's row in the
 * leaderboard (see `StudentProfileModal`). Combines:
 *
 *   - `studentId` + `studentName`: display identity
 *   - `courseId`: which course's leaderboard was the entry point
 *     (so the modal can show e.g. "European Capitals" in the header)
 *   - `retention30d` + `coverage`: re-stated from the leaderboard
 *     row for context (the modal isn't meant to require the
 *     leaderboard entry to stay mounted)
 *   - `avgEf`: the 30-day average SM-2 Easiness Factor. Lives in
 *     `[1.3, ∞)`; values around 1.8–2.6 indicate healthy retention,
 *     values trending toward 1.3 indicate struggling retention.
 *   - `badges`: full 12-badge progress array (matches the shape
 *     the dashboard's own `BadgeGrid` already renders, so the
 *     modal can reuse the same component without forking).
 *   - `isOptedOut`: mirrors the leaderboard's opt-out flag so the
 *     modal can show an "opted out" state when the drill-in target
 *     is no longer ranked. Always present, not `null` — the modal
 *     always knows whether to render the rank chip.
 *   - `avatarSeed`: optional deterministic string used to render
 *     a placeholder avatar in the modal header. Reserved for the
 *     future avatars integration (not consumed by `StudentProfileModal`
 *     today — it's there so the type is forward-compatible).
 */
export interface StudentProfile {
  studentId: string;
  studentName: string;
  courseId: string;
  retention30d: number | null;
  coverage: number;
  /** 30-day average SM-2 EF. Floor 1.3 by SM-2 algorithm. */
  avgEf: number;
  badges: BadgeProgress[];
  isOptedOut: boolean;
  /** Optional deterministic avatar seed; reserved for future use. */
  avatarSeed?: string;
}

