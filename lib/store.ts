import type { Note, Notes } from "@/lib/notes";
import { EMPTY_STATE, type ShowState } from "@/lib/schedule";

// Delt lager for live-synk. To mulige oppsett (det første som er konfigurert brukes):
// 1) Supabase: funksjonen public.magien_kv (krever hemmelig nøkkel) – MAGIEN_DB_URL / _KEY / _SECRET.
// 2) Upstash Redis via REST – Vercel Marketplace-integrasjonen setter KV_REST_API_* automatisk.
const DB_URL = process.env.MAGIEN_DB_URL;
const DB_KEY = process.env.MAGIEN_DB_KEY;
const DB_SECRET = process.env.MAGIEN_DB_SECRET;
const useSupabase = Boolean(DB_URL && DB_KEY && DB_SECRET);

const URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "magien:showstate";
const NOTES_KEY = "magien:notes";
const NOTE_PREFIX = "note:";

export const PIN = process.env.ADMIN_PIN;
export const syncEnabled = useSupabase || Boolean(URL && TOKEN);

async function kv(op: "get" | "set" | "del" | "prefix", key: string, value?: unknown) {
  const res = await fetch(`${DB_URL}/rest/v1/rpc/magien_kv`, {
    method: "POST",
    headers: { apikey: DB_KEY!, Authorization: `Bearer ${DB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: DB_SECRET, p_op: op, p_key: key, p_value: value ?? null }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DB ${res.status}`);
  return res.json();
}

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
  if (useSupabase) {
    const v = await kv("get", KEY);
    return v ? { ...EMPTY_STATE, ...v } : EMPTY_STATE;
  }
  const raw = await redis(["GET", KEY]);
  return raw ? { ...EMPTY_STATE, ...JSON.parse(raw) } : EMPTY_STATE;
}

export async function writeState(body: Partial<ShowState>): Promise<ShowState> {
  const state: ShowState = {
    delay: body.delay ?? {},
    live: body.live ?? null,
    message: String(body.message ?? "").slice(0, 200),
    updatedAt: Date.now(),
    history: Array.isArray(body.history) ? body.history.slice(-20) : [],
  };
  if (useSupabase) await kv("set", KEY, state);
  else await redis(["SET", KEY, JSON.stringify(state)]);
  return state;
}

export async function readNotes(): Promise<Notes> {
  if (useSupabase) {
    const rows: Record<string, Note> = (await kv("prefix", NOTE_PREFIX)) ?? {};
    const notes: Notes = {};
    for (const [k, v] of Object.entries(rows)) notes[k.slice(NOTE_PREFIX.length)] = v;
    return notes;
  }
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
  if (useSupabase) {
    await (note ? kv("set", NOTE_PREFIX + key, note) : kv("del", NOTE_PREFIX + key));
    return;
  }
  await redis(note ? ["HSET", NOTES_KEY, key, JSON.stringify(note)] : ["HDEL", NOTES_KEY, key]);
}
