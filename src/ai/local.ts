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
import { evaluatePosition, isTrueEye } from "./evaluation";
import { rollout, seededRandom } from "./rollout";
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
  beginner: { width: 10, depth: 2, randomness: 0.04 },
  challenge: { width: 14, depth: 3, randomness: 0 },
  advanced: { width: 18, depth: 4, randomness: 0 },
};
function estimate(p: Position, color: Color) {
  return evaluatePosition(p, color);
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
      value -= isTrueEye(p.board, i, p.size, p.toPlay) ? 45 : 16;
    const connected = new Set<number>();
    let connections = 0;
    for (const n of adjacent) {
      if (p.board[n] !== p.toPlay || connected.has(n)) continue;
      groupAt(p.board, n, p.size).stones.forEach((s) => connected.add(s));
      connections++;
    }
    if (connections > 1 && own.liberties.size > 2) value += 2.5;
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
        nearest >= 3 && nearest <= p.size ? 1.8 : nearest === 1 ? -1.2 : 0;
      // Corners are efficient to develop; avoid repeatedly crowding an occupied corner.
      const line = p.size >= 13 ? 3 : p.size >= 9 ? 2 : 1;
      const cornerDistance =
        Math.min(action.row, p.size - 1 - action.row) +
        Math.min(action.col, p.size - 1 - action.col);
      if (
        edge >= line - 1 &&
        edge <= line &&
        cornerDistance <= line * 2 + 1 &&
        nearest >= 3
      )
        value += 3;
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
  if (p.passes >= 2) return [];
  const config = budgets[difficulty];
  const baseline = estimate(p, p.toPlay);
  const candidates = legalActions(p)
    .map((action) => immediate(p, action)!)
    .map((candidate) => {
      const next = play(p, candidate.action);
      if (next.ok)
        candidate.value += (estimate(next.position, p.toPlay) - baseline) * 0.7;
      return candidate;
    })
    .sort((a, b) => b.value - a.value);
  if (config.depth > 1) {
    const deadline =
      performance.now() +
      (difficulty === "advanced"
        ? 1400
        : difficulty === "challenge"
          ? 800
          : 350);
    const roots = candidates.slice(0, Math.min(config.width, 10));
    const baseValues = roots.map((c) => c.value);
    const timeout = Symbol("budget");
    const search = (
      position: Position,
      depth: number,
      alpha: number,
      beta: number,
    ): number => {
      if (performance.now() > deadline) throw timeout;
      if (!depth) return estimate(position, position.toPlay);
      const choices = legalActions(position)
        .map((a) => immediate(position, a)!)
        .sort((a, b) => b.value - a.value)
        .slice(0, depth > 1 ? 5 : 4);
      if (!choices.length) return estimate(position, position.toPlay);
      let best = -Infinity;
      for (const choice of choices) {
        const moved = play(position, choice.action);
        if (!moved.ok) continue;
        const v = -search(moved.position, depth - 1, -beta, -alpha);
        best = Math.max(best, v);
        alpha = Math.max(alpha, v);
        if (alpha >= beta) break;
      }
      return best;
    };
    for (let depth = 2; depth <= config.depth; depth++) {
      try {
        const scores = roots.map((candidate, i) => {
          const moved = play(p, candidate.action);
          return moved.ok
            ? baseValues[i] * 0.45 +
                (-search(moved.position, depth - 1, -Infinity, Infinity) -
                  baseline)
            : -Infinity;
        });
        // Apply only a fully completed depth: elapsed time never favors the first root.
        scores.forEach((value, i) => {
          roots[i].value = value;
        });
      } catch (error) {
        if (error !== timeout) throw error;
        break;
      }
    }
    // Roots outside the beam have no comparable searched score.
    candidates.splice(0, candidates.length, ...roots);
    candidates.sort((a, b) => b.value - a.value);
  }
  if (difficulty !== "guided" && p.size <= 13 && candidates.length > 1) {
    const roots = candidates.slice(0, 6),
      prior = roots.map((c) => c.value),
      sums = roots.map(() => 0);
    const deadline =
      performance.now() +
      (difficulty === "advanced"
        ? 900
        : difficulty === "challenge"
          ? 500
          : 250);
    let samples = 0;
    let seed = p.moveNumber + 17;
    p.board.forEach((c, i) => {
      seed = (Math.imul(seed, 31) + c * (i + 1)) >>> 0;
    });
    for (let batch = 0; batch < 40; batch++) {
      try {
        const values = roots.map((c) => {
          const moved = play(p, c.action);
          return moved.ok
            ? rollout(
                moved.position,
                p.toPlay,
                seededRandom(seed + batch * 7919),
                deadline,
              )
            : -1;
        });
        values.forEach((v, i) => (sums[i] += v));
        samples++;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "rollout-budget")
          throw error;
        break;
      }
    }
    if (samples >= 2) {
      roots.forEach((c, i) => {
        c.value = prior[i] * 0.25 + (sums[i] / samples) * 14;
      });
      candidates.splice(
        0,
        candidates.length,
        ...roots.sort((a, b) => b.value - a.value),
      );
    }
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
