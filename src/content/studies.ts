import { appendMove, coord, fromCoord, newGame, play } from "../domain/go";
import type { SavedGame } from "../domain/go";
import { lessons } from "./courses";

export type Study = {
  id: string;
  title: string;
  topic: string;
  level: string;
  description: string;
  origin: string;
  questions: string[];
  game: SavedGame;
};
function example(
  id: string,
  title: string,
  size: number,
  moves: string[],
  notes: string[],
  branch?: { at: number; moves: string[]; note: string },
): SavedGame {
  let game = newGame(size, 0);
  game = { ...game, id: `study-${id}`, title, assisted: true };
  game.nodes[game.root] = {
    ...game.nodes[game.root],
    source: "原创教学示意",
    explanation:
      "从空棋盘开始，观察双方如何占角、展开和进入接触战。逐手阅读注解，遇到分支时比较不同方向。",
  };
  const path = [game.root];
  for (const [i, move] of moves.entries()) {
    const action = { type: "play" as const, ...fromCoord(move, size) },
      result = play(game.nodes[game.current].position, action);
    if (!result.ok) throw new Error(`${title} ${move}：${result.reason}`);
    game = appendMove(
      game,
      action,
      result.position,
      "原创教学示意",
      notes[i] || "比较当前棋块的连接与周围的大场，先观察，再决定后续方向。",
    );
    path.push(game.current);
  }
  if (branch) {
    game = { ...game, current: path[branch.at] };
    for (const move of branch.moves) {
      const action = { type: "play" as const, ...fromCoord(move, size) },
        r = play(game.nodes[game.current].position, action);
      if (!r.ok) throw new Error(r.reason);
      game = appendMove(game, action, r.position, "比较变化", branch.note);
    }
  }
  return { ...game, current: game.root };
}
const nineMoves =
  "C7 G3 C3 G7 E7 E3 C5 G5 E5 F5 E6 F6 D6 F4 D4 D3 C4 F3 B4 B3 B5 H5 B6 H6 A6 H4 A5 J4 A4 J5".split(
    " ",
  );
