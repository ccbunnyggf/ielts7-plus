import type { VocabularyDimension } from "./vocabularyPlanner";

export const dimensionLabel: Record<VocabularyDimension, string> = {
  meaningRecognition: "识义",
  listeningRecognition: "听力识别",
  collocationRecall: "搭配",
  speakingRecall: "口语调用",
  writingRecall: "写作调用",
  spelling: "拼写",
};

export function promptForDimension(dimension: VocabularyDimension, word: { word: string; zh: string; collocation: string }) {
  if (dimension === "listeningRecognition") return { prompt: `听到 “${word.word}” 时，你能说出中文意思吗？`, answer: word.zh };
  if (dimension === "collocationRecall") return { prompt: `${word.word} ______`, answer: word.collocation };
  if (dimension === "speakingRecall") return { prompt: `请用 ${word.word} 口头表达一个观点；语音不可用时可先在脑中组织。`, answer: word.collocation };
  if (dimension === "writingRecall") return { prompt: `用 ${word.word} 写一句与今天主题有关的句子。`, answer: word.collocation };
  if (dimension === "spelling") return { prompt: `请根据中文“${word.zh}”拼写这个词。`, answer: word.word };
  return { prompt: "它是什么意思？你能想到一个常用搭配吗？", answer: word.zh };
}
