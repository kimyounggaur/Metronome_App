import type { SchedulerWorkerMessage } from "./schedulerTypes";

let timerId: number | undefined;

self.onmessage = (event: MessageEvent<SchedulerWorkerMessage>) => {
  const message = event.data;

  if (message.type === "start") {
    if (timerId !== undefined) {
      self.clearInterval(timerId);
    }

    timerId = self.setInterval(() => {
      self.postMessage({ type: "tick", sessionId: message.sessionId } satisfies SchedulerWorkerMessage);
    }, message.lookaheadMs);
    self.postMessage({ type: "ready", sessionId: message.sessionId } satisfies SchedulerWorkerMessage);
  }

  if (message.type === "stop") {
    if (timerId !== undefined) {
      self.clearInterval(timerId);
      timerId = undefined;
    }
  }
};

export {};
