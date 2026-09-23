import { NextResponse } from "next/server";
import { applyGo, items, position, type Block, type ShowState } from "@/lib/schedule";
import { PIN, readState, syncEnabled, writeState } from "@/lib/store";
import { statusOf } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * Fjernstyring for Bitfocus Companion (Generic HTTP) o.l. GET og POST virker likt.
 *   /api/control?action=go&pin=1234                → start neste post
 *   /api/control?action=start&id=r08&pin=…         → start en bestemt post (id eller n=8, 1-basert)
 *   /api/control?action=delay&add=1&pin=…          → juster forsinkelse (add=-1, set=0)
 *   /api/control?action=release&pin=…              → slipp GO, følg klokka
 *   /api/control?action=message&text=Hei&pin=…     → beskjed til crew (tom text fjerner)
 *   /api/control?action=clear&pin=…                → fjern beskjed
 * PIN kan også sendes som header x-admin-pin.
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  if (!syncEnabled) return err("Synk er ikke satt opp (mangler Upstash Redis)", 501);
  if (PIN && (q.get("pin") ?? req.headers.get("x-admin-pin")) !== PIN) return err("Feil PIN", 401);

  const now = Date.now();
  const state = await readState();
  const pos = position(now, state);
  const block: Block = (pos.current ?? pos.next ?? items[items.length - 1]).block;
  let next: ShowState;

  switch (q.get("action")) {
    case "go": {
      if (!pos.next) return err("Ingen flere poster", 409);
      next = applyGo(state, pos.next, now);
      break;
    }
    case "start": {
      const n = Number(q.get("n"));
      const item = q.get("id") ? items.find((i) => i.id === q.get("id")) : items[n - 1];
      if (!item) return err("Fant ikke posten (bruk id=r08 eller n=8)", 404);
      next = applyGo(state, item, now);
      break;
    }
    case "delay": {
      const cur = Math.round(state.delay[block] ?? 0);
      const value = q.has("set") ? Number(q.get("set")) : cur + Number(q.get("add") ?? 0);
      if (!Number.isFinite(value)) return err("Ugyldig verdi", 400);
      next = { ...state, delay: { ...state.delay, [block]: value } };
      break;
    }
    case "release":
      next = { ...state, live: null };
      break;
    case "message":
      next = { ...state, message: q.get("text") ?? "" };
      break;
    case "clear":
      next = { ...state, message: "" };
      break;
    default:
      return err("Ukjent action (go, start, delay, release, message, clear)", 400);
  }

  const saved = await writeState(next);
  return NextResponse.json({ ok: true, ...statusOf(saved, Date.now()) });
}

function err(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export const GET = handle;
export const POST = handle;
