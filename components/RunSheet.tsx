"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  applyGo,
  isShowDay,
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
  type Kind,
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

/** Høyden på den faste fanelinja – det som havner under den regnes som ute av syne. */
const BAR_MARGIN = "-60px 0px 0px 0px";

export default function RunSheet() {
  const now = useNow();
  const { state, mode, update } = useShowState();
  const [dept, setDept] = usePref<Dept>("magien:dept", "alle");
  const [regi, setRegi] = useState(false);
  const [stage, setStage] = useState(false);
  const [topEl, setTopEl] = useState<HTMLElement | null>(null);
  const [msgEl, setMsgEl] = useState<HTMLElement | null>(null);
  const topVisible = useInView(topEl);
  const msgVisible = useInView(msgEl, BAR_MARGIN);
  useWakeLock();

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("view") === "scene") setStage(true);
    if (p.has("regi")) setRegi(true);
  }, []);

  if (now === null) return null;
  const pos = position(now, state);

  const go = (item: Item) => update(applyGo(state, item, now));

  if (stage) return <StageView now={now} state={state} onExit={() => setStage(false)} />;

  const showFlag = Boolean(state.message) && !msgVisible;

  return (
    <main className={regi ? "wrap regi-on" : "wrap"}>
      <header className="top" ref={setTopEl}>
        <div className="brand">
          <p>Kjøreplan</p>
          <h1>Magien 2026</h1>
        </div>
        <div className="top-status">
          <Clock now={now} />
          <SyncBadge mode={mode} />
        </div>
      </header>

      <div className="tabbar">
        <nav className="tabs" aria-label="Avdeling">
          {DEPTS.map((d) => (
            <button key={d.id} aria-pressed={dept === d.id} onClick={() => setDept(d.id)}>
              {d.label}
            </button>
          ))}
        </nav>
        {(showFlag || !topVisible) && (
          <div className="tabbar-aside">
            {showFlag && (
              <button className="msg-flag" onClick={() => scrollTo({ top: 0, behavior: "smooth" })}>
                Beskjed
              </button>
            )}
            {!topVisible && (
              <span className="mini-clock num" aria-hidden="true">
                {hhmm(now, true)}
              </span>
            )}
          </div>
        )}
      </div>

      {state.message && (
        <div className="message" role="status" ref={setMsgEl}>
          <Icon name="megaphone" />
          <div>
            <p className="message-from">Beskjed fra regi</p>
            <p className="message-text">{state.message}</p>
          </div>
        </div>
      )}

      <div className="layout">
        <div className="side">
          <Now now={now} state={state} dept={dept} />
          {regi && <Regi now={now} state={state} update={update} mode={mode} onGo={go} />}
          <Next now={now} state={state} dept={dept} />
        </div>

        <div className="main">
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
        </div>
      </div>

      <footer className="foot">
        <button onClick={() => setStage(true)}>
          <Icon name="expand" />
          Scenevisning
        </button>
        <button aria-pressed={regi} onClick={() => setRegi(!regi)}>
          <Icon name="sliders" />
          Regi
        </button>
      </footer>
    </main>
  );
}

/** Er elementet synlig i vinduet? (true til vi vet noe annet, og når elementet ikke finnes.) */
function useInView(el: Element | null, rootMargin = "0px") {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [el, rootMargin]);
  return el ? inView : true;
}

/* Visningstekst. Rå titler brukes fortsatt i aria-label og bekreftelsesdialogen. */

/** «DAGSARRANGEMENT SLUTT - OMRIGG» → «Dagsarrangement slutt – omrigg», « - » → « – ». */
function displayTitle(raw: string) {
  let t = raw.trim();
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length > 3 && letters === letters.toLocaleUpperCase("nb") && letters !== letters.toLocaleLowerCase("nb")) {
    t = t.toLocaleLowerCase("nb");
    t = t.charAt(0).toLocaleUpperCase("nb") + t.slice(1);
  }
  return t.replace(/\s+-\s+/g, " – ");
}

/** Type-etiketten, men ikke når tittelen allerede begynner med den («Pause», «Keynote – Hedne»). */
function kindLabel(item: Item): string | null {
  const label = KIND_LABEL[item.kind];
  const t = displayTitle(item.title).toLocaleLowerCase("nb");
  const l = label.toLocaleLowerCase("nb");
  return t.startsWith(l) && !/\p{L}/u.test(t.charAt(l.length)) ? null : label;
}

function Range({ from, to }: { from: number; to: number }) {
  return (
    <>
      {hhmm(from, true)}
      <span className="dash">–</span>
      {hhmm(to, true)}
    </>
  );
}

