// YIN difference function and cumulative mean normalization; one pitched source only.
export function detectPitch(samples, sampleRate) {
 let power=0, mean=0;
 for(const s of samples) mean+=s;
 mean/=samples.length;
 for(const s of samples) power+=(s-mean)**2;
 const rms=Math.sqrt(power/samples.length);
 if(rms<.008) return {frequency:null, confidence:0, rms};
 const minLag=Math.floor(sampleRate/4500), maxLag=Math.min(Math.ceil(sampleRate/24), Math.floor(samples.length/2)-1);
 const window=samples.length-maxLag;
 const diff=new Float32Array(maxLag+1);
 for(let lag=1;lag<=maxLag;lag++) {
  let sum=0; for(let i=0;i<window;i++){ const delta=samples[i]-samples[i+lag]; sum+=delta*delta; }
  diff[lag]=sum;
 }
 let running=0;
 const normalized=new Float32Array(maxLag+1); normalized[0]=1;
 for(let lag=1;lag<=maxLag;lag++){ running+=diff[lag]; normalized[lag]=running?diff[lag]*lag/running:1; }
 for(let lag=minLag;lag<maxLag;lag++) if(normalized[lag]<.12) {
  while(lag+1<maxLag && normalized[lag+1]<normalized[lag]) lag++;
  const a=normalized[lag-1], b=normalized[lag], c=normalized[lag+1];
  const correction=(a-c)/(2*(a-2*b+c)) || 0;
  return {frequency:sampleRate/(lag+correction), confidence:1-b, rms};
 }
 return {frequency:null, confidence:0, rms};
}
export class NoteGate {
 constructor(){ this.reset(); }
 reset(){ this.candidate=null; this.since=0; this.last=null; this.silentSince=null; this.frames=0; }
 accept(midi, now) {
  if(midi===null){
   if(this.silentSince===null) this.silentSince=now;
   if(now-this.silentSince>=180){ this.last=null; this.candidate=null; this.frames=0; }
   return null;
  }
  this.silentSince=null;
  if(this.candidate!==midi){ this.candidate=midi; this.since=now; this.frames=1; return null; }
  this.frames++;
  if(this.frames>=3 && now-this.since>=160 && this.last!==midi){ this.last=midi; return midi; }
  return null;
 }
}
