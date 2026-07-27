import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import {
  Home, Layers, BarChart3, Plus, Check, X, Target,
  Clock, Trash2, Pencil, Snowflake, Flame, ArrowRight, ExternalLink, LogOut,
  History, Undo2, TimerReset, Image as ImageIcon, Search, Settings2, Compass,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import * as store from "./store";
import Auth from "./Auth.jsx";
import SettingsSheet from "./SettingsSheet.jsx";
import RegistryPage from "./pages/RegistryPage.jsx";
import { SharedShelfByToken, SharedShelfByUsername } from "./pages/SharedShelfPage.jsx";

const DAY = 86400000;

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
function fmtDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CATS = ["Clothes", "Tech", "Home", "Food & drink", "Beauty", "Kids", "Fun", "Other"];
const COOL_OPTS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "30 days", days: 30 },
];
const EXTEND_OPTS = [
  { label: "+1 day", days: 1 },
  { label: "+3 days", days: 3 },
  { label: "+1 week", days: 7 },
];

// ================= ROUTER =================
export default function AppRoot() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/registry" element={<RegistryPage />} />
        <Route path="/u/:username" element={<SharedShelfByUsername />} />
        <Route path="/s/:token" element={<SharedShelfByToken />} />
        <Route path="/*" element={<AppHome />} />
      </Routes>
    </BrowserRouter>
  );
}

