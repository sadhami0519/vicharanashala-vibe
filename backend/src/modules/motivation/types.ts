/**
 * Inversify DI token symbols for the motivation module.
 *
 * Only one injectable class — the controller — since the service
 * is a module of pure functions, not a class.
 */
const TYPES = {
  MotivationController: Symbol.for('MotivationController'),
};

export { TYPES as MOTIVATION_TYPES };
