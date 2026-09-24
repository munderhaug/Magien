import type { Note, Notes } from "@/lib/notes";
import { EMPTY_STATE, type ShowState } from "@/lib/schedule";

// Upstash Redis via REST. Vercel Marketplace-integrasjonen setter KV_REST_API_* automatisk.
const URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "magien:showstate";
const NOTES_KEY = "magien:notes";

export const PIN = process.env.ADMIN_PIN;
export const syncEnabled = Boolean(URL && TOKEN);

async function redis(cmd: unknown[]) {
  const res = await fetch(URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return (await res.json()).result;
}

export async function readState(): Promise<ShowState> {
  const raw = await redis(["GET", KEY]);
  return raw ? { ...EMPTY_STATE, ...JSON.parse(raw) } : EMPTY_STATE;
}

export async function writeState(body: Partial<ShowState>): Promise<ShowState> {
  const state: ShowState = {
    delay: body.delay ?? {},
    live: body.live ?? null,
    message: String(body.message ?? "").slice(0, 200),
    updatedAt: Date.now(),
  };
  await redis(["SET", KEY, JSON.stringify(state)]);
  return state;
}

export async function readNotes(): Promise<Notes> {
  const flat: string[] = (await redis(["HGETALL", NOTES_KEY])) ?? [];
  const notes: Notes = {};
  for (let i = 0; i < flat.length; i += 2) {
    try {
      notes[flat[i]] = JSON.parse(flat[i + 1]);
    } catch {}
  }
  return notes;
}

/** `note: null` sletter notatet. */
export async function writeNote(key: string, note: Note | null) {
  await redis(note ? ["HSET", NOTES_KEY, key, JSON.stringify(note)] : ["HDEL", NOTES_KEY, key]);
}
