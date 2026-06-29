/**
 * Review-session screen types.
 *
 * These types power the spaced-repetition review UI — a student-facing,
 * read-only view of a question. The answer (correct option, explanation,
 * ordering sequence) is NEVER exposed.
 *
 * @category Quizzes
 */

/** A single multiple-choice option displayed to the student in the review screen. */
export interface ReviewOption {
  /** Letter key: 'A' | 'B' | 'C' | 'D' ... */
  key: string;
  /** Option display text */
  text: string;
}

/**
 * Unified question shape returned by `GET /quizzes/questions/:questionId/review`.
 *
 * All five question types (SOL / SML / OTL / NAT / DES) are normalised to this
 * shape so the frontend review card can render them uniformly.
 */
export interface ReviewQuestionResponse {
  id: string;
  body: string;
  type: string;
  hint?: string;
  options: ReviewOption[];
  isParameterized: boolean;
}