import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  DownloadSimple,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  UploadSimple,
} from "@phosphor-icons/react";
import { Board, MiniBoard } from "../components/Board";
import { CoachButton } from "../components/Coach";
import { studies, studyMoveLabel } from "../content/studies";
import type { Study } from "../content/studies";
import type { Point, SavedGame } from "../domain/go";
import { toSGF } from "../domain/go";
import { readSGF } from "../domain/sgf";
import { downloadFile } from "../storage";
import type { Preferences } from "../storage";

export function StudyLibrary({
  navigate,
  games,
  importGames,
}: {
  navigate: (r: string) => void;
  games: SavedGame[];
  importGames: (g: SavedGame[]) => Promise<void>;
}) {
  const [topic, setTopic] = useState("全部"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const imported = games.filter((g) =>
    g.nodes[g.root].source?.startsWith("SGF"),
  );
  return (
    <section className="study-library">
      <div className="section-title">
        <div>
          <div className="eyebrow">ANNOTATED GAME ROOM</div>
          <h2>棋谱研习室</h2>
          <p>逐手理解、选择分支、带着问题打谱。也可以加载自己的 SGF。</p>
        </div>
        <label className="button secondary archive-upload">
          <UploadSimple size={18} />
          导入 SGF
          <input
            type="file"
            accept=".sgf"
            aria-label="导入 SGF 棋谱文件"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                if (f.size > 2 * 1024 * 1024)
                  throw new Error("SGF 文件超过 2 MB。");
                const g = readSGF(await f.text());
                await importGames(g);
                setStatus(`已导入 ${g.length} 盘棋，注解与分支已保存。`);
              } catch (error) {
                setStatus(
                  error instanceof Error ? error.message : "导入失败。",
                );
              }
            }}
          />
        </label>
      </div>
      <div className="study-filters">
        <input
          aria-label="搜索教学棋谱"
          placeholder="搜索主题、棋形…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-tabs">
          {["全部", ...new Set(studies.map((s) => s.topic))].map((t) => (
            <button
              key={t}
              className={topic === t ? "active" : ""}
              onClick={() => setTopic(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {status && (
        <p role="status" className="notice">
          {status}
        </p>
      )}
      <div className="study-grid">
        {studies
          .filter(
            (s) =>
              (topic === "全部" || s.topic === topic) &&
              `${s.title}${s.description}`.includes(query),
          )
          .map((s) => (
            <button
              key={s.id}
              className="study-card"
              onClick={() => navigate(`study/${s.id}`)}
            >
              <MiniBoard
                position={
                  s.game.nodes[Object.keys(s.game.nodes).at(-1)!].position
                }
                size={150}
              />
              <div>
                <span className="eyebrow">
                  {s.level} / {s.topic}
                </span>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
                <small>
                  {Object.values(s.game.nodes).filter((n) => n.action).length}{" "}
                  手（含变化）
                </small>
              </div>
              <ArrowRight size={20} />
            </button>
          ))}
      </div>
      {imported.length > 0 && (
        <>
          <div className="section-title">
            <h3>你导入的棋谱</h3>
            <span className="pill">{imported.length} 盘</span>
          </div>
          <div className="study-grid">
            {imported
              .filter((g) => g.title.includes(query))
              .map((g) => (
                <button
                  className="study-card"
                  key={g.id}
                  onClick={() => navigate(`study/${g.id}`)}
                >
                  <MiniBoard position={g.nodes[g.root].position} size={110} />
                  <div>
                    <h3>{g.title}</h3>
                    <p>保留 SGF 注解与变化分支</p>
                  </div>
                  <ArrowRight size={20} />
                </button>
              ))}
          </div>
        </>
      )}
      <p className="study-source-note">
        内置内容是原创教学示意与课程变化，职业棋谱可以自行导入。支持
        UTF-8、根节点设子、停着、注解与分支；中途摆棋图需拆为独立谱。
        <a
          href="https://cvsbook.red-bean.com/sgf/"
          target="_blank"
          rel="noreferrer"
        >
          SGF 格式说明
        </a>
      </p>
    </section>
  );
}
export function StudyView({
  study,
  preferences,
  navigate,
  game: imported,
  save,
}: {
  study?: Study;
  game?: SavedGame;
  preferences: Preferences;
  navigate: (r: string) => void;
  save: (g: SavedGame) => void;
}) {
  const game = study?.game || imported!;
  const [current, setCurrent] = useState(game.root),
    [playing, setPlaying] = useState(false),
    [numbers, setNumbers] = useState(true),
    [showLiberties, setLiberties] = useState(false);
  const node = game.nodes[current];
  const [selected, setSelected] = useState<Point | null>(null);
  const [branchChoices, setBranchChoices] = useState<Record<string, string>>(
    {},
  );
  const branch = (id: string) =>
    branchChoices[id] && game.nodes[id].children.includes(branchChoices[id])
      ? branchChoices[id]
      : game.nodes[id].children[0];
  const chain: string[] = [game.root];
  while (branch(chain.at(-1)!)) chain.push(branch(chain.at(-1)!));
  const i = chain.indexOf(current);
  useEffect(() => {
    if (!playing) return;
    const next = branch(current);
    if (!next) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setCurrent(next), 1100);
    return () => clearTimeout(timer);
  }, [playing, current, branchChoices]);
  const seek = (index: number) => {
    setPlaying(false);
    setCurrent(chain[index]);
  };
  return (
    <div className="page-enter">
      <button className="back-link" onClick={() => navigate("openings")}>
        <ArrowLeft size={18} />
        返回棋谱研习室
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{study?.topic || "YOUR SGF"}</div>
          <h1>{game.title}</h1>
          <p>{study?.description || "浏览你的棋谱注解，比较变化分支。"}</p>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            downloadFile(
              `${game.title}.sgf`,
              toSGF(game),
              "application/x-go-sgf",
            )
          }
        >
          <DownloadSimple size={18} />
          导出 SGF
        </button>
      </div>
      <div className="workbench">
        <Board
          position={node.position}
          coachNote={node.explanation}
          preferences={preferences}
          numbers={numbers}
          showLiberties={showLiberties}
          selected={selected}
          onSelect={setSelected}
        />
        <aside className="lesson-panel">
          <div className="eyebrow">
            第 {node.position.moveNumber} 手 / {chain.length - 1} 步
          </div>
          <h2>
            {current === game.root
              ? "先看起始局面"
              : studyMoveLabel(game, current)}
          </h2>
          <p className="study-comment">
            {node.explanation ||
              "这一步没有原谱注解，可以观察棋块的气、连接与方向，再询问教练。"}
          </p>
          <div className="playback-controls">
            <button aria-label="棋谱起点" onClick={() => seek(0)}>
              <SkipBack size={21} />
            </button>
            <button
              aria-label="棋谱上一步"
              disabled={!node.parent}
              onClick={() => {
                setPlaying(false);
                setCurrent(node.parent!);
              }}
            >
              <ArrowLeft size={21} />
            </button>
            <button
              aria-label={playing ? "暂停打谱" : "自动打谱"}
              disabled={!node.children.length}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? <Pause size={21} /> : <Play size={21} />}
            </button>
            <button
              aria-label="棋谱下一步"
              disabled={!node.children.length}
              onClick={() => {
                setPlaying(false);
                setCurrent(branch(current));
              }}
            >
              <ArrowRight size={21} />
            </button>
            <button
              aria-label="棋谱最后一步"
              onClick={() => seek(chain.length - 1)}
            >
              <SkipForward size={21} />
            </button>
          </div>
          <input
            type="range"
            aria-label="棋谱手数"
            min={0}
            max={chain.length - 1}
            value={i < 0 ? 0 : i}
            onChange={(e) => seek(Number(e.target.value))}
          />
          {node.children.length > 1 && (
            <div className="study-branches">
              <h3>比较变化</h3>
              {node.children.map((child, n) => (
                <button
                  className={`button ${branch(current) === child ? "primary" : "secondary"}`}
                  key={child}
                  onClick={() => {
                    setPlaying(false);
                    setBranchChoices((p) => ({ ...p, [current]: child }));
                    setCurrent(child);
                  }}
                >
                  {n === 0 ? "主线" : "变化 " + n} ·{" "}
                  {studyMoveLabel(game, child)}
                </button>
              ))}
            </div>
          )}
          <label className="toggle-row">
            <span>显示棋盘编号</span>
            <input
              type="checkbox"
              checked={numbers}
              onChange={(e) => setNumbers(e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <span>显示棋块的气</span>
            <input
              type="checkbox"
              checked={showLiberties}
              onChange={(e) => setLiberties(e.target.checked)}
            />
          </label>
          <CoachButton question="请根据当前棋谱注解和棋盘，讲解这手的目的，并比较下一手的方向。" />
          {study && (
            <div className="study-questions">
              <h3>带着问题看</h3>
              {study.questions.map((q) => (
                <p key={q}>{q}</p>
              ))}
            </div>
          )}
          <button
            className="button secondary full"
            onClick={() => {
              const copy = {
                ...game,
                id: crypto.randomUUID(),
                current,
                createdAt: Date.now(),
                title: `研习：${game.title}`,
              };
              save(copy);
              navigate(`review/${copy.id}`);
            }}
          >
            保存为我的棋谱 · 复盘试下 <ArrowRight size={18} />
          </button>
          <small className="study-origin">
            {study?.origin || "用户导入棋谱"}
          </small>
        </aside>
      </div>
    </div>
  );
}
