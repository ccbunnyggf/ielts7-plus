export const readingAnalysisVersion = "reading-v3-vision-service";

export type ReadingImageInput = { id: string; name: string; dataUrl: string };

export type ReadingAnalysisResult = {
  status: "completed";
  analysisVersion: string;
  imageHashes: string[];
  contentHash: string;
  title: string;
  mainTopic: string;
  subTopics: string[];
  summary: string;
  concepts: string[];
  vocabulary: string[];
  usefulExpressions: string[];
  arguments: string[];
  difficulty: "easy" | "medium" | "hard";
  sourceText: string;
  failedImageIndexes: number[];
  analysisProvider?: string;
  analysisModel?: string;
  sourceTextLength?: number;
};

export type ReadingAnalysisFailure = {
  status: "failed";
  analysisVersion: string;
  imageHashes: string[];
  contentHash: string;
  sourceText: string;
  failedImageIndexes: number[];
  reason: string;
  code?: string;
};

export type ReadingAnalysisOutcome = ReadingAnalysisResult | ReadingAnalysisFailure;

type VisionPayloadAnalysis = Omit<ReadingAnalysisResult, "status" | "analysisVersion" | "imageHashes" | "contentHash" | "failedImageIndexes">;

export type ThemeContext = {
  date: string;
  primaryTheme: string;
  secondaryThemes: string[];
  weights: Record<string, number>;
  vocabulary: string[];
  usefulExpressions: string[];
  concepts: string[];
  arguments: string[];
};

type AnalysableArticle = {
  createdAt: string;
  topic?: string;
  mainTopic?: string;
  subTopics?: string[];
  vocabulary?: string[];
  usefulExpressions?: string[];
  concepts?: string[];
  arguments?: string[];
  imageUrls?: string[];
  status: string;
};

const analysisCache = new Map<string, ReadingAnalysisOutcome>();
const visionConsentKey = "ielts-reading-vision-consent-openai-responses";

function cloneOutcome<T extends ReadingAnalysisOutcome>(outcome: T): T {
  return JSON.parse(JSON.stringify(outcome)) as T;
}

function isVisionPayloadAnalysis(value: unknown): value is VisionPayloadAnalysis {
  if (!value || typeof value !== "object") return false;
  const analysis = value as Record<string, unknown>;
  const isText = (field: string, minimum = 1) => typeof analysis[field] === "string" && analysis[field].trim().length >= minimum;
  const isTextList = (field: string) => Array.isArray(analysis[field]) && analysis[field].every((item) => typeof item === "string");
  return isText("sourceText", 80) && isText("title") && isText("mainTopic") && isText("summary") &&
    isTextList("subTopics") && isTextList("concepts") && isTextList("vocabulary") && isTextList("usefulExpressions") && isTextList("arguments") &&
    ["easy", "medium", "hard"].includes(String(analysis.difficulty));
}

async function imageHash(image: ReadingImageInput) {
  const response = await fetch(image.dataUrl);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function visionAvailable() {
  try {
    const response = await fetch("/api/reading-vision");
    const status = await response.json() as { configured?: unknown };
    return response.ok && status.configured === true;
  } catch {
    return false;
  }
}

function consentToSendImages(imageCount: number) {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(visionConsentKey) === "true") return true;
  const accepted = window.confirm(`将把当前文章的 ${imageCount} 张图片发送给已配置的 Vision 服务，用于识别和分析。只会发送本篇文章的图片，是否继续？`);
  if (accepted) localStorage.setItem(visionConsentKey, "true");
  return accepted;
}