function AppHome() {
  const [session, setSession] = useState(undefined);

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
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("home");
  const [now, setNow] = useState(Date.now());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmBuy, setConfirmBuy] = useState(null);
  const [editGoal, setEditGoal] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState("");
  const loadedGoal = useRef(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [w, g] = await Promise.all([store.fetchWants(), store.fetchGoal()]);
      setWants(w);
      if (!loadedGoal.current) { setGoal(g); loadedGoal.current = true; }
    } catch (e) {
      console.error(e);
      setWants((prev) => prev ?? []);
    }
    try {
      const p = await store.ensureProfile();
      setProfile(p);
    } catch (e) {
      console.error(e);
      setProfile((prev) => prev ?? {
        displayName: "",
        username: "",
        bio: "",
        visibility: store.VISIBILITY.private,
        shareToken: "",
      });
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

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

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (wants === null) return <div className="loading">Loading your shelf…</div>;

  const cooling = wants.filter((w) => w.status === "cooling");
  const ready = cooling.filter((w) => w.coolUntil <= now);
  const stillCooling = cooling.filter((w) => w.coolUntil > now);
  const letgo = wants.filter((w) => w.status === "letgo");
  const bought = wants.filter((w) => w.status === "bought");
  const decided = [...letgo, ...bought].sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));
  const saved = letgo.reduce((a, w) => a + w.price, 0);
  const spent = bought.reduce((a, w) => a + w.price, 0);
  const decisions = letgo.length + bought.length;
  const letgoRate = decisions ? Math.round((letgo.length / decisions) * 100) : 0;

  const patchLocal = (id, patch) => setWants((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const addWant = async (w) => {
    setAdding(false);
    try {
      const created = await store.insertWant(w);
      setWants((prev) => [created, ...prev]);
      showToast("Parked on the shelf");
      setTab("shelf");
    } catch (e) { console.error(e); reload(); }
  };

  const saveEdit = async (id, fields) => {
    setEditing(null);
    try {
      const updated = await store.updateWant(id, fields);
      setWants((prev) => prev.map((w) => (w.id === id ? updated : w)));
      showToast("Want updated");
    } catch (e) { console.error(e); reload(); }
  };

  const decide = async (id, status) => {
    const want = wants.find((w) => w.id === id);
    patchLocal(id, { status, decidedAt: Date.now() });
    try {
      await store.updateStatus(id, status);
      if (status === "letgo" && want) showToast(`Saved ${money2(want.price)}`);
      else if (status === "bought") showToast("Marked as bought");
    } catch (e) { console.error(e); reload(); }
  };

  const extend = async (id, days) => {
    try {
      const updated = await store.extendCool(id, days);
      setWants((prev) => prev.map((w) => (w.id === id ? updated : w)));
      showToast(`Extended by ${days} day${days > 1 ? "s" : ""}`);
    } catch (e) { console.error(e); reload(); }
  };

  const undo = async (id) => {
    try {
      const updated = await store.undoDecision(id);
      setWants((prev) => prev.map((w) => (w.id === id ? updated : w)));
      showToast("Back on the shelf");
      setTab("shelf");
    } catch (e) { console.error(e); reload(); }
  };

  const removeWant = async (id) => {
    setWants((prev) => prev.filter((w) => w.id !== id));
    try { await store.deleteWant(id); showToast("Removed"); }
    catch (e) { console.error(e); reload(); }
  };

  const onSaveGoal = async (g) => {
    setGoal(g);
    setEditGoal(false);
    try { await store.saveGoal(g); showToast("Goal saved"); }
    catch (e) { console.error(e); }
  };

  return (
    <div className="app-page">
      <div className="app-shell">
        <header className="app-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="logo-mark"><Snowflake size={18} strokeWidth={2.4} /></div>
            <div>
              <div className="brand-name">Cooldown</div>
              <div className="brand-sub">Wait first. Buy later, if ever.</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {ready.length > 0 && (
              <button className="btn-pill" onClick={() => setTab("shelf")}>{ready.length} ready</button>
            )}
            <Link to="/registry" className="btn-ghost" aria-label="Registry" title="Public registry">
              <Compass size={17} />
            </Link>
            <button className="btn-ghost" onClick={() => setSettingsOpen(true)} aria-label="Shelf settings" title="Shelf settings">
              <Settings2 size={17} />
            </button>
            <button className="btn-ghost" onClick={() => supabase.auth.signOut()} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="app-main">
          {tab === "home" && (
            <HomeView
              saved={saved} goal={goal} ready={ready} stillCooling={stillCooling}
              now={now} onDecide={setConfirmBuy} onLetGo={(id) => decide(id, "letgo")}
              onEditGoal={() => setEditGoal(true)} onGoShelf={() => setTab("shelf")}
              onAdd={() => setAdding(true)} onEdit={setEditing} onExtend={extend}
              letgo={letgo}
            />
          )}
          {tab === "shelf" && (
            <ShelfView
              ready={ready} stillCooling={stillCooling} now={now}
              onLetGo={(id) => decide(id, "letgo")} onDecide={setConfirmBuy}
              onRemove={removeWant} onAdd={() => setAdding(true)}
              onEdit={setEditing} onExtend={extend}
            />
          )}
          {tab === "history" && (
            <HistoryView
              decided={decided}
              onUndo={undo}
              onRemove={removeWant}
            />
          )}
          {tab === "insights" && (
            <InsightsView
              saved={saved} spent={spent} letgo={letgo} bought={bought}
              letgoRate={letgoRate} decisions={decisions} coolingCount={cooling.length}
            />
          )}
        </main>

        <nav className="app-nav">
          <NavBtn active={tab === "home"} onClick={() => setTab("home")} icon={<Home size={20} />} label="Home" />
          <NavBtn active={tab === "shelf"} onClick={() => setTab("shelf")} icon={<Layers size={20} />} label="Shelf" badge={ready.length} />
          <button className="fab" onClick={() => setAdding(true)} aria-label="Add a want">
            <Plus size={24} strokeWidth={2.6} />
          </button>
          <NavBtn active={tab === "history"} onClick={() => setTab("history")} icon={<History size={20} />} label="History" />
          <NavBtn active={tab === "insights"} onClick={() => setTab("insights")} icon={<BarChart3 size={20} />} label="Insights" />
        </nav>
      </div>

      {adding && <WantSheet mode="add" onClose={() => setAdding(false)} onSubmit={addWant} />}
      {editing && (
        <WantSheet
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(fields) => saveEdit(editing.id, fields)}
        />
      )}
      {confirmBuy && (
        <BuySheet
          want={confirmBuy}
          onClose={() => setConfirmBuy(null)}
          onBuy={() => { decide(confirmBuy.id, "bought"); setConfirmBuy(null); }}
          onKeep={() => setConfirmBuy(null)}
          onExtend={(days) => { extend(confirmBuy.id, days); setConfirmBuy(null); }}
        />
      )}
      {editGoal && (
        <GoalSheet goal={goal} onClose={() => setEditGoal(false)} onSave={onSaveGoal} />
      )}
      {settingsOpen && profile && (
        <SettingsSheet
          profile={profile}
          onClose={() => setSettingsOpen(false)}
          onSaved={(p) => { setProfile(p); showToast("Shelf settings saved"); }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---------------- HOME ----------------
function HomeView({ saved, goal, ready, stillCooling, now, onDecide, onLetGo, onEditGoal, onGoShelf, onAdd, onEdit, onExtend, letgo }) {
  const pct = goal.target > 0 ? Math.min(100, (saved / goal.target) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="hero-card">
        <div style={{ fontSize: 12.5, color: "var(--jade-ink)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
          Saved by waiting
        </div>
        <div className="hero-num">{money(saved)}</div>
        <div style={{ fontSize: 13.5, color: "var(--jade-ink)", opacity: .88, lineHeight: 1.4 }}>
          {letgo.length === 0
            ? "Every want you let go lands here."
            : `From ${letgo.length} thing${letgo.length > 1 ? "s" : ""} you decided you didn't need.`}
        </div>
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Target size={16} color="var(--jade)" />
            <span style={{ fontWeight: 700, fontSize: 15 }}>{goal.name}</span>
          </div>
          <button className="btn-ghost" onClick={onEditGoal} aria-label="Edit goal"><Pencil size={14} /></button>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 13 }}>
          <span style={{ color: "var(--muted)" }}>{money(saved)} of {money(goal.target)}</span>
          <span style={{ fontWeight: 700, color: "var(--jade)" }}>{Math.round(pct)}%</span>
        </div>
      </section>

      {ready.length > 0 && (
        <section>
          <h3 className="section-title">Ready to decide</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ready.map((w) => (
              <WantCard key={w.id} w={w} now={now} onLetGo={onLetGo} onDecide={onDecide} onEdit={onEdit} onExtend={onExtend} />
            ))}
          </div>
        </section>
      )}

      {stillCooling.length > 0 && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 className="section-title">Cooling off</h3>
            <button className="btn-link" onClick={onGoShelf}>See shelf <ArrowRight size={13} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stillCooling.slice(0, 3).map((w) => (
              <WantCard key={w.id} w={w} now={now} onEdit={onEdit} onExtend={onExtend} />
            ))}
          </div>
        </section>
      )}

      {ready.length === 0 && stillCooling.length === 0 && (
        <EmptyState onAdd={onAdd} />
      )}
    </div>
  );
}

// ---------------- SHELF ----------------
function ShelfView({ ready, stillCooling, now, onLetGo, onDecide, onRemove, onAdd, onEdit, onExtend }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const all = [...ready, ...stillCooling];
  const cats = [...new Set(all.map((w) => w.category))];

  const matchQuery = (w) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [w.name, w.category, w.note, w.link].join(" ").toLowerCase().includes(q);
  };

  let listReady = ready.filter(matchQuery);
  let listCooling = stillCooling.filter(matchQuery);
  if (filter === "ready") listCooling = [];
  else if (filter === "cooling") listReady = [];
  else if (filter !== "all") {
    listReady = listReady.filter((w) => w.category === filter);
    listCooling = listCooling.filter((w) => w.category === filter);
  }

  const has = listReady.length + listCooling.length > 0;
  const hasAny = all.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="page-title">The shelf</h2>
        <button className="btn-small-add" onClick={onAdd}><Plus size={15} strokeWidth={2.6} /> Add</button>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "-4px 0 0", lineHeight: 1.45 }}>
        Things you want are parked here to cool. Decide once the timer's up — or extend if you're still unsure.
      </p>

      {hasAny && (
        <>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--muted)" }} />
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the shelf"
            />
          </div>
          <div className="filter-bar">
            {[
              { id: "all", label: "All" },
              { id: "ready", label: "Ready" },
              { id: "cooling", label: "Cooling" },
              ...cats.map((c) => ({ id: c, label: c })),
            ].map((f) => (
              <button
                key={f.id}
                className={`filter-chip${filter === f.id ? " on" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      {listReady.length > 0 && (
        <section>
          <h3 className="section-title">Ready to decide</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {listReady.map((w) => (
              <WantCard key={w.id} w={w} now={now} onLetGo={onLetGo} onDecide={onDecide}
                onRemove={onRemove} onEdit={onEdit} onExtend={onExtend} />
            ))}
          </div>
        </section>
      )}
      {listCooling.length > 0 && (
        <section>
          <h3 className="section-title">Still cooling</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {listCooling.map((w) => (
              <WantCard key={w.id} w={w} now={now} onRemove={onRemove} onEdit={onEdit} onExtend={onExtend} />
            ))}
          </div>
        </section>
      )}
      {!has && hasAny && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
          No items match that filter.
        </div>
      )}
      {!hasAny && <EmptyState onAdd={onAdd} />}
    </div>
  );
}

// ---------------- HISTORY ----------------
function HistoryView({ decided, onUndo, onRemove }) {
  const [filter, setFilter] = useState("all");
  const list = decided.filter((w) => filter === "all" || w.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 className="page-title">History</h2>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "-4px 0 0", lineHeight: 1.45 }}>
        Past decisions stay here. Undo anything you want back on the shelf.
      </p>

      {decided.length > 0 && (
        <div className="filter-bar">
          {[
            { id: "all", label: "All" },
            { id: "letgo", label: "Let go" },
            { id: "bought", label: "Bought" },
          ].map((f) => (
            <button
              key={f.id}
              className={`filter-chip${filter === f.id ? " on" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "32px 18px" }}>
          <div className="logo-mark" style={{ margin: "0 auto 12px", width: 42, height: 42 }}>
            <History size={20} />
          </div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No decisions yet</div>
          <p style={{ fontSize: 13.5, color: "var(--muted)", margin: 0, lineHeight: 1.45 }}>
            When a timer ends and you let go or buy, it shows up here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((w) => (
            <div key={w.id} className="log-row" style={{ alignItems: "flex-start" }}>
              {w.image ? (
                <img src={w.image} alt="" className="want-thumb" />
              ) : (
                <div
                  className="tag"
                  style={{
                    background: w.status === "letgo" ? "var(--jade-soft)" : "var(--amber-soft)",
                    color: w.status === "letgo" ? "var(--jade-ink)" : "var(--amber-ink)",
                    marginTop: 2,
                  }}
                >
                  {w.status === "letgo" ? "Let go" : "Bought"}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {w.name}
                  </span>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>
                    {money2(w.price)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {w.status === "letgo" ? "Let go" : "Bought"} · {w.category}
                  {w.decidedAt ? ` · ${fmtDate(w.decidedAt)}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button className="btn-buy" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => onUndo(w.id)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Undo2 size={13} /> Undo</span>
                  </button>
                  <button className="btn-ghost" onClick={() => onRemove(w.id)} aria-label="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- INSIGHTS ----------------
function InsightsView({ saved, spent, letgo, bought, letgoRate, decisions, coolingCount }) {
  const byCat = {};
  letgo.forEach((w) => { byCat[w.category] = (byCat[w.category] || 0) + w.price; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 0;
  const log = [...letgo, ...bought]
    .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0))
    .slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 className="page-title">Insights</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat big label="Saved by waiting" value={money(saved)} accent="var(--jade)" />
        <Stat big label="Let-go rate" value={decisions ? letgoRate + "%" : "—"} accent="var(--jade)" />
        <Stat label="Spent after waiting" value={money(spent)} />
        <Stat label="On the shelf" value={coolingCount} />
      </div>

      {cats.length > 0 && (
        <section className="card">
          <h3 className="section-title" style={{ marginTop: 0 }}>Where the temptation lives</h3>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>
            Money you didn't spend, by category.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {cats.map(([c, v]) => (
              <div key={c}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                  <span>{c}</span>
                  <span style={{ fontWeight: 700 }}>{money(v)}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(v / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="section-title">Recent decisions</h3>
        {log.length === 0 ? (
          <div className="card" style={{ textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
            No decisions yet. Once an item finishes cooling, your choices show up here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {log.map((w) => (
              <div key={w.id} className="log-row">
                <div
                  className="tag"
                  style={{
                    background: w.status === "letgo" ? "var(--jade-soft)" : "var(--amber-soft)",
                    color: w.status === "letgo" ? "var(--jade-ink)" : "var(--amber-ink)",
                  }}
                >
                  {w.status === "letgo" ? "Let go" : "Bought"}
                </div>
                <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {w.name}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{money2(w.price)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------- WANT CARD ----------------
function WantCard({ w, now, onLetGo, onDecide, onRemove, onEdit, onExtend }) {
  const isReady = w.coolUntil <= now;
  const total = w.coolUntil - w.addedAt;
  const prog = total > 0 ? Math.min(1, (now - w.addedAt) / total) : 1;
  const ring = 2 * Math.PI * 20;

  return (
    <div className="card" style={{ padding: 14, borderColor: isReady ? "var(--jade)" : "var(--line)" }}>
      <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
        {w.image ? (
          <img src={w.image} alt="" className="want-thumb" />
        ) : (
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
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {w.name}
            </span>
            <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>
              {money2(w.price)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: isReady ? "var(--jade)" : "var(--muted)", fontWeight: isReady ? 700 : 500 }}>
            {!isReady && <Clock size={12} />}
            {isReady ? "Ready to decide" : fmtLeft(w.coolUntil - now)}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {w.category}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {onEdit && (
            <button className="btn-ghost" onClick={() => onEdit(w)} aria-label="Edit"><Pencil size={15} /></button>
          )}
          {onRemove && !isReady && (
            <button className="btn-ghost" onClick={() => onRemove(w.id)} aria-label="Remove"><Trash2 size={15} /></button>
          )}
        </div>
      </div>

      {w.note && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, paddingLeft: 61, fontStyle: "italic" }}>
          “{w.note}”
        </div>
      )}

      {w.link && (
        <div style={{ paddingLeft: 61, marginTop: 8 }}>
          <a href={normalizeUrl(w.link)} target="_blank" rel="noopener noreferrer" className="link-chip">
            <ExternalLink size={13} /> {hostOf(w.link)}
          </a>
        </div>
      )}

      {isReady && onLetGo && (
        <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
          <button className="btn-letgo" onClick={() => onLetGo(w.id)}>
            <Snowflake size={15} /> Let it go · save {money2(w.price)}
          </button>
          <button className="btn-buy" onClick={() => onDecide(w)}>Still want it</button>
        </div>
      )}

      {!isReady && onExtend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, paddingLeft: 61 }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)", alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <TimerReset size={12} /> Extend
          </span>
          {EXTEND_OPTS.map((o) => (
            <button key={o.days} className="filter-chip" onClick={() => onExtend(w.id, o.days)}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- ADD / EDIT SHEET ----------------
function WantSheet({ mode, initial, onClose, onSubmit }) {
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [cat, setCat] = useState(initial?.category || "Other");
  const [note, setNote] = useState(initial?.note || "");
  const [link, setLink] = useState(initial?.link || "");
  const [image, setImage] = useState(initial?.image || "");
  const [days, setDays] = useState(null);
  const p = parseFloat(price) || 0;
  const suggested = suggestDays(p);
  const eff = days ?? (mode === "edit" && initial
    ? Math.max(1, Math.round((initial.coolUntil - initial.addedAt) / DAY))
    : suggested);
  const valid = name.trim() && p > 0;

  return (
    <Sheet onClose={onClose} title={mode === "edit" ? "Edit want" : "Park a want"}>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.45 }}>
        {mode === "edit"
          ? "Tweak the details or reset the cooling time."
          : "Don't buy it yet. Put it here and let it cool — most urges fade before the timer's up."}
      </p>

      <Field label="What is it?">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standing desk mat" autoFocus />
      </Field>

      <Field label="Price">
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: 13, color: "var(--muted)", fontSize: 15 }}>$</span>
          <input className="input" style={{ paddingLeft: 28 }} value={price} inputMode="decimal"
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
        </div>
      </Field>

      <Field label="Category">
        <div className="chip-wrap">
          {CATS.map((c) => (
            <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </Field>

      <Field label={`Cooling time${mode === "add" && !days && p > 0 ? " (suggested for this price)" : ""}`}>
        <div className="chip-wrap">
          {COOL_OPTS.map((o) => (
            <button key={o.days} className={`chip${eff === o.days ? " on" : ""}`} onClick={() => setDays(o.days)}>{o.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Link to the item (optional)">
        <input className="input" value={link} inputMode="url" autoCapitalize="off" autoCorrect="off"
          onChange={(e) => setLink(e.target.value)} placeholder="Paste the product URL" />
      </Field>

      <Field label="Image URL (optional)">
        <div style={{ position: "relative" }}>
          <ImageIcon size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--muted)" }} />
          <input className="input" style={{ paddingLeft: 34 }} value={image} inputMode="url"
            autoCapitalize="off" autoCorrect="off"
            onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
        </div>
      </Field>

      <Field label="Why do you want it? (optional)">
        <textarea
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reading this later helps you decide"
          style={{ resize: "vertical", minHeight: 64 }}
        />
      </Field>

      <button
        className="btn-primary"
        style={{ opacity: valid ? 1 : .45, pointerEvents: valid ? "auto" : "none", marginTop: 8 }}
        onClick={() => onSubmit({
          name: name.trim(),
          price: p,
          category: cat,
          note: note.trim(),
          link: link.trim(),
          image: image.trim(),
          days: eff,
        })}
      >
        {mode === "edit" ? "Save changes" : "Put it on the shelf"}
      </button>
    </Sheet>
  );
}

// ---------------- BUY CONFIRM SHEET ----------------
function BuySheet({ want, onClose, onBuy, onKeep, onExtend }) {
  return (
    <Sheet onClose={onClose} title="Sure about this one?">
      <div className="hero-card" style={{ background: "linear-gradient(145deg, var(--amber-soft), #f3d7b4)", borderColor: "var(--amber-line)", padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {want.image && <img src={want.image} alt="" className="want-thumb" style={{ width: 56, height: 56 }} />}
          <div>
            <div style={{ fontSize: 13, color: "var(--amber-ink)", fontWeight: 700 }}>{want.name}</div>
            <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 32, color: "var(--amber-ink)", lineHeight: 1.1, marginTop: 4 }}>
              {money2(want.price)}
            </div>
          </div>
        </div>
        {want.note && (
          <div style={{ fontSize: 13, color: "var(--amber-ink)", marginTop: 12, fontStyle: "italic", opacity: .9 }}>
            You wrote: “{want.note}”
          </div>
        )}
        {want.link && (
          <a href={normalizeUrl(want.link)} target="_blank" rel="noopener noreferrer"
            className="link-chip" style={{ color: "var(--amber-ink)", marginTop: 12 }}>
            <ExternalLink size={13} /> Take one last look at {hostOf(want.link)}
          </a>
        )}
      </div>
      <p style={{ fontSize: 14, color: "var(--ink)", margin: "0 0 6px", fontWeight: 700 }}>You waited it out. Do you still want it?</p>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.45 }}>
        If it's still a yes after the wait, that's a considered purchase — not an impulse. Either answer is a win.
      </p>
      <button className="btn-buy-confirm" onClick={onBuy}>Yes, I bought it</button>
      <button className="btn-letgo" style={{ width: "100%", justifyContent: "center", padding: "13px", marginBottom: 10 }} onClick={onKeep}>
        <Snowflake size={15} /> Keep waiting
      </button>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
        {EXTEND_OPTS.map((o) => (
          <button key={o.days} className="filter-chip" onClick={() => onExtend(o.days)}>{o.label}</button>
        ))}
      </div>
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
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.45 }}>
        Give the money you save a destination — it makes waiting easier.
      </p>
      <Field label="Goal name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
      </Field>
      <Field label="Target amount">
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: 13, color: "var(--muted)", fontSize: 15 }}>$</span>
          <input className="input" style={{ paddingLeft: 28 }} value={target} inputMode="decimal"
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="500" />
        </div>
      </Field>
      <button
        className="btn-primary"
        style={{ opacity: name.trim() && t > 0 ? 1 : .45, pointerEvents: name.trim() && t > 0 ? "auto" : "none" }}
        onClick={() => onSave({ name: name.trim(), target: t })}
      >
        Save goal
      </button>
    </Sheet>
  );
}

// ---------------- shared bits ----------------
function EmptyState({ onAdd }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
      <div className="logo-mark" style={{ margin: "0 auto 14px", width: 46, height: 46 }}>
        <Snowflake size={22} strokeWidth={2.2} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Nothing cooling yet</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Next time you feel the urge to buy something, park it here instead. Come back when it's cooled.
      </p>
      <button className="btn-primary" style={{ maxWidth: 220, margin: "0 auto" }} onClick={onAdd}>
        Park your first want
      </button>
    </div>
  );
}

function Stat({ label, value, big, accent }) {
  return (
    <div className="card" style={{ padding: "15px 16px" }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</div>
      <div style={{
        fontFamily: "var(--disp)", fontWeight: 800, fontSize: big ? 27 : 22, marginTop: 5,
        color: accent || "var(--ink)", letterSpacing: "-.02em",
      }}>
        {value}
      </div>
    </div>
  );
}

function NavBtn({ active, onClick, icon, label, badge }) {
  return (
    <button className={`nav-btn${active ? " active" : ""}`} onClick={onClick}>
      <div style={{ position: "relative" }}>
        {icon}
        {badge > 0 && <span className="nav-badge">{badge}</span>}
      </div>
      <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

function Sheet({ onClose, title, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-.02em" }}>{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
