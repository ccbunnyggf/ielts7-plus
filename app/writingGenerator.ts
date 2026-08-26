import type { ThemeContext } from "./readingAnalysis";
import type { WritingCurriculum, WritingCurriculumProgress, WritingStage } from "./writingCurriculumService";

export type DailyWritingPlan = {
  id: string;
  date: string;
  theme: string;
  question: string;
  curriculumSectionId?: string;
  recommendedStage: WritingStage;
  readingMigration: string[];
  ideas: string[];
  expressions: string[];
};

const stableHash = (input: string) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  return hash;
};

const questionBank: Record<string, string[]> = {
  Society: [
    "Some people believe that modern lifestyles have weakened relationships between neighbours. To what extent do you agree or disagree?",
    "In many communities, people know their neighbours less well than in the past. What are the causes of this change, and how can communities respond?",
  ],
  Technology: [
    "Some people think that technology makes people less socially active. To what extent do you agree or disagree?",
    "Online communication has changed the way people form relationships. Do the advantages outweigh the disadvantages?",
  ],
  Education: [
    "Some people believe schools should focus more on practical skills than academic subjects. To what extent do you agree or disagree?",
  ],
  Environment: [
    "Governments should spend more money on public transport than on building new roads. To what extent do you agree or disagree?",
  ],
  Health: [
    "Some people think governments should take more responsibility for citizens' health. To what extent do you agree or disagree?",
  ],
};

const fallbackThemes = ["Society", "Education", "Technology", "Environment", "Health"];

export function generateDailyWritingPlan(input: {
  date: string;
  themeContext?: ThemeContext | null;
  fallbackTheme?: string;
  curriculum?: WritingCurriculum | null;
  progress?: WritingCurriculumProgress | null;
  words?: string[];
  historicalExpressions?: string[];
}): DailyWritingPlan {
  const context = input.themeContext;
  const fallback = input.fallbackTheme && questionBank[input.fallbackTheme] ? input.fallbackTheme : fallbackThemes[stableHash(input.date) % fallbackThemes.length];
  const theme = context?.primaryTheme && questionBank[context.primaryTheme] ? context.primaryTheme : fallback;
  const questions = questionBank[theme] || questionBank.Society;
  const section = input.curriculum?.sections.find((entry) => entry.id === input.progress?.currentSectionId) || input.curriculum?.sections[0];
  const recommendedStage = input.progress?.currentStage || section?.stage || "ideas";
  const expressionDefaults = theme === "Society"
    ? ["weaken social ties", "maintain close relationships", "a sense of community", "face-to-face interaction"]
    : theme === "Technology"
      ? ["reshape everyday behaviour", "widen access to", "digital interaction", "social consequences"]
      : ["play a vital role in", "have a long-term impact on", "address a practical need", "widen access to"];
  const expressions = [...(context?.usefulExpressions || []), ...(input.historicalExpressions || []), ...expressionDefaults]
    .filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).slice(0, 4);
  const ideas = [...(context?.arguments || []), ...(theme === "Society"
    ? ["modern lifestyles reduce casual interaction", "online communication can replace local contact"]
    : ["the change can improve access for some people", "its benefits depend on thoughtful public support"])]
    .filter(Boolean).slice(0, 3);
  return {
    id: `writing-plan-${input.date}`,
    date: input.date,
    theme,
    question: questions[stableHash(`${input.date}:${theme}`) % questions.length],
    curriculumSectionId: section?.id,
    recommendedStage,
    readingMigration: [...(context?.concepts || []), ...(context?.secondaryThemes || [])].filter(Boolean).slice(0, 3),
    ideas,
    expressions,
  };
}
