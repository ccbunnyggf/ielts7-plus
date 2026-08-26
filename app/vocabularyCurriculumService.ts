export type VocabularyCurriculumSection = {
  id: string;
  title: string;
  topic?: string;
  startPage?: number;
  endPage?: number;
  words: string[];
};

export type VocabularyCurriculum = {
  id: string;
  title: string;
  sections: VocabularyCurriculumSection[];
  uploadedAt: string;
  analysisStatus: "pending" | "analysing" | "completed" | "failed";
  parserNote?: string;
};

export type VocabularyCurriculumProgress = {
  curriculumId: string;
  currentUnit?: string;
  currentSection?: string;
  currentPage?: number;
  completedSections: string[];
  lastStudiedAt?: string;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const wordsFrom = (value: string) => value.match(/\b[a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,})?\b/gi)?.map(clean) || [];
const pageFrom = (value: string) => {
  const match = value.match(/(?:page|p\.)\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?/i);
  return match ? { startPage: Number(match[1]), endPage: Number(match[2] || match[1]) } : {};
};

async function extractPdfText(raw: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(raw), useWorkerFetch: false }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 24); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join("\n");
}

export async function parseVocabularyCurriculumUpload(file: File): Promise<VocabularyCurriculum> {
  const raw = await file.arrayBuffer();
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const source = isPdf ? await extractPdfText(raw) : new TextDecoder().decode(raw);
  const id = `vocabulary-curriculum-${file.name}-${file.lastModified}-${file.size}`;
  const lines = source.split(/\r?\n/).map(clean).filter((line) => line.length > 2 && line.length < 180);
  const sections = lines.flatMap((line, index) => {
    const unit = line.match(/^(?:unit|chapter|lesson)\s*(\d+|[a-z])/i) || line.match(/^(\d{1,3})\s+(.{3,120}?)(?:\s+(\d{1,3}))?$/);
    if (!unit) return [];
    const followingWords = lines.slice(index + 1, index + 8).flatMap(wordsFrom).filter((word, position, values) => values.indexOf(word) === position).slice(0, 18);
    const trailingPage = unit[3] ? { startPage: Number(unit[3]), endPage: Number(unit[3]) } : pageFrom(line);
    return [{ id: `${id}-section-${index}`, title: line.replace(/^(?:unit|chapter|lesson)\s*\w+\s*[:.-]?/i, "").replace(/^\d{1,3}\s+/, "").replace(/\s+\d{1,3}$/, "").trim(), topic: line.replace(/^(?:unit|chapter|lesson|\d{1,3})\s*\w*\s*[:.-]?/i, "").trim() || undefined, words: followingWords, ...trailingPage }];
  });
  return {
    id,
    title: file.name.replace(/\.[^.]+$/, "") || "Vocabulary curriculum",
    sections,
    uploadedAt: new Date().toISOString(),
    analysisStatus: "completed",
    parserNote: sections.length
      ? `已识别 ${sections.length} 个可读取章节，并只保留章节附近的候选词。`
      : "文件已保存，但无法可靠识别章节或词表；不会编造课程内容。",
  };
}

export function currentVocabularySection(curriculum: VocabularyCurriculum | null, progress: VocabularyCurriculumProgress | null) {
  if (!curriculum?.sections.length) return null;
  return curriculum.sections.find((section) => section.id === progress?.currentSection) || curriculum.sections[0];
}
