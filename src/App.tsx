import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle,
  Checkerboard,
  Clock,
  Cpu,
  DownloadSimple,
  GearSix,
  GraduationCap,
  Lightbulb,
  LockKey,
  Moon,
  Path,
  Play,
  Plus,
  ShieldCheck,
  Sparkle,
  SpinnerGap,
  Strategy,
  Sun,
  Target,
  Trash,
  TreeStructure,
  WarningCircle,
} from "@phosphor-icons/react";
import { Board, MiniBoard, StoneDot } from "./components/Board";
import { Quiz } from "./components/Quiz";
import { lessons, stages, exams, placementQuestions } from "./content/courses";
import type { Question } from "./content/courses";
import { openings } from "./content/openings";
import { createPosition, newGame, pathTo, toSGF } from "./domain/go";
import type { SavedGame } from "./domain/go";
import {
  defaultProfile,
  endpoint,
  loadProfile,
  saveProfile,
  testProfile,
} from "./ai/remote";
import type { AIProfile } from "./ai/remote";
import { difficultyLabels } from "./ai/local";
import type { Difficulty } from "./ai/local";
import {
  clearRecords,
  downloadFile,
  emptyProgress,
  getRecord,
  getGames,
  saveGame,
  loadPreferences,
  setRecord,
  restoreRecords,
} from "./storage";
import type { Preferences, Progress } from "./storage";
import { LessonView } from "./views/LessonView";
import { OpeningsPage, OpeningView } from "./views/OpeningView";
import { PlayView } from "./views/PlayView";
import { OfflineUpdate } from "./components/OfflineUpdate";
import { CoachProvider } from "./components/Coach";
import { ArchivePanel } from "./components/ArchivePanel";
import { AppearanceContext } from "./components/Appearance";
import { ChallengeHub, ChallengeView } from "./views/ChallengeView";
import { StudyLibrary, StudyView } from "./views/StudyView";
import { studies } from "./content/studies";

