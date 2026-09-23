import { EMPTY_STATE, type ShowState } from "@/lib/schedule";

// Upstash Redis via REST. Vercel Marketplace-integrasjonen setter KV_REST_API_* automatisk.
const URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "magien:showstate";

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
