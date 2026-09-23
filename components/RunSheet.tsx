"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BLOCK_LABEL,
  KIND_LABEL,
  countdown,
  deptCue,
  endAt,
  hhmm,
  items,
  position,
  startAt,
  warnings,
  type Block,
  type Dept,
  type Item,
  type ShowState,
} from "@/lib/schedule";
import { usePref, useNow, useShowState, useWakeLock, type SyncMode } from "@/lib/hooks";

const DEPTS: { id: Dept; label: string }[] = [
  { id: "alle", label: "Alle" },
  { id: "lyd", label: "Lyd" },
  { id: "lys", label: "Lys" },
  { id: "av", label: "AV" },
];

/** Standby-varsel når neste post starter innen dette. */
const STANDBY_MS = 60_000;

export default function RunSheet() {
  const now = useNow();
  const { state, mode, update } = useShowState();
  const [dept, setDept] = usePref<Dept>("magien:dept", "alle");
  const [regi, setRegi] = useState(false);
  const [stage, setStage] = useState(false);
  useWakeLock();

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("view") === "scene") setStage(true);
    if (p.has("regi")) setRegi(true);
  }, []);

  if (now === null) return null;
  const pos = position(now, state);

  // Start posten nå, og regn ut forsinkelse for resten av blokken ut fra planlagt tid.
  function go(item: Item) {
    const planned = startAt(item, { ...state, delay: {} }, new Date(now!));
    update({
      ...state,
      live: { id: item.id, startedAt: now! },
      delay: { ...state.delay, [item.block]: Math.round((now! - planned) / 6_000) / 10 },
    });
  }

  if (stage) return <StageView now={now} state={state} onExit={() => setStage(false)} />;

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Magien 2026</h1>
          <SyncBadge mode={mode} />
        </div>
        <div className="clock">{clockText(now)}</div>
      </header>

      <nav className="tabs" aria-label="Avdeling">
        {DEPTS.map((d) => (
          <button key={d.id} aria-pressed={dept === d.id} onClick={() => setDept(d.id)}>
            {d.label}
          </button>
        ))}
      </nav>

      {state.message && <div className="message">{state.message}</div>}

      <Now now={now} state={state} dept={dept} />
      <Next now={now} state={state} dept={dept} />

      {regi && <Regi now={now} state={state} update={update} mode={mode} onGo={go} />}

      <Timeline
        now={now}
        state={state}
        dept={dept}
        currentId={pos.current?.id ?? null}
        onGo={regi ? go : undefined}
      />

      {warnings.length > 0 && (
        <details className="warnings">
          <summary>Merknader fra Excel ({warnings.length})</summary>
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}

      <footer className="foot">
        <button onClick={() => setStage(true)}>Scenevisning</button>
        <button aria-pressed={regi} onClick={() => setRegi(!regi)}>
          Regi
        </button>
      </footer>
    </main>
  );
}

