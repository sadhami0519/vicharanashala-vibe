/**
 * Motivation System — API layer and mock data.
 *
 * Mirrors `spaced-repetition-api.ts` exactly: `USE_MOTIVATION_MOCK`
 * toggle, mock data inline, real fetch functions inline, single
 * demo student wired in via `DEMO_STUDENT_ID` / `isDemoStudentEmail`.
 *
 * v1 ships with mock data only. The real fetch functions are
 * placeholders that will be wired up against the backend in Day 2.
 */

import {
  Badge,
  BadgeId,
  BadgeProgress,
  BadgeTier,
  LeaderboardResponse,
  LearnerCategory,
  MentorViewResponse,
  MotivationMeResponse,
  NextBadgeProximity,
  OptOutResponse,
  OptOutResult,
  StatusSnapshot,
  StudentProfile,
} from '../types/motivation.types';
import { DEMO_STUDENT_ID, isDemoStudentEmail } from './spaced-repetition-api';

// ── Toggle ─────────────────────────────────────────────────────────────────

/**
 * Master toggle. Default `true` for v1 — every frontend surface
 * runs on mock data until the backend is wired up. Flip to `false`
 * via an env var when the backend endpoints are stable.
 */
export const USE_MOTIVATION_MOCK = true;

/**
 * localStorage key. Used to persist mock opt-out state across page
 * reloads. Bumped to v2 alongside Pillar 3 so the opt-out state is
 * fresh on first load (no v1 schema to migrate).
 */
export const MOCK_MOTIVATION_STORAGE_KEY = 'vibe_motivation_mock_v2';

// ── Identity helpers (re-exported for the consuming UI) ────────────────────

export { DEMO_STUDENT_ID, isDemoStudentEmail };

// ── Badge catalogue ────────────────────────────────────────────────────────

/**
 * The 12 court-rank badges. Order is preserved for the UI (Tier 1
 * left to right, Tier 4 right). Each badge's `criteria` is the
 * human-readable definition; the actual computation lives in
 * `MotivationService.computeBadgeProgress()` on the backend.
 */
export const BADGE_CATALOGUE: Badge[] = [
  // Tier 1 — Entry (palace newcomer)
  {
    id: 'dwarapala',
    name: 'Dwarapala',
    sanskrit: 'door-keeper',
    emoji: '🪔',
    tier: 'entry',
    description: "You're at the gate.",
    criteria: 'Complete your first review.',
  },
  {
    id: 'pranam',
    name: 'Pranam',
    sanskrit: 'greeting',
    emoji: '📜',
    tier: 'entry',
    description: "You've been seen.",
    criteria: 'Review 10 distinct questions.',
  },
  {
    id: 'kanchuki',
    name: 'Kanchuki',
    sanskrit: 'record-keeper',
    emoji: '🎴',
    tier: 'entry',
    description: 'You hold a record.',
    criteria: 'Complete a full course.',
  },
  // Tier 2 — Apprentice
  {
    id: 'sipahi',
    name: 'Sipahi',
    sanskrit: 'soldier',
    emoji: '🪶',
    tier: 'apprentice',
    description: "You're dependable.",
    criteria: 'Maintain a 30-day review streak.',
  },
  {
    id: 'sukh-dukh',
    name: 'Sukh Dukh',
    sanskrit: 'joy-sorrow',
    emoji: '🪞',
    tier: 'apprentice',
    description: "You don't fake confidence.",
    criteria: 'Answer "unsure" (q=3) honestly 25 times.',
  },
  {
    id: 'vaidya',
    name: 'Vaidya',
    sanskrit: 'healer',
    emoji: '🌿',
    tier: 'apprentice',
    description: 'You fix your own mistakes.',
    criteria: 'Recover 10 missed cards back to got_it.',
  },
  // Tier 3 — Courtier
  {
    id: 'kohinoor',
    name: 'Kohinoor',
    sanskrit: 'jewel of the court',
    emoji: '💎',
    tier: 'courtier',
    description: 'A jewel of the court.',
    criteria: 'Reach EF ≥ 2.5 on 100 distinct questions.',
  },
  {
    id: 'pundit',
    name: 'Pundit',
    sanskrit: 'scholar',
    emoji: '📚',
    tier: 'courtier',
    description: 'You hold a doctrine.',
    criteria: 'Earn at least one Tier-2 badge in 3 distinct courses.',
  },
  {
    id: 'simha',
    name: 'Simha',
    sanskrit: 'lion',
    emoji: '🦁',
    tier: 'courtier',
    description: 'Loyalty is proven.',
    criteria: 'Maintain a 100-day review streak.',
  },
  // Tier 4 — Royalty
  {
    id: 'rajkumar',
    name: 'Rajkumar / Rajkumari',
    sanskrit: 'heir to the throne',
    emoji: '👑',
    tier: 'royalty',
    description: 'Heir to the throne.',
    criteria: 'Complete 1,000 lifetime reviews.',
  },
  {
    id: 'mantri',
    name: 'Mantri',
    sanskrit: 'minister',
    emoji: '🏛️',
    tier: 'royalty',
    description: 'You serve the kingdom.',
    criteria: 'Recover 50 missed cards across all courses.',
  },
  {
    id: 'vikram',
    name: 'Vikram',
    sanskrit: 'the king',
    emoji: '⚔️',
    tier: 'royalty',
    description: 'The throne is yours.',
    criteria:
      'Earn Kohinoor in every course you are enrolled in, plus maintain a 365-day streak.',
  },
];

