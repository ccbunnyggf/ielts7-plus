export type DailyQuote = {
  keyword: string;
  quote: string;
  source: string;
  category?: string;
};

export type StudySessionRecord = {
  category: string;
  date: string;
  duration: number;
};

export type SkillIndex = { score: number | null; reason?: string };
export type SkillSnapshotRecord = {
  date: string;
  overall: number | null;
  reading: number | null;
  listening: number | null;
  speaking: number | null;
  writing: number | null;
  vocabulary: number | null;
};

const quotePool: DailyQuote[] = [
  { keyword: "野心", quote: "不要因为路远，就降低你对终点的要求。", source: "Essays" },
  { keyword: "耐心", quote: "有些增长，在很长时间里看起来都像停滞。", source: "Philosophy" },
  { keyword: "冒险", quote: "安全并不会自动带来自由。", source: "Essays" },
  { keyword: "定力", quote: "真正稀缺的，不是选择，而是把选择走到底。", source: "Notes" },
  { keyword: "诚实", quote: "先看清自己在哪里，路才会真正开始。", source: "Essays" },
  { keyword: "沉默", quote: "不必急着解释，结果会替你说话。", source: "Letters" },
  { keyword: "锋利", quote: "把注意力还给最重要的那件事。", source: "Notes" },
  { keyword: "自由", quote: "能力不是为了显得更强，而是为了拥有更多选择。", source: "Essays" },
];

export const dashboardSkills = [
  "reading",
  "listening",
  "speaking",
  "writing",
  "vocabulary",
] as const;

export type DashboardSkill = (typeof dashboardSkills)[number];

export function stableHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getDailyQuoteIndex(dateKey: string) {
  return quotePool.length ? stableHash(dateKey || "dashboard") % quotePool.length : 0;
}

export function getDailyQuote(index: number) {
  return quotePool[index % quotePool.length] ?? quotePool[0];
}

/** Called only from the quote-dice click handler, never during render. */
export function getNextQuoteIndex(current: number) {
  if (quotePool.length < 2) return 0;
  const offset = 1 + Math.floor(Math.random() * (quotePool.length - 1));
  return (current + offset) % quotePool.length;
}

export function getTodayStudy(sessions: StudySessionRecord[], date: string) {
  const labels: Record<string, string> = {
    reading: "Reading",
    listening: "Listening",
    speaking: "Speaking",
    writing: "Writing",
    vocabulary: "Vocabulary",
    review: "Review",
  };
  const categories = Object.keys(labels);
  const rows = categories.map((category) => ({
    key: category,
    label: labels[category],
    seconds: sessions
      .filter((session) => session.date === date && session.category === category)
      .reduce((sum, session) => sum + session.duration, 0),
  }));
  return { rows, total: rows.reduce((sum, row) => sum + row.seconds, 0) };
}

export function getYesterdayStudySeconds(sessions: StudySessionRecord[], date: string) {
  if (!date) return 0;
  const current = new Date(`${date}T12:00:00`);
  if (Number.isNaN(current.getTime())) return 0;
  current.setDate(current.getDate() - 1);
  const yesterday = current.toISOString().slice(0, 10);
  return sessions
    .filter((session) => session.date === yesterday)
    .reduce((sum, session) => sum + session.duration, 0);
}

export function getSkillUpdate(
  skills: Record<DashboardSkill, SkillIndex>,
  snapshots: SkillSnapshotRecord[],
  date: string,
) {
  const previous = [...snapshots]
    .filter((snapshot) => snapshot.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const rows = dashboardSkills.map((key) => {
    const score = skills[key].score;
    const before = previous?.[key];
    const delta = score !== null && typeof before === "number" ? score - before : null;
    return { key, score, delta, reason: skills[key].reason };
  });
  const improving = rows.find((row) => (row.delta ?? 0) > 0);
  const declining = rows.find((row) => (row.delta ?? 0) < 0);
  const insight = improving
    ? `${labelFor(improving.key)}的可验证表现较上次结算有所提升。`
    : declining
      ? `${labelFor(declining.key)}出现轻微回调，后续会结合更多训练记录判断。`
      : "正在汇总真实训练表现；能力指数会在数据足够时更新。";
  return { rows, insight };
}

export function labelFor(key: DashboardSkill) {
  return {
    reading: "Reading",
    listening: "Listening",
    speaking: "Speaking",
    writing: "Writing",
    vocabulary: "Vocabulary",
  }[key];
}
