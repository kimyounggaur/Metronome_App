export const LOOKAHEAD_MS = 25;
export const SCHEDULE_AHEAD_TIME = 0.1;

export type SchedulerWorkerMessage =
  | { type: "start"; lookaheadMs: number }
  | { type: "stop" }
  | { type: "tick" };
