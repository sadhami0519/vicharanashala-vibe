import { ContainerModule } from 'inversify';
import { MotivationController } from './controllers/MotivationController.js';
import { UserDirectoryRepository } from './repositories/index.js';
import { MOTIVATION_TYPES } from './types.js';

export const motivationContainerModule = new ContainerModule((options) => {
  // Repository — added 2026-07-25 for student-name resolution
  // (Day 3 Plan A2). Mirrors the StudentSRStatusRepository pattern
  // from the spaced repetition module: cross-module access narrowed
  // to a single file with one responsibility.
  options
    .bind(MOTIVATION_TYPES.UserDirectoryRepo)
    .to(UserDirectoryRepository)
    .inSingletonScope();

  // Controller
  options
    .bind(MotivationController)
    .toSelf()
    .inSingletonScope();
});