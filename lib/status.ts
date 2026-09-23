import { countdown, position, type ShowState } from "@/lib/schedule";

/** Flat status for Companion-variabler (Generic HTTP → JSON). Ingen PIN – kun lesing. */
export function statusOf(state: ShowState, now: number) {
  const pos = position(now, state);
  const cur = pos.current;
  const left = cur && pos.currentStart !== null ? pos.currentStart + cur.duration * 60_000 - now : null;
  const waiting = pos.manual && pos.nextStart !== null && pos.nextStart <= now;
  const delay = Math.round(state.delay[(cur ?? pos.next)?.block ?? "dag"] ?? 0);
  return {
    now_id: cur?.id ?? "",
    now_title: cur?.title ?? "",
    now_left: left === null ? "" : countdown(left),
    now_left_s: left === null ? null : Math.round(left / 1000),
    now_over: left !== null && left < 0,
    next_id: pos.next?.id ?? "",
    next_title: pos.next?.title ?? "",
    next_in: pos.nextStart === null ? "" : waiting ? "venter" : countdown(pos.nextStart - now),
    next_av: pos.next?.av ?? "",
    manual: pos.manual,
    delay_min: delay,
    delay_text: delay ? (delay > 0 ? `+${delay} min` : `${delay} min`) : "i rute",
    message: state.message,
  };
}
