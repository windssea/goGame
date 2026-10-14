import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowCounterClockwise,
  CheckCircle,
  DownloadSimple,
  Flag,
  Lightbulb,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SpinnerGap,
  Stop,
  Trash,
  TreeStructure,
} from "@phosphor-icons/react";
import { Board, StoneDot } from "../components/Board";
import {
  actionId,
  appendMove,
  areaScore,
  coord,
  groupAt,
  index,
  other,
  pathTo,
  play,
  resumePosition,
  toSGF,
} from "../domain/go";
import type { Action, Point, SavedGame } from "../domain/go";
import { difficultyLabels } from "../ai/local";
import type { Candidate, Difficulty } from "../ai/local";
import { askAdvice, remoteMove } from "../ai/remote";
import type { AIProfile } from "../ai/remote";
import { downloadFile } from "../storage";
import type { Preferences } from "../storage";

function analyze(
  position: SavedGame["nodes"][string]["position"],
  difficulty: Difficulty,
  signal: AbortSignal,
): Promise<Candidate[]> {
  const worker = new Worker(new URL("../ai/worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const abort = () => {
      worker.terminate();
      reject(new DOMException("已取消", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      if (event.data.id !== id) return;
      worker.terminate();
      signal.removeEventListener("abort", abort);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.candidates);
    };
    worker.onerror = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
      reject(new Error("本地分析暂时失败"));
    };
    worker.postMessage({ id, position, difficulty });
  });
}
function stoneSound(enabled: boolean) {
  if (!enabled) return;
  try {
    const context = new AudioContext(),
      oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      180,
      context.currentTime + 0.08,
    );
    gain.gain.setValueAtTime(0.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
    oscillator.onended = () => {
      void context.close();
    };
  } catch {
    /* Sound is optional, and unavailable audio never blocks a move. */
  }
}
export function PlayView({
  game,
  update,
  preferences,
  profile,
  navigate,
  readOnly = false,
  initialReview = false,
}: {
  game: SavedGame;
  update: (g: SavedGame) => void;
  preferences: Preferences;
  profile: AIProfile;
  navigate: (route: string) => void;
  readOnly?: boolean;
  initialReview?: boolean;
}) {
  const latest = useRef(game);
  latest.current = game;
  const [selected, setSelected] = useState<Point | null>(null),
    [pending, setPending] = useState<Point | null>(null),
    [feedback, setFeedback] = useState(""),
    [thinking, setThinking] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [paused, setPaused] = useState(
      game.opponent === "remote" &&
        game.nodes[game.current].position.moveNumber > 0,
    ),
    [liberties, setLiberties] = useState(
      game.mode !== "challenge" && game.difficulty === "guided",
    ),
    [hint, setHint] = useState<Point | null>(null),
    [dead, setDead] = useState<number[]>([]),
    [confirmResult, setConfirmResult] = useState(false),
    [confirmResign, setConfirmResign] = useState(false),
    [review, setReview] = useState(initialReview),
    [reviewId, setReviewId] = useState(game.current),
    [trial, setTrial] = useState(false),
    [returnNode, setReturnNode] = useState(game.current),
    [autoplay, setAutoplay] = useState(false),
    [requestStatus, setRequestStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  const coachController = useRef<AbortController | null>(null);
  const hintController = useRef<AbortController | null>(null);
  useEffect(() => () => hintController.current?.abort(), [game.current]);
  const [question, setQuestion] = useState("");
  const [advice, setAdvice] = useState("");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    coachController.current?.abort();
    setAsking(false);
    setAdvice("");
    return () => coachController.current?.abort();
  }, [game.current, profile]);
  const requestAdvice = async () => {
    if (!question.trim()) return;
    const request = new AbortController(),
      snapshot = game.current;
    coachController.current = request;
    setAsking(true);
    setAdvice("");
    try {
      const result = await askAdvice(
        profile,
        latest.current.nodes[snapshot].position,
        question,
        request.signal,
      );
      if (!request.signal.aborted && latest.current.current === snapshot)
        setAdvice(result.slice(0, 1800));
    } catch {
      if (!request.signal.aborted)
        setAdvice("暂时无法获得 AI 讲解，请检查设置中的连接测试。棋局已保留。");
    } finally {
      if (!request.signal.aborted) setAsking(false);
    }
  };
  const node =
      game.nodes[review ? reviewId : game.current] || game.nodes[game.current],
    position = node.position;
  const isSettlement = !review && position.passes >= 2 && !game.result;
  const score = areaScore(position, dead);
  useEffect(() => {
    setPending(null);
    setHint(null);
    setDead([]);
    setConfirmResult(false);
  }, [game.current]);
  useEffect(() => {
    if (
      review ||
      paused ||
      readOnly ||
      game.result ||
      isSettlement ||
      position.toPlay === game.human
    )
      return;
    const capturedNode = game.current,
      capturedGame = game.id;
    const abort = new AbortController();
    controller.current = abort;
    const start = performance.now();
    setThinking(true);
    setElapsed(0);
    setRequestStatus("正在观察局面…");
    const clock = setInterval(
      () => setElapsed(Math.floor((performance.now() - start) / 1000)),
      1000,
    );
    void (async () => {
      try {
        const candidates = await analyze(
          position,
          game.difficulty as Difficulty,
          abort.signal,
        );
        if (abort.signal.aborted || !candidates.length) return;
        let candidate = candidates[0],
          source = "本地练习对手";
        if (game.opponent === "remote") {
          setRequestStatus("等待你的 AI 服务回复…");
          try {
            const result = await remoteMove(
              profile,
              position,
              candidates,
              game.id,
              game.difficulty,
              abort.signal,
            );
            candidate = result.candidate;
            source = `个人 AI · ${profile.model}`;
            setFeedback(
              `AI 本轮请求 ${result.calls} 次，用时 ${((performance.now() - start) / 1000).toFixed(1)} 秒 · ${result.usageTokens === undefined ? "token 用量未知" : `${result.usageTokens} tokens`}。`,
            );
          } catch {
            if (abort.signal.aborted) return;
            source = "本地接手";
            setFeedback(
              "AI 请求失败或回复未通过校验，本手由本地对手完成。可在设置中测试连接。",
            );
          }
        }
        if (
          abort.signal.aborted ||
          latest.current.current !== capturedNode ||
          latest.current.id !== capturedGame
        )
          return;
        const result = play(
          latest.current.nodes[capturedNode].position,
          candidate.action,
        );
        if (result.ok) {
          update(
            appendMove(
              latest.current,
              candidate.action,
              result.position,
              source,
              candidate.explanation,
            ),
          );
          stoneSound(preferences.sound);
        }
      } catch {
        if (!abort.signal.aborted) {
          setFeedback("本地分析暂时失败，棋局已保留，请点击继续重试。");
          setPaused(true);
        }
      } finally {
        if (!abort.signal.aborted) {
          setThinking(false);
          setRequestStatus("");
        }
      }
    })();
    return () => {
      abort.abort();
      clearInterval(clock);
      setThinking(false);
    };
    // A request belongs to exactly one immutable game node and profile revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    game.current,
    game.id,
    game.difficulty,
    game.opponent,
    game.human,
    game.result,
    paused,
    review,
    readOnly,
    profile,
  ]);
  useEffect(() => {
    if (!autoplay || !review) return;
    const next = node.children[0];
    if (!next) {
      setAutoplay(false);
      return;
    }
    const timer = setTimeout(() => setReviewId(next), 900);
    return () => clearTimeout(timer);
  }, [autoplay, review, node]);
  const submit = (action: Action) => {
    if (
      readOnly ||
      (game.result && !trial) ||
      thinking ||
      (paused && !trial) ||
      isSettlement ||
      (review && !trial)
    )
      return;
    if (!trial && position.toPlay !== game.human) return;
    const result = play(position, action);
    if (!result.ok) {
      setFeedback(result.reason);
      return;
    }
    const base = review ? { ...game, current: reviewId } : game;
    const next = appendMove(
      base,
      action,
      result.position,
      trial ? "复盘试下" : "用户",
    );
    update(review ? { ...next, current: game.current } : next);
    if (review) setReviewId(next.current);
    setFeedback(
      action.type === "pass"
        ? "你选择停一手。"
        : result.captured.length
          ? `提掉 ${result.captured.length} 颗棋子。`
          : "",
    );
    setPending(null);
    setHint(null);
    stoneSound(preferences.sound);
  };
  const choose = (p: Point) => {
    setSelected(p);
    if (isSettlement) {
      if (!position.board[index(p, position.size)]) return;
      const group = [
        ...groupAt(position.board, index(p, position.size), position.size)
          .stones,
      ];
      setDead(
        dead.includes(group[0])
          ? dead.filter((i) => !group.includes(i))
          : [...new Set([...dead, ...group])],
      );
      setConfirmResult(false);
      return;
    }
    if (
      position.board[index(p, position.size)] ||
      readOnly ||
      (review && !trial)
    )
      return;
    if (preferences.confirm) {
      const result = play(position, { type: "play", ...p });
      if (!result.ok) setFeedback(result.reason);
      else {
        setPending(p);
        setFeedback(`选中 ${coord(p, position.size)}，点击“落子”确认。`);
      }
    } else submit({ type: "play", ...p });
  };
  const undo = () => {
    if (readOnly) return;
    controller.current?.abort();
    setThinking(false);
    let target = game.nodes[game.current];
    if (target.parent) target = game.nodes[target.parent];
    if (target.position.toPlay !== game.human && target.parent)
      target = game.nodes[target.parent];
    update({ ...game, current: target.id, assisted: true, result: undefined });
    setPaused(false);
    setFeedback("已恢复到上一轮用户落子之前，历史与轮次一同恢复。");
  };
  const requestHint = async () => {
    hintController.current?.abort();
    const abort = new AbortController();
    hintController.current = abort;
    try {
      const candidates = await analyze(position, "challenge", abort.signal);
      if (abort.signal.aborted || latest.current.current !== game.current)
        return;
      const action = candidates[0]?.action;
      if (action?.type === "play") setHint(action);
      update({ ...latest.current, assisted: true });
      setFeedback(
        candidates[0]?.explanation || "可以考虑停一手，之后确认终局。",
      );
    } catch {
      if (!abort.signal.aborted) setFeedback("提示分析失败，请重新尝试。");
    }
  };
  const enterReview = () => {
    controller.current?.abort();
    setThinking(false);
    setReviewId(game.current);
    setReturnNode(game.current);
    setReview(true);
    setPaused(true);
  };
  const rootPath = pathTo(game, returnNode);
  const reviewPath = pathTo(game, reviewId);
  const lastExplanation = [...pathTo(game)]
    .reverse()
    .find((n) => n.explanation)?.explanation;
  const settledText =
    score.winner === 0
      ? "和棋"
      : `${score.winner === 1 ? "黑" : "白"}胜 ${score.margin} 目`;
  const finish = () => {
    update({
      ...game,
      result:
        score.winner === 0
          ? "0"
          : `${score.winner === 1 ? "B" : "W"}+${score.margin}`,
      title: `${position.size} 路 · ${settledText}`,
      resultSource: "user-confirmed",
      confirmedDead: dead,
    });
    setFeedback("结果已按你确认的死子列表保存。");
  };
  return (
    <div className="page-enter play-page">
      <button className="back-link" onClick={() => navigate("play")}>
        <ArrowLeft size={18} /> 对弈大厅
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {review ? "GAME REVIEW" : "ONE MOVE AT A TIME"}
          </div>
          <h1>{review ? "换个角度，再看一遍。" : "在棋盘上，慢慢想。"}</h1>
          <p>
            {position.size} 路 ·{" "}
            {game.opponent === "remote"
              ? `个人 AI · ${profile.model || "未配置"}`
              : "本地练习对手"}{" "}
            · {difficultyLabels[game.difficulty as Difficulty]} · 白贴{" "}
            {position.komi}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            downloadFile(`弈间-${game.id.slice(0, 8)}.sgf`, toSGF(game))
          }
        >
          <DownloadSimple size={18} /> 导出棋谱
        </button>
      </div>
      {readOnly && (
        <div className="notice">
          此局正在另一个标签中使用，当前为只读。可在对弈大厅新建独立棋局。
        </div>
      )}
      <div className="workbench">
        <Board
          position={position}
          coachNote={node.explanation}
          preferences={preferences}
          selected={selected}
          hint={hint || pending}
          showLiberties={liberties}
          onSelect={choose}
          onConfirm={(p) => {
            setSelected(p);
            submit({ type: "play", ...p });
          }}
          dead={isSettlement ? dead : []}
          ownership={isSettlement ? score.ownership : undefined}
        />
        <aside className="lesson-panel game-panel">
          <div className="players">
            <div>
              <StoneDot color={game.human} />
              <span>
                你<small>{game.human === 1 ? "执黑" : "执白"}</small>
              </span>
              {!review &&
                !thinking &&
                position.toPlay === game.human &&
                !game.result && <i className="live-dot" />}
            </div>
            <div>
              <StoneDot color={other(game.human)} />
              <span>
                {game.opponent === "remote" ? "我的 AI" : "练习对手"}
                <small>{difficultyLabels[game.difficulty as Difficulty]}</small>
              </span>
              {thinking && <SpinnerGap className="spin" size={18} />}
            </div>
          </div>
          <div className="game-stats">
            <div>
              <span>当前手数</span>
              <strong>{position.moveNumber}</strong>
            </div>
            <div>
              <span>黑方提子</span>
              <strong>{position.captures[0]}</strong>
            </div>
            <div>
              <span>白方提子</span>
              <strong>{position.captures[1]}</strong>
            </div>
          </div>
          {review ? (
            <>
              <div className="eyebrow">{trial ? "变化分支" : "复盘主线"}</div>
              <h2>第 {position.moveNumber} 手</h2>
              <p>
                {node.explanation ||
                  (position.last
                    ? `${coord(position.last, position.size)} · ${node.source || "实际着手"}`
                    : "从棋盘开始，回顾每一手的选择。")}
              </p>
              <div className="playback">
                <button
                  aria-label="复盘起点"
                  onClick={() => {
                    setReviewId(game.root);
                    setAutoplay(false);
                  }}
                >
                  <SkipBack size={19} />
                </button>
                <button
                  aria-label="复盘上一手"
                  disabled={!node.parent}
                  onClick={() => {
                    setReviewId(node.parent!);
                    setAutoplay(false);
                  }}
                >
                  <ArrowLeft size={19} />
                </button>
                <button
                  className="play-button"
                  aria-label={autoplay ? "暂停复盘" : "播放复盘"}
                  onClick={() => setAutoplay(!autoplay)}
                >
                  {autoplay ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button
                  aria-label="复盘下一手"
                  disabled={!node.children.length}
                  onClick={() => {
                    setReviewId(node.children[0]);
                    setAutoplay(false);
                  }}
                >
                  <ArrowRight size={19} />
                </button>
                <button
                  aria-label="复盘末手"
                  onClick={() => {
                    setReviewId(returnNode);
                    setAutoplay(false);
                  }}
                >
                  <SkipForward size={19} />
                </button>
              </div>
              <input
                type="range"
                aria-label="复盘手数"
                min="0"
                max={rootPath.length - 1}
                value={Math.min(rootPath.length - 1, reviewPath.length - 1)}
                onChange={(e) => {
                  setReviewId(rootPath[Number(e.target.value)].id);
                  setAutoplay(false);
                }}
              />
              {trial && pending && (
                <button
                  className="button primary full"
                  disabled={readOnly}
                  onClick={() => submit({ type: "play", ...pending })}
                >
                  落子 · {coord(pending, position.size)}{" "}
                  <ArrowRight size={18} />
                </button>
              )}
              {node.children.length > 1 && (
                <div className="branch-list">
                  <span>选择分支</span>
                  {node.children.map((id, i) => (
                    <button key={id} onClick={() => setReviewId(id)}>
                      {i === 0 ? "原主线" : `变化 ${i}`} ·{" "}
                      {game.nodes[id].action
                        ? actionId(game.nodes[id].action!)
                        : ""}
                    </button>
                  ))}
                </div>
              )}
              <button
                className="button secondary full"
                disabled={readOnly || position.passes >= 2}
                onClick={() => {
                  if (trial) {
                    setReviewId(returnNode);
                  }
                  setTrial(!trial);
                  if (!trial && game.mode === "challenge" && !game.result)
                    update({ ...game, assisted: true });
                  setAutoplay(false);
                }}
              >
                <TreeStructure size={18} />
                {trial ? "退出试下，回到原棋谱" : "从这里试下一个变化"}
              </button>
              <button
                className="button primary full"
                onClick={() => {
                  setReview(false);
                  setTrial(false);
                  setAutoplay(false);
                  setPaused(true);
                }}
              >
                返回对局 <ArrowRight size={18} />
              </button>
            </>
          ) : isSettlement ? (
            <>
              <span className="eyebrow">终局确认</span>
              <h2>先确认，再数目。</h2>
              <p>
                点击棋块标记或取消整块死子。未明确的死活，请继续下棋解决。此结果按你的确认计算。
              </p>
              <div className="score-table">
                <div>
                  <StoneDot color={1} />
                  <span>黑方</span>
                  <strong>{score.black}</strong>
                </div>
                <small>
                  {score.blackStones} 子 + {score.blackTerritory} 空点
                </small>
                <div>
                  <StoneDot color={2} />
                  <span>白方</span>
                  <strong>{score.white}</strong>
                </div>
                <small>
                  {score.whiteStones} 子 + {score.whiteTerritory} 空点 +{" "}
                  {position.komi} 贴目
                </small>
                <p>
                  中立点 {score.neutral} · 已标记死子 {dead.length}
                </p>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={confirmResult}
                  onChange={(e) => setConfirmResult(e.target.checked)}
                />{" "}
                我已确认死子与边界，接受此结果
              </label>
              <button
                className="button primary full"
                disabled={!confirmResult || readOnly}
                onClick={finish}
              >
                <CheckCircle size={19} />
                确认 · {settledText}
              </button>
              <button
                className="button secondary full"
                disabled={readOnly}
                onClick={() => {
                  update({
                    ...game,
                    nodes: {
                      ...game.nodes,
                      [game.current]: {
                        ...game.nodes[game.current],
                        position: resumePosition(position),
                      },
                    },
                  });
                  setDead([]);
                  setPaused(false);
                }}
              >
                有争议，继续下棋
              </button>
            </>
          ) : game.result ? (
            <>
              <span className="eyebrow">对局已保存</span>
              <h2>
                {game.result === "0"
                  ? "和棋"
                  : `${game.result.startsWith("B") ? "黑棋" : "白棋"}获胜`}
              </h2>
              <p>
                {game.result.includes("R")
                  ? "以认输结束。棋谱完整保留。"
                  : "面积结果来自用户确认的死子与边界。"}
              </p>
              <div className="takeaway">
                复盘时先找一手漏看的气、一个需要补的断点，或一块需要照顾的弱棋。
              </div>
              <button className="button primary full" onClick={enterReview}>
                打开复盘 <ArrowRight size={18} />
              </button>
              <button
                className="button secondary full"
                onClick={() => navigate("play")}
              >
                再下一局
              </button>
            </>
          ) : (
            <>
              <div
                className={`turn-status ${thinking ? "thinking" : ""}`}
                role="status"
              >
                {thinking ? (
                  <>
                    <SpinnerGap className="spin" size={23} />
                    <div>
                      <strong>{requestStatus}</strong>
                      <span>已等待 {elapsed} 秒</span>
                    </div>
                  </>
                ) : paused ? (
                  <>
                    <Pause size={23} />
                    <div>
                      <strong>棋局已暂停</strong>
                      <span>你的棋局保留在本机</span>
                    </div>
                  </>
                ) : (
                  <>
                    <StoneDot color={position.toPlay} />
                    <div>
                      <strong>
                        {position.toPlay === game.human
                          ? "轮到你了"
                          : "对手回合"}
                      </strong>
                      <span>
                        {game.assisted ? "辅助练习对局" : "独立选择每一手"}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {paused ? (
                <button
                  className="button primary full"
                  disabled={readOnly}
                  onClick={() => setPaused(false)}
                >
                  <Play size={18} />
                  继续对局
                  {game.opponent === "remote" && position.toPlay !== game.human
                    ? "并请求 AI"
                    : ""}
                </button>
              ) : thinking ? (
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => {
                      controller.current?.abort();
                      setPaused(true);
                      setThinking(false);
                    }}
                  >
                    <Stop size={18} />
                    取消并暂停
                  </button>
                  {game.mode !== "challenge" && (
                    <button
                      className="button secondary"
                      disabled={readOnly || !position.moveNumber}
                      onClick={undo}
                    >
                      <ArrowCounterClockwise size={18} />
                      撤回上一手
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {preferences.confirm && pending && (
                    <button
                      className="button primary full"
                      disabled={readOnly}
                      onClick={() => submit({ type: "play", ...pending })}
                    >
                      落子 · {coord(pending, position.size)}{" "}
                      <ArrowRight size={18} />
                    </button>
                  )}
                  <div className="button-row">
                    <button
                      className="button secondary"
                      disabled={readOnly || position.toPlay !== game.human}
                      onClick={() => submit({ type: "pass" })}
                    >
                      停一手
                    </button>
                    {game.mode !== "challenge" && (
                      <button
                        className="button secondary"
                        disabled={readOnly || position.moveNumber === 0}
                        onClick={undo}
                      >
                        <ArrowCounterClockwise size={18} />
                        悔棋
                      </button>
                    )}
                  </div>
                  {game.mode !== "challenge" && (
                    <button
                      className="button secondary full"
                      disabled={readOnly || position.toPlay !== game.human}
                      onClick={() => void requestHint()}
                    >
                      <Lightbulb size={19} /> 给我一个思路
                    </button>
                  )}
                </>
              )}
              <label className="toggle-row">
                <span>显示选中棋块的气</span>
                <input
                  type="checkbox"
                  checked={liberties}
                  disabled={game.mode === "challenge"}
                  onChange={(e) => setLiberties(e.target.checked)}
                />
              </label>
              {game.mode !== "challenge" && lastExplanation && (
                <div className="coach-note">
                  <span className="eyebrow">棋盘观察 · 本地可验证事实</span>
                  <p>{lastExplanation}</p>
                </div>
              )}
              {profile.baseURL &&
                profile.model &&
                game.mode !== "challenge" && (
                  <form
                    className="coach-question"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void requestAdvice();
                    }}
                  >
                    <label className="field">
                      问问我的 AI
                      <textarea
                        aria-label="对当前局面提问"
                        maxLength={300}
                        placeholder="例如：我应该先照顾哪块棋？"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                      />
                    </label>
                    <button
                      className="button secondary full"
                      type="submit"
                      disabled={asking || !question.trim()}
                    >
                      {asking ? (
                        <SpinnerGap className="spin" size={17} />
                      ) : (
                        <Lightbulb size={17} />
                      )}{" "}
                      {asking ? "正在询问…" : "发送局面问题"}
                    </button>
                    {advice && (
                      <div className="tip">
                        <span className="eyebrow">
                          AI 建议 · 未由专业引擎验证
                        </span>
                        <p className="advice-text">{advice}</p>
                      </div>
                    )}
                  </form>
                )}
              <div className="game-bottom">
                <button className="text-button" onClick={enterReview}>
                  <TreeStructure size={18} />
                  复盘当前棋局
                </button>
                <button
                  className="text-button muted"
                  disabled={readOnly}
                  onClick={() => setConfirmResign(true)}
                >
                  <Flag size={18} />
                  认输
                </button>
              </div>
            </>
          )}
          {feedback && (
            <p className="inline-feedback" role="status">
              {feedback}
            </p>
          )}
          {selected &&
            (game.mode !== "challenge" || review) &&
            position.board[index(selected, position.size)] !== 0 && (
              <p className="selection-info">
                {coord(selected, position.size)} ·{" "}
                {position.board[index(selected, position.size)] === 1
                  ? "黑"
                  : "白"}
                棋 ·{" "}
                {
                  groupAt(
                    position.board,
                    index(selected, position.size),
                    position.size,
                  ).liberties.size
                }{" "}
                口气
              </p>
            )}
        </aside>
      </div>
      {confirmResign && (
        <div className="modal-scrim">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resign-title"
          >
            <Flag size={32} />
            <h2 id="resign-title">结束这一局？</h2>
            <p>认输后棋谱会保留，你仍可以复盘每一手。</p>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => setConfirmResign(false)}
              >
                继续思考
              </button>
              <button
                className="button primary"
                onClick={() => {
                  controller.current?.abort();
                  update({
                    ...game,
                    result: `${other(game.human) === 1 ? "B" : "W"}+R`,
                    resultSource: "resignation",
                  });
                  setConfirmResign(false);
                }}
              >
                <Trash size={16} />
                确认认输
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
