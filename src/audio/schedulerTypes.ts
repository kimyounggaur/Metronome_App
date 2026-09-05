export const LOOKAHEAD_MS = 25;
export const SCHEDULE_AHEAD_TIME = 0.1;
export const STOP_FADE_SECONDS = 0.008;
export const INTERRUPTION_SECONDS = 0.5;
// Repeated fractional intervals can differ from the audio clock by a few ulps.
export const EVENT_TIME_EPSILON = 1e-9;

export type SchedulerWorkerMessage =
  | { type: "start"; lookaheadMs: number; sessionId: number }
  | { type: "stop"; sessionId: number }
  | { type: "ready"; sessionId: number }
  | { type: "tick"; sessionId: number };
