import { env as workerBindings } from "cloudflare:workers";
import { analyseReadingImagesWithVision, isVisionConfigured, type ReadingVisionEnv, type ReadingVisionImage } from "../../readingVisionService";

type VisionRequest = {
  articleId?: unknown;
  contentHash?: unknown;
  images?: unknown;
};

function isImage(value: unknown): value is ReadingVisionImage {
  if (!value || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  return typeof image.id === "string" && typeof image.name === "string" && typeof image.dataUrl === "string";
}

// Cloudflare's native module exposes dashboard Variables and Secrets only in
// the Worker runtime. This route is server-only, so the API key stays private.
function visionEnv(): ReadingVisionEnv {
  return workerBindings as ReadingVisionEnv;
}

export function GET() {
  const configured = isVisionConfigured(visionEnv());
  return Response.json({ ok: true, configured, provider: configured ? "openai" : undefined });
}

export async function POST(request: Request) {
  let payload: VisionRequest;
  try {
    payload = await request.json() as VisionRequest;
  } catch {
    return Response.json({ ok: false, code: "IMAGE_LOAD_FAILED", message: "Vision 分析请求格式无效", status: "failed", reason: "Vision 分析请求格式无效" }, { status: 400 });
  }
  if (typeof payload.articleId !== "string" || typeof payload.contentHash !== "string" || !Array.isArray(payload.images) || !payload.images.every(isImage)) {
    return Response.json({ ok: false, code: "IMAGE_LOAD_FAILED", message: "Vision 分析请求缺少当前文章图片", status: "failed", reason: "Vision 分析请求缺少当前文章图片" }, { status: 400 });
  }
  const result = await analyseReadingImagesWithVision({ articleId: payload.articleId, contentHash: payload.contentHash, images: payload.images, env: visionEnv() });
  if (result.status === "failed") return Response.json({ ok: false, code: result.code, message: result.reason, ...result }, { status: result.code === "VISION_NOT_CONFIGURED" ? 503 : 422 });
  return Response.json({ ok: true, ...result });
}
