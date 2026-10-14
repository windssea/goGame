import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ChatCircleDots,
  Copy,
  Sparkle,
  SpinnerGap,
  Stop,
  X,
} from "@phosphor-icons/react";
import { askAdvice } from "../ai/remote";
import type { AIProfile } from "../ai/remote";
import { analyze } from "../ai/analysis";
import { coord, createPosition, fingerprint, groups } from "../domain/go";
import type { Position } from "../domain/go";

const CoachContext = createContext({
  setBoard: (_p: Position, _note?: string) => {},
  open: (_question?: string) => {},
  registerAssistance:
    (_callback: () => void): (() => void) =>
    () => {},
});
export function useCoachAssistance(callback: () => void) {
  const { registerAssistance } = useContext(CoachContext);
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(
    () => registerAssistance(() => latest.current()),
    [registerAssistance],
  );
}
export function useCoachBoard(position: Position, note?: string) {
  const { setBoard } = useContext(CoachContext);
  useEffect(() => setBoard(position, note), [position, note, setBoard]);
}
export function CoachButton({
  question = "请结合当前课程和棋盘，解释我应该关注什么，以及为什么。",
}: {
  question?: string;
}) {
  const { open } = useContext(CoachContext);
  return (
    <button
      className="button secondary coach-inline"
      onClick={() => open(question)}
    >
      <Sparkle size={18} />
      问教练 · 深入讲解
    </button>
  );
}
type Message = {
  role: "user" | "assistant";
  content: string;
  title: string;
  source?: "remote" | "local";
};
export function CoachProvider({
  children,
  profile,
  route,
  title,
  reference,
  navigate,
  onAssist,
  blocked = false,
}: {
  children: ReactNode;
  profile: AIProfile;
  route: string;
  title: string;
  reference: string;
  navigate: (r: string) => void;
  onAssist?: () => void;
  blocked?: boolean;
}) {
  const [scope, setScope] = useState<{
      position: Position;
      note: string;
      route: string;
    }>(() => ({ position: createPosition(9), note: "", route: "" })),
    [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null),
    bottom = useRef<HTMLDivElement>(null),
    draftRef = useRef<HTMLTextAreaElement>(null);
  const assistanceListeners = useRef(new Set<() => void>());
  const registerAssistance = useCallback((callback: () => void) => {
    assistanceListeners.current.add(callback);
    return () => {
      assistanceListeners.current.delete(callback);
    };
  }, []);
  const setBoard = useCallback(
    (p: Position, note = "") => setScope({ position: p, note, route }),
    [route],
  );
  const position = scope.position,
    hasBoard = scope.route === route;
  const open = useCallback((question?: string) => {
    setVisible(true);
    if (question) setDraft(question);
  }, []);
  const identity = `${route}:${fingerprint(position.board, position.toPlay)}:${position.moveNumber}`;
  useEffect(() => {
    pending.current?.abort();
    setBusy(false);
    setError("");
    return () => pending.current?.abort();
  }, [identity, profile, reference, blocked]);
  useEffect(() => {
    if (visible) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy, visible]);
  useEffect(() => {
    if (visible) draftRef.current?.focus();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pending.current?.abort();
        setBusy(false);
        setVisible(false);
      }
    };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [visible]);
  const configured = !!profile.baseURL && !!profile.model;
  const ask = async (question = draft.trim()) => {
    if (!question || busy || blocked) return;
    assistanceListeners.current.forEach((callback) => callback());
    onAssist?.();
    const abort = new AbortController();
    pending.current = abort;
    const history = messages
      .filter((m) => m.source === "remote" || m.role === "user")
      .map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, title },
    ]);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      let content: string;
      if (configured)
        content = await askAdvice(profile, position, question, abort.signal, {
          title,
          reference: `${reference}\n当前步骤注解：${hasBoard ? scope.note : "页面无活动棋盘"}`,
          history,
          hasBoard,
        });
      else if (!hasBoard)
        content = `${title}\n${reference}\n\n配置个人 AI 后，可以自由讨论学习路线、知识点与复习计划。打开课程或棋谱后，本地教练也会结合活动棋盘给出提示。`;
      else {
        const allGroups = groups(position.board, position.size);
        const danger = allGroups.filter((g) => g.liberties.size === 1);
        const candidate = (
          await analyze(position, "challenge", abort.signal)
        )[0];
        content = `${title}\n${reference.slice(0, 650)}\n\n当前棋盘：${position.size} 路，第 ${position.moveNumber} 手，${position.toPlay === 1 ? "黑" : "白"}先行。${danger.length ? `有 ${danger.length} 块棋只剩一口气，先检查提子与救棋。` : "先检查棋块的气、连接和展开方向。"}\n\n${candidate?.action.type === "play" ? `本地搜索参考：${coord(candidate.action, position.size)}。${candidate.explanation}` : "本地搜索暂未找到有价值的着手，可检查边界与未安定的棋。"}\n\n这是本地课程提示与算法参考。配置 AI 后，可以自由追问、比较变化和讨论学习计划。`;
      }
      if (!abort.signal.aborted)
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            title,
            source: configured ? "remote" : "local",
          },
        ]);
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : "请求未成功，请重试。");
        setDraft(question);
      }
    } finally {
      if (pending.current === abort) setBusy(false);
    }
  };
  return (
    <CoachContext.Provider value={{ setBoard, open, registerAssistance }}>
      {children}
      <button
        className="coach-launch"
        aria-label="打开全局围棋教练"
        onClick={() => open()}
      >
        <ChatCircleDots size={22} weight="fill" />
        <span>
          围棋教练
          <small>{configured ? profile.model : "本地提示 · 可接 AI"}</small>
        </span>
      </button>
      {visible && (
        <aside className="coach-drawer" aria-label="全局围棋教练">
          <header>
            <Sparkle size={23} />
            <div>
              <strong>一起想下一手</strong>
              <small>{configured ? "个人 AI · 可连续追问" : "本地教练"}</small>
            </div>
            <button
              className="icon-button"
              aria-label="关闭围棋教练"
              onClick={() => {
                pending.current?.abort();
                setBusy(false);
                setVisible(false);
              }}
            >
              <X size={20} />
            </button>
          </header>
          <div className="coach-context">
            <span>当前上下文</span>
            <strong>{title}</strong>
            <small>
              {hasBoard
                ? `${position.size} 路 · 第 ${position.moveNumber} 手`
                : "无活动棋盘"}
            </small>
          </div>
          <div
            className="coach-messages"
            role="log"
            aria-label="教练对话"
            aria-live="polite"
          >
            {!messages.length && (
              <div className="coach-welcome">
                <h3>把不懂的地方问明白。</h3>
                <p>
                  教练会结合这页内容和当前棋盘回答。翻页或换局面后，下个问题自动使用新上下文。
                </p>
                {!configured && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setVisible(false);
                      navigate("settings");
                    }}
                  >
                    连接个人 AI <ArrowRight size={16} />
                  </button>
                )}
              </div>
            )}
            {messages.map((m, i) => (
              <article key={i} className={`coach-message ${m.role}`}>
                <small>
                  {m.role === "user"
                    ? "你"
                    : m.source === "remote"
                      ? "AI 建议 · 请结合棋盘验证"
                      : "本地参考"}{" "}
                  · {m.title}
                </small>
                <p>{m.content}</p>
                {m.role === "assistant" && (
                  <button
                    className="text-button"
                    aria-label="复制教练回答"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(m.content)
                        .catch(() => setError("复制失败，可手动选中文字。"))
                    }
                  >
                    <Copy size={14} />
                    复制
                  </button>
                )}
              </article>
            ))}
            {busy && (
              <p className="coach-thinking">
                <SpinnerGap className="spin" size={18} />
                正在结合棋盘思考…
              </p>
            )}
            <div ref={bottom} />
          </div>
          <div className="coach-compose">
            {blocked ? (
              <p>当前是独立测评。完成后可用教练复盘，练习模式可以随时提问。</p>
            ) : (
              <>
                <div className="coach-prompts">
                  {["解释当前局面", "比较两种下法", "给我一个练习计划"].map(
                    (q) => (
                      <button
                        key={q}
                        disabled={busy}
                        onClick={() => setDraft(q)}
                      >
                        {q}
                      </button>
                    ),
                  )}
                </div>
                <label className="sr-only" htmlFor="coach-question">
                  向教练提问
                </label>
                <textarea
                  id="coach-question"
                  ref={draftRef}
                  rows={3}
                  maxLength={1200}
                  placeholder="这手为什么好？换个方向会怎样？"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void ask();
                    }
                  }}
                />
                {error && (
                  <p role="alert" className="coach-error">
                    {error}
                  </p>
                )}
                <div className="button-row">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setMessages([])}
                  >
                    清空对话
                  </button>
                  {busy ? (
                    <button
                      className="button secondary"
                      onClick={() => {
                        pending.current?.abort();
                        setBusy(false);
                      }}
                    >
                      <Stop size={16} />
                      停止
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      disabled={!draft.trim()}
                      onClick={() => void ask()}
                    >
                      发送 <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </CoachContext.Provider>
  );
}
