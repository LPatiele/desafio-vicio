import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { atomicJson, sleep } from "./utils.js";

export type QuotaPermit = { cancel(): Promise<void> };
export type RequestLimiter = { acquire(tokens?: number): Promise<void | QuotaPermit>; deferUntil(timestamp: number): Promise<void>; blockDailyUntil?(timestamp: number): Promise<void> };
type State = { version: 1; starts: number[]; blockedUntil: number; tokenStarts?: { at: number; tokens: number }[]; daily?: { period: string; requests: number; timeZone?: string; limit?: number }; dailyBlockedUntil?: number };
type Options = { requestsPerMinute: number; minIntervalMs: number; windowMs?: number; tokensPerMinute?: number; requestsPerDay?: number; dailyResetTimeZone?: string; seedDailyStarts?: () => Promise<number[]> };

export function quotaDay(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, calendar: "iso8601", year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp);
}
export function nextQuotaReset(timestamp: number, timeZone: string): number {
  const day = quotaDay(timestamp, timeZone);
  let low = Math.floor(timestamp) + 1, high = low + 36 * 60 * 60 * 1000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (quotaDay(middle, timeZone) === day) low = middle + 1; else high = middle;
  }
  return low;
}
export class DailyQuotaExceeded extends Error {
  constructor(readonly resetAt: number, message: string) { super(`${message} Retomada após ${new Date(resetAt).toISOString()}.`); this.name = "DailyQuotaExceeded"; }
}