/** Quick lookup by ID. Falls back to `undefined` if not found. */
export function getBadgeById(id: BadgeId): Badge | undefined {
  return BADGE_CATALOGUE.find((b) => b.id === id);
}

/** Group badges by tier for the UI's tier sections. */
export function getBadgesByTier(): Record<BadgeTier, Badge[]> {
  const out: Record<BadgeTier, Badge[]> = {
    entry: [],
    apprentice: [],
    courtier: [],
    royalty: [],
  };
  for (const b of BADGE_CATALOGUE) out[b.tier].push(b);
  return out;
}

// ── Mock data for the demo student ────────────────────────────────────────

/**
 * Mock badge progress for the demo student. 3 earned (Tier 1
 * complete), 2 Tier 2 partially earned, others locked.
 */
const MOCK_BADGE_PROGRESS: BadgeProgress[] = BADGE_CATALOGUE.map((badge) => {
  // Demo student has earned Tier 1 fully.
  if (badge.tier === 'entry') {
    return {
      badge,
      earned: true,
      earnedAt: new Date('2026-07-10'),
      progress: {
        current: badge.id === 'dwarapala' ? 1 : badge.id === 'pranam' ? 10 : 1,
        target: badge.id === 'dwarapala' ? 1 : badge.id === 'pranam' ? 10 : 1,
        unit: badge.id === 'dwarapala' ? 'review' : badge.id === 'pranam' ? 'questions' : 'course',
      },
    };
  }
  // Tier 2 — partial progress.
  if (badge.tier === 'apprentice') {
    if (badge.id === 'sipahi') {
      return {
        badge,
        earned: false,
        progress: { current: 12, target: 30, unit: 'days' },
      };
    }
    if (badge.id === 'sukh-dukh') {
      return {
        badge,
        earned: false,
        progress: { current: 18, target: 25, unit: 'honest unsure' },
      };
    }
    return {
      badge, // vaidya
      earned: false,
      progress: { current: 7, target: 10, unit: 'cards recovered' },
    };
  }
  // Tier 3 — low progress.
  if (badge.tier === 'courtier') {
    if (badge.id === 'kohinoor') {
      return {
        badge,
        earned: false,
        progress: { current: 87, target: 100, unit: 'questions at EF ≥ 2.5' },
      };
    }
    if (badge.id === 'pundit') {
      return {
        badge,
        earned: false,
        progress: { current: 1, target: 3, unit: 'courses with Tier-2 badge' },
      };
    }
    return {
      badge, // simha
      earned: false,
      progress: { current: 12, target: 100, unit: 'days' },
    };
  }
  // Tier 4 — essentially zero.
  if (badge.id === 'rajkumar') {
    return {
      badge,
      earned: false,
      progress: { current: 247, target: 1000, unit: 'lifetime reviews' },
    };
  }
  if (badge.id === 'mantri') {
    return {
      badge,
      earned: false,
      progress: { current: 23, target: 50, unit: 'cards recovered (school-wide)' },
    };
  }
  return {
    badge, // vikram
    earned: false,
    progress: { current: 0, target: 1, unit: 'throne' },
  };
});

/**
 * Mock status snapshots for the demo student. 5 metrics × 2 views.
 */
const MOCK_STATUS_SNAPSHOTS: StatusSnapshot[] = [
  {
    metric: 'retention',
    allTime: { value: 88, unit: 'percent' },
    last30Days: { value: 91, unit: 'percent' },
  },
  {
    metric: 'streak',
    allTime: { value: 47, unit: 'days' },
    last30Days: { value: 12, unit: 'days' },
  },
  {
    metric: 'ef_stability',
    allTime: { value: 0.83, unit: 'score' },
    last30Days: { value: 0.91, unit: 'score' },
  },
  {
    metric: 'volume',
    allTime: { value: 1247, unit: 'count' },
    last30Days: { value: 89, unit: 'count' },
  },
  {
    metric: 'stuck_cards',
    allTime: { value: 3, unit: 'count' },
    last30Days: { value: 1, unit: 'count' },
  },
];

/**
 * Mock leaderboard for the demo course. 5 students ranked by
 * 30-day retention. Demo student at #4.
 */
const MOCK_LEADERBOARD: LeaderboardResponse = {
  courseId: 'mock-course-1',
  entries: [
    {
      studentId: 'stu-helper-001',
      studentName: 'Bharat',
      retention30d: 91,
      coverage: 88,
      rank: 1,
      isOptedOut: false,
      isCurrentUser: false,
    },
    {
      studentId: 'stu-helper-002',
      studentName: 'Asha',
      retention30d: 88,
      coverage: 92,
      rank: 2,
      isOptedOut: false,
      isCurrentUser: false,
    },
    {
      studentId: 'stu-helper-003',
      studentName: 'Vikram',
      retention30d: 85,
      coverage: 76,
      rank: 3,
      isOptedOut: false,
      isCurrentUser: false,
    },
    {
      studentId: DEMO_STUDENT_ID,
      studentName: 'You',
      retention30d: 78,
      coverage: 65,
      rank: 4,
      isOptedOut: false,
      isCurrentUser: true,
    },
    {
      studentId: 'stu-helper-004',
      studentName: 'Chandra',
      retention30d: 50,
      coverage: 80,
      rank: 5,
      isOptedOut: false,
      isCurrentUser: false,
    },
  ],
  currentUserRank: 4,
  currentUserPercentile: 20,
  totalStudents: 5,
};

/**
 * Mock mentor view. 3 rows per panel.
 */
