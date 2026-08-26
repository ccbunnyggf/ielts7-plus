import type { WritingStage } from "./writingCurriculumService";

export type WritingFeedback = { summary: string; issues: { type: "grammar" | "vocabulary" | "collocation" | "logic" | "structure"; content: string; correction?: string }[] };

export function evaluateWritingStage(stage: WritingStage, value: string, question: string): WritingFeedback {
  const text = value.trim();
  const sentences = text.split(/[.!?\n]+/).filter(Boolean);
  const issues: WritingFeedback["issues"] = [];
  if (stage === "ideas" && sentences.length < 2) issues.push({ type: "logic", content: "还需要至少两个可展开的正文观点。" });
  if (stage === "paragraph" && !/(because|for example|for instance|therefore|which means|as a result)/i.test(text)) issues.push({ type: "structure", content: "补上一句解释或例子，让观点能够展开。" });
  if ((stage === "sentences" || stage === "essay") && /\b(very good|a lot of|many thing)\b/i.test(text)) issues.push({ type: "vocabulary", content: "有表达过于笼统；尝试换成更具体的名词或动词。" });
  if (/\bi am agree\b/i.test(text)) issues.push({ type: "grammar", content: "agree 不能和 am 连用。", correction: "I agree / I am in agreement" });
  if (text.length < (stage === "essay" ? 120 : 25)) issues.push({ type: "structure", content: "内容还太短，先把当前步骤写完整再提交。" });
  const focused = question.split(".")[0].toLowerCase().split(/\s+/).filter((word) => word.length > 5);
  if (stage === "ideas" && focused.length && !focused.some((word) => text.toLowerCase().includes(word))) issues.push({ type: "logic", content: "请更直接回应题目中的核心对象或变化。" });
  return { summary: issues.length ? "先修正下面这一点，再继续下一步。" : "这一步回答清楚、可继续推进。", issues };
}
