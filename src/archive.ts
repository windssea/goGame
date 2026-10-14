import {
  compactGame,
  createPosition,
  fingerprint,
  play,
  restoreGame,
  resumePosition,
} from "./domain/go";
import type { SavedGame, StoredGame } from "./domain/go";
import { defaultProfile, endpoint } from "./ai/remote";
import type { AIProfile } from "./ai/remote";
import type { Preferences, Progress } from "./storage";

export type Archive = {
  format: "go-studio-archive";
  version: 1;
  exportedAt: string;
  progress: Progress;
  preferences: Preferences;
  profile: AIProfile;
  games: StoredGame[];
};
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
const safeKey = (s: string) =>
  /^[a-zA-Z0-9_.-]{1,128}$/.test(s) &&
  !["__proto__", "constructor", "prototype"].includes(s);
const fail = (): never => {
  throw new Error("存档结构不完整或已损坏，未修改现有记录。");
};

export function makeArchive(
  progress: Progress,
  preferences: Preferences,
  profile: AIProfile,
  games: SavedGame[],
  includeKey = false,
): Archive {
  return {
    format: "go-studio-archive",
    version: 1,
    exportedAt: new Date().toISOString(),
    progress,
    preferences,
    profile: { ...profile, apiKey: includeKey ? profile.apiKey : "" },
    games: games.map(compactGame),
  };
}
export function parseArchive(text: string): Archive {
  if (text.length > 20 * 1024 * 1024)
    throw new Error("存档超过 20 MB，请分开保存棋谱。");
  let a: any;
  try {
    a = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON 存档。");
  }
  if (!object(a) || a.format !== "go-studio-archive" || a.version !== 1)
    throw new Error("请选择弈间完整存档（版本 1）。");
  const p = a.progress;
  if (
    !object(p) ||
    p.version !== 1 ||
    !object(p.lessons) ||
    !object(p.attempts) ||
    !object(p.exams) ||
    !Array.isArray(p.openings) ||
    !p.openings.every((s: unknown) => typeof s === "string")
  )
    fail();
  for (const dictionary of [p.lessons, p.attempts, p.exams, p.challenges || {}])
    if (!Object.keys(dictionary).every(safeKey)) fail();
  for (const v of Object.values(p.lessons))
    if (
      !object(v) ||
      typeof v.complete !== "boolean" ||
      !finite(v.independent) ||
      !finite(v.hints) ||
      !finite(v.at)
    )
      fail();
  for (const v of Object.values(p.attempts))
    if (
      !object(v) ||
      typeof v.correct !== "boolean" ||
      typeof v.hinted !== "boolean" ||
      !finite(v.at) ||
      (v.reviewLevel !== undefined &&
        (!finite(v.reviewLevel) || v.reviewLevel > 3)) ||
      (v.reviewAt !== undefined && !finite(v.reviewAt))
    )
      fail();
  if (!Object.values(p.exams).every(finite)) fail();
  if (p.challenges !== undefined) {
    if (!object(p.challenges)) fail();
    for (const v of Object.values(p.challenges))
      if (!object(v) || !finite(v.best) || !finite(v.attempts) || !finite(v.at))
        fail();
  }
  const prefs = a.preferences,
    profile = a.profile;
  if (
    !object(prefs) ||
    !["light", "dark"].includes(prefs.theme) ||
    !["high", "low"].includes(prefs.quality) ||
    !["bamboo", "room", "night"].includes(prefs.scene) ||
    !["kaya", "walnut", "slate"].includes(prefs.boardMaterial) ||
    !["sound", "confirm", "board2d", "reducedMotion"].every(
      (k) => typeof prefs[k] === "boolean",
    )
  )
    fail();
  if (
    !object(profile) ||
    profile.version !== 1 ||
    !["baseURL", "model", "apiKey"].every(
      (k) => typeof profile[k] === "string",
    ) ||
    typeof profile.remember !== "boolean" ||
    !finite(profile.timeout) ||
    profile.timeout < 10 ||
    profile.timeout > 120 ||
    !finite(profile.maxTokens) ||
    profile.maxTokens < 200 ||
    profile.maxTokens > 4000
  )
    fail();
  if (profile.baseURL) endpoint(profile.baseURL);
  if (!Array.isArray(a.games) || a.games.length > 1000) fail();
  const ids = new Set<string>();
  for (const raw of a.games) {
    if (
      !object(raw) ||
      typeof raw.id !== "string" ||
      !safeKey(raw.id) ||
      ids.has(raw.id) ||
      typeof raw.title !== "string" ||
      !finite(raw.createdAt) ||
      !object(raw.nodes) ||
      ![1, 2].includes(raw.human) ||
      !["local", "remote"].includes(raw.opponent) ||
      typeof raw.assisted !== "boolean" ||
      !["guided", "beginner", "challenge", "advanced"].includes(raw.difficulty)
    )
      fail();
    ids.add(raw.id);
    const keys = Object.keys(raw.nodes);
    if (
      !keys.length ||
      keys.length > 5000 ||
      !keys.every(safeKey) ||
      !Object.hasOwn(raw.nodes, raw.root) ||
      !Object.hasOwn(raw.nodes, raw.current)
    )
      fail();
    const seen = new Set<string>(),
      queue = [raw.root];
    // Breadth-first validation avoids recursion and verifies every branch against the actual rules.
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      if (seen.has(id) || !Object.hasOwn(raw.nodes, id)) fail();
      seen.add(id);
      const n = raw.nodes[id],
        pos = n?.position;
      if (
        !object(n) ||
        (n.source !== undefined && typeof n.source !== "string") ||
        (n.explanation !== undefined && typeof n.explanation !== "string")
      )
        fail();
      if (
        !object(n) ||
        n.id !== id ||
        !Array.isArray(n.children) ||
        !object(pos) ||
        ![5, 9, 13, 19].includes(pos.size) ||
        !Array.isArray(pos.board) ||
        pos.board.length !== pos.size ** 2 ||
        !pos.board.every((c: unknown) => c === 0 || c === 1 || c === 2) ||
        ![1, 2].includes(pos.toPlay) ||
        !finite(pos.moveNumber) ||
        !Number.isFinite(pos.komi) ||
        !Array.isArray(pos.captures) ||
        pos.captures.length !== 2 ||
        !pos.captures.every(finite) ||
        ![0, 1, 2].includes(pos.passes) ||
        !Array.isArray(pos.history)
      )
        fail();
      if (id === raw.root) {
        if (
          n.parent !== null ||
          n.action !== null ||
          pos.moveNumber !== 0 ||
          pos.passes !== 0 ||
          pos.captures.some(Boolean)
        )
          fail();
        n.position = createPosition(
          pos.size,
          pos.komi,
          pos.board.flatMap((c: number, i: number) =>
            c
              ? [
                  {
                    row: Math.floor(i / pos.size),
                    col: i % pos.size,
                    color: c as 1 | 2,
                  },
                ]
              : [],
          ),
          pos.toPlay,
        );
      } else {
        if (!seen.has(n.parent)) fail();
        let parent = raw.nodes[n.parent].position;
        if (n.action === null) {
          if (
            fingerprint(parent.board, parent.toPlay) !==
              fingerprint(pos.board, pos.toPlay) ||
            parent.moveNumber !== pos.moveNumber ||
            parent.passes !== pos.passes ||
            parent.captures.join() !== pos.captures.join()
          )
            fail();
          n.position = parent;
          for (const child of n.children) {
            if (typeof child !== "string" || raw.nodes[child]?.parent !== id)
              fail();
            queue.push(child);
          }
          continue;
        }
        if (!object(n.action) || !["play", "pass"].includes(n.action.type))
          fail();
        if (parent.passes >= 2) parent = resumePosition(parent);
        const result = play(parent, n.action);
        if (!result.ok) throw new Error("存档包含不合法的棋谱着手。");
        if (
          fingerprint(result.position.board, result.position.toPlay) !==
            fingerprint(pos.board, pos.toPlay) ||
          result.position.size !== pos.size ||
          result.position.moveNumber !== pos.moveNumber ||
          result.position.komi !== pos.komi ||
          result.position.captures.join() !== pos.captures.join() ||
          (result.position.passes !== pos.passes &&
            !(result.position.passes === 2 && pos.passes === 0))
        )
          fail();
        n.position =
          pos.passes === 0 && result.position.passes === 2
            ? resumePosition(result.position)
            : result.position;
      }
      for (const child of n.children) {
        if (typeof child !== "string" || raw.nodes[child]?.parent !== id)
          fail();
        queue.push(child);
      }
    }
    if (seen.size !== keys.length) fail();
    // Histories have been regenerated from legal moves, independent of file claims.
    delete raw.historyEncoding;
  }
  return { ...a, profile: { ...defaultProfile, ...profile } } as Archive;
}
export function archiveGames(archive: Archive): SavedGame[] {
  return archive.games.map(restoreGame);
}
export function mergeProgress(local: Progress, incoming: Progress): Progress {
  const lessons = { ...local.lessons };
  for (const [id, lesson] of Object.entries(incoming.lessons)) {
    const old = lessons[id];
    lessons[id] = old
      ? {
          ...lesson,
          complete: old.complete || lesson.complete,
          independent: Math.max(old.independent, lesson.independent),
          at: Math.max(old.at, lesson.at),
        }
      : lesson;
  }
  const attempts = { ...local.attempts };
  for (const [id, attempt] of Object.entries(incoming.attempts))
    if (!attempts[id] || attempts[id].at < attempt.at) attempts[id] = attempt;
  const exams = { ...local.exams };
  for (const [id, score] of Object.entries(incoming.exams))
    exams[id] = Math.max(exams[id] || 0, score);
  const challenges = { ...local.challenges };
  for (const [id, result] of Object.entries(incoming.challenges || {})) {
    const old = challenges[id];
    challenges[id] = old
      ? {
          best: Math.max(old.best, result.best),
          attempts: Math.max(old.attempts, result.attempts),
          at: Math.max(old.at, result.at),
        }
      : result;
  }
  return {
    version: 1,
    lessons,
    attempts,
    exams,
    openings: [...new Set([...local.openings, ...incoming.openings])],
    challenges,
  };
}
