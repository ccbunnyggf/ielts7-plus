export type ListeningTrainingType = "word" | "chunk" | "sentence" | "mini";
export type ListeningSource =
  | "curriculum"
  | "listening_vocabulary"
  | "review"
  | "reading_context";
export type ListeningAnswerMode = "english_text" | "chinese_voice" | "chinese_text";
export type ListeningWordResult = {
  wordId: string;
  heardCorrectly: boolean;
  meaningUnderstood: boolean;
  spellingCorrect?: boolean;
  answerMode: ListeningAnswerMode;
  replayCount: number;
};
export type ListeningErrorType =
  | "sound_recognition"
  | "connected_speech"
  | "spelling"
  | "vocabulary"
  | "attention"
  | "too_fast"
  | "word_omission"
  | "unknown";

export type GeneratedListeningItem = {
  id: string;
  sourceId: string;
  source: ListeningSource;
  trainingType: ListeningTrainingType;
  text: string;
  meaning?: string;
  context?: string;
  theme?: string;
  targetVocabulary?: string[];
  acceptedMeanings?: string[];
  curriculumBookId?: string;
  curriculumUnitId?: string;
  curriculumSectionId?: string;
  pageStart?: number;
  pageEnd?: number;
  exerciseType?: string;
  difficulty: number;
  evaluation: "exact" | "keyword";
};

export type ThemeContextInput = {
  primaryTheme?: string;
  secondaryThemes?: string[];
  vocabulary?: string[];
  usefulExpressions?: string[];
  concepts?: string[];
  arguments?: string[];
};

export type ListeningGeneratorInput = {
  dateKey: string;
  theme?: ThemeContextInput | null;
  fallbackTheme?: { topic: string; subtopic: string };
  words: { word: string; zh?: string; collocation?: string; example?: string }[];
  reviews: { text: string; meaning?: string; correct: boolean; mistakeType?: string; sourceId: string }[];
  highlights: { id: string; type: string; text: string; meaning?: string; context?: string }[];
  materials: { id: string; type: string; content: string; meaning?: string; example?: string }[];
  curriculum?: {
    bookId: string;
    bookTitle: string;
    unitId?: string;
    unitLabel?: string;
    sectionId?: string;
    pageStart?: number;
    pageEnd?: number;
    exerciseType?: string;
    prompts?: string[];
    vocabulary?: string[];
  } | null;
};

export type GeneratedListeningPlan = {
  id: string;
  date: string;
  theme: string;
  subtopics: string[];
  items: GeneratedListeningItem[];
};

export type ListeningPerformance = {
  id: string;
  date: string;
  sessionId: string;
  totalItems: number;
  correctItems: number;
  accuracy: number;
  replayCount: number;
  duration: number;
  errorBreakdown: Record<ListeningErrorType, number>;
  primaryWeakness?: ListeningErrorType;
  theme?: string;
  vocabularyRecognitionScore?: number;
  curriculumAccuracy?: number;
  curriculumCompletion?: number;
  reviewAccuracy?: number;
};

const listeningMeanings: Record<string, string[]> = {
  accessibility: ["可访问性", "易接近", "容易使用"],
  sustainable: ["可持续的", "可持续"],
  substantial: ["大量的", "显著的", "可观的"],
  conservation: ["保护", "保育", "保存"],
  inequality: ["不平等", "差距"],
  infrastructure: ["基础设施"],
};

const stableHash = (input: string) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1)
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  return hash;
};

const rotate = <T,>(values: T[], seed: string, count: number) => {
  const unique = Array.from(new Set(values));
  if (!unique.length || count <= 0) return [] as T[];
  const offset = stableHash(seed) % unique.length;
  return Array.from({ length: Math.min(count, unique.length) }, (_, index) => unique[(offset + index) % unique.length]);
};

const wordsOf = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const sentenceFor = (theme: string, target: string, secondary: string) =>
  `${theme} research suggests that ${target} can shape ${secondary || "everyday decisions"} over time.`;

