import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeApiHost,normalizeApiKey,validApiHost,validApiKey} from '../server-validation.mjs';

test('accepts an official Beijing API Host',()=>{
 assert.equal(normalizeApiHost('wss://ws-example123.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime'),'ws-example123.cn-beijing.maas.aliyuncs.com');
 assert.equal(validApiHost('ws-example123.cn-beijing.maas.aliyuncs.com'),true);
});

test('rejects other hosts and embedded credentials',()=>{
 assert.equal(validApiHost('ws-example123.ap-southeast-1.maas.aliyuncs.com'),false);
 assert.equal(validApiHost('user@ws-example123.cn-beijing.maas.aliyuncs.com'),false);
 assert.equal(validApiHost('ws-example123.cn-beijing.maas.aliyuncs.com.evil.test'),false);
});

test('normalizes copy escapes but rejects whitespace',()=>{
 assert.equal(normalizeApiKey('  sk-demo\\_key  '),'sk-demo_key');
 assert.equal(validApiKey('sk-'+'a'.repeat(40)),true);
 assert.equal(validApiKey('sk-'+'a'.repeat(20)+' bad'),false);
});
