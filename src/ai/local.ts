import {
  actionId,
  groupAt,
  groups,
  legalActions,
  neighbors,
  other,
  play,
  point,
} from "../domain/go";
import type { Action, Color, Position } from "../domain/go";
export type Difficulty = "guided" | "beginner" | "challenge" | "advanced";
export const difficultyLabels: Record<Difficulty, string> = {
  guided: "启蒙陪练",
  beginner: "入门练习",
  challenge: "基础挑战",
  advanced: "进阶练习",
};
export type Candidate = {
  id: string;
  action: Action;
  value: number;
  facts: { id: string; kind: string; count: number }[];
  explanation: string;
};
const budgets: Record<
  Difficulty,
  { width: number; depth: number; randomness: number }
> = {
  guided: { width: 8, depth: 1, randomness: 0.3 },
  beginner: { width: 10, depth: 1, randomness: 0.15 },
  challenge: { width: 14, depth: 2, randomness: 0.04 },
  advanced: { width: 18, depth: 3, randomness: 0 },
};
function estimate(p: Position, color: Color) {
  let value = 0;
  for (const g of groups(p.board, p.size)) {
    const sign = g.color === color ? 1 : -1;
    value +=
      sign *
      (g.stones.size * 3 +
        Math.min(g.liberties.size, 6) * 0.2 -
        (g.liberties.size === 1 ? g.stones.size * 5 : 0));
  }
  value += (p.captures[color - 1] - p.captures[other(color) - 1]) * 3;
  return value;
}
function immediate(p: Position, action: Action): Candidate | null {
  const move = play(p, action);
  if (!move.ok) return null;
  const facts: Candidate["facts"] = [];
  let value = move.captured.length * 12,
    explanation = "在这一带展开，留意棋子的连接和周围的气。";
  if (action.type === "play") {
    const i = action.row * p.size + action.col,
      own = groupAt(move.position.board, i, p.size);
    const adjacent = neighbors(i, p.size),
      ownBefore = new Set<number>();
    let saved = 0,
      threatened = 0;
    for (const n of adjacent) {
      if (p.board[n] === p.toPlay && !ownBefore.has(n)) {
        const g = groupAt(p.board, n, p.size);
        g.stones.forEach((s) => ownBefore.add(s));
        if (g.liberties.size === 1 && own.liberties.size > 1)
          saved += g.stones.size;
      }
    }
    const opponentSeen = new Set<number>();
    for (const n of adjacent)
      if (move.position.board[n] === other(p.toPlay) && !opponentSeen.has(n)) {
        const g = groupAt(move.position.board, n, p.size);
        g.stones.forEach((s) => opponentSeen.add(s));
        if (g.liberties.size === 1) threatened += g.stones.size;
      }
    value +=
      saved * 10 + threatened * 2 + Math.min(own.liberties.size, 6) * 0.4;
    if (own.liberties.size === 1) value -= own.stones.size * 12;
    const edge = Math.min(
      action.row,
      action.col,
      p.size - 1 - action.row,
      p.size - 1 - action.col,
    );
    const friendly = adjacent.filter((n) => p.board[n] === p.toPlay).length;
    // Friendly eye fills are legal, but rarely useful as a local heuristic.
    if (friendly === adjacent.length && !move.captured.length && !saved)
      value -= 16;
    if (p.moveNumber < p.size * 2) {
      value +=
        edge === (p.size >= 13 ? 3 : 2)
          ? 2.6
          : edge === 2
            ? 1.9
            : edge <= 1
              ? -0.9
              : 0.1;
      const nearest = p.board.reduce(
        (d, color, j) =>
          !color
            ? d
            : Math.min(
                d,
                Math.abs(Math.floor(j / p.size) - action.row) +
                  Math.abs((j % p.size) - action.col),
              ),
        p.size * 2,
      );
      value +=
        nearest >= 3 && nearest <= p.size ? 0.7 : nearest === 1 ? -0.4 : 0;
    }
    if (saved) {
      facts.push({ id: "saved", kind: "saved_from_atari", count: saved });
      explanation = `这手让原本只剩一口气的棋块增加了气，优先照顾自己的安全。`;
    }
    if (threatened) {
      facts.push({ id: "atari", kind: "atari_stones", count: threatened });
      explanation = "这手打吃对方棋块，给对方制造一个需要处理的威胁。";
    }
    if (move.captured.length) {
      facts.push({
        id: "capture",
        kind: "captures",
        count: move.captured.length,
      });
      explanation = `占住最后一口气，提掉了 ${move.captured.length} 颗棋子。`;
    }
  }
  return { id: actionId(action), action, value, facts, explanation };
}
export function rankCandidates(
  p: Position,
  difficulty: Difficulty = "beginner",
  rng: () => number = Math.random,
): Candidate[] {
  const config = budgets[difficulty];
  const candidates = legalActions(p)
    .map((action) => immediate(p, action)!)
    .sort((a, b) => b.value - a.value);
  if (config.depth > 1) {
    const deadline =
      performance.now() + (difficulty === "advanced" ? 650 : 250);
    for (const candidate of candidates.slice(0, config.width)) {
      if (performance.now() > deadline) break;
      const moved = play(p, candidate.action);
      if (!moved.ok) continue;
      const replies = legalActions(moved.position)
        .map((a) => immediate(moved.position, a)!)
        .sort((a, b) => b.value - a.value)
        .slice(0, difficulty === "advanced" ? 4 : 2);
      let worst = Infinity;
      for (const reply of replies) {
        const r = play(moved.position, reply.action);
        if (!r.ok) continue;
        let evaluation = estimate(r.position, p.toPlay);
        if (config.depth === 3 && performance.now() < deadline) {
          const responses = legalActions(r.position)
            .map((a) => immediate(r.position, a)!)
            .sort((a, b) => b.value - a.value)
            .slice(0, 2);
          evaluation = Math.max(
            evaluation,
            ...responses.map((c) => {
              const s = play(r.position, c.action);
              return s.ok ? estimate(s.position, p.toPlay) : -Infinity;
            }),
          );
        }
        worst = Math.min(worst, evaluation);
      }
      if (Number.isFinite(worst)) candidate.value += worst * 0.6;
    }
    candidates.sort((a, b) => b.value - a.value);
  }
  const ownDanger = groups(p.board, p.size).some(
    (g) => g.color === p.toPlay && g.liberties.size === 1,
  );
  const hasUseful = candidates.some(
    (c) => c.value > 1.5 || (c.facts.length > 0 && c.value >= 0),
  );
  const settledEnough =
    p.moveNumber > p.size * 2 || p.board.filter((v) => !v).length <= 4;
  if ((!ownDanger && settledEnough && !hasUseful) || !candidates.length) {
    candidates.unshift({
      id: "pass",
      action: { type: "pass" },
      value: 0,
      facts: [],
      explanation:
        "暂时没有找到有价值的局部着手，停一手。终局仍需要确认死子和边界。",
    });
  }
  const best = candidates[0]?.value ?? 0;
  const allowed = candidates
    .filter(
      (c) =>
        c.action.type === "pass" ||
        c.value >=
          best -
            (difficulty === "guided" ? 16 : difficulty === "beginner" ? 7 : 3),
    )
    .slice(0, config.width);
  // Randomness is bounded to already legal, difficulty-filtered candidates.
  if (allowed.length > 1 && rng() < config.randomness) {
    const i = Math.min(
      allowed.length - 1,
      1 + Math.floor(rng() * Math.min(3, allowed.length - 1)),
    );
    [allowed[0], allowed[i]] = [allowed[i], allowed[0]];
  }
  return allowed;
}
export function suggestedPoint(p: Position): string {
  const candidate = rankCandidates(p, "beginner", () => 1)[0];
  return candidate?.action.type === "play"
    ? JSON.stringify(
        point(candidate.action.row * p.size + candidate.action.col, p.size),
      )
    : "pass";
}
