import { NextResponse } from "next/server";
import { EMPTY_STATE, type ShowState } from "@/lib/schedule";

export const dynamic = "force-dynamic";

// Upstash Redis via REST. Vercel Marketplace-integrasjonen setter KV_REST_API_* automatisk.
const URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const PIN = process.env.ADMIN_PIN;
const KEY = "magien:showstate";

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

export async function GET() {
  if (!URL || !TOKEN) return NextResponse.json({ sync: false, pin: Boolean(PIN) });
  try {
    const raw = await redis(["GET", KEY]);
    const state: ShowState = raw ? JSON.parse(raw) : EMPTY_STATE;
    return NextResponse.json({ sync: true, pin: Boolean(PIN), state });
  } catch {
    return NextResponse.json({ sync: false, error: "redis" }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  if (!URL || !TOKEN) return NextResponse.json({ error: "Synk er ikke satt opp" }, { status: 501 });
  if (PIN && req.headers.get("x-admin-pin") !== PIN) {
    return NextResponse.json({ error: "Feil PIN" }, { status: 401 });
  }
  const body = (await req.json()) as ShowState;
  const state: ShowState = {
    delay: body.delay ?? {},
    live: body.live ?? null,
    message: String(body.message ?? "").slice(0, 200),
    updatedAt: Date.now(),
  };
  await redis(["SET", KEY, JSON.stringify(state)]);
  return NextResponse.json({ sync: true, state });
}
