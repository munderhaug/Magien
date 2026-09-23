import { NextResponse } from "next/server";
import type { ShowState } from "@/lib/schedule";
import { PIN, readState, syncEnabled, writeState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!syncEnabled) return NextResponse.json({ sync: false, pin: Boolean(PIN) });
  try {
    return NextResponse.json({ sync: true, pin: Boolean(PIN), state: await readState() });
  } catch {
    return NextResponse.json({ sync: false, error: "redis" }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  if (!syncEnabled) return NextResponse.json({ error: "Synk er ikke satt opp" }, { status: 501 });
  if (PIN && req.headers.get("x-admin-pin") !== PIN) {
    return NextResponse.json({ error: "Feil PIN" }, { status: 401 });
  }
  const state = await writeState((await req.json()) as ShowState);
  return NextResponse.json({ sync: true, state });
}
