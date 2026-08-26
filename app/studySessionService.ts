export const timerCategories = ["reading", "listening", "speaking", "writing", "vocabulary", "review"] as const;
export type TimerCategory = (typeof timerCategories)[number];

export type StudySession = {
  id: string;
  category: TimerCategory;
  startedAt: string;
  endedAt?: string;
  duration: number;
  pausedDuration: number;
  status: "active" | "paused" | "completed";
  createdAt: string;
  date: string;
  /** Retained for historical task records only. */
  taskId?: string;
};

export type ActiveStudySession = Omit<StudySession, "endedAt"> & {
  pausedAt?: string;
};

export function activeStudySeconds(session: ActiveStudySession | null, now = Date.now()) {
  if (!session) return 0;
  const started = new Date(session.startedAt).getTime();
  const pausedSince = session.status === "paused" && session.pausedAt
    ? Math.max(0, now - new Date(session.pausedAt).getTime()) / 1000
    : 0;
  return Math.max(0, Math.floor((now - started) / 1000 - session.pausedDuration - pausedSince));
}

export function getTodayStudyTime(
  sessions: StudySession[],
  active: ActiveStudySession | null,
  date: string,
  now = Date.now(),
) {
  const totals = { reading: 0, listening: 0, speaking: 0, writing: 0, vocabulary: 0, review: 0 };
  sessions.filter((session) => session.date === date && session.status === "completed")
    .forEach((session) => { if (session.category in totals) totals[session.category] += session.duration; });
  if (active && active.date === date && active.category in totals) totals[active.category] += activeStudySeconds(active, now);
  return { ...totals, total: Object.values(totals).reduce((sum, value) => sum + value, 0) };
}
