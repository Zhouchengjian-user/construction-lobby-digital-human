export const MODELS=['qwen3.5-omni-flash-realtime','qwen3.5-omni-plus-realtime'];
export const VOICES=['Ethan','Nofish','Ryan'];

export function normalizeApiKey(value){
 return typeof value==='string'?value.trim().replaceAll('\\_','_').replaceAll('\\-','-'):'';
}

export function validApiKey(value){
 return typeof value==='string'&&value.startsWith('sk-')&&value.length>=32&&value.length<=512&&!/\s/.test(value)&&/^[\x21-\x7e]+$/.test(value);
}

export function normalizeApiHost(value){
 if(typeof value!=='string')return '';
 let host=value.trim().toLowerCase().replace(/^wss?:\/\//,'').split('/')[0];
 return host;
}

export function validApiHost(value){
 const host=normalizeApiHost(value);
 return /^ws-[a-z0-9-]{6,80}\.cn-beijing\.maas\.aliyuncs\.com$/.test(host);
}
