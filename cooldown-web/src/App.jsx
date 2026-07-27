import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import {
  Home, Layers, BarChart3, Plus, Check, X, Target,
  Clock, Trash2, Pencil, Snowflake, Flame, ArrowRight, ExternalLink, LogOut,
  History, Undo2, TimerReset, Search, Settings2, Compass, Star, Gift, Link as LinkIcon,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import * as store from "./store";
import Auth from "./Auth.jsx";
import SettingsSheet from "./SettingsSheet.jsx";
import AddItemFlow from "./AddItemFlow.jsx";
import RegistryPage from "./pages/RegistryPage.jsx";
import {
  SharedShelfByToken,
  SharedShelfByUsername,
  SharedShelfById,
} from "./pages/SharedShelfPage.jsx";

const DAY = 86400000;
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const money2 = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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

const EXTEND_OPTS = [
  { label: "+1 day", days: 1 },
  { label: "+3 days", days: 3 },
  { label: "+1 week", days: 7 },
];

export default function AppRoot() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/registry" element={<RegistryPage />} />
        <Route path="/u/:username" element={<SharedShelfByUsername />} />
        <Route path="/s/:token" element={<SharedShelfByToken />} />
        <Route path="/shelf/:shelfId" element={<SharedShelfById />} />
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

function Cooldown() {
  const [wants, setWants] = useState(null);
  const [shelves, setShelves] = useState([]);
  const [activeShelfId, setActiveShelfId] = useState("");
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
      const [w, g, shelfList] = await Promise.all([
        store.fetchWants(),
        store.fetchGoal(),
        store.ensureDefaultShelf(),
      ]);
      setWants(w);
      setShelves(shelfList);
      setActiveShelfId((prev) => prev && shelfList.some((s) => s.id === prev) ? prev : shelfList[0]?.id || "");
      if (!loadedGoal.current) { setGoal(g); loadedGoal.current = true; }
    } catch (e) {
      console.error(e);
      setWants((prev) => prev ?? []);
    }
    try {
      setProfile(await store.ensureProfile());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const ch = supabase
      .channel("wants-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "wants" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "shelves" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (wants === null) return <div className="loading">Loading your shelves…</div>;

  const activeShelf = shelves.find((s) => s.id === activeShelfId) || shelves[0];
  const shelfWants = wants.filter((w) => !activeShelf || w.shelfId === activeShelf.id || (!w.shelfId && shelves[0]?.id === activeShelf?.id));
  const cooling = shelfWants.filter((w) => w.status === "cooling");
  const ready = cooling.filter((w) => w.coolUntil <= now);
  const stillCooling = cooling.filter((w) => w.coolUntil > now);
  const letgo = shelfWants.filter((w) => w.status === "letgo");
  const bought = shelfWants.filter((w) => w.status === "bought");
  const decided = [...letgo, ...bought].sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));
  const saved = letgo.reduce((a, w) => a + w.price * (w.quantity || 1), 0);
  const spent = bought.reduce((a, w) => a + w.price * (w.quantity || 1), 0);
  const decisions = letgo.length + bought.length;
  const letgoRate = decisions ? Math.round((letgo.length / decisions) * 100) : 0;

  const addWant = async (w) => {
    setAdding(false);
    try {
      const created = await store.insertWant(w);
      setWants((prev) => [created, ...prev]);
      if (w.shelfId) setActiveShelfId(w.shelfId);
      showToast("Added to shelf");
      setTab("shelf");
    } catch (e) { console.error(e); showToast(e.message || "Couldn’t add"); reload(); throw e; }
  };

  const saveEdit = async (fields) => {
    setEditing(null);
    try {
      const updated = await store.updateWant(fields.id, fields);
      setWants((prev) => prev.map((w) => (w.id === fields.id ? updated : w)));
      showToast("Item updated");
    } catch (e) { console.error(e); reload(); throw e; }
  };

  const decide = async (id, status) => {
    const want = wants.find((w) => w.id === id);
    setWants((prev) => prev.map((w) => (w.id === id ? { ...w, status, decidedAt: Date.now() } : w)));
    try {
      await store.updateStatus(id, status);
      if (status === "letgo" && want) showToast(`Saved ${money2(want.price)}`);
      else showToast("Marked as bought");
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

  const createShelf = async (fields) => {
    const shelf = await store.createShelf(fields);
    setShelves((prev) => [shelf, ...prev]);
    setActiveShelfId(shelf.id);
    return shelf;
  };

  return (
    <div className="app-page">
      <div className="app-shell">
        <header className="app-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div className="logo-mark"><Snowflake size={18} strokeWidth={2.4} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="brand-name">Cooldown</div>
              <div className="brand-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeShelf ? activeShelf.name : "Your shelves"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {ready.length > 0 && (
              <button className="btn-pill" onClick={() => setTab("shelf")}>{ready.length} ready</button>
            )}
            <Link to="/registry" className="btn-ghost" aria-label="Registry" title="Public registry">
              <Compass size={17} />
            </Link>
            <button className="btn-ghost" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
              <Settings2 size={17} />
            </button>
            <button className="btn-ghost" onClick={() => supabase.auth.signOut()} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {shelves.length > 0 && (
          <div className="shelf-switcher">
            {shelves.map((s) => (
              <button
                key={s.id}
                className={`shelf-chip${s.id === activeShelf?.id ? " on" : ""}`}
                onClick={() => setActiveShelfId(s.id)}
              >
                {s.name}
                <span className="shelf-vis">{s.visibility === "public" ? "Public" : s.visibility === "shareable" ? "Link" : "Private"}</span>
              </button>
            ))}
          </div>
        )}

        <main className="app-main">
          {tab === "home" && (
            <HomeView
              saved={saved} goal={goal} ready={ready} stillCooling={stillCooling}
              now={now} onDecide={setConfirmBuy} onLetGo={(id) => decide(id, "letgo")}
              onEditGoal={() => setEditGoal(true)} onGoShelf={() => setTab("shelf")}
              onAdd={() => setAdding(true)} onEdit={setEditing} onExtend={extend}
              letgo={letgo} shelf={activeShelf}
            />
          )}
          {tab === "shelf" && (
            <ShelfView
              ready={ready} stillCooling={stillCooling} now={now} shelf={activeShelf}
              onLetGo={(id) => decide(id, "letgo")} onDecide={setConfirmBuy}
              onRemove={removeWant} onAdd={() => setAdding(true)}
              onEdit={setEditing} onExtend={extend}
            />
          )}
          {tab === "history" && (
            <HistoryView decided={decided} onUndo={undo} onRemove={removeWant} />
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
          <button className="fab" onClick={() => setAdding(true)} aria-label="Add from URL">
            <LinkIcon size={22} strokeWidth={2.4} />
          </button>
          <NavBtn active={tab === "history"} onClick={() => setTab("history")} icon={<History size={20} />} label="History" />
          <NavBtn active={tab === "insights"} onClick={() => setTab("insights")} icon={<BarChart3 size={20} />} label="Insights" />
        </nav>
      </div>

      {adding && (
        <AddItemFlow
          shelves={shelves}
          activeShelfId={activeShelf?.id}
          onClose={() => setAdding(false)}
          onAdd={addWant}
          onCreateShelf={createShelf}
        />
      )}
      {editing && (
        <AddItemFlow
          shelves={shelves}
          activeShelfId={activeShelf?.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onAdd={saveEdit}
          onCreateShelf={createShelf}
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
        <GoalSheet
          goal={goal}
          onClose={() => setEditGoal(false)}
          onSave={async (g) => {
            setGoal(g); setEditGoal(false);
            try { await store.saveGoal(g); showToast("Goal saved"); } catch (e) { console.error(e); }
          }}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          profile={profile}
          shelves={shelves}
          activeShelfId={activeShelf?.id}
          onClose={() => setSettingsOpen(false)}
          onSavedProfile={setProfile}
          onShelvesChange={setShelves}
          onSelectShelf={setActiveShelfId}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function HomeView({ saved, goal, ready, stillCooling, now, onDecide, onLetGo, onEditGoal, onGoShelf, onAdd, onEdit, onExtend, letgo, shelf }) {
  const pct = goal.target > 0 ? Math.min(100, (saved / goal.target) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="hero-card">
        <div style={{ fontSize: 12.5, color: "var(--jade-ink)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
          Saved by waiting{shelf ? ` · ${shelf.name}` : ""}
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
        <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
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
            <h3 className="section-title">On this shelf</h3>
            <button className="btn-link" onClick={onGoShelf}>See all <ArrowRight size={13} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stillCooling.slice(0, 3).map((w) => (
              <WantCard key={w.id} w={w} now={now} onEdit={onEdit} onExtend={onExtend} />
            ))}
          </div>
        </section>
      )}

      {ready.length === 0 && stillCooling.length === 0 && <EmptyState onAdd={onAdd} />}
    </div>
  );
}

function ShelfView({ ready, stillCooling, now, onLetGo, onDecide, onRemove, onAdd, onEdit, onExtend, shelf }) {
  const [query, setQuery] = useState("");
  const all = [...ready, ...stillCooling];
  const match = (w) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [w.name, w.note, w.link].join(" ").toLowerCase().includes(q);
  };
  const listReady = ready.filter(match);
  const listCooling = stillCooling.filter(match);
  const has = listReady.length + listCooling.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="page-title" style={{ fontSize: 24 }}>{shelf?.name || "Shelf"}</h2>
        <button className="btn-small-add" onClick={onAdd}><Plus size={15} strokeWidth={2.6} /> Add</button>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "-4px 0 0", lineHeight: 1.45 }}>
        Wishlist items cool here before you decide. Paste a product URL with the + button to add.
      </p>

      {all.length > 0 && (
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--muted)" }} />
          <input className="input" style={{ paddingLeft: 36 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this shelf" />
        </div>
      )}

      {listReady.length > 0 && (
        <section>
          <h3 className="section-title">Ready to decide</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {listReady.map((w) => (
              <WantCard key={w.id} w={w} now={now} onLetGo={onLetGo} onDecide={onDecide} onRemove={onRemove} onEdit={onEdit} onExtend={onExtend} />
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
      {!has && all.length > 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No items match.</div>
      )}
      {all.length === 0 && <EmptyState onAdd={onAdd} />}
    </div>
  );
}

function HistoryView({ decided, onUndo, onRemove }) {
  const [filter, setFilter] = useState("all");
  const list = decided.filter((w) => filter === "all" || w.status === filter);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 className="page-title">History</h2>
      {decided.length > 0 && (
        <div className="filter-bar">
          {[
            { id: "all", label: "All" },
            { id: "letgo", label: "Let go" },
            { id: "bought", label: "Bought" },
          ].map((f) => (
            <button key={f.id} className={`filter-chip${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "32px 18px", color: "var(--muted)" }}>
          No decisions on this shelf yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((w) => (
            <div key={w.id} className="log-row" style={{ alignItems: "flex-start" }}>
              {w.image ? <img src={w.image} alt="" className="want-thumb" /> : (
                <div className="tag" style={{
                  background: w.status === "letgo" ? "var(--jade-soft)" : "var(--amber-soft)",
                  color: w.status === "letgo" ? "var(--jade-ink)" : "var(--amber-ink)",
                }}>
                  {w.status === "letgo" ? "Let go" : "Bought"}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 700 }}>{money2(w.price)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {w.status === "letgo" ? "Let go" : "Bought"}
                  {w.decidedAt ? ` · ${fmtDate(w.decidedAt)}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button className="btn-buy" style={{ padding: "7px 10px", fontSize: 12 }} onClick={() => onUndo(w.id)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Undo2 size={13} /> Undo</span>
                  </button>
                  <button className="btn-ghost" onClick={() => onRemove(w.id)} aria-label="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightsView({ saved, spent, letgo, bought, letgoRate, decisions, coolingCount }) {
  const log = [...letgo, ...bought].sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0)).slice(0, 8);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 className="page-title">Insights</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat big label="Saved by waiting" value={money(saved)} accent="var(--jade)" />
        <Stat big label="Let-go rate" value={decisions ? letgoRate + "%" : "—"} accent="var(--jade)" />
        <Stat label="Spent after waiting" value={money(spent)} />
        <Stat label="On the shelf" value={coolingCount} />
      </div>
      <section>
        <h3 className="section-title">Recent decisions</h3>
        {log.length === 0 ? (
          <div className="card" style={{ textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No decisions yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {log.map((w) => (
              <div key={w.id} className="log-row">
                <div className="tag" style={{
                  background: w.status === "letgo" ? "var(--jade-soft)" : "var(--amber-soft)",
                  color: w.status === "letgo" ? "var(--jade-ink)" : "var(--amber-ink)",
                }}>
                  {w.status === "letgo" ? "Let go" : "Bought"}
                </div>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                <span style={{ fontWeight: 700 }}>{money2(w.price)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

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
              <circle cx="24" cy="24" r="20" fill="none" stroke={isReady ? "var(--jade)" : "var(--amber)"} strokeWidth="4"
                strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - prog)}
                transform="rotate(-90 24 24)" style={{ transition: "stroke-dashoffset .4s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: isReady ? "var(--jade)" : "var(--amber)" }}>
              {isReady ? <Check size={19} strokeWidth={2.6} /> : <Flame size={16} />}
            </div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {w.mostWanted && <Star size={13} color="var(--amber)" style={{ marginRight: 4, verticalAlign: -1 }} />}
              {w.name}
            </span>
            <span style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>{money2(w.price)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: isReady ? "var(--jade)" : "var(--muted)", fontWeight: isReady ? 700 : 500 }}>
            {!isReady && <Clock size={12} />}
            {isReady ? "Ready to decide" : fmtLeft(w.coolUntil - now)}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>· qty {w.quantity || 1}</span>
            {w.isPrivate && <span style={{ color: "var(--muted)" }}>· private</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {onEdit && <button className="btn-ghost" onClick={() => onEdit(w)} aria-label="Edit"><Pencil size={15} /></button>}
          {onRemove && !isReady && <button className="btn-ghost" onClick={() => onRemove(w.id)} aria-label="Remove"><Trash2 size={15} /></button>}
        </div>
      </div>
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

function BuySheet({ want, onClose, onBuy, onKeep, onExtend }) {
  return (
    <Sheet onClose={onClose} title="Sure about this one?">
      <div className="hero-card" style={{ background: "linear-gradient(145deg, var(--amber-soft), #f3d7b4)", borderColor: "var(--amber-line)", padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: "var(--amber-ink)", fontWeight: 700 }}>{want.name}</div>
        <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 32, color: "var(--amber-ink)", lineHeight: 1.1, marginTop: 4 }}>
          {money2(want.price)}
        </div>
        {want.link && (
          <a href={normalizeUrl(want.link)} target="_blank" rel="noopener noreferrer" className="link-chip" style={{ color: "var(--amber-ink)", marginTop: 12 }}>
            <ExternalLink size={13} /> {hostOf(want.link)}
          </a>
        )}
      </div>
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

function GoalSheet({ goal, onClose, onSave }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(goal.target));
  const t = parseFloat(target) || 0;
  return (
    <Sheet onClose={onClose} title="Your goal">
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" style={{ marginBottom: 12 }} />
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{ position: "absolute", left: 14, top: 13, color: "var(--muted)" }}>$</span>
        <input className="input" style={{ paddingLeft: 28 }} value={target} inputMode="decimal"
          onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} />
      </div>
      <button className="btn-primary" style={{ opacity: name.trim() && t > 0 ? 1 : .45 }}
        onClick={() => onSave({ name: name.trim(), target: t })}>Save goal</button>
    </Sheet>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
      <div className="logo-mark" style={{ margin: "0 auto 14px", width: 46, height: 46 }}><Gift size={22} /></div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>This shelf is empty</div>
      <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Tap the link button below, paste a product URL, then fill in the details.
      </p>
      <button className="btn-primary" style={{ maxWidth: 240, margin: "0 auto" }} onClick={onAdd}>
        Add from a link
      </button>
    </div>
  );
}

function Stat({ label, value, big, accent }) {
  return (
    <div className="card" style={{ padding: "15px 16px" }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: big ? 27 : 22, marginTop: 5, color: accent || "var(--ink)", letterSpacing: "-.02em" }}>{value}</div>
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
