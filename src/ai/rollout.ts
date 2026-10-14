import {
  areaScore,
  groupAt,
  groups,
  neighbors,
  play,
  point,
} from "../domain/go";
import type { Color, Position } from "../domain/go";
import { isTrueEye } from "./evaluation";

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
// Monte Carlo uses legal rule-engine moves and a capture/escape policy, rather
// than treating every stone or nearby influence as certain, surviving territory.
export function rollout(
  start: Position,
  color: Color,
  random: () => number,
  deadline: number,
): number {
  let p = start;
  const limit = Math.min(140, p.size * p.size * 2);
  for (let turn = 0; turn < limit && p.passes < 2; turn++) {
    if (performance.now() > deadline) throw new Error("rollout-budget");
    const all = groups(p.board, p.size),
      targets = new Set<number>();
    const danger = all.filter((g) => g.liberties.size <= 2);
    danger.forEach((g) => g.liberties.forEach((i) => targets.add(i)));
    // A mix of tactical points, nearby continuations and global exploration.
    if (p.last)
      neighbors(p.last.row * p.size + p.last.col, p.size).forEach((i) => {
        if (!p.board[i]) targets.add(i);
      });
    for (let i = 0; i < 8; i++) {
      const n = Math.floor(random() * p.board.length);
      if (!p.board[n]) targets.add(n);
    }
    let selected: ReturnType<typeof play> | undefined,
      best = -Infinity;
    for (const i of targets) {
      if (p.board[i] || isTrueEye(p.board, i, p.size, p.toPlay)) continue;
      const r = play(p, { type: "play", ...point(i, p.size) });
      if (!r.ok) continue;
      const adjacent = neighbors(i, p.size),
        group = groupAt(r.position.board, i, p.size);
      if (group.liberties.size === 1 && r.captured.length < group.stones.size)
        continue;
      let value = r.captured.length * 10 + random() * 3;
      for (const g of danger)
        if (
          g.color === p.toPlay &&
          g.liberties.has(i) &&
          group.liberties.size > g.liberties.size
        )
          value += g.stones.size * (g.liberties.size === 1 ? 8 : 1.3);
      if (adjacent.every((n) => p.board[n] === p.toPlay) && !r.captured.length)
        value -= 8;
      if (group.liberties.size === 2) value -= 1;
      if (value > best) {
        best = value;
        selected = r;
      }
    }
    if (selected?.ok && best >= 0) p = selected.position;
    else {
      const pass = play(p, { type: "pass" });
      if (!pass.ok) break;
      p = pass.position;
    }
  }
  const score = areaScore(p),
    margin =
      color === 1 ? score.black - score.white : score.white - score.black;
  return Math.tanh(margin / Math.max(3, p.size));
}
