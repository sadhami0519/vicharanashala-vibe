import { describe, it, expect } from 'vitest';
import { IReviewItem } from '../../spacedRepetition/interfaces/IReviewItem.js';
import {
  BADGE_CATALOGUE,
  computeBadgeProgress,
  computeCurrentStreak,
  computeLearnerCategory,
  computeLongestStreak,
  computeNextBadgeProximity,
  computeRetention30d,
  computeStatusSnapshots,
  getBadgeById,
  getBadgesByTier,
} from '../services/MotivationService.js';

// ── Helpers ───────────────────────────────────────────────────────────────

const STUDENT = 'student_123';
const COURSE = 'course_456';

function makeItem(overrides: Partial<{
  n: number;
  EF: number;
  interval_days: number;
  last_reviewed_at: Date | null;
  next_review_at: Date | null;
  student_id: string;
  course_id: string;
  question_id: string;
}> = {}): IReviewItem {
  return {
    _id: `item_${Math.random().toString(36).slice(2, 9)}`,
    student_id: STUDENT,
    course_id: COURSE,
    question_id: `q_${Math.random().toString(36).slice(2, 9)}`,
    n: 0,
    EF: 2.5,
    interval_days: 0,
    next_review_at: new Date(),
    last_reviewed_at: new Date(),
    notification_opt_out: false,
    is_paused: false,
    exam_prep_mode: false,
    ...overrides,
  } as unknown as IReviewItem;
}

function itemsAcrossDays(days: Date[]): IReviewItem[] {
  return days.map((d) => makeItem({ last_reviewed_at: d }));
}

// ── Catalogue helpers ─────────────────────────────────────────────────────

describe('getBadgesByTier', () => {
  it('returns 4 tiers with the right counts', () => {
    const grouped = getBadgesByTier();
    expect(Object.keys(grouped)).toEqual(
      expect.arrayContaining(['entry', 'apprentice', 'courtier', 'royalty']),
    );
    expect(grouped.entry.length).toBe(3);
    expect(grouped.apprentice.length).toBe(3);
    expect(grouped.courtier.length).toBe(3);
    expect(grouped.royalty.length).toBe(3);
    expect(BADGE_CATALOGUE.length).toBe(12);
  });
});

describe('getBadgeById', () => {
  it('finds the known badge', () => {
    expect(getBadgeById('vikram')?.name).toBe('Vikram');
    expect(getBadgeById('unknown')).toBeUndefined();
  });
});

// ── computeBadgeProgress ──────────────────────────────────────────────────

