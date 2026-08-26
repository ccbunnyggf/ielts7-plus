import type { VocabularyCurriculum, VocabularyCurriculumProgress } from "./vocabularyCurriculumService";

export type VocabularyDimension = "meaningRecognition" | "listeningRecognition" | "collocationRecall" | "speakingRecall" | "writingRecall" | "spelling";
export type VocabularyMastery = Record<VocabularyDimension, number>;
export type DailyVocabularyPlan = { date: string; curriculumNewWords: string[]; personalWords: string[]; reviewWords: string[]; total: number };

export const emptyMastery = (): VocabularyMastery => ({ meaningRecognition: 0, listeningRecognition: 0, collocationRecall: 0, speakingRecall: 0, writingRecall: 0, spelling: 0 });

export const weakestDimension = (mastery?: VocabularyMastery): VocabularyDimension => {
  const values = mastery || emptyMastery();
  return (Object.keys(values) as VocabularyDimension[]).sort((a, b) => values[a] - values[b])[0];
};

export function generateDailyVocabularyPlan(input: {
  date: string;
  words: { word: string; due: string; sources?: { module: string }[]; mistakes?: unknown[] }[];
  curriculum: VocabularyCurriculum | null;
  progress: VocabularyCurriculumProgress | null;
}) : DailyVocabularyPlan {
  const current = input.curriculum?.sections.find((section) => section.id === input.progress?.currentSection) || input.curriculum?.sections[0];
  const reviewWords = input.words.filter((word) => word.due === "今天" || word.due === input.date).map((word) => word.word);
  const personalWords = input.words.filter((word) => word.sources?.some((source) => source.module !== "curriculum") || word.mistakes?.length).map((word) => word.word).filter((word) => !reviewWords.includes(word)).slice(0, 6);
  const known = new Set(input.words.map((word) => word.word.toLowerCase()));
  const curriculumNewWords = (current?.words || []).filter((word) => !known.has(word.toLowerCase())).slice(0, 10);
  return { date: input.date, curriculumNewWords, personalWords, reviewWords, total: reviewWords.length + personalWords.length + curriculumNewWords.length };
}