const nineNotes = [
  "黑先在角附近展开。九路棋盘很小，角与中腹很快会发生联系。",
  "白在对角回应，给双方留下展开空间。",
  "黑落在另一侧角附近，观察两颗黑子之间的边线。",
  "白也分散布局。接下来应比较大场和已有棋子的联系。",
  "黑向上边发展，留下向中央展开的可能。",
  "白在下边发展，不能把这个构架直接当成已围好的地。",
  "黑把左边的两角联系起来，仍要看中间是否会受压。",
  "白在右边展开，双方构架面向中央。",
  "黑走向中央，把上下左右的发展联系起来。",
  "白靠近黑棋，局部接触开始，要逐手数气。",
  "黑向上连接。这里可以比较贴近应手与转向别处的区别。",
  "白也补强接触处，不要只看一个点而忘了整个棋块。",
  "黑把上方黑棋连成一个整体，观察连接后的气。",
  "白向下延伸，边界还未完全确定。",
  "黑向左下的棋展开，比较双方方向。",
  "白靠近黑下方棋子的边界，检查断点。",
  "黑补连接，这是一种教学选择，别把所有补棋都视为必然。",
  "白在右下延伸，注意连通块的共同气。",
  "黑沿左边扩大联系。",
  "白回应下方边界，下一手还应检查双方薄处。",
  "黑将左边联系起来。",
  "白向右边延伸，不等于这里已全部是白地。",
  "黑加强左上附近的联系。",
  "白继续在右上附近补强。",
  "黑沿边推进，要比较这手和中央其他空点。",
  "白补右侧连接，观察气和接触边界。",
  "黑继续整理左边边界。",
  "白在右侧靠边落子，边线点的相邻方向更少。",
  "黑在左边连接，这局示意用于研究形与方向。",
  "白在右边连接。双方还有空点与边界需要处理；这不是终局计分示例。",
];
export const studies: Study[] = [
  {
    id: "nine-direction",
    title: "九路：从占角走向接触战",
    topic: "完整思路",
    level: "入门",
    description:
      "30 手原创示意谱，逐步观察角、边、中央与连接；带一条方向比较变化。",
    origin: "弈间原创教学示意，不是真实职业棋谱",
    questions: [
      "第 9 手走向中央，有哪些联系？",
      "接触后该优先检查什么？",
      "哪些区域尚不能视为确定地盘？",
    ],
    game: example(
      "nine-direction",
      "九路：从占角走向接触战",
      9,
      nineMoves,
      nineNotes,
      {
        at: 4,
        moves: ["C5", "E5", "E7", "G5"],
        note: "比较先联系左边与先展开上边。两者只是方向示意，要结合对手应手。",
      },
    ),
  },
  {
    id: "corner-balance",
    title: "十九路：守角与抢大场",
    topic: "布局",
    level: "基础",
    description:
      "用 16 手示意谱比较守角、挂角、拆边；在第 4 手后选择不同发展方向。",
    origin: "弈间原创教学示意，不代表固定定式",
    questions: [
      "守角的一手付出了什么节奏？",
      "边上的棋与哪两角有关？",
      "什么时候应该先照顾弱棋？",
    ],
    game: example(
      "corner-balance",
      "十九路：守角与抢大场",
      19,
      "R16 D16 Q4 D4 P17 C6 Q10 C10 Q14 F17 R6 F3 K16 K4 O10 F10".split(" "),
      [
        "黑小目占角，留下守角与应挂的选择。",
        "白星位快速占角。",
        "黑在另一角落星位。",
        "白占第四角，先比较全局。",
        "黑小飞守角，增加角部安定性，也投入一手。",
        "白向边上发展。",
        "黑展开右边，联系上下两角。",
        "白展开左边。",
        "黑巩固上方与右边的联系，仍要看薄处。",
        "白向上边发展。",
        "黑补右下的关系。",
        "白向下边发展。",
        "黑占上边空间，模样还不是实地。",
        "白也向下边展开。",
        "黑棋向中腹发展，检查与右边的关系。",
        "白发展中腹，全局方向比背固定坐标更重要。",
      ],
      {
        at: 4,
        moves: ["Q10", "C6", "P17"],
        note: "黑先抢右边大场，之后再考虑守角。比较两种次序的节奏与薄处。",
      },
    ),
  },
  ...[5, 6, 7, 10, 11, 15, 16].map((n) => {
    const lesson = lessons[n - 1];
    let game = newGame(lesson.position.size, lesson.position.komi);
    game = {
      ...game,
      id: `study-lesson-${n}`,
      title: lesson.title,
      assisted: true,
      nodes: {
        [game.root]: {
          ...game.nodes[game.root],
          position: lesson.position,
          explanation: lesson.paragraphs.join("\n"),
        },
      },
    };
    const line = lesson.task.sequence || lesson.demo;
    for (const [i, a] of line.entries()) {
      const r = play(game.nodes[game.current].position, a);
      if (!r.ok) throw new Error(r.reason);
      game = appendMove(
        game,
        a,
        r.position,
        "课程变化",
        `${i % 2 === 0 ? "观察目标着与提子、连接的关系。" : "对方按示意变化应手，重新检查气。"}\n${i === line.length - 1 ? lesson.task.success : lesson.summary}`,
      );
    }
    return {
      id: `lesson-${n}`,
      title: `变化研究：${lesson.title}`,
      topic: n >= 15 ? "连续战术" : "棋形与规则",
      level: n >= 15 ? "进阶" : "基础",
      description: `${line.length} 手可验证变化，配合课程理解每一步。`,
      origin: "弈间课程教学图",
      questions: ["当前棋块还有几口气？", "改变次序后，气与提子会怎样变化？"],
      game: { ...game, current: game.root },
    };
  }),
];
export function studyMoveLabel(game: SavedGame, id: string) {
  const node = game.nodes[id];
  return node.action?.type === "play"
    ? `${node.position.toPlay === 2 ? "黑" : "白"} ${coord(node.action, node.position.size)}`
    : node.action?.type === "pass"
      ? "停一手"
      : "注解";
}
