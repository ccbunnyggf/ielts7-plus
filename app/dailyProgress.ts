export type DailyProgressPoint={date:string;score:number;delta:number;status:'up'|'down'|'flat';reason:string;message:string};
export type DailyProgressCandle={date:string;open:number;high:number;low:number;close:number;delta:number;insight:string;reason:string};
type Input={date:string;sessions:{date:string;category:string;duration:number}[];tasks:{category:string;completed:boolean;type:string}[];reviews:{timestamp:string;correct:boolean}[];previous?:DailyProgressPoint};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function calculateDailyProgressScore(input:Input):DailyProgressPoint|null{
 const sessions=input.sessions.filter(x=>x.date===input.date),reviews=input.reviews.filter(x=>x.timestamp.slice(0,10)===input.date);
 if(!sessions.length&&!reviews.length)return null;
 const seconds=sessions.reduce((a,x)=>a+x.duration,0),core=input.tasks.filter(x=>x.type==='core'),done=core.filter(x=>x.completed).length/Math.max(1,core.length),themeSkills=new Set(sessions.filter(x=>['reading','listening','speaking','writing'].includes(x.category)).map(x=>x.category)).size,retention=reviews.length?reviews.filter(x=>x.correct).length/reviews.length:.65;
 const quality=done*.9+Math.min(seconds/5400,.65)+themeSkills*.18+(retention-.5)*.55;
 const delta=clamp(Math.round(quality*3.2-1),-3,5);const baseline=input.previous?.score??clamp(6+Math.round(quality*3),5,12),score=clamp(input.previous?input.previous.score+delta:baseline,1,100),status=delta>0?'up':delta<0?'down':'flat';
 const message=status==='up'?(retention>=.8?'今天是扎实上涨，复习表现也在支持进步。':'主线在推进，明天继续补强输出。'):status==='down'?'今天推进较弱，明天先回到核心训练。':'今天更像维持盘，下一步要补一段主线训练。';
 return {date:input.date,score,delta,status,reason:themeSkills>=3?'主题主线推进':reviews.length&&retention<.6?'复习表现偏弱':'真实训练记录',message};
}

/** Converts persisted daily evidence into chart-ready OHLC data without inventing progress. */
export function toDailyProgressCandles(points:DailyProgressPoint[]):DailyProgressCandle[]{
 return [...points].sort((a,b)=>a.date.localeCompare(b.date)).map((point,index,all)=>{
  const open=index?all[index-1].score:clamp(point.score-point.delta,1,100);
  const close=point.score;
  return {date:point.date,open,high:Math.max(open,close),low:Math.min(open,close),close,delta:point.delta,insight:point.message,reason:point.reason};
 });
}
