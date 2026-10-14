import { useState } from "react";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import {
  archiveGames,
  makeArchive,
  mergeProgress,
  parseArchive,
} from "../archive";
import type { Archive } from "../archive";
import { downloadFile, restoreRecords } from "../storage";
import type { Preferences, Progress } from "../storage";
import type { SavedGame } from "../domain/go";
import type { AIProfile } from "../ai/remote";

export function ArchivePanel({
  progress,
  preferences,
  profile,
  games,
  loaded,
}: {
  progress: Progress;
  preferences: Preferences;
  profile: AIProfile;
  games: SavedGame[];
  loaded: (
    p: Progress,
    prefs: Preferences,
    ai: AIProfile,
    g: SavedGame[],
  ) => void;
}) {
  const [includeKey, setIncludeKey] = useState(false),
    [incoming, setIncoming] = useState<Archive | null>(null),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const [loadMode, setLoadMode] = useState<"merge" | "restore">("merge");
  return (
    <section className="settings-card archive-panel">
      <h2>随身存档</h2>
      <p>
        一次保存学习进度、挑战成绩、全部棋谱、场景偏好和 AI
        配置。可在另一浏览器快速恢复。
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={includeKey}
          onChange={(e) => setIncludeKey(e.target.checked)}
        />
        包含 API 密钥
      </label>
      {includeKey && (
        <p className="archive-key-note">
          密钥会以明文写入文件，请只存放在自己的设备。
        </p>
      )}
      <button
        className="button primary full"
        onClick={() => {
          downloadFile(
            `弈间-完整存档-${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify(
              makeArchive(progress, preferences, profile, games, includeKey),
            ),
            "application/json",
          );
          setStatus("完整存档已导出。");
        }}
      >
        <DownloadSimple size={18} />
        导出完整存档
      </button>
      <label className="button secondary full archive-upload">
        <UploadSimple size={18} />
        加载完整存档
        <input
          type="file"
          accept=".json,application/json"
          aria-label="加载完整存档文件"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              if (file.size > 20 * 1024 * 1024)
                throw new Error("文件超过 20 MB。");
              const archive = parseArchive(await file.text());
              setIncoming(archive);
              setStatus("");
            } catch (error) {
              setIncoming(null);
              setStatus(
                error instanceof Error ? error.message : "读取存档失败。",
              );
            }
          }}
        />
      </label>
      {incoming && (
        <div className="archive-preview">
          <h3>存档预览</h3>
          <p>
            {
              Object.values(incoming.progress.lessons).filter((v) => v.complete)
                .length
            }{" "}
            节已学课程 · {incoming.games.length} 盘棋 ·{" "}
            {incoming.profile.model || "未配置 AI"}
          </p>
          <p>
            界面和 AI
            配置使用存档设置。选择合并可保留现有成果，选择恢复可回到存档当时的状态。
          </p>
          <label className="field">
            加载方式
            <select
              aria-label="存档加载方式"
              value={loadMode}
              onChange={(e) =>
                setLoadMode(e.target.value as "merge" | "restore")
              }
            >
              <option value="merge">合并成果 · 保留本机同 ID 棋局</option>
              <option value="restore">恢复存档 · 替换本机进度与全部棋谱</option>
            </select>
          </label>
          {loadMode === "restore" && (
            <p>
              本机当前进度与棋谱会被替换。需要保留它们时，请先导出一份完整存档。
            </p>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setIncoming(null)}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                let oldPrefs: string | null = null,
                  oldAI: string | null = null,
                  backupTaken = false;
                try {
                  oldPrefs = localStorage.getItem("goGame.ui.v1");
                  oldAI = localStorage.getItem("goGame.ai.v1");
                  backupTaken = true;
                  if (loadMode === "restore" && navigator.locks) {
                    const locks = await navigator.locks.query();
                    if (
                      locks.held?.some((lock) =>
                        lock.name?.startsWith("goGame.game."),
                      )
                    )
                      throw new Error(
                        "还有其他标签页正在使用棋局，请先在那些标签页返回对弈大厅，再恢复存档。",
                      );
                  }
                  const merged =
                    loadMode === "restore"
                      ? incoming.progress
                      : mergeProgress(progress, incoming.progress);
                  const combined =
                    loadMode === "restore"
                      ? archiveGames(incoming)
                      : [
                          ...games,
                          ...archiveGames(incoming).filter(
                            (g) => !games.some((local) => local.id === g.id),
                          ),
                        ];
                  localStorage.setItem(
                    "goGame.ui.v1",
                    JSON.stringify(incoming.preferences),
                  );
                  localStorage.setItem(
                    "goGame.ai.v1",
                    JSON.stringify({
                      ...incoming.profile,
                      apiKey: incoming.profile.remember
                        ? incoming.profile.apiKey
                        : "",
                    }),
                  );
                  await restoreRecords(
                    merged,
                    combined,
                    loadMode === "restore",
                  );
                  loaded(
                    merged,
                    incoming.preferences,
                    incoming.profile,
                    combined,
                  );
                  setIncoming(null);
                  setStatus(
                    loadMode === "restore"
                      ? "已恢复为存档中的进度与棋谱。"
                      : "存档已加载，学习进度与棋谱已合并。",
                  );
                } catch (error) {
                  try {
                    if (backupTaken) {
                      if (oldPrefs === null)
                        localStorage.removeItem("goGame.ui.v1");
                      else localStorage.setItem("goGame.ui.v1", oldPrefs);
                      if (oldAI === null)
                        localStorage.removeItem("goGame.ai.v1");
                      else localStorage.setItem("goGame.ai.v1", oldAI);
                    }
                  } catch {
                    /* Storage unavailable. */
                  }
                  setStatus(
                    error instanceof Error && error.message.includes("标签页")
                      ? error.message
                      : "存档写入失败，未加载学习记录。请检查浏览器存储空间。",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "正在加载…"
                : loadMode === "restore"
                  ? "恢复此存档"
                  : "合并并加载"}
            </button>
          </div>
        </div>
      )}
      {status && (
        <p role="status" className="archive-status">
          {status}
        </p>
      )}
    </section>
  );
}