const item = (
  id: string,
  source: ListeningSource,
  trainingType: ListeningTrainingType,
  text: string,
  theme: string,
  extras: Partial<GeneratedListeningItem> = {},
): GeneratedListeningItem => ({
  id,
  sourceId: id,
  source,
  trainingType,
  text,
  theme,
  difficulty: trainingType === "word" ? 2 : trainingType === "chunk" ? 3 : 4,
  evaluation: trainingType === "mini" ? "keyword" : "exact",
  ...extras,
});

export function generateListeningPlan(input: ListeningGeneratorInput): GeneratedListeningPlan {
  const context = input.theme;
  const theme = context?.primaryTheme || input.fallbackTheme?.topic || "Society";
  const subtopics = context?.secondaryThemes?.filter(Boolean) ||
    input.fallbackTheme?.subtopic.split(" · ").filter(Boolean) || ["Everyday life"];
  const seed = `${input.dateKey}:${theme}:${subtopics.join("-")}`;
  const readingWords = context?.vocabulary?.filter(Boolean) || [];
  const readingChunks = context?.usefulExpressions?.filter(Boolean) || [];
  const historic = input.reviews.filter((review) => !review.correct).map((review) => review.text);
  const localWords = input.words.map((word) => word.word).filter(Boolean);
  const meanings = new Map(input.words.map((word) => [word.word.toLowerCase(), word.zh || ""]));
  const localChunks = [
    ...input.words.map((word) => word.collocation || ""),
    ...input.highlights.filter((highlight) => highlight.type === "phrase").map((highlight) => highlight.text),
    ...input.materials.filter((material) => material.type === "phrase").map((material) => material.content),
  ].filter(Boolean);
  const curriculumWords = input.curriculum?.vocabulary?.filter(Boolean) || [];
  const historicWords = historic.filter((text) => wordsOf(text).length === 1);

  const wordPool = [
    ...rotate(curriculumWords, `${seed}:curriculum-word`, 2),
    ...rotate(historicWords, `${seed}:review-word`, 1),
    ...rotate(localWords, `${seed}:known-word`, 2),
    ...rotate(readingWords, `${seed}:reading-word`, 2),
  ];
  const chunkPool = [
    ...rotate(readingChunks.length ? readingChunks : localChunks, `${seed}:daily-chunk`, 3),
    ...rotate(historic.length ? historic : localChunks, `${seed}:review-chunk`, 1),
  ];
  const fallbackWord = rotate([...curriculumWords, ...historicWords, ...localWords, ...readingWords], `${seed}:fallback`, 1)[0];
  while (wordPool.length < 3 && fallbackWord) wordPool.push(fallbackWord);
  const fallbackChunk = rotate([...readingChunks, ...localChunks, ...historic], `${seed}:chunk-fill`, 1)[0];
  while (chunkPool.length < 5 && fallbackChunk) chunkPool.push(fallbackChunk);

  const wordItems = wordPool.slice(0, 3).map((text, index) =>
    item(`word-${seed}-${index}`, "listening_vocabulary", "word", text, theme, {
      sourceId: text,
      targetVocabulary: [text],
      acceptedMeanings: [meanings.get(text.toLowerCase()) || "", ...(listeningMeanings[text.toLowerCase()] || [])].filter(Boolean),
      context: `A target word for ${theme}.`,
    }),
  );
  const chunkItems = chunkPool.slice(0, 5).map((text, index) =>
    item(`chunk-${seed}-${index}`, historic.includes(text) ? "review" : "reading_context", "chunk", text, theme, {
      targetVocabulary: wordsOf(text),
      context: `A useful expression connected to ${theme}.`,
    }),
  );
  const sentenceTargets = rotate([...curriculumWords, ...historicWords, ...localWords, ...readingWords], `${seed}:sentence`, 3);
  const sentenceItems = sentenceTargets.map((target, index) => {
    const text = sentenceFor(theme, target, subtopics[index % subtopics.length] || "society");
    return item(`sentence-${seed}-${index}`, historicWords.includes(target) ? "review" : "reading_context", "sentence", text, theme, {
      targetVocabulary: [target],
      context: subtopics[index % subtopics.length],
    });
  });
  const miniTargets = rotate([...curriculumWords, ...historicWords, ...localWords, ...readingWords], `${seed}:mini`, 2);
  const miniText = miniTargets.length
    ? `${sentenceFor(theme, miniTargets[0], subtopics[0] || "everyday life")}${miniTargets[1] ? ` ${sentenceFor(theme, miniTargets[1], subtopics[1] || "public life")}` : ""}`
    : "";
  const miniItem = miniText ? item(`mini-${seed}`, "reading_context", "mini", miniText, theme, {
    targetVocabulary: miniTargets.length ? miniTargets : [fallbackWord],
    context: context?.concepts?.[0] || `A short IELTS-style listening about ${theme}.`,
  }) : null;
  const curriculumItems = (input.curriculum?.prompts || []).slice(0, 6).map((text, index) =>
    item(`curriculum-${input.curriculum!.sectionId || input.curriculum!.bookId}-${index}`, "curriculum", /dictation|fill/i.test(input.curriculum?.exerciseType || "") ? "sentence" : "mini", text, theme, {
      curriculumBookId: input.curriculum!.bookId,
      curriculumUnitId: input.curriculum!.unitId,
      curriculumSectionId: input.curriculum!.sectionId,
      pageStart: input.curriculum!.pageStart,
      pageEnd: input.curriculum!.pageEnd,
      exerciseType: input.curriculum!.exerciseType,
      context: input.curriculum!.bookTitle,
      targetVocabulary: wordsOf(text).slice(0, 3),
    }),
  );
  const remaining = [...chunkItems, ...sentenceItems, ...(miniItem ? [miniItem] : [])];
  const items = [...wordItems, ...curriculumItems, ...remaining].slice(0, 12);
  return { id: `listening-plan-${seed}`, date: input.dateKey, theme, subtopics, items };
}