const MOCK_MENTOR_VIEW: MentorViewResponse = {
  courseId: 'mock-course-1',
  stuckCards: [
    {
      studentId: 'stu-helper-004',
      studentName: 'Chandra',
      stuckCount: 7,
      dippingCount: 3,
    },
    {
      studentId: 'stu-helper-001',
      studentName: 'Bharat',
      stuckCount: 1,
      dippingCount: 0,
    },
    {
      studentId: 'stu-helper-002',
      studentName: 'Asha',
      stuckCount: 0,
      dippingCount: 0,
    },
  ],
  nextBadges: [
    {
      studentId: 'stu-helper-002',
      studentName: 'Asha',
      badgeId: 'pranam',
      badgeName: 'Pranam',
      distance: 1,
      unit: 'review',
    },
    {
      studentId: 'stu-helper-001',
      studentName: 'Bharat',
      badgeId: 'kohinoor',
      badgeName: 'Kohinoor',
      distance: 4,
      unit: 'questions at EF ≥ 2.5',
    },
    {
      studentId: 'stu-helper-004',
      studentName: 'Chandra',
      badgeId: 'sipahi',
      badgeName: 'Sipahi',
      distance: 2,
      unit: 'days',
    },
  ],
  learnerCategories: [
    {
      studentId: 'stu-helper-001',
      studentName: 'Bharat',
      retention30d: 91,
      coverage: 35,
      category: 'mastery-only',
    },
    {
      studentId: 'stu-helper-002',
      studentName: 'Asha',
      retention30d: 88,
      coverage: 88,
      category: 'all-rounder',
    },
    {
      studentId: 'stu-helper-003',
      studentName: 'Vikram',
      retention30d: 85,
      coverage: 76,
      category: 'all-rounder',
    },
    {
      studentId: DEMO_STUDENT_ID,
      studentName: 'You',
      retention30d: 78,
      coverage: 65,
      category: 'all-rounder',
    },
    {
      studentId: 'stu-helper-004',
      studentName: 'Chandra',
      retention30d: 50,
      coverage: 80,
      category: 'sprinter',
    },
  ],
};

// ── Mock opt-out state (Pillar 3) ────────────────────────────────────────────

/**
 * Storage shape for the mock opt-out state. We persist to
 * localStorage so refreshes preserve the user's choice — same
 * pattern as `spaced-repetition-api.ts`'s `vibe_sr_mock_v2`.
 *
 * Format: `{ [courseId]: string[] }` where each courseId maps to
 * the list of studentIds opted out of that course's leaderboard.
 * Equivalent in shape to `OptOutRepository.getOptOutsForCourse`
 * bulk-fetched per course on the backend.
 */
type MockOptOutState = Record<string, string[]>;

/**
 * In-memory cache, hydrated from localStorage at module load.
 * Empty object if storage is missing or malformed — fail-open.
 */
let mockOptOutState: MockOptOutState = {};

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem(MOCK_MOTIVATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockOptOutState;
      if (parsed && typeof parsed === 'object') {
        mockOptOutState = parsed;
      }
    }
  }
} catch {
  // Fail-open: leave `mockOptOutState = {}` so the demo doesn't
  // crash on storage errors (private mode, quota, etc.).
}

/** Persist current state to localStorage. Best-effort. */
function persistOptOutState(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      MOCK_MOTIVATION_STORAGE_KEY,
      JSON.stringify(mockOptOutState),
    );
  } catch {
    // Storage full / disabled — keep going. Demo never blocks on this.
  }
}

/**
 * Returns the list of studentIds opted out of a course's leaderboard.
 * Mock-only — mirrors `OptOutRepository.getOptOutsForCourse`.
 */
function mockGetOptOutsForCourse(courseId: string): string[] {
  return mockOptOutState[courseId] ?? [];
}

/**
 * NOTE: `mockGetOptOutsForStudent` and `mockIsOptedOut` are
 * trivial derivations of `mockGetOptOutsForCourse` and not yet
 * consumed by the UI. If the banner needs them later (e.g. to
 * show "you're opted out of N courses"), add them back here.
 */

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the student's badge progress and status snapshots.
 * In v1, runs entirely on mock data. Real network call is a
 * placeholder for Day 2.
 */
export async function getMyMotivation(
  studentId: string,
): Promise<MotivationMeResponse> {
  if (!studentId) {
    return { studentId: '', badges: [], status: [] };
  }
  if (USE_MOTIVATION_MOCK) {
    // Simulate small network latency for a more realistic feel.
    await new Promise((r) => setTimeout(r, 50));
    return {
      studentId,
      badges: MOCK_BADGE_PROGRESS,
      status: MOCK_STATUS_SNAPSHOTS,
    };
  }
  // Real network path — Day 2.
  const res = await fetch(`/api/motivation/${studentId}/me`);
  if (!res.ok) {
    return { studentId, badges: [], status: [] };
  }
  return res.json();
}

/**
 * Returns the course-scoped leaderboard. Empty response for
 * unknown / empty course IDs.
 *
 * In mock-land, applies the persisted opt-out state on the fly:
 *   - `isOptedOut: true` for opted-out students
 *   - `rank: null` for opted-out students (sinks to bottom)
 *   - `currentUserRank` recomputed to reflect the re-sort
 *
 * Mirrors the backend's behaviour in `MotivationController
 * .getCourseLeaderboard` (which calls `getOptOutsForCourse`
 * and recomputes rank from the surviving non-opted-out set).
 * The mock keeps `MOCK_LEADERBOARD` as the static snapshot of
 * the unranked roster, then derives the live view at call time.
 */
