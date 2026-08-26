"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateProgress } from "./progressEngine";
import {
  ReviewItem,
  ReviewLog,
  newReviewItem,
  dueQueue,
  scheduleReview,
  feedback,
} from "./reviewEngine";
import {
  buildDailyReviewPlan,
  exerciseFor,
  isListeningReview,
  ratingForResult,
  reviewDataIssue,
  reviewModuleLabel,
  type ReviewResult,
} from "./reviewQueue";
import {
  startBrowserTranscription,
  SpeechController,
} from "./speechRecognition";
import {
  DailyProgressPoint,
  calculateDailyProgressScore,
  toDailyProgressCandles,
} from "./dailyProgress";
import {
  InboxType,
  VocabularyInboxItem,
  VocabularyMistake,
  dedupeInbox,
  enrichCandidate,
  makeInboxItem,
  normalizeVocabulary,
} from "./vocabularyService";
import {
  currentVocabularySection,
  parseVocabularyCurriculumUpload,
  type VocabularyCurriculum,
  type VocabularyCurriculumProgress,
} from "./vocabularyCurriculumService";
import {
  emptyMastery,
  generateDailyVocabularyPlan,
  type DailyVocabularyPlan,
  type VocabularyDimension,
  type VocabularyMastery,
} from "./vocabularyPlanner";
import { dimensionLabel, promptForDimension } from "./vocabularyEvaluator";
import { generateSupervisorMessage } from "./supervisor";
import { GlobalStudyTimer } from "./GlobalStudyTimer";
import { activeStudySeconds, getTodayStudyTime, timerCategories, type ActiveStudySession, type StudySession as GlobalSession, type TimerCategory } from "./studySessionService";
import {
  aggregateStudyCandles,
  buildDailyStudyCandle,
  formatStudyHours,
  formatStudyHoursAndMinutes,
  studySecondsForDate,
  type DailyStudyCandle,
  type StudyTimeCandle,
} from "./studyTimeChart";
import {
  getDailyQuote,
  getDailyQuoteIndex,
  getNextQuoteIndex,
  getYesterdayStudySeconds,
} from "./dashboardService";
import {
  asScoreSnapshot,
  formatAssessmentMonth,
  getAssessmentForMonth,
  getPreviousAssessment,
  monthFromDateKey,
  monthlySkillKeys,
  type MonthlySkillAssessment,
  type MonthlySkillKey,
} from "./monthlyAssessmentService";
import {
  analyseSpeakingResponse,
  allSpeakingResponses,
  createSpeakingSession,
  fallbackSpeakingTheme,
  getSpeakingPart,
  isSpeakingSessionComplete,
  nextPartThreeQuestion,
  withSpeakingPart,
  type SpeakingResponse,
  type SpeakingSession,
  type SpeakingThemeContext,
} from "./speakingService";
import {
  analyseReadingImages,
  buildThemeContext,
  invalidateReadingAnalysisCache,
  isSuspiciousDuplicate,
  readingAnalysisVersion,
  type ReadingAnalysisOutcome,
  type ThemeContext,
  ReadingPerformance,
} from "./readingAnalysis";
import {
  buildListeningPerformance,
  classifyListeningError,
  evaluateListeningResponse,
  generateListeningPlan,
  listeningErrorLabel,
  type ListeningAnswerMode,
  type ListeningWordResult,
  type GeneratedListeningItem,
  type ListeningErrorType,
  type ListeningPerformance,
  type ListeningSource,
  type ThemeContextInput,
} from "./listeningService";
import {
  advanceCurriculumProgress,
  curriculumCurrentSection,
  curriculumLocation,
  parseCurriculumUpload,
  type CurriculumBook,
  type CurriculumProgress,
} from "./curriculumService";
import {
  currentWritingSection,
  parseWritingCurriculumUpload,
  type WritingCurriculum,
  type WritingCurriculumProgress,
  type WritingStage,
} from "./writingCurriculumService";
import { generateDailyWritingPlan, type DailyWritingPlan } from "./writingGenerator";
import { evaluateWritingStage, type WritingFeedback } from "./writingEvaluator";

type Category =
  | "listening"
  | "reading"
  | "speaking"
  | "writing"
  | "vocabulary"
  | "review"
  | "optional";
type TaskType = "core" | "review" | "optional";
type Task = {
  id: string;
  title: string;
  category: Category;
  description: string;
  targetMinutes: number;
  completed: boolean;
  type: TaskType;
};
type DailyPlan = { date: string; tasks: Task[] };
type StudySession = GlobalSession & { articleId?: string };
type ActiveStudy = ActiveStudySession & { articleId?: string; isRunning?: boolean };
type DailyReview = {
  date: string;
  completed: string;
  problem: string;
  tomorrow: string;
};
type Word = {
  word: string;
  zh: string;
  def: string;
  collocation: string;
  example: string;
  error: string;
  sentence: string;
  due: string;
  sources?: { module: string; context?: string; count: number }[];
  mistakes?: VocabularyMistake[];
};
type ReadingTopic =
  | "Education"
  | "Technology"
  | "Environment"
  | "Society"
  | "Economy"
  | "Culture"
  | "Science"
  | "Health"
  | "Work"
  | "Government"
  | "Other";
type ReadingSource =
  | "Cambridge IELTS"
  | "News"
  | "Academic Article"
  | "AI Generated"
  | "User Imported"
  | "Other";
type HighlightType =
  | "word"
  | "phrase"
  | "sentence"
  | "complex_sentence"
  | "logic"
  | "note";
type ReadingArticle = {
  id: string;
  title: string;
  source: ReadingSource;
  topic: ReadingTopic;
  content: string;
  createdAt: string;
  completedAt?: string;
  status: "in_progress" | "completed" | "failed";
  imageUrls?: string[];
  imageNames?: string[];
  imageFileIds?: string[];
  imageHashes?: string[];
  contentHash?: string;
  mainTopic?: string;
  subTopics?: string[];
  summary?: string;
  concepts?: string[];
  vocabulary?: string[];
  usefulExpressions?: string[];
  arguments?: string[];
  difficulty?: "easy" | "medium" | "hard";
  sourceText?: string;
  aiStatus?: "pending" | "analysing" | "completed" | "failed";
  failedImageIndexes?: number[];
  analysisVersion?: string;
  analysedAt?: string;
  analysisProvider?: string;
  analysisModel?: string;
  sourceTextLength?: number;
  analysisFailureCode?: string;
  analysisFailureReason?: string;
  suspiciousDuplicate?: boolean;
};
type ReadingHighlight = {
  id: string;
  articleId: string;
  type: HighlightType;
  text: string;
  context: string;
  meaning: string;
  note: string;
  logicRole?: string;
  createdAt: string;
};
type ReviewCard = {
  id: string;
  articleId: string;
  type: HighlightType;
  content: string;
  answer: string;
  context: string;
  createdAt: string;
  lastReviewedAt?: string;
  nextReviewAt: string;
  reviewCount: number;
  difficulty: "again" | "hard" | "good" | "easy";
};
type ReadingNote = {
  id: string;
  articleId: string;
  content: string;
  createdAt: string;
};
type WritingMaterial = {
  id: string;
  type:
    | "vocabulary"
    | "phrase"
    | "sentence"
    | "sentence_pattern"
    | "argument"
    | "example"
    | "transition"
    | "paragraph";
  content: string;
  meaning: string;
  topic: ReadingTopic;
  source: string;
  sourceArticleId?: string;
  example: string;
  function?: string;
  masteryLevel?: number;
  reviewCount?: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  createdAt?: string;
};
type ArgumentCard = {
  id: string;
  topic: ReadingTopic;
  position: string;
  claim: string;
  reason: string;
  example: string;
  impact: string;
  keywords: string;
  relatedPhrases: string;
  createdAt: string;
};
type WritingStageState = {
  value: string;
  feedback?: WritingFeedback;
  submittedAt?: string;
  completed?: boolean;
};
type WritingSession = {
  id: string;
  date: string;
  theme: string;
  question: string;
  activeStage: WritingStage;
  stages: Record<WritingStage, WritingStageState>;
};
type ListeningType = GeneratedListeningItem["trainingType"];
type ListeningItem = GeneratedListeningItem;
type ListeningReview = {
  id: string;
  sourceType: string;
  sourceId: string;
  trainingType: ListeningType;
  text: string;
  meaning?: string;
  userAnswer: string;
  correct: boolean;
  rating: "again" | "hard" | "good" | "easy";
  mistakeType: ListeningErrorType | "";
  lastReviewedAt: string;
  nextReviewAt: string;
  reviewCount: number;
  replays: number;
};
type ListeningSession = {
  id: string;
  planId: string;
  date: string;
  theme: string;
  queue: ListeningItem[];
  index: number;
  answers: {
    itemId: string;
    answer: string;
    correct: boolean;
    replays: number;
    mistakeType: ListeningErrorType | "";
    source: ListeningSource;
    wordResult?: ListeningWordResult;
  }[];
  startedAt: string;
  status: "active" | "paused" | "complete";
  currentAnswer: string;
  currentReplays: number;
  checked?: boolean;
  currentWordResult?: ListeningWordResult;
  duration?: number;
};
type ProgressSnapshot = {
  id: string;
  date: string;
  overall: number | null;
  reading: number | null;
  listening: number | null;
  speaking: number | null;
  writing: number | null;
  vocabulary: number | null;
};
type UserProgress = {
  currentLevel: "Unknown" | "A2" | "B1" | "B2" | "C1";
  target: "6.0" | "6.5" | "7.0" | "7.5" | "8.0";
};
type DailyTheme = { date: string; topic: string; subtopic: string };

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const baseWords: Word[] = [
  {
    word: "substantial",
    zh: "大量的；显著的",
    def: "large in amount, value, or importance",
    collocation: "a substantial increase / substantial evidence",
    example:
      "There has been a substantial rise in the number of students studying abroad.",
    error: "曾误写为 substantional",
    sentence:
      "A substantial investment in education can improve social mobility.",
    due: "今天",
  },
  {
    word: "alleviate",
    zh: "缓解；减轻",
    def: "to make pain, problems, or suffering less severe",
    collocation: "alleviate pressure / alleviate poverty",
    example:
      "Better public transport could alleviate traffic congestion in large cities.",
    error: "",
    sentence: "",
    due: "今天",
  },
  {
    word: "inevitable",
    zh: "不可避免的",
    def: "certain to happen and impossible to avoid",
    collocation: "an inevitable consequence",
    example:
      "Some job displacement is an inevitable consequence of automation.",
    error: "",
    sentence: "",
    due: "8月27日",
  },
];
const defaultTasks: Task[] = [
  {
    id: "listening",
    title: "听力训练",
    category: "listening",
    description: "Cambridge 18 · Test 2 · Section 3",
    targetMinutes: 60,
    completed: false,
    type: "core",
  },
  {
    id: "reading",
    title: "阅读训练",
    category: "reading",
    description: "True / False / Not Given",
    targetMinutes: 60,
    completed: false,
    type: "core",
  },
  {
    id: "speaking",
    title: "口语训练",
    category: "speaking",
    description: "Part 1–3 · 语音回答",
    targetMinutes: 45,
    completed: false,
    type: "core",
  },
  {
    id: "writing",
    title: "写作训练",
    category: "writing",
    description: "Task 2 · 提纲练习",
    targetMinutes: 45,
    completed: false,
    type: "core",
  },
  {
    id: "vocabulary",
    title: "单词复习",
    category: "vocabulary",
    description: "到期单词与主动回忆",
    targetMinutes: 30,
    completed: false,
    type: "review",
  },
  {
    id: "mistakes",
    title: "昨日错误复习",
    category: "review",
    description: "回看错题、语法与表达记录",
    targetMinutes: 20,
    completed: false,
    type: "review",
  },
];
function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function formatMinutes(seconds: number) {
  const total = Math.floor(seconds / 60),
    h = Math.floor(total / 60),
    m = total % 60;
  return h ? h + "h " + m + "m" : m + "m";
}
function clock(seconds: number) {
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}
function formatStudyDuration(seconds: number) {
  return seconds > 0 && seconds < 60 ? "<1m" : formatMinutes(seconds);
}
function dateHeading(dateKey: string) {
  if (!dateKey) return "TODAY";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(new Date(`${dateKey}T12:00:00`))
    .toUpperCase();
}
function initialPlan(date: string): DailyPlan {
  return { date, tasks: defaultTasks.map((x) => ({ ...x })) };
}
function automaticTheme(date: string): DailyTheme {
  const themes = [
    ["Tourism", "Local economies and responsible travel"],
    ["Technology", "Digital habits and education"],
    ["Environment", "Cities, transport and sustainable choices"],
    ["Science", "Marine life and adaptation"],
    ["Society", "Population change and urban life"],
    ["Culture", "Heritage, media and identity"],
    ["Health", "Sleep, routines and public health"],
    ["Education", "Access, skills and lifelong learning"],
  ];
  const n =
    date.split("").reduce((a, x) => a + x.charCodeAt(0), 0) % themes.length;
  return { date, topic: themes[n][0], subtopic: themes[n][1] };
}

