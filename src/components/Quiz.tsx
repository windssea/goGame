import { useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  Lightbulb,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import type { Question } from "../content/courses";
import { useCoachAssistance } from "./Coach";
export function Quiz({
  questions,
  exam = false,
  onFinish,
  onAttempt,
}: {
  questions: Question[];
  exam?: boolean;
  onFinish: (score: number, hints: number, criticalPassed: boolean) => void;
  onAttempt?: (q: Question, correct: boolean, hinted: boolean) => void;
}) {
  const [step, setStep] = useState(0),
    [selection, setSelection] = useState<number | null>(null),
    [submitted, setSubmitted] = useState(false),
    [hinted, setHinted] = useState(false),
    [hints, setHints] = useState(0),
    [score, setScore] = useState(0),
    [criticalPassed, setCriticalPassed] = useState(true);
  const question = questions[step],
    correct = selection === question.answer;
  useCoachAssistance(() => {
    if (!exam && !submitted) setHinted(true);
  });
  const next = () => {
    const finalScore = score + (correct && !hinted ? 1 : 0),
      finalHints = hints + (hinted ? 1 : 0),
      critical = criticalPassed && (!question.critical || correct);
    onAttempt?.(question, correct, hinted);
    if (step === questions.length - 1)
      onFinish(finalScore, finalHints, critical);
    else {
      setStep(step + 1);
      setSelection(null);
      setSubmitted(false);
      setHinted(false);
      setScore(finalScore);
      setHints(finalHints);
      setCriticalPassed(critical);
    }
  };
  return (
    <div className="quiz">
      <div className="eyebrow">
        {exam ? "阶段挑战" : "独立练习"}{" "}
        <span>
          {String(step + 1).padStart(2, "0")} /{" "}
          {String(questions.length).padStart(2, "0")}
        </span>
      </div>
      <div className="quiz-progress">
        <span style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
      </div>
      <h2>{question.prompt}</h2>
      <div className="answer-list">
        {question.options.map((option, i) => (
          <button
            key={option}
            disabled={submitted}
            className={`answer ${selection === i ? "chosen" : ""} ${submitted && i === question.answer ? "correct" : ""} ${submitted && selection === i && !correct ? "incorrect" : ""}`}
            onClick={() => setSelection(i)}
          >
            <span className="answer-letter">{"ABC"[i]}</span>
            {option}
            {submitted && i === question.answer && (
              <CheckCircle size={21} weight="fill" />
            )}
          </button>
        ))}
      </div>
      {!exam && !submitted && (
        <button className="text-button" onClick={() => setHinted(true)}>
          <Lightbulb size={18} /> 看一个提示
        </button>
      )}
      {hinted && !submitted && (
        <div className="tip">{question.explanation}</div>
      )}
      {submitted && (
        <div
          className={`feedback ${correct ? "success" : "retry"}`}
          role="status"
        >
          <strong>
            {correct
              ? hinted
                ? "答对了，提示帮助你完成了练习。"
                : "答对了，判断很准确。"
              : "再理解一下这一步。"}
          </strong>
          <p>{question.explanation}</p>
        </div>
      )}
      {!submitted ? (
        <button
          className="button primary full"
          disabled={selection === null}
          onClick={() => setSubmitted(true)}
        >
          确认答案 <ArrowRight size={18} />
        </button>
      ) : (
        <div className="button-row">
          {!correct && !exam && (
            <button
              className="button secondary"
              onClick={() => {
                setSubmitted(false);
                setSelection(null);
                setHinted(true);
              }}
            >
              <ArrowCounterClockwise size={18} /> 再试一次
            </button>
          )}
          <button className="button primary" onClick={next}>
            {step === questions.length - 1 ? "完成练习" : "下一题"}{" "}
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