export async function getCourseLeaderboard(
  courseId: string,
  studentId: string,
): Promise<LeaderboardResponse> {
  if (!courseId) {
    return {
      courseId: '',
      entries: [],
      currentUserRank: null,
      currentUserPercentile: null,
      totalStudents: 0,
    };
  }
  if (USE_MOTIVATION_MOCK) {
    await new Promise((r) => setTimeout(r, 50));
    return deriveMockLeaderboard(courseId, studentId);
  }
  const res = await fetch(
    `/api/motivation/courses/${courseId}/leaderboard?studentId=${encodeURIComponent(studentId)}`,
  );
  if (!res.ok) {
    return {
      courseId,
      entries: [],
      currentUserRank: null,
      currentUserPercentile: null,
      totalStudents: 0,
    };
  }
  return res.json();
}

/**
 * Mock-only derivation of the live leaderboard view from the
 * static `MOCK_LEADERBOARD` + persisted opt-out state.
 *
 * Algorithm:
 *   1. Take the static roster (5 students in `mock-course-1`).
 *   2. Mark opted-out students (`isOptedOut: true`).
 *   3. Split into ranked vs opted-out.
 *   4. Ranked: sort by `retention30d` desc, assign `rank` 1..N.
 *   5. Opted-out: sink to bottom, `rank: null`.
 *   6. `currentUserRank` is the rank of `studentId` in the
 *      ranked set, or `null` if the current user is opted out
 *      or not on the leaderboard.
 *   7. `currentUserPercentile` mirrors the static mock (the
 *      demo cohort is small enough that the percentile only
 *      meaningfully shifts when an entry leaves/joins, which
 *      isn't the demo's purpose).
 *
 * Exported for shared use by tests + UI consumers that need to
 * re-derive without going through the async API.
 */
export function deriveMockLeaderboard(
  courseId: string,
  studentId: string,
): LeaderboardResponse {
  // For mock-cohort: we know MOCK_LEADERBOARD.courseId is fixed.
  // For other courseIds, return an empty shell.
  if (courseId !== MOCK_LEADERBOARD.courseId) {
    return {
      courseId,
      entries: [],
      currentUserRank: null,
      currentUserPercentile: null,
      totalStudents: 0,
    };
  }

  const optedOutIds = new Set(mockGetOptOutsForCourse(courseId));
  const baseRoster = MOCK_LEADERBOARD.entries;

  // Mark opted-out flag on the base roster (don't drop yet).
  const flagged = baseRoster.map((entry) => ({
    ...entry,
    isCurrentUser: entry.studentId === studentId,
    isOptedOut: optedOutIds.has(entry.studentId),
  }));

  // Partition.
  const ranked = flagged
    .filter((e) => !e.isOptedOut)
    .slice()
    .sort((a, b) => (b.retention30d ?? -1) - (a.retention30d ?? -1));
  const optedOut = flagged.filter((e) => e.isOptedOut);

  // Assign ranks.
  const rankedWithRank = ranked.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));

  // Opted-out sink to bottom, rank: null.
  const optedOutWithRank = optedOut.map((entry) => ({
    ...entry,
    rank: null,
  }));

  const entries = [...rankedWithRank, ...optedOutWithRank];

  // Compute currentUserRank from the ranked set (null if
  // opted-out or not present).
  const currentUserEntry = entries.find((e) => e.isCurrentUser);
  const currentUserRank =
    currentUserEntry?.rank ?? null;

  // Percentile: keep the mock's precomputed value when nothing
  // structural changed (current user is still in the cohort).
  // When the current user opts out, force null — same as backend.
  const currentUserPercentile =
    currentUserRank === null
      ? null
      : MOCK_LEADERBOARD.currentUserPercentile;

  return {
    courseId,
    entries,
    currentUserRank,
    currentUserPercentile,
    totalStudents: flagged.length,
  };
}

/**
 * Returns the mentor view for a course. Empty response for
 * unknown / empty course IDs.
 */
export async function getCourseMentorView(
  courseId: string,
): Promise<MentorViewResponse> {
  if (!courseId) {
    return {
      courseId: '',
      stuckCards: [],
      nextBadges: [],
      learnerCategories: [],
    };
  }
  if (USE_MOTIVATION_MOCK) {
    await new Promise((r) => setTimeout(r, 50));
    return MOCK_MENTOR_VIEW;
  }
  const res = await fetch(`/api/motivation/courses/${courseId}/mentor-view`);
  if (!res.ok) {
    return {
      courseId,
      stuckCards: [],
      nextBadges: [],
      learnerCategories: [],
    };
  }
  return res.json();
}

// ── Opt-out mutation (Pillar 3) ─────────────────────────────────────────────

/**
 * PATCH `/api/motivation/students/:studentId/courses/:courseId/opt-out`.
 *
 * Self-only on the backend — the controller's `_assertSelfOnly`
 * guard rejects admin/teacher overrides. Frontend mirrors this
 * by trusting the backend's 403 if it ever fires (the UI never
 * constructs a mutation for a non-self student, but defense in
 * depth).
 *
 * Threshold gate (only when `optedOut = true`):
 *   - 30-day retention ≥ 90%
 *   - ≥ 100 reviews in last 30 days
 *
 * In mock-land: we hard-code the demo student as "above the bar"
 * (their `retention30d` is 91% — already on the seeded leaderboard
 * with that value). The `setOptOut` mock returns success without
 * checking; the UI banner (checkpoint 5) shows the threshold copy
 * statically when the user clicks "Step off", so the demo
 * narrative is: "you qualify → click → you've stepped off".
 * Threshold-gate failure paths are exercised by real-backend
 * integration (out of scope for the demo).
 *
 * Returns `OptOutResult` (a discriminated union). The hook layer
 * converts this into TanStack Query's `error` field so callers
 * can toast the failure reason.
 */
