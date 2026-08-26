"use client";

import { useEffect, useState } from "react";
import {
  timerCategories,
  type ActiveStudySession,
  type TimerCategory,
} from "./studySessionService";

const label: Record<TimerCategory, string> = {
  reading: "阅读",
  listening: "听力",
  speaking: "口语",
  writing: "写作",
  vocabulary: "词汇",
  review: "复习",
};

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(
    Math.floor(seconds / 60) % 60,
  ).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const shortClock = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
};

type CompletedTimer = { category: TimerCategory; seconds: number };

export function GlobalStudyTimer(p: {
  active: ActiveStudySession | null;
  seconds: number;
  start: (category: TimerCategory) => void;
  pause: () => void;
  resume: () => void;
  finish: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<TimerCategory>("reading");
  const [completed, setCompleted] = useState<CompletedTimer | null>(null);

  useEffect(() => {
    if (!completed) return;
    const timer = window.setTimeout(() => setCompleted(null), 2200);
    return () => window.clearTimeout(timer);
  }, [completed]);

  const display = completed
    ? completed
    : p.active
      ? { category: p.active.category, seconds: p.seconds }
      : { category, seconds: 0 };
  const icon = completed ? "✓" : p.active?.status === "paused" ? "Ⅱ" : p.active ? "■" : "▶";

  const finish = () => {
    if (!p.active) return;
    setCompleted({ category: p.active.category, seconds: p.seconds });
    setOpen(false);
    p.finish();
  };

  if (!open) {
    return (
      <button className="global-timer-chip" onClick={() => setOpen(true)}>
        <span>{icon}</span>
        <b>{label[display.category]}</b>
        <i>·</i>
        <time>{shortClock(display.seconds)}</time>
        <em>⌄</em>
      </button>
    );
  }

  const isPaused = p.active?.status === "paused";
  return (
    <section className="global-study-timer" aria-label="学习计时器">
      <header>
        <p>学习计时器</p>
        <button className="timer-collapse" aria-label="收起计时器" onClick={() => setOpen(false)}>
          −
        </button>
      </header>

      {p.active ? (
        <div className="timer-panel-content timer-running">
          <span className="timer-current-category">{label[p.active.category]}</span>
          <strong>{clock(p.seconds)}</strong>
          <small>{isPaused ? "已暂停" : ""}</small>
          <div className="timer-actions">
            <button className="outline" onClick={isPaused ? p.resume : p.pause}>
              {isPaused ? "继续" : "暂停"}
            </button>
            <button className="primary" onClick={finish}>结束</button>
          </div>
        </div>
      ) : (
        <div className="timer-panel-content timer-idle">
          <div className="timer-categories">
            {timerCategories.map((item) => (
              <button
                key={item}
                className={category === item ? "selected" : ""}
                onClick={() => setCategory(item)}
              >
                {label[item]}
              </button>
            ))}
          </div>
          <strong>00:00:00</strong>
          <span aria-hidden="true" />
          <button className="primary timer-start" onClick={() => p.start(category)}>
            开始
          </button>
        </div>
      )}
    </section>
  );
}
