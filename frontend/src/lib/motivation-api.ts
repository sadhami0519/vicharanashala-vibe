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
  StatusSnapshot,
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
 * localStorage key. Not used in v1 (motivation is read-only — no
 * mutations to persist). Set up so v1.1 can add cross-side
 * reflection without a breaking change.
 */
export const MOCK_MOTIVATION_STORAGE_KEY = 'vibe_motivation_mock_v1';

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
 */
export async function getCourseLeaderboard(
  courseId: string,
  _studentId: string,
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
    return MOCK_LEADERBOARD;
  }
  const res = await fetch(
    `/api/motivation/courses/${courseId}/leaderboard?studentId=${encodeURIComponent(_studentId)}`,
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
