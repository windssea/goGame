import type { Candidate, Difficulty } from "./local";
import type { Position } from "../domain/go";

// All intensive analysis runs off the UI thread, including coach hints.
export function analyze(
  position: Position,
  difficulty: Difficulty,
  signal: AbortSignal,
): Promise<Candidate[]> {
  if (signal.aborted)
    return Promise.reject(new DOMException("已取消", "AbortError"));
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("已取消", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      cleanup();
      if (data.error) reject(new Error(data.error));
      else resolve(data.candidates);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("本地分析暂时失败"));
    };
    worker.postMessage({ id, position, difficulty });
  });
}
