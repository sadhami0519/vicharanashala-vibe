/**
 * Inversify DI token symbols for the motivation module.
 *
 * Added 2026-07-25: UserDirectoryRepo (for student-name resolution in
 * the leaderboard + mentor view; previously these endpoints used
 * `studentId` as the placeholder).
 */
const TYPES = {
  MotivationController: Symbol.for('MotivationController'),
  UserDirectoryRepo: Symbol.for('Motivation.UserDirectoryRepo'),
};

export { TYPES as MOTIVATION_TYPES };
