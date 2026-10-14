import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Lightbulb,
  Play,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { Board } from "../components/Board";
import { Quiz } from "../components/Quiz";
import { coord, play } from "../domain/go";
import type { Point } from "../domain/go";
import { lessons, stages } from "../content/courses";
import type { Lesson, Question } from "../content/courses";
import type { Preferences } from "../storage";
import { CoachButton } from "../components/Coach";

export function LessonView({
  lesson,
  preferences,
  back,
  complete,
  onAttempt,
  navigate,
}: {
  lesson: Lesson;
  preferences: Preferences;
  back: () => void;
  complete: (score: number, hints: number) => void;
  onAttempt: (q: Question, correct: boolean, hinted: boolean) => void;
  navigate: (route: string) => void;
}) {
  const [step, setStep] = useState(0),
    [position, setPosition] = useState(lesson.position),
    [demoIndex, setDemoIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [selected, setSelected] = useState<Point | null>(null),
    [feedback, setFeedback] = useState(""),
    [done, setDone] = useState(false),
    [hintLevel, setHintLevel] = useState(0),
    [hintUsed, setHintUsed] = useState(false),
    [quizResult, setQuizResult] = useState<{
      score: number;
      hints: number;
    } | null>(null);
  const [variantIndex, setVariantIndex] = useState<number | null>(null);
  const [taskIndex, setTaskIndex] = useState(0);
  const variant =
    variantIndex === null ? null : lesson.variants?.[variantIndex];
  const demonstration = variant?.demo || lesson.demo;
  const demonstrationStart = variant?.position || lesson.position;
  const expectedAction = lesson.task.sequence?.[taskIndex];
  const taskTargets =
    expectedAction?.type === "play" ? [expectedAction] : lesson.task.accepted;
  const seekDemo = (count: number) => {
    let next = demonstrationStart;
    for (const action of demonstration.slice(0, count)) {
      const result = play(next, action);
      if (!result.ok) break;
      next = result.position;
    }
    setPosition(next);
    setDemoIndex(count);
    setPlaying(false);
    setSelected(null);
  };
  useEffect(() => {
    if (!playing || step !== 0) return;
    if (demoIndex >= demonstration.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => {
        const result = play(position, demonstration[demoIndex]);
        if (result.ok) setPosition(result.position);
        setDemoIndex(demoIndex + 1);
      },
      preferences.reducedMotion ? 50 : 1100,
    );
    return () => clearTimeout(timer);
  }, [
    playing,
    demoIndex,
    position,
    demonstration,
    step,
    preferences.reducedMotion,
  ]);
  const reset = () => {
    setPosition(lesson.position);
    setDemoIndex(0);
    setPlaying(false);
    setSelected(null);
    setDone(false);
    setFeedback("");
    setTaskIndex(0);
    setHintLevel(0);
    setVariantIndex(null);
  };
  const select = (p: Point) => {
    setSelected(p);
    if (step !== 1 || done) return;
    if (!taskTargets.some((v) => v.row === p.row && v.col === p.col)) {
      const result = lesson.task.selectOnly
        ? null
        : play(position, { type: "play", ...p });
      setFeedback(
        result && !result.ok
          ? result.reason
          : `你选了 ${coord(p, position.size)}。再看一下任务目标，以及相关棋块的气与连接。`,
      );
      return;
    }
    if (!lesson.task.selectOnly) {
      const result = play(position, { type: "play", ...p });
      if (!result.ok) {
        setFeedback(result.reason);
        return;
      }
      let nextPosition = result.position;
      if (lesson.task.sequence) {
        let nextIndex = taskIndex + 1;
        if (nextIndex < lesson.task.sequence.length) {
          const response = play(nextPosition, lesson.task.sequence[nextIndex]);
          if (!response.ok) {
            setFeedback(response.reason);
            return;
          }
          nextPosition = response.position;
          nextIndex++;
        }
        setPosition(nextPosition);
        setTaskIndex(nextIndex);
        setHintLevel(0);
        const finished = nextIndex >= lesson.task.sequence.length;
        setDone(finished);
        setFeedback(
          finished
            ? lesson.task.success
            : "对手已按示意变化应手。继续检查气和连接，找到下一手；需要时可以查看提示。",
        );
        return;
      }
      setPosition(nextPosition);
    }
    setDone(true);
    setFeedback(lesson.task.success);
  };
  const nextLesson = lessons[lessons.findIndex((l) => l.id === lesson.id) + 1];
  return (
    <div className="lesson-view page-enter">
      <CoachButton />
      <button className="back-link" onClick={back}>
        <ArrowLeft size={18} /> 返回学习路线
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            第 {lesson.stage + 1} 阶段 · {stages[lesson.stage].short}
          </div>
          <h1>{lesson.title}</h1>
          <p>{lesson.summary}</p>
        </div>
        <span className="pill">约 {lesson.minutes} 分钟</span>
      </div>
      <div className="steps-strip">
        {["观察与理解", "在棋盘上试试", "独立练习", "课程总结"].map(
          (label, i) => (
            <div
              className={step === i ? "current" : step > i ? "finished" : ""}
              key={label}
            >
              <span>{step > i ? <Check size={15} /> : i + 1}</span>
              {label}
            </div>
          ),
        )}
      </div>
      <div className="workbench">
        <Board
          position={position}
          preferences={preferences}
          selected={selected}
          showLiberties
          hint={hintLevel >= 2 && step === 1 ? taskTargets[0] : null}
          onSelect={select}
        />
        <aside className="lesson-panel">
          {step === 0 && (
            <>
              <span className="eyebrow">先看一看</span>
              <h2>这一手，为什么？</h2>
              {lesson.paragraphs.map((p, i) => (
                <p key={p}>
                  <span className="paragraph-number">0{i + 1}</span>
                  {p}
                </p>
              ))}
              {lesson.variants && (
                <div className="variation-controls">
                  <span className="eyebrow">对比变化</span>
                  <div className="button-row">
                    <button
                      className={`button secondary ${variantIndex === null ? "active" : ""}`}
                      onClick={() => {
                        setVariantIndex(null);
                        setPosition(lesson.position);
                        setDemoIndex(0);
                        setPlaying(false);
                      }}
                    >
                      基本变化
                    </button>
                    {lesson.variants.map((v, i) => (
                      <button
                        key={v.label}
                        className="button secondary"
                        onClick={() => {
                          setVariantIndex(i);
                          setPosition(v.position);
                          setDemoIndex(0);
                          setPlaying(false);
                        }}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                  {variant && <div className="tip">{variant.explanation}</div>}
                </div>
              )}
              {demonstration.length > 0 && (
                <div className="demo-controls">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setPosition(demonstrationStart);
                      setDemoIndex(0);
                      setPlaying(true);
                    }}
                  >
                    <Play size={18} weight="fill" />{" "}
                    {playing ? "重新播放" : "播放演示"}
                  </button>
                  <span>
                    {demoIndex} / {demonstration.length} 手
                  </span>
                </div>
              )}
              {demonstration.length > 0 && (
                <input
                  type="range"
                  aria-label="课程演示手数"
                  min="0"
                  max={demonstration.length}
                  value={demoIndex}
                  onChange={(e) => seekDemo(Number(e.target.value))}
                />
              )}
              <button
                className="button primary full"
                onClick={() => {
                  reset();
                  setStep(1);
                }}
              >
                轮到你了 <ArrowRight size={18} />
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <span className="eyebrow">动手操作</span>
              <h2>{lesson.task.instruction}</h2>
              {lesson.task.sequence && (
                <span className="pill">
                  跟练第{" "}
                  {Math.min(
                    Math.floor(taskIndex / 2) + 1,
                    Math.ceil(lesson.task.sequence.length / 2),
                  )}{" "}
                  / {Math.ceil(lesson.task.sequence.length / 2)} 手
                </span>
              )}
              <p>
                可以旋转棋盘观察，或切换俯视。点击棋子查看气，点击空点尝试任务。
              </p>
              {feedback && (
                <div
                  className={`feedback ${done ? "success" : "retry"}`}
                  role="status"
                >
                  <strong>{done ? "做到了！" : "观察一下局面"}</strong>
                  <p>{feedback}</p>
                </div>
              )}
              {!done && (
                <>
                  <button
                    className="button secondary full"
                    onClick={() => {
                      setHintUsed(true);
                      setHintLevel(Math.min(3, hintLevel + 1));
                    }}
                  >
                    <Lightbulb size={19} />{" "}
                    {hintLevel === 0
                      ? "给我一点提示"
                      : hintLevel === 1
                        ? "标出关键点"
                        : "演示这一手"}
                  </button>
                  {hintLevel > 0 && (
                    <div className="tip">
                      {hintLevel === 1
                        ? "先找任务中提到的棋块，检查它的气或连接。"
                        : `看看 ${coord(taskTargets[0], position.size)}。`}
                      {hintLevel >= 3 && (
                        <button
                          className="text-button"
                          onClick={() => select(taskTargets[0])}
                        >
                          演示解答 <Play size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              <div className="button-row">
                <button className="button secondary" onClick={reset}>
                  <ArrowCounterClockwise size={18} /> 重来
                </button>
                <button
                  className="button primary"
                  disabled={!done}
                  onClick={() => setStep(2)}
                >
                  独立练习 <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <Quiz
              questions={lesson.questions}
              onAttempt={onAttempt}
              onFinish={(score, hints) => {
                const totalHints = hints + (hintUsed ? 1 : 0);
                setQuizResult({ score, hints: totalHints });
                complete(score, totalHints);
                setStep(3);
              }}
            />
          )}
          {step === 3 && (
            <div className="lesson-complete">
              <CheckCircle size={56} weight="duotone" />
              <span className="eyebrow">课程完成</span>
              <h2>又懂了一点围棋。</h2>
              <p>
                本节独立答对 {quizResult?.score} / 3 题。
                {quizResult?.hints
                  ? "提示帮助你完成了学习，可以再做一次无提示练习。"
                  : "继续用不同局面验证你的判断。"}
              </p>
              <div className="takeaway">{lesson.task.success}</div>
              {lesson.stage >= 6 && (
                <button
                  className="button secondary full"
                  onClick={() => navigate("play")}
                >
                  开始一局实战 <ArrowRight size={18} />
                </button>
              )}
              {nextLesson ? (
                <button
                  className="button primary full"
                  onClick={() => navigate(`lesson/${nextLesson.id}`)}
                >
                  下一课 · {nextLesson.title} <ArrowRight size={18} />
                </button>
              ) : (
                <button
                  className="button primary full"
                  onClick={() => navigate("practice")}
                >
                  开始阶段挑战 <ArrowRight size={18} />
                </button>
              )}
              <button className="text-button" onClick={back}>
                返回学习路线
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
