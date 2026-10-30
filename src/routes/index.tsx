import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import SolarScene, { type SimState } from "@/components/SolarScene";
import { BODIES, COMPARE_PARAMS, filterBodies, getBody, type Body } from "@/lib/planets";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Orrery — 3D Solar System Explorer" },
      { name: "description", content: "Explore, analyse and compare planets in an interactive 3D solar system." },
      { property: "og:title", content: "Orrery — 3D Solar System Explorer" },
      { property: "og:description", content: "Explore, analyse and compare planets in an interactive 3D solar system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Explorer,
});

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const TYPES = ["All", "Star", "Terrestrial", "Gas Giant", "Ice Giant"];
const SPEEDS = [1, 10, 30, 100, 365];

function Explorer() {
  const sim = useRef<SimState>({ days: 0, paused: false, speed: 30, positions: {} });
  const [selectedId, setSelectedId] = useState<string | null>("earth");
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [resetKey, setResetKey] = useState(0);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [cmpA, setCmpA] = useState("earth");
  const [cmpB, setCmpB] = useState("mars");
  const [days, setDays] = useState(0);

  useEffect(() => { sim.current.paused = paused; }, [paused]);
  useEffect(() => { sim.current.speed = speed; }, [speed]);
  useEffect(() => {
    const t = setInterval(() => setDays(sim.current.days), 250);
    return () => clearInterval(t);
  }, []);

  const results = filterBodies(query, type);
  const sel = selectedId ? getBody(selectedId) : null;

  const select = (id: string) => {
    setSelectedId(id);
    if (id !== "sun" && id !== cmpA && id !== cmpB) setCmpB(id);
  };

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <SolarScene sim={sim} selectedId={selectedId} onSelect={select} resetKey={resetKey} />

      {/* Header + controls */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="panel pointer-events-auto px-4 py-3">
          <h1 className="font-display text-xl tracking-tight">ORRERY</h1>
          <p className="font-mono text-xs text-muted-foreground">Day {fmt(Math.floor(days))} · {(days / 365.25).toFixed(1)} yrs</p>
        </div>
        <div className="panel pointer-events-auto flex flex-wrap items-center gap-2 px-3 py-2">
          <button className="btn btn-primary" onClick={() => setPaused((p) => !p)}>{paused ? "▶ Resume" : "❚❚ Pause"}</button>
          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? "chip chip-on" : "chip"} onClick={() => setSpeed(s)}>{s}d/s</button>
            ))}
          </div>
          <input aria-label="Animation speed" type="range" min={1} max={500} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="w-24 accent-primary" />
          <button className="btn" onClick={() => { setSelectedId(null); setResetKey((k) => k + 1); }}>⟲ Reset view</button>
        </div>
      </header>

      {/* Search */}
      <aside className="panel absolute left-4 top-28 w-64 p-3">
        <input className="field" placeholder="Search bodies…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-1">
          {TYPES.map((t) => <button key={t} className={t === type ? "chip chip-on" : "chip"} onClick={() => setType(t)}>{t}</button>)}
        </div>
        <ul className="mt-2 max-h-[38vh] overflow-auto">
          {results.map((b) => (
            <li key={b.id}>
              <button onClick={() => select(b.id)} className={b.id === selectedId ? "row row-on" : "row"}>
                <span className="dot" style={{ background: b.color }} />
                <span className="flex-1 text-left">{b.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{b.type}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="px-2 py-3 text-sm text-muted-foreground">No matches.</li>}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">Drag to rotate · scroll to zoom · click a planet</p>
      </aside>

      {/* Info */}
      {sel && (
        <aside className="panel absolute right-4 top-28 w-72 p-4">
          <div className="flex items-center gap-2">
            <span className="dot h-3 w-3" style={{ background: sel.color }} />
            <h2 className="font-display text-2xl">{sel.name}</h2>
          </div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">{sel.type}</p>
          <p className="mt-2 text-sm text-muted-foreground">{sel.blurb}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <Stat k="Diameter" v={`${fmt(sel.diameterKm)} km`} />
            <Stat k="From Sun" v={sel.distanceMkm ? `${fmt(sel.distanceMkm)} M km` : "—"} />
            <Stat k="Orbital period" v={sel.orbitalPeriodDays ? `${fmt(sel.orbitalPeriodDays)} d` : "—"} />
            <Stat k="Day length" v={`${fmt(sel.dayLengthHours)} h`} />
            <Stat k="Mass" v={`${fmt(sel.massEarths)} × ⊕`} />
            <Stat k="Moons" v={String(sel.moons)} />
          </dl>
          {sel.orbitalPeriodDays > 0 && (
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              Orbits completed: {fmt(days / sel.orbitalPeriodDays)}
            </p>
          )}
        </aside>
      )}

      <Compare a={getBody(cmpA)} b={getBody(cmpB)} setA={(id) => { setCmpA(id); setSelectedId(id); }} setB={(id) => { setCmpB(id); setSelectedId(id); }} />
    </main>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="font-mono text-sm">{v}</dd>
    </div>
  );
}

function Compare({ a, b, setA, setB }: { a: Body; b: Body; setA: (id: string) => void; setB: (id: string) => void }) {
  const planets = BODIES.filter((x) => x.type !== "Star");
  return (
    <section className="panel absolute bottom-4 left-1/2 w-[min(760px,calc(100%-2rem))] -translate-x-1/2 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-sm uppercase tracking-widest">Compare</h3>
        <select aria-label="Planet A" className="field w-auto" value={a.id} onChange={(e) => setA(e.target.value)}>
          {planets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-muted-foreground">vs</span>
        <select aria-label="Planet B" className="field w-auto" value={b.id} onChange={(e) => setB(e.target.value)}>
          {planets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="ml-auto flex gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="bar-a h-2 w-4 rounded-sm" />{a.name}</span>
          <span className="flex items-center gap-1"><span className="bar-b h-2 w-4 rounded-sm" />{b.name}</span>
        </span>
      </div>
      <div className="grid gap-2">
        {COMPARE_PARAMS.map((p) => {
          const va = a[p.key], vb = b[p.key];
          const max = Math.max(va, vb) || 1;
          return (
            <div key={p.key} className="grid grid-cols-[110px_1fr] items-center gap-3 text-xs">
              <span className="text-muted-foreground">{p.label}</span>
              <div className="grid gap-1">
                <Bar cls="bar-a" pct={(va / max) * 100} label={`${fmt(va)} ${p.unit}`} />
                <Bar cls="bar-b" pct={(vb / max) * 100} label={`${fmt(vb)} ${p.unit}`} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Bar({ cls, pct, label }: { cls: string; pct: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`${cls} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <span className="w-28 text-right font-mono">{label}</span>
    </div>
  );
}
