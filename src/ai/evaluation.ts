import { groups, neighbors, other, point } from "../domain/go";
import type { Color, Position } from "../domain/go";

export function isTrueEye(
  board: number[],
  i: number,
  size: number,
  color: Color,
): boolean {
  if (board[i] || neighbors(i, size).some((n) => board[n] !== color))
    return false;
  const { row, col } = point(i, size);
  let enemies = 0,
    offBoard = 0;
  for (const dr of [-1, 1])
    for (const dc of [-1, 1]) {
      const r = row + dr,
        c = col + dc;
      if (r < 0 || c < 0 || r >= size || c >= size) offBoard++;
      else if (board[r * size + c] === other(color)) enemies++;
    }
  return enemies <= (offBoard ? 0 : 1);
}

// A positional estimate, never displayed as a calibrated win rate or final score.
// Distances stop at opponent stones; nearby influence is discounted, not counted as territory.
function distances(p: Position, color: Color): number[] {
  const dist: number[] = p.board.map((c) => (c === color ? 0 : 99));
  const queue = p.board.flatMap((c, i) => (c === color ? [i] : []));
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (dist[i] >= 4) continue;
    for (const n of neighbors(i, p.size)) {
      if (p.board[n] === other(color) || dist[n] <= dist[i] + 1) continue;
      dist[n] = dist[i] + 1;
      queue.push(n);
    }
  }
  return dist;
}
export function evaluatePosition(p: Position, color: Color): number {
  let value = 0;
  for (const g of groups(p.board, p.size)) {
    const sign = g.color === color ? 1 : -1,
      n = g.stones.size,
      libs = g.liberties.size;
    const eyes = [...g.liberties].filter((i) =>
      isTrueEye(p.board, i, p.size, g.color),
    ).length;
    // A threatened stone retains positive value. A negative value would make
    // deliberately letting one's own group be captured look like an improvement.
    const safety =
      libs === 1
        ? -n * 7
        : libs === 2 && eyes < 2
          ? -n * 3
          : Math.min(libs, 8) * 0.65;
    value += sign * (n * 8 + safety + (eyes >= 2 ? 7 : eyes * 1.2));
  }
  const own = distances(p, color),
    enemy = distances(p, other(color));
  p.board.forEach((c, i) => {
    if (c || own[i] === enemy[i]) return;
    const near = Math.min(own[i], enemy[i]);
    if (near > 4) return;
    value += (own[i] < enemy[i] ? 1 : -1) * (5 - near) * 0.26;
  });
  return value - (color === 2 ? p.komi : -p.komi) * 0.2;
}
