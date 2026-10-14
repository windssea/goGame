export type Color = 1 | 2;
export type Point = { row: number; col: number };
export type Action =
  | { type: "play"; row: number; col: number }
  | { type: "pass" };
export type Position = {
  size: number;
  board: number[];
  toPlay: Color;
  komi: number;
  history: string[];
  passes: number;
  captures: [number, number];
  moveNumber: number;
  last: Point | null;
};
export type MoveResult =
  | { ok: true; position: Position; captured: number[] }
  | { ok: false; reason: string };
export const other = (color: Color): Color => (color === 1 ? 2 : 1);
export const index = (p: Point, size: number) => p.row * size + p.col;
export const point = (i: number, size: number): Point => ({
  row: Math.floor(i / size),
  col: i % size,
});
export function neighbors(i: number, size: number): number[] {
  const r = Math.floor(i / size),
    c = i % size;
  return [
    r > 0 ? i - size : -1,
    r < size - 1 ? i + size : -1,
    c > 0 ? i - 1 : -1,
    c < size - 1 ? i + 1 : -1,
  ].filter((v) => v >= 0);
}
export const fingerprint = (board: number[], color: Color) =>
  board.join("") + ":" + color;
export function createPosition(
  size = 9,
  komi = size === 9 ? 6.5 : 7.5,
  stones: { row: number; col: number; color: Color }[] = [],
  toPlay: Color = 1,
): Position {
  const board = Array<number>(size * size).fill(0);
  for (const stone of stones) {
    if (
      stone.row < 0 ||
      stone.col < 0 ||
      stone.row >= size ||
      stone.col >= size
    )
      throw new Error("初始局面越界");
    const i = index(stone, size);
    if (board[i]) throw new Error("初始局面重叠");
    board[i] = stone.color;
  }
  return {
    size,
    board,
    toPlay,
    komi,
    history: [fingerprint(board, toPlay)],
    passes: 0,
    captures: [0, 0],
    moveNumber: 0,
    last: null,
  };
}
export function groupAt(board: number[], start: number, size: number) {
  const stones = new Set<number>(),
    liberties = new Set<number>();
  if (!board[start]) return { stones, liberties };
  const queue = [start];
  while (queue.length) {
    const i = queue.pop()!;
    if (stones.has(i)) continue;
    stones.add(i);
    for (const n of neighbors(i, size)) {
      if (board[n] === 0) liberties.add(n);
      else if (board[n] === board[start] && !stones.has(n)) queue.push(n);
    }
  }
  return { stones, liberties };
}
export function groups(board: number[], size: number) {
  const seen = new Set<number>();
  const result: {
    color: Color;
    stones: Set<number>;
    liberties: Set<number>;
  }[] = [];
  board.forEach((color, i) => {
    if (!color || seen.has(i)) return;
    const group = groupAt(board, i, size);
    group.stones.forEach((n) => seen.add(n));
    result.push({ color: color as Color, ...group });
  });
  return result;
}
export function play(position: Position, action: Action): MoveResult {
  if (position.passes >= 2)
    return { ok: false, reason: "双方已停一手，请先确认终局或继续下棋。" };
  const nextColor = other(position.toPlay);
  if (action.type === "pass")
    return {
      ok: true,
      captured: [],
      position: {
        ...position,
        toPlay: nextColor,
        passes: position.passes + 1,
        moveNumber: position.moveNumber + 1,
        last: null,
        history: [...position.history, fingerprint(position.board, nextColor)],
      },
    };
  const { row, col } = action;
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    col < 0 ||
    row >= position.size ||
    col >= position.size
  )
    return { ok: false, reason: "请落在棋盘内的交叉点。" };
  const i = index(action, position.size);
  if (position.board[i])
    return { ok: false, reason: "这个交叉点已经有棋子了。" };
  const board = [...position.board];
  board[i] = position.toPlay;
  const captured: number[] = [];
  for (const n of neighbors(i, position.size)) {
    if (board[n] !== nextColor) continue;
    const group = groupAt(board, n, position.size);
    if (group.liberties.size === 0)
      group.stones.forEach((s) => {
        board[s] = 0;
        captured.push(s);
      });
  }
  if (groupAt(board, i, position.size).liberties.size === 0)
    return {
      ok: false,
      reason: "这一手不能提子，自己的棋块也没有气，属于禁入点。",
    };
  const stateKey = fingerprint(board, nextColor);
  if (position.history.includes(stateKey))
    return {
      ok: false,
      reason: "这一手会重复已出现的局面。请先在其他地方落子，不能立即回提劫。",
    };
  const captures: [number, number] = [...position.captures];
  captures[position.toPlay - 1] += captured.length;
  return {
    ok: true,
    captured,
    position: {
      ...position,
      board,
      toPlay: nextColor,
      passes: 0,
      captures,
      moveNumber: position.moveNumber + 1,
      last: { row, col },
      history: [...position.history, stateKey],
    },
  };
}
export const resumePosition = (p: Position): Position => ({ ...p, passes: 0 });
export function areaScore(position: Position, dead: number[] = []) {
  const board = [...position.board];
  dead.forEach((i) => {
    board[i] = 0;
  });
  const ownership = [...board],
    seen = new Set<number>();
  let blackStones = 0,
    whiteStones = 0,
    blackTerritory = 0,
    whiteTerritory = 0,
    neutral = 0;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 1) {
      blackStones++;
      continue;
    }
    if (board[i] === 2) {
      whiteStones++;
      continue;
    }
    if (seen.has(i)) continue;
    const region: number[] = [],
      boundary = new Set<number>(),
      queue = [i];
    while (queue.length) {
      const n = queue.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      region.push(n);
      for (const k of neighbors(n, position.size)) {
        if (board[k]) boundary.add(board[k]);
        else if (!seen.has(k)) queue.push(k);
      }
    }
    const owner = boundary.size === 1 ? [...boundary][0] : 0;
    region.forEach((k) => {
      ownership[k] = owner;
    });
    if (owner === 1) blackTerritory += region.length;
    else if (owner === 2) whiteTerritory += region.length;
    else neutral += region.length;
  }
  const black = blackStones + blackTerritory,
    white = whiteStones + whiteTerritory + position.komi;
  return {
    black,
    white,
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    neutral,
    ownership,
    winner: black === white ? 0 : black > white ? 1 : 2,
    margin: Math.abs(black - white),
  };
}
export function coord(p: Point, size: number) {
  return "ABCDEFGHJKLMNOPQRST"[p.col] + (size - p.row);
}
export function fromCoord(value: string, size = 19): Point {
  return {
    col: "ABCDEFGHJKLMNOPQRST".indexOf(value[0]),
    row: size - Number(value.slice(1)),
  };
}
export const actionId = (action: Action) =>
  action.type === "pass" ? "pass" : `p-${action.row}-${action.col}`;