describe('computeBadgeProgress', () => {
  it('returns all 12 badges unearned for a fresh student', () => {
    const badges = computeBadgeProgress([makeItem({ last_reviewed_at: null })]);
    expect(badges.length).toBe(12);
    expect(badges.every((b) => !b.earned)).toBe(true);
    // Tier-1 entry badges (Dwarapala, Pranam, Kanchuki) start at 0.
    // Higher-tier badges may have current = courseCount > 0 even
    // when unearned — e.g. Vikram uses (current=target=count of
    // courses the student has touched). That's fine.
    const tier1 = badges.filter((b) => b.badge.tier === 'entry');
    expect(tier1.every((b) => b.progress.current === 0)).toBe(true);
  });

  it('awards Dwarapala when total reviews (n) ≥ 10', () => {
    const items = [makeItem({ n: 5 }), makeItem({ n: 5 })];
    const dwarapala = computeBadgeProgress(items).find((b) => b.badge.id === 'dwarapala');
    expect(dwarapala?.earned).toBe(true);
    expect(dwarapala?.progress.current).toBe(10);
    expect(dwarapala?.progress.target).toBe(10);
  });

  it('awards Pranam with 5+ recent reviews (uses n as proxy for review count)', () => {
    const items = Array.from({ length: 5 }, () => makeItem({ n: 1 }));
    const pranam = computeBadgeProgress(items).find((b) => b.badge.id === 'pranam');
    expect(pranam?.earned).toBe(true);
  });

  it('awards Kanchuki on 7-day current streak', () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    const kanchuki = computeBadgeProgress(itemsAcrossDays(days)).find(
      (b) => b.badge.id === 'kanchuki',
    );
    expect(kanchuki?.earned).toBe(true);
  });

  it('awards Sipahi on 20+ reviews with retention ≥ 80', () => {
    const items = Array.from({ length: 20 }, () => makeItem({ n: 2, EF: 2.7 }));
    const sipahi = computeBadgeProgress(items).find((b) => b.badge.id === 'sipahi');
    expect(sipahi?.earned).toBe(true);
  });

  it('does NOT award Sipahi if retention is below 80', () => {
    const items = Array.from({ length: 20 }, () => makeItem({ n: 1, EF: 2.3 }));
    const sipahi = computeBadgeProgress(items).find((b) => b.badge.id === 'sipahi');
    expect(sipahi?.earned).toBe(false);
  });

  it('awards Kohinoor when at least one course has Sipahi-equivalent items', () => {
    const items = [
      makeItem({ course_id: 'c1', n: 6, EF: 2.7 }),
      makeItem({ course_id: 'c1', n: 6, EF: 2.7 }),
    ];
    const kohinoor = computeBadgeProgress(items).find((b) => b.badge.id === 'kohinoor');
    expect(kohinoor?.earned).toBe(true);
  });

  it('awards Pundit on Sipahi-equivalent in 3 distinct courses', () => {
    const items = [
      makeItem({ course_id: 'c1', n: 6, EF: 2.7 }),
      makeItem({ course_id: 'c2', n: 6, EF: 2.7 }),
      makeItem({ course_id: 'c3', n: 6, EF: 2.7 }),
    ];
    const pundit = computeBadgeProgress(items).find((b) => b.badge.id === 'pundit');
    expect(pundit?.earned).toBe(true);
  });

  it('does NOT award Vikram without 365-day streak', () => {
    const items = [makeItem({ course_id: 'c1', n: 6, EF: 2.7 })];
    const vikram = computeBadgeProgress(items).find((b) => b.badge.id === 'vikram');
    expect(vikram?.earned).toBe(false);
  });

  it('earnedAt is null when not earned', () => {
    const badges = computeBadgeProgress([makeItem()]);
    expect(badges[0].earnedAt).toBeNull();
  });

  it('earnedAt is a Date when earned', () => {
    const items = Array.from({ length: 10 }, () => makeItem({ n: 1 }));
    const dwarapala = computeBadgeProgress(items).find((b) => b.badge.id === 'dwarapala');
    expect(dwarapala?.earnedAt).toBeInstanceOf(Date);
  });
});

// ── Streak helpers ────────────────────────────────────────────────────────

describe('computeCurrentStreak', () => {
  it('returns 0 for empty items', () => {
    expect(computeCurrentStreak([])).toBe(0);
  });

  it('returns 1 for a single review today', () => {
    expect(computeCurrentStreak([makeItem({ last_reviewed_at: new Date() })])).toBe(1);
  });

  it('counts consecutive days', () => {
    const days = Array.from({ length: 5 }, (_, i) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - (4 - i));
      return d;
    });
    expect(computeCurrentStreak(itemsAcrossDays(days))).toBe(5);
  });

  it('returns 0 when most recent review is 2+ days ago', () => {
    const old = new Date();
    old.setDate(old.getDate() - 3);
    expect(computeCurrentStreak([makeItem({ last_reviewed_at: old })])).toBe(0);
  });
});

describe('computeLongestStreak', () => {
  it('returns 0 for empty', () => {
    expect(computeLongestStreak([])).toBe(0);
  });

  it('finds the longest run even when broken by a gap', () => {
    const d = (daysAgo: number) => {
      const x = new Date();
      x.setHours(12, 0, 0, 0);
      x.setDate(x.getDate() - daysAgo);
      return x;
    };
    // Gap: reviews on days-ago [40,39,38,  30,29,28,27,26,25,24,23,22,21,20]
    const days = [
      d(40), d(39), d(38),
      d(30), d(29), d(28), d(27), d(26), d(25), d(24), d(23), d(22), d(21), d(20),
    ];
    expect(computeLongestStreak(itemsAcrossDays(days))).toBe(11);
  });
});

// ── Retention ─────────────────────────────────────────────────────────────

