import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowCounterClockwise,
  CheckCircle,
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from "@phosphor-icons/react";
import { Board, MiniBoard } from "../components/Board";
import { openings, openingPositions } from "../content/openings";
import type { Opening } from "../content/openings";
import { coord, fromCoord } from "../domain/go";
import type { Point } from "../domain/go";
import type { Preferences } from "../storage";
import { CoachButton } from "../components/Coach";
export function OpeningsPage({
  navigate,
  learned,
}: {
  navigate: (route: string) => void;
  learned: string[];
}) {
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPENING LIBRARY</div>
          <h1>好的开局，从理解开始。</h1>
          <p>认识六种经典构架。看清每一手的目的，再在棋盘上亲手下出来。</p>
        </div>
        <span className="pill">19 路标准棋盘</span>
      </div>
      <div className="notice">
        <strong>理解范式，不机械背谱。</strong>
        <span>
          演示包含示意应手，后续应随对手的落子调整。布局潜力还不是确定地盘。
        </span>
      </div>
      <div className="opening-grid">
        {openings.map((opening, i) => (
          <button
            className="opening-card"
            key={opening.id}
            onClick={() => navigate(`opening/${opening.id}`)}
          >
            <div className="opening-preview">
              <MiniBoard
                position={openingPositions(opening).at(-1)!}
                size={200}
              />
              <span className="opening-number">0{i + 1}</span>
              {learned.includes(opening.id) && (
                <span className="learned-mark">
                  <CheckCircle size={22} weight="fill" />
                </span>
              )}
            </div>
            <div className="opening-description">
              <span className="eyebrow">{opening.english}</span>
              <div className="title-row">
                <h2>{opening.name}</h2>
                <ArrowRight size={22} />
              </div>
              <p>{opening.description}</p>
              <span className="pill">{opening.tag}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
export function OpeningView({
  opening,
  preferences,
  navigate,
  complete,
}: {
  opening: Opening;
  preferences: Preferences;
  navigate: (r: string) => void;
  complete: () => void;
}) {
  const positions = openingPositions(opening);
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [practice, setPractice] = useState(false),
    [feedback, setFeedback] = useState(""),
    [hint, setHint] = useState(false);
  useEffect(() => {
    if (!playing || practice) return;
    if (step >= opening.moves.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep(step + 1), 1400);
    return () => clearTimeout(timer);
  }, [playing, step, practice, opening.moves.length]);
  const select = (p: Point) => {
    if (!practice || step >= opening.moves.length) return;
    const next = fromCoord(opening.moves[step]);
    if (p.row !== next.row || p.col !== next.col) {
      setFeedback(
        `这次跟练的是示意顺序。下一手看看 ${hint ? opening.moves[step] : "提示中的方向"}，其他点不一定是坏棋。`,
      );
      return;
    }
    setStep(step + 1);
    setHint(false);
    setFeedback("");
    if (step + 1 === opening.moves.length) {
      complete();
      setFeedback("跟练完成！记住构架的目的，而不是要求对手配合这个顺序。");
    }
  };
  return (
    <div className="page-enter">
      <CoachButton
        question={`请结合${opening.name}的棋谱注解，解释当前这一步和后续方向。`}
      />
      <button className="back-link" onClick={() => navigate("openings")}>
        <ArrowLeft size={18} /> 返回经典开局
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{opening.english}</div>
          <h1>{opening.name}</h1>
          <p>{opening.description}</p>
        </div>
        <span className="pill">{opening.tag}</span>
      </div>
      <div className="workbench">
        <Board
          position={positions[step]}
          preferences={preferences}
          onSelect={select}
          hint={
            hint && step < opening.moves.length
              ? fromCoord(opening.moves[step])
              : null
          }
        />
        <aside className="lesson-panel">
          <div className="eyebrow">
            {practice ? "跟着下出来" : "逐手看目的"}
            <span>
              {step} / {opening.moves.length} 手
            </span>
          </div>
          <h2>
            {step === 0
              ? "先从空棋盘观察。"
              : `第 ${step} 手 · ${opening.moves[step - 1]}`}
          </h2>
          <p className="opening-note">
            {step === 0 ? opening.lesson : opening.notes[step - 1]}
          </p>
          <div className="move-timeline">
            {opening.moves.map((move, i) => (
              <button
                className={i < step ? "played" : ""}
                disabled={practice}
                key={`${move}-${i}`}
                onClick={() => {
                  setPlaying(false);
                  setStep(i + 1);
                }}
              >
                <span className={`stone-dot color-${(i % 2) + 1}`} />
                {i + 1}
                <small>{move}</small>
              </button>
            ))}
          </div>
          {practice ? (
            <>
              <div className="tip">
                {step < opening.moves.length
                  ? `下一手是${step % 2 === 0 ? "黑" : "白"}棋。${hint ? `在 ${coord(fromCoord(opening.moves[step]), 19)} 落子。` : "点击棋盘完成示意顺序，可随时查看提示。"}`
                  : "全部示意着手已完成。"}
              </div>
              {feedback && (
                <div className="feedback success" role="status">
                  {feedback}
                </div>
              )}
              <button
                className="button secondary full"
                disabled={step >= opening.moves.length}
                onClick={() => setHint(true)}
              >
                显示下一手
              </button>
            </>
          ) : (
            <>
              <div className="playback">
                <button
                  aria-label="第一手之前"
                  onClick={() => {
                    setPlaying(false);
                    setStep(0);
                  }}
                >
                  <SkipBack size={20} />
                </button>
                <button
                  aria-label="上一步"
                  disabled={!step}
                  onClick={() => {
                    setPlaying(false);
                    setStep(step - 1);
                  }}
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  aria-label={playing ? "暂停演示" : "播放演示"}
                  className="play-button"
                  onClick={() => {
                    if (step === opening.moves.length) setStep(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? (
                    <Pause weight="fill" size={22} />
                  ) : (
                    <Play weight="fill" size={22} />
                  )}
                </button>
                <button
                  aria-label="下一步"
                  disabled={step >= opening.moves.length}
                  onClick={() => {
                    setPlaying(false);
                    setStep(step + 1);
                  }}
                >
                  <ArrowRight size={20} />
                </button>
                <button
                  aria-label="最后一步"
                  onClick={() => {
                    setPlaying(false);
                    setStep(opening.moves.length);
                  }}
                >
                  <SkipForward size={20} />
                </button>
              </div>
              <input
                aria-label="开局手数"
                type="range"
                min="0"
                max={opening.moves.length}
                value={step}
                onChange={(e) => {
                  setPlaying(false);
                  setStep(Number(e.target.value));
                }}
              />
            </>
          )}
          <div className="takeaway">
            <strong>记住这个思路</strong>
            <p>{opening.lesson}</p>
          </div>
          <div className="caution">
            <strong>也要留意</strong>
            <p>{opening.caution}</p>
          </div>
          <button
            className="button primary full"
            onClick={() => {
              setPractice(!practice);
              setPlaying(false);
              setStep(0);
              setFeedback("");
              setHint(false);
            }}
          >
            {practice ? (
              <ArrowCounterClockwise size={18} />
            ) : (
              <Play size={18} />
            )}{" "}
            {practice ? "返回观察演示" : "我来跟练一遍"}
          </button>
          <a
            className="source-link"
            href={opening.source}
            target="_blank"
            rel="noreferrer"
          >
            布局概念参考 · 日本棋院
          </a>
        </aside>
      </div>
    </div>
  );
}
