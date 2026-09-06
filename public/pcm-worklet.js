class PCMRecorder extends AudioWorkletProcessor{
 constructor(){super();this.step=Math.max(1,sampleRate/16000);this.phase=0;this.carry=0;this.pending=[];}
 process(inputs){const input=inputs[0]?.[0];if(!input)return true;const samples=[];for(let i=this.phase;i<input.length;i+=this.step){const index=Math.floor(i),next=Math.min(index+1,input.length-1),mix=i-index;samples.push(input[index]*(1-mix)+input[next]*mix);}this.phase=(this.phase-input.length)%this.step;if(this.phase<0)this.phase+=this.step;const out=new ArrayBuffer(samples.length*2),view=new DataView(out);samples.forEach((sample,i)=>view.setInt16(i*2,Math.max(-32768,Math.min(32767,Math.round(sample*32767))),true));this.port.postMessage(out,[out]);return true;}
}
registerProcessor('pcm-recorder',PCMRecorder);
