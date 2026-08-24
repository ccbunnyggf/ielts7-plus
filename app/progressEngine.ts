export type MasteryComponent={label:string;score:number;weight:number;detail:string};
export type SkillMastery={score:number|null;components:MasteryComponent[];reason?:string};
export type ProgressInput={
 articles:{status:string;completedAt?:string}[];highlights:{type:string;createdAt:string}[];cards:{difficulty:string;reviewCount:number;lastReviewedAt?:string}[];
 listeningReviews:{trainingType:string;correct:boolean;rating:string;reviewCount:number;lastReviewedAt:string}[];
 writingMaterials:{type:string;masteryLevel?:number;reviewCount?:number;lastReviewedAt?:string;createdAt?:string}[];
 argumentCards:{createdAt:string}[];words:{due:string}[];sessions:{category:string;date:string;duration:number}[];
};
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const recent=(date?:string,days=30)=>!!date&&new Date(date).getTime()>=Date.now()-days*86400000;
const weighted=(parts:MasteryComponent[])=>clamp(parts.reduce((sum,x)=>sum+x.score*x.weight,0));
const reviewedScore=(cards:{difficulty:string;reviewCount:number;lastReviewedAt?:string}[])=>{
 if(!cards.length)return 0;
 const quality={again:15,hard:45,good:75,easy:95} as Record<string,number>;
 return cards.reduce((sum,x)=>sum+(quality[x.difficulty]??35)*Math.min(1,x.reviewCount/2),0)/cards.length;
};

export function calculateReadingMastery(input:ProgressInput):SkillMastery{
 const cards=input.cards,completed=input.articles.filter(x=>x.status==='completed'),phrases=input.highlights.filter(x=>['phrase','sentence','complex_sentence'].includes(x.type));
 if(cards.length<5&&completed.length<2)return {score:null,components:[],reason:'完成 2 篇阅读材料或积累 5 张复习卡后显示。'};
 const retention=reviewedScore(cards),depth=Math.min(100,completed.length*30),asset=Math.min(100,phrases.length*12),consistency=Math.min(100,cards.filter(x=>recent(x.lastReviewedAt)).length/Math.max(cards.length,1)*140);
 const components=[{label:'Review retention',score:retention,weight:.3,detail:`${cards.length} 张复习卡的最近回忆表现`},{label:'Phrase & sentence mastery',score:asset,weight:.2,detail:`${phrases.length} 个已标注短语或句子`},{label:'Completed material depth',score:depth,weight:.15,detail:`${completed.length} 篇完成材料`},{label:'Long-term review consistency',score:consistency,weight:.1,detail:'最近 30 天的复习覆盖'}];
 // 第一阶段还没有阅读正确率题目数据；剩余权重只在接入真实题目后启用。
 return {score:weighted(components.map(x=>({...x,weight:x.weight/.75}))),components};
}
export function calculateListeningMastery(input:ProgressInput):SkillMastery{
 const rs=input.listeningReviews;if(rs.length<5)return {score:null,components:[],reason:'完成至少 5 个听力复习项目后显示。'};
 const groups=(type:string)=>rs.filter(x=>x.trainingType===type),score=(items:typeof rs)=>items.length?items.filter(x=>x.correct).length/items.length*100:0;
 const retention=reviewedScore(rs),knownPenalty=rs.filter(x=>x.mistakeType==='known_not_heard').length/rs.length*25;
 const components=[{label:'Word recognition',score:score(groups('word')),weight:.2,detail:`${groups('word').length} 个单词识别项目`},{label:'Chunk recognition',score:score(groups('chunk')),weight:.2,detail:`${groups('chunk').length} 个意群项目`},{label:'Sentence dictation',score:score(groups('sentence')),weight:.25,detail:`${groups('sentence').length} 个句子项目`},{label:'Mini listening accuracy',score:score(groups('mini')),weight:.2,detail:`${groups('mini').length} 个短段落项目`},{label:'Review retention',score:Math.max(0,retention-knownPenalty),weight:.15,detail:'结合复习质量与 known-but-not-heard 记录'}];
 return {score:weighted(components),components};
}
export function calculateSpeakingMastery(input:ProgressInput):SkillMastery{
 const ss=input.sessions.filter(x=>x.category==='speaking');if(ss.length<5)return {score:null,components:[],reason:'完成至少 5 次口语训练后显示 Training Mastery。'};
 const dates=new Set(ss.map(x=>x.date)).size,thirty=ss.filter(x=>recent(x.date)).length;
 const components=[{label:'Completed attempts',score:Math.min(100,ss.length*12),weight:.45,detail:`${ss.length} 次已保存训练`},{label:'Session consistency',score:Math.min(100,dates*18),weight:.35,detail:`${dates} 个训练日`},{label:'Recent active practice',score:Math.min(100,thirty*16),weight:.2,detail:`最近 30 天 ${thirty} 次训练`}];
 return {score:weighted(components),components};
}
export function calculateWritingMastery(input:ProgressInput):SkillMastery{
 const materials=input.writingMaterials,active=materials.filter(x=>(x.reviewCount??0)>0||((x.masteryLevel??0)>=3)),argumentsDone=input.argumentCards.filter(x=>recent(x.createdAt,3650));
 if(active.length<3&&argumentsDone.length<2)return {score:null,components:[],reason:'完成 3 个写作素材复习或 2 张观点卡后显示。'};
 const patterns=materials.filter(x=>x.type==='sentence_pattern'),paragraphs=materials.filter(x=>x.type==='paragraph'),recall=Math.min(100,active.length*14);
 const components=[{label:'Phrase & sentence recall',score:recall,weight:.3,detail:`${active.length} 个已复习素材`},{label:'Sentence pattern recall',score:Math.min(100,patterns.filter(x=>(x.reviewCount??0)>0).length*25),weight:.22,detail:`${patterns.length} 个句型素材`},{label:'Argument recall',score:Math.min(100,argumentsDone.length*30),weight:.25,detail:`${argumentsDone.length} 张观点卡`},{label:'Paragraph production',score:Math.min(100,paragraphs.length*35),weight:.23,detail:`${paragraphs.length} 段已保存产出`}];
 return {score:weighted(components),components};
}
export function calculateVocabularyMastery(input:ProgressInput):SkillMastery{
 // 单词系统尚未存储逐词 recall / active-use 结果，因此不以词库数量伪造掌握度。
 return {score:null,components:[],reason:input.words.length?'完成主动回忆与造句记录后显示。':'先添加词汇并完成主动回忆。'};
}
export function calculateProgress(input:ProgressInput){
 const reading=calculateReadingMastery(input),listening=calculateListeningMastery(input),speaking=calculateSpeakingMastery(input),writing=calculateWritingMastery(input),vocabulary=calculateVocabularyMastery(input);
 const skills={reading,listening,speaking,writing,vocabulary};const valid=Object.values(skills).filter(x=>x.score!==null) as {score:number}[];
 // 为避免把未训练项目错误视为 0，只有 3 项以上已有真实证据时才计算整体指数。
 const overall=valid.length>=3?clamp(valid.reduce((sum,x)=>sum+x.score,0)/valid.length):null;
 return {skills,overall,validCount:valid.length};
}
