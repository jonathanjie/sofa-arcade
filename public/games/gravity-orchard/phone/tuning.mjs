/** Starting controller hypotheses, not measured physical-device tuning. */
export const MOTION_TUNING = Object.freeze({
  version: 1,
  usableDegrees: 25,
  deadZoneDegrees: 3,
  calibrationStableMs: 600,
  calibrationToleranceDegrees: 2.5,
  calibrationTimeoutMs: 8000,
  firstSampleTimeoutMs: 3000,
  filterTimeConstantMs: 75,
  filterIntervalMs: 16,
  filterMaxStepMs: 50,
  filterEpsilon: 0.0001,
  rounding: 10000,
});
