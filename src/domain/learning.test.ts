import { describe, expect, it } from "vitest";
import {
  appendMove,
  compactGame,
  createPosition,
  groupAt,
  newGame,
  play,
  restoreGame,
  stoneMoveNumbers,
  toSGF,
} from "./go";
import { readSGF } from "./sgf";
import {
  archiveGames,
  makeArchive,
  mergeProgress,
  parseArchive,
} from "../archive";
import { defaultProfile } from "../ai/remote";
import { emptyProgress } from "../storage";
import type { Preferences } from "../storage";
import { challengeDeck, challengeModes } from "../content/challenges";
import { studies } from "../content/studies";
import { rankCandidates } from "../ai/local";
const prefs: Preferences = {
  theme: "dark",
  quality: "high",
  sound: false,
  confirm: true,
  board2d: false,
  reducedMotion: true,
  scene: "night",
  boardMaterial: "slate",
};

describe("portable archives", () => {
  it("round-trips all learning records, setup positions, branches, credentials and scene choices", () => {
    const progress = {
      ...emptyProgress(),
      challenges: { tactics: { best: 80, attempts: 2, at: 10 } },
    };
    progress.lessons.a = { complete: true, independent: 3, hints: 0, at: 10 };
    const games = studies.map((s) => s.game),
      profile = {
        ...defaultProfile,
        baseURL: "https://example.com/v1",
        model: "test",
        apiKey: "dummy-test-key",
        remember: false,
      };
    const a = parseArchive(
      JSON.stringify(makeArchive(progress, prefs, profile, games, true)),
    );
    expect(a.progress).toEqual(progress);
    expect(a.profile).toEqual(profile);
    expect(a.preferences).toEqual(prefs);
    for (const [i, game] of archiveGames(a).entries()) {
      expect(Object.keys(game.nodes)).toEqual(Object.keys(games[i].nodes));
      for (const id of Object.keys(game.nodes))
        expect(game.nodes[id].position).toEqual(games[i].nodes[id].position);
    }
    expect(makeArchive(progress, prefs, profile, games).profile.apiKey).toBe(
      "",
    );
    expect(profile.apiKey).toBe("dummy-test-key");
  });
  it("rejects illegal tampered moves, cyclic trees and invalid credentials before accepting records", () => {
    const make = () =>
      structuredClone(
        makeArchive(emptyProgress(), prefs, defaultProfile, [studies[0].game]),
      );
    const bad = make(),
      child = bad.games[0].nodes[bad.games[0].root].children[0];
    bad.games[0].nodes[child].action = { type: "play", row: 99, col: 99 };
    expect(() => parseArchive(JSON.stringify(bad))).toThrow();
    const cycle = make();
    cycle.games[0].nodes[cycle.games[0].root].children.push(
      cycle.games[0].root,
    );
    expect(() => parseArchive(JSON.stringify(cycle))).toThrow();
    const keyURL = make();
    keyURL.profile = {
      ...defaultProfile,
      baseURL: "https://user:password@example.com/v1",
    };
    expect(() => parseArchive(JSON.stringify(keyURL))).toThrow();
  });
  it("merges achievements without losing stronger local scores and uses latest review evidence", () => {
    const local = emptyProgress(),
      incoming = emptyProgress();
    local.lessons.a = { complete: true, independent: 3, hints: 0, at: 10 };
    incoming.lessons.a = { complete: false, independent: 1, hints: 1, at: 20 };
    local.exams.a = 6;
    incoming.exams.a = 4;
    local.attempts.q = { correct: true, hinted: false, at: 20 };
    incoming.attempts.q = { correct: false, hinted: false, at: 10 };
    const merged = mergeProgress(local, incoming);
    expect(merged.lessons.a.complete).toBe(true);
    expect(merged.lessons.a.independent).toBe(3);
    expect(merged.exams.a).toBe(6);
    expect(merged.attempts.q.correct).toBe(true);
  });
});
describe("SGF and annotated studies", () => {
  it.each(studies)(
    "exports and imports every legal variation of $title",
    (s) => {
      const imported = readSGF(toSGF(s.game))[0];
      const ordered = (g: typeof s.game) => {
        const result: (typeof g.nodes)[string][] = [];
        const walk = (id: string) => {
          result.push(g.nodes[id]);
          g.nodes[id].children.forEach(walk);
        };
        walk(g.root);
        return result;
      };
      const old = ordered(s.game).map((n) => [
        n.action,
        n.position.board,
        n.position.toPlay,
        n.explanation,
      ]);
      const next = ordered(imported).map((n) => [
        n.action,
        n.position.board,
        n.position.toPlay,
        n.explanation,
      ]);
      expect(next.map((n) => n.slice(0, 3))).toEqual(
        old.map((n) => n.slice(0, 3)),
      );
      expect(Object.values(imported.nodes).every((n) => n.explanation)).toBe(
        true,
      );
    },
  );
  it("preserves comments, escapes, setup, handicap turn and comment-only branch histories", () => {
    const game = readSGF(
      "(;FF[4]GM[1]CA[UTF-8]SZ[9]AB[cc][gg]PL[W]C[root \\] comment];W[ee];C[pause](;B[cd]C[main])(;B[gf]C[other]))",
    )[0];
    expect(game.nodes[game.root].position.toPlay).toBe(2);
    expect(game.nodes[game.root].explanation).toBe("root ] comment");
    const stored = restoreGame(compactGame(game));
    for (const n of Object.values(game.nodes))
      expect(stored.nodes[n.id].position.history).toEqual(n.position.history);
    const archive = parseArchive(
      JSON.stringify(
        makeArchive(emptyProgress(), prefs, defaultProfile, [game]),
      ),
    );
    expect(Object.keys(archiveGames(archive)[0].nodes)).toHaveLength(5);
  });
  it("rejects invalid board sizes, malformed trees, midgame setups, illegal turns and occupied points", () => {
    for (const text of [
      "(;SZ[100])",
      "(;SZ[9];B[aa];W[aa])",
      "(;SZ[9];W[aa];W[bb])",
      "(;SZ[9];B[aa];AB[bb])",
      "(;SZ[9]C[unclosed)",
    ])
      expect(() => readSGF(text)).toThrow();
    expect(readSGF("(;SZ[9];B[aa])(;SZ[13];B[bb])")).toHaveLength(2);
  });
  it("preserves SGF comment line breaks and escapes across repeated imports", () => {
    const text =
      "(;GM[1]FF[4]CA[UTF-8]SZ[9]C[first line\nsecond \\] line];B[aa]C[hello\nworld])";
    const game = readSGF(text)[0],
      again = readSGF(toSGF(readSGF(toSGF(game))[0]))[0];
    expect(again.nodes[again.root].explanation).toBe(
      "first line\nsecond ] line",
    );
    expect(Object.values(again.nodes).at(-1)?.explanation).toBe("hello\nworld");
  });
  it("numbers moves, not intersection indices, and removes captured numbers", () => {
    let game = newGame(5, 0);
    const initial = createPosition(5, 0, [
      { row: 0, col: 0, color: 2 },
      { row: 1, col: 0, color: 1 },
    ]);
    game.nodes[game.root].position = initial;
    const r = play(initial, { type: "play", row: 0, col: 1 });
    if (!r.ok) throw new Error(r.reason);
    game = appendMove(
      game,
      { type: "play", row: 0, col: 1 },
      r.position,
      "test",
    );
    expect(stoneMoveNumbers(r.position)).toEqual({ 1: 1 });
  });
});
describe("transformed board challenges", () => {
  for (const mode of challengeModes)
    for (let orientation = 0; orientation < 8; orientation++)
      for (const swap of [false, true]) {
        it(`${mode.id}, orientation ${orientation}, color swap ${swap}: complete solution is legal`, () => {
          let calls = 0;
          const deck = challengeDeck(mode.id, () => {
            calls++;
            return calls <= mode.lessonIds.length - 1
              ? 0.1
              : (calls - (mode.lessonIds.length - 1) - 1) % 2 === 0
                ? orientation / 8 + 0.01
                : swap
                  ? 0.1
                  : 0.9;
          });
          for (const task of deck) {
            let p = task.position;
            if (task.sequence) {
              for (const action of task.sequence) {
                const r = play(p, action);
                expect(r.ok).toBe(true);
                if (r.ok) p = r.position;
              }
            } else if (!task.selectOnly) {
              for (const target of task.targets)
                expect(play(p, { type: "play", ...target }).ok).toBe(true);
            }
            expect(task.instruction).not.toContain("__");
          }
        });
      }
});
describe("local tactical judgement", () => {
  it("does not propose a move after both players pass", () => {
    const first = play(createPosition(9), { type: "pass" });
    if (!first.ok) throw new Error(first.reason);
    const second = play(first.position, { type: "pass" });
    if (!second.ok) throw new Error(second.reason);
    expect(rankCandidates(second.position)).toEqual([]);
  });
  it("saves a large atari group instead of taking an isolated, irrelevant point", () => {
    const p = createPosition(5, 0, [
      { row: 1, col: 1, color: 1 },
      { row: 1, col: 2, color: 1 },
      { row: 0, col: 1, color: 2 },
      { row: 0, col: 2, color: 2 },
      { row: 1, col: 0, color: 2 },
      { row: 1, col: 3, color: 2 },
      { row: 2, col: 1, color: 2 },
    ]);
    const candidate = rankCandidates(p, "beginner", () => 1)[0];
    const r = play(p, candidate.action);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(groupAt(r.position.board, 6, 5).liberties.size).toBeGreaterThan(1);
  });
  it("opens an empty nineteen-line board near a corner rather than center or first line", () => {
    const c = rankCandidates(createPosition(19), "beginner", () => 1)[0];
    expect(c.action.type).toBe("play");
    if (c.action.type === "play") {
      const { row, col } = c.action;
      const edge = Math.min(row, col, 18 - row, 18 - col);
      expect(edge).toBeGreaterThanOrEqual(2);
      expect(edge).toBeLessThanOrEqual(3);
      expect(
        Math.min(row, 18 - row) + Math.min(col, 18 - col),
      ).toBeLessThanOrEqual(7);
    }
  });
});