const navigation = [
  { route: "learn", label: "学习路线", icon: BookOpen },
  { route: "practice", label: "练习与挑战", icon: Target },
  { route: "openings", label: "经典开局", icon: Strategy },
  { route: "play", label: "开始对弈", icon: Checkerboard },
];
const demoPosition = createPosition(9, 0, [
  { row: 2, col: 2, color: 1 },
  { row: 2, col: 6, color: 2 },
  { row: 6, col: 6, color: 1 },
  { row: 6, col: 2, color: 2 },
  { row: 2, col: 3, color: 1 },
  { row: 3, col: 6, color: 2 },
  { row: 5, col: 6, color: 1 },
  { row: 6, col: 3, color: 2 },
  { row: 3, col: 2, color: 1 },
  { row: 4, col: 6, color: 2 },
  { row: 5, col: 5, color: 1 },
  { row: 5, col: 2, color: 2 },
]);
const routeFromHash = () => location.hash.replace(/^#\/?/, "") || "learn";

function AISettings({
  profile,
  save,
  notify,
}: {
  profile: AIProfile;
  save: (p: AIProfile) => void;
  notify: (text: string) => void;
}) {
  const [draft, setDraft] = useState(profile),
    [visibleKey, setVisibleKey] = useState(false),
    [testing, setTesting] = useState(false),
    [status, setStatus] = useState(""),
    [remove, setRemove] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    setDraft(profile);
  }, [profile]);
  useEffect(() => () => abort.current?.abort(), []);
  const change = <K extends keyof AIProfile>(key: K, value: AIProfile[K]) => {
    abort.current?.abort();
    setTesting(false);
    setStatus("");
    setDraft({ ...draft, [key]: value });
  };
  const saveDraft = () => {
    try {
      saveProfile(draft);
      save({ ...draft });
      notify("AI 配置已保存在当前浏览器。");
      setStatus("配置已保存。测试成功后再开始个人 AI 对弈。");
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "浏览器无法保存配置。本次可临时使用。",
      );
    }
  };
  return (
    <section className="settings-card ai-settings">
      <div className="section-heading">
        <div className="icon-square">
          <Cpu size={25} />
        </div>
        <div>
          <h2>你的 AI，你来选择。</h2>
          <p>连接自己的兼容模型服务，让它成为棋盘上的陪练。</p>
        </div>
        <span className="pill">
          <LockKey size={14} />
          仅本机保存
        </span>
      </div>
      <div className="privacy-note">
        <ShieldCheck size={23} />
        <p>
          配置不会同步到本应用服务器。使用 AI
          时，密钥用于向你配置的服务认证，必要的棋局数据会发送给该服务。浏览器本地保存采用明文持久存储。
        </p>
      </div>
      <div className="form-grid">
        <label className="field full-field">
          Base URL <span>API 根地址，例如 https://ai.example.com/v1</span>
          <input
            autoComplete="off"
            placeholder="https://your-api.example.com/v1"
            value={draft.baseURL}
            onChange={(e) => change("baseURL", e.target.value)}
          />
        </label>
        <label className="field full-field">
          API Key <span>仅发给你指定的服务；无认证本地服务可留空</span>
          <div className="secret-input">
            <input
              type={visibleKey ? "text" : "password"}
              autoComplete="off"
              placeholder="输入你的个人密钥"
              value={draft.apiKey}
              onChange={(e) => change("apiKey", e.target.value)}
            />
            <button
              className="text-button"
              onClick={() => setVisibleKey(!visibleKey)}
              aria-label={visibleKey ? "隐藏密钥" : "显示密钥"}
            >
              {visibleKey ? "隐藏" : "显示"}
            </button>
          </div>
        </label>
        <label className="field full-field">
          模型名称 <span>使用服务支持的准确名称</span>
          <input
            autoComplete="off"
            placeholder="例如你的模型 ID"
            value={draft.model}
            onChange={(e) => change("model", e.target.value)}
          />
        </label>
        <label className="field">
          请求超时（秒）
          <input
            type="number"
            min="10"
            max="120"
            value={draft.timeout}
            onChange={(e) =>
              change(
                "timeout",
                Math.min(120, Math.max(10, Number(e.target.value))),
              )
            }
          />
        </label>
        <label className="field">
          回复上限（tokens）
          <input
            type="number"
            min="200"
            max="4000"
            step="100"
            value={draft.maxTokens}
            onChange={(e) =>
              change(
                "maxTokens",
                Math.min(4000, Math.max(200, Number(e.target.value))),
              )
            }
          />
        </label>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.remember}
          onChange={(e) => {
            change("remember", e.target.checked);
            if (!e.target.checked) {
              try {
                const stored = loadProfile();
                localStorage.setItem(
                  "goGame.ai.v1",
                  JSON.stringify({ ...stored, apiKey: "", remember: false }),
                );
              } catch {
                notify("无法更新本机存储，请在浏览器中清除本站数据。");
              }
            }
          }}
        />
        在当前浏览器记住密钥 <span>关闭后仅当前页面临时使用</span>
      </label>
      <div className="button-row">
        <button className="button primary" onClick={saveDraft}>
          保存配置 <Check size={18} />
        </button>
        <button
          className="button secondary"
          disabled={testing || !draft.baseURL || !draft.model}
          onClick={async () => {
            const request = new AbortController();
            abort.current = request;
            setTesting(true);
            setStatus("正在测试连接，此操作会发送一个最小模型请求。");
            const start = performance.now();
            try {
              const result = await testProfile(draft, request.signal);
              if (!request.signal.aborted)
                setStatus(
                  `本次测试通过 · ${((performance.now() - start) / 1000).toFixed(1)} 秒 · ${result.slice(0, 60)}`,
                );
            } catch {
              if (!request.signal.aborted)
                setStatus(
                  "连接失败。请检查地址、密钥、模型和服务端 CORS 设置；本次未发送棋局。",
                );
            } finally {
              if (!request.signal.aborted) setTesting(false);
            }
          }}
        >
          {testing ? (
            <SpinnerGap className="spin" size={18} />
          ) : (
            <Play size={18} />
          )}
          测试连接
        </button>
        <button
          className="icon-button danger"
          aria-label="删除 AI 配置"
          onClick={() => setRemove(true)}
        >
          <Trash size={20} />
        </button>
      </div>
      {status && (
        <div className="inline-feedback" role="status">
          {status}
        </div>
      )}
      <details>
        <summary>连接与兼容说明</summary>
        <p>
          首版使用 chat-completions 兼容协议，会在根地址后追加
          /chat/completions。服务必须允许浏览器来源和
          Authorization、Content-Type 请求头。远程服务使用
          HTTPS；需要代理时，请使用自己控制的代理。
        </p>
        <p>
          通用语言模型的棋力不能只靠提示词保证。本地模块提供合法候选和难度限制，模型参与候选选择；无效回复会校验并本地接手。
        </p>
        <p>清除浏览器数据会删除本机配置。密钥不包含在进度或棋谱导出中。</p>
      </details>
      {remove && (
        <div className="modal-scrim">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>删除本机 AI 配置？</h2>
            <p>这会删除本机地址、模型与已保存密钥，学习进度和棋谱保留。</p>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => setRemove(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                onClick={() => {
                  abort.current?.abort();
                  localStorage.removeItem("goGame.ai.v1");
                  save({ ...defaultProfile });
                  setDraft({ ...defaultProfile });
                  setRemove(false);
                  setStatus("AI 配置已删除。");
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash),
    [preferences, setPreferences] = useState<Preferences>(loadPreferences),
    [profile, setProfile] = useState(loadProfile),
    [progress, setProgress] = useState<Progress>(emptyProgress),
    [games, setGames] = useState<SavedGame[]>([]),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState(""),
    [stageFilter, setStageFilter] = useState(-1),
    [practiceStage, setPracticeStage] = useState<number | null>(null),
    [examResult, setExamResult] = useState<{
      score: number;
      total: number;
      critical: boolean;
      stage: number;
    } | null>(null),
    [wrongOnly, setWrongOnly] = useState(false),
    [reviewQuestions, setReviewQuestions] = useState<Question[] | null>(null),
    [clearData, setClearData] = useState(false),
    [size, setSize] = useState(9),
    [komi, setKomi] = useState(6.5),
    [difficulty, setDifficulty] = useState<Difficulty>("beginner"),
    [opponent, setOpponent] = useState<"local" | "remote">("local"),
    [human, setHuman] = useState<1 | 2>(1),
    [readOnlyGame, setReadOnlyGame] = useState(false);
  const [mode, setMode] = useState<"training" | "challenge">("training");
  const [challengeAssisted, setChallengeAssisted] = useState(false);
  const [leasedGame, setLeasedGame] = useState<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null),
    tabId = useRef(crypto.randomUUID()),
    gamesRef = useRef(games);
  gamesRef.current = games;
  const navigate = useCallback((next: string) => {
    location.hash = `/${next}`;
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const notify = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    const change = () => {
      setRoute(routeFromHash());
      setPracticeStage(null);
      setExamResult(null);
      setReviewQuestions(null);
      setChallengeAssisted(false);
    };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    void Promise.all([getRecord<Progress>("progress"), getGames()])
      .then(([p, g]) => {
        if (
          p?.version === 1 &&
          p.lessons &&
          p.attempts &&
          p.exams &&
          Array.isArray(p.openings)
        )
          setProgress(p);
        if (Array.isArray(g))
          setGames(g.filter((game) => game.id && game.nodes?.[game.current]));
        setReady(true);
      })
      .catch(() => {
        notify("浏览器存储不可用，本次学习可以继续，但记录可能无法保存。");
        setReady(true);
      });
  }, [notify]);
  useEffect(() => {
    if (!ready) return;
    void setRecord("progress", progress).catch(() =>
      notify("学习记录保存失败，请检查浏览器存储。"),
    );
  }, [progress, ready, notify]);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.motion = preferences.reducedMotion
      ? "reduced"
      : "normal";
    try {
      localStorage.setItem("goGame.ui.v1", JSON.stringify(preferences));
    } catch {
      notify("界面设置暂时无法持久保存。");
    }
  }, [preferences, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const currentGameId =
    route.startsWith("game/") || route.startsWith("review/")
      ? route.split("/")[1]
      : null;
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel("goGame.sessions");
    channel.current = c;
    setReadOnlyGame(false);
    c.onmessage = (event) => {
      const m = event.data;
      if (m.tabId === tabId.current) return;
      if (m.kind === "saved" && m.game?.id && m.game.nodes?.[m.game.current]) {
        setGames((previous) => [
          m.game,
          ...previous.filter((g) => g.id !== m.game.id),
        ]);
      }
      if (
        !navigator.locks &&
        m.kind === "claim" &&
        m.gameId &&
        m.gameId === currentGameId
      )
        c.postMessage({
          kind: "occupied",
          gameId: currentGameId,
          tabId: tabId.current,
          target: m.tabId,
        });
      if (
        !navigator.locks &&
        m.kind === "occupied" &&
        m.target === tabId.current &&
        m.gameId === currentGameId
      )
        setReadOnlyGame(true);
    };
    if (currentGameId)
      c.postMessage({
        kind: "claim",
        gameId: currentGameId,
        tabId: tabId.current,
      });
    return () => {
      c.close();
      channel.current = null;
    };
  }, [currentGameId]);
  useEffect(() => {
    setLeasedGame(null);
    if (!currentGameId) return;
    let closed = false,
      release: (() => void) | null = null;
    if (navigator.locks) {
      void navigator.locks.request(
        `goGame.game.${currentGameId}`,
        { ifAvailable: true },
        (lock) => {
          if (closed) return;
          if (!lock) {
            setReadOnlyGame(true);
            return;
          }
          setReadOnlyGame(false);
          setLeasedGame(currentGameId);
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      );
    } else {
      // Older browsers use the BroadcastChannel occupancy check above.
      setLeasedGame(currentGameId);
    }
    return () => {
      closed = true;
      release?.();
    };
  }, [currentGameId]);
  useEffect(() => {
    const storage = (e: StorageEvent) => {
      if (e.key === "goGame.ai.v1") {
        setProfile(loadProfile());
        notify("AI 配置在另一标签中更新，旧请求会取消。");
      }
    };
    addEventListener("storage", storage);
    return () => removeEventListener("storage", storage);
  }, [notify]);
  const updateGame = useCallback(
    (game: SavedGame) => {
      setGames((previous) => [
        game,
        ...previous.filter((g) => g.id !== game.id),
      ]);
      void saveGame(game)
        .then(() =>
          channel.current?.postMessage({
            kind: "saved",
            game,
            tabId: tabId.current,
          }),
        )
        .catch(() => notify("棋谱保存失败，请及时导出棋谱。"));
    },
    [notify],
  );
  const completeLesson = (id: string, score: number, hints: number) =>
    setProgress((p) => ({
      ...p,
      lessons: {
        ...p.lessons,
        [id]: {
          complete: true,
          independent: Math.max(p.lessons[id]?.independent || 0, score),
          hints,
          at: Date.now(),
        },
      },
    }));
  const attempt = (q: Question, correct: boolean, hinted: boolean) =>
    setProgress((p) => {
      const previous = p.attempts[q.id];
      const reviewLevel =
        correct && !hinted && previous?.correct && !previous.hinted
          ? Math.min(3, (previous.reviewLevel || 0) + 1)
          : 0;
      const at = Date.now(),
        delay = [1, 3, 7, 14][reviewLevel] * 86400000;
      return {
        ...p,
        attempts: {
          ...p.attempts,
          [q.id]: {
            correct,
            hinted,
            at,
            reviewLevel,
            reviewAt: correct && !hinted ? at + delay : at,
          },
        },
      };
    });
  const completed = Object.values(progress.lessons).filter(
    (l) => l.complete,
  ).length;
  const hasIndependentGame = games.some(
    (g) =>
      g.mode === "challenge" &&
      !!g.result &&
      !g.result.endsWith("R") &&
      !g.assisted &&
      [9, 13].includes(g.nodes[g.root].position.size),
  );
  const stagePassed = (i: number) =>
    progress.exams[i] >= 5 && (i !== 7 || hasIndependentGame);
  const nextLesson =
    lessons.find((l) => !progress.lessons[l.id]?.complete) || lessons[31];
  const wrongQuestions = [
    ...lessons.flatMap((l) => l.questions),
    ...exams.flat(),
  ].filter(
    (q) =>
      progress.attempts[q.id] &&
      (!progress.attempts[q.id].correct ||
        progress.attempts[q.id].hinted ||
        (progress.attempts[q.id].reviewAt ||
          progress.attempts[q.id].at + 86400000) <= Date.now()),
  );
  const activeRoute = route.startsWith("lesson/")
    ? "learn"
    : route.startsWith("challenge/")
      ? "practice"
      : route.startsWith("study/")
        ? "openings"
        : route.startsWith("opening/")
          ? "openings"
          : route.startsWith("game/") || route.startsWith("review/")
            ? "play"
            : route === "records"
              ? "settings"
              : route === "placement"
                ? "practice"
                : route;
  const pageTitle =
    [...navigation, { route: "settings", label: "我的空间" }].find(
      (n) => n.route === activeRoute,
    )?.label || "弈间";
  const currentGame = games.find((g) => g.id === currentGameId);
  const lesson = lessons.find((l) => l.id === route.split("/")[1]);
  const opening = openings.find((o) => o.id === route.split("/")[1]);
  const study = studies.find((s) => s.id === route.split("/")[1]);
  const importedStudy = route.startsWith("study/")
    ? games.find((g) => g.id === route.split("/")[1])
    : undefined;
  const togglePreference = <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => setPreferences((p) => ({ ...p, [key]: value }));
  const startGame = () => {
    if (opponent === "remote") {
      try {
        endpoint(profile.baseURL);
        if (!profile.model) throw new Error("请先保存模型名称");
      } catch {
        navigate("settings");
        notify("先配置并测试你的 AI 服务，再开始个人 AI 对弈。");
        return;
      }
    }
    const game = { ...newGame(size, komi), difficulty, opponent, human, mode };
    updateGame(game);
    navigate(`game/${game.id}`);
  };
  let content;
  if (route.startsWith("lesson/") && lesson)
    content = (
      <LessonView
        key={lesson.id}
        lesson={lesson}
        preferences={preferences}
        back={() => navigate("learn")}
        complete={(score, hints) => completeLesson(lesson.id, score, hints)}
        onAttempt={attempt}
        navigate={navigate}
      />
    );
  else if (route.startsWith("opening/") && opening)
    content = (
      <OpeningView
        key={opening.id}
        opening={opening}
        preferences={preferences}
        navigate={navigate}
        complete={() =>
          setProgress((p) => ({
            ...p,
            openings: [...new Set([...p.openings, opening.id])],
          }))
        }
      />
    );
  else if (
    (route.startsWith("game/") || route.startsWith("review/")) &&
    currentGame
  )
    content = (
      <PlayView
        key={currentGame.id + route.split("/")[0]}
        game={currentGame}
        update={updateGame}
        profile={profile}
        preferences={preferences}
        navigate={navigate}
        readOnly={readOnlyGame || leasedGame !== currentGame.id}
        initialReview={route.startsWith("review/")}
      />
    );
  else if (route.startsWith("study/") && (study || importedStudy))
    content = (
      <StudyView
        key={route}
        study={study}
        game={importedStudy}
        preferences={preferences}
        navigate={navigate}
        save={updateGame}
      />
    );
  else if (route === "openings")
    content = (
      <>
        <OpeningsPage navigate={navigate} learned={progress.openings} />
        <StudyLibrary
          navigate={navigate}
          games={games}
          importGames={async (incoming) => {
            const combined = [...incoming, ...games];
            await restoreRecords(progress, combined);
            setGames(combined);
          }}
        />
      </>
    );
  else if (route.startsWith("challenge/"))
    content = (
      <ChallengeView
        key={route}
        id={route.split("/")[1]}
        preferences={preferences}
        navigate={navigate}
        assisted={challengeAssisted}
        restart={() => setChallengeAssisted(false)}
        complete={(id, score, ranked) =>
          setProgress((p) => ({
            ...p,
            challenges: {
              ...p.challenges,
              [id]: {
                best: ranked
                  ? Math.max(p.challenges?.[id]?.best || 0, score)
                  : p.challenges?.[id]?.best || 0,
                attempts: (p.challenges?.[id]?.attempts || 0) + 1,
                at: Date.now(),
              },
            },
          }))
        }
      />
    );
  else if (route === "practice" || route === "placement") {
    const placement = route === "placement";
    const selectedQuestions = placement
      ? placementQuestions
      : reviewQuestions ||
        (practiceStage !== null ? exams[practiceStage] : null);
    content = (
      <div className="page-enter">
        <div className="page-heading">
          <div>
            <div className="eyebrow">PRACTICE MAKES UNDERSTANDING</div>
            <h1>{placement ? "找到适合你的起点。" : "在练习里，发现进步。"}</h1>
            <p>
              {placement
                ? "八道短题，只为推荐学习起点。你仍可以自由选课。"
                : "每一题都对应一个具体知识点。先想一想，再看解释。"}
            </p>
          </div>
        </div>
        {selectedQuestions && !examResult ? (
          <div className="quiz-workspace">
            <button
              className="back-link"
              onClick={() => {
                setPracticeStage(null);
                setReviewQuestions(null);
                if (placement) navigate("practice");
              }}
            >
              <ArrowLeft size={18} />
              返回练习中心
            </button>
            <Quiz
              key={`${placement}-${practiceStage}-${reviewQuestions?.[0]?.id}`}
              questions={selectedQuestions}
              exam={!reviewQuestions}
              onAttempt={attempt}
              onFinish={(score, _hints, critical) => {
                const stage = placement ? -1 : (practiceStage ?? -2);
                setExamResult({
                  score,
                  total: selectedQuestions.length,
                  critical,
                  stage,
                });
                if (stage >= 0)
                  setProgress((p) => ({
                    ...p,
                    exams: {
                      ...p.exams,
                      [stage]: Math.max(
                        p.exams[stage] || 0,
                        critical ? score : Math.min(score, 4),
                      ),
                    },
                  }));
              }}
            />
          </div>
        ) : examResult ? (
          <div className="result-card">
            <CheckCircle size={54} weight="duotone" />
            <span className="eyebrow">
              {placement ? "起点建议" : "本次练习"}
            </span>
            <h2>
              {examResult.score} / {examResult.total}
            </h2>
            <p>
              {placement
                ? `建议从第 ${examResult.score >= 7 ? 5 : examResult.score >= 4 ? 3 : 1} 阶段开始，也可以逐课复习。`
                : examResult.score >= 5 && examResult.critical
                  ? examResult.stage === 7 && !hasIndependentGame
                    ? "答题已达标。第八阶段还需要完成一局无策略辅助的九路或十三路独立挑战，再确认终局计分。"
                    : "本阶段测试达标。把判断用到一局棋里，再验证一次。"
                  : reviewQuestions
                    ? "复习完成。下次用不同局面继续巩固。"
                    : "还有值得巩固的知识点。答对 5 题并通过核心规则题即可达标。"}
            </p>
            <div className="button-row">
              <button
                className="button primary"
                onClick={() => {
                  if (examResult.stage === 7 && !hasIndependentGame) {
                    setMode("challenge");
                    setSize(9);
                    setKomi(6.5);
                    navigate("play");
                  } else navigate("learn");
                }}
              >
                {examResult.stage === 7 && !hasIndependentGame
                  ? "完成独立对局"
                  : "去学习"}{" "}
                <ArrowRight size={18} />
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setExamResult(null);
                  setPracticeStage(null);
                  setReviewQuestions(null);
                  if (placement) navigate("practice");
                }}
              >
                返回练习中心
              </button>
            </div>
          </div>
        ) : (
          <>
            <ChallengeHub navigate={navigate} progress={progress} />
            <div className="practice-feature">
              <div className="icon-square">
                <Lightbulb size={29} />
              </div>
              <div>
                <div className="eyebrow">从具体问题开始</div>
                <h2>你的错题，值得再看一眼。</h2>
                <p>
                  {wrongQuestions.length
                    ? `${wrongQuestions.length} 道题需要巩固，复习时可以随时查看提示。`
                    : "还没有待复习的错题。完成课程或阶段测试后，这里会保存需要巩固的题目。"}
                </p>
              </div>
              <button
                className="button secondary"
                disabled={!wrongQuestions.length}
                onClick={() => setReviewQuestions(wrongQuestions.slice(0, 8))}
              >
                复习错题 <ArrowRight size={18} />
              </button>
            </div>
            <div className="section-title">
              <h2>阶段挑战</h2>
              <button
                className="text-button"
                onClick={() => navigate("placement")}
              >
                入门测评 <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="exam-grid">
              {stages.map((stage, i) => (
                <button
                  className="exam-card"
                  key={stage.title}
                  onClick={() => {
                    setPracticeStage(i);
                    setExamResult(null);
                  }}
                >
                  <span className="exam-number">0{i + 1}</span>
                  <div>
                    <h3>{stage.short}</h3>
                    <p>6 道题 · 无提示挑战</p>
                  </div>
                  <span
                    className={stagePassed(i) ? "exam-complete" : "exam-arrow"}
                  >
                    {stagePassed(i) ? (
                      <CheckCircle weight="fill" size={24} />
                    ) : (
                      <ArrowRight size={22} />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="section-title">
              <h2>按知识点练习</h2>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={wrongOnly}
                  onChange={(e) => setWrongOnly(e.target.checked)}
                />
                仅待巩固课程
              </label>
            </div>
            <div className="practice-topics">
              {lessons
                .filter(
                  (l) =>
                    !wrongOnly ||
                    l.questions.some(
                      (q) =>
                        progress.attempts[q.id] &&
                        !progress.attempts[q.id].correct,
                    ),
                )
                .map((l) => (
                  <button key={l.id} onClick={() => navigate(`lesson/${l.id}`)}>
                    {l.title}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    );
  } else if (route === "play")
    content = (
      <div className="page-enter">
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR NEXT GAME</div>
            <h1>准备好，下一局。</h1>
            <p>不必急着赢。每一手，都是一次看懂棋盘的机会。</p>
          </div>
        </div>
        <div className="setup-layout">
          <section className="settings-card setup-card">
            <div className="section-title">
              <h2>选择你的棋局</h2>
              <Checkerboard size={26} />
            </div>
            <label className="field">棋盘大小</label>
            <div className="segmented">
              {[9, 13, 19].map((n) => (
                <button
                  className={size === n ? "active" : ""}
                  key={n}
                  onClick={() => {
                    setSize(n);
                    setKomi(n === 9 ? 6.5 : 7.5);
                  }}
                >
                  {n} 路
                  <span>
                    {n === 9 ? "短局入门" : n === 13 ? "布局过渡" : "标准棋盘"}
                  </span>
                </button>
              ))}
            </div>
            <label className="field">对手</label>
            <div className="opponent-options">
              <button
                className={opponent === "local" ? "active" : ""}
                onClick={() => setOpponent("local")}
              >
                <Checkerboard size={25} />
                <strong>本地练习对手</strong>
                <small>无需配置，离线可用</small>
              </button>
              <button
                className={opponent === "remote" ? "active" : ""}
                onClick={() => setOpponent("remote")}
              >
                <Cpu size={25} />
                <strong>我的 AI</strong>
                <small>{profile.model || "使用你的模型服务"}</small>
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                练习档位
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {Object.entries(difficultyLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                白方贴目
                <input
                  type="number"
                  step=".5"
                  min="-100"
                  max="100"
                  value={komi}
                  onChange={(e) => setKomi(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="field">你的执子</label>
            <div className="color-options">
              <button
                className={human === 1 ? "active" : ""}
                onClick={() => setHuman(1)}
              >
                <StoneDot color={1} />
                黑棋 · 先手
              </button>
              <button
                className={human === 2 ? "active" : ""}
                onClick={() => setHuman(2)}
              >
                <StoneDot color={2} />
                白棋 · 后手
              </button>
            </div>
            <label className="field">
              对局模式
              <select
                aria-label="对局模式"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "training" | "challenge")
                }
              >
                <option value="training">指导练习 · 可提示与悔棋</option>
                <option value="challenge">独立挑战 · 关闭策略辅助</option>
              </select>
            </label>
            <p className="form-help">
              档位是本地策略的能力设定，尚未经过段级位或强度认证。较大棋盘搜索受设备预算限制。
            </p>
            <button
              className="button primary full large"
              disabled={!ready}
              onClick={startGame}
            >
              开始对弈 <ArrowRight size={19} />
            </button>
          </section>
          <div className="setup-preview">
            <MiniBoard position={createPosition(size)} size={320} />
            <span className="eyebrow">ONE MOVE AT A TIME</span>
            <h2>
              留一点时间，
              <br />
              给下一手。
            </h2>
            <p>
              无计时压力。支持悔棋、气的显示和逐手复盘；使用辅助会单独记录。
            </p>
            {opponent === "remote" && (
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                管理 AI 配置 <ArrowUpRight size={17} />
              </button>
            )}
          </div>
        </div>
        {games.length > 0 && (
          <>
            <div className="section-title">
              <h2>继续你的棋局</h2>
              <button
                className="text-button"
                onClick={() => navigate("records")}
              >
                全部棋谱 <ArrowRight size={17} />
              </button>
            </div>
            <div className="saved-games">
              {games.slice(0, 3).map((game) => (
                <button
                  className="saved-game"
                  key={game.id}
                  onClick={() =>
                    navigate(`${game.result ? "review" : "game"}/${game.id}`)
                  }
                >
                  <MiniBoard
                    position={game.nodes[game.current].position}
                    size={85}
                  />
                  <div>
                    <h3>{game.title}</h3>
                    <p>
                      {game.nodes[game.current].position.moveNumber} 手 ·{" "}
                      {game.result ? "已结束" : "可继续"} ·{" "}
                      {game.opponent === "remote" ? "个人 AI" : "本地"}
                    </p>
                  </div>
                  <ArrowRight size={22} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  else if (route === "settings")
    content = (
      <div className="page-enter">
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR OWN SPACE</div>
            <h1>让这里，适合你。</h1>
            <p>调整体验，管理自己的 AI。所有学习记录保存在这台浏览器里。</p>
          </div>
          <button
            className="button secondary"
            onClick={() => navigate("records")}
          >
            <TreeStructure size={18} />
            我的棋谱
          </button>
        </div>
        <div className="settings-layout">
          <AISettings profile={profile} save={setProfile} notify={notify} />
          <div className="settings-side">
            <ArchivePanel
              progress={progress}
              preferences={preferences}
              profile={profile}
              games={games}
              loaded={(p, prefs, ai, g) => {
                setProgress(p);
                setPreferences(prefs);
                setProfile(ai);
                setGames(g);
                notify("完整存档已恢复。");
              }}
            />
            <section className="settings-card">
              <h2>棋盘与界面</h2>
              <label className="field">
                对弈场景
                <select
                  value={preferences.scene}
                  onChange={(e) =>
                    togglePreference(
                      "scene",
                      e.target.value as Preferences["scene"],
                    )
                  }
                >
                  <option value="bamboo">竹林 · 晨光</option>
                  <option value="room">棋室 · 木与纸</option>
                  <option value="night">夜庭 · 灯火</option>
                </select>
              </label>
              <label className="field">
                棋盘材质
                <select
                  value={preferences.boardMaterial}
                  onChange={(e) =>
                    togglePreference(
                      "boardMaterial",
                      e.target.value as Preferences["boardMaterial"],
                    )
                  }
                >
                  <option value="kaya">榧木 · 蜜金色</option>
                  <option value="walnut">胡桃木 · 深棕色</option>
                  <option value="slate">岩石 · 银灰色</option>
                </select>
              </label>
              <label className="toggle-row">
                <span>深色主题</span>
                <input
                  type="checkbox"
                  checked={preferences.theme === "dark"}
                  onChange={(e) =>
                    togglePreference(
                      "theme",
                      e.target.checked ? "dark" : "light",
                    )
                  }
                />
              </label>
              <label className="toggle-row">
                <span>减少动态效果</span>
                <input
                  type="checkbox"
                  checked={preferences.reducedMotion}
                  onChange={(e) =>
                    togglePreference("reducedMotion", e.target.checked)
                  }
                />
              </label>
              <label className="toggle-row">
                <span>落子音效</span>
                <input
                  type="checkbox"
                  checked={preferences.sound}
                  onChange={(e) => togglePreference("sound", e.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>使用 2D 棋盘</span>
                <input
                  type="checkbox"
                  checked={preferences.board2d}
                  onChange={(e) =>
                    togglePreference("board2d", e.target.checked)
                  }
                />
              </label>
              <label className="toggle-row">
                <span>落子前确认</span>
                <input
                  type="checkbox"
                  checked={preferences.confirm}
                  onChange={(e) =>
                    togglePreference("confirm", e.target.checked)
                  }
                />
              </label>
              <label className="field">
                3D 画质
                <select
                  value={preferences.quality}
                  onChange={(e) =>
                    togglePreference(
                      "quality",
                      e.target.value as Preferences["quality"],
                    )
                  }
                >
                  <option value="high">标准 · 柔和阴影</option>
                  <option value="low">轻量 · 更低耗电</option>
                </select>
              </label>
            </section>
            <section className="settings-card">
              <h2>你的本地记录</h2>
              <p>
                已完成 {completed} 节课程，保存 {games.length}{" "}
                盘棋。导出的进度不包含 AI 配置或密钥。
              </p>
              <button
                className="button secondary full"
                onClick={() =>
                  downloadFile(
                    "弈间-学习进度.json",
                    JSON.stringify(progress, null, 2),
                    "application/json",
                  )
                }
              >
                <DownloadSimple size={18} />
                导出学习进度
              </button>
              <button
                className="text-button danger"
                onClick={() => setClearData(true)}
              >
                <Trash size={17} />
                清除学习和棋谱记录
              </button>
            </section>
            <section className="local-note">
              <LockKey size={24} />
              <h3>属于你的学习空间</h3>
              <p>
                没有账号、排行榜和云端档案。首次加载完成后，课程与本地对弈可以离线继续。
              </p>
            </section>
          </div>
        </div>
      </div>
    );
  else if (route === "records")
    content = (
      <div className="page-enter">
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR GAME JOURNAL</div>
            <h1>每一局，都留下思考。</h1>
            <p>回看主线，试下分支，把下一次的选择想得更清楚。</p>
          </div>
          <button className="button primary" onClick={() => navigate("play")}>
            <Plus size={18} />
            新的一局
          </button>
        </div>
        {!games.length ? (
          <div className="empty-state">
            <Checkerboard size={56} weight="duotone" />
            <h2>第一盘棋，还在等你。</h2>
            <p>开始一局本地对弈，棋谱会自动保存在这里。</p>
            <button className="button primary" onClick={() => navigate("play")}>
              开始对弈 <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <div className="records-list">
            {games.map((game) => (
              <div className="record-row" key={game.id}>
                <MiniBoard
                  position={game.nodes[game.current].position}
                  size={100}
                />
                <div>
                  <h3>{game.title}</h3>
                  <p>
                    {new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "medium",
                      timeZone: "Asia/Shanghai",
                    }).format(game.createdAt)}{" "}
                    · {pathTo(game).length - 1} 手 ·{" "}
                    {game.assisted
                      ? "辅助练习"
                      : game.mode === "challenge"
                        ? "独立挑战"
                        : "指导练习"}
                  </p>
                  <span className="pill">
                    {game.result ? `结果 ${game.result}` : "进行中"}
                  </span>
                </div>
                <div className="record-actions">
                  <button
                    className="button secondary"
                    onClick={() =>
                      downloadFile(
                        `弈间-${game.id.slice(0, 8)}.sgf`,
                        toSGF(game),
                      )
                    }
                  >
                    <DownloadSimple size={17} />
                    SGF
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      navigate(`${game.result ? "review" : "game"}/${game.id}`)
                    }
                  >
                    {game.result ? "复盘" : "继续"} <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  else if (route === "learn")
    content = (
      <div className="page-enter home">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="small-star">✳</span> 一次一手，慢慢学会
            </span>
            <h1>
              一手一手，
              <br />
              读懂围棋<span className="title-dot">。</span>
            </h1>
            <p>
              从第一颗棋子，到看懂整盘。
              <br />
              在可以转动的棋盘上，让每个道理都看得见。
            </p>
            <div className="hero-actions">
              <button
                className="button primary large"
                onClick={() => navigate(`lesson/${nextLesson.id}`)}
              >
                {completed ? "继续我的学习" : "开始学围棋"}{" "}
                <ArrowRight size={20} />
              </button>
              <button
                className="text-button"
                onClick={() => navigate("placement")}
              >
                我已懂一些规则 <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="hero-meta">
              <span>
                <CheckCircle size={17} />
                无需经验
              </span>
              <span>
                <Clock size={17} />
                每课约 5–10 分钟
              </span>
            </div>
          </div>
          <div className="hero-board">
            <Board position={demoPosition} preferences={preferences} compact />
            <div className="floating-note">
              <span className="floating-icon">
                <Lightbulb size={20} />
              </span>
              <div>
                <strong>换个角度，发现下一手。</strong>
                <small>试试拖动棋盘，或切换俯视</small>
              </div>
            </div>
          </div>
        </section>
        <section className="progress-overview">
          <div className="progress-caption">
            <span className="icon-square">
              <Path size={25} />
            </span>
            <div>
              <span className="eyebrow">你的学习旅程</span>
              <strong>
                {completed
                  ? `已完成 ${completed} 节课程，继续前进。`
                  : "好的开始，就是现在。"}
              </strong>
            </div>
          </div>
          <div className="progress-meter">
            <div>
              <span>课程进度</span>
              <strong>
                {completed}
                <small> / 32</small>
              </strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${(completed / 32) * 100}%` }} />
            </div>
          </div>
          <div className="overview-stat">
            <strong>
              {stages.filter((_, i) => stagePassed(i)).length}
              <small> / 8</small>
            </strong>
            <span>阶段达标</span>
          </div>
          <div className="overview-stat">
            <strong>
              {progress.openings.length}
              <small> / 6</small>
            </strong>
            <span>开局跟练</span>
          </div>
        </section>
        <div className="section-title">
          <div>
            <span className="eyebrow">LEARNING PATH</span>
            <h2>每一步，都有方向。</h2>
          </div>
          <span className="section-meta">8 个阶段 · 32 节互动课程</span>
        </div>
        <div className="stage-tabs">
          <button
            className={stageFilter === -1 ? "active" : ""}
            onClick={() => setStageFilter(-1)}
          >
            全部阶段
          </button>
          {stages.map((stage, i) => (
            <button
              key={stage.title}
              className={stageFilter === i ? "active" : ""}
              onClick={() => setStageFilter(i)}
            >
              {stage.short}
            </button>
          ))}
        </div>
        <div className="stage-list">
          {stages.map((stage, i) =>
            stageFilter !== -1 && stageFilter !== i ? null : (
              <section
                className={`stage-section ${i === nextLesson.stage ? "recommended" : ""}`}
                key={stage.title}
              >
                <div className="stage-heading">
                  <span className="stage-index">0{i + 1}</span>
                  <div>
                    <div className="title-row">
                      <h3>{stage.title}</h3>
                      {i === nextLesson.stage && (
                        <span className="pill accent">
                          {completed ? "继续学习" : "从这里开始"}
                        </span>
                      )}
                    </div>
                    <p>{stage.description}</p>
                  </div>
                  <span className="stage-count">
                    {
                      lessons.filter(
                        (l) =>
                          l.stage === i && progress.lessons[l.id]?.complete,
                      ).length
                    }{" "}
                    / 4 完成
                  </span>
                </div>
                <div className="lesson-grid">
                  {lessons
                    .filter((l) => l.stage === i)
                    .map((l, j) => (
                      <button
                        className={`lesson-card ${progress.lessons[l.id]?.complete ? "completed" : ""}`}
                        key={l.id}
                        onClick={() => navigate(`lesson/${l.id}`)}
                      >
                        <div className="lesson-visual">
                          <MiniBoard position={l.position} size={120} />
                          <span className="lesson-tag">
                            {j === 0
                              ? "观察 + 操作"
                              : j === 3
                                ? "应用练习"
                                : "互动课程"}
                          </span>
                        </div>
                        <div className="lesson-card-body">
                          <span className="lesson-order">
                            LESSON {l.id.slice(-2)}
                          </span>
                          <h4>{l.title}</h4>
                          <div className="lesson-card-footer">
                            <span>
                              <Clock size={14} />约 {l.minutes} 分钟
                            </span>
                            {progress.lessons[l.id]?.complete ? (
                              <CheckCircle weight="fill" size={22} />
                            ) : (
                              <span className="lesson-play">
                                <Play weight="fill" size={13} />
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </section>
            ),
          )}
        </div>
        <section className="opening-callout">
          <span className="icon-square">
            <Strategy size={31} />
          </span>
          <div>
            <span className="eyebrow">多一种开局，多一种思路</span>
            <h2>看看经典布局，怎样连起全盘。</h2>
            <p>二连星、三连星、中国流……逐手观察，再亲手跟练。</p>
          </div>
          <button
            className="button secondary"
            onClick={() => navigate("openings")}
          >
            探索经典开局 <ArrowUpRight size={18} />
          </button>
        </section>
      </div>
    );
  else
    content = (
      <div className="empty-state">
        <WarningCircle size={48} />
        <h2>这个页面暂时找不到。</h2>
        <p>可能是棋谱已清除，或课程地址不正确。</p>
        <button className="button primary" onClick={() => navigate("learn")}>
          返回学习首页
        </button>
      </div>
    );
  return (
    <AppearanceContext.Provider
      value={{
        change: (key, value) => setPreferences((p) => ({ ...p, [key]: value })),
      }}
    >
      <CoachProvider
        profile={profile}
        route={route}
        title={
          route.startsWith("lesson/") && lesson
            ? lesson.title
            : route.startsWith("opening/") && opening
              ? opening.name
              : route.startsWith("study/")
                ? study?.title || importedStudy?.title || pageTitle
                : route.startsWith("challenge/")
                  ? "挑战练习"
                  : currentGame
                    ? currentGame.title
                    : pageTitle
        }
        reference={
          route.startsWith("lesson/") && lesson
            ? [
                lesson.summary,
                ...lesson.paragraphs,
                ...(lesson.variants?.map(
                  (v) => `${v.label}：${v.explanation}`,
                ) || []),
              ].join("\n")
            : route.startsWith("opening/") && opening
              ? [opening.lesson, opening.caution, ...opening.notes].join("\n")
              : route.startsWith("study/") && study
                ? [
                    study.description,
                    ...study.questions,
                    ...Object.values(study.game.nodes).map(
                      (n) => n.explanation || "",
                    ),
                  ].join("\n")
                : `已完成 ${completed} 节课程。可讨论围棋规则、学习路线、布局方向、战术和复盘。${currentGame?.nodes[currentGame.current].explanation || ""}`
        }
        navigate={navigate}
        blocked={
          route === "placement" ||
          (route === "practice" && practiceStage !== null && !examResult)
        }
        onAssist={() => {
          if (route.startsWith("challenge/")) setChallengeAssisted(true);
          if (
            currentGame &&
            !readOnlyGame &&
            leasedGame === currentGame.id &&
            !currentGame.assisted
          )
            updateGame({ ...currentGame, assisted: true });
        }}
      >
        <div className="app-shell">
          <OfflineUpdate
            busy={
              route.startsWith("lesson/") ||
              !!(currentGame && !currentGame.result)
            }
          />
          <aside className="sidebar">
            <button
              className="brand"
              onClick={() => navigate("learn")}
              aria-label="弈间首页"
            >
              <span className="brand-mark">
                <i />
                <i />
              </span>
              <span>
                弈间<small>GO STUDIO</small>
              </span>
            </button>
            <div className="sidebar-label">你的围棋学习空间</div>
            <nav aria-label="主导航">
              {navigation.map((item) => (
                <button
                  key={item.route}
                  className={activeRoute === item.route ? "active" : ""}
                  onClick={() => navigate(item.route)}
                >
                  <item.icon
                    size={22}
                    weight={activeRoute === item.route ? "fill" : "regular"}
                  />
                  {item.label}
                  {activeRoute === item.route && <span className="nav-dot" />}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="sidebar-tip">
                <Sparkle size={24} />
                <p>
                  围棋的乐趣，
                  <br />
                  藏在每一次思考里。
                </p>
                <span>慢慢来，下一手会更好。</span>
              </div>
              <button
                className={activeRoute === "settings" ? "active" : ""}
                onClick={() => navigate("settings")}
              >
                <GearSix size={22} />
                我的空间
              </button>
              <div className="sidebar-footer">
                <span className="avatar">弈</span>
                <div>
                  <strong>个人学习者</strong>
                  <small>本地模式 · 无需登录</small>
                </div>
              </div>
            </div>
          </aside>
          <div className="app-main">
            <header className="topbar">
              <div className="breadcrumb">
                <span>弈间</span>
                <span>/</span>
                <strong>{pageTitle}</strong>
              </div>
              <div className="topbar-actions">
                <span className="local-status">
                  <ShieldCheck size={16} />
                  本地保存
                </span>
                <button
                  className="icon-button"
                  aria-label="切换主题"
                  onClick={() =>
                    togglePreference(
                      "theme",
                      preferences.theme === "dark" ? "light" : "dark",
                    )
                  }
                >
                  {preferences.theme === "dark" ? (
                    <Sun size={20} />
                  ) : (
                    <Moon size={20} />
                  )}
                </button>
                <button
                  className="user-level"
                  onClick={() => navigate("settings")}
                >
                  <GraduationCap size={18} />
                  {completed >= 24 ? "进阶学习中" : "围棋初学者"}
                </button>
              </div>
            </header>
            <main>
              {!ready ? (
                <div className="loading">
                  <SpinnerGap className="spin" size={30} />
                  正在读取本机记录…
                </div>
              ) : (
                content
              )}
            </main>
            <footer className="main-footer">
              <span>弈间 · 一次一手，慢慢学会。</span>
              <span>
                <LockKey size={13} />
                学习记录留在你的浏览器
              </span>
            </footer>
          </div>
          <nav className="mobile-nav" aria-label="移动端导航">
            {[
              ...navigation,
              { route: "settings", label: "我的", icon: GearSix },
            ].map((item) => (
              <button
                key={item.route}
                className={activeRoute === item.route ? "active" : ""}
                onClick={() => navigate(item.route)}
              >
                <item.icon
                  size={22}
                  weight={activeRoute === item.route ? "fill" : "regular"}
                />
                <span>
                  {item.label
                    .replace("与挑战", "")
                    .replace("路线", "")
                    .replace("开始", "")}
                </span>
              </button>
            ))}
          </nav>
          {toast && (
            <div className="toast" role="status">
              <CheckCircle size={20} />
              {toast}
              <button aria-label="关闭通知" onClick={() => setToast("")}>
                ×
              </button>
            </div>
          )}
          {clearData && (
            <div className="modal-scrim">
              <div className="modal" role="dialog" aria-modal="true">
                <h2>清除本机学习记录？</h2>
                <p>
                  这会删除学习进度、错题和全部棋谱。AI
                  配置保留，请先导出需要的记录。
                </p>
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => setClearData(false)}
                  >
                    取消
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      void clearRecords()
                        .then(() => {
                          setProgress(emptyProgress());
                          setGames([]);
                          setClearData(false);
                          notify("学习记录已清除，AI 配置保留。");
                        })
                        .catch(() => notify("清除失败，请检查浏览器存储。"));
                    }}
                  >
                    确认清除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CoachProvider>
    </AppearanceContext.Provider>
  );
}
