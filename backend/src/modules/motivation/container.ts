import { ContainerModule } from 'inversify';
import { MotivationController } from './controllers/MotivationController.js';

export const motivationContainerModule = new ContainerModule((options) => {
  options
    .bind(MotivationController)
    .toSelf()
    .inSingletonScope();
});