export async function setOptOut(
  studentId: string,
  courseId: string,
  optedOut: boolean,
): Promise<OptOutResult> {
  if (!studentId || !courseId) {
    return {
      ok: false,
      error: { status: 403, reason: 'Missing studentId or courseId' },
    };
  }
  if (USE_MOTIVATION_MOCK) {
    await new Promise((r) => setTimeout(r, 50));
    return mockSetOptOut(studentId, courseId, optedOut);
  }
  const res = await fetch(
    `/api/motivation/students/${encodeURIComponent(studentId)}/courses/${encodeURIComponent(courseId)}/opt-out`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optedOut }),
    },
  );
  if (!res.ok) {
    // Try to parse a backend reason string; fall back to generic.
    let reason = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) reason = body.message;
    } catch {
      // Body wasn't JSON — keep generic.
    }
    return {
      ok: false,
      error: { status: res.status, reason },
    };
  }
  const response = (await res.json()) as OptOutResponse;
  return { ok: true, response };
}

/**
 * Mock implementation of `setOptOut`. Persists to localStorage so
 * the choice survives reloads. Returns a discriminated-union
 * `OptOutResult` mirroring the real endpoint's contract.
 *
 * Idempotency semantics (matches `OptOutRepository.setOptOut`):
 *   - `optedOut = true` on a not-yet-opted-out student:
 *       inserts the studentId into the course's array,
 *       returns `{ ok: true, response: { changed: true, optedOutAt: <new Date> } }`.
 *   - `optedOut = true` on an already-opted-out student:
 *       no-op on the array, returns `{ ok: true, response: { changed: false,
 *       optedOutAt: <existing or new Date> } }`.
 *   - `optedOut = false` on a currently-opted-out student:
 *       removes the studentId from the array,
 *       returns `{ ok: true, response: { changed: true, optedOutAt: null } }`.
 *   - `optedOut = false` on a not-opted-out student:
 *       no-op, returns `{ ok: true, response: { changed: false, optedOutAt: null } }`.
 *
 * The `changed` semantics here match the backend's contract
 * (`upsertedCount > 0` for opt-in; `deletedCount > 0` for opt-out).
 */
function mockSetOptOut(
  studentId: string,
  courseId: string,
  optedOut: boolean,
): OptOutResult {
  const current = mockOptOutState[courseId] ?? [];
  if (optedOut) {
    if (current.includes(studentId)) {
      // No-op: already opted out. Refresh timestamp.
      return {
        ok: true,
        response: {
          studentId,
          courseId,
          optedOut: true,
          changed: false,
          optedOutAt: new Date(),
        },
      };
    }
    mockOptOutState = {
      ...mockOptOutState,
      [courseId]: [...current, studentId],
    };
    persistOptOutState();
    return {
      ok: true,
      response: {
        studentId,
        courseId,
        optedOut: true,
        changed: true,
        optedOutAt: new Date(),
      },
    };
  }
  if (!current.includes(studentId)) {
    return {
      ok: true,
      response: {
        studentId,
        courseId,
        optedOut: false,
        changed: false,
        optedOutAt: null,
      },
    };
  }
  mockOptOutState = {
    ...mockOptOutState,
    [courseId]: current.filter((id) => id !== studentId),
  };
  persistOptOutState();
  return {
    ok: true,
    response: {
      studentId,
      courseId,
      optedOut: false,
      changed: true,
      optedOutAt: null,
    },
  };
}

// ── Pure helper (also exported for shared use) ─────────────────────────────

/**
 * Classifies a student into a 2×2 quadrant based on their two
 * metrics. Pure function — same logic runs on the backend and
 * in the frontend mock. Threshold values are tuned for a 5-student
 * cohort; calibrating them for real cohorts is a v1.1 task.
 *
 * Quadrant cut-offs:
 *   - "high" retention threshold: 80%
 *   - "high" coverage threshold: 70%
 *   - "quiet" exclusion: more than 20 reviews in 30 days
 *     (otherwise the student is "quiet" — engagement signal)
 */
export function computeLearnerCategory(
  retention30d: number | null,
  coverage: number,
  reviewsIn30d: number,
): LearnerCategory {
  if (retention30d === null || reviewsIn30d < 20) {
    return 'quiet';
  }
  const highRetention = retention30d >= 80;
  const highCoverage = coverage >= 70;
  if (highRetention && highCoverage) return 'all-rounder';
  if (highRetention && !highCoverage) return 'mastery-only';
  if (!highRetention && highCoverage) return 'sprinter';
  return 'quiet';
}

// ── Next-badge proximity (mock parity) ──────────────────────────────────────

/**
 * Per-badge "unit" string for the mock distance column. Matches the
 * backend's `BADGE_DISTANCE_UNIT` in `MotivationService.ts`. If you
 * change one, change the other (Day 3 follow-up: share via type).
 */
const MOCK_BADGE_DISTANCE_UNIT: Record<BadgeId, string> = {
  dwarapala: 'review',
  pranam: 'questions',
  kanchuki: 'streak-days',
  sipahi: 'reviews',
  'sukh-dukh': 'unsure-answers',
  vaidya: 'recovered-cards',
  kohinoor: 'sipahi-courses',
  pundit: 'sipahi-courses',
  simha: 'streak-days',
  rajkumar: 'tier-3-badges',
  mantri: 'recovered-cards',
  vikram: 'kohinoor-courses',
};

