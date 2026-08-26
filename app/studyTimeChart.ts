import {
  activeStudySeconds,
  timerCategories,
  type ActiveStudySession,
  type StudySession,
} from "./studySessionService";

export type DailyStudyCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  todayMinutes: number;
  todayHours: number;
  changeHours: number;
  changePercent: number;
  settledAt: string;
};

export type StudyTimeCandle = DailyStudyCandle & {
  label: string;
  range: "day" | "week";
};

const isTimerCategory = (category: string) =>
  (timerCategories as readonly string[]).includes(category);

const dayAtEightPm = (date: string) => new Date(`${date}T20:00:00`);

export function studySecondsForDate(
  sessions: StudySession[],
  date: string,
  active: ActiveStudySession | null = null,
  at = Date.now(),
) {
  const cutoff = dayAtEightPm(date).getTime();
  const isTodaySettlement = Number.isFinite(cutoff) && at === cutoff;
  const completed = sessions
    .filter((session) => {
      if (session.date !== date || session.status !== "completed" || !isTimerCategory(session.category)) return false;
      if (!isTodaySettlement || !session.endedAt) return true;
      return new Date(session.endedAt).getTime() <= cutoff;
    })
    .reduce((sum, session) => sum + session.duration, 0);
  const activeSeconds = active && active.date === date && isTimerCategory(active.category)
    ? activeStudySeconds(active, at)
    : 0;
  return completed + activeSeconds;
}

export function buildDailyStudyCandle(input: {
  date: string;
  sessions: StudySession[];
  previousClose: number;
  active?: ActiveStudySession | null;
  settledAt?: string;
}) : DailyStudyCandle {
  const settledAt = input.settledAt ?? dayAtEightPm(input.date).toISOString();
  const close = studySecondsForDate(
    input.sessions,
    input.date,
    input.active ?? null,
    new Date(settledAt).getTime(),
  ) / 3600;
  const open = input.previousClose;
  const changeHours = close - open;
  return {
    date: input.date,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    todayMinutes: Math.round(close * 60),
    todayHours: close,
    changeHours,
    changePercent: open ? (changeHours / open) * 100 : 0,
    settledAt,
  };
}

function weekStart(date: string) {
  const start = new Date(`${date}T12:00:00`);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start.toISOString().slice(0, 10);
}

function labelFor(key: string, range: StudyTimeCandle["range"]) {
  if (range === "day") return key;
  const end = new Date(`${key}T12:00:00`);
  end.setDate(end.getDate() + 6);
  return `${key.slice(5).replace("-", "/")}–${end.toISOString().slice(5, 10).replace("-", "/")}`;
}

export function aggregateStudyCandles(
  candles: DailyStudyCandle[],
  range: StudyTimeCandle["range"],
) : StudyTimeCandle[] {
  const groups = new Map<string, DailyStudyCandle[]>();
  [...candles]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((candle) => {
      const key = range === "day" ? candle.date : weekStart(candle.date);
      groups.set(key, [...(groups.get(key) ?? []), candle]);
    });
  let previousClose = 0;
  return [...groups.entries()].map(([key, items]) => {
    const close = items.reduce((sum, item) => sum + item.close, 0);
    const open = previousClose;
    previousClose = close;
    const changeHours = close - open;
    return {
      date: key,
      label: labelFor(key, range),
      range,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      todayMinutes: Math.round(close * 60),
      todayHours: close,
      changeHours,
      changePercent: open ? (changeHours / open) * 100 : 0,
      settledAt: items.at(-1)!.settledAt,
    };
  });
}

export function formatStudyHours(hours: number) {
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

export function formatStudyHoursAndMinutes(hours: number) {
  const minutes = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