// All experiments in this checkout share one rolling window, including retries.
export class SharedRateLimiter implements RequestLimiter {
  private readonly windowMs: number;
  private readonly timeZone: string;
  constructor(readonly file: string, readonly options: Options, private readonly runtime = { now: () => Date.now(), sleep }) {
    this.windowMs = options.windowMs ?? 60000;
    if (!Number.isInteger(options.requestsPerMinute) || options.requestsPerMinute < 1 || options.requestsPerMinute > 10000 || !Number.isFinite(this.windowMs) || this.windowMs <= 0 || !Number.isFinite(options.minIntervalMs) || options.minIntervalMs < 0 || options.tokensPerMinute !== undefined && (!Number.isSafeInteger(options.tokensPerMinute) || options.tokensPerMinute < 1)) throw new Error("Configuração de controle de taxa inválida.");
    if (options.requestsPerDay !== undefined && (!Number.isSafeInteger(options.requestsPerDay) || options.requestsPerDay < 1)) throw new Error("Limite diário inválido.");
    this.timeZone = options.dailyResetTimeZone ?? "UTC";
    quotaDay(this.runtime.now(), this.timeZone); // Reject an invalid zone before admission.
  }
  private async transaction<T>(action: (state: State) => Promise<T>): Promise<T> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const lockPath = `${this.file}.lock`;
    const waitingSince = Date.now();
    let lock;
    while (!lock) {
      try { lock = await open(lockPath, "wx"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() - waitingSince >= 30000) throw new Error("Controle de taxa ocupado há 30 segundos. Confira o processo proprietário antes de remover a trava de taxa.");
        await sleep(25);
      }
    }
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      let state: State;
      try { state = JSON.parse(await readFile(this.file, "utf8")); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        state = { version: 1, starts: [], blockedUntil: 0 };
      }
      if (state.version !== 1 || !Array.isArray(state.starts) || state.starts.some(n => !Number.isFinite(n) || n < 0) || !Number.isFinite(state.blockedUntil) || state.blockedUntil < 0) throw new Error("Estado do controle de taxa inválido; nenhum envio foi autorizado.");
      if (state.tokenStarts !== undefined && (!Array.isArray(state.tokenStarts) || state.tokenStarts.some(item => !Number.isFinite(item.at) || item.at < 0 || !Number.isSafeInteger(item.tokens) || item.tokens < 0))) throw new Error("Estado de tokens do controle de taxa inválido.");
      if (state.daily !== undefined && (!state.daily || typeof state.daily.period !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(state.daily.period) || !Number.isFinite(Date.parse(`${state.daily.period}T00:00:00Z`)) || new Date(`${state.daily.period}T00:00:00Z`).toISOString().slice(0, 10) !== state.daily.period || !Number.isSafeInteger(state.daily.requests) || state.daily.requests < 0) || state.dailyBlockedUntil !== undefined && (!Number.isFinite(state.dailyBlockedUntil) || state.dailyBlockedUntil < 0)) throw new Error("Estado diário do controle de taxa inválido.");
      if (state.daily?.timeZone !== undefined && state.daily.timeZone !== this.timeZone) throw new Error("Fuso do contador diário mudou; confira a configuração sem zerar o consumo.");
      if (state.daily?.limit !== undefined && (!Number.isSafeInteger(state.daily.limit) || state.daily.limit < 1)) throw new Error("Limite diário persistido inválido.");
      if ((this.options.requestsPerDay !== undefined || this.options.seedDailyStarts) && !state.daily) {
        const timestamp = this.runtime.now(), period = quotaDay(timestamp, this.timeZone);
        const history = await this.options.seedDailyStarts?.() ?? state.starts;
        if (history.some(at => !Number.isFinite(at) || at < 0)) throw new Error("Histórico diário inválido.");
        // A new project bucket may replace an older key-based minute bucket.
        // Keep recent admissions and conservatively wait out their TPM window
        // when their token reservations cannot be reconstructed.
        const recent = history.filter(at => at > timestamp - this.windowMs).sort((a, b) => a - b);
        if (!state.starts.length && recent.length) {
          state.starts = recent;
          if (this.options.tokensPerMinute !== undefined && !state.tokenStarts?.length) state.tokenStarts = [{ at: recent.at(-1)!, tokens: this.options.tokensPerMinute }];
        }
        state.daily = { period, timeZone: this.timeZone, limit: this.options.requestsPerDay, requests: history.filter(at => quotaDay(at, this.timeZone) === period).length };
      }
      if (state.daily && this.options.requestsPerDay !== undefined) state.daily.limit = this.options.requestsPerDay;
      return await action(state);
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
  private currentDay(state: State, timestamp: number) {
    const period = quotaDay(timestamp, this.timeZone);
    if (state.daily && state.daily.period > period) throw new Error("Relógio anterior ao período do contador diário; nenhum envio autorizado.");
    if (state.daily && state.daily.period !== period) state.daily = { period, timeZone: this.timeZone, requests: 0, limit: state.daily.limit };
    return period;
  }
  async status() {
    return this.transaction(async state => {
      const timestamp = this.runtime.now(); this.currentDay(state, timestamp);
      await atomicJson(this.file, state);
      return { requestsPerMinute: this.options.requestsPerMinute, minIntervalMs: this.options.minIntervalMs, tokensPerMinute: this.options.tokensPerMinute,
        minuteRequests: state.starts.filter(at => at > timestamp - this.windowMs).length,
        blockedUntil: Math.max(state.blockedUntil, state.dailyBlockedUntil ?? 0),
        daily: state.daily ? { ...state.daily,
          remainingLocal: state.daily.limit === undefined ? null : Math.max(0, state.daily.limit - state.daily.requests), resetAt: new Date(nextQuotaReset(timestamp, this.timeZone)).toISOString() } : null };
    });
  }
  async acquire(tokens = 0): Promise<QuotaPermit> {
    if (!Number.isSafeInteger(tokens) || tokens < 0 || this.options.tokensPerMinute !== undefined && tokens > this.options.tokensPerMinute) throw new Error("Requisição excede o limite de tokens por minuto configurado.");
    while (true) {
      const admission = await this.transaction(async state => {
        const now = this.runtime.now(), period = this.currentDay(state, now);
        if ((state.dailyBlockedUntil ?? 0) > now) throw new DailyQuotaExceeded(state.dailyBlockedUntil!, "Provedor informou esgotamento da cota diária; nenhum envio autorizado.");
        if (state.daily?.limit !== undefined) {
          if (state.daily.requests >= state.daily.limit) throw new DailyQuotaExceeded(nextQuotaReset(now, this.timeZone), `Limite diário local atingido (${state.daily.requests}/${state.daily.limit}); nenhum envio autorizado.`);
        }
        state.starts = state.starts.filter(start => start > now - this.windowMs).sort((a, b) => a - b);
        state.tokenStarts = (state.tokenStarts ?? []).filter(item => item.at > now - this.windowMs).sort((a, b) => a.at - b.at);
        let tokenDeadline = now;
        if (this.options.tokensPerMinute !== undefined) {
          let used = state.tokenStarts.reduce((sum, item) => sum + item.tokens, 0);
          for (const item of state.tokenStarts) {
            if (used + tokens <= this.options.tokensPerMinute) break;
            used -= item.tokens;
            tokenDeadline = item.at + this.windowMs + 1;
          }
        }
        const last = state.starts.at(-1);
        const earliest = Math.max(state.blockedUntil, tokenDeadline, last === undefined ? now : last + this.options.minIntervalMs,
          state.starts.length >= this.options.requestsPerMinute ? state.starts[state.starts.length - this.options.requestsPerMinute]! + this.windowMs + 1 : now);
        if (earliest > now) return { wait: earliest - now, period };
        state.starts.push(now);
        if (tokens) state.tokenStarts.push({ at: now, tokens });
        if (state.daily) state.daily.requests++;
        await atomicJson(this.file, state);
        return { wait: 0, period };
      });
      if (!admission.wait) {
        let cancellation: Promise<void> | undefined;
        return { cancel: () => cancellation ??= this.transaction(async state => {
          if (state.daily?.period === admission.period) {
            state.daily.requests = Math.max(0, state.daily.requests - 1);
            await atomicJson(this.file, state);
          }
        }) };
      }
      // Never hold the filesystem lock while awaiting capacity or provider cooldown.
      await this.runtime.sleep(Math.min(admission.wait, 60000));
    }
  }
  async deferUntil(timestamp: number): Promise<void> {
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error("Espera de taxa inválida.");
    await this.transaction(async state => {
      state.blockedUntil = Math.max(state.blockedUntil, timestamp);
      await atomicJson(this.file, state);
    });
  }
  async blockDailyUntil(timestamp: number): Promise<void> {
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error("Pausa diária inválida.");
    await this.transaction(async state => {
      state.dailyBlockedUntil = Math.max(state.dailyBlockedUntil ?? 0, timestamp);
      await atomicJson(this.file, state);
    });
  }
}

export function retryHintMs(headers: Headers, now = Date.now()): number | null {
  const hints: number[] = [];
  const after = headers.get("retry-after");
  if (after !== null) {
    const wait = /^\d+(\.\d+)?$/.test(after) ? Number(after) * 1000 : Date.parse(after) - now;
    if (Number.isFinite(wait)) hints.push(Math.max(0, wait));
  }
  const rawReset = headers.get("x-ratelimit-reset");
  if (rawReset !== null && rawReset.trim()) {
    const numeric = Number(rawReset);
    const reset = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(rawReset);
    if (Number.isFinite(reset) && reset > 0) hints.push(Math.max(0, reset - now));
  }
  return hints.length ? Math.max(...hints) : null;
}