/** Tier precedence for tie-breaking. Entry wins over apprentice, etc. */
const MOCK_TIER_PRECEDENCE: Record<BadgeTier, number> = {
  entry: 0,
  apprentice: 1,
  courtier: 2,
  royalty: 3,
};

/**
 * Given a student's precomputed `BadgeProgress[]`, return their
 * single closest unearned badge as a `NextBadgeProximity` row, or
 * `null` if all 12 are earned.
 *
 * Mirrors `computeNextBadgeProximity` in the backend service. Sort
 * key: distance asc, then tier precedence, then alphabetic badge id.
 *
 * TODO Day 3 follow-up: pin parity via a shared test that imports
 * both this function and the backend service and asserts identical
 * output for a known fixture.
 */
export function computeMockNextBadgeProximity(
  badges: BadgeProgress[],
): NextBadgeProximity | null {
  const unearned = badges.filter(
    (b) => !b.earned && b.progress.target - b.progress.current > 0,
  );
  if (unearned.length === 0) return null;

  const decorated = unearned.map((b) => ({
    badge: b.badge,
    distance: Math.max(0, b.progress.target - b.progress.current),
  }));

  decorated.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    const tA = MOCK_TIER_PRECEDENCE[a.badge.tier] ?? 99;
    const tB = MOCK_TIER_PRECEDENCE[b.badge.tier] ?? 99;
    if (tA !== tB) return tA - tB;
    return a.badge.id.localeCompare(b.badge.id);
  });

  const winner = decorated[0];
  return {
    studentId: '', // controller / caller fills in
    studentName: '',
    badgeId: winner.badge.id,
    badgeName: winner.badge.name,
    distance: winner.distance,
    unit: MOCK_BADGE_DISTANCE_UNIT[winner.badge.id] ?? 'units',
  };
}

// ── Per-student profile mock data (drill-in from leaderboard) ────────────────
//
// When a student taps another student's row in the leaderboard
// (Step 4 work — `StudentProfileModal`), the modal needs:
//   - The student's badge progress (12 badges), so we can reuse the
//     existing `BadgeGrid` component without a new render path.
//   - The student's 30-day average EF (Easiness Factor from SM-2),
//     so the modal can show a single-number retention proxy.
//   - The student's display name + the course context, so the modal
//     header reads "Bharat · European Capitals".
//
// In production these come from two endpoints (or one joined one):
//   - `GET /api/motivation/students/:studentId/badges`
//   - `GET /api/spaced-repetition/students/:studentId/ef`
//
// For the demo, both are derived from the existing
// `MOCK_LEADERBOARD.entries` ordering and tier-progression curves
// — each cohort student gets a hand-tuned badge set that *looks*
// like a believable arc for their leaderboard rank. The mapping
// is intentionally not derived from the demo student's arc
// (so opening Bharat's profile tells a different story from
// opening your own).
//
// Step 3 will declare a `StudentProfile` type in
// `motivation.types.ts`; Step 4 will add `getStudentProfile()` and
// wire the modal. This block only adds the seed data.

// ── Per-student avg EF (Easiness Factor from SM-2) ───────────────────────
//
// SM-2 EF lives in [1.3, ∞). Cohort students cluster around 1.8–2.6
// depending on retention. These values are deliberately not
// derivable from `retention30d` (the leaderboard shows a public
// metric, not a private EF) — so the modal feels like a deeper
// view, not a re-statement of what's already on screen.
const MOCK_STUDENT_AVG_EF: Record<string, number> = {
  'stu-helper-001': 2.42, // Bharat — top retention, mastered
  'stu-helper-002': 2.28, // Asha — all-rounder, strong
  'stu-helper-003': 1.97, // Vikram — mid-pack, mid EF
  [DEMO_STUDENT_ID]: 1.84, // You — struggling but engaged
  'stu-helper-004': 1.45, // Chandra — stuck, dipping EF
};

// ── Per-student badge progress (12 entries per student) ─────────────────
//
// Each student's tier story is tuned to their leaderboard rank:
//   - Bharat (rank 1, top retention): Tier 1 + Tier 2 mostly earned,
//     Tier 3 partial. The star student.
//   - Asha (rank 2, broad coverage): Tier 1 + Tier 2 fully earned,
//     Tier 3 partial. The all-rounder.
//   - Vikram (rank 3, mid): Tier 1 earned, Tier 2 partial.
//   - You (rank 4, demo student): Tier 1 earned, Tier 2 light.
//   - Chandra (rank 5, struggling): Tier 1 partial only.
//
// Hand-tuned (not generated) because the criteria texts in
// `BADGE_CATALOGUE` are specific — random generation would
// produce nonsense like "12 of 30 days" for `kanchuki`. This
// stays in sync with the demo seed file in `scripts/.trash/`
// should a regen be needed.

/**
 * Helper for tier-level seed construction. Returns a partial
 * `BadgeProgress` map keyed by tier, then merges with the
 * catalogue in `mockStudentBadgesForStudent`. Kept inline (not
 * exported) because it's purely a mock-data convenience.
 */
