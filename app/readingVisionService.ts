/** Server-only Reading Vision provider. Keep provider secrets out of client code. */
export type ReadingVisionImage = {
  id: string;
  name: string;
  dataUrl: string;
};

export type VisionReadingAnalysis = {
  sourceText: string;
  title: string;
  mainTopic: string;
  subTopics: string[];
  summary: string;
  concepts: string[];
  vocabulary: string[];
  usefulExpressions: string[];
  arguments: string[];
  difficulty: "easy" | "medium" | "hard";
};

export type VisionAnalysisSuccess = {
  status: "completed";
  provider: "openai";
  model: string;
  analysis: VisionReadingAnalysis;
};

export type VisionErrorCode =
  | "VISION_NOT_CONFIGURED"
  | "VISION_REQUEST_FAILED"
  | "IMAGE_LOAD_FAILED"
  | "INVALID_VISION_RESPONSE";

export type VisionAnalysisFailure = {
  status: "failed";
  code: VisionErrorCode;
  reason: string;
};

export type VisionAnalysisOutcome = VisionAnalysisSuccess | VisionAnalysisFailure;

export type ReadingVisionEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_VISION_MODEL?: string;
  NODE_ENV?: string;
};

const MAX_IMAGES = 12;
const MAX_IMAGE_DATA_URL_LENGTH = 12_000_000;

const readingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "sourceText",
    "title",
    "mainTopic",
    "subTopics",
    "summary",
    "concepts",
    "vocabulary",
    "usefulExpressions",
    "arguments",
    "difficulty",
  ],
  properties: {
    sourceText: { type: "string" },
    title: { type: "string" },
    mainTopic: { type: "string" },
    subTopics: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    concepts: { type: "array", items: { type: "string" } },
    vocabulary: { type: "array", items: { type: "string" } },
    usefulExpressions: { type: "array", items: { type: "string" } },
    arguments: { type: "array", items: { type: "string" } },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
  },
} as const;

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const cleanList = (value: unknown, maximum: number) =>
  Array.isArray(value)
    ? [...new Set(value.map(clean).filter(Boolean))].slice(0, maximum)
    : [];

const failure = (code: VisionErrorCode, reason: string): VisionAnalysisFailure => ({ status: "failed", code, reason });

// Cloudflare's explicit nodejs_compat_populate_process_env flag maps Worker
// dashboard bindings to process.env. This server-only boundary keeps secrets
// out of every client bundle.
function workerEnv(): ReadingVisionEnv {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL,
    NODE_ENV: process.env.NODE_ENV,
  };
}

function outputText(response: unknown) {
  if (!response || typeof response !== "object") return "";
  const candidate = response as { output_text?: unknown; output?: unknown };
  if (typeof candidate.output_text === "string") return candidate.output_text;
  if (!Array.isArray(candidate.output)) return "";
  return candidate.output
    .flatMap((item) => (item && typeof item === "object" && Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : []))
    .map((content) => (content && typeof content === "object" && typeof (content as { text?: unknown }).text === "string" ? (content as { text: string }).text : ""))
    .join("\n");
}

function parseAnalysis(rawText: string): VisionReadingAnalysis | null {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const sourceText = clean(parsed.sourceText);
    const title = clean(parsed.title);
    const summary = clean(parsed.summary);
    const mainTopic = clean(parsed.mainTopic);
    const difficulty = parsed.difficulty;
    if (sourceText.length < 80 || !title || !summary || !mainTopic || !["easy", "medium", "hard"].includes(String(difficulty))) return null;
    return {
      sourceText,
      title,
      mainTopic,
      subTopics: cleanList(parsed.subTopics, 5),
      summary,
      concepts: cleanList(parsed.concepts, 6),
      vocabulary: cleanList(parsed.vocabulary, 10),
      usefulExpressions: cleanList(parsed.usefulExpressions, 6),
      arguments: cleanList(parsed.arguments, 5),
      difficulty: difficulty as VisionReadingAnalysis["difficulty"],
    };
  } catch {
    return null;
  }
}

