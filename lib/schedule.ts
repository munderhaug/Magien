import data from "@/data/schedule.json";

export type Block = "dag" | "omrigg" | "kveld";
export type Kind =
  | "bumper" | "host" | "pause" | "keynote" | "case" | "talk"
  | "doors" | "film" | "changeover" | "act";

export type Item = {
  id: string;
  title: string;
  /** Minutter etter midnatt, planlagt. */
  start: number;
  /** Minutter. */
  duration: number;
  block: Block;
  kind: Kind;
  sound: string | null;
  light: string | null;
  av: string | null;
  note: string | null;
};

export type Dept = "alle" | "lyd" | "lys" | "av";

/** Delt tilstand som regi styrer (synkes mellom enheter når Redis er satt opp). */
export type ShowState = {
  /** Forsinkelse i minutter (kan være desimal) per blokk. Positiv = vi ligger etter. */
  delay: Partial<Record<Block, number>>;
  /** Posten regi har trykket GO på, og når (ms epoch). */
  live: { id: string; startedAt: number } | null;
  /** Kort beskjed til hele crewet. */
  message: string;
  updatedAt: number;
  /** Tidligere GO-tilstander (nyeste sist), så regi kan angre en feil-cue. */
  history?: { live: ShowState["live"]; delay: ShowState["delay"] }[];
};

export const EMPTY_STATE: ShowState = { delay: {}, live: null, message: "", updatedAt: 0 };

export const items = data.items as Item[];
export const warnings = data.warnings as string[];

export const BLOCK_LABEL: Record<Block, string> = {
  dag: "Dagsarrangement",
  omrigg: "Omrigg",
  kveld: "Kveld",
};

export const KIND_LABEL: Record<Kind, string> = {
  bumper: "Bumper",
  host: "Vert",
  pause: "Pause",
  keynote: "Keynote",
  case: "Kundecase",
  talk: "Samtale",
  doors: "Dører",
  film: "Film",
  changeover: "Omrigg",
  act: "Innslag",
};

export function deptCue(item: Item, dept: Dept): string | null {
  if (dept === "lyd") return item.sound;
  if (dept === "lys") return item.light;
  if (dept === "av") return item.av;
  return null;
}


export function delayFor(item: Item, state: ShowState): number {
  return state.delay[item.block] ?? 0;
}

/**
 * Showdagen: torsdag 24. september 2026, midnatt i Oslo (CEST, UTC+2).
 * Fast UTC-tidspunkt, så server (Vercel kjører UTC) og alle enheter regner likt.
 */
export const SHOW_DAY_MS = Date.UTC(2026, 8, 24) - 2 * 3_600_000;

/** Er tidspunktet (ms) på showdagen i Oslo? */
export function isShowDay(ms: number): boolean {
  return ms >= SHOW_DAY_MS && ms < SHOW_DAY_MS + 86_400_000;
}

export function showDay(): Date {
  return new Date(SHOW_DAY_MS);
}

/** Projisert start i ms (epoch). `_day` beholdes for kompatibilitet; tidene ankres alltid til showdagen. */
export function startAt(item: Item, state: ShowState, _day?: Date): number {
  return SHOW_DAY_MS + (item.start + delayFor(item, state)) * 60_000;
}

export function endAt(item: Item, state: ShowState, day: Date): number {
  return startAt(item, state, day) + item.duration * 60_000;
}

export type Position = {
  current: Item | null;
  /** Når nåværende post startet (faktisk ved GO, ellers projisert). */
  currentStart: number | null;
  next: Item | null;
  nextStart: number | null;
  /** true når regi har trykket GO og styrer manuelt. */
  manual: boolean;
};


export function position(now: number, state: ShowState): Position {
  const day = new Date(now);
  const live = state.live && items.find((i) => i.id === state.live!.id);
  // Manuell styring: posten regi har startet står til neste GO – ingen automatisk videre (overtid telles).
  if (live && state.live) {
    const next = items[items.indexOf(live) + 1] ?? null;
    return {
      current: live,
      currentStart: state.live.startedAt,
      next,
      nextStart: next
        ? Math.max(state.live.startedAt + live.duration * 60_000, startAt(next, state, day), now)
        : null,
      manual: true,
    };
  }
  let current: Item | null = null;
  for (const i of items) {
    if (startAt(i, state, day) <= now && now < endAt(i, state, day)) current = i;
  }
  const next = items.find((i) => startAt(i, state, day) > now) ?? null;
  return {
    current,
    currentStart: current ? startAt(current, state, day) : null,
    next,
    nextStart: next ? startAt(next, state, day) : null,
    manual: false,
  };
}

export function hhmm(minOrMs: number, isMs = false): string {
  // Klokkeslett vises alltid i Oslo-tid (CEST), uansett tidssone på enheten.
  if (isMs) minOrMs = Math.floor((minOrMs - SHOW_DAY_MS) / 60_000);
  const m = ((Math.round(minOrMs) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Nedtelling: «4:05», «1:02:30», med minus ved overtid. */
export function countdown(ms: number): string {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const body = h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  return (neg ? "+" : "") + body;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** GO: start posten nå, og regn ut forsinkelse for resten av blokken ut fra planlagt tid. */
export function applyGo(state: ShowState, item: Item, now: number): ShowState {
  const planned = startAt(item, { ...state, delay: {} });
  return {
    ...state,
    history: [...(state.history ?? []), { live: state.live, delay: state.delay }].slice(-20),
    live: { id: item.id, startedAt: now },
    delay: { ...state.delay, [item.block]: Math.round((now - planned) / 6_000) / 10 },
  };
}

/**
 * Tilbake: angre siste GO/Start og gjenopprett forrige post med opprinnelig starttid og forsinkelse.
 * Uten historikk: start posten før den som går nå. Returnerer null hvis det ikke finnes noe å gå tilbake til.
 */
export function applyBack(state: ShowState, now: number): ShowState | null {
  const history = state.history ?? [];
  if (history.length) {
    const prev = history[history.length - 1];
    let live = prev.live;
    if (!live) {
      // Forrige tilstand var klokkestyrt: lås posten klokka hadde da, med sin projiserte start.
      const was = { ...state, live: null, delay: prev.delay };
      const item = position(now, was).current ?? items.filter((i) => startAt(i, was) <= now).at(-1);
      if (item) live = { id: item.id, startedAt: startAt(item, was) };
    }
    return { ...state, live, delay: prev.delay, history: history.slice(0, -1) };
  }
  const cur = position(now, state).current;
  const idx = cur ? items.indexOf(cur) : items.findIndex((i) => startAt(i, state) > now);
  const prevItem = idx > 0 ? items[idx - 1] : null;
  return prevItem ? { ...applyGo(state, prevItem, now), history: [] } : null;
}

/** Tittelen på posten Tilbake vil gå til (for knappetekst). */
export function backTarget(state: ShowState, now: number): Item | null {
  const next = applyBack(state, now);
  if (!next) return null;
  // Tilbake til klokkestyrt: vis posten klokka sier går da.
  if (!next.live) return position(now, next).current ?? position(now, next).next;
  return items.find((i) => i.id === next.live!.id) ?? null;
}
