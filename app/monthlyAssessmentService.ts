export const monthlySkillKeys = [
  "reading",
  "listening",
  "speaking",
  "writing",
  "vocabulary",
] as const;

export type MonthlySkillKey = (typeof monthlySkillKeys)[number];
export type AssessmentScores = Partial<Record<MonthlySkillKey | "overallEstimate", number>>;

export type MonthlySkillAssessment = {
  id: string;
  month: string;
  assessedAt: string;
  reading?: number;
  listening?: number;
  speaking?: number;
  writing?: number;
  vocabulary?: number;
  overallEstimate?: number;
  previousMonth?: AssessmentScores;
  notes?: string[];
};

export function monthFromDateKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function formatAssessmentMonth(month: string) {
  const [year, value] = month.split("-");
  return `${year} / ${value || "—"}`;
}

export function getAssessmentForMonth(
  assessments: MonthlySkillAssessment[],
  month: string,
) {
  return assessments.find((assessment) => assessment.month === month);
}

export function getPreviousAssessment(
  assessments: MonthlySkillAssessment[],
  month: string,
) {
  return assessments
    .filter((assessment) => assessment.month < month)
    .sort((a, b) => a.month.localeCompare(b.month))
    .at(-1);
}

export function asScoreSnapshot(assessment?: MonthlySkillAssessment): AssessmentScores | undefined {
  if (!assessment) return undefined;
  const snapshot: AssessmentScores = {};
  for (const key of [...monthlySkillKeys, "overallEstimate"] as const) {
    const value = assessment[key];
    if (typeof value === "number") snapshot[key] = value;
  }
  return snapshot;
}