export function isVisionConfigured(env: ReadingVisionEnv = workerEnv()) {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

function validateImages(images: ReadingVisionImage[]) {
  if (!images.length) return failure("IMAGE_LOAD_FAILED", "请至少上传一张文章图片");
  if (images.length > MAX_IMAGES) return failure("IMAGE_LOAD_FAILED", `一次最多分析 ${MAX_IMAGES} 张图片`);
  if (images.some((image) => !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image.dataUrl))) return failure("IMAGE_LOAD_FAILED", "文章图片格式无效");
  if (images.some((image) => image.dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH)) return failure("IMAGE_LOAD_FAILED", "单张图片过大，无法安全发送到 Vision 服务");
  return null;
}

async function verifyContentHash(images: ReadingVisionImage[], contentHash: string) {
  try {
    const hashes = await Promise.all(images.map(async (image) => {
      const bytes = await (await fetch(image.dataUrl)).arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }));
    return hashes.join(":") === contentHash;
  } catch {
    return false;
  }
}

export async function analyseReadingImagesWithVision(input: {
  articleId: string;
  contentHash: string;
  images: ReadingVisionImage[];
  env?: ReadingVisionEnv;
}): Promise<VisionAnalysisOutcome> {
  const env = input.env ?? workerEnv();
  const imageProblem = validateImages(input.images);
  if (imageProblem) return imageProblem;
  if (!isVisionConfigured(env)) return failure("VISION_NOT_CONFIGURED", "当前环境未配置 OCR / Vision 服务");
  if (!(await verifyContentHash(input.images, input.contentHash))) return failure("IMAGE_LOAD_FAILED", "当前文章图片校验失败，请重新上传后重试");

  const apiKey = env.OPENAI_API_KEY!.trim();
  const model = env.OPENAI_VISION_MODEL?.trim() || "gpt-5.4";
  const instructions = [
    "You are a careful IELTS reading analyst. The supplied images are consecutive pages of ONE current reading article, in their upload order.",
    "First recover only the main English article body. Exclude Chinese annotations, highlights, page chrome, side vocabulary lists, handwritten notes, and unrelated UI text.",
    "Then analyse only that recovered article. Do not infer missing passages or create generic fallback content.",
    "Vocabulary must be selective: IELTS-useful, transferable words or phrases actually present in the source text. Useful expressions must be reusable in IELTS speaking or writing and occur in the article. Arguments must faithfully reflect article claims usable for IELTS discussion or writing.",
    "Return the requested JSON object. sourceText must contain the merged English main text from all pages in order. If the article cannot be recovered reliably, return empty strings and arrays rather than inventing content.",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: `Analyse article ${input.articleId}. The image sequence contains ${input.images.length} page(s).` },
            ...input.images.map((image) => ({ type: "input_image", image_url: image.dataUrl, detail: "high" })),
          ],
        }],
        text: { format: { type: "json_schema", name: "reading_analysis", strict: true, schema: readingSchema } },
      }),
    });
    const body = await response.json().catch(() => null) as { error?: { message?: string }; status?: string } | null;
    if (!response.ok) return failure("VISION_REQUEST_FAILED", "Vision 服务请求失败，请检查 Worker Secret 与模型配置后重试");
    if (body?.status && body.status !== "completed") return failure("VISION_REQUEST_FAILED", "Vision 服务未完成分析，请稍后重试");
    const analysis = parseAnalysis(outputText(body));
    if (!analysis) return failure("INVALID_VISION_RESPONSE", "Vision 服务返回的分析结果无法校验");
    if (env.NODE_ENV !== "production") {
      console.info("[Reading Vision] completed", { articleId: input.articleId, contentHash: input.contentHash, imageCount: input.images.length, sourceTextLength: analysis.sourceText.length, sourceTextPreview: analysis.sourceText.slice(0, 160), analysisProvider: "openai", analysisModel: model, analysisVersion: "reading-v3-vision-service" });
    }
    return { status: "completed", provider: "openai", model, analysis };
  } catch (error) {
    console.error("[Reading Vision] request failed", { articleId: input.articleId, contentHash: input.contentHash, imageCount: input.images.length, errorType: error instanceof Error ? error.name : "unknown" });
    return failure("VISION_REQUEST_FAILED", "Vision 服务网络请求失败，请稍后重试");
  }
}