describe('computeRetention30d', () => {
  it('returns null when no recent reviews', () => {
    const old = new Date();
    old.setDate(old.getDate() - 60);
    expect(computeRetention30d([makeItem({ last_reviewed_at: old })])).toBeNull();
  });

  it('returns a 0-100 score for recent items', () => {
    const items = [makeItem({ EF: 2.5, last_reviewed_at: new Date() })];
    const r = computeRetention30d(items);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});

// ── Status snapshots ──────────────────────────────────────────────────────

describe('computeStatusSnapshots', () => {
  it('returns 5 metrics in canonical order', () => {
    const snapshots = computeStatusSnapshots([makeItem()]);
    expect(snapshots.map((s) => s.metric)).toEqual([
      'retention',
      'streak',
      'ef_stability',
      'volume',
      'stuck_cards',
    ]);
  });

  it('last30Days differs from allTime when items are outside window', () => {
    const old = new Date();
    old.setDate(old.getDate() - 60);
    const snapshots = computeStatusSnapshots([
      makeItem({ last_reviewed_at: old, n: 5 }),
    ]);
    const volume = snapshots.find((s) => s.metric === 'volume');
    expect(volume?.allTime.value).toBe(5);
    expect(volume?.last30Days.value).toBe(0);
  });

  it('counts stuck cards (n=0, EF<2.0)', () => {
    const snapshots = computeStatusSnapshots([
      makeItem({ n: 0, EF: 1.5 }),
      makeItem({ n: 0, EF: 1.8 }),
      makeItem({ n: 3, EF: 2.5 }),
    ]);
    const stuck = snapshots.find((s) => s.metric === 'stuck_cards');
    expect(stuck?.allTime.value).toBe(2);
  });
});

// ── Learner category ──────────────────────────────────────────────────────

describe('computeLearnerCategory', () => {
  it('classifies all-rounder (high retention + high coverage)', () => {
    expect(computeLearnerCategory(85, 75)).toBe('all-rounder');
  });

  it('classifies sprinter (low retention + high coverage)', () => {
    expect(computeLearnerCategory(60, 80)).toBe('sprinter');
  });

  it('classifies mastery-only (high retention + low coverage)', () => {
    expect(computeLearnerCategory(90, 30)).toBe('mastery-only');
  });

  it('classifies quiet (low both)', () => {
    expect(computeLearnerCategory(40, 30)).toBe('quiet');
  });

  it('treats null retention as low', () => {
    expect(computeLearnerCategory(null, 75)).toBe('sprinter');
  });
});

// ── Next-badge proximity ────────────────────────────────────────────

describe('computeNextBadgeProximity', () => {
  it('returns the closest unearned badge for an empty items list', () => {
    // Empty list → countDistinctCourses = 0 → Vikram current = target = 0
    // → distance 0, filtered out. All other badges have current = 0
    // and target = N. Two badges at distance 1: sukh-dukh (apprentice,
    // target=1) and kohinoor (courtier, target=1). Tier tie-break
    // picks sukh-dukh (apprentice < courtier).
    const result = computeNextBadgeProximity([]);
    expect(result).not.toBeNull();
    expect(result?.badgeId).toBe('sukh-dukh');
    expect(result?.distance).toBe(1);
  });

  it('returns Sukh Dukh (closest apprentice-tier badge) for a fresh student', () => {
    const items = [makeItem({ last_reviewed_at: null, n: 0, EF: 2.5 })];
    const result = computeNextBadgeProximity(items);
    expect(result).not.toBeNull();
    expect(result?.badgeId).toBe('sukh-dukh');
    expect(result?.badgeName).toBe('Sukh Dukh');
    expect(result?.distance).toBe(1);
    expect(result?.unit).toBe('unsure-answers');
  });

  it('prefers Dwarapala when total reviews (n) is closer to its target', () => {
    // n=8 on one item: dwarapala distance = 10 - 8 = 2 (wins over
    // sukh-dukh whose recovered-missed proxy is n=0).
    const items = [
      makeItem({ n: 8, EF: 2.7, last_reviewed_at: new Date() }),
    ];
    const result = computeNextBadgeProximity(items);
    expect(result?.badgeId).toBe('dwarapala');
    expect(result?.distance).toBe(2);
  });

  it('excludes Vikram even when current === target (zero distance, not earned)', () => {
    // Items in 2 courses → Vikram current = target = 2 → distance 0
    // but not earned. Must be filtered out; the next-closest wins.
    const items = [
      makeItem({ course_id: 'c1', last_reviewed_at: new Date(), n: 0 }),
      makeItem({ course_id: 'c2', last_reviewed_at: new Date(), n: 0 }),
    ];
    const result = computeNextBadgeProximity(items);
    expect(result).not.toBeNull();
    expect(result?.badgeId).not.toBe('vikram');
  });

  it('tie-breaks by tier (apprentice wins over courtier at distance=1)', () => {
    // Both sukh-dukh (apprentice, target=1) and kohinoor (courtier,
    // target=1) are at distance 1 for a fresh student. Apprentice
    // tier wins the tie-break.
    const result = computeNextBadgeProximity([]);
    const winner = BADGE_CATALOGUE.find((b) => b.id === result?.badgeId);
    expect(winner?.tier).toBe('apprentice');
  });
});