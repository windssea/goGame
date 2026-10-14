import { compactGame, restoreGame } from "./domain/go";
import type { SavedGame, StoredGame } from "./domain/go";

export type Progress = {
  version: 1;
  lessons: Record<
    string,
    { complete: boolean; independent: number; hints: number; at: number }
  >;
  attempts: Record<
    string,
    {
      correct: boolean;
      hinted: boolean;
      at: number;
      reviewLevel?: number;
      reviewAt?: number;
    }
  >;
  exams: Record<string, number>;
  openings: string[];
  challenges?: Record<string, { best: number; attempts: number; at: number }>;
};
export const emptyProgress = (): Progress => ({
  version: 1,
  lessons: {},
  attempts: {},
  exams: {},
  openings: [],
});
let database: Promise<IDBDatabase> | null = null;
function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("goGame.records", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("records");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return database;
}
export async function getRecord<T>(key: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("records")
      .objectStore("records")
      .get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function setRecord(key: string, value: unknown) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("records", "readwrite");
    tx.objectStore("records").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function clearRecords() {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("records", "readwrite");
    tx.objectStore("records").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function restoreRecords(
  progress: Progress,
  games: SavedGame[],
  replace = false,
) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    if (replace) store.clear();
    store.put(progress, "progress");
    for (const game of games) store.put(compactGame(game), `game:${game.id}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const saveGames = (games: SavedGame[]) => setRecord("games", games);
export async function getGames(): Promise<SavedGame[]> {
  const database = await db();
  const records = await new Promise<SavedGame[]>((resolve, reject) => {
    const result: SavedGame[] = [];
    const request = database
      .transaction("records")
      .objectStore("records")
      .openCursor(IDBKeyRange.bound("game:", "game:\uffff"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(result);
        return;
      }
      result.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  const legacy = await getRecord<SavedGame[]>("games");
  const merged = new Map<string, SavedGame>();
  for (const game of Array.isArray(legacy) ? legacy : [])
    if (game?.id) merged.set(game.id, game);
  for (const game of records)
    if (game?.id) {
      try {
        merged.set(game.id, restoreGame(game as StoredGame));
      } catch {
        /* A damaged game never prevents loading other records. */
      }
    }
  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}
export const saveGame = (game: SavedGame) =>
  setRecord(`game:${game.id}`, compactGame(game));
export function downloadFile(
  name: string,
  content: string,
  type = "text/plain;charset=utf-8",
) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type Preferences = {
  theme: "light" | "dark";
  quality: "high" | "low";
  reducedMotion: boolean;
  sound: boolean;
  board2d: boolean;
  confirm: boolean;
  scene: "bamboo" | "room" | "night";
  boardMaterial: "kaya" | "walnut" | "slate";
};
export function loadPreferences(): Preferences {
  const defaults: Preferences = {
    theme: "light",
    quality: "high",
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    sound: true,
    board2d: false,
    confirm: matchMedia("(pointer: coarse)").matches,
    scene: "bamboo",
    boardMaterial: "kaya",
  };
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("goGame.ui.v1") || "{}"),
    };
  } catch {
    return defaults;
  }
}
