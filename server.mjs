import express from 'express';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {WebSocketServer,WebSocket} from 'ws';
import {MODELS,VOICES,normalizeApiHost,normalizeApiKey,validApiHost,validApiKey} from './server-validation.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const knowledge=JSON.parse(await readFile(path.join(root,'data/knowledge.json'),'utf8'));
const app=express(),server=createServer(app);
const portValue=Number(process.env.PORT||5173);
const listenPort=Number.isInteger(portValue)&&portValue>=0&&portValue<=65535?portValue:5173;
const maxSessionSeconds=Math.min(1800,Math.max(30,Number(process.env.MAX_SESSION_SECONDS)||600));
const setupToken=randomBytes(32).toString('hex');
let config={apiKey:process.env.DASHSCOPE_API_KEY||'',apiHost:normalizeApiHost(process.env.DASHSCOPE_API_HOST||''),model:MODELS.includes(process.env.REALTIME_MODEL)?process.env.REALTIME_MODEL:MODELS[0],voice:VOICES.includes(process.env.REALTIME_VOICE)?process.env.REALTIME_VOICE:'Ethan'};

app.use((req,res,next)=>{if(/(?:^|\/)\.(?:env|git)(?:[./]|$)/.test(req.path))return res.sendStatus(403);next();});
const ready=()=>validApiKey(config.apiKey)&&validApiHost(config.apiHost);
const localHosts=()=>new Set([`127.0.0.1:${server.address()?.port||listenPort}`,`localhost:${server.address()?.port||listenPort}`]);
const localOrigin=req=>localHosts().has(req.headers.host)&&localHosts().has(String(req.headers.origin||'').replace(/^http:\/\//,''));
const localGuard=(req,res,next)=>{res.set('Cache-Control','no-store');if(!localHosts().has(req.headers.host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||(req.headers.origin&&!localOrigin(req)))return res.status(403).json({message:'配置只允许从当前电脑的本地页面访问。'});next();};
const publicConfig=()=>({ready:ready(),configured:validApiKey(config.apiKey),apiHost:config.apiHost,model:config.model,voice:config.voice,models:MODELS,voices:VOICES,storage:'memory',setupToken,maxSessionSeconds});

app.get('/api/config',localGuard,(_,res)=>res.json(publicConfig()));
app.post('/api/config',localGuard,express.json({limit:'4kb',strict:true}),(req,res)=>{
 const token=req.headers['x-setup-token'];
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(token),Buffer.from(setupToken)))return res.status(403).json({message:'配置页面已过期，请刷新后重试。'});
 const input=req.body;if(!input||Array.isArray(input)||Object.keys(input).some(key=>!['apiKey','apiHost','model','voice'].includes(key)))return res.status(400).json({message:'配置字段不正确。'});
 const next={...config};
 if(typeof input.apiKey==='string'&&input.apiKey.trim()){const value=normalizeApiKey(input.apiKey);if(!validApiKey(value))return res.status(400).json({message:'API Key 格式不正确。'});next.apiKey=value;}
 if(typeof input.apiHost==='string'){const value=normalizeApiHost(input.apiHost);if(!validApiHost(value))return res.status(400).json({message:'请填写百炼北京地域的完整 API Host。'});next.apiHost=value;}
 if(typeof input.model==='string'){if(!MODELS.includes(input.model))return res.status(400).json({message:'请选择支持的实时模型。'});next.model=input.model;}
 if(typeof input.voice==='string'){if(!VOICES.includes(input.voice))return res.status(400).json({message:'请选择支持的音色。'});next.voice=input.voice;}
 config=next;res.json({...publicConfig(),saved:true,message:'已保存到本机进程内存，重启服务后自动清除。'});
});
app.get('/api/knowledge',(_,res)=>res.json(knowledge));
app.get('/api/health',(_,res)=>res.json({ok:true,realtimeConfigured:ready()}));

const instructions=`你是一个通用数字展厅的语音智能体原型，不代表任何真实企业。使用简洁、自然的普通话，每次回答控制在二到四句。可以介绍沉浸式交互、知识边界、实时语音和产品化路径。只能依据下面资料描述本原型，不编造真实企业、人员、客户、项目、金额、业绩或部署结果。资料之外的问题应明确说明当前演示未提供依据。被打断后优先处理最新问题，不重复旧回答。不要朗读链接。\n\n演示资料：\n${knowledge.map(item=>`[${item.title}] ${item.summary}\n${item.facts.join('\n')}`).join('\n\n')}`;
const wss=new WebSocketServer({noServer:true,maxPayload:128*1024});
server.on('upgrade',(req,socket,head)=>{
 if(req.url?.startsWith('/?'))return;
 if(req.url!='/api/realtime')return;
 if(!localOrigin(req)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
 if(!ready()){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
 if(wss.clients.size>=2){socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
});

wss.on('connection',client=>{
 const snapshot={...config};let upstream,configured=false,active=false,closed=false;
 const send=event=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(event));};
 const upstreamSend=event=>{if(upstream?.readyState===WebSocket.OPEN)upstream.send(JSON.stringify({event_id:`evt_${randomUUID()}`,...event}));};
 const close=()=>{if(closed)return;closed=true;clearTimeout(timer);if(upstream?.readyState===WebSocket.OPEN)upstream.close();else upstream?.terminate();if(client.readyState===WebSocket.OPEN)client.close();};
 const timer=setTimeout(()=>{send({type:'app.error',message:'本次通话已达到时长上限。'});close();},maxSessionSeconds*1000);
 try{upstream=new WebSocket(`wss://${snapshot.apiHost}/api-ws/v1/realtime?model=${encodeURIComponent(snapshot.model)}`,{headers:{Authorization:`Bearer ${snapshot.apiKey}`},handshakeTimeout:15000});}catch{send({type:'app.error',message:'无法创建实时语音连接。'});close();return;}
 upstream.on('message',raw=>{let event;try{event=JSON.parse(raw.toString());}catch{return;}
  if(event.type==='session.created')upstreamSend({type:'session.update',session:{modalities:['text','audio'],voice:snapshot.voice,instructions,audio:{input:{format:{type:'pcm',sample_rate:16000}},output:{format:{type:'pcm',sample_rate:24000}}},turn_detection:{type:'server_vad',threshold:.5,silence_duration_ms:650},max_tokens:1024}});
  if(event.type==='session.updated'&&!configured){configured=true;send({type:'app.ready'});}
  if(event.type==='response.created')active=true;if(event.type==='response.done')active=false;
  if(event.type==='input_audio_buffer.speech_started'&&active){upstreamSend({type:'response.cancel'});active=false;}
  if(event.type==='error'){if(/no.*(active|response)|not.*(active|progress)/i.test(event.error?.message||''))return;send({type:'app.error',message:'实时语音服务返回错误，请检查模型权限和配置。'});return;}
  if(!['session.created','session.updated'].includes(event.type))send(event);
 });
 upstream.on('error',()=>{send({type:'app.error',message:'实时语音服务连接失败，请检查 Key、API Host、模型权限和余额。'});close();});
 upstream.on('close',()=>{if(!closed)send({type:'app.error',message:'语音连接已关闭。'});close();});
 client.on('message',raw=>{let event;try{event=JSON.parse(raw.toString());}catch{return;}if(!configured)return;
  if(event.type==='input_audio_buffer.append'&&typeof event.audio==='string'&&event.audio.length<=96000&&/^[A-Za-z0-9+/=]*$/.test(event.audio))upstreamSend({type:event.type,audio:event.audio});
  if(event.type==='response.cancel'&&active){active=false;upstreamSend({type:'response.cancel'});}
  if(event.type==='input_audio_buffer.clear')upstreamSend({type:event.type});
 });
 client.on('close',close);client.on('error',close);
});

if(process.argv.includes('--production'))app.use(express.static(path.join(root,'dist')));
else{const {createServer:createVite}=await import('vite');const vite=await createVite({root,server:{middlewareMode:true,hmr:{server}},appType:'spa'});app.use(vite.middlewares);}
server.listen(listenPort,'127.0.0.1',()=>console.log(`Digital exhibition running at http://127.0.0.1:${server.address().port}`));
