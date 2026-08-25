export type SupervisorState = 'LOW_START'|'RECOVERING'|'STRONG_DAY'|'NEAR_COMPLETE'|'OVERLOAD'|'DECLINE';
export type SupervisorInput = {dateKey:string; todayProgress:number; dailyTheme:string; studyTime:number; weakestSkill?:string; reviewDue:number; recentTrend:'up'|'flat'|'down'; dailyDelta:number; completedModules:number; skippedModules:number; nextModule?:string};
export type SupervisorMessage = {id:string; state:SupervisorState; headline:string; message:string; nextAction:string};

const copy:Record<SupervisorState, [string, string][]> = {
  LOW_START:[
    ['今天还没形成推进，但这一天远没结束。','别把前半天的空白变成整天的空白。先完成一段完整训练，方向就回来了。'],
    ['现在开始，今天依然有价值。','你不需要一次翻盘，只要先拿下一格。'],
    ['今天还没真正开始。没关系，先拿下一格。','别继续盘点落后；把主线接回来，比解释原因重要。'],
    ['别把“等会儿”养成今天的结局。','先做一个核心模块，今天就不算白过。'],
    ['今天不需要证明什么，只需要重新上线。','一段完整训练，比十次犹豫更接近目标。'],
    ['先别对今天下结论。','接下来这一小时，足够把今天从停滞改成推进。'],
  ],
  RECOVERING:[
    ['节奏正在回来，继续往前压一段。','今天最难的不是学多少，而是重新启动；这一关你已经过了。'],
    ['你已经重新上轨，别在这里停。','把眼前这一段做完，今天就从“开始”变成“有效”。'],
    ['起步慢不等于今天输了。','别急着补偿式加码，沿着主线再走一格就够。'],
    ['现在不是评价自己的时候。','把正在做的模块收完整，节奏会自己回来。'],
    ['你已经把门推开了。','接下来别分心，完成一段连续训练，把状态锁住。'],
    ['重新启动本身就是推进。','今天这一小时很小，但长期能力就是靠这种小段堆起来的。'],
  ],
  STRONG_DAY:[
    ['今天是真推进，不是单纯堆时长。','状态不错，趁势把主线收完整，别让成果散在半路。'],
    ['今天已经走出了增量。','剩下的事不是加码，而是把成果锁进复习和输出。'],
    ['今天的节奏值得保护。','别换题、别跳任务，把当前链条走到底。'],
    ['今天在往前走，而且走得扎实。','继续把下一段做完，让有效训练形成连续性。'],
    ['今天不是碰巧努力，是在建立惯性。','把主线再推进一格，明天会更好接上。'],
    ['状态起来了，就别把注意力花在自我表扬上。','继续完成下一段，成果自然会留下。'],
  ],
  NEAR_COMPLETE:[
    ['今天已经够了，最后把复习收掉。','主线完整，别再无意义加码；收尾比继续扩张更重要。'],
    ['今天这局稳了，收尾别掉线。','把最后一项做完，让今天成为一个闭环。'],
    ['今天已经形成有效增长。','现在守住成果，不需要再证明意志力。'],
    ['主线快走完了，别在终点前分神。','最后一段做得干净，明天就能轻松接上。'],
    ['今天不是还差很多，只差一个收口。','完成最后的复习，把今天的东西留到以后。'],
    ['今天的账已经算得不错。','收掉最后一项，然后安心结束。'],
  ],
  OVERLOAD:[
    ['今天投入已经足够，别把有效训练拖成疲劳堆积。','继续硬撑的收益在下降；完成收尾后就结束。'],
    ['今天不缺意志力，缺的是停在合适的位置。','把复习收掉，别用更多时长稀释已经得到的成果。'],
    ['今天已经走得很远了。','现在要守住成果，不是继续证明自己能扛。'],
    ['别把认真变成透支。','最后做一段轻量复习，今天就可以收工。'],
    ['今天的投入够用了。','有效训练不是把一天榨干，而是知道什么时候停。'],
    ['今天已经给未来存下了东西。','收尾后结束，把精力留给明天的连续性。'],
  ],
  DECLINE:[
    ['这是回调，不是崩盘。','问题在连续性，不在某一天；今天只要把主线重新接回来。'],
    ['不要试图追回过去两天。','把今天重新做对，比补偿过去更有效。'],
    ['节奏掉了，可以重新拿回来。','不用爆肝，只要把主线往前推一格。'],
    ['回调说明该修节奏，不说明你不行。','先完成一个核心训练，连续性从今天重新算。'],
    ['今天不用打败昨天。','把眼前这一段做扎实，趋势就会慢慢反转。'],
    ['别把波动误判成终局。','今天重新落一子，长期走势就还有空间。'],
  ],
};

export function getSupervisorState(input:SupervisorInput):SupervisorState {
  if (input.studyTime >= 4 * 60 * 60) return 'OVERLOAD';
  if (input.completedModules >= 4 || input.todayProgress >= 80) return 'NEAR_COMPLETE';
  if (input.recentTrend === 'down' && input.completedModules < 2) return 'DECLINE';
  if (input.completedModules >= 2 || input.todayProgress >= 45) return 'STRONG_DAY';
  if (input.studyTime > 0 || input.todayProgress > 0) return 'RECOVERING';
  return 'LOW_START';
}

export function stableHash(input:string):number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function pickDailyMessage<T>(messages:T[], dateKey:string, stateKey:string):T | undefined {
  if (!messages.length) return undefined;
  return messages[stableHash(`${dateKey}:${stateKey}`) % messages.length];
}

export function generateSupervisorMessage(input:SupervisorInput):SupervisorMessage {
  const state = getSupervisorState(input), options = copy[state];
  const stateKey = `${state}:${input.nextModule ?? ""}`;
  const selected = pickDailyMessage(options, input.dateKey, stateKey) ?? options[0];
  const index = options.indexOf(selected);
  const [headline, message] = selected;
  return {id:`${state}-${index}`, state, headline, message, nextAction:''};
}
