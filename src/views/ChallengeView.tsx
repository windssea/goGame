import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowCounterClockwise,
  CheckCircle,
  Clock,
  Lightbulb,
  Trophy,
} from "@phosphor-icons/react";
import { challengeDeck, challengeModes } from "../content/challenges";
import { Board } from "../components/Board";
import { CoachButton } from "../components/Coach";
import { coord, play } from "../domain/go";
import type { Point } from "../domain/go";
import type { Preferences, Progress } from "../storage";

export function ChallengeHub({
  navigate,
  progress,
}: {
  navigate: (r: string) => void;
  progress: Progress;
}) {
  return (
    <section className="challenge-hub">
      <div className="section-title">
        <div>
          <div className="eyebrow">PLAY / THINK / REPEAT</div>
          <h2>在小游戏里练出棋感。</h2>
        </div>
        <span className="pill">6 种挑战 · 旋转与换色</span>
      </div>
      <div className="challenge-grid">
        {challengeModes.map((m, i) => (
          <button
            className="challenge-card"
            key={m.id}
            onClick={() => navigate(`challenge/${m.id}`)}
          >
            <span className="challenge-index">0{i + 1}</span>
            <span className="pill">{m.tag}</span>
            <h3>{m.title}</h3>
            <p>{m.description}</p>
            <div>
              <span>
                {m.count} 题 / {m.seconds} 秒 · 已练{" "}
                {progress.challenges?.[m.id]?.attempts || 0} 轮
              </span>
              <strong>
                {progress.challenges?.[m.id]
                  ? `最佳 ${progress.challenges[m.id].best} 分`
                  : "开始挑战"}
                <ArrowRight size={18} />
              </strong>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
export function ChallengeView({
  id,
  preferences,
  navigate,
  complete,
  assisted,
  restart,
}: {
  id: string;
  preferences: Preferences;
  navigate: (r: string) => void;
  complete: (id: string, score: number, ranked: boolean) => void;
  assisted: boolean;
  restart: () => void;
}) {
  const mode = challengeModes.find((m) => m.id === id) || challengeModes[0];
  const [deck, setDeck] = useState(() => challengeDeck(id)),
    [round, setRound] = useState(0),
    [position, setPosition] = useState(deck[0].position),
    [step, setStep] = useState(0);
  const [started, setStarted] = useState(false),
    [timed, setTimed] = useState(true),
    [remaining, setRemaining] = useState<number>(mode.seconds),
    [finished, setFinished] = useState(false);
  const [solved, setSolved] = useState(false),
    [mistakes, setMistakes] = useState(0),
    [hints, setHints] = useState(0),
    [taskHints, setTaskHints] = useState(0),
    [hint, setHint] = useState(false),
    [score, setScore] = useState(0),
    [feedback, setFeedback] = useState("");
  const end = useRef(0),
    recorded = useRef(false),
    task = deck[round];
  const endRound = (finalScore = score) => {
    setFinished(true);
    setStarted(false);
    if (!recorded.current) {
      recorded.current = true;
      complete(
        id,
        Math.round(finalScore / deck.length),
        !hints && !assisted && timed,
      );
    }
  };
  useEffect(() => {
    if (!started || !timed || finished) return;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setRemaining(seconds);
    }, 250);
    return () => clearInterval(timer);
  }, [started, timed, finished]);
  useEffect(() => {
    if (started && timed && remaining === 0 && !finished) endRound();
  }, [remaining, started, timed, finished]);
  const start = () => {
    end.current = Date.now() + mode.seconds * 1000;
    setStarted(true);
  };
  const select = (p: Point) => {
    if (!started || finished || solved) return;
    const expected = task.sequence?.[step];
    const targets = expected?.type === "play" ? [expected] : task.targets;
    if (!targets.some((t) => t.row === p.row && t.col === p.col)) {
      setMistakes((n) => n + 1);
      setFeedback(
        `${coord(p, position.size)} 不在本题预设范式中。再看气与连接；可以回课程比较其他下法。`,
      );
      return;
    }
    let next = position,
      nextStep = step + 1;
    if (!task.selectOnly) {
      const result = play(position, { type: "play", ...p });
      if (!result.ok) {
        setFeedback(result.reason);
        return;
      }
      next = result.position;
      if (task.sequence && nextStep < task.sequence.length) {
        const reply = play(next, task.sequence[nextStep]);
        if (!reply.ok) {
          setFeedback(reply.reason);
          return;
        }
        next = reply.position;
        nextStep++;
      }
      setPosition(next);
    }
    setStep(nextStep);
    setHint(false);
    if (!task.sequence || nextStep >= task.sequence.length) {
      setSolved(true);
      setScore((n) => n + Math.max(20, 100 - mistakes * 15 - taskHints * 20));
      setFeedback(task.explanation);
    } else setFeedback("应手已走出，继续计算下一步。");
  };
  const reset = () => {
    restart();
    const d = challengeDeck(id);
    setDeck(d);
    setRound(0);
    setPosition(d[0].position);
    setStep(0);
    setStarted(false);
    setRemaining(mode.seconds);
    setFinished(false);
    setSolved(false);
    setMistakes(0);
    setHints(0);
    setTaskHints(0);
    setHint(false);
    setScore(0);
    setFeedback("");
    recorded.current = false;
  };
  const expected = task.sequence?.[step],
    target = expected?.type === "play" ? expected : task.targets[0];
  return (
    <div className="page-enter">
      <button className="back-link" onClick={() => navigate("practice")}>
        <ArrowLeft size={18} />
        返回练习与挑战
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CHALLENGE LAB</div>
          <h1>{mode.title}</h1>
          <p>{mode.description}</p>
        </div>
        <span className={`pill ${remaining < 20 ? "urgent" : ""}`}>
          <Clock size={17} />
          {timed ? `${remaining} 秒` : "自由练习"}
        </span>
      </div>
      {finished ? (
        <div className="challenge-result">
          <Trophy size={48} />
          <h2>
            {round === deck.length - 1 && solved
              ? "这一轮完成了。"
              : "时间到，来复盘。"}
          </h2>
          <strong>
            {Math.round(score / deck.length)}
            <small> / 100</small>
          </strong>
          <p>
            {hints || assisted || !timed
              ? "本轮使用辅助或自由模式，已保存练习次数，最佳挑战成绩保持不变。"
              : "本轮成绩已保存。重开会变换方向与执子。"}
          </p>
          <div className="button-row">
            <button className="button primary" onClick={reset}>
              <ArrowCounterClockwise size={18} />
              再挑战一次
            </button>
            <button
              className="button secondary"
              onClick={() => navigate(`lesson/${task.lessonId}`)}
            >
              回到对应课程
            </button>
            <CoachButton
              question={`刚才练习了${mode.title}。请讲解容易出错的地方，再给我一组思考练习。`}
            />
          </div>
        </div>
      ) : (
        <div className="workbench">
          <Board
            position={position}
            preferences={preferences}
            onSelect={select}
            hint={hint ? target : null}
          />
          <aside className="lesson-panel">
            <div className="eyebrow">
              第 {round + 1} / {deck.length} 题 ·{" "}
              {position.toPlay === 1 ? "黑" : "白"}先行
            </div>
            <h2>{task.title}</h2>
            <p>{task.instruction}</p>
            {!started && (
              <>
                <label className="toggle-row">
                  <span>限时挑战</span>
                  <input
                    type="checkbox"
                    checked={timed}
                    onChange={(e) => setTimed(e.target.checked)}
                  />
                </label>
                <button className="button primary full" onClick={start}>
                  开始这一轮 <ArrowRight size={18} />
                </button>
              </>
            )}
            {started && (
              <>
                <div className="challenge-stats">
                  <span>当前误答 {mistakes}</span>
                  <span>
                    辅助 {hints}
                    {assisted ? " · 已询问教练" : ""}
                  </span>
                  <span>已得 {score} 分</span>
                </div>
                {feedback && (
                  <div className={`notice ${solved ? "solved" : ""}`}>
                    {solved && <CheckCircle size={20} />}
                    <span>{feedback}</span>
                  </div>
                )}
                {!solved && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setHint(true);
                      setHints((n) => n + 1);
                      setTaskHints((n) => n + 1);
                      setFeedback(
                        `目标提示：${coord(target, position.size)}。本轮转为辅助练习。`,
                      );
                    }}
                  >
                    <Lightbulb size={18} />
                    看目标提示（转为练习）
                  </button>
                )}
                {solved && (
                  <button
                    className="button primary full"
                    onClick={() => {
                      if (round === deck.length - 1) {
                        endRound();
                        return;
                      }
                      const n = round + 1;
                      setRound(n);
                      setTaskHints(0);
                      setPosition(deck[n].position);
                      setStep(0);
                      setSolved(false);
                      setFeedback("");
                      setMistakes(0);
                      setHint(false);
                    }}
                  >
                    {" "}
                    {round === deck.length - 1 ? "完成挑战" : "下一题"}{" "}
                    <ArrowRight size={18} />
                  </button>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