export const normalizeListeningAnswer = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function evaluateListeningAnswer(item: GeneratedListeningItem, answer: string) {
  const normalizedAnswer = normalizeListeningAnswer(answer);
  if (!normalizedAnswer) return false;
  if (item.evaluation === "exact") return normalizedAnswer === normalizeListeningAnswer(item.text);
  const target = item.targetVocabulary || wordsOf(item.text).slice(0, 2);
  return target.filter((word) => normalizedAnswer.includes(normalizeListeningAnswer(word))).length >= Math.max(1, Math.ceil(target.length / 2));
}

const normalizeChinese = (text: string) => text.replace(/\s+/g, "").replace(/[，。；、,.!?！？]/g, "");

export function evaluateListeningResponse(
  item: GeneratedListeningItem,
  answer: string,
  answerMode: ListeningAnswerMode,
): { correct: boolean; wordResult?: ListeningWordResult } {
  if (item.trainingType !== "word") return { correct: evaluateListeningAnswer(item, answer) };
  const normalizedAnswer = normalizeListeningAnswer(answer);
  const normalizedTarget = normalizeListeningAnswer(item.text);
  const englishExact = normalizedAnswer === normalizedTarget;
  const englishRecognised = englishExact || (
    normalizedAnswer.length >= 3
    && editDistance(normalizedAnswer, normalizedTarget) <= Math.max(1, Math.floor(normalizedTarget.length * 0.12))
  );
  const accepted = item.acceptedMeanings || [];
  const chineseMeaning = accepted.some((meaning) => {
    const target = normalizeChinese(meaning);
    const given = normalizeChinese(answer);
    return target.length >= 2 && (given.includes(target) || target.includes(given));
  });
  const meaningUnderstood = answerMode === "english_text" ? englishRecognised : chineseMeaning;
  return {
    correct: meaningUnderstood,
    wordResult: {
      wordId: item.sourceId,
      heardCorrectly: meaningUnderstood,
      meaningUnderstood,
      spellingCorrect: answerMode === "english_text" ? englishExact : undefined,
      answerMode,
      replayCount: 0,
    },
  };
}

