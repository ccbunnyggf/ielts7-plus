export type WritingStage = "ideas" | "language" | "sentences" | "paragraph" | "essay";

export type WritingCurriculumSection = {
  id: string;
  title: string;
  stage: WritingStage;
  startPage?: number;
  endPage?: number;
  method?: string;
  prerequisites?: string[];
  difficulty?: number;
};

export type WritingCurriculum = {
  id: string;
  title: string;
  sections: WritingCurriculumSection[];
  uploadedAt: string;
  analysisStatus: "pending" | "analysing" | "completed" | "failed";
  parserNote?: string;
};

export type WritingCurriculumProgress = {
  curriculumId: string;
  currentSectionId?: string;
  currentStage: WritingStage;
  completedSectionIds: string[];
  lastStudiedAt?: string;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

const stageFor = (value: string): WritingStage | null => {
  const source = value.toLowerCase();
  if (/(idea|plan|brainstorm|观点|思路|立意)/.test(source)) return "ideas";
  if (/(language|vocab|phrase|词汇|表达|词组)/.test(source)) return "language";
  if (/(sentence|句子)/.test(source)) return "sentences";
  if (/(paragraph|段落|body)/.test(source)) return "paragraph";
  if (/(essay|task 2|全文|作文)/.test(source)) return "essay";
  return null;
};

const pagesFor = (value: string) => {
  const match = value.match(/(?:page|p\.)\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?/i);
  return match ? { startPage: Number(match[1]), endPage: Number(match[2] || match[1]) } : {};
};

export async function parseWritingCurriculumUpload(file: File): Promise<WritingCurriculum> {
  const raw = await file.arrayBuffer();
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const text = isPdf ? new TextDecoder("latin1").decode(raw) : new TextDecoder().decode(raw);
  const id = `writing-curriculum-${file.name}-${file.lastModified}-${file.size}`;
  const sections = text
    .split(/\r?\n/)
    .map(clean)
    .filter((line) => line.length > 2 && line.length < 180)
    .flatMap((line, index) => {
      const stage = stageFor(line);
      return stage ? [{ id: `${id}-section-${index}`, title: line.replace(/(?:page|p\.)\s*\d+(?:\s*[-–]\s*\d+)?/i, "").trim(), stage, ...pagesFor(line) }] : [];
    });
  const unique = sections.filter((section, index, list) =>
    list.findIndex((candidate) => candidate.stage === section.stage && candidate.title === section.title) === index,
  );
  return {
    id,
    title: file.name.replace(/\.[^.]+$/, "") || "Writing curriculum",
    sections: unique,
    uploadedAt: new Date().toISOString(),
    analysisStatus: "completed",
    parserNote: unique.length
      ? `已识别 ${unique.length} 个可能的课程步骤；仅展示文件中可可靠读取的标题与页码。`
      : "文件已保存，但无法可靠识别章节或页码；不会编造课程位置。",
  };
}

export function currentWritingSection(curriculum: WritingCurriculum | null, progress: WritingCurriculumProgress | null) {
  if (!curriculum?.sections.length) return null;
  return curriculum.sections.find((section) => section.id === progress?.currentSectionId) || curriculum.sections[0];
}