export async function analyseReadingImages(input: { articleId: string; images: ReadingImageInput[]; force?: boolean }): Promise<ReadingAnalysisOutcome> {
  const imageHashes = await Promise.all(input.images.map(imageHash));
  const contentHash = imageHashes.join(":");
  const cacheKey = `${input.articleId}:${contentHash}:${readingAnalysisVersion}`;
  if (!input.force && analysisCache.has(cacheKey)) return cloneOutcome(analysisCache.get(cacheKey)!);
  if (!input.images.length) {
    const failed: ReadingAnalysisFailure = { status: "failed", analysisVersion: readingAnalysisVersion, imageHashes, contentHash, sourceText: "", failedImageIndexes: [], reason: "请至少上传一张文章图片" };
    analysisCache.set(cacheKey, failed);
    return cloneOutcome(failed);
  }
  if (!(await visionAvailable())) {
    const failed: ReadingAnalysisFailure = { status: "failed", analysisVersion: readingAnalysisVersion, imageHashes, contentHash, sourceText: "", failedImageIndexes: input.images.map((_, index) => index), reason: "当前环境未配置 OCR / Vision 服务" };
    analysisCache.set(cacheKey, failed);
    return cloneOutcome(failed);
  }
  if (!consentToSendImages(input.images.length)) {
    const failed: ReadingAnalysisFailure = { status: "failed", analysisVersion: readingAnalysisVersion, imageHashes, contentHash, sourceText: "", failedImageIndexes: input.images.map((_, index) => index), reason: "未授权将当前文章图片发送到 Vision 服务" };
    return failed;
  }
  let response: Response;
  try {
    response = await fetch("/api/reading-vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: input.articleId, contentHash, images: input.images }),
    });
  } catch (error) {
    const failed: ReadingAnalysisFailure = { status: "failed", analysisVersion: readingAnalysisVersion, imageHashes, contentHash, sourceText: "", failedImageIndexes: input.images.map((_, index) => index), reason: "Reading Vision 服务不可用（此部署不支持服务器分析）" };
    console.error("[Reading analysis] Vision route unavailable", { articleId: input.articleId, contentHash, error });
    analysisCache.set(cacheKey, failed);
    return cloneOutcome(failed);
  }
  const vision = await response.json().catch(() => null) as { status?: unknown; reason?: unknown; code?: unknown; provider?: unknown; model?: unknown; analysis?: unknown } | null;
  if (!response.ok || vision?.status !== "completed" || !isVisionPayloadAnalysis(vision.analysis)) {
    const failed: ReadingAnalysisFailure = {
      status: "failed",
      analysisVersion: readingAnalysisVersion,
      imageHashes,
      contentHash,
      sourceText: "",
      failedImageIndexes: input.images.map((_, index) => index),
      reason: typeof vision?.reason === "string" ? vision.reason : "Vision 服务返回了无效结果",
      code: typeof vision?.code === "string" ? vision.code : undefined,
    };
    console.info("[Reading analysis] failed", { articleId: input.articleId, contentHash, imageCount: input.images.length, reason: failed.reason });
    analysisCache.set(cacheKey, failed);
    return cloneOutcome(failed);
  }
  const analysis = vision.analysis;
  const completed: ReadingAnalysisResult = {
    status: "completed",
    analysisVersion: readingAnalysisVersion,
    imageHashes,
    contentHash,
    failedImageIndexes: [],
    ...analysis,
    analysisProvider: typeof vision.provider === "string" ? vision.provider : "unknown",
    analysisModel: typeof vision.model === "string" ? vision.model : "unknown",
    sourceTextLength: analysis.sourceText.length,
  };
  if (process.env.NODE_ENV !== "production") {
    console.info("[Reading analysis] completed", { articleId: input.articleId, contentHash, imageCount: input.images.length, sourceTextLength: completed.sourceText.length, sourceTextPreview: completed.sourceText.slice(0, 160), analysisProvider: vision.provider || "unknown", analysisVersion: readingAnalysisVersion });
  }
  analysisCache.set(cacheKey, completed);
  return cloneOutcome(completed);
}

export function invalidateReadingAnalysisCache(articleId: string, contentHash?: string) {
  for (const key of analysisCache.keys()) if (key.startsWith(`${articleId}:`) && (!contentHash || key.includes(`:${contentHash}:`))) analysisCache.delete(key);
}

export function isSuspiciousDuplicate(current: ReadingAnalysisResult, previous: Array<{ id: string; contentHash?: string; title?: string; mainTopic?: string; subTopics?: string[]; summary?: string; concepts?: string[]; vocabulary?: string[] }>) {
  const signature = JSON.stringify([current.title, current.mainTopic, current.subTopics, current.summary, current.concepts, current.vocabulary]);
  return previous.some((article) => article.contentHash && article.contentHash !== current.contentHash && JSON.stringify([article.title, article.mainTopic, article.subTopics, article.summary, article.concepts, article.vocabulary]) === signature);
}

export function buildThemeContext(articles: AnalysableArticle[], date: string): ThemeContext {
  const today = articles.filter((article) => article.createdAt === date && article.status !== "failed");
  const totals = today.reduce<Record<string, number>>((weights, article) => {
    const theme = article.mainTopic || article.topic || "General";
    const depth = Math.max(1, article.imageUrls?.length ?? 1);
    weights[theme] = (weights[theme] ?? 0) + depth;
    return weights;
  }, {});
  const sum = Object.values(totals).reduce((total, value) => total + value, 0);
  const weights = Object.fromEntries(Object.entries(totals).map(([theme, value]) => [theme, sum ? value / sum : 0]));
  const ranked = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const unique = (values: string[]) => [...new Set(values)].slice(0, 12);
  return { date, primaryTheme: ranked[0]?.[0] ?? "General", secondaryThemes: unique(today.flatMap((article) => article.subTopics ?? [])).slice(0, 4), weights, vocabulary: unique(today.flatMap((article) => article.vocabulary ?? [])), usefulExpressions: unique(today.flatMap((article) => article.usefulExpressions ?? [])), concepts: unique(today.flatMap((article) => article.concepts ?? [])), arguments: unique(today.flatMap((article) => article.arguments ?? [])) };
}

export type ReadingPerformance = { articleId: string; duration: number; difficulty?: "easy" | "medium" | "hard"; vocabularyCount: number; unknownVocabularyCount: number; comprehensionSignals: string[]; createdAt: string };
