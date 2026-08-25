export type ListeningTrainingType = "word" | "chunk" | "sentence" | "mini";
export type ListeningSource = "daily_reading" | "review" | "ielts_random";
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
};

const generalWords = [
  "accessibility",
  "sustainable",
  "substantial",
  "conservation",
  "inequality",
  "infrastructure",
];
const generalChunks = [
  "play a significant role in",
  "widen access to",
  "be under increasing pressure",
  "in response to changing needs",
  "have a long-term impact on",
];

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
  const localChunks = [
    ...input.words.map((word) => word.collocation || ""),
    ...input.highlights.filter((highlight) => highlight.type === "phrase").map((highlight) => highlight.text),
    ...input.materials.filter((material) => material.type === "phrase").map((material) => material.content),
  ].filter(Boolean);

  const wordPool = [
    ...rotate(readingWords, `${seed}:daily-word`, 2),
    ...rotate(historic.length ? historic : localWords, `${seed}:review-word`, 1),
    ...rotate(generalWords, `${seed}:general-word`, 1),
  ];
  const chunkPool = [
    ...rotate(readingChunks.length ? readingChunks : localChunks, `${seed}:daily-chunk`, 3),
    ...rotate(historic.length ? historic : localChunks, `${seed}:review-chunk`, 1),
    ...rotate(generalChunks, `${seed}:general-chunk`, 1),
  ];
  const fallbackWord = rotate([...readingWords, ...localWords, ...generalWords], `${seed}:fallback`, 1)[0] || "accessibility";
  while (wordPool.length < 3) wordPool.push(fallbackWord);
  while (chunkPool.length < 5) chunkPool.push(rotate(generalChunks, `${seed}:chunk-fill:${chunkPool.length}`, 1)[0]);

  const wordItems = wordPool.slice(0, 3).map((text, index) =>
    item(`word-${seed}-${index}`, index < 2 && readingWords.includes(text) ? "daily_reading" : index === 2 && historic.includes(text) ? "review" : "ielts_random", "word", text, theme, {
      targetVocabulary: [text],
      context: `A target word for ${theme}.`,
    }),
  );
  const chunkItems = chunkPool.slice(0, 5).map((text, index) =>
    item(`chunk-${seed}-${index}`, index < 3 && (readingChunks.includes(text) || localChunks.includes(text)) ? "daily_reading" : index === 3 && historic.includes(text) ? "review" : "ielts_random", "chunk", text, theme, {
      targetVocabulary: wordsOf(text),
      context: `A useful expression connected to ${theme}.`,
    }),
  );
  const sentenceTargets = rotate([...readingWords, ...localWords, ...generalWords], `${seed}:sentence`, 3);
  const sentenceItems = Array.from({ length: 3 }, (_, index) => {
    const target = sentenceTargets[index] || fallbackWord;
    const text = sentenceFor(theme, target, subtopics[index % subtopics.length] || "society");
    return item(`sentence-${seed}-${index}`, index < 2 && readingWords.includes(target) ? "daily_reading" : "ielts_random", "sentence", text, theme, {
      targetVocabulary: [target],
      context: subtopics[index % subtopics.length],
    });
  });
  const miniTargets = rotate([...readingWords, ...localWords, ...generalWords], `${seed}:mini`, 2);
  const miniText = `${sentenceFor(theme, miniTargets[0] || fallbackWord, subtopics[0] || "everyday life")} ${sentenceFor(theme, miniTargets[1] || fallbackWord, subtopics[1] || "public life")}`;
  const miniItem = item(`mini-${seed}`, context ? "daily_reading" : "ielts_random", "mini", miniText, theme, {
    targetVocabulary: miniTargets.length ? miniTargets : [fallbackWord],
    context: context?.concepts?.[0] || `A short IELTS-style listening about ${theme}.`,
  });
  return { id: `listening-plan-${seed}`, date: input.dateKey, theme, subtopics, items: [...wordItems, ...chunkItems, ...sentenceItems, miniItem] };
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
  answers: { correct: boolean; replays: number; mistakeType: ListeningErrorType | "" }[];
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
  };
}
