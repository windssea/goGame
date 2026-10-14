import { createPosition, fingerprint, play, resumePosition } from "./go";
import type { Action, Color, GameNode, SavedGame } from "./go";

type Node = { properties: Record<string, string[]>; children: Node[] };
// FF4 text/escape rules and branching structure: https://cvsbook.red-bean.com/sgf/
export function readSGF(text: string): SavedGame[] {
  if (text.length > 2 * 1024 * 1024) throw new Error("SGF 文件超过 2 MB。");
  let at = 0,
    count = 0;
  const whitespace = () => {
    while (/\s/.test(text[at] || "x")) at++;
  };
  const value = () => {
    if (text[at++] !== "[") throw new Error("SGF 属性缺少方括号。");
    let out = "",
      closed = false;
    while (at < text.length) {
      const c = text[at++];
      if (c === "]") {
        closed = true;
        break;
      }
      if (c === "\\") {
        const next = text[at++];
        if (next === "\r" && text[at] === "\n") at++;
        else if (next !== "\n" && next !== "\r" && next !== undefined)
          out += next;
      } else out += c;
    }
    if (!closed) throw new Error("SGF 属性未结束。");
    return out;
  };
  const tree = (depth: number): Node => {
    if (depth > 80) throw new Error("SGF 分支层级过深。");
    whitespace();
    if (text[at++] !== "(") throw new Error("SGF 棋谱缺少起始括号。");
    let first: Node | undefined, last: Node | undefined;
    whitespace();
    while (text[at] === ";") {
      at++;
      if (++count > 5000) throw new Error("SGF 超过 5000 个节点。");
      const node: Node = { properties: {}, children: [] };
      if (last) last.children.push(node);
      else first = node;
      last = node;
      whitespace();
      while (/[A-Z]/.test(text[at] || "x")) {
        let key = "";
        while (/[A-Z]/.test(text[at] || "x")) key += text[at++];
        whitespace();
        if (node.properties[key]) throw new Error(`重复 SGF 属性 ${key}。`);
        const list: string[] = [];
        while (text[at] === "[") {
          list.push(value());
          whitespace();
        }
        if (!list.length) throw new Error("SGF 属性没有值。");
        node.properties[key] = list;
      }
      whitespace();
    }
    if (!first || !last) throw new Error("SGF 棋谱为空。");
    while (text[at] === "(") {
      last.children.push(tree(depth + 1));
      whitespace();
    }
    if (text[at++] !== ")") throw new Error("SGF 括号不完整。");
    return first;
  };
  const roots: Node[] = [];
  whitespace();
  while (at < text.length) {
    roots.push(tree(0));
    whitespace();
    if (roots.length > 30) throw new Error("一次最多导入 30 盘棋。");
  }
  if (!roots.length) throw new Error("没有找到 SGF 棋谱。");
  return roots.map((root, number) => {
    const props = root.properties,
      one = (key: string) => props[key]?.[0];
    if (one("GM") && one("GM") !== "1")
      throw new Error("只支持围棋 SGF（GM[1]）。");
    if (one("CA") && !/^utf-?8$/i.test(one("CA")!))
      throw new Error("请先将棋谱转为 UTF-8 编码。");
    const size = Number(one("SZ") || 19),
      komi = Number(one("KM") || 0);
    if (![5, 9, 13, 19].includes(size) || !Number.isFinite(komi))
      throw new Error("目前支持 5、9、13、19 路方形棋盘。");
    const coordinate = (s: string) => {
      if (!/^[a-s]{2}$/.test(s)) throw new Error("SGF 坐标不支持或越界。");
      const col = s.charCodeAt(0) - 97,
        row = s.charCodeAt(1) - 97;
      if (row >= size || col >= size) throw new Error("SGF 坐标越界。");
      return { row, col };
    };
    const setup: { row: number; col: number; color: Color }[] = [];
    for (const [key, color] of [
      ["AB", 1],
      ["AW", 2],
    ] as const)
      for (const s of props[key] || []) {
        const [start, end] = s.split(":");
        const a = coordinate(start),
          b = end ? coordinate(end) : a;
        if (b.row < a.row || b.col < a.col)
          throw new Error("SGF 设置范围顺序错误。");
        for (let row = a.row; row <= b.row; row++)
          for (let col = a.col; col <= b.col; col++)
            setup.push({ row, col, color });
      }
    for (const s of props.AE || []) {
      const p = coordinate(s);
      for (let i = setup.length - 1; i >= 0; i--)
        if (setup[i].row === p.row && setup[i].col === p.col)
          setup.splice(i, 1);
    }
    const firstMove = root.properties.W
      ? 2
      : root.properties.B
        ? 1
        : root.children[0]?.properties.W
          ? 2
          : 1;
    const initial = createPosition(
      size,
      komi,
      setup,
      one("PL") === "W"
        ? 2
        : one("PL") === "B"
          ? 1
          : Number(one("HA") || 0) > 1
            ? 2
            : firstMove,
    );
    const id = crypto.randomUUID(),
      rootId = crypto.randomUUID();
    const nodes: Record<string, GameNode> = {
      [rootId]: {
        id: rootId,
        parent: null,
        children: [],
        action: null,
        position: initial,
        source: "SGF 导入",
        explanation: one("C") || "",
      },
    };
    const visit = (input: Node, parent: string, isRoot = false) => {
      const pr = input.properties;
      if (!isRoot && ["AB", "AW", "AE", "PL"].some((k) => pr[k]))
        throw new Error("只支持根节点设子；含中途摆棋的教学谱请拆为独立图。");
      if (pr.B && pr.W) throw new Error("SGF 单个节点不能同时下黑白。");
      let nodeId = parent,
        position = nodes[parent].position;
      const move = pr.B || pr.W;
      if (move) {
        if (position.passes >= 2) position = resumePosition(position);
        const color = pr.B ? 1 : 2;
        if (position.toPlay !== color) throw new Error("SGF 行棋次序不合法。");
        const s = move[0],
          action: Action =
            s === "" || (size <= 19 && s === "tt")
              ? { type: "pass" }
              : { type: "play", ...coordinate(s) };
        // SGF records using simple ko can differ from this site's positional-history rule.
        const result = play(position, action);
        if (!result.ok)
          throw new Error(
            `SGF 第 ${position.moveNumber + 1} 手不符合本站规则：${result.reason}`,
          );
        position = result.position;
        nodeId = crypto.randomUUID();
        nodes[parent].children.push(nodeId);
        nodes[nodeId] = {
          id: nodeId,
          parent,
          children: [],
          action,
          position,
          source: "SGF 导入",
          explanation: pr.C?.[0] || pr.N?.[0] || "",
        };
      } else if (!isRoot) {
        nodeId = crypto.randomUUID();
        nodes[parent].children.push(nodeId);
        nodes[nodeId] = {
          id: nodeId,
          parent,
          children: [],
          action: null,
          position,
          source: "SGF 注解",
          explanation: pr.C?.[0] || pr.N?.[0] || "",
        };
      }
      for (const child of input.children) visit(child, nodeId);
    };
    visit(root, rootId, true);
    // Root setup remains part of the position hash used by all later moves.
    nodes[rootId].position.history = [
      fingerprint(initial.board, initial.toPlay),
    ];
    return {
      id,
      title:
        one("GN") ||
        [one("PB"), one("PW")].filter(Boolean).join(" vs ") ||
        `导入棋谱 ${number + 1}`,
      createdAt: Date.now() + number,
      nodes,
      root: rootId,
      current: rootId,
      difficulty: "beginner",
      human: 1,
      opponent: "local",
      assisted: true,
      result: one("RE"),
    } as SavedGame;
  });
}
