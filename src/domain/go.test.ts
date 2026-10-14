import { describe, expect, it } from "vitest";
import {
  appendMove,
  areaScore,
  coord,
  createPosition,
  fromCoord,
  groupAt,
  newGame,
  play,
  resumePosition,
  toSGF,
  compactGame,
  restoreGame,
} from "./go";
import type { Color, Position } from "./go";
import {
  lessons,
  exams,
  ladderLine,
  sekiPosition,
  placementQuestions,
} from "../content/courses";
import { openings, openingPositions } from "../content/openings";
import { rankCandidates } from "../ai/local";
import { endpoint, protocolFingerprint, validateResponse } from "../ai/remote";
const setup = (
  black: [number, number][],
  white: [number, number][],
  size = 5,
  toPlay: Color = 1,
) =>
  createPosition(
    size,
    0,
    [
      ...black.map(([row, col]) => ({ row, col, color: 1 as Color })),
      ...white.map(([row, col]) => ({ row, col, color: 2 as Color })),
    ],
    toPlay,
  );
function move(p: Position, row: number, col: number) {
  const result = play(p, { type: "play", row, col });
  if (!result.ok) throw new Error(result.reason);
  return result.position;
}
describe("independent Go rules", () => {
  it("restores full superko histories on all saved branches without quadratic serialized history", () => {
    let game = newGame(9, 6.5);
    const root = game.root;
    let p = move(game.nodes[root].position, 1, 1);
    game = appendMove(game, { type: "play", row: 1, col: 1 }, p, "用户");
    const pass = play(p, { type: "pass" });
    if (!pass.ok) throw new Error("pass");
    game = appendMove(game, { type: "pass" }, pass.position, "本地");
    p = move(game.nodes[root].position, 2, 3);
    const branch = appendMove(
      { ...game, current: root },
      { type: "play", row: 2, col: 3 },
      p,
      "复盘试下",
    );
    const packed = compactGame(branch),
      restored = restoreGame(JSON.parse(JSON.stringify(packed)));
    for (const id of Object.keys(branch.nodes))
      expect(restored.nodes[id].position.history).toEqual(
        branch.nodes[id].position.history,
      );
    expect(packed.nodes[packed.current].position.history).toHaveLength(0);
    expect(toSGF(restored)).toBe(toSGF(branch));
  });
  it("counts corner, edge and central liberties and deduplicates a shared liberty", () => {
    const p = setup(
      [
        [0, 0],
        [0, 1],
      ],
      [],
    );
    expect([...groupAt(p.board, 0, 5).liberties].sort()).toEqual([2, 5, 6]);
    expect(groupAt(setup([[2, 2]], []).board, 12, 5).liberties.size).toBe(4);
    expect(groupAt(setup([[0, 2]], []).board, 2, 5).liberties.size).toBe(3);
  });
  it("does not connect diagonal stones", () => {
    const p = setup(
      [
        [1, 1],
        [2, 2],
      ],
      [],
    );
    expect(groupAt(p.board, 6, 5).stones.size).toBe(1);
  });
  it("captures an entire group and releases its spaces", () => {
    const p = setup(
      [
        [0, 2],
        [1, 1],
        [1, 3],
        [2, 1],
        [2, 3],
      ],
      [
        [1, 2],
        [2, 2],
      ],
    );
    const result = play(p, { type: "play", row: 3, col: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captured.sort()).toEqual([12, 7]);
      expect(result.position.captures[0]).toBe(2);
      expect(result.position.board[7]).toBe(0);
    }
  });
  it("captures two distinct adjacent enemy groups in one move", () => {
    const p = setup(
      [
        [1, 1],
        [2, 0],
        [3, 1],
        [1, 3],
        [2, 4],
        [3, 3],
      ],
      [
        [2, 1],
        [2, 3],
      ],
    );
    const result = play(p, { type: "play", row: 2, col: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.captured).toHaveLength(2);
  });
  it("rejects suicide, occupied intersections, fractions and out of range", () => {
    const p = setup(
      [],
      [
        [1, 2],
        [2, 1],
        [2, 3],
        [3, 2],
      ],
    );
    expect(play(p, { type: "play", row: 2, col: 2 }).ok).toBe(false);
    expect(play(p, { type: "play", row: 1, col: 2 }).ok).toBe(false);
    expect(play(p, { type: "play", row: -0.5, col: 2 }).ok).toBe(false);
    expect(play(p, { type: "play", row: 5, col: 2 }).ok).toBe(false);
  });
  it("checks capture before suicide, permitting a legal countercapture", () => {
    const p = setup(
      [
        [0, 1],
        [1, 0],
        [0, 3],
        [1, 4],
        [2, 0],
        [3, 1],
        [2, 4],
        [3, 3],
        [4, 2],
      ],
      [
        [1, 1],
        [1, 3],
        [2, 1],
        [2, 3],
        [3, 2],
      ],
    );
    const result = play(p, { type: "play", row: 2, col: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.position.board[12]).toBe(1);
  });
  it("rejects immediate ko recapture and permits it after exchanged distant moves", () => {
    const p = setup(
      [
        [1, 2],
        [2, 1],
        [2, 3],
      ],
      [
        [2, 2],
        [3, 1],
        [3, 3],
        [4, 2],
      ],
      7,
    );
    const captured = move(p, 3, 2);
    expect(play(captured, { type: "play", row: 2, col: 2 }).ok).toBe(false);
    const exchanged = move(move(captured, 0, 0), 6, 6);
    expect(play(exchanged, { type: "play", row: 2, col: 2 }).ok).toBe(true);
    expect(play(p, { type: "play", row: 3, col: 2 }).ok).toBe(true);
  });
  it("uses complete situational history, not just the last board", () => {
    const p = createPosition(5, 0);
    const future = move(p, 2, 2);
    const historical = {
      ...p,
      history: [...p.history, future.history.at(-1)!, "other-state"],
    };
    expect(play(historical, { type: "play", row: 2, col: 2 }).ok).toBe(false);
  });
  it("allows repeated pass states, settles after two passes and preserves history on resume", () => {
    const p = createPosition(5, 0),
      one = play(p, { type: "pass" });
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const two = play(one.position, { type: "pass" });
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    expect(two.position.passes).toBe(2);
    expect(play(two.position, { type: "play", row: 0, col: 0 }).ok).toBe(false);
    expect(resumePosition(two.position).history).toEqual(two.position.history);
    expect(move(resumePosition(two.position), 0, 0).passes).toBe(0);
  });
  it("scores live stones, one-color empty regions and neutral mixed regions without adding captures", () => {
    const p = setup(
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 2],
        [2, 0],
        [2, 1],
        [2, 2],
      ],
      [[4, 4]],
      5,
    );
    const score = areaScore({ ...p, captures: [99, 50], komi: 6.5 });
    expect(score.black).toBe(9);
    expect(score.white).toBe(7.5);
    expect(score.blackTerritory).toBe(1);
    expect(score.neutral).toBe(15);
    expect(score.winner).toBe(1);
  });
  it("scores an empty board as neutral and removes only the confirmed dead group", () => {
    expect(areaScore(createPosition(5, 0)).neutral).toBe(25);
    expect(areaScore(createPosition(5, 0)).winner).toBe(0);
    const p = setup([[0, 0]], [[4, 4]], 5);
    const score = areaScore(p, [24]);
    expect(score.whiteStones).toBe(0);
    expect(score.black).toBe(25);
  });
  it("preserves confirmed seki stones and treats mixed shared liberties as neutral", () => {
    const p = setup([[0, 0]], [[4, 4]], 5);
    const score = areaScore(p);
    expect(score.blackStones).toBe(1);
    expect(score.whiteStones).toBe(1);
    expect(score.neutral).toBe(23);
  });
  it.each([5, 9, 13, 19])(
    "supports %i lines and coordinate round trips",
    (size) => {
      for (const point of [
        { row: 0, col: 0 },
        { row: size - 1, col: size - 1 },
        { row: 2, col: 3 },
      ])
        expect(fromCoord(coord(point, size), size)).toEqual(point);
      expect(createPosition(size).board).toHaveLength(size * size);
    },
  );
  it("exports SGF coordinates, pass moves and review branches", () => {
    let game = newGame(9, 6.5),
      p = move(game.nodes[game.current].position, 0, 1);
    game = appendMove(game, { type: "play", row: 0, col: 1 }, p, "用户");
    const root = game.root;
    const result = play(p, { type: "pass" });
    if (!result.ok) throw new Error("pass");
    game = appendMove(game, { type: "pass" }, result.position, "本地");
    const p2 = move(game.nodes[root].position, 2, 3);
    game = appendMove(
      { ...game, current: root },
      { type: "play", row: 2, col: 3 },
      p2,
      "复盘试下",
    );
    const sgf = toSGF(game);
    expect(sgf).toContain("B[ba]");
    expect(sgf).toContain("W[]");
    expect(sgf).toContain("B[dc]");
    expect(sgf).toContain("RU[teaching-area-v1]");
  });
});
describe("course and opening integrity", () => {
  it("uses real 5, 13 and 19 line teaching positions and eight separate placement questions", () => {
    expect(lessons[0].position.size).toBe(5);
    expect(lessons[23].position.size).toBe(13);
    expect(lessons[30].position.size).toBe(13);
    expect(lessons[31].position.size).toBe(19);
    const all = [
      ...lessons.flatMap((l) => l.questions),
      ...exams.flat(),
      ...placementQuestions,
    ];
    expect(new Set(all.map((q) => q.id)).size).toBe(152);
  });
  it("contains 32 lessons, 96 lesson questions and 48 separate stage questions", () => {
    expect(lessons).toHaveLength(32);
    expect(lessons.flatMap((l) => l.questions)).toHaveLength(96);
    expect(exams.flat()).toHaveLength(48);
    expect(placementQuestions).toHaveLength(8);
    const all = [...lessons.flatMap((l) => l.questions), ...exams.flat()];
    expect(new Set(all.map((q) => q.id)).size).toBe(144);
    for (const q of all) {
      expect(q.options).toHaveLength(3);
      expect(q.options[q.answer]).toBeTruthy();
    }
  });
  it.each(lessons)(
    "$id has a legal complete demonstration and valid interaction targets",
    (lesson) => {
      let p = lesson.position;
      for (const action of lesson.demo) {
        const result = play(p, action);
        expect(result.ok, `${lesson.id} demo`).toBe(true);
        if (result.ok) p = result.position;
      }
      for (const variant of lesson.variants || []) {
        let position = variant.position;
        for (const action of variant.demo) {
          const result = play(position, action);
          expect(result.ok, `${lesson.id} variant ${variant.label}`).toBe(true);
          if (result.ok) position = result.position;
        }
      }
      for (const target of lesson.task.accepted) {
        expect(target.row).toBeGreaterThanOrEqual(0);
        expect(target.col).toBeLessThan(lesson.position.size);
        if (!lesson.task.selectOnly)
          expect(
            play(lesson.position, { type: "play", ...target }).ok,
            `${lesson.id} target`,
          ).toBe(true);
      }
    },
  );
  it("verifies full ladder capture, breaker escape, net and snapback outcomes", () => {
    const ladder = lessons[14];
    let p = ladder.position;
    for (const action of ladderLine) {
      const result = play(p, action);
      if (!result.ok) throw new Error(result.reason);
      p = result.position;
    }
    expect(p.captures[0]).toBe(14);
    expect(p.board.filter((c) => c === 2)).toHaveLength(0);
    const breaker = ladder.variants![0];
    p = breaker.position;
    for (const action of breaker.demo) {
      const result = play(p, action);
      if (!result.ok) throw new Error(result.reason);
      p = result.position;
    }
    expect(groupAt(p.board, 6 * 9 + 5, 9).liberties.size).toBe(3);
    const snapback = lessons[15];
    p = snapback.position;
    for (const action of snapback.demo) {
      const result = play(p, action);
      if (!result.ok) throw new Error(result.reason);
      p = result.position;
    }
    expect(p.captures).toEqual([3, 1]);
    const net = snapback.variants![0];
    p = net.position;
    for (const action of net.demo) {
      const result = play(p, action);
      if (!result.ok) throw new Error(result.reason);
      p = result.position;
    }
    expect(p.captures[0]).toBe(2);
    p = move(move(net.position, 3, 3), 3, 2);
    p = move(p, 2, 3);
    expect(p.captures[0]).toBe(2);
  });
  it("proves the two shared-liberty seki: whichever side fills first gets captured", () => {
    for (const color of [1, 2] as const) {
      const p = sekiPosition(color);
      const groups = [groupAt(p.board, 0, 5), groupAt(p.board, 4, 5)];
      expect([...groups[0].liberties].sort()).toEqual([17, 7]);
      expect([...groups[1].liberties].sort()).toEqual([17, 7]);
      const after = move(move(p, 1, 2), 3, 2);
      expect(after.board.filter((c) => c === color)).toHaveLength(0);
    }
  });
  it.each(openings)(
    "$name plays legal alternating moves on the full standard board",
    (opening) => {
      const positions = openingPositions(opening);
      expect(positions).toHaveLength(opening.moves.length + 1);
      expect(positions.at(-1)?.moveNumber).toBe(opening.moves.length);
      expect(positions.at(-1)?.size).toBe(19);
    },
  );
});
describe("AI boundaries", () => {
  it("uses a bounded digest that distinguishes identical boards with different complete histories", async () => {
    const p = createPosition(19, 7.5),
      hash = await protocolFingerprint(p);
    expect(hash).toHaveLength(64);
    expect(
      await protocolFingerprint({
        ...p,
        history: [...p.history, "previous-situation"],
      }),
    ).not.toBe(hash);
    expect(await protocolFingerprint(p)).toBe(hash);
  });
  it("does not fill shared seki liberties when doing so immediately loses its group", () => {
    const candidate = rankCandidates(sekiPosition(), "beginner", () => 1)[0];
    expect(candidate.action).toEqual({ type: "pass" });
  });
  it("chooses legal candidates and finds a direct capture", () => {
    const p = setup(
      [
        [1, 2],
        [2, 1],
        [2, 3],
      ],
      [[2, 2]],
    );
    const candidates = rankCandidates(p, "beginner", () => 1);
    expect(candidates[0].action).toEqual({ type: "play", row: 3, col: 2 });
    candidates.forEach((c) => expect(play(p, c.action).ok).toBe(true));
  });
  it("checks reply identity and allowed action instead of trusting a generated move", () => {
    const p = createPosition(5, 0),
      candidates = rankCandidates(p, "guided", () => 1),
      snapshot = {
        requestId: "a",
        positionVersion: 0,
        positionHash: "snapshot",
      };
    const response = {
      protocol: "go-ai-v1",
      ...snapshot,
      actionId: candidates[0].id,
    };
    expect(validateResponse(response, snapshot, candidates)).toBe(
      candidates[0],
    );
    expect(() =>
      validateResponse(
        { ...response, actionId: "p-99-99" },
        snapshot,
        candidates,
      ),
    ).toThrow();
    expect(() =>
      validateResponse({ ...response, requestId: "old" }, snapshot, candidates),
    ).toThrow();
  });
  it("joins endpoint paths and rejects credentials or ambiguous complete endpoints", () => {
    expect(endpoint("https://example.com/api/v1/")).toBe(
      "https://example.com/api/v1/chat/completions",
    );
    expect(() => endpoint("https://example.com/v1?key=secret")).toThrow();
    expect(() => endpoint("https://user:pass@example.com/v1")).toThrow();
    expect(() => endpoint("https://example.com/v1/chat/completions")).toThrow();
    expect(() => endpoint("http://remote.example/v1")).toThrow();
    expect(endpoint("http://127.0.0.1:8080/v1")).toContain(
      "/v1/chat/completions",
    );
  });
});
