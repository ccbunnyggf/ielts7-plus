export type ReadingAnalysisResult = {
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
};

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

type TopicProfile = Omit<ReadingAnalysisResult, "failedImageIndexes" | "sourceText">;

const profiles: Record<string, TopicProfile> = {
  Science: {
    title: "Marine life and adaptation",
    mainTopic: "Science",
    subTopics: ["Marine Biology", "Adaptation", "Ecosystems"],
    summary: "Explores how living systems respond to environmental pressure and change.",
    concepts: ["adaptation", "ecosystem", "environmental pressure"],
    vocabulary: ["adaptation", "evolution", "ecosystem", "conservation"],
    usefulExpressions: ["adapt to changing conditions", "under environmental pressure"],
    arguments: ["Conservation policy should account for long-term ecosystem resilience."],
    difficulty: "medium",
  },
  Technology: {
    title: "Technology, behaviour and everyday life",
    mainTopic: "Technology",
    subTopics: ["Digital Habits", "Innovation", "Society"],
    summary: "Examines how technological change reshapes daily choices and social behaviour.",
    concepts: ["digital behaviour", "innovation", "access"],
    vocabulary: ["automation", "digital literacy", "privacy", "accessibility"],
    usefulExpressions: ["reshape everyday behaviour", "widen access to"],
    arguments: ["Innovation should be assessed by its social impact, not only its speed."],
    difficulty: "medium",
  },
  Environment: {
    title: "Climate choices and urban resilience",
    mainTopic: "Environment",
    subTopics: ["Climate", "Cities", "Sustainability"],
    summary: "Considers the environmental trade-offs behind modern urban development.",
    concepts: ["resilience", "sustainability", "public infrastructure"],
    vocabulary: ["emissions", "sustainable", "resilient", "infrastructure"],
    usefulExpressions: ["reduce environmental pressure", "build resilient cities"],
    arguments: ["Cities need long-term infrastructure rather than short-term environmental fixes."],
    difficulty: "medium",
  },
  Education: {
    title: "Education beyond the classroom",
    mainTopic: "Education",
    subTopics: ["Access", "Skills", "Lifelong Learning"],
    summary: "Looks at how education can widen opportunity across a lifetime.",
    concepts: ["access", "social mobility", "lifelong learning"],
    vocabulary: ["curriculum", "equity", "attainment", "mobility"],
    usefulExpressions: ["widen access to education", "improve social mobility"],
    arguments: ["Public investment in education should prioritise access as well as attainment."],
    difficulty: "medium",
  },
};

function profileFor(names: string[]) {
  const source = names.join(" ").toLowerCase();
  if (/(marine|ocean|species|animal|biology|evolution)/.test(source)) return profiles.Science;
  if (/(climate|environment|city|urban|carbon|transport)/.test(source)) return profiles.Environment;
  if (/(school|education|student|learning|university)/.test(source)) return profiles.Education;
  return profiles.Technology;
}

/**
 * Local mock analysis adapter. Its input/output matches a future OCR + AI API,
 * so the UI never needs to ask the learner for article metadata.
 */
export async function analyseReadingImages(imageNames: string[]): Promise<ReadingAnalysisResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 650));
  const profile = profileFor(imageNames);
  const failedImageIndexes = imageNames
    .map((name, index) => (/unreadable|failed|blur/i.test(name) ? index : -1))
    .filter((index) => index >= 0);
  return {
    ...profile,
    sourceText: "",
    failedImageIndexes,
  };
}

export function buildThemeContext(articles: AnalysableArticle[], date: string): ThemeContext {
  const today = articles.filter(
    (article) => article.createdAt === date && article.status !== "failed",
  );
  const totals = today.reduce<Record<string, number>>((weights, article) => {
    const theme = article.mainTopic || article.topic || "General";
    const depth = Math.max(1, article.imageUrls?.length ?? 1);
    weights[theme] = (weights[theme] ?? 0) + depth;
    return weights;
  }, {});
  const sum = Object.values(totals).reduce((total, value) => total + value, 0);
  const weights = Object.fromEntries(
    Object.entries(totals).map(([theme, value]) => [theme, sum ? value / sum : 0]),
  );
  const ranked = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const unique = (values: string[]) => [...new Set(values)].slice(0, 12);
  return {
    date,
    primaryTheme: ranked[0]?.[0] ?? "General",
    secondaryThemes: unique(today.flatMap((article) => article.subTopics ?? [])).slice(0, 4),
    weights,
    vocabulary: unique(today.flatMap((article) => article.vocabulary ?? [])),
    usefulExpressions: unique(today.flatMap((article) => article.usefulExpressions ?? [])),
    concepts: unique(today.flatMap((article) => article.concepts ?? [])),
    arguments: unique(today.flatMap((article) => article.arguments ?? [])),
  };
}

export type ReadingPerformance = {
  articleId: string;
  duration: number;
  difficulty?: "easy" | "medium" | "hard";
  vocabularyCount: number;
  unknownVocabularyCount: number;
  comprehensionSignals: string[];
  createdAt: string;
};