const editDistance = (left: string, right: string) => {
  const table = Array.from({ length: left.length + 1 }, (_, row) => Array(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) table[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) table[0][column] = column;
  for (let row = 1; row <= left.length; row += 1)
    for (let column = 1; column <= right.length; column += 1)
      table[row][column] = Math.min(table[row - 1][column] + 1, table[row][column - 1] + 1, table[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
  return table[left.length][right.length];
};

export function classifyListeningError(input: {
  item: GeneratedListeningItem;
  answer: string;
  replays: number;
  knownWords: string[];
}): ListeningErrorType {
  const expected = normalizeListeningAnswer(input.item.text);
  const answer = normalizeListeningAnswer(input.answer);
  const expectedWords = wordsOf(expected);
  const answerWords = wordsOf(answer);
  if (!answer) return input.knownWords.some((word) => expectedWords.includes(normalizeListeningAnswer(word))) ? "sound_recognition" : "vocabulary";
  if (answerWords.length < expectedWords.length && answerWords.every((word) => expectedWords.includes(word))) return "word_omission";
  if (expected.length > 4 && editDistance(expected, answer) <= Math.max(2, Math.round(expected.length * 0.18))) return "spelling";
  if ((input.item.trainingType === "chunk" || input.item.trainingType === "sentence") && input.replays >= 2) return "connected_speech";
  if (input.replays >= 3) return "too_fast";
  if (input.item.trainingType === "mini") return "attention";
  return input.knownWords.some((word) => expectedWords.includes(normalizeListeningAnswer(word))) ? "sound_recognition" : "unknown";
}

export const listeningErrorLabel: Record<ListeningErrorType, string> = {
  sound_recognition: "Sound recognition",
  connected_speech: "Connected speech",
  spelling: "Spelling",
  vocabulary: "Vocabulary",
  attention: "Lost attention",
  too_fast: "Too fast",
  word_omission: "Word omission",
  unknown: "Unknown",
};

export function buildListeningPerformance(input: {
  sessionId: string;
  date: string;
  duration: number;
  theme?: string;
  answers: {
    correct: boolean;
    replays: number;
    mistakeType: ListeningErrorType | "";
    source?: ListeningSource;
    wordResult?: ListeningWordResult;
  }[];
}): ListeningPerformance {
  const errorBreakdown = Object.keys(listeningErrorLabel).reduce(
    (result, key) => ({ ...result, [key]: 0 }),
    {} as Record<ListeningErrorType, number>,
  );
  input.answers.forEach((answer) => {
    if (answer.mistakeType) errorBreakdown[answer.mistakeType] += 1;
  });
  const totalItems = input.answers.length;
  const correctItems = input.answers.filter((answer) => answer.correct).length;
  const primaryWeakness = (Object.entries(errorBreakdown) as [ListeningErrorType, number][])
    .filter(([, count]) => count > 0)
    .sort(([, left], [, right]) => right - left)[0]?.[0];
  const vocabularyAnswers = input.answers.filter((answer) => answer.source === "listening_vocabulary");
  const curriculumAnswers = input.answers.filter((answer) => answer.source === "curriculum");
  const reviewAnswers = input.answers.filter((answer) => answer.source === "review");
  const recognisedWords = vocabularyAnswers.filter((answer) => answer.wordResult?.meaningUnderstood).length;
  return {
    id: `listening-performance-${input.sessionId}`,
    date: input.date,
    sessionId: input.sessionId,
    totalItems,
    correctItems,
    accuracy: totalItems ? Math.round((correctItems / totalItems) * 100) : 0,
    replayCount: input.answers.reduce((sum, answer) => sum + answer.replays, 0),
    duration: input.duration,
    errorBreakdown,
    primaryWeakness,
    theme: input.theme,
    vocabularyRecognitionScore: vocabularyAnswers.length
      ? Math.round((recognisedWords / vocabularyAnswers.length) * 100)
      : undefined,
    curriculumAccuracy: curriculumAnswers.length
      ? Math.round((curriculumAnswers.filter((answer) => answer.correct).length / curriculumAnswers.length) * 100)
      : undefined,
    curriculumCompletion: curriculumAnswers.length
      ? Math.round((curriculumAnswers.length / totalItems) * 100)
      : undefined,
    reviewAccuracy: reviewAnswers.length
      ? Math.round((reviewAnswers.filter((answer) => answer.correct).length / reviewAnswers.length) * 100)
      : undefined,
  };
}
