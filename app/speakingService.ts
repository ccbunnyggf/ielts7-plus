export type SpeakingPart = 1 | 2 | 3;

export type SpeakingAnalysis = {
  fluencySignals?: string[];
  grammarErrors?: string[];
  repeatedExpressions?: string[];
  vocabularyUsed?: string[];
  coherenceIssues?: string[];
  pronunciationSignals?: string[];
  hesitationCount?: number;
  answeredQuestion?: boolean;
};

export type SpeakingResponse = {
  id: string;
  sessionId: string;
  part: SpeakingPart;
  question: string;
  transcript?: string;
  audioUrl?: string;
  duration: number;
  createdAt: string;
  analysis?: SpeakingAnalysis;
};

export type SpeakingThemeContext = {
  primaryTheme: string;
  secondaryThemes?: string[];
  vocabulary?: string[];
  usefulExpressions?: string[];
  arguments?: string[];
};

export type SpeakingPartStatus = "ready" | "preparing" | "recording" | "processing" | "completed";

export type SpeakingPartProgress = {
  questions: string[];
  currentQuestionIndex: number;
  responses: SpeakingResponse[];
  status: SpeakingPartStatus;
  preparationEndsAt?: number;
};

export type SpeakingSession = {
  id: string;
  date: string;
  theme: SpeakingThemeContext;
  activePart: SpeakingPart;
  part1: SpeakingPartProgress;
  part2: SpeakingPartProgress;
  part3: SpeakingPartProgress;
  cueCard: { prompt: string; points: string[] };
  startedAt: string;
  completedAt?: string;
};

const topicProfiles: Record<string, {
  partOne: string[];
  cue: string;
  points: string[];
}> = {
  Technology: {
    partOne: [
      "How often do you use technology in your daily life?",
      "Is there any technology that you find difficult to use?",
      "Do you think people rely on technology too much?",
    ],
    cue: "Describe a piece of technology that has changed the way you live.",
    points: ["what it is", "when you started using it", "how you use it", "why it is important to you"],
  },
  Environment: {
    partOne: ["Do you do anything to reduce waste at home?", "What kind of places in your city have good public transport?", "Is environmental news common where you live?"],
    cue: "Describe a change that could make your local area more environmentally friendly.",
    points: ["what the change is", "where it should happen", "who would benefit", "why it matters"],
  },
  Education: {
    partOne: ["Did you enjoy the way you learned at school?", "What do you like to learn outside class?", "Do you prefer learning alone or with other people?"],
    cue: "Describe a skill that you would like to learn in the future.",
    points: ["what the skill is", "why you want to learn it", "how you would learn it", "how it could help you"],
  },
  Society: {
    partOne: ["Do you know your neighbours well?", "What changes have you noticed in your local area?", "Do people spend enough time with their community?"],
    cue: "Describe a change in society that has affected people around you.",
    points: ["what the change is", "when you noticed it", "who it affects", "how people respond to it"],
  },
};

const fallbackThemes = ["Technology", "Education", "Environment", "Society"];

function profileFor(theme: string) {
  return topicProfiles[theme] ?? topicProfiles[fallbackThemes[stableHash(theme) % fallbackThemes.length]];
}

export function fallbackSpeakingTheme(seed: string, weakTopic?: string): SpeakingThemeContext {
  const primaryTheme = weakTopic || fallbackThemes[stableHash(seed) % fallbackThemes.length];
  return { primaryTheme, secondaryThemes: ["Everyday life", "People and change"] };
}

export function createSpeakingSession(date: string, theme: SpeakingThemeContext): SpeakingSession {
  const profile = profileFor(theme.primaryTheme);
  return {
    id: `speaking-session-${date}-${stableHash(theme.primaryTheme)}`,
    date,
    theme,
    activePart: 1,
    part1: { questions: profile.partOne, currentQuestionIndex: 0, responses: [], status: "ready" },
    part2: { questions: [profile.cue], currentQuestionIndex: 0, responses: [], status: "ready" },
    part3: { questions: [nextPartThreeQuestion({ theme, transcript: "", questionNumber: 0 })], currentQuestionIndex: 0, responses: [], status: "ready" },
    cueCard: { prompt: profile.cue, points: profile.points },
    startedAt: new Date().toISOString(),
  };
}

export function getSpeakingPart(session: SpeakingSession, part = session.activePart) {
  return part === 1 ? session.part1 : part === 2 ? session.part2 : session.part3;
}

export function withSpeakingPart(
  session: SpeakingSession,
  part: SpeakingPart,
  progress: SpeakingPartProgress,
): SpeakingSession {
  return part === 1
    ? { ...session, part1: progress }
    : part === 2
      ? { ...session, part2: progress }
      : { ...session, part3: progress };
}

export function allSpeakingResponses(session: SpeakingSession) {
  return [...session.part1.responses, ...session.part2.responses, ...session.part3.responses];
}

export function isSpeakingSessionComplete(session: SpeakingSession) {
  return session.part1.status === "completed" && session.part2.status === "completed" && session.part3.status === "completed";
}

export function nextPartThreeQuestion(input: {
  theme: SpeakingThemeContext;
  transcript: string;
  questionNumber: number;
}) {
  const words = extractKeywords(input.transcript);
  const anchor = words[0] || input.theme.secondaryThemes?.[0] || input.theme.primaryTheme.toLowerCase();
  if (input.questionNumber === 0) {
    return `Why do some people find ${anchor} difficult to deal with?`;
  }
  return `What role should governments and communities play in improving ${anchor}?`;
}

export function analyseSpeakingResponse(transcript: string, question: string): SpeakingAnalysis {
  const lower = transcript.toLowerCase();
  const repeatedExpressions = ["i think", "you know", "like", "actually"].filter(
    (phrase) => countPhrase(lower, phrase) >= 2,
  );
  const hesitationCount = (lower.match(/\b(um|uh|er|you know)\b/g) ?? []).length;
  const grammarErrors: string[] = [];
  if (/\b(he|she|it)\s+(go|have|do)\b/.test(lower)) grammarErrors.push("第三人称单数形式需要检查。");
  if (/\bmore\s+\w+er\b/.test(lower)) grammarErrors.push("比较级表达需要检查。");
  const coherenceIssues = transcript.trim().split(/[.!?]/).filter(Boolean).length < 2
    ? ["回答展开不足，可以补充原因或例子。"]
    : [];
  const vocabularyUsed = ["however", "because", "for example", "in my experience", "important role"]
    .filter((phrase) => lower.includes(phrase));
  const fluencySignals = hesitationCount > 2 ? ["停顿较多，先用短句稳定节奏。"] : [];
  return {
    fluencySignals,
    grammarErrors,
    repeatedExpressions,
    vocabularyUsed,
    coherenceIssues,
    hesitationCount,
    answeredQuestion: transcript.trim().split(/\s+/).length >= 8 && question.length > 0,
  };
}

function extractKeywords(text: string) {
  const stop = new Set(["that", "this", "with", "have", "from", "they", "their", "people", "because", "about", "would", "could", "there", "which", "really", "think"]);
  return text.toLowerCase().match(/[a-z]{5,}/g)?.filter((word) => !stop.has(word)).slice(0, 3) ?? [];
}

function countPhrase(text: string, phrase: string) {
  return text.split(phrase).length - 1;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}
