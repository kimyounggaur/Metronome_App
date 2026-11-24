import { withBackupStage } from "./backupStage";
import { bulkReadBudget, readBackupFile, readFailure, type BackupReadCommand, type BackupReadMessage } from "./readBackupFile";

const send = (message: BackupReadMessage) => self.postMessage(message);
const lifetime = new AbortController();
let materialize: (() => Promise<void>) | null = null;
let release = () => {};
const released = new Promise<void>(done => { release = done; });

self.onmessage = async (event: MessageEvent<BackupReadCommand>) => {
  const command = event.data;
  if (command.type === "discard") { lifetime.abort(); release(); return; }
  if (command.type === "materialize") {
    try { await materialize?.(); }
    catch (error) { send({ type: "complete", result: readFailure(error) }); }
    return;
  }
  if (command.type !== "open") return;
  const { file, owner } = command;
  const { deviceMemory } = navigator as WorkerNavigator & { deviceMemory?: number };
  const budget = bulkReadBudget(deviceMemory);
  let lastPercent = -1;
  const progress = (read: number) => {
    const percent = Math.floor(100 * read / Math.max(file.size, 1));
    if (percent !== lastPercent) send({ type: "progress", read, total: file.size });
    lastPercent = percent;
  };
  try {
    if (file.size <= budget) {
      const result = await readBackupFile(file, progress, budget);
      if (!lifetime.signal.aborted) send({type: "complete", result});
    } else {
      const failure = await withBackupStage(file, owner, lifetime.signal, progress, async (summary, load) => {
        materialize = async () => {
          const data = await load();
          if (!lifetime.signal.aborted) send({type:"complete", result:{ok:true, data, warnings:summary.warnings}});
        };
        send({type:"staged", result:summary});
        await released;
      });
      if (failure && !lifetime.signal.aborted) send({type:"complete", result:failure});
    }
  } catch (error) {
    if (!lifetime.signal.aborted) send({ type: "complete", result: readFailure(error) });
  } finally { self.close(); }
};