function clockText(now: number) {
  const d = new Date(now);
  return `${hhmm(now, true)}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function SyncBadge({ mode }: { mode: SyncMode }) {
  const text = { loading: "Kobler til…", live: "Live", local: "Lokal", offline: "Frakoblet" }[mode];
  const title = {
    loading: "",
    live: "Endringer fra regi vises på alle enheter",
    local: "Regi-endringer gjelder bare denne enheten",
    offline: "Mistet nett – viser siste kjente tilstand",
  }[mode];
  return (
    <span className={`sync sync-${mode}`} title={title}>
      {text}
    </span>
  );
}

function DelayTag({ minutes: exact }: { minutes: number }) {
  const minutes = Math.round(exact);
  if (!minutes) return null;
  return <span className={`delay ${minutes > 0 ? "late" : "early"}`}>{minutes > 0 ? `+${minutes}` : minutes} min</span>;
}

function Cues({ item, dept, large }: { item: Item; dept: Dept; large?: boolean }) {
  if (dept !== "alle") {
    const cue = deptCue(item, dept);
    return (
      <div className={large ? "cue-one large" : "cue-one"}>
        {cue ?? <span className="muted">Ingen cue</span>}
      </div>
    );
  }
  const rows = [
    ["Lyd", item.sound],
    ["Lys", item.light],
    ["AV", item.av],
  ].filter(([, v]) => v);
  if (!rows.length && !item.note) return null;
  return (
    <dl className="cues">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      {item.note && (
        <div className="note">
          <dt>Obs</dt>
          <dd>{item.note}</dd>
        </div>
      )}
    </dl>
  );
}

function Now({ now, state, dept }: { now: number; state: ShowState; dept: Dept }) {
  const pos = position(now, state);
  const { current, currentStart } = pos;
  if (!current || currentStart === null) {
    const label = pos.next ? (now < startAt(items[0], state, new Date(now)) ? "Før start" : "Buffer") : "Ferdig for i dag";
    return (
      <section className="card now idle">
        <div className="label">Nå</div>
        <div className="title">{label}</div>
      </section>
    );
  }
  const end = currentStart + current.duration * 60_000;
  const left = end - now;
  const progress = Math.min(1, Math.max(0, (now - currentStart) / (current.duration * 60_000 || 1)));
  const status = left < 0 ? "over" : left < 60_000 ? "soon" : "";
  return (
    <section className={`card now ${status}`}>
      <div className="row">
        <div className="label">
          Nå · {KIND_LABEL[current.kind]}
          {pos.manual && <span className="go-tag">GO</span>}
        </div>
        <div className="time-left">
          <span>{countdown(left)}</span>
          <small>{left < 0 ? "over tid" : "igjen"}</small>
        </div>
      </div>
      <div className="title">{current.title}</div>
      <div className="bar">
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="sub">
        {hhmm(currentStart, true)}–{hhmm(end, true)} · {current.duration} min
      </div>
      <Cues item={current} dept={dept} large />
    </section>
  );
}

function Next({ now, state, dept }: { now: number; state: ShowState; dept: Dept }) {
  const { next, nextStart } = position(now, state);
  if (!next || nextStart === null) return null;
  const until = nextStart - now;
  const standby = until <= STANDBY_MS;
  return (
    <section className={`card next ${standby ? "standby" : ""}`}>
      <div className="row">
        <div className="label">{standby ? "Standby" : "Neste"} · {KIND_LABEL[next.kind]}</div>
        <div className="time-left small">
          <small>om</small> <span>{countdown(until)}</span>
        </div>
      </div>
      <div className="title">{next.title}</div>
      <div className="sub">
        {hhmm(nextStart, true)} · {next.duration} min
      </div>
      <Cues item={next} dept={dept} />
    </section>
  );
}

function Timeline({
  now,
  state,
  dept,
  currentId,
  onGo,
}: {
  now: number;
  state: ShowState;
  dept: Dept;
  currentId: string | null;
  onGo?: (item: Item) => void;
}) {
  const day = new Date(now);
  const [showPast, setShowPast] = useState(false);
  // Med en aktiv post er alt før den ferdig; ellers avgjør klokka.
  const currentIdx = items.findIndex((i) => i.id === currentId);
  const isDone = (i: Item) =>
    currentIdx >= 0 ? items.indexOf(i) < currentIdx : endAt(i, state, day) <= now;
  const past = items.filter(isDone).length;

  const groups = useMemo(() => {
    const g: { block: Block; items: Item[] }[] = [];
    for (const i of items) {
      if (g.at(-1)?.block !== i.block) g.push({ block: i.block, items: [] });
      g.at(-1)!.items.push(i);
    }
    return g;
  }, []);

  return (
    <>
      {past > 0 && (
        <button className="past-toggle" onClick={() => setShowPast(!showPast)}>
          {showPast ? "Skjul ferdige poster" : `Vis ferdige poster (${past})`}
        </button>
      )}
    <ol className="timeline">
      {groups.map((g) => {
        const visible = g.items.filter((i) => showPast || !isDone(i));
        if (!visible.length) return null;
        return (
        <li key={g.block + g.items[0].id} className="group">
          <h2>
            {BLOCK_LABEL[g.block]} <DelayTag minutes={state.delay[g.block] ?? 0} />
          </h2>
          <ol>
            {visible.map((i) => {
              const start = startAt(i, state, day);
              const done = isDone(i);
              const isNow = i.id === currentId;
              const cue = dept === "alle" ? null : deptCue(i, dept);
              const shifted = hhmm(start, true) !== hhmm(i.start);
              return (
                <li
                  key={i.id}
                  data-id={i.id}
                  className={["item", `k-${i.kind}`, done && "done", isNow && "is-now", dept !== "alle" && !cue && "quiet"]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="when">
                    <span>{hhmm(start, true)}</span>
                    {shifted && <s>{hhmm(i.start)}</s>}
                    <small>{i.duration}′</small>
                  </div>
                  <div className="what">
                    <div className="name">
                      {i.title}
                      {i.kind !== "host" && <span className="kind">{KIND_LABEL[i.kind]}</span>}
                    </div>
                    {dept === "alle" ? <Cues item={i} dept={dept} /> : cue && <div className="cue-one">{cue}</div>}
                  </div>
                  {onGo && state.live?.id !== i.id && (
                    <button className="row-go" onClick={() => confirm(`Start «${i.title}» nå?`) && onGo(i)} aria-label={`Start ${i.title} nå`}>
                      Start
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </li>
        );
      })}
    </ol>
    </>
  );
}

function Regi({
  now,
  state,
  update,
  mode,
  onGo,
}: {
  now: number;
  state: ShowState;
  update: (s: ShowState) => void;
  mode: SyncMode;
  onGo: (item: Item) => void;
}) {
  const pos = position(now, state);
  const target = pos.next;
  const block: Block = (pos.current ?? pos.next ?? items[items.length - 1]).block;
  const delay = Math.round(state.delay[block] ?? 0);
  const [msg, setMsg] = useState(state.message);
  useEffect(() => setMsg(state.message), [state.message]);

  return (
    <section className="card regi">
      <div className="label">
        Regi {mode === "local" && <span className="muted">· kun denne enheten</span>}
      </div>
      {target && (
        <button className="go" onClick={() => onGo(target)}>
          GO <span>{target.title}</span>
        </button>
      )}
      <div className="regi-row">
        <span>
          Forsinkelse {BLOCK_LABEL[block].toLowerCase()}: <b>{delay > 0 ? `+${delay}` : delay} min</b>
        </span>
        <div className="step">
          <button onClick={() => update({ ...state, delay: { ...state.delay, [block]: delay - 1 } })}>−1</button>
          <button onClick={() => update({ ...state, delay: { ...state.delay, [block]: delay + 1 } })}>+1</button>
          <button onClick={() => update({ ...state, delay: { ...state.delay, [block]: 0 } })}>0</button>
        </div>
      </div>
      {pos.manual && (
        <button className="link" onClick={() => update({ ...state, live: null })}>
          Slipp GO – følg klokka
        </button>
      )}
      <form
        className="regi-row"
        onSubmit={(e) => {
          e.preventDefault();
          update({ ...state, message: msg.trim() });
        }}
      >
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Beskjed til crew…" maxLength={200} />
        <button type="submit">Send</button>
        {state.message && (
          <button type="button" onClick={() => update({ ...state, message: "" })}>
            Fjern
          </button>
        )}
      </form>
    </section>
  );
}

function StageView({ now, state, onExit }: { now: number; state: ShowState; onExit: () => void }) {
  const { current, currentStart, next, nextStart } = position(now, state);
  const left = current && currentStart !== null ? currentStart + current.duration * 60_000 - now : null;
  const tone = left === null ? "" : left < 0 ? "over" : left < 60_000 ? "soon" : left < 2 * 60_000 ? "warn" : "ok";
  return (
    <main className={`stage ${tone}`} onClick={onExit} title="Trykk for å gå tilbake">
      <div className="stage-clock">{clockText(now)}</div>
      <div className="stage-big">{left !== null ? countdown(left) : nextStart ? countdown(nextStart - now) : "—"}</div>
      <div className="stage-title">
        {current ? current.title : next ? `Neste: ${next.title}` : "Ferdig for i dag"}
      </div>
      {current && next && nextStart && (
        <div className="stage-next">
          Neste {hhmm(nextStart, true)} · {next.title}
        </div>
      )}
    </main>
  );
}
