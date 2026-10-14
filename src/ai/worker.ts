import { rankCandidates } from "./local";
import type { Difficulty } from "./local";
import type { Position } from "../domain/go";
self.onmessage = (
  event: MessageEvent<{
    id: string;
    position: Position;
    difficulty: Difficulty;
  }>,
) => {
  const { id, position, difficulty } = event.data;
  try {
    self.postMessage({ id, candidates: rankCandidates(position, difficulty) });
  } catch {
    self.postMessage({ id, error: "本地分析失败，请重试。" });
  }
};
