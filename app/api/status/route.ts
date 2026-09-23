import { NextResponse } from "next/server";
import { EMPTY_STATE } from "@/lib/schedule";
import { statusOf } from "@/lib/status";
import { readState, syncEnabled } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Flat status for Companion-variabler (Generic HTTP → JSON). Ingen PIN – kun lesing. */
export async function GET() {
  const state = syncEnabled ? await readState().catch(() => EMPTY_STATE) : EMPTY_STATE;
  return NextResponse.json({ sync: syncEnabled, ...statusOf(state, Date.now()) });
}
