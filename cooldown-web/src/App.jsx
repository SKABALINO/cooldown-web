import { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, Layers, BarChart3, Plus, Check, X, Target,
  Clock, Trash2, Pencil, Snowflake, Flame, ArrowRight, ExternalLink, LogOut,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import * as store from "./store";
import Auth from "./Auth.jsx";

const DAY = 86400000;

// ------- utils -------
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const money2 = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function suggestDays(price) {
  if (price < 25) return 1;
  if (price < 100) return 3;
  if (price < 500) return 7;
  return 30;
}
function fmtLeft(ms) {
  if (ms <= 0) return "Ready to decide";
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d >= 1) return `${d}d ${h}h left`;
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
}
function normalizeUrl(u) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}
function hostOf(u) {
  try { return new URL(normalizeUrl(u)).hostname.replace(/^www\./, ""); }
  catch { return "link"; }
}

const CATS = ["Clothes", "Tech", "Home", "Food & drink", "Beauty", "Kids", "Fun", "Other"];
const COOL_OPTS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "30 days", days: 30 },
];

// ================= AUTH GATE =================
export default function AppRoot() {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="loading">Loading…</div>;
  if (!session) return <Auth />;
  return <Cooldown key={session.user.id} />;
}

// ================= APP =================
function Cooldown() {
  const [wants, setWants] = useState(null);
  const [goal, setGoal] = useState({ name: "Savings goal", target: 500 });
  const [tab, setTab] = useState("home");
  const [now, setNow] = useState(Date.now());
  const [adding, setAdding] = useState(false);
  const [confirmBuy, setConfirmBuy] = useState(null);
  const [editGoal, setEditGoal] = useState(false);
  const loadedGoal = useRef(false);

  const reload = useCallback(async () => {
    try {
      const [w, g] = await Promise.all([store.fetchWants(), store.fetchGoal()]);
      setWants(w);
      if (!loadedGoal.current) { setGoal(g); loadedGoal.current = true; }
    } catch (e) {
      console.error(e);
      setWants([]);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Live sync: refetch when this user's wants change anywhere (e.g. the extension).
  useEffect(() => {
    const ch = supabase
      .channel("wants-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "wants" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (wants === null) return <div className="loading">Loading your shelf…</div>;

  const cooling = wants.filter((w) => w.status === "cooling");
  const ready = cooling.filter((w) => w.coolUntil <= now);
  const stillCooling = cooling.filter((w) => w.coolUntil > now);
  const letgo = wants.filter((w) => w.status === "letgo");
  const bought = wants.filter((w) => w.status === "bought");
  const saved = letgo.reduce((a, w) => a + w.price, 0);
  const spent = bought.reduce((a, w) => a + w.price, 0);
  const decisions = letgo.length + bought.length;
  const letgoRate = decisions ? Math.round((letgo.length / decisions) * 100) : 0;

  // ---- actions (optimistic UI + Supabase write) ----
  const addWant = async (w) => {
    setAdding(false);
    try {
      const created = await store.insertWant(w);
      setWants((prev) => [created, ...prev]);
    } catch (e) { console.error(e); reload(); }
  };
  const decide = async (id, status) => {
    setWants((prev) => prev.map((w) => (w.id === id ? { ...w, status, decidedAt: Date.now() } : w)));
    try { await store.updateStatus(id, status); } catch (e) { console.error(e); reload(); }
  };
  const removeWant = async (id) => {
    setWants((prev) => prev.filter((w) => w.id !== id));
    try { await store.deleteWant(id); } catch (e) { console.error(e); reload(); }
  };
  const onSaveGoal = async (g) => {
    setGoal(g);
    setEditGoal(false);
    try { await store.saveGoal(g); } catch (e) { console.error(e); }
  };

  return (
    <div style={page}>
      <Style />
      <div style={shell}>
        <header style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={logoMark}><Snowflake size={17} strokeWidth={2.4} /></div>
            <div>
              <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 19, letterSpacing: "-.02em", lineHeight: 1 }}>
                Cooldown
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, letterSpacing: ".02em" }}>
                Wait first. Buy later, if ever.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {ready.length > 0 && (
              <button style={pill} onClick={() => setTab("shelf")}>{ready.length} ready</button>
            )}
            <button style={ghostBtn} onClick={() => supabase.auth.signOut()} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main style={main}>
          {tab === "home" && (
            <HomeView
              saved={saved} goal={goal} ready={ready} stillCooling={stillCooling}
              now={now} onDecide={setConfirmBuy} onLetGo={(id) => decide(id, "letgo")}
              onEditGoal={() => setEditGoal(true)} onGoShelf={() => setTab("shelf")}
              letgo={letgo}
            />
          )}
          {tab === "shelf" && (
            <ShelfView
              ready={ready} stillCooling={stillCooling} now={now}
              onLetGo={(id) => decide(id, "letgo")} onDecide={setConfirmBuy}
              onRemove={removeWant} onAdd={() => setAdding(true)}
            />
          )}
          {tab === "insights" && (
            <InsightsView
              saved={saved} spent={spent} letgo={letgo} bought={bought}
              letgoRate={letgoRate} decisions={decisions}
            />
          )}
        </main>

        <nav style={nav}>
          <NavBtn active={tab === "home"} onClick={() => setTab("home")} icon={<Home size={20} />} label="Home" />
          <button style={fab} onClick={() => setAdding(true)} aria-label="Add a want">
            <Plus size={24} strokeWidth={2.6} />
          </button>
          <NavBtn active={tab === "shelf"} onClick={() => setTab("shelf")} icon={<Layers size={20} />} label="Shelf" badge={ready.length} />
          <NavBtn active={tab === "insights"} onClick={() => setTab("insights")} icon={<BarChart3 size={20} />} label="Insights" />
        </nav>
      </div>

      {adding && <AddSheet onClose={() => setAdding(false)} onAdd={addWant} />}
      {confirmBuy && (
        <BuySheet
          want={confirmBuy}
          onClose={() => setConfirmBuy(null)}
          onBuy={() => { decide(confirmBuy.id, "bought"); setConfirmBuy(null); }}
          onKeep={() => setConfirmBuy(null)}
        />
      )}
      {editGoal && (
        <GoalSheet
          goal={goal}
          onClose={() => setEditGoal(false)}
          onSave={onSaveGoal}
        />
      )}
    </div>
  );
}

// ---------------- HOME ----------------
function HomeView({ saved, goal, ready, stillCooling, now, onDecide, onLetGo, onEditGoal, onGoShelf, letgo }) {
  const pct = goal.target > 0 ? Math.min(100, (saved / goal.target) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={heroCard}>
        <div style={{ fontSize: 12.5, color: "var(--jade-ink)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
          Saved by waiting
        </div>
        <div style={heroNum}>{money(saved)}</div>
        <div style={{ fontSize: 13, color: "var(--jade-ink)", opacity: .85 }}>
          {letgo.length === 0
            ? "Every want you let go lands here."
            : `From ${letgo.length} thing${letgo.length > 1 ? "s" : ""} you decided you didn't need.`}
        </div>
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Target size={16} color="var(--jade)" />
            <span style={{ fontWeight: 650, fontSize: 15 }}>{goal.name}</span>
          </div>
          <button style={ghostBtn} onClick={onEditGoal}><Pencil size={14} /></button>
        </div>
        <div style={progressTrack}>
          <div style={{ ...progressFill, width: `${pct}%` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 13 }}>
          <span style={{ color: "var(--muted)" }}>{money(saved)} of {money(goal.target)}</span>
          <span style={{ fontWeight: 650, color: "var(--jade)" }}>{Math.round(pct)}%</span>
        </div>
      </section>

      {ready.length > 0 && (
        <section>
          <h3 style={sectionTitle}>Ready to decide</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ready.map((w) => (
              <WantCard key={w.id} w={w} now={now} onLetGo={onLetGo} onDecide={onDecide} />
            ))}
          </div>
        </section>
      )}

      {stillCooling.length > 0 && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={sectionTitle}>Cooling off</h3>
            <button style={linkBtn} onClick={onGoShelf}>See shelf <ArrowRight size={13} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stillCooling.slice(0, 3).map((w) => (
              <WantCard key={w.id} w={w} now={now} />
            ))}
          </div>
        </section>
      )}

      {ready.length === 0 && stillCooling.length === 0 && (
        <EmptyState onAdd={onGoShelf} />
      )}
    </div>
  );
}

// ---------------- SHELF ----------------
function ShelfView({ ready, stillCooling, now, onLetGo, onDecide, onRemove, onAdd }) {
  const has = ready.length + stillCooling.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={pageTitle}>The shelf</h2>
        <button style={smallAdd} onClick={onAdd}><Plus size={15} strokeWidth={2.6} /> Add</button>
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "-6px 0 0" }}>
        Things you want are parked here to cool. Decide once the timer's up.
      </p>

      {ready.length > 0 && (
        <section>
          <h3 style={sectionTitle}>Ready to decide</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ready.map((w) => (
              <WantCard key={w.id} w={w} now={now} onLetGo={onLetGo} onDecide={onDecide} onRemove={onRemove} />
            ))}
          </div>
        </section>
      )}
      {stillCooling.length > 0 && (
        <section>
          <h3 style={sectionTitle}>Still cooling</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stillCooling.map((w) => (
              <WantCard key={w.id} w={w} now={now} onRemove={onRemove} />
            ))}
          </div>
        </section>
      )}
      {!has && <EmptyState onAdd={onAdd} />}
    </div>
  );
}

