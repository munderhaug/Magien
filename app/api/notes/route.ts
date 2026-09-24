import { NextResponse } from "next/server";
import { isNoteDept, noteKey } from "@/lib/notes";
import { items } from "@/lib/schedule";
import { readNotes, syncEnabled, writeNote } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!syncEnabled) return NextResponse.json({ sync: false, notes: {} });
  try {
    return NextResponse.json({ sync: true, notes: await readNotes() });
  } catch {
    return NextResponse.json({ sync: false, error: "redis" }, { status: 502 });
  }
}

/** Crew kan skrive notater uten PIN. Tom tekst sletter. */
export async function PUT(req: Request) {
  if (!syncEnabled) return NextResponse.json({ error: "Synk er ikke satt opp" }, { status: 501 });
  const body = await req.json().catch(() => ({}));
  const { id, dept } = body as { id?: string; dept?: string };
  if (!items.some((i) => i.id === id) || !isNoteDept(dept)) {
    return NextResponse.json({ error: "Ugyldig post eller fag" }, { status: 400 });
  }
  const text = String(body.text ?? "").trim().slice(0, 300);
  const by = String(body.by ?? "").trim().slice(0, 30);
  await writeNote(noteKey(id!, dept), text ? { text, by, at: Date.now() } : null);
  return NextResponse.json({ ok: true, notes: await readNotes() });
}
