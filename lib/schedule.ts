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

/** Projisert start i ms (epoch) for dagens dato. */
export function startAt(item: Item, state: ShowState, day: Date): number {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + (item.start + delayFor(item, state)) * 60_000;
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

/** Hvor lenge en GO holder før vi faller tilbake til klokka (om regi glemmer å trykke videre). */
const LIVE_GRACE_MS = 30 * 60_000;

export function position(now: number, state: ShowState): Position {
  const day = new Date(now);
  const live = state.live && items.find((i) => i.id === state.live!.id);
  if (live && state.live && now - state.live.startedAt < live.duration * 60_000 + LIVE_GRACE_MS) {
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
  if (isMs) {
    const d = new Date(minOrMs);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
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