export default function Home() {
  const [today, setToday] = useState(""),
    planKey = "ielts-plan-" + today,
    reviewKey = "ielts-review-" + today;
  const [route, setRoute] = useState<
      | "home"
      | "words"
      | "speaking"
      | "reading"
      | "listening"
      | "writing"
      | "review"
    >("home"),
    [plan, setPlan] = useState<DailyPlan>(initialPlan("")),
    [sessions, setSessions] = useState<StudySession[]>([]),
    [active, setActive] = useState<ActiveStudy | null>(null),
    [review, setReview] = useState<DailyReview>({
      date: "",
      completed: "",
      problem: "",
      tomorrow: "",
    }),
    [now, setNow] = useState(0),
    [words, setWords] = useState(baseWords),
    [vocabularyCurriculum, setVocabularyCurriculum] = useState<VocabularyCurriculum | null>(null),
    [vocabularyCurriculumProgress, setVocabularyCurriculumProgress] = useState<VocabularyCurriculumProgress | null>(null),
    [dailyVocabularyPlan, setDailyVocabularyPlan] = useState<DailyVocabularyPlan | null>(null),
    [vocabularyMastery, setVocabularyMastery] = useState<Record<string, VocabularyMastery>>({}),
    [word, setWord] = useState(0),
    [reveal, setReveal] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [articles, setArticles] = useState<ReadingArticle[]>([]),
    [highlights, setHighlights] = useState<ReadingHighlight[]>([]),
    [reviewCards, setReviewCards] = useState<ReviewCard[]>([]),
    [readingNotes, setReadingNotes] = useState<ReadingNote[]>([]),
    [writingMaterials, setWritingMaterials] = useState<WritingMaterial[]>([]),
    [argumentsCards, setArgumentsCards] = useState<ArgumentCard[]>([]),
    [writingCurriculum, setWritingCurriculum] = useState<WritingCurriculum | null>(null),
    [writingCurriculumProgress, setWritingCurriculumProgress] = useState<WritingCurriculumProgress | null>(null),
    [dailyWritingPlan, setDailyWritingPlan] = useState<DailyWritingPlan | null>(null),
    [writingSession, setWritingSession] = useState<WritingSession | null>(null),
    [listeningReviews, setListeningReviews] = useState<ListeningReview[]>([]),
    [listeningSession, setListeningSession] = useState<ListeningSession | null>(
      null,
    ),
    [speakingSession, setSpeakingSession] = useState<SpeakingSession | null>(null),
    [speakingHistory, setSpeakingHistory] = useState<SpeakingSession[]>([]),
    [curriculumBook, setCurriculumBook] = useState<CurriculumBook | null>(null),
    [curriculumProgress, setCurriculumProgress] = useState<CurriculumProgress | null>(null),
    [snapshots, setSnapshots] = useState<ProgressSnapshot[]>([]),
    [monthlyAssessments, setMonthlyAssessments] = useState<MonthlySkillAssessment[]>([]),
    [userProgress, setUserProgress] = useState<UserProgress>({
      currentLevel: "B1",
      target: "7.0",
    }),
    [reviewItems, setReviewItems] = useState<ReviewItem[]>([]),
    [reviewLogs, setReviewLogs] = useState<ReviewLog[]>([]),
    [theme, setTheme] = useState<DailyTheme>(automaticTheme("")),
    [dailyProgress, setDailyProgress] = useState<DailyProgressPoint[]>([]),
    [dailyStudyCandles, setDailyStudyCandles] = useState<DailyStudyCandle[]>([]),
    [settlementTimeReached, setSettlementTimeReached] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    setToday(localDate());
    const checkSettlementTime = () => setSettlementTimeReached(new Date().getHours() >= 20);
    checkSettlementTime();
    const timer = window.setInterval(checkSettlementTime, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!today) return;
    setPlan(load(planKey, initialPlan(today)));
    const savedSessions = load<any[]>("ielts-study-sessions", []).map((session) => session.startedAt ? session : ({
      ...session,
      startedAt: session.startTime,
      endedAt: session.endTime,
      pausedDuration: 0,
      status: "completed",
      createdAt: session.startTime || new Date().toISOString(),
    }));
    const savedActive = load<any>("ielts-active-study", null);
    setSessions(savedSessions);
    setActive(savedActive ? (savedActive.startedAt ? savedActive : {
      id: savedActive.id,
      category: timerCategories.includes(savedActive.category) ? savedActive.category : "reading",
      startedAt: savedActive.startTime || new Date().toISOString(),
      duration: 0,
      pausedDuration: savedActive.accumulatedSeconds || 0,
      status: savedActive.isRunning ? "active" : "paused",
      pausedAt: savedActive.isRunning ? undefined : new Date().toISOString(),
      createdAt: savedActive.startTime || new Date().toISOString(),
      date: localDate(new Date(savedActive.startTime || Date.now())),
      isRunning: !!savedActive.isRunning,
      articleId: savedActive.articleId,
    }) : null);
    setReview(
      load(reviewKey, {
        date: today,
        completed: "",
        problem: "",
        tomorrow: "",
      }),
    );
    setWords(load("ielts-words", baseWords));
    setVocabularyCurriculum(load("ielts-vocabulary-curriculum", null));
    setVocabularyCurriculumProgress(load("ielts-vocabulary-curriculum-progress", null));
    setDailyVocabularyPlan(load(`ielts-vocabulary-plan-${today}`, null));
    setVocabularyMastery(load("ielts-vocabulary-mastery", {}));
    setArticles(
      load<ReadingArticle[]>("ielts-reading-articles", []).map((article) =>
        article.analysisVersion === readingAnalysisVersion
          ? article
          : {
              ...article,
              status: "failed" as const,
              aiStatus: "failed" as const,
              title: "分析需要重试",
              mainTopic: undefined,
              subTopics: [],
              summary: undefined,
              concepts: [],
              vocabulary: [],
              usefulExpressions: [],
              arguments: [],
              sourceText: "",
              content: "",
              analysisFailureReason: "旧版按文件名生成的分析已失效；请重新分析当前文章图片。",
            },
      ),
    );
    setHighlights(load("ielts-reading-highlights", []));
    setReviewCards(load("ielts-reading-cards", []));
    setReadingNotes(load("ielts-reading-notes", []));
    setWritingMaterials(load("ielts-writing-materials", []));
    setArgumentsCards(load("ielts-argument-cards", []));
    setWritingCurriculum(load("ielts-writing-curriculum", null));
    setWritingCurriculumProgress(load("ielts-writing-curriculum-progress", null));
    setDailyWritingPlan(load(`ielts-writing-plan-${today}`, null));
    setWritingSession(load(`ielts-writing-session-${today}`, null));
    setListeningReviews(load("ielts-listening-reviews", []));
    setListeningSession(load("ielts-listening-session", null));
    setSpeakingSession(load("ielts-speaking-session", null));
    setSpeakingHistory(load("ielts-speaking-history", []));
    setCurriculumBook(load("ielts-listening-curriculum", null));
    setCurriculumProgress(load("ielts-listening-curriculum-progress", null));
    setSnapshots(load("ielts-progress-snapshots", []));
    setMonthlyAssessments(load("ielts-monthly-skill-assessments", []));
    setUserProgress(
      load("ielts-user-progress", { currentLevel: "B1", target: "7.0" }),
    );
    setReviewItems(load("ielts-review-items", []));
    setReviewLogs(load("ielts-review-logs", []));
    setTheme(load("ielts-theme-" + today, automaticTheme(today)));
    setDailyProgress(load("ielts-daily-progress", []));
    setDailyStudyCandles(load("ielts-daily-study-candles", []));
    setReady(true);
  }, [planKey, reviewKey, today]);
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(planKey, JSON.stringify(plan));
    localStorage.setItem("ielts-study-sessions", JSON.stringify(sessions));
    localStorage.setItem("ielts-active-study", JSON.stringify(active));
    localStorage.setItem(reviewKey, JSON.stringify(review));
    localStorage.setItem("ielts-words", JSON.stringify(words));
    localStorage.setItem("ielts-vocabulary-curriculum", JSON.stringify(vocabularyCurriculum));
    localStorage.setItem("ielts-vocabulary-curriculum-progress", JSON.stringify(vocabularyCurriculumProgress));
    localStorage.setItem(`ielts-vocabulary-plan-${today}`, JSON.stringify(dailyVocabularyPlan));
    localStorage.setItem("ielts-vocabulary-mastery", JSON.stringify(vocabularyMastery));
    localStorage.setItem("ielts-reading-articles", JSON.stringify(articles));
    localStorage.setItem("ielts-reading-cards", JSON.stringify(reviewCards));
    localStorage.setItem(
      "ielts-writing-materials",
      JSON.stringify(writingMaterials),
    );
    localStorage.setItem(
      "ielts-argument-cards",
      JSON.stringify(argumentsCards),
    );
    localStorage.setItem("ielts-writing-curriculum", JSON.stringify(writingCurriculum));
    localStorage.setItem("ielts-writing-curriculum-progress", JSON.stringify(writingCurriculumProgress));
    localStorage.setItem(`ielts-writing-plan-${today}`, JSON.stringify(dailyWritingPlan));
    localStorage.setItem(`ielts-writing-session-${today}`, JSON.stringify(writingSession));
    localStorage.setItem(
      "ielts-listening-reviews",
      JSON.stringify(listeningReviews),
    );
    localStorage.setItem(
      "ielts-listening-session",
      JSON.stringify(listeningSession),
    );
    localStorage.setItem("ielts-speaking-session", JSON.stringify(speakingSession));
    localStorage.setItem("ielts-speaking-history", JSON.stringify(speakingHistory));
    localStorage.setItem("ielts-listening-curriculum", JSON.stringify(curriculumBook));
    localStorage.setItem(
      "ielts-listening-curriculum-progress",
      JSON.stringify(curriculumProgress),
    );
    localStorage.setItem("ielts-progress-snapshots", JSON.stringify(snapshots));
    localStorage.setItem(
      "ielts-monthly-skill-assessments",
      JSON.stringify(monthlyAssessments),
    );
    localStorage.setItem("ielts-user-progress", JSON.stringify(userProgress));
    localStorage.setItem("ielts-review-items", JSON.stringify(reviewItems));
    localStorage.setItem("ielts-review-logs", JSON.stringify(reviewLogs));
    localStorage.setItem("ielts-theme-" + today, JSON.stringify(theme));
    localStorage.setItem("ielts-daily-progress", JSON.stringify(dailyProgress));
    localStorage.setItem("ielts-daily-study-candles", JSON.stringify(dailyStudyCandles));
  }, [
    ready,
    planKey,
    plan,
    sessions,
    active,
    reviewKey,
    review,
    words,
    vocabularyCurriculum,
    vocabularyCurriculumProgress,
    dailyVocabularyPlan,
    vocabularyMastery,
    articles,
    highlights,
    reviewCards,
    writingMaterials,
    argumentsCards,
    writingCurriculum,
    writingCurriculumProgress,
    dailyWritingPlan,
    writingSession,
    listeningReviews,
    listeningSession,
    speakingSession,
    speakingHistory,
    curriculumBook,
    curriculumProgress,
    snapshots,
    monthlyAssessments,
    userProgress,
    reviewItems,
    reviewLogs,
    theme,
    today,
    dailyProgress,
    dailyStudyCandles,
  ]);
  useEffect(() => {
    if (active?.status !== "active") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active?.status]);
  const activeSeconds = activeStudySeconds(active, now || Date.now());
  const todaySessions = useMemo(
    () => sessions.filter((x) => x.date === today),
    [sessions, today],
  );
  const secondsFor = (taskId: string) =>
    todaySessions
      .filter((x) => x.taskId === taskId)
      .reduce((a, x) => a + x.duration, 0) +
    (active?.category === plan.tasks.find((task) => task.id === taskId)?.category ? activeSeconds : 0);
  const pause = () => {
    if (active?.status !== "active") return;
    setActive({
      ...active,
      status: "paused",
      pausedAt: new Date().toISOString(),
      isRunning: false,
    });
  };
  const resume = () => {
    if (active?.status === "paused")
      setActive({
        ...active,
        pausedDuration: active.pausedDuration + Math.max(0, Math.floor((Date.now() - new Date(active.pausedAt || Date.now()).getTime()) / 1000)),
        pausedAt: undefined,
        status: "active",
        isRunning: true,
      });
  };
  const finish = () => {
    if (!active) return;
    const finalSeconds = activeSeconds;
    if (finalSeconds > 0) {
      const end = new Date();
      const session: StudySession = {
        id: active.id,
        category: active.category,
        startedAt: active.startedAt,
        endedAt: end.toISOString(),
        duration: finalSeconds,
        pausedDuration: active.pausedDuration,
        status: "completed",
        createdAt: active.createdAt,
        date: active.date,
        articleId: active.articleId,
      };
      setSessions([...sessions, session]);
      setPlan({
        ...plan,
        tasks: plan.tasks.map((t) =>
          t.category === active.category
            ? { ...t, completed: secondsFor(t.id) >= t.targetMinutes * 60 }
            : t,
        ),
      });
      setNotice("训练已保存，Dashboard 已同步真实学习时间。");
    }
    setActive(null);
    setNow(Date.now());
  };
  const startCategory = (category: TimerCategory) => {
    if (active && active.category !== category) {
      setNotice("请先结束当前计时，再开始另一项训练。");
      return;
    }
    if (active?.status === "paused") {
      resume();
    } else {
      const stamp = new Date();
      setActive({
        id: `study-${Date.now()}`,
        category,
        startedAt: stamp.toISOString(),
        duration: 0,
        pausedDuration: 0,
        status: "active",
        createdAt: stamp.toISOString(),
        date: localDate(stamp),
        isRunning: true,
      });
    }
    setNotice("");
  };
  const startTask = (task: Task, articleId?: string) => {
    if (!timerCategories.includes(task.category as TimerCategory)) {
      setNotice("全局计时器仅记录阅读、听力、口语和写作。");
      return;
    }
    startCategory(task.category as TimerCategory);
    setRoute(
      task.category === "vocabulary"
        ? "words"
        : task.category === "reading"
          ? "reading"
          : task.category === "listening"
            ? "listening"
            : task.category === "writing"
              ? "writing"
              : task.category === "speaking"
                ? "speaking"
              : task.category === "review"
                ? "review"
                : "home",
    );
  };
  const updateTask = (
    id: string,
    field: keyof Task,
    value: string | number | boolean,
  ) =>
    setPlan({
      ...plan,
      tasks: plan.tasks.map((t) =>
        t.id === id ? { ...t, [field]: value } : t,
      ),
    });
  const addOptional = () => {
    const id = "optional-" + Date.now();
    setPlan({
      ...plan,
      tasks: [
        ...plan.tasks,
        {
          id,
          title: "自定义训练",
          category: "optional",
          description: "例如：Shadowing / 英语视频",
          targetMinutes: 20,
          completed: false,
          type: "optional",
        },
      ],
    });
    setEditing(id);
  };
  const deleteOptional = (id: string) =>
    setPlan({ ...plan, tasks: plan.tasks.filter((t) => t.id !== id) });
  const rate = (mode: string, dimension: VocabularyDimension = "meaningRecognition", targetWord?: string) => {
    const days = mode === "again" ? 1 : mode === "good" ? 3 : 7;
    const activeWord = targetWord ? words.find((item) => normalizeVocabulary(item.word) === normalizeVocabulary(targetWord)) : words[word];
    if (activeWord) setVocabularyMastery((previous) => {
      const current = previous[normalizeVocabulary(activeWord.word)] || emptyMastery();
      const nextValue = mode === "again" ? Math.max(0, current[dimension] - 1) : Math.min(5, current[dimension] + (mode === "easy" ? 2 : 1));
      return { ...previous, [normalizeVocabulary(activeWord.word)]: { ...current, [dimension]: nextValue } };
    });
    setWords(
      words.map((x) => (activeWord && normalizeVocabulary(x.word) === normalizeVocabulary(activeWord.word) ? { ...x, due: "+" + days + " 天" } : x)),
    );
    setWord((word + 1) % words.length);
    setReveal(false);
  };
  const mastery = useMemo(
    () =>
      calculateProgress({
        articles,
        highlights,
        cards: reviewCards,
        listeningReviews,
        writingMaterials,
        argumentCards: argumentsCards,
        words,
        sessions,
      }),
    [
      articles,
      highlights,
      reviewCards,
      listeningReviews,
      writingMaterials,
      argumentsCards,
      words,
      sessions,
    ],
  );
  useEffect(() => {
    if (!ready || !today) return;
    const dates = new Set(
      sessions
        .filter((session) => (timerCategories as readonly string[]).includes(session.category))
        .map((session) => session.date)
        .filter((date) => date < today || (date === today && settlementTimeReached)),
    );
    if (settlementTimeReached) dates.add(today);
    if (!dates.size) return;
    setDailyStudyCandles((previous) => {
      const next = [...previous];
      [...dates]
        .sort((a, b) => a.localeCompare(b))
        .forEach((date) => {
          if (next.some((candle) => candle.date === date)) return;
          const previousClose = next
            .filter((candle) => candle.date < date)
            .sort((a, b) => a.date.localeCompare(b.date))
            .at(-1)?.close ?? 0;
          const settledAt = new Date(`${date}T20:00:00`).toISOString();
          next.push(buildDailyStudyCandle({
            date,
            sessions,
            previousClose,
            active: date === today ? active : null,
            settledAt,
          }));
        });
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
  }, [ready, today, settlementTimeReached, sessions, active]);
  useEffect(() => {
    if (!ready) return;
    const existing = new Set(
      reviewItems.map(
        (x) => x.sourceModule + ":" + x.sourceId + ":" + x.reviewType,
      ),
    );
    const next: ReviewItem[] = [];
    const add = (item: ReviewItem) => {
      const key =
        item.sourceModule + ":" + item.sourceId + ":" + item.reviewType;
      if (!existing.has(key)) {
        existing.add(key);
        next.push(item);
      }
    };
    words.forEach((w) =>
      add(
        newReviewItem({
          id: "vocab-" + w.word,
          parentEntityId: "word-" + w.word.toLowerCase(),
          sourceModule: "vocabulary",
          sourceId: w.word,
          skill: "recall",
          reviewType: "meaning_recall",
          prompt: w.zh || `Recall the meaning of ${w.word}`,
          answer: w.word,
          context: w.example,
          sourceWordId: w.word.toLowerCase(),
          sourceDefinition: w.zh,
          sourceExample: w.example,
          debugSource: { sourceId: w.word, sourceType: "vocabulary-word" },
          difficultyLevel: 2,
          masteryStage: 2,
        }),
      ),
    );
    reviewCards.forEach((c) =>
      add(
        newReviewItem({
          id: "reading-" + c.id,
          parentEntityId: "article-" + c.articleId,
          sourceModule: "reading",
          sourceId: c.id,
          skill: c.type === "logic" ? "logic" : "recall",
          reviewType: "reading_recall",
          prompt: c.content,
          answer: c.answer,
          context: c.context,
          sourceExample: c.context,
          debugSource: { sourceId: c.id, sourceType: "reading-card" },
          difficultyLevel: 2,
          masteryStage: 2,
        }),
      ),
    );
    listeningReviews.forEach((l) =>
      add(
        newReviewItem({
          id: "listen-" + l.id,
          parentEntityId: "listen-source-" + l.sourceId,
          sourceModule: "listening",
          sourceId: l.id,
          skill: "listening",
          reviewType: l.trainingType,
          prompt: "听音识别：点击播放，写下你听到的词或短语。",
          answer: l.text,
          context: "Listening source: " + l.sourceType,
          sourceDefinition: l.meaning,
          sourceExample: l.text,
          audioText: l.text,
          debugSource: { sourceId: l.id, sourceType: "listening-review" },
          difficultyLevel: 2,
          masteryStage: 2,
        }),
      ),
    );
    writingMaterials.forEach((m) =>
      add(
        newReviewItem({
          id: "writing-" + m.id,
          parentEntityId: "writing-" + m.content.toLowerCase(),
          sourceModule: "writing",
          sourceId: m.id,
          skill: "production",
          reviewType: m.type,
          prompt: m.meaning || `Produce this ${m.type}`,
          answer: m.content,
          context: m.example,
          sourceExample: m.example,
          debugSource: { sourceId: m.id, sourceType: "writing-material" },
          difficultyLevel: 3,
          masteryStage: 3,
        }),
      ),
    );
    if (next.length) setReviewItems([...reviewItems, ...next]);
  }, [
    ready,
    words,
    reviewCards,
    listeningReviews,
    writingMaterials,
    reviewItems,
  ]);
  const readingTask = plan.tasks.find((x) => x.category === "reading")!;
  const addWord = (highlight: ReadingHighlight) => {
    if (
      words.some((x) => x.word.toLowerCase() === highlight.text.toLowerCase())
    )
      return;
    setWords([
      {
        word: highlight.text,
        zh: highlight.meaning,
        def: "",
        collocation: "",
        example: highlight.context,
        error: "",
        sentence: "",
        due: "今天",
      },
      ...words,
    ]);
  };
  return (
    <main className="app">
      <aside>
        <div className="brand">
          <i>i</i>
          <b>
            IELTS<em>7+</em>
          </b>
        </div>
        <p className="system">个人训练系统</p>
        <nav>
          <button
            className={route === "home" ? "active" : ""}
            onClick={() => setRoute("home")}
          >
            <i>◫</i>概览
          </button>
          <button
            className={route === "reading" ? "active" : ""}
            onClick={() => setRoute("reading")}
          >
            <i>≡</i>阅读训练
          </button>
          <button
            className={route === "listening" ? "active" : ""}
            onClick={() => setRoute("listening")}
          >
            <i>◔</i>听力训练
          </button>
          <button
            className={route === "speaking" ? "active" : ""}
            onClick={() => setRoute("speaking")}
          >
            <i>◌</i>口语训练
          </button>
          <button
            className={route === "writing" ? "active" : ""}
            onClick={() => setRoute("writing")}
          >
            <i>✎</i>写作训练
          </button>
          <button
            className={route === "words" ? "active" : ""}
            onClick={() => setRoute("words")}
          >
            <i>Aa</i>单词系统
          </button>
          <button
            className={route === "review" ? "active" : ""}
            onClick={() => setRoute("review")}
          >
            <i>↺</i>复习中心
          </button>
        </nav>
        <footer>
          <p>CURRENT TARGET</p>
          <b>IELTS {userProgress.target}</b>
          <small>Current estimate: {userProgress.currentLevel}</small>
        </footer>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">{dateHeading(today)}</p>
            {route !== "home" && <h1>
              {route === "words"
                  ? "用得出的词，才是你的词。"
                  : route === "reading"
                    ? "读过的东西，留下来。"
                    : route === "listening"
                      ? "以前听不出来的，现在能听出来。"
                      : route === "speaking"
                        ? "先开口，再把话说完整。"
                      : route === "writing"
                        ? "从材料，到可调用的观点。"
                        : route === "review"
                          ? "先提取，再反馈，再留到长期记忆。"
                          : "专注这一段训练。"}
            </h1>}
          </div>
          <button className="avatar" onClick={() => setRoute("home")}>
            L
          </button>
        </header>
        {route === "home" && (
          <Dashboard
            plan={plan}
            sessions={todaySessions}
            allSessions={sessions}
            active={active}
            activeSeconds={activeSeconds}
            start={startTask}
            pause={pause}
            resume={resume}
            finish={finish}
            edit={editing}
            setEdit={setEditing}
            update={updateTask}
            addOptional={addOptional}
            deleteOptional={deleteOptional}
            review={review}
            setReview={setReview}
            notice={notice}
            mastery={mastery}
            snapshots={snapshots}
            monthlyAssessments={monthlyAssessments}
            saveMonthlyAssessment={(assessment) =>
              setMonthlyAssessments((previous) =>
                previous.some((item) => item.month === assessment.month)
                  ? previous
                  : [...previous, assessment],
              )
            }
            userProgress={userProgress}
            setUserProgress={setUserProgress}
            articles={articles}
            highlights={highlights}
            cards={reviewCards}
            listeningReviews={listeningReviews}
            writingMaterials={writingMaterials}
            argumentCards={argumentsCards}
            words={words}
            theme={theme}
            dailyProgress={dailyProgress}
            dailyStudyCandles={dailyStudyCandles}
          />
        )}
        {route === "reading" && (
          <Reading
            articles={articles}
            setArticles={setArticles}
            cards={reviewCards}
            setCards={setReviewCards}
            materials={writingMaterials}
            setMaterials={setWritingMaterials}
            task={readingTask}
            active={active}
            seconds={activeSeconds}
            start={startTask}
            pause={pause}
            finish={finish}
            theme={theme}
            setTheme={setTheme}
          />
        )}
        {route === "listening" && (
          <Listening
            words={words}
            highlights={highlights}
            materials={writingMaterials}
            task={plan.tasks.find((x) => x.category === "listening")!}
            active={active}
            seconds={activeSeconds}
            start={startTask}
            pause={pause}
            finish={finish}
            reviews={listeningReviews}
            setReviews={setListeningReviews}
            persistedSession={listeningSession}
            setPersistedSession={setListeningSession}
            date={today}
            theme={theme}
            curriculumBook={curriculumBook}
            setCurriculumBook={setCurriculumBook}
            curriculumProgress={curriculumProgress}
            setCurriculumProgress={setCurriculumProgress}
          />
        )}
        {route === "writing" && (
          <Writing
            date={today}
            fallbackTheme={theme}
            materials={writingMaterials}
            setMaterials={setWritingMaterials}
            argumentsCards={argumentsCards}
            setArgumentsCards={setArgumentsCards}
            words={words}
            curriculum={writingCurriculum}
            setCurriculum={setWritingCurriculum}
            curriculumProgress={writingCurriculumProgress}
            setCurriculumProgress={setWritingCurriculumProgress}
            plan={dailyWritingPlan}
            setPlan={setDailyWritingPlan}
            session={writingSession}
            setSession={setWritingSession}
            reviewItems={reviewItems}
            setReviewItems={setReviewItems}
            task={plan.tasks.find((x) => x.category === "writing")!}
            active={active}
            seconds={activeSeconds}
            start={startTask}
            pause={pause}
            finish={finish}
          />
        )}
        {route === "speaking" && (
          <Speaking
            date={today}
            fallbackTheme={theme}
            words={words}
            highlights={highlights}
            materials={writingMaterials}
            argumentsCards={argumentsCards}
            session={speakingSession}
            setSession={setSpeakingSession}
            history={speakingHistory}
            setHistory={setSpeakingHistory}
            reviewItems={reviewItems}
            setReviewItems={setReviewItems}
          />
        )}
        {route === "words" && (
          <Words
            all={words}
            setAll={setWords}
            item={words[word]}
            reveal={reveal}
            setReveal={setReveal}
            rate={rate}
            date={today}
            curriculum={vocabularyCurriculum}
            setCurriculum={setVocabularyCurriculum}
            curriculumProgress={vocabularyCurriculumProgress}
            setCurriculumProgress={setVocabularyCurriculumProgress}
            plan={dailyVocabularyPlan}
            setPlan={setDailyVocabularyPlan}
            mastery={vocabularyMastery}
            task={plan.tasks.find((x) => x.category === "vocabulary")}
            active={active}
            seconds={activeSeconds}
            start={startTask}
            pause={pause}
            resume={resume}
            finish={finish}
            theme={theme}
            highlights={highlights}
            listeningReviews={listeningReviews}
            materials={writingMaterials}
            reviewItems={reviewItems}
            setReviewItems={setReviewItems}
          />
        )}
        {route === "review" && (
          <ReviewCenter
            items={reviewItems}
            setItems={setReviewItems}
            logs={reviewLogs}
            setLogs={setReviewLogs}
          />
        )}
      </section>
      <GlobalStudyTimer active={active} seconds={activeSeconds} start={startCategory} pause={pause} resume={resume} finish={finish} />
    </main>
  );
}

function Dashboard(p: {
  plan: DailyPlan;
  sessions: StudySession[];
  allSessions: StudySession[];
  active?: ActiveStudy | null;
  activeSeconds?: number;
  start: (x: Task) => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  edit: string | null;
  setEdit: (x: string | null) => void;
  update: (id: string, f: keyof Task, v: string | number | boolean) => void;
  addOptional: () => void;
  deleteOptional: (id: string) => void;
  review: DailyReview;
  setReview: (x: DailyReview) => void;
  notice: string;
  mastery: ReturnType<typeof calculateProgress>;
  snapshots: ProgressSnapshot[];
  monthlyAssessments?: MonthlySkillAssessment[];
  saveMonthlyAssessment?: (assessment: MonthlySkillAssessment) => void;
  userProgress: UserProgress;
  setUserProgress: (x: UserProgress) => void;
  articles: ReadingArticle[];
  highlights: ReadingHighlight[];
  cards: ReviewCard[];
  listeningReviews: ListeningReview[];
  writingMaterials: WritingMaterial[];
  argumentCards: ArgumentCard[];
  words: Word[];
  theme: DailyTheme;
  dailyProgress: DailyProgressPoint[];
  dailyStudyCandles?: DailyStudyCandle[];
}) {
  const elapsed = (task: Task) =>
    p.sessions
      .filter((x) => x.taskId === task.id)
      .reduce((a, x) => a + x.duration, 0) +
    (p.active?.category === task.category ? (p.activeSeconds || 0) : 0);
  const base = p.plan.tasks.filter((x) => x.type !== "optional"),
    totalTarget = base.reduce((a, x) => a + x.targetMinutes * 60, 0),
    totalSeconds =
      p.sessions.reduce((a, x) => a + x.duration, 0) + (p.activeSeconds || 0),
    completed = p.plan.tasks.filter((x) => x.completed).length,
    pct = p.plan.tasks.length
      ? Math.round((completed / p.plan.tasks.length) * 100)
      : 0;
  const categories: [Category, string][] = [
    ["listening", "Listening"],
    ["reading", "Reading"],
    ["speaking", "Speaking"],
    ["writing", "Writing"],
  ];
  const byType = (type: TaskType, label: string) => (
    <section className="task-group" key={type}>
      <div className="group-head">
        <div>
          <p className="eyebrow">{type.toUpperCase()}</p>
          <h2>{label}</h2>
        </div>
        {type === "optional" && (
          <button className="outline" onClick={p.addOptional}>
            + 添加增量训练
          </button>
        )}
      </div>
      {p.plan.tasks
        .filter((x) => x.type === type)
        .map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            seconds={elapsed(task)}
            isActive={p.active?.taskId === task.id}
            editing={p.edit === task.id}
            edit={() => p.setEdit(task.id)}
            close={() => p.setEdit(null)}
            update={p.update}
            start={() => p.start(task)}
            pause={p.pause}
            resume={p.resume}
            finish={p.finish}
            deleteTask={() => p.deleteOptional(task.id)}
          />
        ))}
    </section>
  );
  return (
    <QuietOverview {...p} />
  );
}
function DailyProgressChart(p: { points: DailyProgressPoint[] }) {
  const [hover, setHover] = useState<
      ReturnType<typeof toDailyProgressCandles>[number] | null
    >(null),
    candles = toDailyProgressCandles(p.points).slice(-14),
    last = candles.at(-1);
  if (!last) return null;
  const width = 720,
    height = 252,
    left = 42,
    right = 14,
    top = 14,
    bottom = 32,
    plotWidth = width - left - right,
    plotHeight = height - top - bottom,
    y = (value: number) => top + ((100 - value) / 99) * plotHeight,
    x = (index: number) => left + ((index + 0.5) * plotWidth) / candles.length,
    body = Math.max(12, Math.min(24, (plotWidth / candles.length) * 0.46)),
    format = (value: number) => Number(value.toFixed(1));
  return (
    <section className="daily-progress">
      <div className="daily-progress-head">
        <div>
          <p className="eyebrow">OVERALL PROGRESS</p>
          <h2>
            {format(last.close)}
            <small> / 100</small>
          </h2>
        </div>
        <span
          className={last.delta > 0 ? "up" : last.delta < 0 ? "down" : "flat"}
        >
          {last.delta > 0 ? "+" : ""}
          {format(last.delta)} today
        </span>
      </div>
      <div className="candle-legend">
        <span>
          <i className="rise" />
          上涨
        </span>
        <span>
          <i className="fall" />
          下跌
        </span>
        <span>
          <i className="flat" />
          横盘
        </span>
        <small>影线：记忆恢复与遗忘波动</small>
      </div>
      <div className="daily-candle-chart">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Daily overall progress candlestick chart"
        >
          {[1, 50, 100].map((value) => (
            <g key={value}>
              <line
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
                className="candle-grid"
              />
              <text x="4" y={y(value) + 3} className="candle-axis">
                {value}
              </text>
            </g>
          ))}
          {candles.map((candle, index) => {
            const trend =
                candle.close > candle.open
                  ? "up"
                  : candle.close < candle.open
                    ? "down"
                    : "flat",
              topBody = Math.min(y(candle.open), y(candle.close)),
              bodyHeight =
                trend === "flat"
                  ? 3
                  : Math.max(9, Math.abs(y(candle.open) - y(candle.close)));
            return (
              <g
                className="candle"
                key={candle.date}
                tabIndex={0}
                onMouseEnter={() => setHover(candle)}
                onFocus={() => setHover(candle)}
              >
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={y(candle.high)}
                  y2={y(candle.low)}
                  className={`candle-wick ${trend}`}
                />
                <rect
                  x={x(index) - body / 2}
                  y={trend === "flat" ? y(candle.close) - 1.5 : topBody}
                  width={body}
                  height={bodyHeight}
                  rx="1"
                  className={`candle-${trend}`}
                />
                <text
                  x={x(index)}
                  y={height - 8}
                  textAnchor="middle"
                  className="candle-date"
                >
                  {candle.date.slice(5).replace("-", "/")}
                </text>
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="progress-tooltip">
            <b>{hover.date}</b>
            <div>
              <span>Open</span>
              <strong>{format(hover.open)}</strong>
              <span>Close</span>
              <strong>{format(hover.close)}</strong>
            </div>
            <div>
              <span>High</span>
              <strong>{format(hover.high)}</strong>
              <span>Low</span>
              <strong>{format(hover.low)}</strong>
            </div>
            <em
              className={
                hover.delta > 0 ? "up" : hover.delta < 0 ? "down" : "flat"
              }
            >
              {hover.delta > 0 ? "+" : ""}
              {format(hover.delta)} today
            </em>
            <small>{hover.insight}</small>
          </div>
        )}
      </div>
      <p className="daily-insight">
        <b>今日判断</b>
        {last.insight}
      </p>
    </section>
  );
}
function ProgressCommand(p: {
  mastery: ReturnType<typeof calculateProgress>;
  snapshots: ProgressSnapshot[];
  userProgress: UserProgress;
  setUserProgress: (x: UserProgress) => void;
  allSessions: StudySession[];
  articles: ReadingArticle[];
  highlights: ReadingHighlight[];
  cards: ReviewCard[];
  listeningReviews: ListeningReview[];
  writingMaterials: WritingMaterial[];
  argumentCards: ArgumentCard[];
  words: Word[];
  plan: DailyPlan;
  start: (x: Task) => void;
  theme: DailyTheme;
  dailyProgress: DailyProgressPoint[];
}) {
  const [selected, setSelected] = useState<
      keyof ReturnType<typeof calculateProgress>["skills"] | null
    >(null),
    [trend, setTrend] = useState<
      "overall" | keyof ReturnType<typeof calculateProgress>["skills"]
    >("overall");
  const skillNames = {
    reading: "Reading",
    listening: "Listening",
    speaking: "Speaking",
    writing: "Writing",
    vocabulary: "Vocabulary",
  } as const;
  const skillKeys = Object.keys(skillNames) as (keyof typeof skillNames)[];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const metric = (date?: string) => !!date && new Date(date) >= cutoff;
  const change = (key: "overall" | keyof typeof skillNames) => {
    const current =
      key === "overall" ? p.mastery.overall : p.mastery.skills[key].score;
    const old = p.snapshots
      .filter((x) => new Date(x.date) >= cutoff && x[key] !== null)
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.[key];
    return current !== null && typeof old === "number" ? current - old : null;
  };
  const valid = skillKeys.filter((k) => p.mastery.skills[k].score !== null);
  const focus = valid.sort((a, b) => {
    const aScore = p.mastery.skills[a].score ?? 101,
      bScore = p.mastery.skills[b].score ?? 101;
    const aChange = change(a) ?? 0,
      bChange = change(b) ?? 0;
    return aScore + aChange * 0.6 - (bScore + bChange * 0.6);
  })[0];
  const focusLabel = focus ? skillNames[focus] : "Build your first data point";
  const focusSuggestion: Record<string, string> = {
    reading: "复习 5 张阅读卡，并完成一篇材料的重点整理。",
    listening: "做 10 个 Sentence Dictation，再复习易错听力项目。",
    speaking: "完成一次回答并在本周保持 5 次练习记录。",
    writing: "完成句型或观点的主动回忆，再保存一段产出。",
    vocabulary: "完成主动回忆与造句，建立可评估的词汇记录。",
  };
  const activeVocabulary = p.words.filter((x) => !!x.sentence.trim()).length,
    masteredPhrases = p.writingMaterials.filter(
      (x) => x.type === "phrase" && (x.reviewCount ?? 0) >= 2,
    ).length,
    patterns = p.writingMaterials.filter(
      (x) => x.type === "sentence_pattern" && (x.reviewCount ?? 0) > 0,
    ).length,
    completedArticles = p.articles.filter(
      (x) => x.status === "completed",
    ).length,
    listeningMastered = p.listeningReviews.filter(
      (x) => (x.rating === "good" || x.rating === "easy") && x.reviewCount >= 2,
    ).length,
    argumentsMastered = p.argumentCards.length;
  const growth = [
    [
      "Active vocabulary",
      activeVocabulary,
      p.words.filter((x) => metric(x.due) && !!x.sentence.trim()).length,
    ],
    [
      "Mastered phrases",
      masteredPhrases,
      p.writingMaterials.filter(
        (x) =>
          x.type === "phrase" &&
          metric(x.lastReviewedAt) &&
          (x.reviewCount ?? 0) >= 2,
      ).length,
    ],
    [
      "Sentence patterns",
      patterns,
      p.writingMaterials.filter(
        (x) =>
          x.type === "sentence_pattern" &&
          metric(x.lastReviewedAt) &&
          (x.reviewCount ?? 0) > 0,
      ).length,
    ],
    [
      "Reading materials",
      completedArticles,
      p.articles.filter(
        (x) => x.status === "completed" && metric(x.completedAt),
      ).length,
    ],
    [
      "Listening items mastered",
      listeningMastered,
      p.listeningReviews.filter(
        (x) =>
          metric(x.lastReviewedAt) &&
          (x.rating === "good" || x.rating === "easy") &&
          x.reviewCount >= 2,
      ).length,
    ],
    [
      "Argument cards",
      argumentsMastered,
      p.argumentCards.filter((x) => metric(x.createdAt)).length,
    ],
  ];
  const last7 = new Date();
  last7.setDate(last7.getDate() - 6);
  const balance = skillKeys.map(
      (k) =>
        [
          k,
          p.allSessions
            .filter((x) => x.category === k && new Date(x.date) >= last7)
            .reduce((a, x) => a + x.duration, 0),
        ] as const,
    ),
    balanceTotal = balance.reduce((a, [, s]) => a + s, 0);
  const points = p.snapshots.filter((x) => x[trend] !== null).slice(-8);
  const currentTrend =
    trend === "overall" ? p.mastery.overall : p.mastery.skills[trend].score;
  const chartPoints = points.map((x) => Number(x[trend]));
  if (
    currentTrend !== null &&
    (!points.length || points[points.length - 1]?.date !== localDate())
  )
    chartPoints.push(currentTrend);
  const events = [
    ...p.articles
      .filter((x) => x.status === "completed" && metric(x.completedAt))
      .map((x) => `Completed reading: ${x.title}`),
    ...p.listeningReviews
      .filter((x) => metric(x.lastReviewedAt) && x.correct)
      .slice(0, 2)
      .map((x) => `Listening recall completed: ${x.trainingType}`),
    ...p.writingMaterials
      .filter((x) => metric(x.lastReviewedAt) && (x.reviewCount ?? 0) > 0)
      .slice(0, 2)
      .map((x) => `Reviewed writing material: ${x.content.slice(0, 34)}`),
  ].slice(0, 4);
  const detail = selected ? p.mastery.skills[selected] : null;
  return <QuietOverview {...p} />;
  /* Retired Overview implementation retained temporarily for source history.
  return (
    <section className="progress-command">
      <div className="journey-grid">
        <article className="journey">
          <p className="eyebrow">IELTS JOURNEY</p>
          <div className="journey-top">
            <div>
              <span>OVERALL MASTERY</span>
              <strong>
                {p.mastery.overall === null ? "—" : p.mastery.overall}
                <small>{p.mastery.overall === null ? "" : "%"}</small>
              </strong>
              <p>Training Progress / Mastery Index</p>
            </div>
            <div className="journey-settings">
              <label>
                Current Estimate
                <select
                  value={p.userProgress.currentLevel}
                  onChange={(e) =>
                    p.setUserProgress({
                      ...p.userProgress,
                      currentLevel: e.target
                        .value as UserProgress["currentLevel"],
                    })
                  }
                >
                  {(["Unknown", "A2", "B1", "B2", "C1"] as const).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Target IELTS
                <select
                  value={p.userProgress.target}
                  onChange={(e) =>
                    p.setUserProgress({
                      ...p.userProgress,
                      target: e.target.value as UserProgress["target"],
                    })
                  }
                >
                  {(["6.0", "6.5", "7.0", "7.5", "8.0"] as const).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="mastery-track">
            <i style={{ width: `${p.mastery.overall ?? 0}%` }} />
          </div>
          <small>
            {p.mastery.overall === null
              ? `还需 ${Math.max(0, 3 - p.mastery.validCount)} 项真实能力数据，才会计算整体指数。`
              : "仅由可验证的回忆、准确率与主动使用构成；学习时长不直接加分。"}
          </small>
        </article>
        <article className="focus">
          <p className="eyebrow">CURRENT FOCUS</p>
          <h2>{focusLabel}</h2>
          {focus ? (
            <>
              <strong>{p.mastery.skills[focus].score}%</strong>
              <p>Suggested today</p>
              <b>{focusSuggestion[focus]}</b>
            </>
          ) : (
            <p>完成第一批可复习内容后，系统会根据真实表现判断重点。</p>
          )}
        </article>
      </div>
      <div className="overview-block">
        <div className="overview-head">
          <div>
            <p className="eyebrow">SKILL PROGRESS</p>
            <h2>五项能力</h2>
          </div>
          <small>点击查看计算依据</small>
        </div>
        <div className="skill-grid">
          {skillKeys.map((key) => {
            const item = p.mastery.skills[key],
              delta = change(key);
            return (
              <button
                className="skill-card"
                key={key}
                onClick={() => setSelected(selected === key ? null : key)}
              >
                <span>{skillNames[key]}</span>
                {item.score === null ? (
                  <strong className="insufficient">Not enough data</strong>
                ) : (
                  <>
                    <strong>{item.score}%</strong>
                    <i>
                      <b style={{ width: item.score + "%" }} />
                    </i>
                    <small>
                      {delta === null
                        ? "→ Building history"
                        : delta > 1
                          ? `↑ +${delta} this month`
                          : delta < -1
                            ? `↓ ${delta} this month`
                            : "→ Stable"}
                    </small>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {detail && selected && (
          <article className="skill-detail">
            <div>
              <p className="eyebrow">
                {skillNames[selected].toUpperCase()} MASTERY
              </p>
              <h3>
                {detail.score ?? "—"}
                {detail.score !== null && "%"}
              </h3>
            </div>
            <button className="icon-btn" onClick={() => setSelected(null)}>
              关闭
            </button>
            {detail.score === null ? (
              <p>{detail.reason}</p>
            ) : (
              <div className="component-list">
                {detail.components.map((x) => (
                  <div key={x.label}>
                    <span>
                      <b>{x.label}</b>
                      <small>{x.detail}</small>
                    </span>
                    <em>
                      {Math.round(x.score)}
                      <small>% · {Math.round(x.weight * 100)}%</small>
                    </em>
                  </div>
                ))}
              </div>
            )}
          </article>
        )}
      </div>
      <div className="overview-split">
        <article className="overview-block trend">
          <div className="overview-head">
            <div>
              <p className="eyebrow">PROGRESS TREND</p>
              <h2>Last 8 Weeks</h2>
            </div>
          </div>
          <div className="trend-tabs">
            {(["overall", ...skillKeys] as const).map((x) => (
              <button
                key={x}
                className={trend === x ? "active" : ""}
                onClick={() => setTrend(x)}
              >
                {x === "overall" ? "Overall" : skillNames[x]}
              </button>
            ))}
          </div>
          {chartPoints.length < 2 ? (
            <div className="empty-history">
              Not enough history yet.
              <br />
              <small>Keep training to build your progress trend.</small>
            </div>
          ) : (
            <TrendLine points={chartPoints} />
          )}
        </article>
        <article className="overview-block balance">
          <div className="overview-head">
            <div>
              <p className="eyebrow">TRAINING BALANCE</p>
              <h2>Recent 7 days</h2>
            </div>
            <small>Effort, not mastery</small>
          </div>
          {balanceTotal ? (
            balance.map(([key, seconds]) => (
              <div className="balance-row" key={key}>
                <span>{skillNames[key]}</span>
                <i>
                  <b style={{ width: (seconds / balanceTotal) * 100 + "%" }} />
                </i>
                <strong>{Math.round((seconds / balanceTotal) * 100)}%</strong>
              </div>
            ))
          ) : (
            <div className="empty-history">
              暂无真实训练时间。
              <br />
              <small>从今天的任务开始计时。</small>
            </div>
          )}
        </article>
      </div>
      <div className="overview-block">
        <div className="overview-head">
          <div>
            <p className="eyebrow">KNOWLEDGE GROWTH</p>
            <h2>知识资产</h2>
          </div>
          <small>近 30 天增加的是实际数量</small>
        </div>
        <div className="growth-grid">
          {growth.map(([label, count, increase]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{count}</strong>
              <small>
                {increase
                  ? `+${increase} this month`
                  : "No new items this month"}
              </small>
            </div>
          ))}
        </div>
      </div>
      <div className="overview-block recent">
        <div className="overview-head">
          <div>
            <p className="eyebrow">RECENT PROGRESS</p>
            <h2>真实记录</h2>
          </div>
        </div>
        {events.length ? (
          <ul>
            {events.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        ) : (
          <div className="empty-history">
            还没有可展示的成长事件。完成、复习或掌握内容后会出现在这里。
          </div>
        )}
      </div>
    </section>
  );
  */
}
function QuietOverview(p: {
  mastery: ReturnType<typeof calculateProgress>;
  snapshots: ProgressSnapshot[];
  monthlyAssessments?: MonthlySkillAssessment[];
  saveMonthlyAssessment?: (assessment: MonthlySkillAssessment) => void;
  allSessions: StudySession[];
  plan: DailyPlan;
  dailyProgress: DailyProgressPoint[];
  dailyStudyCandles?: DailyStudyCandle[];
  active?: ActiveStudy | null;
  activeSeconds?: number;
}) {
  const [quoteIndex, setQuoteIndex] = useState(() =>
    getDailyQuoteIndex(p.plan.date),
  );
  useEffect(() => {
    setQuoteIndex(getDailyQuoteIndex(p.plan.date));
  }, [p.plan.date]);
  const quote = getDailyQuote(quoteIndex);
  const timerStudy = getTodayStudyTime(p.allSessions, p.active || null, p.plan.date);
  const study = {
    total: timerStudy.total,
    rows: (["reading", "listening", "speaking", "writing"] as TimerCategory[]).map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), seconds: timerStudy[key] })),
  };
  const yesterdaySeconds = getYesterdayStudySeconds(p.allSessions, p.plan.date);
  const studyDelta = study.total - yesterdaySeconds;
  return (
    <section className="dashboard-overview">
      <article className="daily-quote">
        <div>
          <p className="eyebrow">今日词</p>
          <h2>{quote.keyword}</h2>
          <blockquote>「{quote.quote}」</blockquote>
          <small>来源 · {quote.source}</small>
        </div>
        <button
          className="quote-dice"
          aria-label="随机更换今日签语"
          onClick={() => setQuoteIndex((index) => getNextQuoteIndex(index))}
        >
          ⚄
        </button>
      </article>

      <section className="dashboard-section today-study">
        <div className="dashboard-heading">
          <p className="eyebrow">TODAY&apos;S STUDY</p>
          <div>
            <h2>{formatStudyDuration(study.total)}</h2>
            {study.total ? (
              <small className={studyDelta < 0 ? "negative" : "positive"}>
                {studyDelta >= 0 ? "+" : ""}
                {formatStudyDuration(Math.abs(studyDelta))} vs yesterday
              </small>
            ) : null}
          </div>
        </div>
        {study.total ? (
          <div className="study-breakdown">
            {study.rows.map((row) => {
              const largest = Math.max(...study.rows.map((item) => item.seconds), 1);
              return (
                <div className="study-row" key={row.key}>
                  <span>{row.label}</span>
                  <i aria-hidden="true">
                    <b style={{ width: `${(row.seconds / largest) * 100}%` }} />
                  </i>
                  <strong>{formatStudyDuration(row.seconds)}</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="dashboard-empty">No sessions yet today.</p>
        )}
      </section>

      <MonthlySkillAssessmentPanel
        month={monthFromDateKey(p.plan.date)}
        assessments={p.monthlyAssessments ?? []}
        onSave={p.saveMonthlyAssessment}
      />

      <StudyHoursChart
        candles={p.dailyStudyCandles ?? []}
        sessions={p.allSessions}
        today={p.plan.date}
        active={p.active || null}
      />
    </section>
  );
}

type MonthlyAssessmentDraft = Record<MonthlySkillKey | "overallEstimate", string> & {
  notes: string;
};

const monthlyAssessmentLabels: Record<MonthlySkillKey | "overallEstimate", string> = {
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
  vocabulary: "Vocabulary",
  overallEstimate: "Overall",
};
const monthlyAssessmentScoreKeys = [
  ...monthlySkillKeys,
  "overallEstimate",
] as const;

function blankMonthlyAssessmentDraft(): MonthlyAssessmentDraft {
  return {
    reading: "",
    listening: "",
    speaking: "",
    writing: "",
    vocabulary: "",
    overallEstimate: "",
    notes: "",
  };
}

function MonthlySkillAssessmentPanel(p: {
  month: string;
  assessments: MonthlySkillAssessment[];
  onSave?: (assessment: MonthlySkillAssessment) => void;
}) {
  const current = getAssessmentForMonth(p.assessments, p.month);
  const previous = getPreviousAssessment(p.assessments, p.month);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<MonthlyAssessmentDraft>(blankMonthlyAssessmentDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    setFormOpen(false);
    setDraft(blankMonthlyAssessmentDraft());
    setError("");
  }, [p.month, current?.id]);

  const score = (key: MonthlySkillKey | "overallEstimate") => current?.[key];
  const delta = (key: MonthlySkillKey | "overallEstimate") => {
    const value = score(key);
    const before = previous?.[key];
    return typeof value === "number" && typeof before === "number"
      ? value - before
      : null;
  };
  const save = () => {
    if (!p.onSave) return;
    const entries = monthlyAssessmentScoreKeys;
    const values = Object.fromEntries(
      entries.map((key) => [key, draft[key].trim() ? Number(draft[key]) : undefined]),
    ) as Record<MonthlySkillKey | "overallEstimate", number | undefined>;
    const invalid = entries.some(
      (key) =>
        draft[key].trim() &&
        (!Number.isFinite(values[key]) || values[key]! < 4 || values[key]! > 9),
    );
    if (invalid) {
      setError("分数请填写 4.0–9.0 之间的 IELTS 分值。");
      return;
    }
    if (!entries.some((key) => typeof values[key] === "number")) {
      setError("请至少填写一项正式测评结果。");
      return;
    }
    p.onSave({
      id: `monthly-assessment-${Date.now()}`,
      month: p.month,
      assessedAt: new Date().toISOString(),
      ...values,
      previousMonth: asScoreSnapshot(previous),
      notes: draft.notes.trim() ? [draft.notes.trim()] : undefined,
    });
  };

  return (
    <section className="dashboard-section monthly-assessment">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">MONTHLY SKILL ASSESSMENT</p>
        </div>
        <small>{formatAssessmentMonth(p.month)}</small>
      </div>
      <div className="monthly-score-list">
        {monthlyAssessmentScoreKeys.map((key) => {
          const change = delta(key);
          return (
            <div key={key}>
              <span>{monthlyAssessmentLabels[key]}</span>
              <strong>{typeof score(key) === "number" ? score(key)!.toFixed(1) : "—"}</strong>
              <em className={change === null || change === 0 ? "flat" : change > 0 ? "positive" : "negative"}>
                {change === null || change === 0
                  ? "—"
                  : `${change > 0 ? "↑ +" : "↓ "}${Math.abs(change).toFixed(1)}`}
              </em>
            </div>
          );
        })}
      </div>
      <div className="monthly-assessment-status">
        {current ? (
          <>
            <p>本月已完成正式能力测评。下一次更新：{nextAssessmentMonth(p.month)}</p>
            <strong>本月已完成</strong>
          </>
        ) : (
          <>
            <p>等待本月能力测评。日常训练只记录学习时长，不自动更新能力分数。</p>
            <button className="outline" onClick={() => setFormOpen(true)}>开始本月测评</button>
          </>
        )}
      </div>
      {formOpen && !current ? (
        <form className="monthly-assessment-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <p>完成正式月度测评后，录入本次 IELTS 分值。此处不会根据训练时长自动估分。</p>
          <div>
            {monthlyAssessmentScoreKeys.map((key) => (
              <label key={key}>
                <span>{monthlyAssessmentLabels[key]}</span>
                <input
                  type="number"
                  min="4"
                  max="9"
                  step="0.5"
                  inputMode="decimal"
                  placeholder="—"
                  value={draft[key]}
                  onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <label className="monthly-notes">
            <span>测评备注（可选）</span>
            <input value={draft.notes} onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))} placeholder="例如：剑桥真题完整模拟" />
          </label>
          {error ? <small className="monthly-error">{error}</small> : null}
          <footer>
            <button type="button" className="outline" onClick={() => setFormOpen(false)}>取消</button>
            <button type="submit" className="primary">保存本月结果</button>
          </footer>
        </form>
      ) : null}
    </section>
  );
}

function nextAssessmentMonth(month: string) {
  const [yearValue, monthValue] = month.split("-").map(Number);
  const nextYear = monthValue === 12 ? yearValue + 1 : yearValue;
  const nextMonth = monthValue === 12 ? 1 : monthValue + 1;
  return `${nextYear}/${String(nextMonth).padStart(2, "0")}`;
}

type ChartRange = "day" | "week";
function StudyHoursChart(p: {
  candles: DailyStudyCandle[];
  sessions: StudySession[];
  today: string;
  active: ActiveStudy | null;
}) {
  const [range, setRange] = useState<ChartRange>("day");
  const [hover, setHover] = useState<StudyTimeCandle | null>(null);
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, scrollLeft: 0 });
  const candles = aggregateStudyCandles(p.candles, range);
  const todayCandle = p.candles.find((candle) => candle.date === p.today);
  const yesterdayCandle = [...p.candles]
    .filter((candle) => candle.date < p.today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const todayHours = todayCandle
    ? todayCandle.close
    : studySecondsForDate(p.sessions, p.today, p.active) / 3600;
  const last = candles.at(-1);
  const summary = range === "day"
    ? {
        title: "TODAY",
        close: todayHours,
        delta: todayHours - (yesterdayCandle?.close ?? 0),
        open: yesterdayCandle?.close ?? 0,
      }
    : {
        title: "THIS WEEK",
        close: last?.close ?? 0,
        delta: last?.changeHours ?? 0,
        open: last?.open ?? 0,
      };
  const changePercent = summary.open ? (summary.delta / summary.open) * 100 : 0;
  const height = 270, top = 16, bottom = 34, plotHeight = height - top - bottom;
  const candleWidth = 16, candleGap = 8, candlePitch = candleWidth + candleGap;
  const chartWidth = Math.max(640, candles.length * candlePitch + 24);
  // This chart is a learning-hours scale, not an adaptive ability-score axis.
  // Keep the current study phase comparable in both daily and weekly views.
  const chartHigh = 4.3;
  const ticks = [4, 3, 2, 1, 0];
  const formatAxisHours = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}h`;
  const y = (value: number) => top + ((chartHigh - value) / chartHigh) * plotHeight;
  const x = (index: number) => 12 + index * candlePitch + candleWidth / 2;
  const endOfWeek = (date: string) => {
    const end = new Date(`${date}T12:00:00`);
    end.setDate(end.getDate() + 6);
    return end.toISOString().slice(0, 10);
  };
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollLeft = viewport.scrollWidth;
  }, [range, candles.length]);
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: viewport.scrollLeft };
    viewport.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || dragRef.current.pointerId !== event.pointerId) return;
    viewport.scrollLeft = dragRef.current.scrollLeft - (event.clientX - dragRef.current.startX);
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) viewportRef.current.releasePointerCapture(event.pointerId);
    dragRef.current.pointerId = -1;
    setDragging(false);
  };
  return (
    <section className="index-chart">
      <div className="index-chart-head">
        <div>
          <p className="eyebrow">{range === "day" ? "STUDY HOURS" : "THIS WEEK"}</p>
          <h2>{formatStudyHours(summary.close)}</h2>
          <b className={summary.delta < 0 ? "negative" : summary.delta > 0 ? "positive" : "flat"}>
            {summary.delta >= 0 ? "+" : ""}{formatStudyHours(summary.delta)} · {summary.delta >= 0 ? "+" : ""}{changePercent.toFixed(1)}%
          </b>
        </div>
        <span>{todayCandle ? "TODAY · SETTLED" : "TODAY · IN PROGRESS"}</span>
      </div>
      <div className="index-candle-frame">
        <div className="study-y-axis" aria-hidden="true">
          {ticks.map((value) => <span key={value} style={{ top: y(value) - 5 }}>{formatAxisHours(value)}</span>)}
        </div>
        <div
          ref={viewportRef}
          className={`study-chart-viewport${dragging ? " is-dragging" : ""}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {candles.length ? <svg viewBox={`0 0 ${chartWidth} ${height}`} style={{ width: chartWidth, height }} role="img" aria-label="学习时长 K 线图">
            {ticks.map((value) => <line key={value} x1="0" x2={chartWidth} y1={y(value)} y2={y(value)} className="index-grid" />)}
            {candles.map((candle, index) => {
              const direction = candle.close > candle.open ? "up" : candle.close < candle.open ? "down" : "flat";
              const topBody = Math.min(y(candle.open), y(candle.close));
              const bodyHeight = direction === "flat" ? 3 : Math.max(8, Math.abs(y(candle.open) - y(candle.close)));
              return (
                <g key={candle.date} className="index-candle" tabIndex={0} onMouseEnter={() => setHover(candle)} onFocus={() => setHover(candle)}>
                  <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} className={`index-wick ${direction}`} />
                  <rect x={x(index) - candleWidth / 2} y={direction === "flat" ? y(candle.close) - 1.5 : topBody} width={candleWidth} height={bodyHeight} rx="1" className={`index-body ${direction}`} />
                  <text x={x(index)} y={height - 9} textAnchor="middle" className="index-date">{range === "day" ? candle.date.slice(5).replace("-", "/") : candle.label}</text>
                </g>
              );
            })}
          </svg> : <p className="study-chart-empty">首根学习时长 K 线会在 20:00 自动生成。</p>}
        </div>
        {hover && (
          <aside className="index-tooltip">
            <b>{hover.range === "week" ? `${hover.date} ~ ${endOfWeek(hover.date)}` : hover.date}</b>
            <div><span>Open</span><strong>{formatStudyHours(hover.open)}</strong><span>High</span><strong>{formatStudyHours(hover.high)}</strong></div>
            <div><span>Low</span><strong>{formatStudyHours(hover.low)}</strong><span>Close</span><strong>{formatStudyHours(hover.close)}</strong></div>
            <em className={hover.changeHours < 0 ? "negative" : hover.changeHours > 0 ? "positive" : "flat"}>{hover.changeHours >= 0 ? "+" : ""}{formatStudyHours(hover.changeHours)} · {hover.changeHours >= 0 ? "+" : ""}{hover.changePercent.toFixed(1)}%</em>
            <small>{hover.range === "day" ? "Study Time" : "This Week"} · {formatStudyHoursAndMinutes(hover.close)}</small>
          </aside>
        )}
      </div>
      <div className="index-chart-footer">
        <div className="index-tabs">
          {(["day", "week"] as ChartRange[]).map((item) => (
            <button key={item} className={range === item ? "active" : ""} onClick={() => { setRange(item); setHover(null); }}>
              {item === "day" ? "日" : "周"}
            </button>
          ))}
        </div>
        <small>{todayCandle ? "20:00 已完成今日学习时长结算" : "20:00 自动结算每日学习时长"}</small>
      </div>
    </section>
  );
}