export function stoneMoveNumbers(position: Position): Record<number, number> {
  const result: Record<number, number> = {};
  let previous = position.history[0]?.split(":")[0] || "";
  for (let move = 1; move < position.history.length; move++) {
    const board = position.history[move].split(":")[0];
    for (let i = 0; i < board.length; i++) {
      if (board[i] === "0") delete result[i];
      else if (previous[i] !== board[i]) result[i] = move;
    }
    previous = board;
  }
  return result;
}
export function legalActions(p: Position): Action[] {
  const actions: Action[] = [];
  p.board.forEach((value, i) => {
    if (value) return;
    const action: Action = { type: "play", ...point(i, p.size) };
    if (play(p, action).ok) actions.push(action);
  });
  return actions;
}
export type GameNode = {
  id: string;
  parent: string | null;
  children: string[];
  action: Action | null;
  position: Position;
  source?: string;
  explanation?: string;
};
export type SavedGame = {
  id: string;
  title: string;
  createdAt: number;
  nodes: Record<string, GameNode>;
  root: string;
  current: string;
  difficulty: string;
  human: Color;
  opponent: "local" | "remote";
  result?: string;
  assisted: boolean;
  mode?: "training" | "challenge";
  resultSource?: "user-confirmed" | "resignation";
  confirmedDead?: number[];
};
export function newGame(size = 9, komi?: number): SavedGame {
  const p = createPosition(size, komi);
  const id = crypto.randomUUID(),
    root = crypto.randomUUID();
  return {
    id,
    title: `${size} 路练习`,
    createdAt: Date.now(),
    nodes: {
      [root]: {
        id: root,
        parent: null,
        children: [],
        action: null,
        position: p,
      },
    },
    root,
    current: root,
    difficulty: "beginner",
    human: 1,
    opponent: "local",
    assisted: false,
  };
}
export function appendMove(
  game: SavedGame,
  action: Action,
  position: Position,
  source: string,
  explanation = "",
): SavedGame {
  const id = crypto.randomUUID(),
    parent = game.current;
  return {
    ...game,
    current: id,
    nodes: {
      ...game.nodes,
      [parent]: {
        ...game.nodes[parent],
        children:
          source === "复盘试下"
            ? [...game.nodes[parent].children, id]
            : [id, ...game.nodes[parent].children],
      },
      [id]: { id, parent, children: [], action, position, source, explanation },
    },
  };
}
export function pathTo(game: SavedGame, id = game.current): GameNode[] {
  const path: GameNode[] = [];
  let node: GameNode | undefined = game.nodes[id];
  while (node) {
    path.unshift(node);
    node = node.parent ? game.nodes[node.parent] : undefined;
  }
  return path;
}
export type StoredGame = SavedGame & { historyEncoding?: "parent" };
export function compactGame(game: SavedGame): StoredGame {
  return {
    ...game,
    historyEncoding: "parent",
    nodes: Object.fromEntries(
      Object.entries(game.nodes).map(([id, node]) => [
        id,
        {
          ...node,
          position: {
            ...node.position,
            history: id === game.root ? node.position.history : [],
          },
        },
      ]),
    ),
  };
}
export function restoreGame(record: StoredGame): SavedGame {
  if (record.historyEncoding !== "parent") return record;
  const restored: Record<string, GameNode> = {},
    visiting = new Set<string>();
  const hydrate = (id: string): GameNode => {
    if (restored[id]) return restored[id];
    if (visiting.has(id) || !record.nodes[id])
      throw new Error("棋谱分支结构损坏");
    visiting.add(id);
    const node = record.nodes[id];
    const history =
      node.parent && node.action
        ? [
            ...hydrate(node.parent).position.history,
            fingerprint(node.position.board, node.position.toPlay),
          ]
        : node.parent
          ? hydrate(node.parent).position.history
          : node.position.history;
    visiting.delete(id);
    return (restored[id] = {
      ...node,
      position: { ...node.position, history },
    });
  };
  Object.keys(record.nodes).forEach(hydrate);
  return { ...record, nodes: restored };
}
const sgfEscape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\r\n?/g, "\n");
export function toSGF(game: SavedGame) {
  const root = game.nodes[game.root],
    letters = "abcdefghijklmnopqrs";
  const setup =
    ([1, 2] as const)
      .map((color) => {
        const points = root.position.board.flatMap((c, i) =>
          c === color
            ? [
                `[${letters[i % root.position.size]}${letters[Math.floor(i / root.position.size)]}]`,
              ]
            : [],
        );
        return points.length
          ? `${color === 1 ? "AB" : "AW"}${points.join("")}`
          : "";
      })
      .join("") + (root.position.toPlay === 2 ? "PL[W]" : "");
  const visit = (id: string): string => {
    const node = game.nodes[id];
    const move = node.action
      ? `;${other(node.position.toPlay) === 1 ? "B" : "W"}[${node.action.type === "pass" ? "" : letters[node.action.col] + letters[node.action.row]}]`
      : id === game.root
        ? ""
        : ";";
    const comment =
      node.source || node.explanation
        ? `C[${sgfEscape([node.source?.startsWith("SGF") ? "" : node.source, node.explanation].filter(Boolean).join(" · "))}]`
        : "";
    const branches =
      node.children.length === 1
        ? visit(node.children[0])
        : node.children.map((child) => `(${visit(child)})`).join("");
    return move + comment + branches;
  };
  return `(;GM[1]FF[4]CA[UTF-8]AP[GoStudio:0.2]SZ[${root.position.size}]KM[${root.position.komi}]RU[teaching-area-v1]GN[${sgfEscape(game.title)}]${setup}${game.result ? `RE[${sgfEscape(game.result)}]` : ""}${visit(game.root)})`;
}