function seedStudentBadges(opts: {
  studentId: string;
  earnedTiers: BadgeTier[];
  partialTiers: Array<{ tier: BadgeTier; progress: Partial<Record<BadgeId, { current: number; target: number; unit: string }>> }>;
}): BadgeProgress[] {
  return BADGE_CATALOGUE.map((badge) => {
    // Fully earned if the badge's tier is in `earnedTiers`.
    if (opts.earnedTiers.includes(badge.tier)) {
      const target = badge.id === 'dwarapala' ? 1 : badge.id === 'pranam' ? 10 : badge.id === 'sipahi' ? 30 : badge.id === 'sukh-dukh' ? 25 : badge.id === 'vaidya' ? 10 : badge.id === 'kohinoor' ? 100 : badge.id === 'pundit' ? 3 : badge.id === 'simha' ? 100 : badge.id === 'rajkumar' ? 1000 : badge.id === 'mantri' ? 50 : 1;
      return {
        badge,
        earned: true,
        earnedAt: new Date('2026-07-12'),
        progress: {
          current: target,
          target,
          unit: badge.id === 'dwarapala' ? 'review' : badge.id === 'pranam' ? 'questions' : badge.id === 'sipahi' ? 'days' : badge.id === 'sukh-dukh' ? 'unsure-answers' : badge.id === 'vaidya' ? 'cards recovered' : badge.id === 'kohinoor' ? 'questions at EF ≥ 2.5' : badge.id === 'pundit' ? 'courses with Tier-2 badge' : badge.id === 'simha' ? 'days' : badge.id === 'rajkumar' ? 'lifetime reviews' : badge.id === 'mantri' ? 'cards recovered' : 'throne',
        },
      };
    }
    // Partial: look up in the partial map.
    const partial = opts.partialTiers.find((p) => p.tier === badge.tier);
    if (partial && partial.progress[badge.id]) {
      const cfg = partial.progress[badge.id]!;
      return {
        badge,
        earned: false,
        progress: { current: cfg.current, target: cfg.target, unit: cfg.unit },
      };
    }
    // Otherwise: zero progress, locked.
    return {
      badge,
      earned: false,
      progress: { current: 0, target: 1, unit: 'locked' },
    };
  });
}

// Hand-tuned per-student badge sets. The shape mirrors
// `MOCK_BADGE_PROGRESS` (which is the demo student's data) so
// future code can reuse the same BadgeGrid rendering path.
const MOCK_STUDENT_BADGE_PROGRESS: Record<string, BadgeProgress[]> = {
  // Bharat — top of the leaderboard. Tier 1+2 earned, Tier 3 partial.
  'stu-helper-001': seedStudentBadges({
    studentId: 'stu-helper-001',
    earnedTiers: ['entry', 'apprentice'],
    partialTiers: [
      {
        tier: 'courtier',
        progress: {
          kohinoor: { current: 73, target: 100, unit: 'questions at EF ≥ 2.5' },
          pundit: { current: 2, target: 3, unit: 'courses with Tier-2 badge' },
          simha: { current: 87, target: 100, unit: 'days' },
        },
      },
      {
        tier: 'royalty',
        progress: {
          rajkumar: { current: 412, target: 1000, unit: 'lifetime reviews' },
          mantri: { current: 31, target: 50, unit: 'cards recovered' },
          vikram: { current: 0, target: 1, unit: 'throne' },
        },
      },
    ],
  }),
  // Asha — all-rounder. Tier 1+2 earned, Tier 3 mid-progression.
  'stu-helper-002': seedStudentBadges({
    studentId: 'stu-helper-002',
    earnedTiers: ['entry', 'apprentice'],
    partialTiers: [
      {
        tier: 'courtier',
        progress: {
          kohinoor: { current: 54, target: 100, unit: 'questions at EF ≥ 2.5' },
          pundit: { current: 1, target: 3, unit: 'courses with Tier-2 badge' },
          simha: { current: 41, target: 100, unit: 'days' },
        },
      },
      {
        tier: 'royalty',
        progress: {
          rajkumar: { current: 287, target: 1000, unit: 'lifetime reviews' },
          mantri: { current: 18, target: 50, unit: 'cards recovered' },
          vikram: { current: 0, target: 1, unit: 'throne' },
        },
      },
    ],
  }),
  // Vikram — mid-pack. Tier 1 earned, Tier 2 partial.
  'stu-helper-003': seedStudentBadges({
    studentId: 'stu-helper-003',
    earnedTiers: ['entry'],
    partialTiers: [
      {
        tier: 'apprentice',
        progress: {
          sipahi: { current: 19, target: 30, unit: 'days' },
          'sukh-dukh': { current: 22, target: 25, unit: 'unsure-answers' },
          vaidya: { current: 8, target: 10, unit: 'cards recovered' },
        },
      },
      {
        tier: 'courtier',
        progress: {
          kohinoor: { current: 21, target: 100, unit: 'questions at EF ≥ 2.5' },
          pundit: { current: 0, target: 3, unit: 'courses with Tier-2 badge' },
          simha: { current: 19, target: 100, unit: 'days' },
        },
      },
      {
        tier: 'royalty',
        progress: {
          rajkumar: { current: 134, target: 1000, unit: 'lifetime reviews' },
          mantri: { current: 6, target: 50, unit: 'cards recovered' },
          vikram: { current: 0, target: 1, unit: 'throne' },
        },
      },
    ],
  }),
  // You — the demo student. Tier 1 earned, Tier 2 light.
  [DEMO_STUDENT_ID]: seedStudentBadges({
    studentId: DEMO_STUDENT_ID,
    earnedTiers: ['entry'],
    partialTiers: [
      {
        tier: 'apprentice',
        progress: {
          sipahi: { current: 12, target: 30, unit: 'days' },
          'sukh-dukh': { current: 18, target: 25, unit: 'unsure-answers' },
          vaidya: { current: 7, target: 10, unit: 'cards recovered' },
        },
      },
      {
        tier: 'courtier',
        progress: {
          kohinoor: { current: 87, target: 100, unit: 'questions at EF ≥ 2.5' },
          pundit: { current: 1, target: 3, unit: 'courses with Tier-2 badge' },
          simha: { current: 12, target: 100, unit: 'days' },
        },
      },
      {
        tier: 'royalty',
        progress: {
          rajkumar: { current: 247, target: 1000, unit: 'lifetime reviews' },
          mantri: { current: 23, target: 50, unit: 'cards recovered' },
          vikram: { current: 0, target: 1, unit: 'throne' },
        },
      },
    ],
  }),
  // Chandra — stuck. Tier 1 mostly earned, Tier 2 zero.
  'stu-helper-004': seedStudentBadges({
    studentId: 'stu-helper-004',
    earnedTiers: ['entry'],
    partialTiers: [
      {
        tier: 'apprentice',
        progress: {
          sipahi: { current: 2, target: 30, unit: 'days' },
          'sukh-dukh': { current: 1, target: 25, unit: 'unsure-answers' },
          vaidya: { current: 0, target: 10, unit: 'cards recovered' },
        },
      },
      {
        tier: 'courtier',
        progress: {
          kohinoor: { current: 3, target: 100, unit: 'questions at EF ≥ 2.5' },
          pundit: { current: 0, target: 3, unit: 'courses with Tier-2 badge' },
          simha: { current: 2, target: 100, unit: 'days' },
        },
      },
      {
        tier: 'royalty',
        progress: {
          rajkumar: { current: 18, target: 1000, unit: 'lifetime reviews' },
          mantri: { current: 1, target: 50, unit: 'cards recovered' },
          vikram: { current: 0, target: 1, unit: 'throne' },
        },
      },
    ],
  }),
};

