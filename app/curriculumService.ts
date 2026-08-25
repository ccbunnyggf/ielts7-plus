export type CurriculumSection = {
  id: string;
  unitId: string;
  title?: string;
  startPage?: number;
  endPage?: number;
  skill?: string;
  exerciseType?: string;
  topic?: string;
  difficulty?: number;
  prompts?: string[];
  vocabulary?: string[];
};

export type CurriculumUnit = {
  id: string;
  bookId: string;
  unitNumber?: number;
  title?: string;
  startPage?: number;
  endPage?: number;
  sections: CurriculumSection[];
};

export type CurriculumBook = {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  totalPages?: number;
  units: CurriculumUnit[];
  uploadedAt: string;
  analysisStatus: "pending" | "analysing" | "completed" | "failed";
  parserNote?: string;
};

export type CurriculumProgress = {
  bookId: string;
  currentUnitId?: string;
  currentSectionId?: string;
  currentPage?: number;
  completedPages: number[];
  lastStudiedAt?: string;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const linePage = (value: string) => {
  const match = value.match(/(?:page|p\.)\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?/i);
  return match ? { startPage: Number(match[1]), endPage: Number(match[2] || match[1]) } : {};
};
const exerciseFor = (value: string) => {
  if (/listen\s+and\s+choose/i.test(value)) return "Listen and choose";
  if (/dictation/i.test(value)) return "Dictation";
  if (/fill\s+in|gap.?fill/i.test(value)) return "Listen and fill in";
  if (/specific information/i.test(value)) return "Specific Information";
  return undefined;
};
const vocabularyFor = (value: string) => {
  const match = value.match(/^(?:vocabulary|new words|key words?)\s*:\s*(.+)$/i);
  if (!match) return [];
  return match[1]
    .split(/[,;/•]/)
    .map(clean)
    .filter((word) => /^[a-z][a-z\s'-]{1,48}$/i.test(word));
};
const pageCountFromPdfBytes = (text: string) =>
  (text.match(/\/Type\s*\/Page\b/g) || []).length || undefined;

export async function parseCurriculumUpload(file: File): Promise<CurriculumBook> {
  const now = new Date().toISOString();
  const id = `curriculum-${file.name}-${file.lastModified}-${file.size}`;
  const raw = await file.arrayBuffer();
  const decoded = new TextDecoder("latin1").decode(raw);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const text = isPdf ? decoded : new TextDecoder().decode(raw);
  const totalPages = isPdf ? pageCountFromPdfBytes(decoded) : undefined;
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const units: CurriculumUnit[] = [];
  let activeUnit: CurriculumUnit | null = null;

  lines.forEach((line, index) => {
    const unitMatch = line.match(/^unit\s*(\d+)\s*[:.\-–]?\s*(.*)$/i);
    if (unitMatch) {
      const page = linePage(line);
      activeUnit = {
        id: `${id}-unit-${unitMatch[1]}`,
        bookId: id,
        unitNumber: Number(unitMatch[1]),
        title: clean(unitMatch[2]) || undefined,
        ...page,
        sections: [],
      };
      units.push(activeUnit);
      return;
    }
    if (!activeUnit) return;
    const exerciseType = exerciseFor(line);
    if (!exerciseType) return;
    const page = linePage(line);
    const prompts = lines
      .slice(index + 1, index + 5)
      .filter((candidate) => !/^unit\s*\d+/i.test(candidate) && !exerciseFor(candidate))
      .filter((candidate) => candidate.length > 8 && candidate.length < 220)
      .slice(0, 3);
    activeUnit.sections.push({
      id: `${activeUnit.id}-section-${index}`,
      unitId: activeUnit.id,
      title: clean(line.replace(/(?:page|p\.)\s*\d+(?:\s*[-–]\s*\d+)?/i, "")),
      ...page,
      skill: "listening",
      exerciseType,
      prompts,
      vocabulary: lines.slice(index, index + 5).flatMap(vocabularyFor),
    });
  });

  const parsedSections = units.reduce((total, unit) => total + unit.sections.length, 0);
  return {
    id,
    title: file.name.replace(/\.[^.]+$/, "") || "Listening curriculum",
    fileName: file.name,
    fileType: file.type || "unknown",
    fileSize: file.size,
    totalPages,
    units,
    uploadedAt: now,
    analysisStatus: "completed",
    parserNote: parsedSections
      ? `识别到 ${units.length} 个 Unit 与 ${parsedSections} 个可执行练习。`
      : totalPages
        ? `识别到 ${totalPages} 页，但当前文件没有可可靠读取的 Unit / 练习文本。`
        : "文件已保存；无法可靠读取页码或章节，因此不会编造课程位置。",
  };
}

export function curriculumCurrentSection(book: CurriculumBook | null, progress: CurriculumProgress | null) {
  if (!book?.units.length) return null;
  const sections = book.units.flatMap((unit) => unit.sections.map((section) => ({ unit, section })));
  const matched = sections.find(({ section }) => section.id === progress?.currentSectionId);
  return matched || sections[0] || null;
}

export function curriculumLocation(book: CurriculumBook | null, progress: CurriculumProgress | null) {
  const current = curriculumCurrentSection(book, progress);
  if (!book) return "No listening curriculum uploaded.";
  if (!current) return `${book.title} · Pages unavailable`;
  const unit = current.unit.unitNumber ? `U${current.unit.unitNumber}` : current.unit.title || "Section";
  const page = current.section.startPage
    ? `P${current.section.startPage}${current.section.endPage && current.section.endPage !== current.section.startPage ? `–${current.section.endPage}` : ""}`
    : "Pages unavailable";
  return `${book.title} · ${unit} · ${page}`;
}

export function advanceCurriculumProgress(book: CurriculumBook | null, progress: CurriculumProgress | null, date: string) {
  const current = curriculumCurrentSection(book, progress);
  if (!book || !current) return progress;
  const sections = book.units.flatMap((unit) => unit.sections);
  const index = sections.findIndex((section) => section.id === current.section.id);
  const following = sections[index + 1] || current.section;
  const completed = current.section.startPage
    ? Array.from(new Set([...(progress?.completedPages || []), ...Array.from({ length: (current.section.endPage || current.section.startPage) - current.section.startPage + 1 }, (_, item) => current.section.startPage! + item)]))
    : progress?.completedPages || [];
  const nextUnit = book.units.find((unit) => unit.id === following.unitId);
  return {
    bookId: book.id,
    currentUnitId: nextUnit?.id,
    currentSectionId: following.id,
    currentPage: following.startPage,
    completedPages: completed,
    lastStudiedAt: date,
  } satisfies CurriculumProgress;
}
