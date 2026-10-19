import { appendJson, now, redact } from "./utils.js";

export class Logger {
  constructor(readonly directory: string) {}
  async event(type: string, data: unknown) {
    await appendJson(`${this.directory}/events.jsonl`, { at: now(), type, data });
  }
  async request(data: unknown) {
    await appendJson(`${this.directory}/requests.jsonl`, { at: now(), ...redact(data as object) });
  }
  info(message: string) { console.log(`[${now()}] ${message}`); }
}
