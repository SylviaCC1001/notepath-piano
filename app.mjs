import {STAGES, noteName, fullName, isNatural, notesBetween, frequency, pitchToNote, noteStep, ledgerSteps, notation, positionText, errorText, gradeQuestion, makeQuestion} from './music.mjs';
import {detectPitch, NoteGate} from './pitch.mjs';
const $=id=>document.getElementById(id);
const STORE='piano-lab-v1';
let saved={};
try{saved=JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch{}
const state={page:'explore',stage:Number.isInteger(saved.stage)&&saved.stage>=0&&saved.stage<5?saved.stage:1,mode:'score',selected:60,clef:'treble',labels:saved.labels!==false,muted:saved.muted===true,round:null,history:Array.isArray(saved.history)?saved.history.filter(r=>r&&Array.isArray(r.items)&&typeof r.time==='string').slice(-30):[]};
let audio=null,voices=[],mic=null,micContext=null,micStream=null,micSource=null,micAnalyser=null,micFrame=0,micState='off',micToken=0,suppressedUntil=0,lastFrame=0;
let micMessage='麦克风未开启。音频仅在本地实时分析，不会录音或上传。',micPitch='',message='慢慢来。准备好后选择答案，本练习不限时。',messageType='',storageError='';
const gate=new NoteGate();
const micIcon='<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8"></path></svg>';
const sparkle='<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z"></path><path d="m5 14 .7 2.3L8 17.5l-2.3 1.2L5 21l-.7-2.3L2 17.5l2.3-1.2L5 14Z"></path></svg>';
const restartIcon='<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10a8 8 0 1 1 2 7"></path><path d="M4 4v6h6"></path></svg>';
function persist(){try{localStorage.setItem(STORE,JSON.stringify({stage:state.stage,labels:state.labels,muted:state.muted,history:state.history.slice(-30)}));}catch{storageError='浏览器未允许本地存储，本次练习仍可继续。';$('announcement').textContent=storageError;}}
function question(){return state.round?.items[state.round.index];}
function stage(){return STAGES[state.stage];}
function feedback(text,type=''){message=text;messageType=type;$('announcement').textContent=text;}
function staff(midi,clef,{showName=false,interactive=false,label='待识别的音符'}={}){
 const n=notation(midi,clef),step=noteStep(n.written,clef),bottom=120,x=180,y=bottom-step*8;
 const lines=Array.from({length:5},(_,i)=>`<line x1="18" x2="262" y1="${bottom-i*16}" y2="${bottom-i*16}" class="staff-line"/>`).join('');
 const ledgers=ledgerSteps(step).map(s=>`<line x1="160" x2="200" y1="${bottom-s*8}" y2="${bottom-s*8}" class="ledger"/>`).join('');
 const stemX=x+(step>=4?-11:11),stemEnd=y+(step>=4?42:-42);
 const hits=interactive?notesBetween(clef==='bass'?31:57,clef==='bass'?67:89).filter(m=>noteStep(m,clef)>=-6&&noteStep(m,clef)<=14&&m+n.octaves*12>=21&&m+n.octaves*12<=108).map(m=>`<g class="staff-hit" data-note="${m+n.octaves*12}" role="button" tabindex="0" aria-label="选择 ${noteName(m+n.octaves*12)}，${positionText(m,clef)}${n.mark?' · '+n.mark:''}"><rect x="105" y="${bottom-noteStep(m,clef)*8-4}" width="108" height="8" fill="transparent"/></g>`).join(''):'';
 return `<svg viewBox="0 0 280 190" role="${interactive?'group':'img'}" aria-label="${label}" data-written="${n.written}" data-octaves="${n.octaves}">${lines}<text x="28" y="${clef==='bass'?110:119}" class="clef clef-${clef}">${clef==='bass'?'𝄢':'𝄞'}</text>${ledgers}${isNatural(midi)?'':`<text x="145" y="${y+7}" class="accidental">♯</text>`}<ellipse cx="${x}" cy="${y}" rx="13" ry="9" transform="rotate(-12 ${x} ${y})" class="note-head"/><line x1="${stemX}" x2="${stemX}" y1="${y}" y2="${stemEnd}" class="note-stem"/>${n.mark?`<text x="160" y="${n.octaves>0?18:185}" class="octave-mark">${n.mark}</text>`:''}${showName?`<text x="215" y="${y+5}" class="staff-label">${noteName(midi)}</text>`:''}${hits}</svg>`;
}
function keyboard(active,{explore=false,center=60,labels=false}={}){
 const whites=notesBetween(21,108);
 let keys=whites.map((m,i)=>`<button class="button piano-key white-key ${active===m?'key-selected':''}" data-key="${m}" aria-label="${explore?noteName(m):`第 ${i+1} 个白键`}" aria-pressed="${active===m}">${labels||m===60?`<span class="key-label">${noteName(m).slice(0,-1)}<small>${noteName(m).slice(-1)}</small></span>`:''}${m===60?'<span class="middle-dot"></span>':''}</button>`).join('');
 for(let m=22;m<108;m++)if(!isNatural(m)){
  const before=whites.filter(n=>n<m).length,name=fullName(m).split(' / ');
  keys+=`<button class="button piano-key black-key ${active===m?'key-selected':''}" style="left:${before*44-13}px" data-key="${m}" aria-label="${explore?fullName(m):`第 ${m-20} 个半音位置黑键`}" aria-pressed="${active===m}">${labels?`<span class="black-label">${name[0].slice(0,-1)}<small>${name[1].slice(0,-1)}</small></span>`:''}</button>`;
 }
 return `<div class="piano-wrap"><div class="piano-viewport" tabindex="0" aria-label="钢琴键盘，可横向滚动"><div id="keyboard" class="piano" data-center="${center}" aria-label="A0 到 C8 的完整 88 键钢琴键盘">${keys}</div></div><div class="keyboard-scale"><span>A0 · 钢琴最低音</span><span class="middle-marker">${explore?`自动跟随 ${noteName(center)}`:active!==null?'自动跟随 标记琴键':'练习音区 '+stage().detail}</span><span>C8 · 钢琴最高音</span></div></div>`;
}
function centerKeyboard(smooth=false){
 const piano=$('keyboard');if(!piano)return;
 const key=piano.querySelector(`[data-key="${piano.dataset.center}"]`),wrap=piano.parentElement;
 if(key)wrap.scrollTo({left:Math.max(0,key.offsetLeft+key.offsetWidth/2-wrap.clientWidth/2),behavior:smooth===true?'smooth':'instant'});
}
function noteDescription(){const n=notation(state.selected,state.clef);return state.selected===60?'中央 C · 两种谱表的共同地标':`${n.mark?n.mark+' 记写 · ':''}${positionText(n.written,state.clef)}`;}
function explorePage(){
 return `<section class="hero"><div class="eyebrow">${sparkle} 自由探索</div><h1>看懂音符，找到琴键。</h1><p>点击任意一侧，建立琴键位置、音名与五线谱之间的联系。</p></section><section class="learning-grid"><div class="panel staff-panel"><div class="panel-heading"><div><span class="step">01</span><h2>五线谱位置</h2></div><div class="segmented" aria-label="谱号"><button class="button segment ${state.clef==='treble'?'segment-active':''}" data-clef="treble" aria-pressed="${state.clef==='treble'}">高音</button><button class="button segment ${state.clef==='bass'?'segment-active':''}" data-clef="bass" aria-pressed="${state.clef==='bass'}">低音</button></div></div><div id="staff" class="staff staff-interactive">${staff(state.selected,state.clef,{showName:true,interactive:true,label:`${state.clef==='bass'?'低音':'高音'}谱表上的 ${fullName(state.selected)}`})}</div><div class="note-insight"><div class="note-badge">${noteName(state.selected).slice(0,-1)}</div><div><strong>${fullName(state.selected)}</strong><span>${noteDescription()}</span></div><button class="button text-button" data-action="replay" aria-label="试听当前音符">试听</button></div></div><div class="connection" aria-hidden="true"><span></span><b>${noteName(state.selected)}</b><span></span></div><div class="panel keyboard-panel"><div class="panel-heading"><div><span class="step">02</span><h2>钢琴键位</h2></div><label class="switch-label">显示音名<input id="labels" type="checkbox" ${state.labels?'checked':''}><span class="switch"></span></label></div>${keyboard(state.selected,{explore:true,center:state.selected,labels:state.labels})}<div class="pattern-callout"><div class="black-pattern"><i></i><i></i></div><p><strong>找到 C</strong><span>每组两个黑键的左侧就是 C。</span></p><div class="black-pattern"><i></i><i></i><i></i></div></div></div></section>${micCard()}`;
}
function micCard(){return `<section class="mic-card" aria-label="麦克风单音识别"><div id="mic-light" class="mic-orb">${micIcon}</div><div class="mic-copy"><h3>弹奏你的真实钢琴</h3><p id="mic-status" role="status"></p><small class="mic-note">一次弹一个音 · A4 = 440 Hz · 仅核对音高</small></div><div class="recognized"><span>识别音高</span><strong id="mic-pitch">—</strong></div><div class="mic-actions"><button id="mic-toggle" class="button primary" data-action="mic-toggle">开始聆听</button><button id="mic-stop" class="button ghost" data-action="mic-stop" hidden>结束</button></div></section>`;}
function settings(){return `<aside class="practice-settings panel"><h2>练习设置</h2><label>阶段</label><div class="stage-list">${STAGES.map((s,i)=>`<button class="button stage-item ${i===state.stage?'active':''}" data-stage="${i}" aria-pressed="${i===state.stage}"><b>${i+1}</b><span><strong>${s.name}</strong><small>${s.detail}</small></span></button>`).join('')}</div><label>练习方向</label><div class="direction-picker"><button class="button segment ${state.mode==='score'?'segment-active':''}" data-mode="score" aria-pressed="${state.mode==='score'}">谱表 → 琴键</button><button class="button segment ${state.mode==='key'?'segment-active':''}" data-mode="key" aria-pressed="${state.mode==='key'}">琴键 → 谱表</button></div><button class="button secondary full" data-action="restart">${restartIcon} 开始新一轮</button></aside>`;}
function practicePage(){
 const r=state.round,q=question(),done=r.complete,progress=done?100:Math.round((r.index+1)/r.items.length*100),reverse=state.mode==='key';
 const active=reverse||q.solved?q.midi:null,center=active??Math.round((stage().lo+stage().hi)/2);
 let body=done?result():`<div class="question-kicker">${q.clef==='bass'?'低音':'高音'}谱表</div>${reverse?`<div class="target-key">${keyboard(active,{center})}</div><div id="choices" class="staff-choices">${q.choices.map((n,i)=>`<button class="button choice-wrap ${q.solved&&n===q.midi?'correct':q.attempts.some(a=>a.midi===n)?'incorrect':''}" data-choice="${i}" aria-label="选项 ${String.fromCharCode(65+i)}" ${q.solved?'disabled':''}><span>${String.fromCharCode(65+i)}</span><div class="staff staff-compact">${staff(n,q.clef,{label:`选项 ${String.fromCharCode(65+i)} 的音符`})}</div></button>`).join('')}</div>`:`<div id="staff" class="staff">${staff(q.midi,q.clef,{showName:q.solved,label:`${q.clef==='bass'?'低音':'高音'}谱表练习音符`})}</div><div class="answer-area">${keyboard(active,{center})}<div class="real-piano-row"><span>${micIcon} 想用真实钢琴作答？</span><button class="button text-button" data-action="mic-focus">使用麦克风</button></div></div>`}<div id="feedback" class="feedback ${messageType}" role="status"><strong>${message}</strong>${q.solved?`<span>${noteName(q.midi)} · ${positionText(q.midi,q.clef)}</span>`:''}</div><div class="question-actions">${q.solved?'<button class="button ghost" data-action="replay">试听答案</button>':`<button class="button ghost" data-action="hint">${q.hints===2?'查看答案':q.hints===1?'提示音名':'提示'}</button>`}<button class="button primary" data-action="next" ${q.solved?'':'disabled'}>${r.index===r.items.length-1?'完成本轮':'下一题'}</button></div>`;
 return `<section class="practice-header"><div><div class="eyebrow">第 ${state.stage+1} 阶段 · ${stage().name}</div><h1>${done?'每一轮，都是新的积累。':reverse?'这个琴键对应哪个音符？':'这个音符对应哪个琴键？'}</h1></div><div class="progress-wrap"><div class="progress-label"><span>${done?'本轮已完成':`第 ${r.index+1} 题，共 ${r.items.length} 题`}</span><span>${progress}%</span></div><div class="progress"><span style="width:${progress}%"></span></div></div></section><section class="practice-layout">${settings()}<div class="question-card panel">${body}</div></section>${!reverse?micCard():''}`;
}
function result(){
 const r=state.round,correct=r.items.filter(gradeQuestion).length,hinted=r.items.filter(q=>q.hints>0||q.revealed).length,mistakes=r.items.filter(q=>q.revealed||q.attempts.some(a=>a.midi!==q.midi));
 const attempts=r.items.flatMap(q=>q.attempts),micAttempts=attempts.filter(a=>a.source==='mic').length;
 return `<section class="round-result" aria-label="本轮练习结果"><div class="eyebrow">本轮完成</div><h2>这一轮，认识得更清楚了。</h2><div class="result-score">${correct}<small> / ${r.items.length}</small></div><p>首次无提示答对 · 使用提示 ${hinted} 题</p><p>虚拟操作 ${attempts.length-micAttempts} 次 · 麦克风作答 ${micAttempts} 次</p><p>${mistakes.length?'值得再练：'+[...new Set(mistakes.map(q=>noteName(q.midi)))].join('、'):'本轮没有错题。'}</p><small>本次成绩仅反映音高对应练习，不代表实体琴演奏熟练度。</small><div class="result-actions"><button class="button primary" data-action="restart">再练一轮</button>${mistakes.length?'<button class="button secondary" data-action="retry-wrong">只练错题</button>':''}<button class="button ghost" data-page="records">查看记录</button></div></section>`;
}
function recordsPage(){
 const history=state.history,items=history.flatMap(r=>r.items),first=items.filter(gradeQuestion).length,hints=items.filter(q=>q.hints>0||q.revealed).length;
 return `<section class="hero records-hero"><div class="eyebrow">练习记录</div><h1>每一步，都看得见。</h1><p>只有首次作答正确且未使用提示，才计入首次掌握。</p></section><section class="records-grid"><div class="summary-card"><span>完成轮数</span><strong>${history.length}</strong><small>记录保存在本地 · 最近 30 轮</small></div><div class="summary-card accent"><span>首次答对</span><strong>${first}</strong><small>未使用提示</small></div><div class="summary-card"><span>使用提示</span><strong>${hints}</strong><small>使用学习辅助的题目数</small></div></section><section class="panel history"><div class="panel-heading"><div><span class="step">记录</span><h2>最近练习</h2></div>${history.length?'<button class="button text-button" data-action="clear-history">清除记录</button>':''}</div>${history.length?`<div class="record-list"><div class="record-row record-head"><span>日期</span><span>阶段</span><span>方向</span><span>首次答对</span><span>提示题数</span></div>${history.slice().reverse().map(r=>`<div class="record-row"><time>${new Date(r.time).toLocaleDateString('zh-CN')}</time><strong>${STAGES[r.stage]?.name||'练习'}</strong><span>${r.mode==='key'?'琴键 → 谱表':'谱表 → 琴键'}</span><b>${r.items.filter(gradeQuestion).length} / ${r.items.length}</b><span>${r.items.filter(q=>q.hints>0||q.revealed).length}</span></div>`).join('')}</div>`:`<div class="empty">${sparkle}<strong>还没有完成的练习</strong><span>选择一个阶段并完成 10 道题，即可查看练习总结。</span><button class="button primary" data-page="practice">开始练习</button></div>`}${storageError?`<p class="storage-error">${storageError}</p>`:''}</section>`;
}
function render(smooth=false){
 const previousScroll=document.querySelector('.piano-viewport')?.scrollLeft||0;
 document.querySelectorAll('.main-nav [data-page]').forEach(b=>{b.classList.toggle('segment-active',b.dataset.page===state.page);if(b.dataset.page===state.page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 $('mute').setAttribute('aria-pressed',String(state.muted));$('mute').setAttribute('aria-label',state.muted?'开启声音':'静音');$('mute').classList.toggle('is-muted',state.muted);
 $('main').className='page '+(state.page==='practice'?'practice-page':state.page==='records'?'records-page':'');
 $('main').innerHTML=state.page==='explore'?explorePage():state.page==='practice'?practicePage():recordsPage();
 if(smooth===true)document.querySelector('.piano-viewport')?.scrollTo({left:previousScroll,behavior:'instant'});
 centerKeyboard(smooth);micUi();
}
function startRound(targets){
 const selected=targets?.length?targets:notesBetween(stage().lo,stage().hi),sequence=[];
 while(sequence.length<10)sequence.push(...[...selected].sort(()=>Math.random()-.5));
 state.round={index:0,items:sequence.slice(0,10).map(n=>makeQuestion(n,stage())),complete:false};
 feedback('慢慢来。准备好后选择答案，本练习不限时。');
}
function goPage(page){
 if(page!=='explore'&&micState==='requesting')stopMic();
 if((page==='records'||page==='practice'&&state.mode==='key')&&micState==='running')pauseMic();
 state.page=page;if(page==='practice'&&!state.round)startRound();render();
}
function chooseExplore(midi,clef,source='screen'){
 state.selected=midi;state.clef=clef||(midi<60?'bass':midi>60?'treble':state.clef);render(true);if(source==='screen')sound(midi);
 $('announcement').textContent=`${fullName(midi)} · ${noteDescription()}`;
}
function answer(midi,source='screen'){
 const q=question(),r=state.round;if(!q||q.solved||r.complete)return;q.attempts.push({midi,source});
 if(midi===q.midi){q.solved=true;feedback(q.hints||q.attempts.length>1?'找到了！核对位置后，继续下一题。':'答对了！这是一次独立、无提示的正确作答。','correct');}
 else{feedback(errorText(midi,q.midi)+' 再试一次。','incorrect');const later=r.index+3;if(q.attempts.length===1&&later<r.items.length)r.items[later]=makeQuestion(q.midi,stage());}
 if(source==='screen')sound(midi);render();
}
function hint(){
 const q=question();if(!q||q.solved)return;q.hints++;
 if(q.hints===1)feedback(q.clef==='treble'?'定位锚点：中央 C4 在下加一线，E4 在第一线。':'定位锚点：C3 在第二间，中央 C4 在上加一线。');
 else if(q.hints===2)feedback(`目标音名是 ${noteName(q.midi)}。本题已使用提示，不计入首次无提示答对。`);
 else{q.revealed=true;q.solved=true;feedback(`答案是 ${noteName(q.midi)}，可以核对后继续。`);}render();
}
function next(){
 const r=state.round;if(!question()?.solved||r.complete)return;
 if(r.index===r.items.length-1){r.complete=true;state.history.push({stage:state.stage,mode:state.mode,time:new Date().toISOString(),items:structuredClone(r.items)});state.history=state.history.slice(-30);persist();feedback('练习已完成。');}
 else{r.index++;feedback('观察位置，再选择答案。本练习不限时。');}render();
}
function getAudio(){if(!audio){const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;audio=new A();}if(audio.state==='suspended')audio.resume().catch(()=>{});return audio;}
function stopVoices(){for(const voice of voices){try{voice.stop();}catch{}}voices=[];}
function sound(midi,force=false){
 if(state.muted||(!force&&micState==='running'))return;
 const ctx=getAudio();if(!ctx)return;stopVoices();
 const gain=ctx.createGain();gain.connect(ctx.destination);
 gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.14,ctx.currentTime+.012);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+1.05);
 for(const [harmonic,volume] of [[1,1],[2,.22],[3,.08]]){const o=ctx.createOscillator(),v=ctx.createGain();o.type='sine';o.frequency.value=frequency(midi)*harmonic;v.gain.value=volume;o.connect(v);v.connect(gain);o.start();o.stop(ctx.currentTime+1.1);o.onended=()=>{o.disconnect();v.disconnect();};voices.push(o);}
 setTimeout(()=>gain.disconnect(),1300);
}
function setMicStatus(text,pitch=''){micMessage=text;micPitch=pitch;if($('mic-status'))$('mic-status').textContent=text;if($('mic-pitch'))$('mic-pitch').textContent=pitch||'—';}
function micUi(){
 if(!$('mic-toggle'))return;
 $('mic-toggle').textContent=micState==='running'?'暂停识音':micState==='paused'?'继续识音':micState==='requesting'?'正在申请权限…':'开始聆听';
 $('mic-toggle').disabled=micState==='requesting';$('mic-stop').hidden=micState==='off';$('mic-light').classList.toggle('is-listening',micState==='running');setMicStatus(micMessage,micPitch);
}
async function startMic(){
 if(!navigator.mediaDevices?.getUserMedia){setMicStatus('当前环境无法访问麦克风，请使用 localhost 或 HTTPS 地址打开。');return;}
 if(micState==='paused'&&micStream){micStream.getAudioTracks().forEach(t=>t.enabled=true);micState='running';gate.reset();setMicStatus('正在聆听 · 请弹一个音');micUi();return;}
 const token=++micToken;micState='requesting';micUi();setMicStatus('等待麦克风授权…');
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
  if(token!==micToken){stream.getTracks().forEach(t=>t.stop());return;}
  stopVoices();micStream=stream;const A=window.AudioContext||window.webkitAudioContext;
  micContext=new A();await micContext.resume();
  if(token!==micToken){stream.getTracks().forEach(t=>t.stop());return;}
  micSource=micContext.createMediaStreamSource(stream);micAnalyser=micContext.createAnalyser();micAnalyser.fftSize=8192;micSource.connect(micAnalyser);
  mic=new Float32Array(micAnalyser.fftSize);gate.reset();micState='running';suppressedUntil=performance.now()+350;micUi();setMicStatus('正在聆听 · 请弹一个音');
  for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{if(micState!=='off'){stopMic();setMicStatus('麦克风已断开，可以重新开启或点击琴键练习。');}});listen();
 }catch(error){
  if(token!==micToken)return;stopMic();
  const messages={NotAllowedError:'麦克风未获授权，可在浏览器权限中允许；也可以继续点击琴键。',NotFoundError:'没有找到麦克风，请连接设备后重试。',NotReadableError:'麦克风无法读取，可能正被其他应用占用。'};
  setMicStatus(messages[error.name]||'麦克风启动失败，可以重试或使用虚拟琴键。');
 }
}
function pauseMic(){if(micState!=='running')return;micState='paused';micStream?.getAudioTracks().forEach(t=>t.enabled=false);gate.reset();micUi();setMicStatus('识音已暂停');}
function stopMic(){
 ++micToken;cancelAnimationFrame(micFrame);micState='off';micStream?.getTracks().forEach(t=>t.stop());micSource?.disconnect();
 if(micContext&&micContext.state!=='closed')micContext.close().catch(()=>{});
 micStream=null;micContext=null;micSource=null;micAnalyser=null;mic=null;gate.reset();micUi();setMicStatus('已结束监听 · 麦克风已释放');
}
function listen(){
 micFrame=requestAnimationFrame(listen);const now=performance.now();if(micState!=='running'||!micAnalyser||now-lastFrame<65)return;lastFrame=now;
 if(now<suppressedUntil){setMicStatus('示范音隔离中 · 请稍后再弹');return;}
 micAnalyser.getFloatTimeDomainData(mic);const detected=detectPitch(mic,micContext.sampleRate);
 if(detected.rms<.008){gate.accept(null,now);setMicStatus('正在聆听 · 尚未检测到清晰单音');return;}
 if(!detected.frequency||detected.confidence<.88){gate.candidate=null;gate.frames=0;setMicStatus('声音不稳定 · 请一次弹一个清晰的音');return;}
 const {midi,cents}=pitchToNote(detected.frequency);
 if(Math.abs(cents)>40){gate.candidate=null;gate.frames=0;setMicStatus('音高暂不稳定 · 未计入作答');return;}
 if(midi<21||midi>108){gate.accept(midi,now);setMicStatus('超出完整钢琴音区 A0–C8',`${noteName(midi)} · ${cents>0?'+':''}${cents} 音分`);return;}
 const q=question(),accepted=gate.accept(midi,now);
 if(state.page==='practice'&&state.mode==='score'&&!state.round?.complete&&(midi<stage().lo||midi>stage().hi)){
  setMicStatus(`不在本阶段练习范围 ${noteName(stage().lo)}—${noteName(stage().hi)}，未计分`,fullName(midi));return;
 }
 setMicStatus(gate.last===midi?'已识别单音 · 松开后可再次弹奏':'正在识别 · 请让音保持片刻',`${noteName(midi)} · ${cents>0?'+':''}${cents} 音分`);
 if(accepted===null)return;
 if(state.page==='explore'){chooseExplore(midi,null,'mic');setMicStatus('已识别单音 · 松开后可再次弹奏',fullName(midi));}
 else if(state.page==='practice'&&state.mode==='score'&&!state.round?.complete){
  answer(midi,'mic');setMicStatus(q?.solved?'本题已完成 · 下一题前请先松开琴键':'已记录本次音高 · 松开后重试',fullName(midi));
 }
}
function replay(){
 if(state.muted){$('announcement').textContent='当前已静音，开启声音后可试听。';return;}
 const midi=state.page==='explore'?state.selected:question()?.solved?question().midi:undefined;if(midi===undefined)return;
 if(micState==='running'){suppressedUntil=performance.now()+1700;gate.last=midi;gate.candidate=midi;gate.silentSince=null;}sound(midi,true);
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button,[data-note]');if(!b||b.disabled)return;
 if(b.dataset.page){goPage(b.dataset.page);return;}
 if(b.dataset.clef){state.clef=b.dataset.clef;render();return;}
 if(b.dataset.stage!==undefined){state.stage=Number(b.dataset.stage);persist();startRound();render();return;}
 if(b.dataset.mode){if(b.dataset.mode==='key'&&(micState==='running'||micState==='requesting')){micState==='running'?pauseMic():stopMic();}state.mode=b.dataset.mode;startRound();render();return;}
 if(b.dataset.note){chooseExplore(Number(b.dataset.note),state.clef);return;}
 if(b.dataset.key){const midi=Number(b.dataset.key);if(state.page==='explore')chooseExplore(midi);else if(state.mode==='score')answer(midi);return;}
 if(b.dataset.choice!==undefined){answer(question().choices[Number(b.dataset.choice)]);return;}
 switch(b.dataset.action){
  case 'restart':startRound();render();break;
  case 'hint':hint();break;
  case 'next':next();break;
  case 'replay':replay();break;
  case 'retry-wrong':{const targets=[...new Set(state.round.items.filter(q=>q.revealed||q.attempts.some(a=>a.midi!==q.midi)).map(q=>q.midi))];startRound(targets);render();break;}
  case 'clear-history':state.history=[];persist();render();break;
  case 'mic-toggle':micState==='running'?pauseMic():startMic();break;
  case 'mic-stop':stopMic();break;
  case 'mic-focus':$('mic-toggle').focus();$('mic-toggle').scrollIntoView({block:'nearest',behavior:'smooth'});break;
 }
});
document.addEventListener('keydown',e=>{const n=e.target.closest('[data-note]');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();chooseExplore(Number(n.dataset.note),state.clef);}});
document.addEventListener('change',e=>{if(e.target.id==='labels'){state.labels=e.target.checked;persist();render();}});
$('mute').addEventListener('click',()=>{state.muted=!state.muted;if(state.muted)stopVoices();persist();render();});
window.addEventListener('resize',centerKeyboard);
window.addEventListener('pagehide',()=>{stopMic();stopVoices();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&micState==='running')pauseMic();});
render();
