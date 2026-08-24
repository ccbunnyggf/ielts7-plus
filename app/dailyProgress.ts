export type DailyProgressPoint={date:string;score:number;delta:number;status:'up'|'down'|'flat';reason:string;message:string;recoveryInfluence?:number;forgetInfluence?:number};
export type DailyProgressCandle={date:string;open:number;high:number;low:number;close:number;delta:number;insight:string;reason:string;recoveryInfluence:number;forgetInfluence:number};
type Input={date:string;sessions:{date:string;category:string;duration:number}[];tasks:{category:string;completed:boolean;type:string}[];reviews:{timestamp:string;correct:boolean}[];previous?:DailyProgressPoint};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function calculateDailyProgressScore(input:Input):DailyProgressPoint|null{
 const sessions=input.sessions.filter(x=>x.date===input.date),reviews=input.reviews.filter(x=>x.timestamp.slice(0,10)===input.date);
 if(!sessions.length&&!reviews.length)return null;
 const seconds=sessions.reduce((a,x)=>a+x.duration,0),core=input.tasks.filter(x=>x.type==='core'),done=core.filter(x=>x.completed).length/Math.max(1,core.length),themeSkills=new Set(sessions.filter(x=>['reading','listening','speaking','writing'].includes(x.category)).map(x=>x.category)).size,retention=reviews.length?reviews.filter(x=>x.correct).length/reviews.length:.65;
 const recoveredCount=reviews.filter(x=>x.correct).length,forgottenCount=reviews.filter(x=>!x.correct).length;
 // Memory events affect only the wick: a soft, capped signal rather than a 1:1 word count.
 const recoveryInfluence=clamp(recoveredCount*.18,0,2.5),forgetInfluence=clamp(forgottenCount*.18,0,2.5);
 const quality=done*.9+Math.min(seconds/5400,.65)+themeSkills*.18+(retention-.5)*.55;
 const delta=clamp(Math.round(quality*3.2-1),-3,5);const baseline=input.previous?.score??clamp(6+Math.round(quality*3),5,12),score=clamp(input.previous?input.previous.score+delta:baseline,1,100),status=delta>0?'up':delta<0?'down':'flat';
 const message=status==='up'?(recoveryInfluence>=.7?'召回表现不错，旧知识正在重新激活。':retention>=.8?'今天整体小幅上涨，复习对推进有帮助。':'主体走势尚可，明天继续补强输出。'):status==='down'?(forgetInfluence>0?'今天回调不大，主要来自遗忘与误认波动。':'今天推进较弱，明天先把主线接回来。'):(forgetInfluence>recoveryInfluence?'整体接近横盘，但遗忘波动仍然存在。':'主体稳定，下一步补一段主动输出。');
 return {date:input.date,score,delta,status,reason:themeSkills>=3?'主题主线推进':forgottenCount?'复习与记忆波动':'真实训练记录',message,recoveryInfluence,forgetInfluence};
}

/** Converts persisted daily evidence into chart-ready OHLC data without inventing progress. */
export function toDailyProgressCandles(points:DailyProgressPoint[]):DailyProgressCandle[]{
 return [...points].sort((a,b)=>a.date.localeCompare(b.date)).map((point,index,all)=>{
  const open=index?all[index-1].score:clamp(point.score-point.delta,1,100);
  const close=point.score;
  const recoveryInfluence=point.recoveryInfluence??0,forgetInfluence=point.forgetInfluence??0;
  return {date:point.date,open,high:clamp(Math.max(open,close)+recoveryInfluence,1,100),low:clamp(Math.min(open,close)-forgetInfluence,1,100),close,delta:close-open,insight:point.message,reason:point.reason,recoveryInfluence,forgetInfluence};
 });
}
