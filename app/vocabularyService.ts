export type InboxType='word'|'phrase'|'mistake'|'suggestion';
export type VocabularyInboxItem={id:string;type:InboxType;content:string;sourceModule:'reading'|'listening'|'speaking'|'writing'|'review'|'manual';sourceId?:string;context?:string;topic?:string;createdAt:string;status:'pending'|'accepted'|'ignored';priority:'high'|'normal'|'optional';correctForm?:string;mistakeType?:string};
export type VocabularyMistake={id:string;entityKey:string;wrongForm:string;correctForm:string;mistakeType:string;context:string;sourceModule:string;sourceId?:string;createdAt:string;reviewCount:number;resolved:boolean};

export const normalizeVocabulary=(value:string)=>value.trim().toLowerCase().replace(/[.。!！?？,，;；:：]+$/,'').replace(/\s+/g,' ');
export const makeInboxItem=(input:Omit<VocabularyInboxItem,'id'|'createdAt'|'status'>):VocabularyInboxItem=>({id:`inbox-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,createdAt:new Date().toISOString(),status:'pending',...input});

export function dedupeInbox(items:VocabularyInboxItem[]){const seen=new Set<string>();return items.filter(item=>{const key=`${item.type}:${normalizeVocabulary(item.content)}`;if(seen.has(key))return false;seen.add(key);return true})}

/** Placeholder enrichment boundary: future AI can replace these safe defaults without changing UI code. */
export function enrichCandidate(content:string){return {zh:'待补充释义',def:'Definition will be enriched when AI is connected.',collocation:'Suggested collocations will appear here.',example:`Use “${content}” in a topic-relevant IELTS sentence.`}}
