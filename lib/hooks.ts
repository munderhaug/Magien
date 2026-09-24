"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { noteKey, type NoteDept, type Notes } from "@/lib/notes";
import { EMPTY_STATE, SHOW_DAY_MS, type ShowState } from "@/lib/schedule";

/**
 * Klokke som tikker 4 ganger i sekundet.
 * `?t=14:30` i URL-en simulerer tidspunkt (for gjennomgang/prøve), klokka går videre derfra.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(location.search).get("t")?.match(/^(\d{1,2}):(\d{2})$/);
    let offset = 0;
    if (t) {
      // Simulert tid gjelder showdagen, så ?t= fungerer også før 24. september.
      offset = SHOW_DAY_MS + (Number(t[1]) * 60 + Number(t[2])) * 60_000 - Date.now();
    }
    const tick = () => setNow(Date.now() + offset);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Holder skjermen våken mens appen er åpen (der nettleseren støtter det). */
export function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {}
    };
    const onVisible = () => document.visibilityState === "visible" && request();
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

export type SyncMode = "loading" | "live" | "local" | "offline";

const LOCAL_KEY = "magien:state";
const CACHE_KEY = "magien:cache";
const PIN_KEY = "magien:pin";

/**
 * Delt regi-tilstand. Med Redis konfigurert pollés /api/state og alle enheter ser det samme.
 * Uten Redis lagres tilstanden lokalt på enheten.
 */
export function useShowState() {
  const [state, setState] = useState<ShowState>(EMPTY_STATE);
  const [mode, setMode] = useState<SyncMode>("loading");
  const pending = useRef(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const json = await res.json();
        if (stop) return;
        if (json.sync) {
          if (!pending.current) {
            setState(json.state);
            writeLocal(CACHE_KEY, json.state);
          }
          setMode("live");
          // Pause når fanen er skjult (sparer Redis-kall); hentes straks igjen ved retur.
          timer = setTimeout(poll, document.visibilityState === "hidden" ? 15000 : 2000);
          return;
        }
        if (json.error) throw new Error(json.error);
        setMode("local");
        setState(readLocal(LOCAL_KEY));
      } catch {
        if (stop) return;
        // Nett nede: vis siste kjente tilstand og prøv igjen.
        setMode("offline");
        setState((s) => (s.updatedAt ? s : readLocal(CACHE_KEY)));
        timer = setTimeout(poll, 5000);
      }
    };
    poll();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onStorage = (e: StorageEvent) => e.key === LOCAL_KEY && setState(readLocal(LOCAL_KEY));
    addEventListener("storage", onStorage);
    return () => {
      stop = true;
      clearTimeout(timer);
      removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const update = useCallback(
    async (next: ShowState) => {
      next = { ...next, updatedAt: Date.now() };
      setState(next);
      if (mode === "local") {
        writeLocal(LOCAL_KEY, next);
        return;
      }
      pending.current = true;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await fetch("/api/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json", "x-admin-pin": readPin() },
            body: JSON.stringify(next),
          });
          if (res.status !== 401) break;
          const pin = prompt("PIN for regi:");
          if (!pin) break;
          try {
            localStorage.setItem(PIN_KEY, pin);
          } catch {}
        }
      } catch {
        alert("Fikk ikke lagret – sjekk nettverket.");
      } finally {
        pending.current = false;
      }
    },
    [mode],
  );

  return { state, mode, update };
}

function readLocal(key: string): ShowState {
  try {
    return { ...EMPTY_STATE, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return EMPTY_STATE;
  }
}

function writeLocal(key: string, state: ShowState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {}
}

function readPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Liten wrapper rundt localStorage for brukerpreferanser (avdeling osv.). */
export function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v) setValue(v as T);
    } catch {}
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {}
    },
    [key],
  );
  return [value, set];
}

const NOTES_KEY = "magien:notes";

/**
 * Crew-notater per post og fag. Live: hentes fra /api/notes hvert 10. sekund (ikke når fanen er skjult).
 * Lokal: lagres på enheten.
 */
export function useNotes(mode: SyncMode) {
  const [notes, setNotes] = useState<Notes>({});

  useEffect(() => {
    if (mode === "local") {
      try {
        setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) ?? "{}"));
      } catch {}
      return;
    }
    if (mode !== "live") return;
    let stop = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const json = await (await fetch("/api/notes", { cache: "no-store" })).json();
        if (!stop && json.sync) setNotes(json.notes);
      } catch {}
    };
    load();
    const id = setInterval(load, 10_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [mode]);

  const save = useCallback(
    async (id: string, dept: NoteDept, text: string, by: string) => {
      const key = noteKey(id, dept);
      const next = { ...notes };
      if (text.trim()) next[key] = { text: text.trim(), by: by.trim(), at: Date.now() };
      else delete next[key];
      setNotes(next);
      if (mode === "local") {
        try {
          localStorage.setItem(NOTES_KEY, JSON.stringify(next));
        } catch {}
        return;
      }
      try {
        const res = await fetch("/api/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, dept, text, by }),
        });
        const json = await res.json();
        if (json.notes) setNotes(json.notes);
        else throw new Error(json.error);
      } catch {
        alert("Fikk ikke lagret notatet – sjekk nettverket.");
      }
    },
    [notes, mode],
  );

  return { notes, save };
}