// ---------------- INSIGHTS ----------------
function InsightsView({ saved, spent, letgo, bought, letgoRate, decisions }) {
  const byCat = {};
  letgo.forEach((w) => { byCat[w.category] = (byCat[w.category] || 0) + w.price; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 0;
  const log = [...letgo, ...bought]
    .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0))
    .slice(0, 12);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={pageTitle}>Insights</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat big label="Saved by waiting" value={money(saved)} accent="var(--jade)" />
        <Stat big label="Let-go rate" value={decisions ? letgoRate + "%" : "—"} accent="var(--jade)" />
        <Stat label="Spent after waiting" value={money(spent)} />
        <Stat label="Decisions made" value={decisions} />
      </div>

      {cats.length > 0 && (
        <section style={card}>
          <h3 style={{ ...sectionTitle, marginTop: 0 }}>Where the temptation lives</h3>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>
            Money you didn't spend, by category.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {cats.map(([c, v]) => (
              <div key={c}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span>{c}</span>
                  <span style={{ fontWeight: 650 }}>{money(v)}</span>
                </div>
                <div style={progressTrack}>
                  <div style={{ ...progressFill, width: `${(v / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 style={sectionTitle}>Recent decisions</h3>
        {log.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No decisions yet. Once an item finishes cooling, your choices show up here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {log.map((w) => (
              <div key={w.id} style={logRow}>
                <div style={{
                  ...tag,
                  background: w.status === "letgo" ? "var(--jade-soft)" : "var(--amber-soft)",
                  color: w.status === "letgo" ? "var(--jade-ink)" : "var(--amber-ink)",
                }}>
                  {w.status === "letgo" ? "Let go" : "Bought"}
                </div>
                <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {w.name}
                </span>
                <span style={{ fontWeight: 650, fontSize: 14 }}>{money2(w.price)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------- WANT CARD ----------------
function WantCard({ w, now, onLetGo, onDecide, onRemove }) {
  const isReady = w.coolUntil <= now;
  const total = w.coolUntil - w.addedAt;
  const prog = total > 0 ? Math.min(1, (now - w.addedAt) / total) : 1;
  const ring = 2 * Math.PI * 20;

  return (
    <div style={{ ...card, padding: 14, borderColor: isReady ? "var(--jade)" : "var(--line)" }}>
      <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
        <div style={{ position: "relative", width: 48, height: 48, flexShrink: 0 }}>
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="var(--line)" strokeWidth="4" />
            <circle
              cx="24" cy="24" r="20" fill="none"
              stroke={isReady ? "var(--jade)" : "var(--amber)"} strokeWidth="4"
              strokeLinecap="round" strokeDasharray={ring}
              strokeDashoffset={ring * (1 - prog)}
              transform="rotate(-90 24 24)"
              style={{ transition: "stroke-dashoffset .4s ease" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: isReady ? "var(--jade)" : "var(--amber)" }}>
            {isReady ? <Check size={19} strokeWidth={2.6} /> : <Flame size={16} />}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 650, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {w.name}
            </span>
            <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>
              {money2(w.price)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: isReady ? "var(--jade)" : "var(--muted)", fontWeight: isReady ? 650 : 400 }}>
            {!isReady && <Clock size={12} />}
            {isReady ? "Ready to decide" : fmtLeft(w.coolUntil - now)}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {w.category}</span>
          </div>
        </div>

        {onRemove && !isReady && (
          <button style={ghostBtn} onClick={() => onRemove(w.id)} aria-label="Remove"><Trash2 size={15} /></button>
        )}
      </div>

      {w.note && !isReady && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, paddingLeft: 61, fontStyle: "italic" }}>
          “{w.note}”
        </div>
      )}

      {w.link && (
        <div style={{ paddingLeft: 61, marginTop: 8 }}>
          <a href={normalizeUrl(w.link)} target="_blank" rel="noopener noreferrer" style={linkChip}>
            <ExternalLink size={13} /> {hostOf(w.link)}
          </a>
        </div>
      )}

      {isReady && onLetGo && (
        <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
          <button style={letGoBtn} onClick={() => onLetGo(w.id)}>
            <Snowflake size={15} /> Let it go · save {money2(w.price)}
          </button>
          <button style={buyBtn} onClick={() => onDecide(w)}>Still want it</button>
        </div>
      )}
    </div>
  );
}

// ---------------- ADD SHEET ----------------
function AddSheet({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState("Other");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [days, setDays] = useState(null);
  const p = parseFloat(price) || 0;
  const eff = days ?? suggestDays(p);
  const valid = name.trim() && p > 0;

  return (
    <Sheet onClose={onClose} title="Park a want">
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px" }}>
        Don't buy it yet. Put it here and let it cool — most urges fade before the timer's up.
      </p>

      <Field label="What is it?">
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standing desk mat" autoFocus />
      </Field>

      <Field label="Price">
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: 13, color: "var(--muted)", fontSize: 15 }}>$</span>
          <input style={{ ...input, paddingLeft: 28 }} value={price} inputMode="decimal"
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
        </div>
      </Field>

      <Field label="Category">
        <div style={chipWrap}>
          {CATS.map((c) => (
            <button key={c} style={cat === c ? chipOn : chip} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </Field>

      <Field label={`Cooling time${!days && p > 0 ? " (suggested for this price)" : ""}`}>
        <div style={chipWrap}>
          {COOL_OPTS.map((o) => (
            <button key={o.days} style={eff === o.days ? chipOn : chip} onClick={() => setDays(o.days)}>{o.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Link to the item (optional)">
        <input style={input} value={link} inputMode="url" autoCapitalize="off" autoCorrect="off"
          onChange={(e) => setLink(e.target.value)} placeholder="Paste the product URL" />
      </Field>

      <Field label="Why do you want it? (optional)">
        <input style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reading this later helps you decide" />
      </Field>

      <button style={{ ...primaryBtn, opacity: valid ? 1 : .45, pointerEvents: valid ? "auto" : "none", marginTop: 8 }}
        onClick={() => onAdd({ name: name.trim(), price: p, category: cat, note: note.trim(), link: link.trim(), days: eff })}>
        Put it on the shelf
      </button>
    </Sheet>
  );
}

// ---------------- BUY CONFIRM SHEET ----------------
function BuySheet({ want, onClose, onBuy, onKeep }) {
  return (
    <Sheet onClose={onClose} title="Sure about this one?">
      <div style={{ ...heroCard, background: "var(--amber-soft)", padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: "var(--amber-ink)", fontWeight: 600 }}>{want.name}</div>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 32, color: "var(--amber-ink)", lineHeight: 1.1, marginTop: 4 }}>
          {money2(want.price)}
        </div>
        {want.link && (
          <a href={normalizeUrl(want.link)} target="_blank" rel="noopener noreferrer"
            style={{ ...linkChip, color: "var(--amber-ink)", marginTop: 12 }}>
            <ExternalLink size={13} /> Take one last look at {hostOf(want.link)}
          </a>
        )}
      </div>
      <p style={{ fontSize: 14, color: "var(--ink)", margin: "0 0 6px", fontWeight: 600 }}>You waited it out. Do you still want it?</p>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 20px" }}>
        If it's still a yes after the wait, that's a considered purchase — not an impulse. Either answer is a win.
      </p>
      <button style={buyConfirm} onClick={onBuy}>Yes, I bought it</button>
      <button style={{ ...letGoBtn, width: "100%", justifyContent: "center", padding: "13px" }} onClick={onKeep}>
        <Snowflake size={15} /> Keep waiting
      </button>
    </Sheet>
  );
}

// ---------------- GOAL SHEET ----------------
function GoalSheet({ goal, onClose, onSave }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(goal.target));
  const t = parseFloat(target) || 0;
  return (
    <Sheet onClose={onClose} title="Your goal">
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px" }}>
        Give the money you save a destination — it makes waiting easier.
      </p>
      <Field label="Goal name">
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
      </Field>
      <Field label="Target amount">
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: 13, color: "var(--muted)", fontSize: 15 }}>$</span>
          <input style={{ ...input, paddingLeft: 28 }} value={target} inputMode="decimal"
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="500" />
        </div>
      </Field>
      <button style={{ ...primaryBtn, opacity: name.trim() && t > 0 ? 1 : .45, pointerEvents: name.trim() && t > 0 ? "auto" : "none" }}
        onClick={() => onSave({ name: name.trim(), target: t })}>Save goal</button>
    </Sheet>
  );
}

// ---------------- shared bits ----------------
function EmptyState({ onAdd }) {
  return (
    <div style={{ ...card, textAlign: "center", padding: "36px 20px" }}>
      <div style={{ ...logoMark, margin: "0 auto 14px", width: 44, height: 44 }}>
        <Snowflake size={22} strokeWidth={2.2} />
      </div>
      <div style={{ fontWeight: 650, fontSize: 16, marginBottom: 6 }}>Nothing cooling yet</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Next time you feel the urge to buy something, park it here instead. Come back when it's cooled.
      </p>
      <button style={{ ...primaryBtn, maxWidth: 220, margin: "0 auto" }} onClick={onAdd}>Park your first want</button>
    </div>
  );
}
function Stat({ label, value, big, accent }) {
  return (
    <div style={{ ...card, padding: "15px 16px" }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: big ? 27 : 22, marginTop: 5, color: accent || "var(--ink)", letterSpacing: "-.02em" }}>{value}</div>
    </div>
  );
}
function NavBtn({ active, onClick, icon, label, badge }) {
  return (
    <button style={{ ...navBtn, color: active ? "var(--jade)" : "var(--muted)" }} onClick={onClick}>
      <div style={{ position: "relative" }}>
        {icon}
        {badge > 0 && <span style={navBadge}>{badge}</span>}
      </div>
      <span style={{ fontSize: 10.5, fontWeight: active ? 650 : 500 }}>{label}</span>
    </button>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}
function Sheet({ onClose, title, children }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 21, margin: 0, letterSpacing: "-.02em" }}>{title}</h2>
          <button style={ghostBtn} onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------- styles ----------------
const page = { minHeight: "100vh", background: "var(--paper)", fontFamily: "var(--body)", color: "var(--ink)", display: "flex", justifyContent: "center" };
const shell = { width: "100%", maxWidth: 460, minHeight: "100vh", background: "var(--paper)", position: "relative", display: "flex", flexDirection: "column" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 18px 12px", position: "sticky", top: 0, background: "var(--paper)", zIndex: 5 };
const main = { flex: 1, padding: "6px 16px 108px", overflowY: "auto" };
const nav = { position: "sticky", bottom: 0, display: "grid", gridTemplateColumns: "1fr 1fr auto 1fr 1fr", alignItems: "center", background: "rgba(255,255,255,.92)", backdropFilter: "blur(10px)", borderTop: "1px solid var(--line)", padding: "8px 14px 12px" };
const navBtn = { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "4px 0" };
const navBadge = { position: "absolute", top: -5, right: -8, background: "var(--amber)", color: "#fff", fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 8, display: "grid", placeItems: "center", padding: "0 3px" };
const fab = { width: 52, height: 52, borderRadius: 26, background: "var(--jade)", color: "#fff", border: "none", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 6px 16px rgba(15,110,98,.35)", margin: "0 4px", marginTop: -22 };

const card = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 16 };
const heroCard = { background: "linear-gradient(150deg,var(--jade-soft),#dff2ee)", border: "1px solid var(--jade-line)", borderRadius: 18, padding: "20px 20px 18px", display: "flex", flexDirection: "column", gap: 4 };
const heroNum = { fontFamily: "var(--disp)", fontWeight: 700, fontSize: 46, letterSpacing: "-.03em", color: "var(--jade-ink)", lineHeight: 1 };

const sectionTitle = { fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: ".04em", textTransform: "uppercase", margin: "0 0 10px" };
const pageTitle = { fontFamily: "var(--disp)", fontWeight: 700, fontSize: 26, margin: 0, letterSpacing: "-.02em" };

const progressTrack = { height: 9, background: "var(--jade-line)", borderRadius: 6, overflow: "hidden" };
const progressFill = { height: "100%", background: "var(--jade)", borderRadius: 6, transition: "width .5s ease" };

const letGoBtn = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--jade)", color: "#fff", border: "none", borderRadius: 11, padding: "11px 10px", fontSize: 13, fontWeight: 650, cursor: "pointer", fontFamily: "var(--body)" };
const buyBtn = { background: "var(--surface)", color: "var(--amber-ink)", border: "1.5px solid var(--amber-line)", borderRadius: 11, padding: "11px 14px", fontSize: 13, fontWeight: 650, cursor: "pointer", fontFamily: "var(--body)", whiteSpace: "nowrap" };
const buyConfirm = { width: "100%", background: "var(--amber)", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 650, cursor: "pointer", fontFamily: "var(--body)", marginBottom: 9 };
const primaryBtn = { width: "100%", background: "var(--jade)", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 650, cursor: "pointer", fontFamily: "var(--body)" };

const pill = { background: "var(--amber)", color: "#fff", border: "none", borderRadius: 20, padding: "6px 13px", fontSize: 12.5, fontWeight: 650, cursor: "pointer" };
const smallAdd = { display: "flex", alignItems: "center", gap: 5, background: "var(--jade)", color: "#fff", border: "none", borderRadius: 20, padding: "8px 14px", fontSize: 13, fontWeight: 650, cursor: "pointer" };
const ghostBtn = { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "grid", placeItems: "center" };
const linkBtn = { display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", color: "var(--jade)", fontSize: 12.5, fontWeight: 650, cursor: "pointer" };
const linkChip = { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--jade)", fontSize: 12.5, fontWeight: 600, textDecoration: "none", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

const overlay = { position: "fixed", inset: 0, background: "rgba(20,34,32,.42)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, backdropFilter: "blur(2px)" };
const sheet = { width: "100%", maxWidth: 460, background: "var(--paper)", borderRadius: "22px 22px 0 0", padding: "20px 18px calc(24px + env(safe-area-inset-bottom))", maxHeight: "90vh", overflowY: "auto", animation: "rise .28s cubic-bezier(.2,.8,.2,1)" };
const input = { width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 11, padding: "12px 14px", fontSize: 15, fontFamily: "var(--body)", color: "var(--ink)", outline: "none" };
const chipWrap = { display: "flex", flexWrap: "wrap", gap: 8 };
const chip = { background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 20, padding: "8px 14px", fontSize: 13, cursor: "pointer", color: "var(--ink)", fontFamily: "var(--body)" };
const chipOn = { ...chip, background: "var(--jade)", borderColor: "var(--jade)", color: "#fff", fontWeight: 600 };

const logoMark = { width: 34, height: 34, borderRadius: 10, background: "var(--jade)", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 };
const logRow = { display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "11px 13px" };
const tag = { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 7, whiteSpace: "nowrap" };

function Style() {
  return (
    <style>{`
      *{-webkit-tap-highlight-color:transparent;}
      button{font-family:var(--body);}
      input:focus{border-color:var(--jade)!important;}
      @keyframes rise{from{transform:translateY(100%);}to{transform:translateY(0);}}
      ::-webkit-scrollbar{width:0;}
      @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}
    `}</style>
  );
}
