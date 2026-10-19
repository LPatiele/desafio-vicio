import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SharedRateLimiter, retryHintMs } from "../src/rate-limit.js";
import { atomicJson } from "../src/utils.js";
import { OpenRouterClient } from "../src/client.js";
import { getConfig } from "../src/config.js";
import { Logger } from "../src/logger.js";
import { ProposalSchema } from "../src/types.js";

test("duas filas compartilham janela móvel; recriar o cliente não renova a capacidade", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-rate-window-"));
  try {
    const file = path.join(dir, "rate.json");
    const options = { requestsPerMinute: 2, minIntervalMs: 0, windowMs: 80 };
    const clients = [new SharedRateLimiter(file, options), new SharedRateLimiter(file, options)];
    const started = Date.now();
    await Promise.all(Array.from({ length: 6 }, (_, i) => clients[i % 2]!.acquire()));
    const state = JSON.parse(await readFile(file, "utf8"));
    // With six reservations and capacity two, the last must be in at least
    // the third window. Measure persisted admission, not promise completion:
    // scheduler delay can make two completion timestamps appear too close.
    assert.ok(state.starts.at(-1) - started >= 2 * options.windowMs, "seis reservas compartilham ao menos três janelas");
    assert.ok(state.starts.length <= 2);
    const last = Date.now();
    await atomicJson(file, { version: 1, starts: [last, last], blockedUntil: 0 });
    await new SharedRateLimiter(file, options).acquire();
    const resumed = JSON.parse(await readFile(file, "utf8"));
    assert.ok(resumed.starts.at(-1) - last >= 80, "a retomada aguarda a janela anterior");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("intervalo mínimo e pausa de provedor são globais e a pausa mais longa prevalece", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-rate-pause-"));
  try {
    const file = path.join(dir, "rate.json");
    const first = new SharedRateLimiter(file, { requestsPerMinute: 18, minIntervalMs: 40 });
    const second = new SharedRateLimiter(file, { requestsPerMinute: 18, minIntervalMs: 40 });
    await first.acquire();
    const initial = JSON.parse(await readFile(file, "utf8")).starts[0];
    await second.acquire();
    assert.ok(JSON.parse(await readFile(file, "utf8")).starts[1] - initial >= 40);
    const deadline = Date.now() + 80;
    await first.deferUntil(deadline);
    await second.deferUntil(deadline - 50);
    await second.acquire();
    assert.ok(JSON.parse(await readFile(file, "utf8")).starts.at(-1) >= deadline);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("estado corrompido bloqueia envio e libera a trava", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-rate-corrupt-"));
  try {
    const file = path.join(dir, "rate.json");
    await atomicJson(file, { version: 1, starts: ["inválido"], blockedUntil: 0 });
    const limiter = new SharedRateLimiter(file, { requestsPerMinute: 18, minIntervalMs: 0 });
    await assert.rejects(limiter.acquire(), /Estado.*inválido/);
    await atomicJson(file, { version: 1, starts: [], blockedUntil: 0 });
    await limiter.acquire();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Retry-After aceita segundos e data HTTP e respeita reset quando mais longo", () => {
  const now = Date.UTC(2026, 9, 17, 1);
  assert.equal(retryHintMs(new Headers({ "retry-after": "120" }), now), 120000);
  assert.equal(retryHintMs(new Headers({ "retry-after": new Date(now + 60000).toUTCString() }), now), 60000);
  assert.equal(retryHintMs(new Headers({ "retry-after": "1", "x-ratelimit-reset": String((now + 90000) / 1000) }), now), 90000);
  assert.equal(retryHintMs(new Headers({ "x-ratelimit-reset": new Date(now + 90000).toISOString() }), now), 90000);
  assert.equal(retryHintMs(new Headers({ "retry-after": "inválido" }), now), null);
});

test("cliente aguarda permissão antes de gastar tentativa e compartilha HTTP 429", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-rate-client-"));
  const fetchOriginal = globalThis.fetch;
  try {
    let release!: () => void, acquired = false, attempts = 0, requests = 0, cooldown = 0;
    const permit = new Promise<void>(resolve => { release = resolve; });
    const limiter = { acquire: async () => { await permit; acquired = true; }, deferUntil: async (until: number) => { cooldown = until; } };
    globalThis.fetch = async () => { requests++; assert.equal(attempts, 1); return new Response("ocupado", { status: 429, headers: { "retry-after": "120", "x-ratelimit-limit": "20" } }); };
    const config = { ...await getConfig(), maxCalls: 1 };
    const client = new OpenRouterClient(config, new Logger(dir), null, limiter, 1000);
    const call = client.call("classifier", config.classifierModel, [], ProposalSchema, ["Q0001"], async () => { assert.equal(acquired, true); attempts++; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts, 0); assert.equal(requests, 0); assert.equal(client.calls, 0);
    release();
    await assert.rejects(call, /HTTP 429/);
    assert.equal(attempts, 1); assert.equal(requests, 1);
    assert.ok(cooldown >= Date.now() + 119000);
    assert.match(await readFile(path.join(dir, "events.jsonl"), "utf8"), /rate_limited/);
  } finally { globalThis.fetch = fetchOriginal; await rm(dir, { recursive: true, force: true }); }
});

test("HTTP 429 sem indicação pausa um minuto; limite diário interrompe sem reagendamento", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "case-rate-daily-"));
  const fetchOriginal = globalThis.fetch;
  try {
    const pauses: number[] = [];
    const limiter = { acquire: async () => {}, deferUntil: async (until: number) => { pauses.push(until); } };
    const config = { ...await getConfig(), maxCalls: 2 };
    const client = new OpenRouterClient(config, new Logger(dir), null, limiter, 1000);
    globalThis.fetch = async () => new Response("ocupado", { status: 429 });
    const started = Date.now();
    await assert.rejects(client.call("judge", config.judgeModel, [], ProposalSchema, ["Q0001"]), /HTTP 429/);
    assert.equal(pauses.length, 1);
    assert.ok(pauses[0]! >= started + 60000);
    globalThis.fetch = async () => new Response("cota esgotada", { status: 429, headers: { "x-ratelimit-limit": "1000", "retry-after": "86400" } });
    await assert.rejects(client.call("judge", config.judgeModel, [], ProposalSchema, ["Q0001"]), /Limite de cota/);
    assert.equal(pauses.length, 1);
    assert.equal(client.calls, 2);
  } finally { globalThis.fetch = fetchOriginal; await rm(dir, { recursive: true, force: true }); }
});

test('cota diária persiste entre filas e retomadas; concorrência não ultrapassa o teto', async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'case-rpd-'));
 try{
  const file=path.join(dir,'rate.json'), options={requestsPerMinute:100,minIntervalMs:0,requestsPerDay:2,dailyResetTimeZone:'America/Los_Angeles'};
  const a=new SharedRateLimiter(file,options), b=new SharedRateLimiter(file,options);
  const results=await Promise.allSettled([a.acquire(),b.acquire(),a.acquire()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal(JSON.parse(await readFile(file,'utf8')).daily.requests,2);
  await assert.rejects(new SharedRateLimiter(file,options).acquire(),/Limite diário local atingido/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('reset segue meia-noite do Pacífico e horário de verão, não 24h desde a primeira chamada',async()=>{
 const {quotaDay,nextQuotaReset}=await import('../src/rate-limit.js');
 assert.equal(quotaDay(Date.parse('2026-10-19T06:59:59Z'),'America/Los_Angeles'),'2026-10-18');
 assert.equal(nextQuotaReset(Date.parse('2026-10-19T06:59:59Z'),'America/Los_Angeles'),Date.parse('2026-10-19T07:00:00Z'));
 assert.equal(nextQuotaReset(Date.parse('2026-11-01T07:00:00Z'),'America/Los_Angeles'),Date.parse('2026-11-02T08:00:00Z')); // 25h
 assert.equal(nextQuotaReset(Date.parse('2026-03-08T08:00:00Z'),'America/Los_Angeles'),Date.parse('2026-03-09T07:00:00Z')); // 23h
 const dir=await mkdtemp(path.join(os.tmpdir(),'case-reset-'));
 try{
  let timestamp=Date.parse('2026-10-19T06:59:59Z');
  const runtime={now:()=>timestamp,sleep:async()=>{throw new Error('Não deve esperar até amanhã');}};
  const limiter=new SharedRateLimiter(path.join(dir,'rate.json'),{requestsPerMinute:100,minIntervalMs:0,requestsPerDay:1,dailyResetTimeZone:'America/Los_Angeles'},runtime);
  await limiter.acquire();await assert.rejects(limiter.acquire(),/Limite diário/);
  timestamp=Date.parse('2026-10-19T07:00:00Z');await limiter.acquire();
  assert.equal(JSON.parse(await readFile(path.join(dir,'rate.json'),'utf8')).daily.requests,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('consumo anterior inicializa o contador uma vez; cancelamento antes do envio devolve apenas a cota diária',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'case-seed-'));
 try{
  const file=path.join(dir,'rate.json');let seeds=0;
  const options={requestsPerMinute:100,minIntervalMs:0,requestsPerDay:3,seedDailyStarts:async()=>{seeds++;return [Date.now()-1000,Date.now()-2000];}};
  const limiter=new SharedRateLimiter(file,options),permit=await limiter.acquire();
  await assert.rejects(limiter.acquire(),/Limite diário/);
  await Promise.all([permit.cancel(),permit.cancel()]);
  assert.equal(JSON.parse(await readFile(file,'utf8')).daily.requests,2);
  await new SharedRateLimiter(file,options).acquire();assert.equal(seeds,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('bloqueio diário retornado pela API é compartilhado e não se perde ao recriar o cliente',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'case-provider-day-'));
 try{
  const file=path.join(dir,'rate.json'),options={requestsPerMinute:100,minIntervalMs:0,requestsPerDay:1500};
  let timestamp=Date.now();const runtime={now:()=>timestamp,sleep:async()=>{throw new Error('Não deve esperar');}};
  const a=new SharedRateLimiter(file,options,runtime);await a.blockDailyUntil(timestamp+1000);
  await assert.rejects(new SharedRateLimiter(file,options,runtime).acquire(),/Provedor informou/);
  timestamp+=1001;await new SharedRateLimiter(file,options,runtime).acquire();
  await atomicJson(file,{version:1,starts:[],blockedUntil:0,daily:{period:'2026-10-18',requests:-1}});
  await assert.rejects(a.acquire(),/Estado diário/);
  await atomicJson(file,{version:1,starts:[],blockedUntil:0,daily:{period:'2026-02-30',requests:0}});
  await assert.rejects(a.acquire(),/Estado diário/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('consulta de estado não gasta requisição e mudança de fuso não zera o contador',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'case-quota-status-'));
 try{
  const file=path.join(dir,'rate.json'),options={requestsPerMinute:30,tokensPerMinute:1000,minIntervalMs:0,requestsPerDay:1500,dailyResetTimeZone:'America/Los_Angeles'};
  const limiter=new SharedRateLimiter(file,options);await limiter.acquire(100);
  const first=await limiter.status(),second=await limiter.status();
  assert.equal(first.daily!.requests,1);assert.equal(second.daily!.remainingLocal,1499);
  assert.equal(second.minuteRequests,1);assert.equal(second.requestsPerMinute,30);
  await assert.rejects(new SharedRateLimiter(file,{...options,dailyResetTimeZone:'UTC'}).acquire(),/Fuso.*mudou/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('cliente sem RPD explícito respeita o teto já persistido no mesmo escopo',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'case-legacy-rpd-'));
 try{
  const file=path.join(dir,'rate.json');
  const configured=new SharedRateLimiter(file,{requestsPerMinute:100,minIntervalMs:0,requestsPerDay:2});await configured.acquire();
  const legacy=new SharedRateLimiter(file,{requestsPerMinute:100,minIntervalMs:0});await legacy.acquire();
  await assert.rejects(legacy.acquire(),/Limite diário/);
  await assert.rejects(configured.acquire(),/Limite diário/);
  assert.equal((await legacy.status()).daily!.requests,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('migração conserva a janela recente antes de autorizar novos tokens',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'case-cold-minute-'));
 try{
  const base=Date.now();let timestamp=base, waited=0;
  const runtime={now:()=>timestamp,sleep:async(ms:number)=>{timestamp+=ms;waited+=ms;}};
  const limiter=new SharedRateLimiter(path.join(dir,'rate.json'),{requestsPerMinute:30,minIntervalMs:0,tokensPerMinute:1000,requestsPerDay:1500,windowMs:80,seedDailyStarts:async()=>[base-10]},runtime);
  await limiter.acquire(100);assert.ok(waited>=70);
  assert.equal((await limiter.status()).daily!.requests,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('ritmos 30/15 RPM preservam espaçamento e janela móvel em todas as admissões',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'case-paced-models-'));
 try{
  for(const [rpm,interval] of [[30,2100],[15,4100]] as const){
   let timestamp=Date.now();const admissions:number[]=[];
   const runtime={now:()=>timestamp,sleep:async(ms:number)=>{timestamp+=ms;}};
   const limiter=new SharedRateLimiter(path.join(dir,`model-${rpm}.json`),{requestsPerMinute:rpm,minIntervalMs:interval,requestsPerDay:1500},runtime);
   for(let i=0;i<rpm+5;i++){
    await limiter.acquire();admissions.push(timestamp);
    assert.ok(admissions.filter(at=>at>timestamp-60000).length<=rpm);
    if(i)assert.ok(timestamp-admissions[i-1]!>=interval);
   }
   assert.equal((await limiter.status()).daily!.requests,rpm+5);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
