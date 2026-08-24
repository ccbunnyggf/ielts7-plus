export type SpeechController={stop:()=>void};
type RecognitionResultLike={results:{[key:number]:{[key:number]:{transcript:string}}};resultIndex:number};
export function startBrowserTranscription(onText:(text:string)=>void,onError:(message:string)=>void):SpeechController|null{
 if(typeof window==='undefined')return null;
 const SpeechRecognition=(window as typeof window & {SpeechRecognition?:new()=>{lang:string;interimResults:boolean;continuous:boolean;start:()=>void;stop:()=>void;onresult:(event:RecognitionResultLike)=>void;onerror:()=>void}}).SpeechRecognition||(window as typeof window & {webkitSpeechRecognition?:new()=>{lang:string;interimResults:boolean;continuous:boolean;start:()=>void;stop:()=>void;onresult:(event:RecognitionResultLike)=>void;onerror:()=>void}}).webkitSpeechRecognition;
 if(!SpeechRecognition){onError('Voice transcription is not supported in this browser.');return null}
 const recognition=new SpeechRecognition();recognition.lang='en-US';recognition.interimResults=false;recognition.continuous=false;recognition.onresult=e=>onText(e.results[e.resultIndex][0].transcript);recognition.onerror=()=>onError('Unable to transcribe. You can type or edit your answer instead.');recognition.start();return {stop:()=>recognition.stop()};
}
