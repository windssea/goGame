import { lessons } from "./courses";
import { createPosition, point } from "../domain/go";
import type { Action, Color, Point, Position } from "../domain/go";
export const challengeModes = [
  {
    id: "tactics",
    title: "手筋冲刺",
    tag: "观察 → 落子",
    description:
      "在提子、救棋与连接中快速找出目标着。五题一轮，每次变换方向与执子。",
    lessonIds: [4, 5, 6, 13, 14],
    count: 5,
    seconds: 120,
  },
  {
    id: "ladder",
    title: "征子追击",
    tag: "连续计算",
    description: "沿着完整变化追到棋盘边缘。每一手都检查气，别只凭熟悉的方向。",
    lessonIds: [15],
    count: 1,
    seconds: 180,
  },
  {
    id: "snapback",
    title: "倒扑实验",
    tag: "先舍后取",
    description: "敢不敢送出一颗棋？走完倒扑，观察提子如何改变气。",
    lessonIds: [16],
    count: 3,
    seconds: 120,
  },
  {
    id: "eyes",
    title: "眼形侦察",
    tag: "死活基础",
    description: "认识眼、假眼和做眼急所。换一个朝向，看你是否仍认得。",
    lessonIds: [9, 10, 11, 12],
    count: 4,
    seconds: 120,
  },
  {
    id: "endgame",
    title: "收官练习场",
    tag: "边界与价值",
    description: "从边界、单官到收官先后手，练习落子并回看原因。",
    lessonIds: [25, 26, 27, 28],
    count: 4,
    seconds: 120,
  },
  {
    id: "direction",
    title: "布局方向感",
    tag: "全盘观察",
    description: "占角、挂角、展开、照顾弱棋。先找到任务中的目的，再选择落点。",
    lessonIds: [17, 18, 19, 20, 21, 22, 23, 24],
    count: 5,
    seconds: 150,
  },
] as const;
export type ChallengeTask = {
  id: string;
  title: string;
  instruction: string;
  explanation: string;
  position: Position;
  targets: Point[];
  sequence?: Action[];
  selectOnly: boolean;
  lessonId: string;
};
const goals: Record<number, string> = {
  4: "填掉对方棋块最后一口气，完成提子。",
  5: "提掉相连的两颗对方棋子。",
  6: "向外长出，救出被打吃的棋块。",
  13: "连接两颗分开的己方棋子。",
  14: "一手同时打吃两块对方棋。",
  15: "逐手打吃，完成完整的征子路线。",
  16: "先投入一子让对方提，再回头完成倒扑。",
  9: "选出完整相连棋块内部的一个眼位（只选择，不落子）。",
  10: "执白进入假眼，验证它为什么不可靠。",
  11: "把内部空间分成两个独立的眼。",
  12: "选出双方共享的一口气（只选择，不落子）。",
  17: "在三线附近选择角部展开点，练习占角范式。",
  18: "用小飞补强已经占据的角，练习示意守角形。",
  19: "从边上棋子做短距离拆边，练习示意展开形。",
  20: "选择尚未展开的角部，占据三线附近。",
  21: "救出被打吃的己方棋块。",
  22: "完成可以立即提掉对方棋子的着手。",
  23: "完成提子，再判断对方是否必须在附近应手。",
  24: "先长出弱棋，再考虑远处大场。",
  25: "补齐中间的边界断点。",
  26: "连接中间的断点，完成边界补强。",
  27: "选出两眼活棋中的一颗棋子（只选择，不落子）。",
  28: "选出己方内部的空点，认识面积中的空区（只选择，不落子）。",
};
export function transformPoint(
  p: Point,
  size: number,
  orientation: number,
): Point {
  let row = p.row,
    col = orientation >= 4 ? size - 1 - p.col : p.col;
  for (let i = 0; i < orientation % 4; i++) [row, col] = [col, size - 1 - row];
  return { row, col };
}
export function challengeDeck(
  id: string,
  random: () => number = Math.random,
): ChallengeTask[] {
  const mode = challengeModes.find((m) => m.id === id) || challengeModes[0];
  const ids: number[] = [...mode.lessonIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return Array.from({ length: mode.count }, (_, i) => {
    const lesson = lessons[ids[i % ids.length] - 1],
      orientation = Math.floor(random() * 8),
      swap = random() < 0.5;
    const color = (c: number): Color => (swap ? 3 - c : c) as Color;
    const stones = lesson.position.board.flatMap((c, n) =>
      c
        ? [
            {
              ...transformPoint(
                point(n, lesson.position.size),
                lesson.position.size,
                orientation,
              ),
              color: color(c),
            },
          ]
        : [],
    );
    const position = createPosition(
      lesson.position.size,
      0,
      stones,
      color(lesson.position.toPlay),
    );
    const original = goals[ids[i % ids.length]] || lesson.task.instruction;
    // Coordinate mentions in source lessons are translated, keeping the task goal intact.
    const translate = (text: string) =>
      text
        .replace(/[A-HJ-T](?:1[0-9]|[1-9])/g, (s) => {
          const p = {
            col: "ABCDEFGHJKLMNOPQRST".indexOf(s[0]),
            row: position.size - Number(s.slice(1)),
          };
          if (p.row < 0 || p.col >= position.size) return s;
          const t = transformPoint(p, position.size, orientation);
          return "ABCDEFGHJKLMNOPQRST"[t.col] + (position.size - t.row);
        })
        .replace(/[黑白]/g, (c) => (swap ? (c === "黑" ? "白" : "黑") : c));
    return {
      id: `${id}-${i}-${orientation}-${swap}`,
      title: lesson.title,
      instruction: translate(original),
      explanation: translate(lesson.task.success),
      position,
      targets: lesson.task.accepted.map((p) =>
        transformPoint(p, position.size, orientation),
      ),
      sequence: lesson.task.sequence?.map((a) =>
        a.type === "pass"
          ? a
          : { ...a, ...transformPoint(a, position.size, orientation) },
      ),
      selectOnly: !!lesson.task.selectOnly,
      lessonId: lesson.id,
    };
  });
}
