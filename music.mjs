export const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const CHROMATIC = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLATS = {1:'D♭', 3:'E♭', 6:'G♭', 8:'A♭', 10:'B♭'};
export function noteName(midi) { return CHROMATIC[midi % 12] + (Math.floor(midi / 12) - 1); }
export function fullName(midi) { return noteName(midi) + (FLATS[midi % 12] ? ` / ${FLATS[midi % 12]}${Math.floor(midi / 12) - 1}` : ''); }
export function isNatural(midi) { return NATURAL.includes(midi % 12); }
export function naturalIndex(midi) { return (Math.floor(midi / 12) - 1) * 7 + NATURAL.indexOf(midi % 12); }
export function frequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }
export function pitchToNote(hz) { const exact = 69 + 12 * Math.log2(hz / 440); return {midi:Math.round(exact), cents:Math.round((exact - Math.round(exact)) * 100)}; }
export function notesBetween(lo, hi) { return Array.from({length:hi-lo+1}, (_, i) => lo+i).filter(isNatural); }
export const STAGES = [
 {name:'键盘地标', detail:'键型规律 + 中央 C', lo:60, hi:60, clef:'treble'},
 {name:'高音谱表入门', detail:'C4–G4', lo:60, hi:67, clef:'treble'},
 {name:'高音谱表八度', detail:'C4–C5', lo:60, hi:72, clef:'treble'},
 {name:'低音谱表八度', detail:'C3–C4', lo:48, hi:60, clef:'bass'},
 {name:'大谱表综合', detail:'C3–C5 混合', lo:48, hi:72, clef:'mixed'}
];
export function noteStep(midi, clef) {
 const natural = isNatural(midi) ? midi : midi-1;
 return naturalIndex(natural) - (clef === 'bass' ? naturalIndex(43) : naturalIndex(64));
}
export function ledgerSteps(step) {
 const result = [];
 if (step < 0) for (let s=-2; s>=step; s-=2) result.push(s);
 if (step > 8) for (let s=10; s<=step; s+=2) result.push(s);
 return result;
}
export function positionText(midi, clef) {
 const s = noteStep(midi, clef);
 let pos;
 if(s>=0 && s<=8) pos = s%2 === 0 ? `第 ${s/2+1} 线` : `第 ${(s+1)/2} 间`;
 else { const n = s<0 ? -s : s-8; pos = `${s<0?'下':'上'}加${n%2===0 ? ` ${n/2} 线` : ` ${Math.ceil(n/2)} 间`}`; }
 return `${clef==='bass'?'低音':'高音'}谱表 · ${pos}${isNatural(midi)?'':' · 升半音'}`;
}
export function errorText(actual, target) {
 if(actual%12===target%12) return `音名相同，八度不同：你弹的是 ${noteName(actual)}，目标是 ${noteName(target)}。`;
 return `你选的是 ${noteName(actual)}，比目标 ${noteName(target)} ${actual>target?'高':'低'} ${Math.abs(actual-target)} 个半音。`;
}
export function gradeQuestion(q) { return q.solved && !q.revealed && q.attempts.length===1 && q.attempts[0].midi===q.midi && q.hints===0; }
export function randomClef(midi, stage, rng=Math.random) { return stage.clef!=='mixed'?stage.clef : midi<60?'bass':midi>60?'treble':rng()<.5?'bass':'treble'; }
export function makeQuestion(midi, stage) {
 const clef=randomClef(midi,stage);
 let pool=notesBetween(stage.lo,stage.hi).filter(n=>stage.clef!=='mixed'||(clef==='bass'?n<=60:n>=60));
 if(pool.length<3)pool=notesBetween(clef==='bass'?48:60,clef==='bass'?60:72);
 const neighbors=pool.filter(n=>n!==midi).sort((a,b)=>Math.abs(a-midi)-Math.abs(b-midi)).slice(0,4);
 const others=neighbors.sort(()=>Math.random()-.5).slice(0,2);
 return {midi, clef, choices:[midi,...others].sort(()=>Math.random()-.5), attempts:[], hints:0, solved:false, revealed:false};
}

// Keep extreme piano notes legible while preserving their sounding pitch.
export function notation(midi, clef) {
 let written=midi, octaves=0;
 while(noteStep(written,clef)>14){written-=12;octaves++;}
 while(noteStep(written,clef)<-6){written+=12;octaves--;}
 const amount=Math.abs(octaves);
 return {written, octaves, mark:amount ? String(amount*7+1)+(octaves>0?'va':'vb') : ''};
}
