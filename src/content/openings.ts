import { createPosition, fromCoord, play } from "../domain/go";
import type { Action, Position } from "../domain/go";
export type Opening = {
  id: string;
  name: string;
  english: string;
  tag: string;
  description: string;
  lesson: string;
  caution: string;
  moves: string[];
  notes: string[];
  source: string;
};
const source = "https://www.nihonkiin.or.jp/publishing/books/huseki_ge.html";
export const openings: Opening[] = [
  {
    id: "nirensei",
    name: "二连星",
    english: "Two star points",
    tag: "快速展开",
    description: "用两颗星位子迅速占据同侧两角，留出灵活的展开方向。",
    lesson: "星位重视速度和外势。两角之间是发展空间，尚不是确定地盘。",
    caution: "三三位置仍有侵入余地；不要为了保住所有模样而过度追杀。",
    moves: ["Q16", "D16", "Q4", "D4"],
    notes: [
      "黑占右上星位，先获得角部影响。",
      "白占左上角，是教学示意应手。",
      "黑占右下星位，同侧两角形成二连星。",
      "白也占左下星位；后续按全局选择挂角、拆边或守角。",
    ],
    source,
  },
  {
    id: "sanrensei",
    name: "三连星",
    english: "Three star points",
    tag: "外势与模样",
    description: "两个角的星位，再加同侧边星，形成面向中央的构架。",
    lesson:
      "第三颗星位联系两角，帮助发展外势。先考虑整体方向，再选择局部变化。",
    caution: "模样会被削减或侵入。它不是已经围好的面积，不能直接计分。",
    moves: ["Q16", "D16", "Q4", "D4", "Q10", "C6"],
    notes: [
      "先占右上角星位。",
      "白在左上展开。",
      "黑在右下再占星位。",
      "白占左下，双方开始都有构架。",
      "黑落右边星位，构成三连星。",
      "白在左侧展开，这是示意选择，双方仍有很多合理后续。",
    ],
    source,
  },
  {
    id: "chinese",
    name: "中国流",
    english: "Chinese opening",
    tag: "角边协同",
    description: "星位与小目组合，用一颗边上棋联系两角，兼顾展开与实地。",
    lesson:
      "理解星、小目和边上展开的关系。本例展示低位构架的一种示意，边子位置有多种变体。",
    caution: "对手挂角后应按全局应对，不能为了套形无视弱棋和切断。",
    moves: ["Q16", "D16", "R4", "D4", "R10", "C6"],
    notes: [
      "黑先在右上星位布局。",
      "白占左上。",
      "黑右下落小目，与星位形成不同角部性质。",
      "白占左下。",
      "黑在右侧三线展开，形成低位中国流的基本思想。",
      "白的边上展开是教学示意；后续可围绕挂角和方向展开。",
    ],
    source: "https://www.nihonkiin.or.jp/member/pdf/5-2_igoshoshin_1_19ro.pdf",
  },
  {
    id: "komoku",
    name: "小目守角",
    english: "Corner enclosure",
    tag: "实地与安定",
    description: "先落小目，再用小飞补强角部，认识守角需要付出的节奏。",
    lesson:
      "守角让角部更安定，也花费一手。比较角部安全与别处大场，而不是无条件补棋。",
    caution: "守角不是绝对活棋证明；还要看对方靠近、全盘方向和具体变化。",
    moves: ["R16", "D16", "Q4", "D4", "P17", "C6"],
    notes: [
      "黑右上小目，偏向角部实地。",
      "白占左上。",
      "黑再占右下星位。",
      "白占左下。",
      "黑以小飞补强右上，形成一个常见守角形。",
      "白在别处发展；黑需要比较已花的一手和全局所得。",
    ],
    source,
  },
  {
    id: "mixed",
    name: "星小目组合",
    english: "Star & komoku",
    tag: "灵活选择",
    description: "一角星位、一角小目，在速度与角部性质之间取得不同搭配。",
    lesson:
      "星位和小目并不是优劣标签。理解不同角的性质，能帮助决定后续守角与挂角方向。",
    caution: "不要把示意顺序当成固定定式。对手可能先挂角，也可能选择别的空角。",
    moves: ["Q16", "D16", "R4", "D4"],
    notes: [
      "黑右上星位，简洁占角。",
      "白占左上。",
      "黑右下小目，留下守角与接触战的不同选择。",
      "双方都有角部棋，下一手要看方向和已有棋子。",
    ],
    source,
  },
  {
    id: "diagonal",
    name: "对角型布局",
    english: "Diagonal opening",
    tag: "分散与方向",
    description: "双方分别占据对角，把发展方向分散到不同区域。",
    lesson:
      "四角的分配影响边上的关系。对角型让双方棋子交错，需要留意邻边上的对手。",
    caution: "分散不代表永远安全。展开时要看对手位置，避免棋块被隔开。",
    moves: ["Q16", "D16", "D4", "Q4"],
    notes: [
      "黑先占右上。",
      "白占左上。",
      "黑转向左下，形成对角分布。",
      "白在右下，双方的角部棋相互交错。",
    ],
    source,
  },
];
export function openingPositions(opening: Opening): Position[] {
  const result = [createPosition(19, 7.5)];
  for (const move of opening.moves) {
    const action: Action = { type: "play", ...fromCoord(move, 19) };
    const next = play(result[result.length - 1], action);
    if (!next.ok) throw new Error(`开局 ${opening.id} 的 ${move} 不合法`);
    result.push(next.position);
  }
  return result;
}