function clockText(now: number) {
  const d = new Date(now);
  return `${hhmm(now, true)}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function Clock({ now }: { now: number }) {
  const text = clockText(now);
  return (
    <div className="clock num" aria-label={`Klokka er ${text}`}>
      {text.slice(0, 5)}
      <span>{text.slice(5)}</span>
    </div>
  );
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

function delayText(minutes: number) {
  return minutes > 0 ? `+${minutes} min` : minutes < 0 ? `−${-minutes} min` : "0 min";
}

function DelayTag({ minutes: exact }: { minutes: number }) {
  const minutes = Math.round(exact);
  if (!minutes) return null;
  return <span className={`delay ${minutes > 0 ? "late" : "early"}`}>{delayText(minutes)}</span>;
}

/** Lar lange filnavn («02_Kundecase2_ProCoSys_Equinor1.pptx») brytes ved _ i stedet for midt i et ord. */
function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=_)/);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </>
  );
}

function Cues({ item, dept, large }: { item: Item; dept: Dept; large?: boolean }) {
  if (dept !== "alle") {
    const cue = deptCue(item, dept);
    return (
      <p className={large ? "cue-one large" : "cue-one"}>
        {cue ? <Breakable text={cue} /> : <span className="muted">Ingen cue</span>}
      </p>
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
          <dd>
            <Breakable text={v!} />
          </dd>
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
    const first = startAt(items[0], state, new Date(now));
    let lead = "Ferdig for i dag";
    let text: React.ReactNode = "Takk for innsatsen";
    if (pos.next && now < first) {
      lead = "Før start";
      text = (
        <>
          {items[0].kind === "doors" ? "Dørene åpner " : "Første post "}
          {!isShowDay(now) && "torsdag 24. september "}
          <span className="num">{hhmm(first, true)}</span>
        </>
      );
    } else if (pos.next && pos.nextStart !== null) {
      lead = "Nå";
      text = (
        <>
          Ingen post – neste <span className="num">{hhmm(pos.nextStart, true)}</span>
        </>
      );
    }
    return (
      <section className="card now idle" aria-label="Nå">
        <p>
          <b>{lead}</b>
          <span>{text}</span>
        </p>
      </section>
    );
  }
  const end = currentStart + current.duration * 60_000;
  const left = end - now;
  const progress = Math.min(1, Math.max(0, (now - currentStart) / (current.duration * 60_000 || 1)));
  const status = left < 0 ? "over" : left < 60_000 ? "soon" : "";
  const kind = kindLabel(current);
  return (
    <section className={`card now ${status}`}>
      <div className="card-head">
        <p className="card-label">
          <b>Nå</b>
          {kind && <span>{kind}</span>}
        </p>
        <p className="range num">
          <Range from={currentStart} to={end} />
        </p>
      </div>
      <h2 className="title">{displayTitle(current.title)}</h2>
      {pos.manual && (
        <p className="sub">
          <span>
            Startet av regi <span className="num">{hhmm(currentStart, true)}</span>
          </span>
        </p>
      )}
      <p className="count">
        <span className="count-num num">{countdown(left)}</span>
        <span className="count-label">{left < 0 ? "over tid" : `igjen av ${current.duration} min`}</span>
      </p>
      <div className="bar" role="progressbar" aria-label="Fremdrift" aria-valuenow={Math.round(progress * 100)}>
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <Cues item={current} dept={dept} large />
    </section>
  );
}

function Next({ now, state, dept }: { now: number; state: ShowState; dept: Dept }) {
  const { next, nextStart, manual } = position(now, state);
  if (!next || nextStart === null) return null;
  const until = nextStart - now;
  // Regi har trykket GO og posten går over tid: neste venter på regi, ikke på klokka.
  const waiting = manual && nextStart <= now;
  const standby = waiting || until <= STANDBY_MS;
  const shownStart = waiting ? startAt(next, state, new Date(now)) : nextStart;
  const kind = kindLabel(next);
  return (
    <section className={standby ? "card next standby" : "card next"}>
      <div className="card-head">
        <p className="card-label">
          <b>{standby ? "Standby" : "Neste"}</b>
          {kind && <span>{kind}</span>}
        </p>
        {waiting ? (
          <p className="next-when wait">Venter på GO</p>
        ) : (
          <p className="next-when">
            om <span className="num">{countdown(until)}</span>
          </p>
        )}
      </div>
      <h2 className="title">{displayTitle(next.title)}</h2>
      <p className="sub">
        <span>
          {waiting && "Planlagt "}
          <span className="num">{hhmm(shownStart, true)}</span>
        </span>
        <span>{next.duration} min</span>
      </p>
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
    <section className="plan" aria-label="Kjøreplan">
      {past > 0 && (
        <button className="past-toggle" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
          <Icon name="chevron" />
          {showPast ? "Skjul ferdige poster" : `Vis ferdige poster (${past})`}
        </button>
      )}
      <ol className="timeline">
        {groups.map((g) => {
          const visible = g.items.filter((i) => showPast || !isDone(i));
          if (!visible.length) return null;
          // Ferdige poster har allerede skjedd – forsinkelse skal ikke flytte blokkens start bakover.
          const first = g.items[0];
          const from = isDone(first) ? startAt(first, { ...state, delay: {} }, day) : startAt(first, state, day);
          const to = endAt(g.items[g.items.length - 1], state, day);
          return (
            <li key={g.block + g.items[0].id} className="group">
              <div className="group-head">
                <h2>{BLOCK_LABEL[g.block]}</h2>
                <DelayTag minutes={state.delay[g.block] ?? 0} />
                <span className="group-span num">
                  <Range from={from} to={to} />
                </span>
              </div>
              <ol className="rows">
                {visible.map((i) => {
                  const start = startAt(i, state, day);
                  const done = isDone(i);
                  const isNow = i.id === currentId;
                  const cue = dept === "alle" ? null : deptCue(i, dept);
                  const quiet = dept !== "alle" && !cue && !isNow;
                  const shifted = hhmm(start, true) !== hhmm(i.start);
                  const kind = kindLabel(i);
                  // Posten regi har trykket GO på kan ikke startes på nytt herfra.
                  const canStart = onGo && state.live?.id !== i.id;
                  return (
                    <li
                      key={i.id}
                      data-id={i.id}
                      className={["item", `k-${i.kind}`, done && "done", isNow && "is-now", quiet && "quiet"]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="when num">
                        <span>{hhmm(start, true)}</span>
                        {shifted && <s>{hhmm(i.start)}</s>}
                      </div>
                      <div className="node">
                        <KindIcon kind={i.kind} />
                      </div>
                      <div className="what">
                        <p className="name">{displayTitle(i.title)}</p>
                        {(!quiet || canStart) && (
                          <div className="meta">
                            {isNow && <b>Pågår</b>}
                            {!quiet && kind && <span>{kind}</span>}
                            {!quiet && <span>{i.duration} min</span>}
                            {canStart && (
                              <button
                                className="row-go"
                                onClick={() => {
                                  if (!confirm(`Start «${i.title}» nå?`)) return;
                                  onGo(i);
                                  // På mobil: vis Nå og GO for det som kommer etter.
                                  if (matchMedia("(max-width: 1079px)").matches) scrollTo(0, 0);
                                }}
                                aria-label={`Start ${i.title} nå`}
                              >
                                <Icon name="play" />
                                Start
                              </button>
                            )}
                          </div>
                        )}
                        {dept === "alle" ? (
                          <Cues item={i} dept={dept} />
                        ) : (
                          cue && (
                            <p className="cue-one">
                              <Breakable text={cue} />
                            </p>
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
    </section>
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
  const setDelay = (d: number) => update({ ...state, delay: { ...state.delay, [block]: d } });

  return (
    <section className="card regi" aria-label="Regi">
      <div className="regi-head">
        <h2>Regi</h2>
        {mode === "local" && <span>Kun denne enheten</span>}
      </div>

      {target && (
        <button className="go" onClick={() => onGo(target)}>
          <span className="go-word">GO</span>
          <span className="go-target">
            <small>Neste</small>
            <span>{displayTitle(target.title)}</span>
          </span>
          <Icon name="play" />
        </button>
      )}

      <div className="regi-delay">
        <p className="regi-sub">Forsinkelse {BLOCK_LABEL[block].toLowerCase()}</p>
        <b className={`num ${delay > 0 ? "late" : delay < 0 ? "early" : ""}`}>{delayText(delay)}</b>
        <div className="step" role="group" aria-label="Juster forsinkelse">
          <button onClick={() => setDelay(delay - 1)}>−1</button>
          <button onClick={() => setDelay(delay + 1)}>+1</button>
          <button onClick={() => setDelay(0)} title="Nullstill">
            0
          </button>
        </div>
      </div>

      {pos.manual && (
        <button className="release" onClick={() => update({ ...state, live: null })}>
          <Icon name="undo" />
          Slipp GO – følg klokka
        </button>
      )}

      <form
        className="msg-form"
        onSubmit={(e) => {
          e.preventDefault();
          update({ ...state, message: msg.trim() });
        }}
      >
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Beskjed til crew…" maxLength={200} />
        <button type="submit" className="primary">
          Send
        </button>
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
  const { current, currentStart, next, nextStart, manual } = position(now, state);
  const left = current && currentStart !== null ? currentStart + current.duration * 60_000 - now : null;
  const tone = left === null ? "" : left < 0 ? "over" : left < 60_000 ? "soon" : left < 2 * 60_000 ? "warn" : "ok";
  const progress =
    current && currentStart !== null
      ? Math.min(1, Math.max(0, (now - currentStart) / (current.duration * 60_000 || 1)))
      : null;
  const label = left !== null ? (left < 0 ? "Over tid" : "Igjen") : nextStart ? "Til neste post" : "";
  const big = left !== null ? countdown(left) : nextStart ? countdown(nextStart - now) : "—";
  // Regi har trykket GO og posten går over tid: neste starter når regi sier fra, ikke på et klokkeslett.
  const waiting = manual && nextStart !== null && nextStart <= now;
  return (
    <main className={`stage ${tone}`} onClick={onExit} title="Trykk for å gå tilbake">
      <header className="stage-top">
        <span>Magien 2026</span>
        <span className="stage-clock num">{clockText(now)}</span>
      </header>
      <div className="stage-center">
        {label && <p className="stage-label">{label}</p>}
        <div className={big.length > 5 ? "stage-big long num" : "stage-big num"}>{big}</div>
        <p className="stage-title">
          {current ? displayTitle(current.title) : next ? `Neste: ${displayTitle(next.title)}` : "Ferdig for i dag"}
        </p>
      </div>
      <footer className="stage-bottom">
        {current && next && nextStart && (
          <p className="stage-next">
            {waiting ? (
              <span>Neste – venter på GO</span>
            ) : (
              <>
                <span>Neste</span>
                <span className="num">{hhmm(nextStart, true)}</span>
              </>
            )}
            <span className="stage-next-title">{displayTitle(next.title)}</span>
          </p>
        )}
      </footer>
      {progress !== null && (
        <div className="stage-bar">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </main>
  );
}

/* Ikoner: inline SVG, 24×24, samme strek overalt. */

type IconName =
  | Kind
  | "megaphone"
  | "expand"
  | "sliders"
  | "chevron"
  | "play"
  | "undo";

const ICONS: Record<IconName, React.ReactNode> = {
  bumper: <path d="M8.5 6.2v11.6a.7.7 0 0 0 1.1.6l8.8-5.8a.7.7 0 0 0 0-1.2L9.6 5.6a.7.7 0 0 0-1.1.6z" />,
  play: <path d="M8.5 6.2v11.6a.7.7 0 0 0 1.1.6l8.8-5.8a.7.7 0 0 0 0-1.2L9.6 5.6a.7.7 0 0 0-1.1.6z" />,
  host: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  pause: (
    <>
      <path d="M4 9.5h12v4A5.5 5.5 0 0 1 10.5 19h-1A5.5 5.5 0 0 1 4 13.5z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5V6M12 3.5V6" />
    </>
  ),
  keynote: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4M8 20h8" />
    </>
  ),
  case: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" />
    </>
  ),
  talk: (
    <>
      <path d="M14 4H5.5A2.5 2.5 0 0 0 3 6.5v4.5a2.5 2.5 0 0 0 2.5 2.5H6v3l3.5-3H14a2.5 2.5 0 0 0 2.5-2.5V6.5A2.5 2.5 0 0 0 14 4z" />
      <path d="M19.5 9.2A2.5 2.5 0 0 1 21 11.5V15a2.5 2.5 0 0 1-2.5 2.5H18v3l-3.5-3H12" />
    </>
  ),
  doors: <path d="M6 20.5v-16A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5v16M3.5 20.5h17M14.5 12h.01" />,
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21" />
    </>
  ),
  changeover: <path d="M19.5 10A8 8 0 0 0 5.6 7.2L4 9M4 4.5V9h4.5M4.5 14a8 8 0 0 0 13.9 2.8L20 15M20 19.5V15h-4.5" />,
  act: (
    <>
      <path d="M11 4.5l1.6 4.4a1 1 0 0 0 .6.6l4.3 1.5-4.3 1.5a1 1 0 0 0-.6.6L11 17.5l-1.6-4.4a1 1 0 0 0-.6-.6L4.5 11l4.3-1.5a1 1 0 0 0 .6-.6z" />
      <path d="M18.5 3v4M16.5 5h4M18 17v3M16.5 18.5h3" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10.2v3.6a1 1 0 0 0 1 1h2.2L15 19V5L7.2 9.2H5a1 1 0 0 0-1 1z" />
      <path d="M7.5 15l1 4h2.3l-.8-3.2M18.5 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
  expand: <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  chevron: <path d="M6 9l6 6 6-6" />,
  undo: <path d="M9 14L4.5 9.5 9 5M4.5 9.5H15a5 5 0 0 1 0 10h-3" />,
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={`icon icon-${name}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

function KindIcon({ kind }: { kind: Kind }) {
  return <Icon name={kind} />;
}