function LegacyQuietOverview(p: {
  mastery: ReturnType<typeof calculateProgress>;
  userProgress: UserProgress;
  setUserProgress: (x: UserProgress) => void;
  allSessions: StudySession[];
  articles: ReadingArticle[];
  highlights: ReadingHighlight[];
  listeningReviews: ListeningReview[];
  writingMaterials: WritingMaterial[];
  argumentCards: ArgumentCard[];
  words: Word[];
  plan: DailyPlan;
  start: (x: Task) => void;
  theme: DailyTheme;
}) {
  const skills = Object.entries(p.mastery.skills) as [
    keyof ReturnType<typeof calculateProgress>["skills"],
    ReturnType<typeof calculateProgress>["skills"][keyof ReturnType<
      typeof calculateProgress
    >["skills"]],
  ][];
  const next =
      p.plan.tasks.find((x) => !x.completed && x.category !== "optional") ||
      p.plan.tasks[0],
    completed = p.plan.tasks.filter(
      (x) => x.completed && x.category !== "optional",
    ).length;
  const weak = skills
    .filter(([, x]) => x.score !== null)
    .sort((a, b) => (a[1].score ?? 101) - (b[1].score ?? 101))[0]?.[0];
  const names = {
      reading: "Reading",
      listening: "Listening",
      speaking: "Speaking",
      writing: "Writing",
      vocabulary: "Vocabulary",
    } as const,
    supervisorNames = {
      reading: "阅读",
      listening: "听力",
      speaking: "口语",
      writing: "写作",
      vocabulary: "单词",
    } as const;
  const todaySeconds = p.allSessions
    .filter((x) => x.date === p.plan.date)
    .reduce((sum, x) => sum + x.duration, 0);
  const supervisor = generateSupervisorMessage(
    {
      dateKey: p.plan.date,
      todayProgress: Math.round(
        (completed /
          Math.max(
            1,
            p.plan.tasks.filter((x) => x.category !== "optional").length,
          )) *
          100,
      ),
      dailyTheme: p.theme.topic,
      studyTime: todaySeconds,
      weakestSkill: weak ? supervisorNames[weak] : undefined,
      reviewDue: 0,
      recentTrend: "flat",
      dailyDelta: 0,
      completedModules: completed,
      skippedModules: p.plan.tasks.filter(
        (x) => !x.completed && x.category !== "optional",
      ).length,
      nextModule: next?.category,
    },
  );
  useEffect(() => {
    const recentMessages = load<string[]>("ielts-supervisor-messages", []);
    const nextHistory = [supervisor.id, ...recentMessages.filter((x) => x !== supervisor.id)].slice(0, 5);
    localStorage.setItem(
      "ielts-supervisor-messages",
      JSON.stringify(nextHistory),
    );
  }, [supervisor.id]);
  const monday = new Date(`${p.plan.date}T12:00:00`);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = p.allSessions.filter((x) => new Date(x.date) >= monday),
    weekTotal = week.reduce((a, x) => a + x.duration, 0);
  const groups: [string, Category[]][] = [
    ["Reading", ["reading"]],
    ["Listening", ["listening"]],
    ["Speaking", ["speaking"]],
    ["Writing", ["writing"]],
    ["Review", ["vocabulary", "review"]],
  ];
  const phrase = p.writingMaterials.filter(
      (x) => x.type === "phrase" && (x.reviewCount ?? 0) >= 2,
    ).length,
    patterns = p.writingMaterials.filter(
      (x) => x.type === "sentence_pattern" && (x.reviewCount ?? 0) > 0,
    ).length,
    activeWords = p.words.filter((x) => !!x.sentence.trim()).length,
    listening = p.listeningReviews.filter(
      (x) => (x.rating === "good" || x.rating === "easy") && x.reviewCount >= 2,
    ).length,
    articles = p.articles.filter((x) => x.status === "completed").length;
  return (
    <section className="quiet-overview">
      <article className="theme-card">
        <div>
          <p className="eyebrow">TODAY'S THEME</p>
          <h2>{p.theme.topic}</h2>
          <p>{p.theme.subtopic}</p>
          <div className="theme-chain">
            Reading <b>→</b> Listening <b>→</b> Speaking <b>→</b> Writing{" "}
            <b>→</b> Review
          </div>
        </div>
        <div>
          <strong>
            {completed}
            <small> / 5</small>
          </strong>
          <button className="primary" onClick={() => p.start(next)}>
            CONTINUE
          </button>
        </div>
      </article>
      <div className="quiet-row supervisor-row">
        <article className="supervisor">
          <p className="eyebrow">先生</p>
          <h2>{supervisor.headline}</h2>
          <p>{supervisor.message}</p>
          <b>
            下一步：{next.title} · {next.targetMinutes} 分钟
          </b>
        </article>
      </div>
      <article className="quiet-block">
        <div className="overview-head">
          <div>
            <p className="eyebrow">SKILL PROGRESS</p>
            <h2>五项能力</h2>
          </div>
        </div>
        <div className="quiet-skills">
          {skills.map(([key, value]) => (
            <div key={key}>
              <span>{names[key]}</span>
              <strong>{value.score === null ? "—" : value.score + "%"}</strong>
            </div>
          ))}
        </div>
      </article>
      <article className="quiet-block">
        <div className="overview-head">
          <div>
            <p className="eyebrow">KNOWLEDGE GROWTH</p>
            <h2>真正积累的英语资产</h2>
          </div>
        </div>
        <div className="quiet-growth">
          {[
            ["Active Vocabulary", activeWords],
            ["Mastered Phrases", phrase],
            ["Sentence Patterns", patterns],
            ["Listening Items", listening],
            ["Reading Materials", articles],
            ["Argument Cards", p.argumentCards.length],
          ].map(([label, count]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </article>
      <article className="quiet-block">
        <div className="overview-head">
          <div>
            <p className="eyebrow">THIS WEEK</p>
            <h2>{formatMinutes(weekTotal)}</h2>
          </div>
          <small>Effort, not mastery</small>
        </div>
        <div className="week-bars">
          {groups.map(([name, cats]) => {
            const seconds = week
                .filter((x) => cats.includes(x.category))
                .reduce((a, x) => a + x.duration, 0),
              percent = weekTotal ? (seconds / weekTotal) * 100 : 0;
            return (
              <div key={name}>
                <span>{name}</span>
                <i>
                  <b style={{ width: percent + "%" }} />
                </i>
                <strong>{formatMinutes(seconds)}</strong>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
const quietOverviewCss = `.quiet-overview{padding-top:28px}.theme-card{background:#171717;color:#fff;border-radius:12px;padding:24px 27px;display:flex;align-items:end;justify-content:space-between;gap:18px}.theme-card .eyebrow{color:#aaa}.theme-card h2{margin:8px 0 4px;font-size:28px;letter-spacing:-1px}.theme-card p{margin:0;color:#aaa;font-size:12px}.theme-chain{margin-top:18px;font-size:10px;color:#ddd}.theme-chain b{color:#777;padding:0 4px}.theme-card>div:last-child{display:grid;justify-items:end;gap:10px}.theme-card>div:last-child strong{font-size:28px}.theme-card>div:last-child small{font-size:12px;color:#aaa}.quiet-row{display:grid;grid-template-columns:1.4fr .8fr;gap:14px;margin-top:14px}.journey.compact{min-height:0;padding:20px 23px}.journey.compact>div{display:flex;gap:25px;margin:15px 0}.journey.compact span{display:grid;gap:5px;font-size:10px;color:#aaa}.journey.compact span b{font-size:17px;color:#fff}.supervisor,.quiet-block{border:1px solid var(--line);border-radius:12px;background:#fff}.supervisor{padding:19px 21px}.supervisor p{font-size:11px;margin:8px 0;color:#555}.supervisor b{font-size:11px}.quiet-block{margin-top:14px;padding:19px 22px}.quiet-skills{display:grid;grid-template-columns:repeat(5,1fr);margin-top:15px}.quiet-skills div{border-left:1px solid var(--line);padding:2px 13px}.quiet-skills div:first-child{border:0;padding-left:0}.quiet-skills span,.quiet-growth span{display:block;font-size:10px;color:#777}.quiet-skills strong{display:block;margin-top:7px;font-size:22px}.quiet-growth{display:grid;grid-template-columns:repeat(6,1fr);margin-top:15px}.quiet-growth>div{border-left:1px solid var(--line);padding:2px 12px}.quiet-growth>div:first-child{border:0;padding-left:0}.quiet-growth strong{display:block;font-size:22px;margin-top:7px}.week-bars{display:grid;gap:10px;margin-top:15px}.week-bars>div{display:grid;grid-template-columns:68px 1fr 46px;gap:10px;align-items:center;font-size:10px}.week-bars i{height:4px;background:#e7e7e7}.week-bars i b{display:block;height:100%;background:#171717}.week-bars strong{text-align:right;font-weight:500}@media(max-width:700px){.theme-card,.quiet-row{grid-template-columns:1fr;display:grid}.theme-card>div:last-child{justify-items:start}.quiet-skills{grid-template-columns:repeat(3,1fr);gap:14px}.quiet-skills div,.quiet-skills div:first-child{border-left:1px solid var(--line);padding-left:12px}.quiet-growth{grid-template-columns:repeat(3,1fr);gap:14px}.quiet-growth>div,.quiet-growth>div:first-child{border-left:1px solid var(--line);padding-left:12px}}`;
/* Retired cold-start JSX. QuietOverview is the single mounted Overview implementation.
function getOverviewMode(mastery:ReturnType<typeof calculateProgress>,snapshots:ProgressSnapshot[]){return mastery.overall!==null&&snapshots.length>=1?'active-progress':'cold-start' as const}
function ColdStartOverview(p:{mastery:ReturnType<typeof calculateProgress>;snapshots:ProgressSnapshot[];userProgress:UserProgress;setUserProgress:(x:UserProgress)=>void;allSessions:StudySession[];articles:ReadingArticle[];highlights:ReadingHighlight[];cards:ReviewCard[];listeningReviews:ListeningReview[];writingMaterials:WritingMaterial[];argumentCards:ArgumentCard[];words:Word[];plan:DailyPlan;start:(x:Task)=>void}){const totalSeconds=p.allSessions.reduce((a,x)=>a+x.duration,0),sessionCount=p.allSessions.length,completed=p.articles.filter(x=>x.status==='completed').length,knowledge=p.words.length+p.highlights.length+p.writingMaterials.length+p.argumentCards.length+p.listeningReviews.length;const sessions=(c:Category)=>p.allSessions.filter(x=>x.category===c).length;const skills=[['Reading',`${completed} articles completed · ${p.cards.length} review cards`,`Need: ${Math.max(0,1-completed)} article + ${Math.max(0,3-p.cards.length)} review cards`],['Listening',`${sessions('listening')} sessions · ${p.listeningReviews.length} listening items`,`Need: ${Math.max(0,2-sessions('listening'))} more session + ${Math.max(0,5-p.listeningReviews.length)} items`],['Speaking',`${sessions('speaking')} sessions completed`,`Need: ${Math.max(0,2-sessions('speaking'))} retry session`],['Writing',`${sessions('writing')} sessions · ${p.writingMaterials.length} materials`,`Need: ${Math.max(0,1-sessions('writing'))} session + ${Math.max(0,3-p.writingMaterials.length)} materials`],['Vocabulary',`${p.words.length} words collected`,`Need: complete 5 recall reviews`]];const enoughTime=totalSeconds>=5400;const reading=p.plan.tasks.find(x=>x.category==='reading');return <section className="progress-command cold-overview"><style>{overviewCss}</style><div className="cold-journey"><div><p className="eyebrow">IELTS JOURNEY</p><h2>Build your learning baseline.</h2><p>Mastery will unlock after enough training and review data is collected.</p></div><div className="cold-settings"><label>Current Estimate<select value={p.userProgress.currentLevel} onChange={e=>p.setUserProgress({...p.userProgress,currentLevel:e.target.value as UserProgress['currentLevel']})}>{(['Unknown','A2','B1','B2','C1'] as const).map(x=><option key={x}>{x}</option>)}</select></label><label>Target IELTS<select value={p.userProgress.target} onChange={e=>p.setUserProgress({...p.userProgress,target:e.target.value as UserProgress['target']})}>{(['6.0','6.5','7.0','7.5','8.0'] as const).map(x=><option key={x}>{x}</option>)}</select></label></div><div className="cold-stats"><span>Study Time<b>{formatMinutes(totalSeconds)}</b></span><span>Sessions<b>{sessionCount}</b></span><span>Knowledge Items<b>{knowledge}</b></span></div></div><div className="journey-grid"><article className="focus cold-focus"><p className="eyebrow">CURRENT FOCUS</p><h2>Start with Reading</h2><p>Complete one reading session to begin your daily learning flow.</p><ul><li>1 reading session</li><li>1 listening session</li><li>1 writing or speaking session</li><li>5 review items</li></ul>{reading&&<button className="primary" onClick={()=>p.start(reading)}>Start Reading</button>}</article><article className="overview-block cold-trend"><p className="eyebrow">PROGRESS TREND</p><h2>Trend unlocks with history</h2><strong>{p.snapshots.length}<small> / 7 daily snapshots</small></strong><p>Keep training to build your 8-week progress trend.</p></article></div><div className="overview-block"><div className="overview-head"><div><p className="eyebrow">SKILL UNLOCKS</p><h2>你已经建立的训练证据</h2></div><small>完成条件后会显示 Mastery</small></div><div className="unlock-grid">{skills.map(([name,now,need])=><article key={name}><b>{name}</b><span>{now}</span><small>{need}</small></article>)}</div></div><div className="overview-block"><div className="overview-head"><div><p className="eyebrow">{enoughTime?'TRAINING BALANCE':'RECENT ACTIVITY'}</p><h2>{enoughTime?'Recent 7 days':'从真实训练开始'}</h2></div><small>{enoughTime?'Effort, not mastery':`Total study time · ${formatMinutes(totalSeconds)}`}</small></div><div className="activity-list">{(['reading','listening','speaking','writing','vocabulary'] as Category[]).map(x=><span key={x}>{x}<b>{sessions(x)} sessions</b></span>)}</div></div><div className="overview-block"><div className="overview-head"><div><p className="eyebrow">KNOWLEDGE COLLECTED</p><h2>已进入系统的学习资产</h2></div></div><div className="growth-grid">{[['Words',p.words.length],['Phrases',p.highlights.filter(x=>x.type==='phrase').length],['Sentence patterns',p.writingMaterials.filter(x=>x.type==='sentence_pattern').length],['Reading articles',completed],['Listening items',p.listeningReviews.length],['Argument cards',p.argumentCards.length]].map(([name,count])=><div key={String(name)}><span>{name}</span><strong>{count}</strong><small>Collected from real study</small></div>)}</div></div></section>}
function TrendLine(p:{points:number[]}){const max=100,step=100/Math.max(1,p.points.length-1),d=p.points.map((n,i)=>`${i?'L':'M'} ${i*step},${100-n/max*100}`).join(' ');return <div className="trend-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d={d}/>{p.points.map((n,i)=><circle key={i} cx={i*step} cy={100-n} r="2"/>)}</svg><div>{p.points.map((n,i)=><span key={i}>{n}%<small>{i===p.points.length-1?'Now':`W${i+1}`}</small></span>)}</div></div>}
const overviewCss=`
.daily-progress{margin-top:18px;border:1px solid var(--line);border-radius:12px;padding:20px 24px;background:#fff}.daily-progress-head{display:flex;align-items:end;justify-content:space-between}.daily-progress-head h2{margin:5px 0 0;font-size:34px;letter-spacing:-1.5px}.daily-progress-head h2 small{font-size:12px;color:#777;letter-spacing:0}.daily-progress-head>span{font-size:11px}.daily-progress-head .up{color:#171717}.daily-progress-head .down{color:#888}.daily-plot{height:175px;position:relative;border-left:1px solid var(--line);border-bottom:1px solid var(--line);margin:18px 0 12px 30px}.axis{position:absolute;right:calc(100% + 7px);height:100%;display:flex;flex-direction:column;justify-content:space-between;color:#888;font-size:9px}.candles{height:100%;display:flex;align-items:end;justify-content:space-around;gap:5px}.candles button{height:100%;flex:1;position:relative;border:0;background:none;display:flex;align-items:center;justify-content:end;flex-direction:column;padding:0 0 18px;cursor:pointer}.candles i{width:min(14px,60%);background:#171717;display:block}.candles button.down i{background:#fff;border:1px solid #777}.candles button.flat i{background:#aaa;height:4px!important}.candles small{position:absolute;bottom:0;color:#777;font-size:8px}.progress-tooltip{position:absolute;right:10px;top:10px;border:1px solid var(--line);background:#fff;padding:8px;display:grid;gap:3px;font-size:10px}.progress-tooltip span,.progress-tooltip small{color:#777}.daily-insight{margin:0;color:#444;font-size:12px}.empty-progress{color:#777;font-size:12px}.empty-progress p:last-child{margin:7px 0 0}@media(max-width:600px){.daily-progress{padding:18px}.daily-plot{margin-left:24px}.candles small{transform:rotate(-40deg);transform-origin:left}.progress-tooltip{display:none}}
`;
*/
function ReviewCenter(p: {
  items: ReviewItem[];
  setItems: (x: ReviewItem[]) => void;
  logs: ReviewLog[];
  setLogs: (x: ReviewLog[]) => void;
}) {
  const [queue, setQueue] = useState<ReviewItem[] | null>(null),
    [index, setIndex] = useState(0),
    [answer, setAnswer] = useState(""),
    [revealed, setRevealed] = useState(false),
    [recording, setRecording] = useState(false),
    [message, setMessage] = useState(""),
    [started, setStarted] = useState(0),
    [controller, setController] = useState<SpeechController | null>(null),
    [attempts, setAttempts] = useState<Array<{ item: ReviewItem; result: ReviewResult }>>([]);
  const plan = useMemo(() => buildDailyReviewPlan(p.items), [p.items]),
    item = queue?.[index],
    exercise = item ? exerciseFor(item) : null,
    dataIssue = item ? reviewDataIssue(item) : null,
    begin = () => {
      setQueue(plan.items);
      setIndex(0);
      setRevealed(false);
      setAnswer("");
      setAttempts([]);
      setStarted(Date.now());
    },
    voice = () => {
      if (recording) {
        controller?.stop();
        setRecording(false);
        return;
      }
      const c = startBrowserTranscription((text) => {
        setAnswer(text);
        setRecording(false);
        setMessage("已完成转写；查看参考答案后选择结果。");
      }, setMessage);
      if (c) {
        setController(c);
        setRecording(true);
        setMessage("正在听你回答。");
      }
    };
  const playReviewAudio = (replay = false) => {
    if (!item || !isListeningReview(item)) return;
    const text = item.audioText || item.answer;
    if (item.audioUrl) {
      const audio = new Audio(item.audioUrl);
      audio.play().catch((error) => {
        console.error("[Review] audio playback failed", { id: item.id, error });
        setMessage("该题暂时缺少可播放的音频资源。");
      });
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window && text) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-GB";
      utterance.rate = 0.86;
      utterance.onerror = (error) => {
        console.error("[Review] TTS failed", { id: item.id, error });
        setMessage("该题暂时缺少可播放的音频资源。");
      };
      window.speechSynthesis.speak(utterance);
      setMessage(replay ? "正在重播音频。" : "正在播放音频。");
      return;
    }
    console.error("[Review] missing audio resource", { id: item.id, source: item.debugSource || item.sourceId });
    setMessage("该题暂时缺少音频资源。");
  };
  const finishItem = (result: ReviewResult) => {
    if (!item || !queue) return;
    const out = scheduleReview(
      item,
      ratingForResult[result],
      answer,
      Date.now() - started,
      result === "incorrect" ? "Recall Failure" : result === "partial" ? "Partial Recall" : "",
    );
    p.setItems(p.items.map((x) => (x.id === item.id ? out.updated : x)));
    p.setLogs([...p.logs, out.log]);
    setAttempts([...attempts, { item, result }]);
    if (index + 1 >= queue.length) setQueue([]);
    else {
      setIndex(index + 1);
      setRevealed(false);
      setAnswer("");
      setMessage("");
      setStarted(Date.now());
    }
  };
  if (queue?.length === 0)
    {
      const mastered = attempts.filter((x) => x.result === "correct").length,
        needsWork = attempts.length - mastered,
        weak = Object.entries(
          attempts.filter((x) => x.result !== "correct").reduce((all, x) => ({ ...all, [x.item.sourceModule]: (all[x.item.sourceModule] || 0) + 1 }), {} as Record<string, number>),
        ).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([source]) => reviewModuleLabel[source as ReviewItem["sourceModule"]]).join("、");
    return (
      <section className="review-center review-simple review-complete">
        <div className="review-complete-copy">
          <p className="eyebrow">REVIEW COMPLETE</p>
          <h2>今日复习完成</h2>
          <strong>{attempts.length} / {attempts.length}</strong>
          <div><span>掌握 <b>{mastered}</b></span><span>仍需复习 <b>{needsWork}</b></span></div>
          {weak && <p>主要薄弱项：{weak}</p>}
          <p>下次复习已自动安排。</p>
          <button className="primary" onClick={() => setQueue(null)}>
            返回复习中心
          </button>
        </div>
      </section>
    );
    }
  if (item)
    return (
      <section className="review-center review-simple review-training">
        <div className="simple-head">
          <span>
            {index + 1} / {queue.length}
          </span>
          <small>
            剩约 {Math.max(1, Math.ceil((queue.length - index) * 0.75))} 分钟
          </small>
        </div>
        <article className="simple-card">
          <p className="eyebrow">{exercise!.label}</p>
          {dataIssue ? (
            <div className="review-data-error">
              <h2>该复习项数据异常</h2>
              <p>{dataIssue}。此题不会用于正式训练。</p>
              <button className="outline" onClick={() => {
                console.error("[Review] invalid item shown", { id: item.id, issue: dataIssue, source: item.debugSource || item.sourceId });
                if (index + 1 >= queue.length) setQueue([]);
                else { setIndex(index + 1); setStarted(Date.now()); }
              }}>跳过此题</button>
            </div>
          ) : <>
          <h2>{item.prompt}</h2>
          {!revealed ? (
            <>
              <p>{exercise!.instruction}</p>
              {exercise!.requiresAudio && (
                <div className="review-audio-controls">
                  <button className="outline" onClick={() => playReviewAudio(false)}>🔊 播放音频</button>
                  <button className="text-link" onClick={() => playReviewAudio(true)}>重播</button>
                </div>
              )}
              <textarea autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={exercise!.answerHint} />
              <div className="review-actions">
                {exercise!.prefersVoice && <button className="outline" onClick={voice}>{recording ? "停止口述" : "开始口述"}</button>}
                <button className="primary" onClick={() => setRevealed(true)}>查看参考答案</button>
              </div>
              {message && <small>{message}</small>}
            </>
          ) : (
            <>
              <div className="review-answer"><span>参考答案</span><b>{item.answer}</b></div>
              {item.sourceDefinition && <p className="review-source-line">中文：{item.sourceDefinition}</p>}
              {item.sourceExample && <p className="card-context">例句：{item.sourceExample}</p>}
              {!item.sourceExample && item.context && <p className="card-context">来源：{item.context}</p>}
              {answer && <p className="review-response">你的回答：{answer}</p>}
              <p className="review-result-label">这次提取的结果如何？</p>
              <div className="review-result-row">
                <button onClick={() => finishItem("correct")}><b>掌握</b><small>准确回忆</small></button>
                <button onClick={() => finishItem("partial")}><b>部分正确</b><small>稍后再复习</small></button>
                <button onClick={() => finishItem("incorrect")}><b>未掌握</b><small>尽快重现</small></button>
              </div>
            </>
          )}
          </>}
        </article>
      </section>
    );
  return (
    <section className="review-center review-simple review-home">
      <p className="eyebrow">TODAY'S REVIEW</p>
      <h2>今日复习</h2>
      <strong>{plan.items.length}</strong>
      <span>{plan.items.length ? `项待复习 · 预计约 ${plan.estimatedMinutes} 分钟` : "今天暂无到期复习"}</span>
      <p>
        {Object.entries(plan.moduleCounts)
          .filter(([, count]) => count)
          .map(
            ([name, count]) =>
              `${reviewModuleLabel[name as ReviewItem["sourceModule"]]} ${count}`,
          )
          .join(" · ") || "系统会在重要问题到期时自动加入。"}
      </p>
      <button className="primary" disabled={!plan.items.length} onClick={begin}>
        开始复习
      </button>
    </section>
  );
}
function defaultResponse(item: ReviewItem, mode: "fast" | "deep" | "mixed") {
  if (mode === "fast") return "passive";
  if (mode === "deep") return item.skill === "listening" ? "typed" : "voice";
  return item.skill === "speaking" ||
    item.skill === "production" ||
    item.skill === "transfer"
    ? "hybrid"
    : "typed";
}
const cardReviewCss = `.card-flow{max-width:760px;margin:0 auto;padding-top:28px}.flow-head{display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;font-size:11px}.flow-head i{height:4px;background:#e5e5e5}.flow-head i b{display:block;height:100%;background:#171717}.flow-head button{background:none;border:0;font-size:10px;color:#777}.recall-card{border:1px solid var(--line);border-radius:14px;min-height:410px;margin-top:28px;padding:28px;background:#fff;display:flex;flex-direction:column}.recall-card .eyebrow{text-transform:uppercase}.card-body{flex:1;display:grid;align-content:center}.card-body h2{font-size:28px;letter-spacing:-1px;line-height:1.35;max-width:590px}.card-context{color:#777;font-size:13px;line-height:1.6}.card-actions textarea{width:100%;min-height:78px;border:1px solid var(--line);border-radius:7px;padding:10px;margin-bottom:10px;font:inherit}.card-actions>div{display:flex;justify-content:flex-end;gap:8px}.voice{border:1px solid var(--line);background:#fff;border-radius:6px;padding:9px 12px}.voice.on{background:#171717;color:#fff}.your-answer{border-top:1px solid var(--line);padding-top:14px;margin-top:20px;color:#777;font-size:10px}.your-answer b{display:block;color:#171717;font-size:14px;margin-top:4px}.card-back>p{font-size:12px;color:#777}.card-home{max-width:820px;padding-top:30px}.card-stack{position:relative;width:80px;height:70px}.card-stack i{position:absolute;width:65px;height:48px;border:1px solid #777;border-radius:6px;right:0}.card-stack i:nth-child(1){top:0}.card-stack i:nth-child(2){top:8px;right:8px}.card-stack i:nth-child(3){top:16px;right:16px;background:#fff}.mode-switch{display:flex;gap:7px;align-items:center;margin:18px 0}.mode-switch span{font-size:10px;color:#777;margin-right:4px}.mode-switch button{border:1px solid var(--line);background:#fff;padding:6px 10px;border-radius:5px;font-size:10px}.mode-switch button.selected{background:#171717;color:#fff;border-color:#171717}@media(max-width:600px){.card-flow{padding-top:18px}.flow-head{grid-template-columns:auto 1fr auto}.flow-head button{display:none}.recall-card{min-height:420px;margin-top:20px;padding:21px}.card-body h2{font-size:23px}.card-actions>div{flex-wrap:wrap}.card-actions .primary{flex:1}.rating-row{grid-template-columns:1fr 1fr}.card-home{padding-top:20px}}`;
function LegacyReviewCenter(p: {
  items: ReviewItem[];
  setItems: (x: ReviewItem[]) => void;
  logs: ReviewLog[];
  setLogs: (x: ReviewLog[]) => void;
}) {
  const [minutes, setMinutes] = useState(25),
    [queue, setQueue] = useState<ReviewItem[] | null>(null),
    [index, setIndex] = useState(0),
    [answer, setAnswer] = useState(""),
    [started, setStarted] = useState(0),
    [result, setResult] = useState<ReturnType<typeof feedback> | null>(null),
    [ratings, setRatings] = useState<ReviewLog[]>([]);
  const due = dueQueue(p.items, minutes),
    item = queue?.[index],
    recent = p.logs.filter(
      (x) => Date.now() - new Date(x.timestamp).getTime() < 30 * 864e5,
    ),
    retention = recent.length
      ? Math.round(
          (recent.filter((x) => x.correct).length / recent.length) * 100,
        )
      : null;
  const begin = () => {
    setQueue(due);
    setIndex(0);
    setAnswer("");
    setResult(null);
    setRatings([]);
    setStarted(Date.now());
  };
  const check = () => {
    if (!item || !answer.trim()) return;
    setResult(feedback(item, answer));
  };
  const rate = (r: "again" | "hard" | "good" | "easy") => {
    if (!item || !result) return;
    const final = result.correct ? r : "again",
      out = scheduleReview(
        item,
        final,
        answer,
        Date.now() - started,
        result.correct ? "" : "Recall Failure",
      );
    p.setItems(p.items.map((x) => (x.id === item.id ? out.updated : x)));
    p.setLogs([...p.logs, out.log]);
    setRatings([...ratings, out.log]);
    if (index + 1 >= queue!.length) {
      setQueue([]);
    } else {
      setIndex(index + 1);
      setAnswer("");
      setResult(null);
      setStarted(Date.now());
    }
  };
  if (queue?.length === 0)
    return (
      <section className="review-center">
        <style>{reviewCss}</style>
        <div className="review-summary">
          <p className="eyebrow">REVIEW COMPLETE</p>
          <h2>
            {formatMinutes(Math.floor((Date.now() - started) / 1000))} ·{" "}
            {ratings.length} reviewed
          </h2>
          <p>
            Correct {ratings.filter((x) => x.correct).length} · Again{" "}
            {ratings.filter((x) => x.rating === "again").length} · Good / Easy{" "}
            {
              ratings.filter((x) => x.rating === "good" || x.rating === "easy")
                .length
            }
          </p>
          <button className="primary" onClick={() => setQueue(null)}>
            Back to Review Center
          </button>
        </div>
      </section>
    );
  if (item)
    return (
      <section className="review-center">
        <style>{reviewCss}</style>
        <div className="review-session-head">
          <span>
            {index + 1} / {queue.length}
          </span>
          <i>
            <b style={{ width: ((index + 1) / queue.length) * 100 + "%" }} />
          </i>
          <small>
            Estimated remaining{" "}
            {Math.max(1, Math.ceil((queue.length - index) * 0.7))} min
          </small>
        </div>
        <article className="review-card-main">
          <p className="eyebrow">
            {item.sourceModule.toUpperCase()} ·{" "}
            {item.reviewType.replace("_", " ")}
          </p>
          <h2>{item.prompt}</h2>
          <textarea
            autoFocus
            disabled={!!result}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="先尝试回忆并输入答案…"
          />
          {!result ? (
            <button
              className="primary"
              disabled={!answer.trim()}
              onClick={check}
            >
              Check answer
            </button>
          ) : (
            <div
              className={
                "review-feedback " + (result.correct ? "correct" : "wrong")
              }
            >
              <p className="eyebrow">
                {result.correct ? "RECALLED" : "CORRECTIVE FEEDBACK"}
              </p>
              <div>
                <span>
                  Your answer<b>{answer}</b>
                </span>
                <span>
                  Correct answer<b>{item.answer}</b>
                </span>
              </div>
              {result.difference && <p>Problem: {result.difference}</p>}
              <small>{result.example}</small>
              <div className="rating-row">
                {(["again", "hard", "good", "easy"] as const).map((x) => (
                  <button
                    key={x}
                    disabled={!result.correct && x !== "again"}
                    className={x === "again" ? "again" : ""}
                    onClick={() => rate(x)}
                  >
                    <b>{x}</b>
                    <small>
                      {x === "again"
                        ? "没有成功想起"
                        : x === "hard"
                          ? "正确但明显困难"
                          : x === "good"
                            ? "正常努力下正确"
                            : "几乎立即正确"}
                    </small>
                  </button>
                ))}
              </div>
              {!result.correct && (
                <small>答错只能选择 Again；系统会在稍后安排重新学习。</small>
              )}
            </div>
          )}
        </article>
      </section>
    );
  return (
    <section className="review-center">
      <style>{reviewCss}</style>
      <div className="review-hero">
        <div>
          <p className="eyebrow">REVIEW CENTER</p>
          <h2>Memory &amp; Transfer Engine</h2>
          <p>每题先主动提取，再看反馈；FSRS 负责长期安排。</p>
        </div>
        <div>
          <span>Today Due</span>
          <strong>{due.length}</strong>
          <span>Estimated {Math.max(1, Math.ceil(due.length * 0.7))} min</span>
        </div>
      </div>
      <div className="review-options">
        {([10, 25, 45] as const).map((x) => (
          <button
            key={x}
            className={minutes === x ? "selected" : ""}
            onClick={() => setMinutes(x)}
          >
            {x === 10 ? "QUICK" : x === 25 ? "STANDARD" : "DEEP"}
            <small>{x} min</small>
          </button>
        ))}
        <button className="primary" onClick={begin} disabled={!due.length}>
          START REVIEW
        </button>
      </div>
      <div className="review-insights">
        <article>
          <p className="eyebrow">MEMORY HEALTH</p>
          <strong>{retention === null ? "—" : retention + "%"}</strong>
          <span>30 day retention</span>
        </article>
        <article>
          <p className="eyebrow">BACKLOG</p>
          <strong>
            {
              p.items.filter((x) => new Date(x.nextReviewAt) < new Date())
                .length
            }
          </strong>
          <span>Due items, prioritized by FSRS</span>
        </article>
        <article>
          <p className="eyebrow">REVIEW POLICY</p>
          <strong>90%</strong>
          <span>Desired retention</span>
        </article>
      </div>
      <div className="review-mix">
        <p className="eyebrow">TODAY MIX</p>
        {(
          ["vocabulary", "reading", "listening", "writing", "speaking"] as const
        ).map((x) => (
          <div key={x}>
            <span>{x}</span>
            <b>{due.filter((i) => i.sourceModule === x).length}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
const reviewCss = `.review-center{padding-top:32px;max-width:900px}.review-hero{background:#171717;color:#fff;border-radius:12px;padding:27px 30px;display:flex;justify-content:space-between;align-items:end}.review-hero .eyebrow{color:#aaa}.review-hero h2{margin:8px 0;font-size:25px;letter-spacing:-1px}.review-hero p{margin:0;color:#aaa;font-size:12px}.review-hero>div:last-child{display:grid;text-align:right;gap:2px;color:#aaa;font-size:10px}.review-hero strong{font-size:40px;line-height:1;color:#fff}.review-options{display:flex;gap:8px;align-items:center;margin:18px 0}.review-options>button:not(.primary){border:1px solid var(--line);background:#fff;border-radius:6px;padding:8px 12px;font-size:10px}.review-options>button.selected{background:#171717;color:#fff;border-color:#171717}.review-options small{display:block;font-size:9px;color:#888;margin-top:3px}.review-options .primary{margin-left:auto}.review-insights{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:10px;overflow:hidden}.review-insights article{padding:16px;border-right:1px solid var(--line)}.review-insights article:last-child{border:0}.review-insights strong,.review-insights span{display:block}.review-insights strong{font-size:25px;margin:8px 0}.review-insights span{font-size:10px;color:#777}.review-mix{margin-top:20px;border-top:1px solid var(--line);padding-top:16px}.review-mix>div{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px;text-transform:capitalize}.review-session-head{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;font-size:11px}.review-session-head i{height:4px;background:#e5e5e5}.review-session-head i b{display:block;height:100%;background:#171717}.review-session-head small{color:#777}.review-card-main{margin-top:28px;border:1px solid var(--line);border-radius:12px;padding:30px;min-height:380px}.review-card-main h2{font-size:25px;line-height:1.35;max-width:700px;margin:13px 0 28px}.review-card-main textarea{width:100%;min-height:105px;border:1px solid var(--line);border-radius:7px;padding:12px;font:inherit;margin-bottom:12px;resize:vertical}.review-feedback{border-top:1px solid var(--line);margin-top:18px;padding-top:18px}.review-feedback>div{display:grid;grid-template-columns:1fr 1fr;gap:10px}.review-feedback span{border:1px solid var(--line);padding:10px;font-size:10px;color:#777}.review-feedback span b{display:block;color:#171717;font-size:14px;margin-top:5px}.review-feedback>small{display:block;color:#777;margin-top:10px}.rating-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:20px 0 8px}.rating-row button{background:#fff;border:1px solid var(--line);border-radius:6px;padding:9px;text-align:left}.rating-row button:hover:not(:disabled){border-color:#171717}.rating-row button:disabled{opacity:.4}.rating-row b,.rating-row small{display:block}.rating-row small{font-size:9px;color:#777;margin-top:4px;line-height:1.25}.review-summary{border:1px solid var(--line);border-radius:12px;padding:30px}.review-summary h2{margin:8px 0}.review-summary p{color:#777;font-size:12px}@media(max-width:600px){.review-hero{align-items:start;gap:20px;flex-direction:column}.review-hero>div:last-child{text-align:left}.review-options{flex-wrap:wrap}.review-options .primary{margin-left:0;width:100%}.review-insights{grid-template-columns:1fr}.review-insights article{border-right:0;border-bottom:1px solid var(--line)}.review-feedback>div,.rating-row{grid-template-columns:1fr 1fr}.review-card-main{padding:20px}.review-card-main h2{font-size:21px}}`;
function TaskCard(p: {
  task: Task;
  seconds: number;
  isActive: boolean;
  editing: boolean;
  edit: () => void;
  close: () => void;
  update: (id: string, f: keyof Task, v: string | number | boolean) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  deleteTask: () => void;
}) {
  const reached = p.seconds >= p.task.targetMinutes * 60;
  return (
    <article className={"study-task " + (p.isActive ? "running" : "")}>
      <div className="task-summary">
        <label>
          <input
            type="checkbox"
            checked={p.task.completed}
            onChange={() => {
              if (reached || p.task.completed)
                p.update(p.task.id, "completed", !p.task.completed);
            }}
          />
          <b>{p.task.completed ? "✓" : ""}</b>
        </label>
        <div>
          <strong>{p.task.title}</strong>
          <small>{p.task.description}</small>
        </div>
        <button className="icon-btn" onClick={p.edit}>
          编辑
        </button>
      </div>
      {p.editing ? (
        <div className="task-editor">
          <input
            value={p.task.title}
            onChange={(e) => p.update(p.task.id, "title", e.target.value)}
          />
          <input
            value={p.task.description}
            onChange={(e) => p.update(p.task.id, "description", e.target.value)}
          />
          <label>
            目标{" "}
            <input
              type="number"
              min="5"
              value={p.task.targetMinutes}
              onChange={(e) =>
                p.update(
                  p.task.id,
                  "targetMinutes",
                  Number(e.target.value) || 0,
                )
              }
            />{" "}
            min
          </label>
          <div>
            <button className="outline" onClick={p.close}>
              完成编辑
            </button>
            {p.task.type === "optional" && (
              <button className="text-danger" onClick={p.deleteTask}>
                删除任务
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="task-footer">
          <span>目标：{p.task.targetMinutes} min</span>
          <span>
            已完成：<b>{formatMinutes(p.seconds)}</b>
          </span>
          <div>
            {p.isActive ? (
              <>
                <button className="outline" onClick={p.pause}>
                  暂停
                </button>
                <button className="primary" onClick={p.finish}>
                  结束并保存
                </button>
              </>
            ) : (
              <button className="primary" onClick={p.start}>
                {p.seconds ? "继续训练" : "开始训练"}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
function DashboardRail(p: {
  sessions: StudySession[];
  active: ActiveStudy | null;
  activeSeconds: number;
}) {
  const today = localDate(),
    monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const daily = weekDays.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = localDate(d);
    return p.sessions
      .filter((x) => x.date === key)
      .reduce((a, x) => a + x.duration, 0);
  });
  const weekTotal = daily.reduce((a, x) => a + x, 0);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDate(d);
    const secs = p.sessions
      .filter((x) => x.date === key)
      .reduce((a, x) => a + x.duration, 0);
    if (secs >= 1800) streak++;
    else break;
  }
  const max = Math.max(...daily, 1);
  return (
    <aside className="right">
      <div className="card">
        <p className="eyebrow">STREAK</p>
        <strong>
          {streak} <small>days</small>
        </strong>
        <p>当天累计有效训练满 30 分钟，即计入连续学习。</p>
      </div>
      <div className="card chart">
        <strong>{formatMinutes(weekTotal)}</strong>
        <p className="eyebrow">THIS WEEK</p>
        <h3>学习时长</h3>
        <div>
          {daily.map((seconds, i) => (
            <span key={i}>
              <i
                className={
                  localDate() ===
                  localDate(
                    new Date(
                      monday.getFullYear(),
                      monday.getMonth(),
                      monday.getDate() + i,
                    ),
                  )
                    ? "today"
                    : ""
                }
                style={{
                  height:
                    String(Math.max(seconds ? 8 : 0, (seconds / max) * 100)) +
                    "%",
                }}
              ></i>
              <small>{weekDays[i]}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="card timer-card">
        <p className="eyebrow">STUDY TIMER</p>
        {p.active ? (
          <>
            <strong>{clock(p.activeSeconds)}</strong>
            <p>正在记录真实学习时间。</p>
          </>
        ) : (
          <>
            <strong>0:00</strong>
            <p>从任意任务点击“开始训练”。</p>
          </>
        )}
      </div>
    </aside>
  );
}
function DailyReviewBox(p: {
  review: DailyReview;
  update: (x: DailyReview) => void;
}) {
  const set = (field: keyof DailyReview, value: string) =>
    p.update({ ...p.review, [field]: value });
  return (
    <section className="daily-review">
      <p className="eyebrow">END-OF-DAY NOTE</p>
      <div>
        <label>
          今天完成了什么？
          <textarea
            value={p.review.completed}
            onChange={(e) => set("completed", e.target.value)}
            placeholder="例如：完成了阅读 Passage 2 和 30 分钟复习。"
          />
        </label>
        <label>
          今天最大的问题？
          <textarea
            value={p.review.problem}
            onChange={(e) => set("problem", e.target.value)}
            placeholder="记录最需要修复的一个问题。"
          />
        </label>
        <label>
          明天第一动作？
          <textarea
            value={p.review.tomorrow}
            onChange={(e) => set("tomorrow", e.target.value)}
            placeholder="写下一个很具体、能立刻开始的动作。"
          />
        </label>
      </div>
      <small>自动按日期保存在本设备。</small>
    </section>
  );
}
function Speaking(p: {
  date: string;
  fallbackTheme: DailyTheme;
  words: Word[];
  highlights: ReadingHighlight[];
  materials: WritingMaterial[];
  argumentsCards: ArgumentCard[];
  session: SpeakingSession | null;
  setSession: (session: SpeakingSession | null) => void;
  history: SpeakingSession[];
  setHistory: (sessions: SpeakingSession[]) => void;
  reviewItems: ReviewItem[];
  setReviewItems: (items: ReviewItem[]) => void;
}) {
  const [theme, setTheme] = useState<SpeakingThemeContext | null>(null);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [controller, setController] = useState<SpeechController | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackAnswer, setFallbackAnswer] = useState("");
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [preparationSeconds, setPreparationSeconds] = useState(60);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!p.date) return;
    const stored = localStorage.getItem(`ielts-theme-context-${p.date}`);
    let fromReading: SpeakingThemeContext | null = null;
    try {
      fromReading = stored ? JSON.parse(stored) as SpeakingThemeContext : null;
    } catch {
      fromReading = null;
    }
    const fallback = fallbackSpeakingTheme(
      `${p.date}:${p.words.map((word) => word.word).join("-")}`,
      p.fallbackTheme.topic,
    );
    setTheme(fromReading ?? {
      ...fallback,
      vocabulary: [
        ...p.highlights
          .filter((highlight) => highlight.type === "word" || highlight.type === "phrase")
          .map((highlight) => highlight.text),
        ...p.words.map((word) => word.word),
      ].slice(0, 8),
      usefulExpressions: p.materials.slice(0, 4).map((material) => material.content),
      arguments: p.argumentsCards.slice(0, 3).map((card) => card.claim),
    });
    setThemeLoaded(true);
  }, [p.date, p.fallbackTheme.topic, p.words, p.highlights, p.materials, p.argumentsCards]);

  useEffect(() => {
    if (!themeLoaded || !theme || !p.date) return;
    if (!p.session || p.session.date !== p.date || !("activePart" in p.session)) {
      p.setSession(createSpeakingSession(p.date, theme));
    }
  }, [p.date, p.session, p.setSession, theme, themeLoaded]);

  useEffect(() => {
    if (!p.session || getSpeakingPart(p.session).status !== "recording" || !recordingStartedAt) return;
    const update = () => setRecordingSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [p.session, recordingStartedAt]);

  useEffect(() => {
    if (!p.session) return;
    const activeProgress = getSpeakingPart(p.session);
    if (activeProgress.status !== "preparing" || !activeProgress.preparationEndsAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((activeProgress.preparationEndsAt! - Date.now()) / 1000));
      setPreparationSeconds(remaining);
      if (!remaining) p.setSession(withSpeakingPart(p.session!, p.session!.activePart, { ...activeProgress, status: "ready", preparationEndsAt: undefined }));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [p.session, p.setSession]);

  const saveReviewEvidence = (completed: SpeakingSession) => {
    const additions: ReviewItem[] = [];
    allSpeakingResponses(completed).forEach((response) => {
      const analysis = response.analysis;
      if (analysis?.repeatedExpressions?.includes("i think")) {
        additions.push(newReviewItem({
          id: `speaking-expression-${response.id}`,
          parentEntityId: completed.id,
          sourceModule: "speaking",
          sourceId: response.id,
          skill: "speaking",
          reviewType: "expression",
          prompt: "替换口语中的重复表达：I think",
          answer: "From my perspective,",
          context: response.question,
          difficultyLevel: 3,
          masteryStage: 2,
        }));
      }
      if (analysis?.grammarErrors?.length) {
        additions.push(newReviewItem({
          id: `speaking-grammar-${response.id}`,
          parentEntityId: completed.id,
          sourceModule: "speaking",
          sourceId: response.id,
          skill: "speaking",
          reviewType: "grammar",
          prompt: analysis.grammarErrors[0],
          answer: "在下一次回答中用完整句检查主谓一致和比较级。",
          context: response.transcript || response.question,
          difficultyLevel: 3,
          masteryStage: 2,
        }));
      }
    });
    const existing = new Set(p.reviewItems.map((item) => `${item.sourceId}:${item.reviewType}`));
    const unique = additions.filter((item) => !existing.has(`${item.sourceId}:${item.reviewType}`)).slice(0, 3);
    if (unique.length) p.setReviewItems([...p.reviewItems, ...unique]);
  };

  const progress = (updated: SpeakingSession, transcript: string) => {
    const activePart = updated.activePart;
    const current = getSpeakingPart(updated, activePart);
    if (activePart === 1 && current.currentQuestionIndex + 1 < current.questions.length) {
      p.setSession(withSpeakingPart(updated, 1, { ...current, currentQuestionIndex: current.currentQuestionIndex + 1, status: "ready" }));
      return;
    }
    if (activePart === 1) {
      const next = withSpeakingPart(updated, 1, { ...current, status: "completed" });
      p.setSession({ ...next, activePart: 2, part2: { ...next.part2, status: "preparing", preparationEndsAt: Date.now() + 60_000 } });
      return;
    }
    if (activePart === 2) {
      const partTwoComplete = withSpeakingPart(updated, 2, { ...current, status: "completed" });
      const generated = nextPartThreeQuestion({ theme: updated.theme, transcript, questionNumber: 0 });
      const part3 = partTwoComplete.part3.responses.length
        ? partTwoComplete.part3
        : { ...partTwoComplete.part3, questions: [generated], currentQuestionIndex: 0, status: "ready" as const };
      p.setSession({ ...partTwoComplete, activePart: 3, part3 });
      return;
    }
    if (current.currentQuestionIndex + 1 < 2) {
      const questionNumber = current.currentQuestionIndex + 1;
      const nextQuestion = nextPartThreeQuestion({ theme: updated.theme, transcript, questionNumber });
      p.setSession(withSpeakingPart(updated, 3, { ...current, questions: [...current.questions, nextQuestion], currentQuestionIndex: questionNumber, status: "ready" }));
      return;
    }
    const partThreeComplete = withSpeakingPart(updated, 3, { ...current, status: "completed" });
    if (isSpeakingSessionComplete(partThreeComplete)) {
      const completed = { ...partThreeComplete, completedAt: new Date().toISOString() };
      p.setSession(completed);
      if (!p.history.some((session) => session.id === completed.id)) p.setHistory([completed, ...p.history]);
      saveReviewEvidence(completed);
    } else {
      p.setSession(partThreeComplete);
      setNotice("Part 3 已完成；其余 Part 的进度已保留，可随时切换继续。");
    }
  };

  const submitAnswer = (text: string) => {
    if (!p.session || !text.trim()) return;
    const activePart = p.session.activePart;
    const current = getSpeakingPart(p.session, activePart);
    const response: SpeakingResponse = {
      id: `speaking-response-${Date.now()}`,
      sessionId: p.session.id,
      part: activePart,
      question: current.questions[current.currentQuestionIndex],
      transcript: text.trim(),
      duration: Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000)),
      createdAt: new Date().toISOString(),
      analysis: analyseSpeakingResponse(text.trim(), current.questions[current.currentQuestionIndex]),
    };
    const updated = withSpeakingPart(p.session, activePart, { ...current, responses: [...current.responses, response], status: "processing" });
    p.setSession(updated);
    setFallbackAnswer("");
    setFallbackOpen(false);
    setNotice("回答已保存，正在生成下一题。");
    window.setTimeout(() => progress(updated, text.trim()), 350);
  };

  const beginVoice = () => {
    if (!p.session) return;
    const current = getSpeakingPart(p.session);
    if (current.status === "preparing" || current.status === "completed") return;
    const startedAt = Date.now();
    setRecordingStartedAt(startedAt);
    setRecordingSeconds(0);
    const activeSession = withSpeakingPart(p.session, p.session.activePart, { ...current, status: "recording" });
    const nextController = startBrowserTranscription(
      (text) => submitAnswer(text),
      () => {
        p.setSession(withSpeakingPart(activeSession, activeSession.activePart, { ...getSpeakingPart(activeSession), status: "ready" }));
        setFallbackOpen(true);
        setNotice("当前浏览器无法完成语音转写，请输入回答。");
      },
    );
    if (nextController) {
      p.setSession(activeSession);
      setController(nextController);
      setNotice("正在录音，结束后会自动转写。");
    }
  };

  const stopVoice = () => {
    controller?.stop();
    setController(null);
    if (p.session) p.setSession(withSpeakingPart(p.session, p.session.activePart, { ...getSpeakingPart(p.session), status: "processing" }));
    setNotice("正在转写回答。");
  };

  if (!p.session || !theme) return <section className="speaking-page" />;
  const session = p.session;
  const partLabels = ["Part 1", "Part 2", "Part 3"] as const;
  const responses = allSpeakingResponses(session);
  const activeProgress = getSpeakingPart(session);
  const currentQuestion = activeProgress.questions[activeProgress.currentQuestionIndex];
  const totalSeconds = responses.reduce((sum, response) => sum + response.duration, 0);
  const repeatedThink = responses.filter((response) => response.analysis?.repeatedExpressions?.includes("i think")).length;
  const mainProblem = responses.some((response) => response.analysis?.coherenceIssues?.length)
    ? "回答展开不足"
    : responses.some((response) => response.analysis?.grammarErrors?.length)
      ? "句式准确性需要复查"
      : "继续保持完整表达";

  if (isSpeakingSessionComplete(session)) {
    return (
      <section className="speaking-page speaking-summary">
        <p className="eyebrow">SPEAKING SESSION</p>
        <h2>今日口语完成</h2>
        <div className="speaking-summary-stats"><span><b>{formatMinutes(totalSeconds)}</b>练习时长</span><span><b>{responses.length}</b>个问题</span></div>
        <div className="speaking-summary-grid">
          <div><small>主要问题</small><strong>{mainProblem}</strong></div>
          <div><small>重复表达</small><strong>{repeatedThink ? `I think × ${repeatedThink}` : "—"}</strong></div>
          <div><small>建议复用</small><strong>From my perspective</strong></div>
        </div>
        <p>本次回答已保存为月底能力测评的参考证据，不会更新日常 Speaking 分数。</p>
      </section>
    );
  }

  return (
    <section className="speaking-page">
      <div className="speaking-heading">
        <p className="eyebrow">SPEAKING PRACTICE</p>
        <span>今日主题 · {theme.primaryTheme}</span>
      </div>
      <div className="speaking-parts" aria-label="IELTS 口语阶段">
        {partLabels.map((label, index) => {
          const part = (index + 1) as 1 | 2 | 3;
          const progress = getSpeakingPart(session, part);
          return <button key={label} className={session.activePart === part ? "active" : progress.status === "completed" ? "done" : ""} onClick={() => { p.setSession({ ...session, activePart: part }); setFallbackOpen(false); setNotice(""); }}>{label}</button>;
        })}
      </div>
      <article className="speaking-question-card">
        <p className="eyebrow">{session.activePart === 1 ? "PART 1 · PERSONAL QUESTIONS" : session.activePart === 2 ? "PART 2 · CUE CARD" : "PART 3 · DISCUSSION"}</p>
        {session.activePart === 2 ? (
          <>
            <h2>{session.cueCard.prompt}</h2>
            <p>You should say:</p>
            <ul>{session.cueCard.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </>
        ) : <h2>{currentQuestion}</h2>}
        {activeProgress.status === "preparing" ? <div className="speaking-preparation"><span>Preparation · {String(preparationSeconds).padStart(2, "0")} sec</span><button className="primary" onClick={() => p.setSession(withSpeakingPart(session, session.activePart, { ...activeProgress, status: "ready", preparationEndsAt: undefined }))}>开始回答</button></div> : null}
      </article>
      {activeProgress.status === "completed" ? <p className="speaking-processing">本部分已完成；其他 Part 仍可自由切换。</p> : activeProgress.status === "recording" ? (
        <div className="speaking-voice-actions"><p>● 正在录音 · {clock(recordingSeconds)}</p><button className="outline" onClick={stopVoice}>■ 结束回答</button></div>
      ) : activeProgress.status === "processing" ? <p className="speaking-processing">Processing...</p> : (
        <div className="speaking-voice-actions">
          <button className="primary" onClick={beginVoice} disabled={activeProgress.status === "preparing"}>● 开始回答</button>
          {fallbackOpen ? <button className="text-link" onClick={() => { setRecordingStartedAt(Date.now()); setFallbackOpen(true); }}>输入回答</button> : null}
        </div>
      )}
      {fallbackOpen && activeProgress.status !== "recording" && activeProgress.status !== "processing" && activeProgress.status !== "completed" ? <form className="speaking-fallback" onSubmit={(event) => { event.preventDefault(); submitAnswer(fallbackAnswer); }}><label>输入回答（语音不可用时的降级方式）<input autoFocus value={fallbackAnswer} onChange={(event) => setFallbackAnswer(event.target.value)} placeholder="输入你的回答" /></label><button className="outline" disabled={!fallbackAnswer.trim()}>提交回答</button></form> : null}
      {notice ? <p className="speaking-notice">{notice}</p> : null}
    </section>
  );
}
function RetiredWords(p: {
  all: Word[];
  setAll: (x: Word[]) => void;
  item: Word;
  reveal: boolean;
  setReveal: (x: boolean) => void;
  rate: (x: string) => void;
  task: Task | undefined;
  active: ActiveStudy | null;
  seconds: number;
  start: (x: Task) => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
  theme: DailyTheme;
  highlights: ReadingHighlight[];
  listeningReviews: ListeningReview[];
  materials: WritingMaterial[];
  reviewItems: ReviewItem[];
  setReviewItems: (x: ReviewItem[]) => void;
}) {
  const running = p.active?.taskId === p.task?.id,
    [panel, setPanel] = useState<"today" | "mistake" | "inbox" | null>(null),
    [inbox, setInbox] = useState<VocabularyInboxItem[]>([]),
    [mistakes, setMistakes] = useState<VocabularyMistake[]>([]),
    [loaded, setLoaded] = useState(false),
    [quick, setQuick] = useState(""),
    [wrong, setWrong] = useState(""),
    [correct, setCorrect] = useState(""),
    [mistakeType, setMistakeType] = useState(""),
    today = localDate();
  useEffect(() => {
    setInbox(load("ielts-vocabulary-inbox", []));
    setMistakes(load("ielts-vocabulary-mistakes", []));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) {
      localStorage.setItem("ielts-vocabulary-inbox", JSON.stringify(inbox));
      localStorage.setItem(
        "ielts-vocabulary-mistakes",
        JSON.stringify(mistakes),
      );
    }
  }, [loaded, inbox, mistakes]);
  const auto = useMemo(
    () =>
      dedupeInbox([
        ...p.highlights
          .filter((x) => x.type === "word" || x.type === "phrase")
          .map((x) => ({
            id: `reading-${x.id}`,
            type: (x.type === "word" ? "word" : "phrase") as InboxType,
            content: x.text,
            sourceModule: "reading" as const,
            sourceId: x.id,
            context: x.context,
            topic: p.theme.topic,
            createdAt: x.createdAt,
            status: "pending" as const,
            priority: (x.type === "word" ? "high" : "normal") as VocabularyInboxItem["priority"],
          })),
        ...p.listeningReviews
          .filter((x) => !x.correct)
          .map((x) => ({
            id: `listening-${x.id}`,
            type: "mistake" as const,
            content: x.text,
            correctForm: x.text,
            sourceModule: "listening" as const,
            sourceId: x.id,
            context: x.userAnswer,
            topic: p.theme.topic,
            createdAt: x.lastReviewedAt,
            status: "pending" as const,
            priority: "high" as const,
            mistakeType: x.mistakeType || "听力误认",
          })),
        ...p.materials
          .filter((x) =>
            ["vocabulary", "phrase", "sentence_pattern"].includes(x.type),
          )
          .map((x) => ({
            id: `writing-${x.id}`,
            type: (x.type === "vocabulary" ? "word" : "phrase") as InboxType,
            content: x.content,
            sourceModule: "writing" as const,
            sourceId: x.id,
            context: x.example,
            topic: x.topic,
            createdAt: x.createdAt || today,
            status: "pending" as const,
            priority: (x.type === "vocabulary" ? "high" : "normal") as VocabularyInboxItem["priority"],
          })),
      ]),
    [p.highlights, p.listeningReviews, p.materials, p.theme.topic, today],
  );
  const ignored = new Set(
      inbox
        .filter((x) => x.status !== "pending")
        .map((x) => `${x.type}:${normalizeVocabulary(x.content)}`),
    ),
    pending = dedupeInbox([
      ...auto.filter(
        (x) => !ignored.has(`${x.type}:${normalizeVocabulary(x.content)}`),
      ),
      ...inbox.filter((x) => x.status === "pending"),
    ]).slice(0, 20),
    mark = (
      candidate: VocabularyInboxItem,
      status: VocabularyInboxItem["status"],
    ) =>
      setInbox((prev) => {
        const found = prev.find((x) => x.id === candidate.id);
        return found
          ? prev.map((x) => (x.id === candidate.id ? { ...x, status } : x))
          : [...prev, { ...candidate, status }];
      });
  const accept = (candidate: VocabularyInboxItem) => {
    if (candidate.type === "mistake") {
      recordMistake(
        candidate.content,
        candidate.correctForm || "",
        candidate.mistakeType || "其他",
        candidate,
      );
      mark(candidate, "accepted");
      return;
    }
    const normalized = normalizeVocabulary(candidate.content),
      found = p.all.find((x) => normalizeVocabulary(x.word) === normalized),
      source = {
        module: candidate.sourceModule,
        context: candidate.context,
        count: 1,
      };
    if (found)
      p.setAll(
        p.all.map((x) =>
          x === found ? { ...x, sources: [...(x.sources || []), source] } : x,
        ),
      );
    else {
      const data = enrichCandidate(candidate.content);
      p.setAll([
        {
          word: candidate.content,
          zh: data.zh,
          def: data.def,
          collocation: data.collocation,
          example: candidate.context || data.example,
          error: "",
          sentence: "",
          due: "今天",
          sources: [source],
          mistakes: [],
        },
        ...p.all,
      ]);
    }
    mark(candidate, "accepted");
  };
  const recordMistake = (
    wrongForm: string,
    correctForm: string,
    type: string,
    candidate?: VocabularyInboxItem,
  ) => {
    if (!wrongForm.trim()) return;
    const entityKey = normalizeVocabulary(
        (correctForm || wrongForm).split(" ")[0],
      ),
      entry: VocabularyMistake = {
        id: `mistake-${Date.now()}`,
        entityKey,
        wrongForm,
        correctForm,
        mistakeType: type || "其他",
        context: candidate?.context || "",
        sourceModule: candidate?.sourceModule || "manual",
        sourceId: candidate?.sourceId,
        createdAt: new Date().toISOString(),
        reviewCount: 0,
        resolved: false,
      };
    setMistakes((prev) => [entry, ...prev]);
    p.setAll(
      p.all.map((word) =>
        normalizeVocabulary(word.word) === entityKey
          ? {
              ...word,
              error: `${wrongForm}${correctForm ? ` → ${correctForm}` : ""}`,
              mistakes: [entry, ...(word.mistakes || [])],
            }
          : word,
      ),
    );
    if (correctForm.trim())
      p.setReviewItems([
        ...p.reviewItems,
        newReviewItem({
          id: `review-${entry.id}`,
          parentEntityId: entityKey,
          sourceModule: "vocabulary",
          sourceId: entry.id,
          skill: "writing",
          reviewType: "error_repair",
          prompt: `Correct this: ${wrongForm}`,
          answer: correctForm,
          context: `${type || "Vocabulary mistake"} · ${candidate?.context || "Personal error record"}`,
          sourceWordId: entityKey,
          sourceDefinition: wrongForm,
          sourceExample: candidate?.context || "",
          debugSource: { sourceId: entry.id, sourceType: "vocabulary-mistake" },
          difficultyLevel: 2,
          masteryStage: 1,
        }),
      ]);
    setWrong("");
    setCorrect("");
    setMistakeType("");
    setPanel(null);
  };
  const quickAdd = () => {
    if (!quick.trim()) return;
    setInbox((prev) => [
      ...prev,
      makeInboxItem({
        type: quick.trim().includes(" ") ? "phrase" : "word",
        content: quick.trim(),
        sourceModule: "manual",
        context: "Quick add",
        topic: p.theme.topic,
        priority: "normal",
      }),
    ]);
    setQuick("");
  };
  const sourceMix = Object.entries(
    pending.reduce(
      (map, x) => ({
        ...map,
        [x.sourceModule]: (map[x.sourceModule] || 0) + 1,
      }),
      {} as Record<string, number>,
    ),
  );
  return (
    <div className="feature vocabulary-workspace">
      <section>
        <div className="vocab-actions">
          <button className="primary" onClick={() => p.task && p.start(p.task)}>
            开始复习
          </button>
          <button className="outline" onClick={() => setPanel("today")}>
            ＋ 录入今日所学
          </button>
          <button className="outline" onClick={() => setPanel("mistake")}>
            ＋ 记录错误
          </button>
          <button className="inbox-button" onClick={() => setPanel("inbox")}>
            Inbox · {pending.length}
          </button>
        </div>
        {p.task && (
          <div className="inline-timer">
            <div>
              <p className="eyebrow">VOCABULARY SESSION</p>
              <strong>{running ? clock(p.seconds) : "准备复习"}</strong>
            </div>
            {running ? (
              <>
                <button className="outline" onClick={p.pause}>
                  暂停
                </button>
                <button className="primary" onClick={p.finish}>
                  结束
                </button>
              </>
            ) : (
              <button className="outline" onClick={() => p.start(p.task!)}>
                开始计时
              </button>
            )}
          </div>
        )}
        <div className="title">
          <div>
            <p className="eyebrow">SPACED REPETITION</p>
            <h2>
              到期复习{" "}
              <span>{p.all.filter((x) => x.due === "今天").length}</span>
            </h2>
          </div>
          <small>先回忆，再核对答案。</small>
        </div>
        <article className="word">
          <div>
            <span>IELTS CORE</span>
            <small>第 3 轮复习</small>
          </div>
          <h2>{p.item.word}</h2>
          <p className="definition">{p.item.def}</p>
          {p.reveal ? (
            <div className="facts">
              <div>
                <label>中文意思</label>
                <p>{p.item.zh}</p>
              </div>
              <div>
                <label>常用搭配</label>
                <p>{p.item.collocation}</p>
              </div>
              <div>
                <label>雅思例句</label>
                <p>{p.item.example}</p>
              </div>
              {p.item.error && (
                <div className="mistake">
                  <label>我的易错点</label>
                  <p>{p.item.error}</p>
                </div>
              )}
              {p.item.sentence && (
                <div>
                  <label>我的造句</label>
                  <p>{p.item.sentence}</p>
                </div>
              )}
              {p.item.mistakes?.length ? (
                <div className="mistake history">
                  <label>历史错误</label>
                  {p.item.mistakes.slice(0, 3).map((x) => (
                    <p key={x.id}>
                      {x.wrongForm}
                      {x.correctForm ? ` → ${x.correctForm}` : ""} ·{" "}
                      {x.mistakeType}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="recall">
              <label>先在脑中回答</label>
              <p>它的中文意思是什么？你能说出一个常用搭配吗？</p>
              <button className="primary" onClick={() => p.setReveal(true)}>
                显示答案
              </button>
            </div>
          )}
        </article>
        {p.reveal && (
          <div className="rate">
            <span>这次记得如何？</span>
            <button onClick={() => p.rate("again")}>
              忘记了 <small>1天后</small>
            </button>
            <button onClick={() => p.rate("good")}>
              记得 <small>3天后</small>
            </button>
            <button className="primary" onClick={() => p.rate("easy")}>
              很轻松 <small>7天后</small>
            </button>
          </div>
        )}
        <div className="vocab-recent">
          <p className="eyebrow">RECENTLY ADDED</p>
          <span>
            {p.all
              .slice(0, 5)
              .map((x) => x.word)
              .join(" · ")}
          </span>
          {mistakes.length > 0 && (
            <>
              <p className="eyebrow">RECENT MISTAKES</p>
              <span>
                {mistakes
                  .slice(0, 3)
                  .map((x) => `${x.wrongForm} → ${x.correctForm || "待确认"}`)
                  .join(" · ")}
              </span>
            </>
          )}
        </div>
      </section>
      <aside className="detail">
        <p className="eyebrow">YOUR WORD BANK</p>
        <h3>{p.all.length} 个核心词</h3>
        <p>每个词都带有搭配、例句与个人错误记录。</p>
        <div className="mini">
          {p.all.map((x) => (
            <div key={x.word}>
              <b>{x.word}</b>
              <small>{x.due}</small>
            </div>
          ))}
        </div>
      </aside>
      {panel && (
        <div className="vocab-modal" role="dialog" aria-modal="true">
          <article>
            <button className="modal-close" onClick={() => setPanel(null)}>
              ×
            </button>
            {panel === "today" && (
              <>
                <p className="eyebrow">TODAY'S CANDIDATES</p>
                <h2>
                  {p.theme.topic} · {p.theme.subtopic}
                </h2>
                <p className="modal-note">
                  系统已从今天的阅读、听力与写作训练收集候选；你只需确认值得记的内容。
                </p>
                <div className="quick-add">
                  <input
                    value={quick}
                    onChange={(e) => setQuick(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && quickAdd()}
                    placeholder="Add a word or phrase..."
                  />
                  <button className="outline" onClick={quickAdd}>
                    加入候选
                  </button>
                </div>
                <div className="candidate-list">
                  {pending.map((x) => (
                    <div key={x.id}>
                      <label>
                        <input type="checkbox" defaultChecked />
                        <b>{x.content}</b>
                      </label>
                      <small>
                        {x.sourceModule} ·{" "}
                        {x.priority === "high" ? "HIGH VALUE" : "NORMAL"}
                        {p.all.some(
                          (w) =>
                            normalizeVocabulary(w.word) ===
                            normalizeVocabulary(x.content),
                        )
                          ? " · Already in Word Bank"
                          : ""}
                      </small>
                      <button
                        className="text-link"
                        onClick={() => mark(x, "ignored")}
                      >
                        忽略
                      </button>
                      <button className="outline" onClick={() => accept(x)}>
                        加入
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="primary"
                  onClick={() => pending.forEach(accept)}
                >
                  全部加入
                </button>
              </>
            )}
            {panel === "inbox" && (
              <>
                <p className="eyebrow">VOCABULARY INBOX</p>
                <h2>{pending.length} pending</h2>
                <p className="modal-note">
                  {sourceMix
                    .map(([source, count]) => `${source} ${count}`)
                    .join(" · ") || "目前没有待整理项目。"}
                </p>
                <div className="candidate-list">
                  {pending.map((x) => (
                    <div key={x.id}>
                      <b>{x.content}</b>
                      <small>
                        {x.type} · {x.sourceModule}
                      </small>
                      <button
                        className="text-link"
                        onClick={() => mark(x, "ignored")}
                      >
                        忽略
                      </button>
                      <button className="outline" onClick={() => accept(x)}>
                        接受
                      </button>
                    </div>
                  ))}
                </div>
                {pending.length > 0 && (
                  <button
                    className="primary"
                    onClick={() => pending.forEach(accept)}
                  >
                    Accept All
                  </button>
                )}
              </>
            )}
            {panel === "mistake" && (
              <>
                <p className="eyebrow">RECORD A MISTAKE</p>
                <h2>What went wrong?</h2>
                <label className="mistake-field">
                  我写 / 认成了
                  <input
                    value={wrong}
                    onChange={(e) => setWrong(e.target.value)}
                    placeholder="substantial improve"
                  />
                </label>
                <label className="mistake-field">
                  正确应该是（可留空）
                  <input
                    value={correct}
                    onChange={(e) => setCorrect(e.target.value)}
                    placeholder="substantial improvement"
                  />
                </label>
                <div className="mistake-types">
                  {[
                    "词义误认",
                    "拼写错误",
                    "易混词",
                    "词性错误",
                    "搭配错误",
                    "介词错误",
                    "不自然表达",
                    "听力误认",
                    "其他",
                  ].map((x) => (
                    <button
                      key={x}
                      className={mistakeType === x ? "selected" : ""}
                      onClick={() => setMistakeType(x)}
                    >
                      {x}
                    </button>
                  ))}
                </div>
                <button
                  className="primary"
                  onClick={() => recordMistake(wrong, correct, mistakeType)}
                >
                  加入错误库 + 加入复习
                </button>
              </>
            )}
          </article>
        </div>
      )}
    </div>
  );
}

const vocabularyPathCss = `
.vocabulary-path{max-width:1000px;margin:0 auto;padding:32px 0 64px}.vocabulary-head{display:flex;align-items:start;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding-bottom:20px}.vocabulary-head h2{margin:7px 0 0;font-size:27px;letter-spacing:-.8px}.vocabulary-curriculum{margin-top:16px;display:flex;justify-content:space-between;gap:14px;align-items:start}.vocabulary-curriculum strong{display:block;font-size:12px}.vocabulary-curriculum small{display:block;margin-top:5px;color:#777;font-size:10px;line-height:1.55;max-width:650px}.vocabulary-upload{white-space:nowrap;cursor:pointer}.vocabulary-upload input{display:none}.vocabulary-plan{display:grid;grid-template-columns:1fr auto;align-items:end;gap:18px;padding:23px 0;border-bottom:1px solid var(--line)}.vocabulary-plan h3{font-size:20px;margin:5px 0}.vocabulary-plan strong{font-size:38px;letter-spacing:-2px}.vocabulary-plan span{display:block;margin-top:5px;font-size:11px;color:#777}.vocabulary-plan .primary{white-space:nowrap}.vocabulary-main{display:grid;grid-template-columns:minmax(0,1fr) 245px;gap:38px;padding-top:25px}.vocabulary-card{min-height:340px;border:1px solid var(--line);border-radius:8px;padding:25px;display:flex;flex-direction:column}.vocabulary-card h2{font:31px Georgia,serif;margin:28px 0 8px}.vocabulary-card>p{font-size:13px;line-height:1.65;color:#555;margin:0}.vocabulary-card .recall-actions{margin-top:auto;display:flex;gap:8px}.vocabulary-card .recall-actions button{flex:1}.vocabulary-answer{border-top:1px solid var(--line);margin-top:19px;padding-top:15px;display:grid;gap:12px}.vocabulary-answer label{font-size:10px;color:#777}.vocabulary-answer p{font-size:13px;line-height:1.6;margin:4px 0 0}.vocabulary-rate{display:flex;gap:7px;margin-top:auto}.vocabulary-rate button{flex:1}.vocabulary-queue{border-left:1px solid var(--line);padding-left:23px}.vocabulary-queue h3{font-size:16px;margin:7px 0 14px}.vocabulary-queue>p:not(.eyebrow){font-size:11px;color:#777;line-height:1.6}.vocabulary-queue-list{border-top:1px solid var(--line);margin-top:14px}.vocabulary-queue-list div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid var(--line);padding:10px 0;font-size:11px}.vocabulary-queue-list small{color:#888}.vocabulary-inbox{margin-top:18px;border-top:1px solid var(--line);padding-top:14px;font-size:11px;color:#666}.vocabulary-inbox button{border:0;background:none;padding:0;color:#666;font-size:11px;cursor:pointer}.vocabulary-complete{padding:48px 0}.vocabulary-complete h3{font-size:28px;margin:7px 0}.vocabulary-complete p{font-size:12px;color:#777}@media(max-width:720px){.vocabulary-head,.vocabulary-curriculum,.vocabulary-plan{display:grid}.vocabulary-main{grid-template-columns:1fr}.vocabulary-queue{border-left:0;border-top:1px solid var(--line);padding:22px 0 0}.vocabulary-plan .primary{justify-self:start}}`;

function Words(p: {
  all: Word[]; setAll: (x: Word[]) => void; item: Word; reveal: boolean; setReveal: (x: boolean) => void;
  rate: (mode: string, dimension?: VocabularyDimension, targetWord?: string) => void;
  date: string; curriculum: VocabularyCurriculum | null; setCurriculum: (x: VocabularyCurriculum | null) => void;
  curriculumProgress: VocabularyCurriculumProgress | null; setCurriculumProgress: (x: VocabularyCurriculumProgress | null) => void;
  plan: DailyVocabularyPlan | null; setPlan: (x: DailyVocabularyPlan | null) => void;
  mastery: Record<string, VocabularyMastery>; task: Task | undefined; active: ActiveStudy | null; seconds: number;
  start: (x: Task) => void; pause: () => void; resume: () => void; finish: () => void;
  theme: DailyTheme; highlights: ReadingHighlight[]; listeningReviews: ListeningReview[]; materials: WritingMaterial[];
  reviewItems: ReviewItem[]; setReviewItems: (x: ReviewItem[]) => void;
}) {
  const [started, setStarted] = useState(false), [queueIndex, setQueueIndex] = useState(0), [inboxOpen, setInboxOpen] = useState(false), [uploadMessage, setUploadMessage] = useState("");
  const autoInbox = useMemo(() => dedupeInbox([
    ...p.highlights.filter((item) => item.type === "word" || item.type === "phrase").map((item) => ({ id: `reading-${item.id}`, type: item.type === "word" ? "word" as const : "phrase" as const, content: item.text, sourceModule: "reading" as const, sourceId: item.id, context: item.context, topic: p.theme.topic, createdAt: item.createdAt, status: "pending" as const, priority: item.type === "word" ? "high" as const : "normal" as const })),
    ...p.listeningReviews.filter((item) => !item.correct).map((item) => ({ id: `listening-${item.id}`, type: "mistake" as const, content: item.text, sourceModule: "listening" as const, sourceId: item.id, context: item.userAnswer, topic: p.theme.topic, createdAt: item.lastReviewedAt, status: "pending" as const, priority: "high" as const, correctForm: item.text, mistakeType: item.mistakeType || "听力识别" })),
    ...p.materials.filter((item) => ["vocabulary", "phrase", "sentence_pattern"].includes(item.type)).map((item) => ({ id: `writing-${item.id}`, type: item.type === "vocabulary" ? "word" as const : "phrase" as const, content: item.content, sourceModule: "writing" as const, sourceId: item.id, context: item.example, topic: item.topic, createdAt: item.createdAt || p.date, status: "pending" as const, priority: "normal" as const })),
    ...p.reviewItems.filter((item) => item.sourceModule === "speaking").map((item) => ({ id: `speaking-${item.id}`, type: "suggestion" as const, content: item.answer, sourceModule: "speaking" as const, sourceId: item.sourceId, context: item.context, topic: p.theme.topic, createdAt: item.createdAt, status: "pending" as const, priority: "normal" as const })),
  ]), [p.highlights, p.listeningReviews, p.materials, p.reviewItems, p.theme.topic, p.date]);
  const generatedPlan = useMemo(() => generateDailyVocabularyPlan({ date: p.date || "vocabulary-initial", words: p.all, curriculum: p.curriculum, progress: p.curriculumProgress }), [p.date, p.all, p.curriculum, p.curriculumProgress]);
  const plan = p.plan?.date === p.date ? p.plan : generatedPlan;
  useEffect(() => { if (p.date && (!p.plan || p.plan.date !== p.date)) p.setPlan(generatedPlan); }, [p.date, p.plan, generatedPlan, p.setPlan]);
  const queueNames = [...plan.reviewWords, ...plan.personalWords, ...plan.curriculumNewWords];
  const queue = queueNames.map((name) => p.all.find((word) => normalizeVocabulary(word.word) === normalizeVocabulary(name))).filter((word): word is Word => !!word);
  const current = queue[queueIndex] || p.item;
  const dimension = current ? (Object.keys(p.mastery[normalizeVocabulary(current.word)] || emptyMastery()) as VocabularyDimension[]).sort((a, b) => (p.mastery[normalizeVocabulary(current.word)] || emptyMastery())[a] - (p.mastery[normalizeVocabulary(current.word)] || emptyMastery())[b])[0] : "meaningRecognition";
  const exercise = current ? promptForDimension(dimension, current) : null;
  const advance = (result: "again" | "good" | "easy") => { if (!current) return; p.rate(result, dimension, current.word); p.setReveal(false); setQueueIndex((index) => index + 1); };
  const upload = async (file?: File) => { if (!file) return; setUploadMessage("正在解析教材结构…"); try { const curriculum = await parseVocabularyCurriculumUpload(file); const first = curriculum.sections[0]; p.setCurriculum(curriculum); p.setCurriculumProgress({ curriculumId: curriculum.id, currentUnit: first?.title, currentSection: first?.id, currentPage: first?.startPage, completedSections: [] }); setUploadMessage(curriculum.parserNote || "教材已解析。"); } catch { setUploadMessage("无法可靠解析这份教材；请尝试文字可复制的 PDF、TXT 或 DOCX。 "); } };
  const section = currentVocabularySection(p.curriculum, p.curriculumProgress);
  const weak = current ? dimensionLabel[dimension] : "—";
  return <section className="vocabulary-path"><style>{vocabularyPathCss}</style>
    <header className="vocabulary-head"><div><p className="eyebrow">VOCABULARY TRAINING</p><h2>词汇训练</h2></div><button className="inbox-button" onClick={() => setInboxOpen((value) => !value)}>收集箱 · {autoInbox.length}</button></header>
    <div className="vocabulary-curriculum"><div><strong>{p.curriculum ? `${p.curriculum.title}${section ? ` · ${section.title}` : ""}` : "尚未上传词汇教材"}</strong><small>{uploadMessage || p.curriculum?.parserNote || "上传 Vocabulary in Use 或雅思词汇教材后，系统会记录当前章节；没有教材时仍会安排已有词库与个人词汇。"}</small></div><label className="outline vocabulary-upload">{p.curriculum ? "更换教材" : "上传教材"}<input type="file" accept=".pdf,.txt,.doc,.docx" onChange={(event) => upload(event.target.files?.[0])} /></label></div>
    <section className="vocabulary-plan"><div><p className="eyebrow">今日词汇</p><h3>{plan.total}</h3><span>教材新词 {plan.curriculumNewWords.length} · 到期复习 {plan.reviewWords.length} · 个人词汇 {plan.personalWords.length}</span></div>{!started && <button className="primary" onClick={() => { setStarted(true); p.setReveal(false); }}>开始今日词汇</button>}</section>
    {started && current ? <div className="vocabulary-main"><main><article className="vocabulary-card"><p className="eyebrow">{dimensionLabel[dimension]} · 第 {Math.max(1, (p.mastery[normalizeVocabulary(current.word)]?.meaningRecognition || 0) + 1)} 轮</p><h2>{current.word}</h2>{!p.reveal ? <><p>{exercise?.prompt}</p><div className="recall-actions"><button className="outline" onClick={() => advance("again")}>想不起来</button><button className="primary" onClick={() => p.setReveal(true)}>我知道</button></div></> : <><div className="vocabulary-answer"><div><label>中文意思</label><p>{current.zh}</p></div><div><label>常用搭配</label><p>{current.collocation}</p></div><div><label>例句</label><p>{current.example}</p></div>{current.error && <div><label>易错点</label><p>{current.error}</p></div>}</div><div className="vocabulary-rate"><button className="outline" onClick={() => advance("again")}>忘记了</button><button className="outline" onClick={() => advance("good")}>记得</button><button className="primary" onClick={() => advance("easy")}>很轻松</button></div></>}</article></main><aside className="vocabulary-queue"><p className="eyebrow">今日队列</p><h3>{plan.total} 个词</h3><p>当前优先训练：{weak}</p><div className="vocabulary-queue-list">{queue.slice(0, 9).map((word) => <div key={word.word}><b>{word.word}</b><small>{word.due}</small></div>)}</div>{inboxOpen && <div className="vocabulary-inbox"><p>自动收集：{autoInbox.reduce((map, item) => ({ ...map, [item.sourceModule]: (map[item.sourceModule] || 0) + 1 }), {} as Record<string, number>) && Object.entries(autoInbox.reduce((map, item) => ({ ...map, [item.sourceModule]: (map[item.sourceModule] || 0) + 1 }), {} as Record<string, number>)).map(([source, count]) => `${source} ${count}`).join(" · ")}</p><p>候选词会去重并保留来源，进入后续词汇计划。</p></div>}</aside></div> : started ? <div className="vocabulary-complete"><p className="eyebrow">今日词汇完成</p><h3>已完成当前队列</h3><p>薄弱项将继续影响下一次复习的训练方式。</p></div> : null}
  </section>;
}

function Reading(p: {
  articles: ReadingArticle[];
  setArticles: (x: ReadingArticle[]) => void;
  cards: ReviewCard[];
  setCards: (x: ReviewCard[]) => void;
  materials: WritingMaterial[];
  setMaterials: (x: WritingMaterial[]) => void;
  task: Task;
  active: ActiveStudy | null;
  seconds: number;
  start: (x: Task, articleId?: string) => void;
  pause: () => void;
  finish: () => void;
  theme: DailyTheme;
  setTheme: (x: DailyTheme) => void;
}) {
  const [screen, setScreen] = useState<"library" | "add" | "reader">("library");
  const [selected, setSelected] = useState<ReadingArticle | null>(null);
  const open = (article: ReadingArticle) => {
    setSelected(article);
    setScreen("reader");
  };
  const updateSelected = (article: ReadingArticle) => {
    p.setArticles(p.articles.map((item) => (item.id === article.id ? article : item)));
    setSelected(article);
  };
  const articleFromAnalysis = (
    id: string,
    date: string,
    images: ReadingImageUpload[],
    outcome: ReadingAnalysisOutcome,
    suspiciousDuplicate = false,
  ): ReadingArticle => {
    const source = {
      id,
      createdAt: date,
      completedAt: date,
      source: "User Imported" as const,
      imageUrls: images.map((image) => image.dataUrl),
      imageNames: images.map((image) => image.name),
      imageFileIds: images.map((image) => image.id),
      imageHashes: outcome.imageHashes,
      contentHash: outcome.contentHash,
      analysisVersion: outcome.analysisVersion,
      analysedAt: new Date().toISOString(),
      sourceText: outcome.sourceText,
      sourceTextLength: outcome.status === "completed" ? outcome.sourceTextLength : outcome.sourceText.length,
      analysisProvider: outcome.status === "completed" ? outcome.analysisProvider : undefined,
      analysisModel: outcome.status === "completed" ? outcome.analysisModel : undefined,
      failedImageIndexes: outcome.failedImageIndexes,
      suspiciousDuplicate,
    };
    if (outcome.status === "failed" || suspiciousDuplicate) {
      return {
        ...source,
        status: "failed",
        topic: "Other",
        content: outcome.sourceText,
        title: "分析失败",
        aiStatus: "failed",
        analysisFailureCode: outcome.status === "failed" ? outcome.code : undefined,
        analysisFailureReason: suspiciousDuplicate ? "检测到与另一篇不同图片文章的分析完全重复" : outcome.status === "failed" ? outcome.reason : "分析结果异常",
      };
    }
    return {
      ...source,
      status: "completed",
      topic: outcome.mainTopic as ReadingTopic,
      content: outcome.sourceText,
      title: outcome.title,
      mainTopic: outcome.mainTopic,
      subTopics: [...outcome.subTopics],
      summary: outcome.summary,
      concepts: [...outcome.concepts],
      vocabulary: [...outcome.vocabulary],
      usefulExpressions: [...outcome.usefulExpressions],
      arguments: [...outcome.arguments],
      difficulty: outcome.difficulty,
      aiStatus: "completed",
    };
  };
  const addDerivedLearning = (article: ReadingArticle, analysis: Extract<ReadingAnalysisOutcome, { status: "completed" }>) => {
    const generatedCards = [...analysis.vocabulary, ...analysis.usefulExpressions].map(
      (content, index) => ({
        id: `reading-ai-${article.id}-${index}`,
        articleId: article.id,
        type: "phrase" as const,
        content: `Recall: ${content}`,
        answer: content,
        context: analysis.summary,
        createdAt: article.createdAt,
        nextReviewAt: article.createdAt,
        reviewCount: 0,
        difficulty: "good" as const,
      }),
    );
    p.setCards([...p.cards.filter((card) => card.articleId !== article.id), ...generatedCards]);
    p.setMaterials([
      ...p.materials.filter((material) => material.sourceArticleId !== article.id),
      ...analysis.usefulExpressions.map((content, index) => ({
        id: `reading-material-${article.id}-${index}`,
        type: "phrase" as const,
        content,
        meaning: "Imported from this reading analysis",
        topic: article.topic,
        source: "Reading analysis",
        sourceArticleId: article.id,
        example: analysis.summary,
        createdAt: article.createdAt,
        nextReviewAt: article.createdAt,
        masteryLevel: 1,
        reviewCount: 0,
      })),
    ]);
  };
  const analyseAndAdd = async (images: ReadingImageUpload[]) => {
    const date = localDate();
    const id = `reading-${crypto.randomUUID?.() ?? Date.now()}`;
    const analysis = await analyseReadingImages({ articleId: id, images });
    const suspiciousDuplicate = analysis.status === "completed" && isSuspiciousDuplicate(analysis, p.articles);
    if (suspiciousDuplicate) console.warn("[Reading analysis] suspicious duplicate", { articleId: id, contentHash: analysis.contentHash });
    const article = articleFromAnalysis(id, date, images, analysis, suspiciousDuplicate);
    const nextArticles = [article, ...p.articles];
    p.setArticles(nextArticles);
    if (analysis.status === "completed" && !suspiciousDuplicate) {
      const themeContext = buildThemeContext(nextArticles, date);
      localStorage.setItem(`ielts-theme-context-${date}`, JSON.stringify(themeContext));
      p.setTheme({ date, topic: themeContext.primaryTheme, subtopic: themeContext.secondaryThemes.join(" · ") || "Reading input" });
      addDerivedLearning(article, analysis);
    }
    open(article);
  };
  const retryAnalysis = async () => {
    if (!selected) return;
    invalidateReadingAnalysisCache(selected.id, selected.contentHash);
    const images = (selected.imageUrls ?? []).map((dataUrl, index) => ({
      id: selected.imageFileIds?.[index] || `${selected.id}-${index}`,
      name: selected.imageNames?.[index] || `article-image-${index + 1}`,
      dataUrl,
    }));
    const analysis = await analyseReadingImages({ articleId: selected.id, images, force: true });
    const suspiciousDuplicate = analysis.status === "completed" && isSuspiciousDuplicate(analysis, p.articles.filter((article) => article.id !== selected.id));
    const updated = articleFromAnalysis(selected.id, selected.createdAt, images, analysis, suspiciousDuplicate);
    updateSelected(updated);
    if (analysis.status === "completed" && !suspiciousDuplicate) {
      const nextArticles = p.articles.map((article) => article.id === updated.id ? updated : article);
      const themeContext = buildThemeContext(nextArticles, selected.createdAt);
      localStorage.setItem(`ielts-theme-context-${selected.createdAt}`, JSON.stringify(themeContext));
      p.setTheme({ date: selected.createdAt, topic: themeContext.primaryTheme, subtopic: themeContext.secondaryThemes.join(" · ") || "Reading input" });
      addDerivedLearning(updated, analysis);
    }
  };
  const finishSession = () => {
    if (!selected || !p.seconds) {
      p.finish();
      return;
    }
    const record: ReadingPerformance = {
      articleId: selected.id,
      duration: p.seconds,
      difficulty: selected.difficulty,
      vocabularyCount: selected.vocabulary?.length ?? 0,
      unknownVocabularyCount: 0,
      comprehensionSignals: selected.concepts ?? [],
      createdAt: localDate(),
    };
    const stored = load<ReadingPerformance[]>("ielts-reading-performance", []);
    localStorage.setItem(
      "ielts-reading-performance",
      JSON.stringify([...stored, record]),
    );
    p.finish();
  };
  if (screen === "add") {
    return (
      <ArticleForm
        cancel={() => setScreen("library")}
        submit={analyseAndAdd}
      />
    );
  }
  if (screen === "reader" && selected) {
    return (
      <ArticleReader
        article={selected}
        active={p.active}
        seconds={p.seconds}
        start={() => p.start(p.task, selected.id)}
        pause={p.pause}
        finish={finishSession}
        retry={() => void retryAnalysis()}
        back={() => setScreen("library")}
      />
    );
  }
  return (
    <section className="reading-library reading-library-new">
      <div className="reading-library-head">
        <div>
          <p className="eyebrow">MY READING LIBRARY</p>
          <h2>把读过的文章，变成自己的素材。</h2>
        </div>
        {p.articles.length > 0 && (
          <button className="primary" onClick={() => setScreen("add")}>
            + 添加文章
          </button>
        )}
      </div>
      {!p.articles.length ? (
        <div className="reading-empty reading-empty-new">
          <div className="reading-empty-copy">
            <p className="eyebrow">TODAY'S READING INPUT</p>
            <strong>Your reading library is empty.</strong>
            <p>从一篇开始。不需要手动整理，读完后把截图交给系统。</p>
            <button className="primary" onClick={() => setScreen("add")}>
              Add Article
            </button>
          </div>
          <div className="reading-input-flow" aria-label="阅读素材处理流程">
            <span><b>01</b> 上传截图</span>
            <span><b>02</b> 自动识别</span>
            <span><b>03</b> 进入复习与输出</span>
          </div>
        </div>
      ) : (
        <div className="article-grid article-grid-new">
          {p.articles.map((article) => (
            <button className="article-card article-card-new" key={article.id} onClick={() => open(article)}>
              <div>
                <span>{article.aiStatus === "completed" ? article.mainTopic || article.topic : "等待分析"}</span>
                <small>{article.createdAt.slice(5).replace("-", "/")}</small>
              </div>
              <h3>{article.aiStatus === "completed" ? article.title || "Untitled reading" : "分析失败"}</h3>
              <p>{article.aiStatus === "completed" ? article.subTopics?.slice(0, 2).join(" · ") || "等待分析" : article.analysisFailureReason || "分析失败 · 请重试"}</p>
              <footer>
                <span>{article.imageUrls?.length ?? 0} images</span>
                <b>{article.aiStatus === "completed" ? "分析完成" : "分析失败 · Retry"}</b>
                <i>→</i>
              </footer>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function LegacyReading(p: {
  articles: ReadingArticle[];
  setArticles: (x: ReadingArticle[]) => void;
  highlights: ReadingHighlight[];
  setHighlights: (x: ReadingHighlight[]) => void;
  cards: ReviewCard[];
  setCards: (x: ReviewCard[]) => void;
  notes: ReadingNote[];
  setNotes: (x: ReadingNote[]) => void;
  setMaterials: (x: WritingMaterial[]) => void;
  addWord: (x: ReadingHighlight) => void;
  task: Task;
  active: ActiveStudy | null;
  seconds: number;
  start: (x: Task, articleId?: string) => void;
  pause: () => void;
  finish: () => void;
}) {
  const [screen, setScreen] = useState<"library" | "add" | "reader">("library"),
    [selected, setSelected] = useState<ReadingArticle | null>(null),
    [search, setSearch] = useState(""),
    [topic, setTopic] = useState("All"),
    [source, setSource] = useState("All"),
    [mode, setMode] = useState<"original" | "highlights" | "review">(
      "original",
    ),
    [picked, setPicked] = useState(""),
    [meaning, setMeaning] = useState(""),
    [note, setNote] = useState(""),
    [reviewInput, setReviewInput] = useState(""),
    [revealed, setRevealed] = useState(false);
  const filtered = p.articles.filter((a) => {
    const hs = p.highlights
      .filter((h) => h.articleId === a.id)
      .map((h) => h.text)
      .join(" ");
    const q = search.toLowerCase();
    return (
      (!q ||
        (a.title + " " + a.content + " " + hs + " " + a.topic)
          .toLowerCase()
          .includes(q)) &&
      (topic === "All" || a.topic === topic) &&
      (source === "All" || a.source === source)
    );
  });
  const open = (
    article: ReadingArticle,
    view: "original" | "highlights" | "review" = "original",
  ) => {
    setSelected(article);
    setMode(view);
    setPicked("");
    setScreen("reader");
  };
  const addArticle = (data: {
    title: string;
    source: ReadingSource;
    topic: ReadingTopic;
    content: string;
  }) => {
    if (!data.title.trim() || !data.content.trim()) return;
    const article: ReadingArticle = {
      id: Date.now().toString(),
      ...data,
      createdAt: localDate(),
      status: "in_progress",
    };
    p.setArticles([article, ...p.articles]);
    open(article);
  };
  if (screen === "add")
    return (
      <LegacyArticleForm
        cancel={() => setScreen("library")}
        submit={addArticle}
      />
    );
  if (screen === "reader" && selected)
    return (
      <LegacyArticleReader
        article={selected}
        highlights={p.highlights.filter((h) => h.articleId === selected.id)}
        cards={p.cards.filter((c) => c.articleId === selected.id)}
        notes={p.notes.filter((n) => n.articleId === selected.id)}
        mode={mode}
        setMode={setMode}
        picked={picked}
        setPicked={setPicked}
        meaning={meaning}
        setMeaning={setMeaning}
        note={note}
        setNote={setNote}
        addHighlight={(type) => {
          if (!picked.trim()) return;
          const h: ReadingHighlight = {
            id: Date.now().toString(),
            articleId: selected.id,
            type,
            text: picked.trim(),
            context: contextFor(selected.content, picked.trim()),
            meaning,
            note,
            logicRole: type === "logic" ? "Claim" : undefined,
            createdAt: localDate(),
          };
          p.setHighlights([...p.highlights, h]);
          if (type === "phrase" || type === "sentence")
            p.setMaterials([
              {
                id: h.id,
                type: type === "phrase" ? "phrase" : "sentence",
                content: h.text,
                meaning: h.meaning,
                topic: selected.topic,
                source: selected.source,
                sourceArticleId: selected.id,
                example: h.context,
              },
            ]);
          setPicked("");
          setMeaning("");
          setNote("");
        }}
        addWord={p.addWord}
        finishArticle={() => {
          const cards = p.highlights
            .filter((h) => h.articleId === selected.id)
            .map((h) => ({
              id: "card-" + h.id,
              articleId: selected.id,
              type: h.type,
              content:
                h.type === "logic"
                  ? "What is the role of this selected passage?"
                  : h.context || h.text,
              answer: h.type === "logic" ? h.logicRole || "Claim" : h.text,
              context: h.context,
              createdAt: localDate(),
              nextReviewAt: localDate(),
              reviewCount: 0,
              difficulty: "good" as const,
            }));
          p.setCards([
            ...p.cards.filter((c) => c.articleId !== selected.id),
            ...cards,
          ]);
          const updated = {
            ...selected,
            status: "completed" as const,
            completedAt: localDate(),
          };
          p.setArticles(
            p.articles.map((a) => (a.id === updated.id ? updated : a)),
          );
          setSelected(updated);
        }}
        rateCard={(card, level) => {
          const days =
            level === "again"
              ? 1
              : level === "hard"
                ? 2
                : level === "good"
                  ? 4
                  : 8;
          const next = new Date();
          next.setDate(next.getDate() + days);
          p.setCards(
            p.cards.map((x) =>
              x.id === card.id
                ? {
                    ...x,
                    difficulty: level,
                    lastReviewedAt: localDate(),
                    nextReviewAt: localDate(next),
                    reviewCount: x.reviewCount + 1,
                  }
                : x,
            ),
          );
          setReviewInput("");
          setRevealed(false);
        }}
        reviewInput={reviewInput}
        setReviewInput={setReviewInput}
        revealed={revealed}
        setRevealed={setRevealed}
        start={() => p.start(p.task, selected.id)}
        active={p.active}
        seconds={p.seconds}
        pause={p.pause}
        finish={p.finish}
        back={() => setScreen("library")}
        setNotes={p.setNotes}
      />
    );
  return (
    <section className="reading-library">
      <div className="reading-library-head">
        <div>
          <p className="eyebrow">MY READING LIBRARY</p>
          <h2>把读过的文章，变成自己的素材。</h2>
        </div>
        <button className="primary" onClick={() => setScreen("add")}>
          + Add Article
        </button>
      </div>
      {!p.articles.length ? (
        <div className="reading-empty">
          <strong>Your reading library is empty.</strong>
          <p>
            Add your first article and start building your IELTS reading
            knowledge base.
          </p>
          <button className="primary" onClick={() => setScreen("add")}>
            Add Article
          </button>
        </div>
      ) : (
        <>
          <div className="reading-filters">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles, words, phrases…"
            />
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option>All</option>
              {readingTopics.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option>All</option>
              {readingSources.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="article-grid">
            {filtered.map((article) => {
              const hs = p.highlights.filter((x) => x.articleId === article.id),
                due = p.cards.filter(
                  (x) =>
                    x.articleId === article.id && x.nextReviewAt <= localDate(),
                ).length;
              return (
                <article
                  className="article-card"
                  key={article.id}
                  onClick={() => open(article)}
                >
                  <div>
                    <span>{article.topic}</span>
                    <small>{article.source}</small>
                  </div>
                  <h3>{article.title}</h3>
                  <p>
                    {article.createdAt} ·{" "}
                    {article.status === "completed"
                      ? "Completed"
                      : "In progress"}
                  </p>
                  <footer>
                    <span>
                      {hs.filter((x) => x.type === "word").length} Vocabulary
                    </span>
                    <span>
                      {hs.filter((x) => x.type === "sentence").length} Key
                      Sentences
                    </span>
                    <b>Review: {due ? "Today" : "—"}</b>
                  </footer>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      open(article, "highlights");
                    }}
                  >
                    Quick Review →
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
const readingTopics: ReadingTopic[] = [
  "Education",
  "Technology",
  "Environment",
  "Society",
  "Economy",
  "Culture",
  "Science",
  "Health",
  "Work",
  "Government",
  "Other",
];
const readingSources: ReadingSource[] = [
  "Cambridge IELTS",
  "News",
  "Academic Article",
  "AI Generated",
  "User Imported",
  "Other",
];
function contextFor(content: string, text: string) {
  const i = content.indexOf(text);
  return i < 0
    ? text
    : content
        .slice(
          Math.max(0, i - 110),
          Math.min(content.length, i + text.length + 110),
        )
        .trim();
}
type ReadingImageUpload = { id: string; name: string; dataUrl: string };

function fileToReadingImage(file: File): Promise<ReadingImageUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: `${file.name}-${file.lastModified}-${file.size}`,
        name: file.name,
        dataUrl: String(reader.result),
      });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ArticleForm(p: {
  cancel: () => void;
  submit: (images: ReadingImageUpload[]) => Promise<void>;
}) {
  const [images, setImages] = useState<ReadingImageUpload[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [message, setMessage] = useState("");
  const addFiles = async (files: File[]) => {
    const accepted = files.filter((file) => file.type.startsWith("image/"));
    if (!accepted.length) return;
    const next = await Promise.all(accepted.map(fileToReadingImage));
    setImages((current) => [...current, ...next]);
  };
  const move = (index: number, direction: -1 | 1) =>
    setImages((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const analyse = async () => {
    if (!images.length || analysing) return;
    setAnalysing(true);
    setMessage("Reading article...");
    try {
      await p.submit(images);
    } catch {
      setMessage("Could not analyse these images. Please retry.");
      setAnalysing(false);
    }
  };
  return (
    <section className="article-form article-upload-form">
      <button className="back" onClick={p.cancel}>
        ← Back to library
      </button>
      <div>
        <p className="eyebrow">ADD READING</p>
        <h2>上传今天读过的文章截图。</h2>
        <label
          className="image-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.currentTarget.value = "";
            }}
          />
          <b>＋</b>
          <strong>Drop article images here</strong>
          <span>or click to upload</span>
          <small>JPG · PNG · WEBP</small>
        </label>
        {images.length > 0 && (
          <section className="image-preview-list">
            <div>
              <p className="eyebrow">ARTICLE IMAGES</p>
              <small>{images.length} images selected</small>
            </div>
            <div className="image-previews">
              {images.map((image, index) => (
                <figure key={image.id}>
                  <img src={image.dataUrl} alt={`Article image ${index + 1}`} />
                  <figcaption>
                    <b>{index + 1}</b>
                    <span>{image.name}</span>
                  </figcaption>
                  <div>
                    <button aria-label="Move image earlier" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
                    <button aria-label="Move image later" onClick={() => move(index, 1)} disabled={index === images.length - 1}>↓</button>
                    <button aria-label="Delete image" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}>×</button>
                  </div>
                </figure>
              ))}
            </div>
            <label className="add-more-images">
              + Continue adding images
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { void addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
            </label>
          </section>
        )}
        {message && <p className="analysis-message">{message}</p>}
        <button className="primary analyse-article" disabled={!images.length || analysing} onClick={() => void analyse()}>
          {analysing ? "Reading article..." : "Analyse Article"}
        </button>
      </div>
    </section>
  );
}

function ArticleReader(p: {
  article: ReadingArticle;
  active: ActiveStudy | null;
  seconds: number;
  start: () => void;
  pause: () => void;
  finish: () => void;
  retry: () => void;
  back: () => void;
}) {
  const running = p.active?.articleId === p.article.id;
  const notes: [string, string[]][] = [
    ["Core Concepts", p.article.concepts ?? []],
    ["Vocabulary", p.article.vocabulary ?? []],
    ["Useful Expressions", p.article.usefulExpressions ?? []],
    ["Arguments", p.article.arguments ?? []],
  ];
  const failedCount = p.article.failedImageIndexes?.length ?? 0;
  return (
    <section className="reader reader-new">
      <button className="back" onClick={p.back}>← Back to library</button>
      <div className="reader-new-head">
        <div>
          <div className="article-meta">
            <span>{p.article.mainTopic || p.article.topic}</span>
            <span>{p.article.subTopics?.join(" · ") || "Analysing"}</span>
            <span>{p.article.createdAt.slice(5).replace("-", "/")}</span>
            <span>{p.article.imageUrls?.length ?? 0} images</span>
          </div>
          <h2>{p.article.title || "Untitled reading"}</h2>
          {p.article.summary && <p>{p.article.summary}</p>}
        </div>
        <small className="training-timer-note">学习时间由右下角的全局计时器统一记录。</small>
      </div>
      {(p.article.aiStatus === "failed" || failedCount > 0) && (
        <div className="analysis-warning">
          {p.article.analysisFailureReason || `${failedCount} image could not be fully analysed.`}
          <button onClick={p.retry}>Retry</button>
        </div>
      )}
      <section className="original-images">
        <p className="eyebrow">ORIGINAL IMAGES</p>
        <div>
          {(p.article.imageUrls ?? []).map((image, index) => (
            <a href={image} target="_blank" rel="noreferrer" key={`${image.slice(0, 30)}-${index}`}>
              <img src={image} alt={`Original article image ${index + 1}`} />
              <span>View original · {index + 1}</span>
            </a>
          ))}
        </div>
      </section>
      <section className="ai-reading-notes">
        <p className="eyebrow">AI NOTES</p>
        <div>
          {notes.map(([label, values]) => (
            <article key={label}>
              <h3>{label}</h3>
              {values.length ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>Awaiting analysis.</p>}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function LegacyArticleForm(p: {
  cancel: () => void;
  submit: (x: {
    title: string;
    source: ReadingSource;
    topic: ReadingTopic;
    content: string;
  }) => void;
}) {
  const [title, setTitle] = useState(""),
    [source, setSource] = useState<ReadingSource>("User Imported"),
    [topic, setTopic] = useState<ReadingTopic>("Technology"),
    [content, setContent] = useState("");
  return (
    <section className="article-form">
      <button className="back" onClick={p.cancel}>
        ← Back to library
      </button>
      <div>
        <p className="eyebrow">PASTE TEXT</p>
        <h2>Add an article</h2>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
          />
        </label>
        <div className="form-row">
          <label>
            Source
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as ReadingSource)}
            >
              {readingSources.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Topic
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value as ReadingTopic)}
            >
              {readingTopics.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Article Text
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste the article text here. PDF, URL and OCR can be added later."
          />
        </label>
        <button
          className="primary"
          onClick={() => p.submit({ title, source, topic, content })}
        >
          Save Article
        </button>
      </div>
    </section>
  );
}
function LegacyArticleReader(p: {
  article: ReadingArticle;
  highlights: ReadingHighlight[];
  cards: ReviewCard[];
  notes: ReadingNote[];
  mode: "original" | "highlights" | "review";
  setMode: (x: "original" | "highlights" | "review") => void;
  picked: string;
  setPicked: (x: string) => void;
  meaning: string;
  setMeaning: (x: string) => void;
  note: string;
  setNote: (x: string) => void;
  addHighlight: (x: HighlightType) => void;
  addWord: (x: ReadingHighlight) => void;
  finishArticle: () => void;
  rateCard: (x: ReviewCard, l: "again" | "hard" | "good" | "easy") => void;
  reviewInput: string;
  setReviewInput: (x: string) => void;
  revealed: boolean;
  setRevealed: (x: boolean) => void;
  start: () => void;
  active: ActiveStudy | null;
  seconds: number;
  pause: () => void;
  finish: () => void;
  back: () => void;
  setNotes: (x: ReadingNote[]) => void;
}) {
  const [logicView, setLogicView] = useState(false);
  const running = p.active?.articleId === p.article.id;
  const due = p.cards.find((x) => x.nextReviewAt <= localDate()) || p.cards[0];
  const counts = (type: HighlightType) =>
    p.highlights.filter((x) => x.type === type).length;
  const onPick = () => {
    const value = window.getSelection()?.toString().trim() || "";
    if (value && value.length < 380) p.setPicked(value);
  };
  return (
    <section className="reader">
      <button className="back" onClick={p.back}>
        ← Back to library
      </button>
      <div className="reader-grid">
        <main>
          <div className="article-meta">
            <span>{p.article.topic}</span>
            <span>{p.article.source}</span>
            <span>{p.article.createdAt}</span>
          </div>
          <h2>{p.article.title}</h2>
          <div className="reader-actions">
            <div className="reader-modes">
              {(["original", "highlights", "review"] as const).map((x) => (
                <button
                  key={x}
                  className={p.mode === x ? "selected" : ""}
                  onClick={() => p.setMode(x)}
                >
                  {x[0].toUpperCase() + x.slice(1)}
                </button>
              ))}
            </div>
            {running ? (
              <div>
                <b>{clock(p.seconds)}</b>
                <button className="outline" onClick={p.pause}>
                  Pause
                </button>
                <button className="primary" onClick={p.finish}>
                  Finish Session
                </button>
              </div>
            ) : (
              <button className="primary" onClick={p.start}>
                Start Reading
              </button>
            )}
          </div>
          {p.mode === "original" && (
            <>
              <article className="article-content" onMouseUp={onPick}>
                <AnnotatedText
                  content={p.article.content}
                  highlights={p.highlights}
                />
              </article>
              {p.picked && (
                <div className="selection-toolbar">
                  <span>
                    Selected: “
                    {p.picked.length > 54
                      ? p.picked.slice(0, 54) + "…"
                      : p.picked}
                    ”
                  </span>
                  {(
                    [
                      "word",
                      "phrase",
                      "sentence",
                      "complex_sentence",
                      "logic",
                      "note",
                    ] as HighlightType[]
                  ).map((x) => (
                    <button key={x} onClick={() => p.addHighlight(x)}>
                      {x === "complex_sentence"
                        ? "Complex Sentence"
                        : x[0].toUpperCase() + x.slice(1)}
                    </button>
                  ))}
                  <input
                    value={p.meaning}
                    onChange={(e) => p.setMeaning(e.target.value)}
                    placeholder="Meaning / translation (optional)"
                  />
                  <input
                    value={p.note}
                    onChange={(e) => p.setNote(e.target.value)}
                    placeholder="Note (optional)"
                  />
                </div>
              )}
            </>
          )}
          {p.mode === "highlights" && (
            <HighlightView highlights={p.highlights} addWord={p.addWord} />
          )}{" "}
          {p.mode === "review" && (
            <ReviewCardView
              card={due}
              input={p.reviewInput}
              setInput={p.setReviewInput}
              revealed={p.revealed}
              setRevealed={p.setRevealed}
              rate={p.rateCard}
            />
          )}{" "}
          {p.article.status === "completed" && (
            <ArticleSummary
              article={p.article}
              highlights={p.highlights}
              cards={p.cards}
              notes={p.notes}
              setNotes={p.setNotes}
            />
          )}{" "}
          {p.article.status !== "completed" && (
            <button className="finish-reading" onClick={p.finishArticle}>
              Finish Reading & Generate Article Summary
            </button>
          )}
        </main>
        <aside className="article-side">
          <p className="eyebrow">THIS ARTICLE</p>
          <h3>
            {p.article.status === "completed" ? "Completed" : "In progress"}
          </h3>
          <dl>
            <div>
              <dt>Words</dt>
              <dd>{counts("word")}</dd>
            </div>
            <div>
              <dt>Phrases</dt>
              <dd>{counts("phrase")}</dd>
            </div>
            <div>
              <dt>Sentences</dt>
              <dd>{counts("sentence")}</dd>
            </div>
            <div>
              <dt>Complex</dt>
              <dd>{counts("complex_sentence")}</dd>
            </div>
            <div>
              <dt>Review Due</dt>
              <dd>
                {p.cards.filter((x) => x.nextReviewAt <= localDate()).length}
              </dd>
            </div>
          </dl>
          <div className="quick-access">
            <p className="eyebrow">QUICK ACCESS</p>
            {["Vocabulary", "Phrases", "Sentences", "Logic", "Notes"].map(
              (x) => (
                <button key={x}>{x}</button>
              ),
            )}
          </div>
          <button
            className="logic-toggle"
            onClick={() => setLogicView(!logicView)}
          >
            Logic View {logicView ? "−" : "+"}
          </button>
          {logicView && (
            <div className="logic-list">
              {p.highlights
                .filter((x) => x.type === "logic")
                .map((x) => (
                  <span key={x.id}>
                    {x.logicRole || "Claim"}
                    <b>↓</b>
                    {x.text}
                  </span>
                ))}
              {!p.highlights.some((x) => x.type === "logic") && (
                <small>
                  Mark claims, reasons or evidence in the original text.
                </small>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
function AnnotatedText(p: { content: string; highlights: ReadingHighlight[] }) {
  return (
    <>
      {p.content.split(/\n\s*\n/).map((paragraph, i) => {
        const match = p.highlights.find((h) => paragraph.includes(h.text));
        if (!match) return <p key={i}>{paragraph}</p>;
        const index = paragraph.indexOf(match.text);
        return (
          <p key={i}>
            {paragraph.slice(0, index)}
            <mark className={"highlight-" + match.type}>
              {match.text}
              <small>{match.type.replace("_", " ")}</small>
            </mark>
            {paragraph.slice(index + match.text.length)}
          </p>
        );
      })}
    </>
  );
}
function HighlightView(p: {
  highlights: ReadingHighlight[];
  addWord: (x: ReadingHighlight) => void;
}) {
  if (!p.highlights.length)
    return (
      <div className="reader-empty">
        还没有重点。回到 Original 模式，选中文本后进行分类。
      </div>
    );
  return (
    <div className="highlight-view">
      {p.highlights.map((h) => (
        <article key={h.id} className={"highlight-card " + h.type}>
          <div>
            <span>{h.type.replace("_", " ")}</span>
            {h.type === "word" && (
              <button onClick={() => p.addWord(h)}>Add to Word Bank</button>
            )}
          </div>
          <strong>{h.text}</strong>
          <p>{h.context}</p>
          {(h.meaning || h.note) && (
            <small>
              {h.meaning} {h.note}
            </small>
          )}
        </article>
      ))}
    </div>
  );
}
function ReviewCardView(p: {
  card: ReviewCard | undefined;
  input: string;
  setInput: (x: string) => void;
  revealed: boolean;
  setRevealed: (x: boolean) => void;
  rate: (x: ReviewCard, l: "again" | "hard" | "good" | "easy") => void;
}) {
  const card = p.card;
  if (!card)
    return (
      <div className="reader-empty">
        完成阅读并生成重点后，Review Cards 会出现在这里。
      </div>
    );
  return (
    <div className="review-card">
      <p className="eyebrow">{card.type.toUpperCase()} RECALL</p>
      <h3>{card.content}</h3>
      <input
        value={p.input}
        onChange={(e) => p.setInput(e.target.value)}
        placeholder="Try to recall the answer…"
      />
      {p.revealed ? (
        <div className="card-answer">
          Answer: <b>{card.answer}</b>
        </div>
      ) : (
        <button className="outline" onClick={() => p.setRevealed(true)}>
          Show answer
        </button>
      )}
      {p.revealed && (
        <div className="card-rate">
          {(["again", "hard", "good", "easy"] as const).map((x) => (
            <button key={x} onClick={() => p.rate(card, x)}>
              {x}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function ArticleSummary(p: {
  article: ReadingArticle;
  highlights: ReadingHighlight[];
  cards: ReviewCard[];
  notes: ReadingNote[];
  setNotes: (x: ReadingNote[]) => void;
}) {
  const current = p.notes[0];
  return (
    <section className="article-summary">
      <p className="eyebrow">ARTICLE SUMMARY</p>
      <h3>{p.article.title}</h3>
      <div>
        <span>
          Words <b>{p.highlights.filter((x) => x.type === "word").length}</b>
        </span>
        <span>
          Phrases{" "}
          <b>{p.highlights.filter((x) => x.type === "phrase").length}</b>
        </span>
        <span>
          Sentence Patterns{" "}
          <b>{p.highlights.filter((x) => x.type === "sentence").length}</b>
        </span>
        <span>
          Complex Sentences{" "}
          <b>
            {p.highlights.filter((x) => x.type === "complex_sentence").length}
          </b>
        </span>
        <span>
          Logic Points{" "}
          <b>{p.highlights.filter((x) => x.type === "logic").length}</b>
        </span>
        <span>
          Review Cards <b>{p.cards.length}</b>
        </span>
      </div>
      <label>
        KEY TAKEAWAYS
        <textarea
          value={current?.content || ""}
          onChange={(e) =>
            p.setNotes(
              current
                ? p.notes.map((x) =>
                    x.id === current.id ? { ...x, content: e.target.value } : x,
                  )
                : [
                    {
                      id: Date.now().toString(),
                      articleId: p.article.id,
                      content: e.target.value,
                      createdAt: localDate(),
                    },
                  ],
            )
          }
          placeholder="这篇文章最值得记住的三个东西。"
        />
      </label>
    </section>
  );
}

const listeningCss =
  ".listening{width:100%;max-width:920px;min-width:0;margin:0 auto;padding-top:24px;overflow-x:clip}.listen-head{display:flex;justify-content:space-between;align-items:end;gap:16px;border-bottom:1px solid #e8e8e5;padding-bottom:20px}.listen-head h2{font-size:25px;margin:6px 0}.listen-overview,.listen-stage,.listen-summary{border:1px solid #e8e8e5;background:#fff;border-radius:9px;padding:22px;min-width:0}.listen-overview{margin-top:22px}.listen-overview h3{font:24px Georgia,serif;margin:10px 0 6px}.listen-overview>p{margin:0;color:#777;font-size:12px}.listen-meta{display:flex;flex-wrap:wrap;gap:7px;margin:19px 0}.listen-meta span{border:1px solid #e8e8e5;border-radius:15px;padding:5px 8px;color:#666;font-size:10px}.listen-plan{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-top:1px solid #e8e8e5;border-bottom:1px solid #e8e8e5;margin:21px 0}.listen-plan article{padding:12px 13px;border-left:1px solid #e8e8e5;min-width:0}.listen-plan article:first-child{border-left:0;padding-left:0}.listen-plan b{font-size:11px;display:block;line-height:1.35}.listen-plan small{font-size:10px;color:#888;display:block;margin-top:6px}.listen-session-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:20px 0 13px;font-size:11px;color:#666}.listen-session-bar b{font-size:14px;color:#171717}.listen-stage{min-height:410px}.listen-stage-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.listen-stage-top span{font-size:10px;border:1px solid #e8e8e5;border-radius:20px;padding:5px 8px;color:#777}.listen-stage h3{font-size:25px;margin:44px 0 8px}.listen-stage>p{font-size:13px;color:#777}.listen-controls{display:flex;gap:8px;align-items:center;margin:30px 0}.listen-controls button{border:1px solid #ccc;background:#fff;border-radius:6px;padding:9px 12px;font-size:11px}.listen-controls .listen-play{background:#181818;color:#fff;border-color:#181818}.listen-controls button:disabled,.listen-check button:disabled{opacity:.45;cursor:not-allowed}.listen-answer{width:100%;max-width:100%;box-sizing:border-box;border:0;border-bottom:1px solid #ddd;outline:0;padding:13px 0;font:18px Georgia,serif;background:transparent}.listen-check{display:flex;justify-content:space-between;margin-top:15px}.listen-result{margin-top:23px;padding-top:17px;border-top:1px solid #e8e8e5}.listen-result p{font-size:12px;line-height:1.55}.listen-result strong{font:15px Georgia,serif}.listen-result .correct{color:#4e7152}.listen-result .wrong{color:#a04e46}.listen-diagnosis{margin:12px 0 0;color:#777;font-size:11px}.listen-next{margin-top:14px}.listen-summary{margin:22px 0}.listen-summary h2{font-size:25px;margin:7px 0 20px}.listen-summary .summary-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.listen-summary span{font-size:11px;color:#777}.listen-summary b{display:block;color:#171717;font-size:18px;margin-top:3px}.error-breakdown{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:25px;border-top:1px solid #e8e8e5}.error-breakdown span{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #eee;padding:9px 11px 9px 0;font-size:10px}.error-breakdown b{font-size:11px;margin:0}.listen-pause-note{margin-top:14px;font-size:11px;color:#777}@media(max-width:700px){.listen-plan{grid-template-columns:1fr 1fr}.listen-plan article:nth-child(3){border-left:0;padding-left:0}.listen-summary .summary-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.error-breakdown{grid-template-columns:1fr 1fr}}@media(max-width:480px){.listen-head{align-items:start}.listen-head .primary,.listen-head .outline{padding:9px}.listen-overview,.listen-stage,.listen-summary{padding:18px}.listen-stage h3{margin-top:32px;font-size:22px}.listen-summary .summary-metrics{grid-template-columns:1fr 1fr}.error-breakdown{grid-template-columns:1fr}}";
function Listening(p: {
  words: Word[];
  highlights: ReadingHighlight[];
  materials: WritingMaterial[];
  task: Task;
  active: ActiveStudy | null;
  seconds: number;
  start: (x: Task) => void;
  pause: () => void;
  finish: () => void;
  reviews: ListeningReview[];
  setReviews: (x: ListeningReview[]) => void;
  persistedSession: ListeningSession | null;
  setPersistedSession: (x: ListeningSession | null) => void;
  date: string;
  theme: DailyTheme;
  curriculumBook: CurriculumBook | null;
  setCurriculumBook: (x: CurriculumBook | null) => void;
  curriculumProgress: CurriculumProgress | null;
  setCurriculumProgress: (x: CurriculumProgress | null) => void;
}) {
  const compatibleSession = (candidate: ListeningSession | null) =>
    candidate?.queue.every((item) => "source" in item) ? candidate : null;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [themeContext, setThemeContext] = useState<ThemeContextInput | null>(null);
  const [session, setSession] = useState<ListeningSession | null>(() => compatibleSession(p.persistedSession));
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const [answerMode, setAnswerMode] = useState<ListeningAnswerMode>("english_text");
  const [recordingMeaning, setRecordingMeaning] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceController, setVoiceController] = useState<SpeechController | null>(null);
  const [analysingCurriculum, setAnalysingCurriculum] = useState(false);
  const [curriculumMessage, setCurriculumMessage] = useState("");
  useEffect(() => {
    const refresh = () => setVoices(window.speechSynthesis.getVoices());
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);
  useEffect(() => {
    if (!p.date) return;
    setThemeContext(load<ThemeContextInput | null>(`ielts-theme-context-${p.date}`, null));
  }, [p.date]);
  useEffect(() => {
    const restored = compatibleSession(p.persistedSession);
    if (!restored || restored.id === session?.id) return;
    setSession(restored);
    setAnswer(restored.currentAnswer || "");
    setChecked(restored.checked ?? null);
  }, [p.persistedSession, session?.id]);
  const plan = useMemo(
    () => {
      const currentCurriculum = curriculumCurrentSection(p.curriculumBook, p.curriculumProgress);
      return generateListeningPlan({
      dateKey: p.date || "listening-initial",
      theme: themeContext,
      fallbackTheme: p.theme,
      words: p.words,
      reviews: p.reviews,
      highlights: p.highlights,
      materials: p.materials,
      curriculum: currentCurriculum && p.curriculumBook ? {
        bookId: p.curriculumBook.id,
        bookTitle: p.curriculumBook.title,
        unitId: currentCurriculum.unit.id,
        unitLabel: currentCurriculum.unit.unitNumber ? `U${currentCurriculum.unit.unitNumber}` : currentCurriculum.unit.title,
        sectionId: currentCurriculum.section.id,
        pageStart: currentCurriculum.section.startPage,
        pageEnd: currentCurriculum.section.endPage,
        exerciseType: currentCurriculum.section.exerciseType,
        prompts: currentCurriculum.section.prompts,
        vocabulary: currentCurriculum.section.vocabulary,
      } : null,
    });
    },
    [p.date, p.theme, p.words, p.reviews, p.highlights, p.materials, themeContext, p.curriculumBook, p.curriculumProgress],
  );
  const current = session?.queue[session.index];
  const curriculumHere = curriculumCurrentSection(p.curriculumBook, p.curriculumProgress);
  const curriculumText = curriculumLocation(p.curriculumBook, p.curriculumProgress);
  const currentSource = current?.source === "curriculum"
    ? { title: curriculumText, detail: current.exerciseType || "Curriculum training" }
    : current?.source === "listening_vocabulary"
      ? { title: "LISTENING VOCABULARY", detail: "Sound → Meaning" }
      : current?.source === "review"
        ? { title: "REVIEW · Previous Listening Errors", detail: "Historical listening weakness" }
        : { title: "READING CONTEXT", detail: current?.theme || "IELTS listening practice" };
  const updateSession = (next: ListeningSession) => {
    setSession(next);
    p.setPersistedSession(next);
  };
  const running = session?.status === "active";
  const speak = (replay = false) => {
    if (!current || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(current.text);
    const preferred = voices.find((voice) => /en-GB/i.test(voice.lang));
    if (preferred) u.voice = preferred;
    u.rate = 1;
    window.speechSynthesis.speak(u);
    if (replay && session)
      updateSession({ ...session, currentReplays: session.currentReplays + 1 });
  };
  const begin = () => {
    const next: ListeningSession = {
      id: `listening-${Date.now()}`,
      planId: plan.id,
      date: p.date || localDate(),
      theme: plan.theme,
      queue: plan.items,
      index: 0,
      answers: [],
      startedAt: new Date().toISOString(),
      status: "active",
      currentAnswer: "",
      currentReplays: 0,
    };
    updateSession(next);
    setAnswer("");
    setChecked(null);
    setAnswerMode("english_text");
    setVoiceMessage("");
  };
  const check = () => {
    if (!current || !session || !running) return;
    const evaluation = evaluateListeningResponse(current, answer, answerMode);
    const wordResult = evaluation.wordResult
      ? { ...evaluation.wordResult, replayCount: session.currentReplays }
      : undefined;
    setChecked(evaluation.correct);
    updateSession({ ...session, currentAnswer: answer, checked: evaluation.correct, currentWordResult: wordResult });
  };
  const nextItem = () => {
    if (!current || checked === null || !session) return;
    const mistakeType: ListeningErrorType | "" = checked ? "" : classifyListeningError({
      item: current,
      answer,
      replays: session.currentReplays,
      knownWords: p.words.map((word) => word.word),
    });
    const next = new Date();
    next.setDate(next.getDate() + (checked ? 4 : 0));
    const record: ListeningReview = {
      id: Date.now().toString(),
      sourceType: current.source,
      sourceId: current.sourceId,
      trainingType: current.trainingType,
      text: current.text,
      meaning: current.meaning,
      userAnswer: answer,
      correct: checked,
      rating: checked ? "good" : "again",
      mistakeType,
      lastReviewedAt: localDate(),
      nextReviewAt: localDate(next),
      reviewCount: 1,
      replays: session.currentReplays,
    };
    p.setReviews([...p.reviews, record]);
    const nextSession = {
      ...session,
      index: session.index + 1,
      status:
        session.index + 1 >= session.queue.length
          ? ("complete" as const)
          : ("active" as const),
      answers: [
        ...session.answers,
        {
          itemId: current.id,
          answer,
          correct: checked,
          replays: session.currentReplays,
          mistakeType,
          source: current.source,
          wordResult: session.currentWordResult,
        },
      ],
      currentAnswer: "",
      currentReplays: 0,
      checked: undefined,
      currentWordResult: undefined,
    };
    if (nextSession.status === "complete") {
      const completed = { ...nextSession, duration: p.seconds };
      const performance = buildListeningPerformance({
        sessionId: completed.id,
        date: completed.date,
        duration: p.seconds,
        theme: completed.theme,
        answers: completed.answers,
      });
      const stored = load<ListeningPerformance[]>("ielts-listening-performance", []);
      localStorage.setItem("ielts-listening-performance", JSON.stringify([
        ...stored.filter((item) => item.sessionId !== completed.id),
        performance,
      ]));
      const curriculumAnswers = completed.answers.filter((answer) => answer.source === "curriculum");
      if (curriculumAnswers.length && p.curriculumBook && curriculumHere) {
        const curriculumAccuracy = curriculumAnswers.filter((answer) => answer.correct).length / curriculumAnswers.length;
        const averageReplays = curriculumAnswers.reduce((total, answer) => total + answer.replays, 0) / curriculumAnswers.length;
        if (curriculumAccuracy >= 0.6 && averageReplays < 3) {
          p.setCurriculumProgress(advanceCurriculumProgress(p.curriculumBook, p.curriculumProgress, completed.date));
          setCurriculumMessage("教材本节已完成，下一次将进入下一练习。");
        } else {
          p.setCurriculumProgress({
            ...(p.curriculumProgress || { bookId: p.curriculumBook.id, completedPages: [] }),
            lastStudiedAt: completed.date,
          });
          setCurriculumMessage("本节会保留到下一次，先把听辨稳定下来。");
        }
      }
      updateSession(completed);
    } else updateSession(nextSession);
    setAnswer("");
    setChecked(null);
    setAnswerMode("english_text");
  };
  const pauseOrResume = () => {
    if (!session) return;
    if (running) {
      updateSession({ ...session, status: "paused" });
    } else {
      updateSession({ ...session, status: "active" });
    }
  };
  const counts = (type: ListeningType) => plan.items.filter((item) => item.trainingType === type).length;
  const startMeaningVoice = () => {
    if (recordingMeaning) {
      voiceController?.stop();
      setRecordingMeaning(false);
      return;
    }
    setAnswerMode("chinese_voice");
    const controller = startBrowserTranscription((text) => {
      setAnswer(text);
      setRecordingMeaning(false);
      setVoiceMessage(`你说：${text}`);
      if (session) updateSession({ ...session, currentAnswer: text });
    }, (message) => {
      setRecordingMeaning(false);
      setVoiceMessage("当前浏览器无法识别中文语音，可直接输入中文意思。");
      if (message) setVoiceMessage("当前浏览器无法识别中文语音，可直接输入中文意思。");
    }, "zh-CN");
    if (controller) {
      setVoiceController(controller);
      setRecordingMeaning(true);
      setVoiceMessage("正在聆听中文意思…");
    }
  };
  const uploadCurriculum = async (file: File | undefined) => {
    if (!file || analysingCurriculum) return;
    setAnalysingCurriculum(true);
    setCurriculumMessage("Analysing curriculum...");
    try {
      const book = await parseCurriculumUpload(file);
      const initial = curriculumCurrentSection(book, null);
      p.setCurriculumBook(book);
      p.setCurriculumProgress({
        bookId: book.id,
        currentUnitId: initial?.unit.id,
        currentSectionId: initial?.section.id,
        currentPage: initial?.section.startPage,
        completedPages: [],
      });
      setCurriculumMessage("Curriculum ready.");
    } catch {
      setCurriculumMessage("Could not fully analyse this curriculum. Retry upload.");
      p.setCurriculumBook(null);
      p.setCurriculumProgress(null);
    } finally {
      setAnalysingCurriculum(false);
    }
  };
  const done = session?.answers.length || 0;
  return (
    <section className="listening">
      <style>{listeningCss}</style>
      <div className="listen-head">
        <div>
          <p className="eyebrow">LISTENING TRAINING</p>
          <h2>Today's Listening</h2>
        </div>
        <div className="listen-head-actions">
          <label className="outline curriculum-upload">
            {p.curriculumBook ? "Replace curriculum" : "Upload curriculum"}
            <input type="file" accept="application/pdf,text/plain,.pdf,.txt" onChange={(event) => { void uploadCurriculum(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
          {session && session.status !== "complete" && (
            <button className="outline" onClick={pauseOrResume}>{running ? "Pause" : "Resume"}</button>
          )}
        </div>
      </div>
      {!session || session.status === "complete" ? (
        <>
          <section className="listen-overview">
            <p className="eyebrow">TODAY'S LISTENING</p>
            <h3>{plan.theme}</h3>
            <p>{plan.subtopics.join(" · ")}</p>
            <div className="listen-meta"><span>{plan.items.length} items</span><span>about 15 min</span><span>British English · 1x</span></div>
            <div className="listen-plan">
              <article><b>Word Recognition</b><small>{counts("word")} items</small></article>
              <article><b>Chunk Recognition</b><small>{counts("chunk")} items</small></article>
              <article><b>Sentence Dictation</b><small>{counts("sentence")} items</small></article>
              <article><b>Mini Listening</b><small>{counts("mini")} item</small></article>
            </div>
            <div className="listen-curriculum">
              <div>
                <p className="eyebrow">CURRICULUM</p>
                <strong>{p.curriculumBook ? curriculumText : "No listening curriculum uploaded."}</strong>
                <small>{analysingCurriculum ? "Analysing curriculum..." : curriculumMessage || p.curriculumBook?.parserNote || "上传教材后，系统只会使用实际可解析到的课程位置。"}</small>
              </div>
              <label className="outline curriculum-upload">
                {p.curriculumBook ? "Upload / Replace" : "Upload"}
                <input type="file" accept="application/pdf,text/plain,.pdf,.txt" onChange={(event) => { void uploadCurriculum(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </label>
            </div>
            {plan.items.length ? (
              <button className="primary" onClick={begin}>START TRAINING</button>
            ) : (
              <p className="analysis-message">先上传可解析教材，或在单词、复习、阅读中积累可用于听力的真实内容。</p>
            )}
          </section>
          {session?.status === "complete" && <SessionSummary session={session} />}
        </>
      ) : current ? (
        <>
          <div className="listen-session-bar"><span><b>{currentSource.title}</b><small>{currentSource.detail}</small></span><b>{done + 1} / {session.queue.length}</b><span>{running ? "Training" : "Paused"}</span></div>
          <article className="listen-stage">
            <div className="listen-stage-top"><span>{current.trainingType === "word" ? "WORD RECOGNITION" : current.trainingType === "chunk" ? "CHUNK RECOGNITION" : current.trainingType === "sentence" ? "SENTENCE DICTATION" : "MINI LISTENING"}</span><span>Replay ×{session.currentReplays}</span></div>
            <h3>{current.trainingType === "word" ? "What did you hear?" : current.trainingType === "chunk" ? "Type the phrase you hear." : current.trainingType === "sentence" ? "Write the sentence you hear." : "Listen, then type the key idea."}</h3>
            <p>{current.trainingType === "mini" ? "Transcript stays hidden until you check your answer." : "Use replay when you genuinely need it."}</p>
            <div className="listen-controls"><button className="listen-play" onClick={() => speak(false)} disabled={!running}>● Play audio</button><button onClick={() => speak(true)} disabled={!running}>Replay</button></div>
            {current.trainingType === "word" && (
              <div className="word-answer-mode">
                <button className={answerMode === "english_text" ? "active" : ""} onClick={() => { setAnswerMode("english_text"); setVoiceMessage(""); }} disabled={!running}>英文拼写</button>
                <button className={answerMode === "chinese_text" ? "active" : ""} onClick={() => { setAnswerMode("chinese_text"); setVoiceMessage(""); }} disabled={!running}>中文意思</button>
                <button onClick={startMeaningVoice} disabled={!running}>🎙 {recordingMeaning ? "Listening..." : "说中文意思"}</button>
              </div>
            )}
            <input className="listen-answer" value={answer} onChange={(event) => { const value = event.target.value; setAnswer(value); updateSession({ ...session, currentAnswer: value }); }} placeholder={current.trainingType === "word" && answerMode !== "english_text" ? "输入中文意思…" : "Type what you heard…"} disabled={checked !== null || !running} />
            {voiceMessage && current.trainingType === "word" && <p className="listen-voice-message">{voiceMessage}</p>}
            {checked === null ? (
              <div className="listen-check"><small>{answer.trim() ? answer.trim().split(/\s+/).length : 0} words</small><button className="primary" onClick={check} disabled={!answer.trim() || !running}>CHECK</button></div>
            ) : (
              <div className="listen-result">
                <p className={checked ? "correct" : "wrong"}>{checked ? "Correct." : "Not quite."}</p>
                <p>Your answer<br /><strong>{answer || "—"}</strong></p>
                <p>Correct answer<br /><strong>{current.text}</strong></p>
                {current.trainingType === "word" && session.currentWordResult && <p>Meaning recognised {session.currentWordResult.meaningUnderstood ? "✓" : "—"}{session.currentWordResult.spellingCorrect !== undefined ? ` · Spelling ${session.currentWordResult.spellingCorrect ? "✓" : "—"}` : ""}</p>}
                {current.meaning && <p>Meaning · {current.meaning}</p>}
                {!checked && <p className="listen-diagnosis">自动诊断：{listeningErrorLabel[classifyListeningError({ item: current, answer, replays: session.currentReplays, knownWords: p.words.map((word) => word.word) })]}</p>}
                <button className="primary listen-next" onClick={nextItem}>{done + 1 === session.queue.length ? "FINISH SESSION" : "NEXT"}</button>
              </div>
            )}
            {!running && <p className="listen-pause-note">训练已暂停。恢复后继续计时与作答。</p>}
          </article>
        </>
      ) : null}
    </section>
  );
  /* Previous settings-heavy Listening UI retained temporarily for migration reference.
  return (
    <section className="listening">
      <style>{listeningCss}</style>
      <div className="listen-head">
        <div>
          <p className="eyebrow">LISTENING TRAINING</p>
          <h2>Today's Listening</h2>
        </div>
        {!session || session.status === "complete" ? (
          <button className="primary" onClick={begin}>
            START TRAINING
          </button>
        ) : (
          <button className="outline" onClick={p.pause}>
            Pause
          </button>
        )}
      </div>
      {!session || session.status === "complete" ? (
        <>
          <div className="listen-plan">
            <article>
              <b>Word Recognition</b>
              <small>
                {Math.min(settings.wordCount, items.word.length)} items
              </small>
            </article>
            <article>
              <b>Chunk Recognition</b>
              <small>
                {Math.min(settings.chunkCount, items.chunk.length)} items
              </small>
            </article>
            <article>
              <b>Sentence Dictation</b>
              <small>
                {Math.min(settings.sentenceCount, items.sentence.length)} items
              </small>
            </article>
            <article>
              <b>Mini Listening</b>
              <small>
                {Math.min(settings.miniCount, items.mini.length)} items
              </small>
            </article>
          </div>
          {session?.status === "complete" && (
            <SessionSummary
              session={session}
              seconds={p.seconds}
              finish={p.finish}
            />
          )}
        </>
      ) : (
        <div className="listen-session-bar">
          <span>Today's Listening</span>
          <b>
            {done + 1} / {session.queue.length}
          </b>
          <span>{current?.trainingType}</span>
        </div>
      )}
      <div className="listen-layout">
        <main>
          {session?.status === "active" && current ? (
            <article className="listen-stage">
              <div className="listen-stage-top">
                <span>
                  {current.trainingType === "word"
                    ? "WORD RECOGNITION"
                    : current.trainingType === "chunk"
                      ? "CHUNK RECOGNITION"
                      : current.trainingType === "sentence"
                        ? "SENTENCE DICTATION"
                        : "MINI LISTENING"}
                </span>
                <span>Replay ×{Math.max(0, replays - 1)}</span>
              </div>
              <h3>
                {current.trainingType === "word"
                  ? "What did you hear?"
                  : current.trainingType === "chunk"
                    ? "Type the phrase you hear."
                    : current.trainingType === "sentence"
                      ? "Write the sentence you hear."
                      : "Listen once, then type the main idea."}
              </h3>
              <p>
                {current.trainingType === "mini"
                  ? "Transcript stays hidden until you check your answer."
                  : "Use replay when you genuinely need it."}
              </p>
              <div className="listen-controls">
                <button
                  className="listen-play"
                  onClick={() => speak(current.text)}
                >
                  ● Play audio
                </button>
                <button onClick={() => speak(current.text)}>Replay</button>
              </div>
              <input
                className="listen-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type what you heard…"
                disabled={checked !== null}
              />
              {checked === null ? (
                <div className="listen-check">
                  <small>
                    {answer.trim() ? answer.trim().split(/\\s+/).length : 0}{" "}
                    words
                  </small>
                  <button className="primary" onClick={check}>
                    CHECK
                  </button>
                </div>
              ) : (
                <div className="listen-result">
                  <p className={checked ? "correct" : "wrong"}>
                    {checked ? "Correct." : "Not quite."}
                  </p>
                  <p>
                    Your answer
                    <br />
                    <strong>{answer || "—"}</strong>
                  </p>
                  <p>
                    Correct answer
                    <br />
                    <strong>{current.text}</strong>
                  </p>
                  {current.meaning && <p>Meaning · {current.meaning}</p>}
                  {!checked && (
                    <>
                      <select
                        className="mistake-select"
                        value={mistake}
                        onChange={(e) => setMistake(e.target.value)}
                      >
                        {[
                          "Knew it but did not recognize the sound",
                          "Connected speech",
                          "Spelling",
                          "Vocabulary",
                          "Grammar expectation",
                          "Lost attention",
                          "Too fast",
                          "Other",
                        ].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                      <small>
                        Known but not heard is tracked separately for Word Bank
                        items.
                      </small>
                    </>
                  )}
                  <div className="listen-ratings">
                    {(["again", "hard", "good", "easy"] as const).map((x) => (
                      <button key={x} onClick={() => rate(x)}>
                        {x[0].toUpperCase() + x.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ) : !session ? (
            <div className="listen-empty">
              This training is generated from your Word Bank, reading highlights
              and writing materials. Click Start Training and the site will
              decide what to practise today.
            </div>
          ) : null}
        </main>
        <aside className="listen-rail">
          <p className="eyebrow">LISTENING SETTINGS</p>
          <h3>Voice & daily items</h3>
          <div className="listen-settings">
            <label>
              Accent
              <select
                value={settings.accent}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    accent: e.target.value as ListeningSettings["accent"],
                  })
                }
              >
                <option>British English</option>
                <option>American English</option>
              </select>
            </label>
            <label>
              Voice
              <select
                value={settings.voice}
                onChange={(e) =>
                  setSettings({ ...settings, voice: e.target.value })
                }
              >
                <option value="">System default</option>
                {voices
                  .filter((v) => /en-/i.test(v.lang))
                  .map((v) => (
                    <option value={v.name} key={v.name}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Speed
              <select
                value={settings.speed}
                onChange={(e) =>
                  setSettings({ ...settings, speed: Number(e.target.value) })
                }
              >
                {[0.8, 0.9, 1, 1.1, 1.2].map((x) => (
                  <option value={x} key={x}>
                    {x}x
                  </option>
                ))}
              </select>
            </label>
            <div className="count-grid">
              {(
                [
                  ["wordCount", "Words"],
                  ["chunkCount", "Chunks"],
                  ["sentenceCount", "Sentences"],
                  ["miniCount", "Mini"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    value={settings[key]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        [key]: Math.max(0, Number(e.target.value)),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="listen-insights">
            <p className="eyebrow">LISTENING INSIGHTS</p>
            {insight.map(([name, count]) => (
              <div key={name}>
                <span>{name}</span>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
} */
}
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function SessionSummary(p: { session: ListeningSession }) {
  const performance = buildListeningPerformance({
    sessionId: p.session.id,
    date: p.session.date,
    duration: p.session.duration || 0,
    theme: p.session.theme,
    answers: p.session.answers,
  });
  return (
    <div className="listen-summary">
      <p className="eyebrow">SESSION COMPLETE</p>
      <h2>训练已保存，下一次会从今天的错误继续出题。</h2>
      <div className="summary-metrics">
        <span>
          Time<b>{formatMinutes(performance.duration)}</b>
        </span>
        <span>
          Accuracy<b>{performance.accuracy}%</b>
        </span>
        <span>
          Correct<b>{performance.correctItems} / {performance.totalItems}</b>
        </span>
        <span>
          Replay<b>{performance.replayCount}</b>
        </span>
        <span>
          Main weakness<b>{performance.primaryWeakness ? listeningErrorLabel[performance.primaryWeakness] : "—"}</b>
        </span>
      </div>
      <div className="error-breakdown">
        {(Object.keys(listeningErrorLabel) as ListeningErrorType[]).map((type) => (
          <span key={type}>{listeningErrorLabel[type]}<b>{performance.errorBreakdown[type]}</b></span>
        ))}
      </div>
    </div>
  );
}

const writingCss =
  ".writing{padding-top:34px;max-width:1120px;margin:auto}.writing-head{display:flex;justify-content:space-between;align-items:end}.writing-head h2{font-size:22px;margin:6px 0}.writing-counts{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:22px 0}.writing-counts article,.writing-card,.topic-card,.writing-panel,.argument-card{background:#fff;border:1px solid #e8e8e5;border-radius:9px;padding:15px}.writing-counts b{display:block;font-size:14px}.writing-counts small{font-size:10px;color:#888;display:block;margin-top:5px}.writing-grid{display:grid;grid-template-columns:minmax(0,1.45fr) 285px;gap:34px}.topic-head{display:flex;justify-content:space-between;align-items:end;margin:34px 0 12px}.topic-head h3{font-size:18px;margin:6px 0}.topic-library{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.topic-card{min-height:115px;text-align:left}.topic-card strong{font-size:13px}.topic-card span{display:block;font-size:10px;color:#888;margin-top:10px;line-height:1.5}.writing-card h3{font:20px Georgia,serif;line-height:1.5;margin:17px 0}.writing-card input,.material-form input,.material-form textarea,.argument-form input,.argument-form textarea{border:1px solid #e8e8e5;border-radius:5px;padding:9px;width:100%;font-size:12px}.writing-card .answer{display:flex;gap:8px}.writing-check{margin-top:14px;padding-top:14px;border-top:1px solid #e8e8e5;font-size:12px}.writing-rates{display:flex;gap:6px;margin-top:10px}.writing-rates button,.builder-parts button{border:1px solid #ddd;background:#fff;border-radius:5px;padding:7px 9px;font-size:10px}.material-form,.argument-form{display:grid;gap:9px}.material-form select,.argument-form select{border:1px solid #e8e8e5;border-radius:5px;padding:8px;font-size:11px;background:#fff}.material-form textarea,.argument-form textarea{min-height:70px;resize:vertical}.writing-side{border-left:1px solid #e8e8e5;padding-left:22px}.writing-side h3{font-size:16px;margin:7px 0 12px}.writing-side p:not(.eyebrow){font-size:11px;line-height:1.6;color:#777}.material-list{border-top:1px solid #e8e8e5}.material-list article{border-bottom:1px solid #e8e8e5;padding:10px 0}.material-list b{font-size:12px}.material-list span{font-size:10px;color:#888;display:block;margin-top:4px}.builder-parts{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}.builder-parts button{font-size:11px}.builder-result{font:15px/1.6 Georgia,serif;border-top:1px solid #e8e8e5;padding-top:15px}.argument-card{margin-top:9px}.argument-card strong{font-size:13px}.argument-card p{font-size:11px;line-height:1.55;color:#666;margin:5px 0}.paragraph-order{display:grid;gap:7px;margin:13px 0}.paragraph-order article{display:flex;gap:10px;border:1px solid #e8e8e5;border-radius:6px;padding:9px;font-size:11px}.paragraph-order button{border:0;background:none;color:#777}.writing-timer{display:flex;justify-content:space-between;background:#f2f2ef;border-radius:8px;padding:11px 13px;margin-bottom:14px;font-size:11px}.writing-timer b{font-size:15px}@media(max-width:850px){.writing-grid{grid-template-columns:1fr}.writing-side{border-left:0;border-top:1px solid #e8e8e5;padding:20px 0 0}.writing-counts{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){.topic-library{grid-template-columns:1fr 1fr}.writing-counts{grid-template-columns:1fr 1fr}.writing-head{align-items:start;gap:12px}.writing-card .answer{display:grid}}";
function RetiredWriting(p: {
  materials: WritingMaterial[];
  setMaterials: (x: WritingMaterial[]) => void;
  argumentsCards: ArgumentCard[];
  setArgumentsCards: (x: ArgumentCard[]) => void;
  words: Word[];
  task: Task;
  active: ActiveStudy | null;
  seconds: number;
  start: (x: Task) => void;
  pause: () => void;
  finish: () => void;
}) {
  const [topic, setTopic] = useState<ReadingTopic>("Education"),
    [tab, setTab] = useState<
      "home" | "add" | "argument" | "builder" | "paragraph"
    >("home"),
    [recall, setRecall] = useState(""),
    [checked, setChecked] = useState<boolean | null>(null),
    [index, setIndex] = useState(0),
    [parts, setParts] = useState([
      "Excessive advertising",
      "may encourage",
      "consumers",
      "to make",
      "unnecessary purchases",
      "therefore",
    ]),
    [paragraph, setParagraph] = useState<string[]>([]);
  const all = [
    ...p.materials,
    ...p.words.map(
      (w, i): WritingMaterial => ({
        id: "word-" + i,
        type: "vocabulary",
        content: w.word,
        meaning: w.zh,
        topic: "Education",
        source: "Word Bank",
        example: w.example,
        masteryLevel: 1,
        reviewCount: 0,
        nextReviewAt: localDate(),
      }),
    ),
  ];
  const recallItems = all.filter(
    (x) =>
      x.type === "phrase" ||
      x.type === "sentence_pattern" ||
      x.type === "vocabulary",
  );
  const item = recallItems[index % Math.max(recallItems.length, 1)];
  const running = p.active?.taskId === p.task.id;
  const rate = (value: "again" | "hard" | "good" | "easy") => {
    if (!item) return;
    const days =
      value === "again" ? 0 : value === "hard" ? 1 : value === "good" ? 4 : 8;
    const d = new Date();
    d.setDate(d.getDate() + days);
    p.setMaterials(
      p.materials.map((x) =>
        x.id === item.id
          ? {
              ...x,
              reviewCount: (x.reviewCount || 0) + 1,
              masteryLevel: Math.min(
                5,
                (x.masteryLevel || 1) +
                  (value === "good" || value === "easy" ? 1 : 0),
              ),
              lastReviewedAt: localDate(),
              nextReviewAt: localDate(d),
            }
          : x,
      ),
    );
    setIndex(index + 1);
    setRecall("");
    setChecked(null);
  };
  const addMaterial = (form: HTMLFormElement) => {
    const data = new FormData(form),
      content = String(data.get("content") || "").trim();
    if (!content) return;
    const material: WritingMaterial = {
      id: Date.now().toString(),
      type: data.get("type") as WritingMaterial["type"],
      content,
      meaning: String(data.get("meaning") || ""),
      topic: data.get("topic") as ReadingTopic,
      source: "User",
      example: String(data.get("example") || ""),
      masteryLevel: 1,
      reviewCount: 0,
      nextReviewAt: localDate(),
      createdAt: localDate(),
    };
    p.setMaterials([material, ...p.materials]);
    form.reset();
    setTab("home");
  };
  const addArgument = (form: HTMLFormElement) => {
    const d = new FormData(form);
    const card: ArgumentCard = {
      id: Date.now().toString(),
      topic: d.get("topic") as ReadingTopic,
      position: String(d.get("position") || ""),
      claim: String(d.get("claim") || ""),
      reason: String(d.get("reason") || ""),
      example: String(d.get("example") || ""),
      impact: String(d.get("impact") || ""),
      keywords: String(d.get("keywords") || ""),
      relatedPhrases: "",
      createdAt: localDate(),
    };
    if (card.claim) {
      p.setArgumentsCards([card, ...p.argumentsCards]);
      setTab("home");
    }
  };
  const currentArg =
    p.argumentsCards.find((x) => x.topic === topic) || p.argumentsCards[0];
  const target = [
    "Excessive advertising",
    "may encourage",
    "consumers",
    "to make",
    "unnecessary purchases",
    "therefore",
  ];
  const correct = parts.join(" ") === target.join(" ");
  return (
    <section className="writing">
      <style>{writingCss}</style>
      <div className="writing-head">
        <div>
          <p className="eyebrow">WRITING TRAINING</p>
          <h2>Build language you can actually use.</h2>
        </div>
      </div>
      <div className="writing-counts">
        <article>
          <b>Phrase Recall</b>
          <small>{all.filter((x) => x.type === "phrase").length} items</small>
        </article>
        <article>
          <b>Sentence Patterns</b>
          <small>
            {
              all.filter(
                (x) => x.type === "sentence_pattern" || x.type === "sentence",
              ).length
            }{" "}
            items
          </small>
        </article>
        <article>
          <b>Argument Cards</b>
          <small>{p.argumentsCards.length} items</small>
        </article>
        <article>
          <b>Sentence Builder</b>
          <small>1 exercise</small>
        </article>
        <article>
          <b>Paragraph Builder</b>
          <small>{currentArg ? 1 : 0} exercise</small>
        </article>
      </div>
      <div className="writing-grid">
        <main>
          {tab === "home" && (
            <>
              <div className="writing-card">
                <p className="eyebrow">TODAY'S WRITING REVIEW</p>
                {item ? (
                  <>
                    <h3>
                      {item.meaning || "Write the expression from memory."}
                    </h3>
                    <div className="answer">
                      <input
                        value={recall}
                        onChange={(e) => setRecall(e.target.value)}
                        placeholder="Write the English expression…"
                      />
                      <button
                        className="primary"
                        onClick={() =>
                          setChecked(
                            normalize(recall) === normalize(item.content),
                          )
                        }
                      >
                        CHECK
                      </button>
                    </div>
                    {checked !== null && (
                      <div className="writing-check">
                        <b className={checked ? "correct" : "wrong"}>
                          {checked ? "Correct." : "Try this answer."}
                        </b>
                        <p>{item.content}</p>
                        <small>{item.example}</small>
                        <div className="writing-rates">
                          {(["again", "hard", "good", "easy"] as const).map(
                            (x) => (
                              <button key={x} onClick={() => rate(x)}>
                                {x}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="listen-empty">
                    Add phrases, patterns or vocabulary to begin active recall.
                  </div>
                )}
              </div>
              <div className="topic-head">
                <div>
                  <p className="eyebrow">TOPIC LIBRARY</p>
                  <h3>Long-term writing components</h3>
                </div>
                <button className="outline" onClick={() => setTab("add")}>
                  + Add material
                </button>
              </div>
              <div className="topic-library">
                {[
                  "Education",
                  "Technology",
                  "Environment",
                  "Advertising",
                  "Society",
                  "Economy",
                  "Government",
                  "Work",
                  "Health",
                  "Crime",
                  "Culture",
                  "Media",
                  "Other",
                ].map((x) => {
                  const n = all.filter((m) => m.topic === x).length,
                    a = p.argumentsCards.filter((m) => m.topic === x).length;
                  return (
                    <button
                      className="topic-card"
                      key={x}
                      onClick={() => setTopic(x as ReadingTopic)}
                    >
                      <strong>{x}</strong>
                      <span>
                        Materials {n}
                        <br />
                        Arguments {a}
                        <br />
                        Paragraphs 0
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {tab === "add" && (
            <form
              className="material-form writing-panel"
              onSubmit={(e) => {
                e.preventDefault();
                addMaterial(e.currentTarget);
              }}
            >
              <p className="eyebrow">WRITING MATERIAL</p>
              <input
                name="content"
                placeholder="Phrase, sentence pattern or transition"
              />
              <input name="meaning" placeholder="Chinese meaning / logic" />
              <textarea name="example" placeholder="IELTS example" />
              <select name="type">
                <option value="phrase">Phrase</option>
                <option value="sentence_pattern">Sentence Pattern</option>
                <option value="transition">Transition</option>
                <option value="example">Example</option>
              </select>
              <select name="topic">
                {readingTopics.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <button className="primary">Save Material</button>
            </form>
          )}
          {tab === "argument" && (
            <form
              className="argument-form writing-panel"
              onSubmit={(e) => {
                e.preventDefault();
                addArgument(e.currentTarget);
              }}
            >
              <p className="eyebrow">ARGUMENT CARD</p>
              <select name="topic">
                {readingTopics.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <input
                name="position"
                placeholder="Position: Positive / Negative / Balanced"
              />
              <textarea name="claim" placeholder="Claim" />
              <textarea name="reason" placeholder="Reason" />
              <textarea name="example" placeholder="Example" />
              <textarea name="impact" placeholder="Impact" />
              <input name="keywords" placeholder="Keywords, comma-separated" />
              <button className="primary">Save Argument Card</button>
            </form>
          )}
          {tab === "builder" && (
            <div className="writing-panel">
              <p className="eyebrow">SENTENCE BUILDER</p>
              <h3>Arrange the blocks into a natural sentence.</h3>
              <div className="builder-parts">
                {parts.map((x, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      setParts([...parts.slice(0, i), ...parts.slice(i + 1), x])
                    }
                  >
                    {x}
                  </button>
                ))}
              </div>
              <p className="builder-result">{parts.join(" ")}</p>
              <b className={correct ? "correct" : "wrong"}>
                {correct ? "Correct." : "Tap each block to move it to the end."}
              </b>
              <button className="outline" onClick={() => setParts(target)}>
                Show Structure
              </button>
            </div>
          )}
          {tab === "paragraph" && (
            <div className="writing-panel">
              <p className="eyebrow">PARAGRAPH BUILDER</p>
              {currentArg ? (
                <>
                  <h3>
                    Rebuild this argument using Claim → Reason → Example →
                    Impact.
                  </h3>
                  <div className="paragraph-order">
                    {[
                      currentArg.impact,
                      currentArg.example,
                      currentArg.claim,
                      currentArg.reason,
                    ].map((x, i) => (
                      <article key={i}>
                        <button onClick={() => setParagraph([...paragraph, x])}>
                          +
                        </button>
                        <span>{x}</span>
                      </article>
                    ))}
                  </div>
                  <p className="builder-result">{paragraph.join(" ")}</p>
                  <button
                    className="outline"
                    onClick={() =>
                      setParagraph([
                        currentArg.claim,
                        currentArg.reason,
                        currentArg.example,
                        currentArg.impact,
                      ])
                    }
                  >
                    Show Reference Structure
                  </button>
                </>
              ) : (
                <div className="listen-empty">
                  Add an Argument Card first; it becomes reusable paragraph
                  material.
                </div>
              )}
            </div>
          )}
        </main>
        <aside className="writing-side">
          <p className="eyebrow">WRITING BANK</p>
          <h3>{topic}</h3>
          <p>素材以可调用的组件保存，而不是埋在一篇作文里。</p>
          <div className="material-list">
            {all
              .filter((x) => x.topic === topic)
              .slice(0, 7)
              .map((x) => (
                <article key={x.id}>
                  <b>{x.content}</b>
                  <span>
                    {x.type} · L{x.masteryLevel || 1}
                  </span>
                </article>
              ))}
          </div>
          <button className="outline" onClick={() => setTab("argument")}>
            + Add Argument
          </button>
          <button className="outline" onClick={() => setTab("builder")}>
            Sentence Builder
          </button>
          <button className="outline" onClick={() => setTab("paragraph")}>
            Paragraph Builder
          </button>
          {p.argumentsCards.slice(0, 2).map((x) => (
            <article className="argument-card" key={x.id}>
              <p className="eyebrow">
                {x.topic} · {x.position}
              </p>
              <strong>{x.claim}</strong>
              <p>{x.keywords}</p>
            </article>
          ))}
        </aside>
      </div>
    </section>
  );
}

const writingPathCss = `
.writing-path{max-width:1040px;margin:0 auto;padding:32px 0 64px}.writing-path-header{padding-bottom:20px;border-bottom:1px solid var(--line)}.writing-path-header h2{font-size:27px;letter-spacing:-.8px;margin:6px 0 11px}.writing-path-meta{display:flex;flex-wrap:wrap;gap:8px;color:#666;font-size:11px}.writing-path-meta span{border:1px solid var(--line);border-radius:999px;padding:5px 9px}.writing-stages{display:flex;gap:22px;border-bottom:1px solid var(--line);margin:0 0 25px;overflow-x:auto}.writing-stages button{position:relative;flex:0 0 auto;border:0;background:none;padding:17px 0 14px;color:#999;font-size:13px;cursor:pointer}.writing-stages button.active{color:#171717;font-weight:700}.writing-stages button.active:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#171717}.writing-workspace{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:38px}.writing-question{border-bottom:1px solid var(--line);padding:0 0 23px}.writing-question h3{font:23px/1.55 Georgia,serif;margin:9px 0 0;max-width:710px}.writing-exercise{padding:24px 0}.writing-exercise h3{font-size:17px;margin:7px 0}.writing-exercise>p:not(.eyebrow){font-size:12px;line-height:1.7;color:#666;margin:0 0 16px}.writing-exercise textarea{display:block;width:100%;min-height:166px;border:1px solid var(--line);border-radius:5px;padding:13px;resize:vertical;background:#fff;font:14px/1.65 Georgia,serif}.writing-exercise.essay textarea{min-height:310px}.writing-stage-hints{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 13px}.writing-stage-hints span{border-left:2px solid #171717;padding:3px 0 3px 8px;font-size:11px;color:#666}.writing-submit{margin-top:12px}.writing-feedback{border-top:1px solid var(--line);padding-top:15px;margin-top:18px;font-size:12px}.writing-feedback p{margin:0 0 8px}.writing-feedback ul{margin:0;padding-left:18px;color:#555;display:grid;gap:5px}.writing-assets{border-left:1px solid var(--line);padding-left:23px}.writing-assets h3{font-size:16px;margin:7px 0 17px}.writing-assets section{border-top:1px solid var(--line);padding:13px 0}.writing-assets h4{font-size:11px;margin:0 0 8px}.writing-assets ul{margin:0;padding-left:15px;display:grid;gap:7px;color:#666;font-size:11px;line-height:1.5}.writing-assets p{font-size:11px;color:#777;line-height:1.55;margin:0}.writing-curriculum{display:flex;justify-content:space-between;align-items:start;gap:12px;border-bottom:1px solid var(--line);padding:0 0 15px;margin:0 0 3px}.writing-curriculum strong{display:block;font-size:12px}.writing-curriculum small{display:block;font-size:10px;line-height:1.55;color:#777;max-width:670px;margin-top:5px}.writing-upload{white-space:nowrap;cursor:pointer}.writing-upload input{display:none}@media(max-width:780px){.writing-workspace{grid-template-columns:1fr}.writing-assets{border-left:0;border-top:1px solid var(--line);padding:22px 0 0}.writing-curriculum{display:grid}.writing-stages{gap:17px}.writing-question h3{font-size:20px}}`;

function Writing(p: {
  date: string;
  fallbackTheme: DailyTheme;
  materials: WritingMaterial[];
  setMaterials: (x: WritingMaterial[]) => void;
  argumentsCards: ArgumentCard[];
  setArgumentsCards: (x: ArgumentCard[]) => void;
  words: Word[];
  curriculum: WritingCurriculum | null;
  setCurriculum: (x: WritingCurriculum | null) => void;
  curriculumProgress: WritingCurriculumProgress | null;
  setCurriculumProgress: (x: WritingCurriculumProgress | null) => void;
  plan: DailyWritingPlan | null;
  setPlan: (x: DailyWritingPlan | null) => void;
  session: WritingSession | null;
  setSession: (x: WritingSession | null) => void;
  reviewItems: ReviewItem[];
  setReviewItems: (x: ReviewItem[]) => void;
  task: Task;
  active: ActiveStudy | null;
  seconds: number;
  start: (x: Task) => void;
  pause: () => void;
  finish: () => void;
}) {
  const [themeContext, setThemeContext] = useState<ThemeContext | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  useEffect(() => {
    if (!p.date) return;
    setThemeContext(load<ThemeContext | null>(`ielts-theme-context-${p.date}`, null));
  }, [p.date]);
  const generatedPlan = useMemo(() => generateDailyWritingPlan({
    date: p.date || "writing-initial",
    themeContext,
    fallbackTheme: p.fallbackTheme.topic,
    curriculum: p.curriculum,
    progress: p.curriculumProgress,
    words: p.words.map((word) => word.word),
    historicalExpressions: p.materials.filter((item) => item.type === "phrase" || item.type === "sentence_pattern").map((item) => item.content),
  }), [p.date, themeContext, p.fallbackTheme.topic, p.curriculum, p.curriculumProgress, p.words, p.materials]);
  const plan = p.plan?.date === p.date ? p.plan : generatedPlan;
  useEffect(() => {
    if (p.date && (!p.plan || p.plan.date !== p.date)) p.setPlan(generatedPlan);
  }, [p.date, p.plan, generatedPlan, p.setPlan]);
  useEffect(() => {
    if (!p.date || !plan || (p.session?.date === p.date && p.session.question === plan.question)) return;
    p.setSession({
      id: `writing-session-${p.date}`,
      date: p.date,
      theme: plan.theme,
      question: plan.question,
      activeStage: plan.recommendedStage,
      stages: {
        ideas: { value: "" }, language: { value: "" }, sentences: { value: "" }, paragraph: { value: "" }, essay: { value: "" },
      },
    });
  }, [p.date, plan, p.session, p.setSession]);
  const session = p.session?.date === p.date ? p.session : null;
  const activeStage = session?.activeStage || plan.recommendedStage;
  const stageNames: Record<WritingStage, string> = { ideas: "观点", language: "词组", sentences: "句子", paragraph: "段落", essay: "全文" };
  const instructions: Record<WritingStage, { title: string; detail: string; placeholder: string }> = {
    ideas: { title: "观点训练", detail: "写出两个可以用于正文的核心观点；其中一个可以回应相反立场。", placeholder: "观点一：…\n理由：…\n\n观点二：…\n理由：…" },
    language: { title: "词组训练", detail: "选择今天可调用的表达，写出它们如何服务于这道题。", placeholder: "表达：…\n我会用它来说明：…\n\n表达：…\n我会用它来说明：…" },
    sentences: { title: "句子训练", detail: "把一个观点扩展成有逻辑连接的论证句。", placeholder: "观点：…\n论证句：…" },
    paragraph: { title: "段落训练", detail: "围绕一个观点写出完整正文段落：观点、解释与例子。", placeholder: "主题句：…\n解释：…\n例子：…\n结果：…" },
    essay: { title: "全文训练", detail: "完成一篇围绕今日题目的 IELTS Task 2 作文。", placeholder: "在这里完成全文…" },
  };
  const changeStage = (stage: WritingStage) => {
    if (session) p.setSession({ ...session, activeStage: stage });
  };
  const changeValue = (value: string) => {
    if (!session) return;
    p.setSession({ ...session, stages: { ...session.stages, [activeStage]: { ...session.stages[activeStage], value } } });
  };
  const submitStage = () => {
    if (!session) return;
    const stageState = session.stages[activeStage];
    const feedback = evaluateWritingStage(activeStage, stageState.value, plan.question);
    p.setSession({ ...session, stages: { ...session.stages, [activeStage]: { ...stageState, feedback, submittedAt: new Date().toISOString(), completed: !feedback.issues.length } } });
    const additions = feedback.issues.map((issue, index) => newReviewItem({
      id: `writing-feedback-${session.id}-${activeStage}-${index}`,
      parentEntityId: session.id,
      sourceModule: "writing",
      sourceId: session.id,
      skill: issue.type === "logic" ? "logic" : "production",
      reviewType: issue.type,
      prompt: issue.content,
      answer: issue.correction || issue.content,
      context: plan.question,
      difficultyLevel: 3,
      masteryStage: 1,
    }));
    if (additions.length) p.setReviewItems([...p.reviewItems.filter((item) => !additions.some((addition) => addition.id === item.id)), ...additions]);
    const current = currentWritingSection(p.curriculum, p.curriculumProgress);
    if (!feedback.issues.length && current?.stage === activeStage && p.curriculum) {
      const index = p.curriculum.sections.findIndex((section) => section.id === current.id);
      const next = p.curriculum.sections[index + 1];
      p.setCurriculumProgress({ curriculumId: p.curriculum.id, currentSectionId: next?.id || current.id, currentStage: next?.stage || current.stage, completedSectionIds: Array.from(new Set([...(p.curriculumProgress?.completedSectionIds || []), current.id])), lastStudiedAt: p.date });
      p.setPlan({ ...plan, curriculumSectionId: next?.id || current.id, recommendedStage: next?.stage || current.stage });
    }
  };
  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploadMessage("正在解析教材结构…");
    try {
      const curriculum = await parseWritingCurriculumUpload(file);
      const first = curriculum.sections[0];
      p.setCurriculum(curriculum);
      p.setCurriculumProgress({ curriculumId: curriculum.id, currentSectionId: first?.id, currentStage: first?.stage || "ideas", completedSectionIds: [] });
      p.setPlan({ ...plan, curriculumSectionId: first?.id, recommendedStage: first?.stage || "ideas" });
      setUploadMessage(curriculum.parserNote || "教材已解析。");
    } catch {
      setUploadMessage("无法解析这份教材，请尝试可复制文本的 PDF、TXT 或 DOCX 文件。");
    }
  };
  const stage = instructions[activeStage];
  const currentSection = currentWritingSection(p.curriculum, p.curriculumProgress);
  const assets = {
    ideas: [...plan.ideas, ...p.argumentsCards.filter((card) => card.topic === plan.theme).map((card) => card.claim)].filter(Boolean).slice(0, 3),
    expressions: [...plan.expressions, ...p.materials.filter((item) => item.topic === plan.theme).map((item) => item.content)].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).slice(0, 4),
    migration: plan.readingMigration,
  };
  return <section className="writing-path">
    <style>{writingPathCss}</style>
    <header className="writing-path-header">
      <p className="eyebrow">WRITING TRAINING</p><h2>写作训练</h2>
      <div className="writing-path-meta"><span>{p.curriculum ? `SIMON · ${currentSection?.title || stage.title}` : `课程路径 · ${stage.title}`}</span><span>今日主题 · {plan.theme}</span></div>
    </header>
    <div className="writing-curriculum">
      <div><strong>{p.curriculum ? p.curriculum.title : "还没有上传写作教材"}</strong><small>{uploadMessage || p.curriculum?.parserNote || "上传自己的 Simon 教材后，系统会只识别可靠的章节、方法和页码；没有教材时仍可按当前训练路径开始。"}</small></div>
      <label className="outline writing-upload">{p.curriculum ? "更换教材" : "上传教材"}<input type="file" accept=".pdf,.txt,.doc,.docx" onChange={(event) => handleUpload(event.target.files?.[0])} /></label>
    </div>
    <nav className="writing-stages" aria-label="写作训练阶段">{(Object.keys(stageNames) as WritingStage[]).map((stageKey) => <button key={stageKey} className={activeStage === stageKey ? "active" : ""} onClick={() => changeStage(stageKey)}>{stageNames[stageKey]}</button>)}</nav>
    <div className="writing-workspace"><main>
      <section className="writing-question"><p className="eyebrow">今日题目</p><h3>{plan.question}</h3></section>
      <section className={`writing-exercise ${activeStage === "essay" ? "essay" : ""}`}><p className="eyebrow">当前训练 · {stageNames[activeStage]}</p><h3>{stage.title}</h3><p>{stage.detail}</p>
        {activeStage === "language" && <div className="writing-stage-hints">{assets.expressions.map((expression) => <span key={expression}>{expression}</span>)}</div>}
        {activeStage === "ideas" && <div className="writing-stage-hints">{assets.ideas.slice(0, 2).map((idea) => <span key={idea}>{idea}</span>)}</div>}
        <textarea value={session?.stages[activeStage].value || ""} onChange={(event) => changeValue(event.target.value)} placeholder={stage.placeholder} />
        <button className="primary writing-submit" onClick={submitStage}>提交</button>
        {session?.stages[activeStage].feedback && <div className="writing-feedback"><p><b>{session.stages[activeStage].feedback?.summary}</b></p>{session.stages[activeStage].feedback?.issues.length ? <ul>{session.stages[activeStage].feedback?.issues.map((issue, index) => <li key={index}>{issue.content}{issue.correction ? ` 建议：${issue.correction}` : ""}</li>)}</ul> : <p>这一阶段已记录；你可以继续当前训练，或按自己的节奏切换阶段。</p>}</div>}
      </section>
    </main><aside className="writing-assets"><p className="eyebrow">今日可调用</p><h3>围绕这道题的材料</h3><section><h4>观点</h4><ul>{assets.ideas.length ? assets.ideas.map((idea) => <li key={idea}>{idea}</li>) : <li>完成阅读后，这里会显示可迁移的观点。</li>}</ul></section><section><h4>表达</h4><ul>{assets.expressions.map((expression) => <li key={expression}>{expression}</li>)}</ul></section><section><h4>阅读迁移</h4><ul>{assets.migration.length ? assets.migration.map((item) => <li key={item}>{item}</li>) : <li>今天尚未读取到阅读主题；当前题目使用稳定的备用主题。</li>}</ul></section></aside></div>
  </section>;
}
