import './style.css';
import './mobile.css';
import {RealtimeAudio} from './audio.js';

const $=selector=>document.querySelector(selector);
let knowledge=[],config={ready:false},audio=null,socket=null,mode='idle',muted=false,currentTopic='experience',responseText='';
const stateCopy={idle:['SYSTEM READY','等待连接','配置实时服务后开始语音对话'],connecting:['CONNECTING','正在建立连接','请稍候'],listening:['LISTENING','正在倾听','可以直接说出问题'],thinking:['PROCESSING','正在思考','正在组织回答'],speaking:['RESPONDING','正在讲解','可以随时点击打断'],muted:['MICROPHONE OFF','麦克风静音','点击取消静音后继续'],interrupted:['CANCELLED','讲解已打断','可以提出新的问题']};

function setState(next,title,hint){mode=next;const copy=stateCopy[next]||stateCopy.idle;$('#stateEyebrow').textContent=copy[0];$('#stateTitle').textContent=title||copy[1];$('#stateHint').textContent=hint||copy[2];$('#callTitle').textContent=title||copy[1];$('#callHint').textContent=hint||copy[2];document.body.dataset.state=next;}
function meter(id,value){document.documentElement.style.setProperty(id==='inputMeter'?'--in':'--out',Number(value).toFixed(3));$(id==='inputMeter'?'#inputMeter':'#outputMeter').style.setProperty('--value',Number(value).toFixed(3));}
function toast(message){const node=$('#toast');node.textContent=message;node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,3500);}
function addTurn(role,text){if(!text?.trim())return;$('.empty')?.remove();const item=document.createElement('div');item.className='turn '+role;const label=document.createElement('small');label.textContent=role==='user'?'访客':'语音智能体';item.append(label,document.createTextNode(text.trim()));$('#transcript').append(item);$('#transcript').scrollTop=$('#transcript').scrollHeight;}

function selectTopic(id){const item=knowledge.find(entry=>entry.id===id)||knowledge[0];if(!item)return;currentTopic=item.id;$('.topic-tabs').querySelectorAll('button').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.topic===item.id)));$('.scene-steps').querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.topic===item.id));$('#topicIndex').textContent=String(knowledge.indexOf(item)+1).padStart(2,'0')+' / '+String(knowledge.length).padStart(2,'0');$('#topicTitle').textContent=item.title;$('#topicSummary').textContent=item.summary;$('#topicFacts').replaceChildren(...item.facts.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('#sceneTitle').textContent=item.title;$('#sceneText').textContent=item.summary;}

function renderTopics(){const tabs=$('.topic-tabs');tabs.replaceChildren(...knowledge.map((item,index)=>{const button=document.createElement('button');button.type='button';button.dataset.topic=item.id;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(index===0));button.textContent=item.title;button.onclick=()=>selectTopic(item.id);return button;}));document.querySelectorAll('.scene-steps button').forEach(button=>button.onclick=()=>selectTopic(button.dataset.topic));selectTopic(currentTopic);}

