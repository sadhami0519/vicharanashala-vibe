import { QuizItem } from '#courses/classes/transformers/Item.js';
import { IQuestionBankRef } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { injectable, inject } from 'inversify';
import { Collection, ClientSession, ObjectId } from 'mongodb';

@injectable()
class QuizRepository {
  private quizCollection: Collection<QuizItem>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }

  private async init() {
    this.quizCollection = await this.db.getCollection<QuizItem>('quizzes');
  }

  async getById(
    quizId: string,
    session?: ClientSession,
  ): Promise<QuizItem | null> {
    await this.init();
    const result = await this.quizCollection.findOne(
      { _id: new ObjectId(quizId) },
      { session },
    );

    if (!result) {
      return null;
    }
    return {
      ...result,
      details: {
        ...result.details,
        questionBankRefs: (result.details?.questionBankRefs ?? []).map(
          (ref: IQuestionBankRef) => {
            return {
              ...ref,
              bankId: ref.bankId.toString(),
            };
          },
        ),
      },
    };
  }

  async getByIds(
    quizId: string[],
    session?: ClientSession,
  ): Promise<null | QuizItem[]> {
    await this.init();
    const objectIds = quizId.map(id => new ObjectId(id));
    const quizItems = await this.quizCollection
      .find({ _id: { $in: objectIds } }, { session })
      .toArray();

    if (!quizItems.length) {
      return null;
    }

    return quizItems.map(item => ({
      ...item,
      details: {
        ...item.details,
        questionBankRefs: (item.details?.questionBankRefs ?? []).map((ref: any) => ({
          ...ref,
          bankId: ref.bankId.toString(),
        })),
      },
    }));
  }

  async updateQuiz(quiz: QuizItem, session?: ClientSession): Promise<QuizItem> {
    await this.init();
    const result = await this.quizCollection.findOneAndUpdate(
      { _id: new ObjectId(quiz._id) },
      { $set: quiz },
      { returnDocument: 'after', session },
    );
    if (!result) {
      return null;
    }
    return result;
  }

  async findSkipAllowedQuizzes(
    bankIds: string[],
    session?: ClientSession,
  ): Promise<QuizItem[] | null> {
    await this.init();
    const objectIds = bankIds.map(id => new ObjectId(id));
    const quizzes = await this.quizCollection
      .find(
        {
          'details.allowSkip': true,
          'details.questionBankRefs.bankId': { $in: objectIds },
        },
        { session },
      )
      .toArray();

    if (!quizzes.length) {
      return null;
    }

    return quizzes;
  }

  /**
   * Find all QuizItem docs whose `details.questionBankRefs[].bankId` is in
   * the given list. Unlike `findSkipAllowedQuizzes`, this does NOT filter
   * on `details.allowSkip` — the call site needs every quiz that links to
   * one of the banks, not just the ones with skip enabled.
   *
   * Used by `QuestionService._resolveParentQuiz` to attribute a question to
   * its parent quiz for the spaced-repetition review card.
   */
  async findQuizzesByBankIds(
    bankIds: string[],
    session?: ClientSession,
  ): Promise<QuizItem[] | null> {
    await this.init();
    const objectIds = bankIds.map(id => new ObjectId(id));
    const quizzes = await this.quizCollection
      .find(
        {
          'details.questionBankRefs.bankId': { $in: objectIds },
        },
        { session },
      )
      .toArray();

    if (!quizzes.length) {
      return null;
    }

    return quizzes;
  }
}

export { QuizRepository };
