import {
  IQuestion,
  QuestionType,
  IQuestionParameter,
  ISOLSolution,
  ILotItem,
  ISMLSolution,
  IOTLSolution,
  ILotOrder,
  INATSolution,
  IDESSolution,
  Priority,
  BloomLevel,
  QuestionSource,
  QuestionReviewStatus,
} from '#shared/interfaces/quiz.js';
import {ObjectId} from 'mongodb';
import {
  ReviewOption,
  ReviewQuestionResponse,
} from '../../interfaces/review.js';
import {QuestionBody} from '../validators/QuestionValidator.js';

abstract class BaseQuestion implements IQuestion {
  _id?: string | ObjectId;
  createdBy?: string | ObjectId;
  text: string;
  type: QuestionType;
  isParameterized: boolean;
  bloomLevel?: BloomLevel;
  parameters?: IQuestionParameter[];
  hint?: string;
  timeLimitSeconds: number;
  points?: number;
  priority: Priority;
  source?: QuestionSource;
  reviewStatus?: QuestionReviewStatus;
  studentQuestionId?: string | ObjectId;
  isDeleted?: boolean;
  deletedAt?: Date;

  constructor(question: IQuestion, userId: string) {
    this._id = question._id;
    this.createdBy = new ObjectId(userId);
    this.text = question.text;
    this.type = question.type;
    this.isParameterized = question.isParameterized;
    this.bloomLevel = question.bloomLevel;
    this.parameters = question.parameters;
    this.hint = question.hint;
    this.timeLimitSeconds = question.timeLimitSeconds;
    this.points = question.points;
    this.priority = question.priority;
    this.source = question.source;
    this.reviewStatus = question.reviewStatus;
    this.studentQuestionId = question.studentQuestionId
      ? new ObjectId(question.studentQuestionId.toString())
      : undefined;
    this.isDeleted = false;
    this.deletedAt = undefined;
  }
}

class SOLQuestion extends BaseQuestion implements ISOLSolution {
  incorrectLotItems: ILotItem[];
  correctLotItem: ILotItem;

  constructor(userId: string, question: IQuestion, solution: ISOLSolution) {
    super(question, userId);
    this.incorrectLotItems = ensureLotItemIds(solution.incorrectLotItems);
    this.correctLotItem = {
      ...solution.correctLotItem,
      _id: solution.correctLotItem._id ?? new ObjectId(),
    };
  }
}

class SMLQuestion extends BaseQuestion implements ISMLSolution {
  incorrectLotItems: ILotItem[];
  correctLotItems: ILotItem[];

  constructor(userId: string, question: IQuestion, solution: ISMLSolution) {
    super(question, userId);
    this.incorrectLotItems = ensureLotItemIds(solution.incorrectLotItems);
    this.correctLotItems = ensureLotItemIds(solution.correctLotItems);
  }
}

class OTLQuestion extends BaseQuestion implements IOTLSolution {
  ordering: ILotOrder[];

  constructor(userId: string, question: IQuestion, solution: IOTLSolution) {
    super(question, userId);
    this.ordering = solution.ordering.map(order => ({
      ...order,
      lotItem: {
        ...order.lotItem,
        _id: order.lotItem._id ?? new ObjectId(),
      },
    }));
  }
}

class NATQuestion extends BaseQuestion implements INATSolution {
  decimalPrecision: number;
  upperLimit: number;
  lowerLimit: number;
  value?: number;
  expression?: string;

  constructor(userId: string, question: IQuestion, solution: INATSolution) {
    super(question, userId);
    this.decimalPrecision = solution.decimalPrecision;
    this.upperLimit = solution.upperLimit;
    this.lowerLimit = solution.lowerLimit;
    this.value = solution.value;
    this.expression = solution.expression;
  }
}

class DESQuestion extends BaseQuestion implements IDESSolution {
  solutionText: string;
  constructor(userId: string, question: IQuestion, solution: IDESSolution) {
    super(question, userId);
    this.solutionText = solution.solutionText;
  }
}

function ensureLotItemIds(items: ILotItem[]): ILotItem[] {
  return items.map(item => ({
    ...item,
    _id: item._id ?? new ObjectId(),
  }));
}

class QuestionFactory {
  static createQuestion(
    body: QuestionBody,
    userId: string,
  ): SOLQuestion | SMLQuestion | OTLQuestion | NATQuestion | DESQuestion {
    switch (body.question.type) {
      case 'SELECT_ONE_IN_LOT':
        return new SOLQuestion(
          userId,
          body.question,
          body.solution as ISOLSolution,
        );
      case 'SELECT_MANY_IN_LOT':
        return new SMLQuestion(
          userId,
          body.question,
          body.solution as ISMLSolution,
        );
      case 'ORDER_THE_LOTS':
        return new OTLQuestion(
          userId,
          body.question,
          body.solution as IOTLSolution,
        );
      case 'NUMERIC_ANSWER_TYPE':
        return new NATQuestion(
          userId,
          body.question,
          body.solution as INATSolution,
        );
      case 'DESCRIPTIVE':
        return new DESQuestion(
          userId,
          body.question,
          body.solution as IDESSolution,
        );
      default:
        throw new Error('Invalid question type');
    }
  }
}