function resetCall(title='准备开始',hint='配置保存在本机内存，不写入仓库'){socket?.close();socket=null;audio?.close();audio=null;mode='idle';muted=false;$('#callBtn').textContent='开始实时对话';$('#muteBtn').disabled=true;$('#muteBtn').textContent='静音';$('#interruptBtn').disabled=true;meter('inputMeter',0);meter('outputMeter',0);setState('idle',title,hint);}
function interrupt(){if(!socket||!audio)return;audio.stop();socket.send(JSON.stringify({type:'response.cancel'}));setState('interrupted');setTimeout(()=>{if(mode==='interrupted')setState(muted?'muted':'listening');},700);}
async function startCall(){
 if(mode!=='idle'){resetCall('通话已结束','麦克风已经释放');return;}
 if(!config.ready){$('#settingsDialog').showModal();toast('请先完成本地实时语音配置');return;}
 setState('connecting');$('#callBtn').textContent='结束通话';$('#muteBtn').disabled=false;$('#interruptBtn').disabled=false;
 try{
  audio=new RealtimeAudio({onInput:value=>meter('inputMeter',value),onOutput:value=>meter('outputMeter',value),onDrained:()=>{if(mode==='speaking')setState(muted?'muted':'listening');}});
  await audio.open(pcm=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'input_audio_buffer.append',audio:pcm}));});
  socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/realtime`);
  socket.onmessage=({data})=>{let event;try{event=JSON.parse(data);}catch{return;}
   if(event.type==='app.ready'){setState('listening');return;}
   if(event.type==='input_audio_buffer.speech_started'){audio.stop();setState('listening');}
   if(event.type==='input_audio_buffer.speech_stopped')setState('thinking');
   if(event.type==='conversation.item.input_audio_transcription.completed')addTurn('user',event.transcript);
   if(event.type==='response.created')responseText='';
   if(event.type==='response.audio.delta'||event.type==='response.output_audio.delta'){setState('speaking');audio.play(event.delta);}
   if(event.type==='response.audio_transcript.delta'||event.type==='response.output_audio_transcript.delta')responseText+=event.delta||'';
   if(event.type==='response.done'){const text=responseText||event.response?.output?.flatMap(item=>item.content||[]).map(part=>part.transcript||part.text||'').join('')||'';addTurn('assistant',text);}
   if(event.type==='app.error'){toast(event.message);resetCall('连接已关闭','检查本地配置后重试');}
  };
  socket.onclose=()=>{if(mode!=='idle')resetCall('连接已关闭','可以检查配置后重试');};socket.onerror=()=>toast('无法连接本地实时语音服务');
 }catch(error){resetCall('无法开始通话','请允许麦克风并检查浏览器设置');toast(error.message||'麦克风不可用');}
}

function openInfo(type){const architecture=type==='architecture';$('#infoTitle').textContent=architecture?'产品架构':'能力边界';$('#infoBody').innerHTML=architecture?`<div class="info-grid"><section><h3>实时链路</h3><p>麦克风、本地代理、实时模型与浏览器播放形成流式闭环。</p></section><section><h3>知识约束</h3><p>通用演示资料随会话提供；正式项目应接入可追溯知识库。</p></section><section><h3>打断控制</h3><p>客户端先停播，再取消上游生成，并丢弃旧响应的迟到片段。</p></section><section><h3>状态反馈</h3><p>抽象光核表达倾听、思考和讲解，不依赖任何人物素材。</p></section></div>`:`<div class="info-grid"><section><h3>不代表真实企业</h3><p>仓库没有公司名称、Logo、人物形象或真实项目资料。</p></section><section><h3>不是生产服务</h3><p>上线前仍需鉴权、限流、审计、预算控制和完整评测。</p></section><section><h3>不是三维数字人</h3><p>中央为 CSS 抽象语音光核，没有人物模型、照片或口型。</p></section><section><h3>凭证不入库</h3><p>网页配置只存在本地服务进程内存，重启即清除。</p></section></div>`;$('#infoDialog').showModal();}

document.querySelectorAll('.dialog-close').forEach(button=>button.onclick=()=>button.closest('dialog').close());
document.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>openInfo(button.dataset.open));
$('#settingsBtn').onclick=()=>$('#settingsDialog').showModal();$('#callBtn').onclick=startCall;$('#interruptBtn').onclick=interrupt;
$('#muteBtn').onclick=()=>{muted=!muted;audio?.mute(muted);$('#muteBtn').textContent=muted?'取消静音':'静音';setState(muted?'muted':'listening');};
$('#transcriptBtn').onclick=()=>{const panel=$('#transcriptPanel');panel.hidden=!panel.hidden;$('#transcriptBtn').setAttribute('aria-expanded',String(!panel.hidden));};
$('#closeTranscript').onclick=()=>{$('#transcriptPanel').hidden=true;$('#transcriptBtn').setAttribute('aria-expanded','false');};
$('#settingsForm').onsubmit=async event=>{event.preventDefault();const message=$('#settingsMessage');message.textContent='正在保存…';try{const response=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-Token':config.setupToken},body:JSON.stringify({apiKey:$('#apiKey').value,apiHost:$('#apiHost').value,model:$('#model').value})});const body=await response.json();if(!response.ok)throw Error(body.message||'保存失败');config=body;$('#apiKey').value='';message.textContent=body.message;refreshConfig();setTimeout(()=>$('#settingsDialog').close(),900);}catch(error){message.textContent=error.message;}};
function refreshConfig(){$('#serviceBadge').textContent=config.ready?'实时服务已配置':'本地演示';$('#apiHost').value=config.apiHost||'';$('#model').value=config.model||'qwen3.5-omni-flash-realtime';$('#callHint').textContent=config.ready?'点击开始并允许麦克风':'配置保存在本机内存，不写入仓库';}

try{const [knowledgeResponse,configResponse]=await Promise.all([fetch('/api/knowledge'),fetch('/api/config')]);knowledge=await knowledgeResponse.json();config=await configResponse.json();renderTopics();refreshConfig();}catch{toast('本地服务未响应，请重新启动项目');}
window.addEventListener('beforeunload',()=>resetCall());