/**
 * Returns the cohort student's display name (matches the
 * leaderboard entry). Helper used by `getStudentProfile` in
 * Step 4 — exported here so the test suite (Step 6) can verify
 * the seed without going through the async API.
 */
export function getMockStudentName(studentId: string): string {
  if (studentId === DEMO_STUDENT_ID) return 'You';
  const entry = MOCK_LEADERBOARD.entries.find((e) => e.studentId === studentId);
  return entry?.studentName ?? studentId;
}

/**
 * Returns the 30-day average EF for a cohort student. Falls back
 * to the SM-2 floor (1.3) when the studentId isn't in the seed —
 * safe default that never panics the modal UI.
 */
export function getMockStudentAvgEf(studentId: string): number {
  return MOCK_STUDENT_AVG_EF[studentId] ?? 1.3;
}

/**
 * Returns the cohort student's 12-badge progress array (same
 * shape as `MOCK_BADGE_PROGRESS`). Returns an empty array for
 * unknown studentIds so the modal renders an empty BadgeGrid
 * instead of crashing.
 */
export function getMockStudentBadgeProgress(studentId: string): BadgeProgress[] {
  return MOCK_STUDENT_BADGE_PROGRESS[studentId] ?? [];
}

// ── getStudentProfile (live + mock) ───────────────────────────────────
//
// Reads a student's profile for the drill-in modal that opens
// when a student taps another student's row in the leaderboard.
//
// Live shape: `GET /api/motivation/students/:studentId/profile?courseId=...`
// (future endpoint; not yet implemented on the backend).
// Mock shape: same return type, sourced from the per-student
// seed maps added above (`MOCK_STUDENT_BADGE_PROGRESS`,
// `MOCK_STUDENT_AVG_EF`) plus the existing
// `MOCK_LEADERBOARD.entries` for the leaderboard-derived fields.
//
// Fail-open behavior: unknown studentIds return a stub profile
// (empty badges, EF=1.3 floor, isOptedOut: false) so the modal
// renders gracefully instead of crashing on a stale row click.

/**
 * Returns a fully-formed `StudentProfile` for the given student
 * in the given course. Used by `StudentProfileModal` via the
 * `useStudentProfile` hook (see `motivation-hooks.ts`).
 *
 * @param studentId The cohort student's Firebase UID.
 * @param courseId  The leaderboard's course context (so the modal
 *                  header can show "European Capitals").
 */
export async function getStudentProfile(
  studentId: string,
  courseId: string,
): Promise<StudentProfile> {
  if (USE_MOTIVATION_MOCK) {
    // Mock path: stitch together from the seed maps above.
    const leaderboardEntry = MOCK_LEADERBOARD.entries.find(
      (e) => e.studentId === studentId,
    );
    return {
      studentId,
      studentName: getMockStudentName(studentId),
      courseId,
      retention30d: leaderboardEntry?.retention30d ?? null,
      coverage: leaderboardEntry?.coverage ?? 0,
      avgEf: getMockStudentAvgEf(studentId),
      badges: getMockStudentBadgeProgress(studentId),
      isOptedOut: leaderboardEntry?.isOptedOut ?? false,
      // Deterministic avatar seed: studentId itself is fine for v1.
      avatarSeed: studentId,
    };
  }

  // Live path (future backend endpoint):
  //   GET /api/motivation/students/:studentId/profile?courseId=...
  // Not implemented on the backend yet; throws so the caller can
  // surface a "not available" message instead of silently failing.
  throw new Error(
    `getStudentProfile: live endpoint not implemented for ${studentId} / ${courseId}`,
  );
}
