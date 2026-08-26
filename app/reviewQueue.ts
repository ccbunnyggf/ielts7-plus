import { dueQueue, type ReviewItem } from "./reviewEngine";

export type ReviewResult = "correct" | "partial" | "incorrect";

export type DailyReviewPlan = {
  items: ReviewItem[];
  estimatedMinutes: number;
  moduleCounts: Record<ReviewItem["sourceModule"], number>;
};

export type ReviewExercise = {
  label: string;
  instruction: string;
  answerHint: string;
  prefersVoice: boolean;
  requiresAudio: boolean;
};

const moduleWeight: Record<ReviewItem["sourceModule"], number> = {
  vocabulary: 2,
  reading: 2.2,
  listening: 2.6,
  speaking: 2.8,
  writing: 2.8,
};

export const reviewModuleLabel: Record<ReviewItem["sourceModule"], string> = {
  reading: "阅读",
  listening: "听力",
  speaking: "口语",
  writing: "写作",
  vocabulary: "词汇",
};

export function isListeningReview(item: ReviewItem) {
  return item.sourceModule === "listening" || /listen(ing)?[_ -]?(recognition|audio)|audio[_ -]?recognition/i.test(item.reviewType) || item.skill === "listening";
}

/**
 * Older saved review records did not contain an explicit source snapshot.
 * These fields are derived from the same record only; no secondary arrays are
 * consulted, so a legacy card cannot be joined to another word by index.
 */
export function hydrateLegacyReviewItem(item: ReviewItem): ReviewItem {
  const legacyListening = isListeningReview(item) && !item.audioText;
  const listeningSnapshot = legacyListening ? {
    ...item,
    prompt: "听音识别：点击播放，写下你听到的词或短语。",
    sourceDefinition: item.sourceDefinition || item.prompt.replace(/^Type what you heard \/ recall:\s*/i, ""),
    sourceExample: item.sourceExample || item.answer,
    audioText: item.answer,
    debugSource: item.debugSource || { sourceId: item.sourceId, sourceType: "legacy-listening" },
  } : item;
  if (listeningSnapshot.sourceWordId || listeningSnapshot.sourceModule !== "vocabulary") return listeningSnapshot;
  return {
    ...listeningSnapshot,
    sourceWordId: listeningSnapshot.sourceId,
    sourceDefinition: listeningSnapshot.sourceDefinition || listeningSnapshot.prompt,
    sourceExample: listeningSnapshot.sourceExample || listeningSnapshot.context,
    audioText: listeningSnapshot.audioText || (isListeningReview(listeningSnapshot) ? listeningSnapshot.answer : undefined),
    debugSource: listeningSnapshot.debugSource || { sourceId: listeningSnapshot.sourceId, sourceType: "legacy-vocabulary" },
  };
}

export function reviewDataIssue(item: ReviewItem) {
  if (!item.prompt.trim()) return "题面为空";
  if (!item.answer.trim()) return "答案为空";
  if (!item.sourceId.trim()) return "来源标识缺失";
  if (item.sourceModule === "vocabulary" && !item.sourceWordId) return "词汇来源缺失";
  if (isListeningReview(item) && !(item.audioUrl || item.audioText || item.answer)) return "听力题缺少音频资源";
  if (
    item.sourceModule === "vocabulary" &&
    item.sourceExample &&
    item.reviewType === "meaning_recall" &&
    !item.sourceExample.toLocaleLowerCase().includes(item.answer.toLocaleLowerCase())
  ) return "例句无法验证属于当前词汇";
  return null;
}

/** Keeps routine typos and already-stable items out of the recovery queue. */
export function shouldReview(item: ReviewItem) {
  const text = `${item.prompt} ${item.answer}`.trim();
  if (!text || !item.answer.trim()) return false;
  const lowValueTypo = /typo|拼写笔误/i.test(item.reviewType) && item.lapseCount === 0;
  if (lowValueTypo) return false;
  const stable = item.masteryStage >= 4 && item.reviewCount >= 2 && item.lapseCount === 0;
  return !stable || item.priority > 0;
}

function priority(item: ReviewItem) {
  return (
    moduleWeight[item.sourceModule] +
    item.difficultyLevel * 1.25 +
    item.lapseCount * 2.5 +
    item.priority * 2 +
    Math.max(0, 4 - item.masteryStage)
  );
}

function identity(item: ReviewItem) {
  const core = (item.answer || item.prompt)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return core || item.parentEntityId;
}

/** Merges equivalent recovery targets from different modules before daily mixing. */
export function selectReviewCandidates(items: ReviewItem[]) {
  const selected = new Map<string, ReviewItem>();
  for (const item of items.filter(shouldReview)) {
    const key = identity(item);
    const previous = selected.get(key);
    if (!previous || priority(item) > priority(previous)) selected.set(key, item);
  }
  return [...selected.values()];
}

export function buildDailyReviewPlan(items: ReviewItem[]): DailyReviewPlan {
  const eligible = selectReviewCandidates(items)
    .map(hydrateLegacyReviewItem)
    .filter((item) => {
      const issue = reviewDataIssue(item);
      if (issue) console.error("[Review] skipped invalid item", { id: item.id, issue, source: item.debugSource || item.sourceId });
      return !issue;
    });
  const scheduled = dueQueue(eligible, 12);
  const moduleCounts = scheduled.reduce(
    (counts, item) => ({ ...counts, [item.sourceModule]: counts[item.sourceModule] + 1 }),
    { reading: 0, listening: 0, speaking: 0, writing: 0, vocabulary: 0 } as DailyReviewPlan["moduleCounts"],
  );
  return {
    items: scheduled,
    estimatedMinutes: scheduled.length ? Math.max(1, Math.ceil(scheduled.length * 0.75)) : 0,
    moduleCounts,
  };
}

export function exerciseFor(item: ReviewItem): ReviewExercise {
  if (isListeningReview(item)) {
    return {
      label: item.sourceModule === "vocabulary" ? "词汇 · 听力识别" : "听力 · 识别训练",
      instruction: "先播放音频，再写下你听到的词、短语或意思。",
      answerHint: "输入你听到的内容或中文意思",
      prefersVoice: false,
      requiresAudio: true,
    };
  }
  switch (item.sourceModule) {
    case "reading":
      return { label: "阅读 · 关键信息回忆", instruction: "提取同义替换、逻辑或关键信息。", answerHint: "输入对应表达或答案", prefersVoice: false, requiresAudio: false };
    case "speaking":
      return { label: "口语 · 主动调用", instruction: "优先开口回答；也可以用文字记录你的新表达。", answerHint: "输入或说出新的自然表达", prefersVoice: true, requiresAudio: false };
    case "writing":
      return { label: "写作 · 句子修正", instruction: "用更自然、准确的表达重写这一处。", answerHint: "输入修正后的表达或句子", prefersVoice: false, requiresAudio: false };
    default:
      return { label: "词汇 · 主动提取", instruction: "不要先看答案，主动回忆对应英文。", answerHint: "输入英文单词或搭配", prefersVoice: false, requiresAudio: false };
  }
}

export const ratingForResult: Record<ReviewResult, "again" | "hard" | "good"> = {
  correct: "good",
  partial: "hard",
  incorrect: "again",
};