const LETTER_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/**
 * Converts a question instance (SOL / SML / OTL / NAT / DES) into a
 * student-facing ReviewQuestionResponse — answer(s) are NEVER included.
 *
 * Security: `explaination` from ILotItem is intentionally omitted.
 */
export function toReviewQuestionResponse(
  question: BaseQuestion,
): ReviewQuestionResponse {
  const base = {
    id: question._id?.toString() ?? '',
    body: question.text,
    type: question.type,
    hint: question.hint,
    isParameterized: question.isParameterized,
    options: [] as ReviewOption[],
  };

  switch (question.type) {
    case 'SELECT_ONE_IN_LOT': {
      const sol = question as SOLQuestion;
      const allItems: ILotItem[] = [...(sol.incorrectLotItems ?? [])];
      if (sol.correctLotItem) {
        allItems.push(sol.correctLotItem);
      }
      return {
        ...base,
        options: allItems.slice(0, 8).map((item, i) => ({
          key: LETTER_KEYS[i],
          text: item.text,
        })),
      };
    }

    case 'SELECT_MANY_IN_LOT': {
      const sml = question as SMLQuestion;
      const allItems: ILotItem[] = [
        ...(sml.incorrectLotItems ?? []),
        ...(sml.correctLotItems ?? []),
      ];
      return {
        ...base,
        options: allItems.slice(0, 8).map((item, i) => ({
          key: LETTER_KEYS[i],
          text: item.text,
        })),
      };
    }

    case 'ORDER_THE_LOTS': {
      const otl = question as OTLQuestion;
      return {
        ...base,
        options: otl.ordering.slice(0, 8).map((order, i) => ({
          key: LETTER_KEYS[i],
          text: order.lotItem.text,
        })),
      };
    }

    // NUMERIC_ANSWER_TYPE and DESCRIPTIVE — no options in the UI
    case 'NUMERIC_ANSWER_TYPE':
    case 'DESCRIPTIVE':
    default:
      return {...base, options: []};
  }
}

const question: IQuestion = {
  text: 'This is question',
  isParameterized: true,
  parameters: [
    {
      name: 'a',
      possibleValues: ['20', '10'],
      type: 'number',
    },
    {
      name: 'b',
      possibleValues: ['10', '12'],
      type: 'number',
    },
  ],
  points: 10,
  type: 'SELECT_ONE_IN_LOT',
  timeLimitSeconds: 60,
  hint: 'This is easy',
  priority: 'LOW',
};

const solSolution: ISOLSolution = {
  incorrectLotItems: [
    {
      text: 'This is option 1',
      explaination: '',
    },
    {
      text: 'This is option 2',
      explaination: 'sdad',
    },
  ],
  correctLotItem: {
    text: '',
    explaination: '',
  },
};

const smlSolution: ISMLSolution = {
  incorrectLotItems: [
    {
      text: 'This is option 1',
      explaination: '',
    },
    {
      text: 'This is option 2',
      explaination: 'sdad',
    },
  ],
  correctLotItems: [
    {
      text: 'This is option 3',
      explaination: '',
    },
    {
      text: 'This is option 4',
      explaination: 'sdad',
    },
  ],
};

const otlSolution: IOTLSolution = {
  ordering: [
    {
      lotItem: {
        text: 'item 1',
        explaination: 'dahjkda',
      },
      order: 1,
    },
    {
      lotItem: {
        text: 'item 1',
        explaination: 'dahjkda',
      },
      order: 2,
    },
  ],
};

const mtlSolution = {
  matches: [
    {
      match: [
        {
          text: 'This is option 3',
          explaination: '',
        },
        {
          text: 'This is option 4',
          explaination: 'sdad',
        },
      ],
    },
    {
      match: [
        {
          text: 'This is option 3',
          explaination: '',
        },
        {
          text: 'This is option 4',
          explaination: 'sdad',
        },
      ],
    },
    {
      match: [
        {
          text: 'This is option 3',
          explaination: '',
        },
        {
          text: 'This is option 4',
          explaination: 'sdad',
        },
      ],
    },
  ],
};

const natSolution: INATSolution = {
  decimalPrecision: 1,
  upperLimit: 1.045,
  lowerLimit: 2.0,
  expression: '',
};

class FlaggedQuestion {
  _id?: string | ObjectId;
  questionId: string;
  courseId?: string;
  versionId?: string;
  flaggedBy: string;
  reason: string;
  createdAt: Date;
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  resolvedBy?: string;
  resolvedAt?: Date;

  constructor(
    questionId: string,
    userId: string,
    reason: string,
    courseId?: string,
    versionId?: string,
  ) {
    this.questionId = questionId;
    this.flaggedBy = userId;
    this.reason = reason;
    this.status = 'PENDING';
    this.createdAt = new Date();
    this.courseId = courseId;
    this.versionId = versionId;
  }
}

export {
  BaseQuestion,
  SOLQuestion,
  SMLQuestion,
  OTLQuestion,
  NATQuestion,
  DESQuestion,
  QuestionFactory,
  FlaggedQuestion,
};
