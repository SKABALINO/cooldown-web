import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Snowflake, ExternalLink, Clock, ArrowLeft, Globe2, Link2 } from "lucide-react";
import * as store from "../store";

const DAY = 86400000;
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const money2 = (n) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function normalizeUrl(u) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}
function hostOf(u) {
  try { return new URL(normalizeUrl(u)).hostname.replace(/^www\./, ""); }
  catch { return "link"; }
}
function fmtLeft(ms) {
  if (ms <= 0) return "Ready to decide";
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3600000);
  if (d >= 1) return `${d}d ${h}h left`;
  if (h >= 1) return `${h}h left`;
  return "Almost ready";
}

export function SharedShelfByToken() {
  const { token } = useParams();
  return <SharedShelfLoader mode="token" value={token} />;
}

export function SharedShelfByUsername() {
  const { username } = useParams();
  return <SharedShelfLoader mode="username" value={username} />;
}

function SharedShelfLoader({ mode, value }) {
  const [shelf, setShelf] = useState(undefined);
  const [now] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = mode === "token"
          ? await store.fetchSharedShelfByToken(value)
          : await store.fetchPublicShelfByUsername(value);
        if (alive) setShelf(data);
      } catch (e) {
        console.error(e);
        if (alive) setShelf(null);
      }
    })();
    return () => { alive = false; };
  }, [mode, value]);

  if (shelf === undefined) return <div className="loading">Loading shelf…</div>;
  if (!shelf) {
    return (
      <div className="app-page">
        <div className="app-shell public-shell">
          <PublicHeader />
          <main className="app-main">
            <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
              <div className="logo-mark" style={{ margin: "0 auto 14px", width: 46, height: 46 }}>
                <Snowflake size={22} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Shelf not found</div>
              <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
                This shelf is private, the link expired, or the username doesn’t exist.
              </p>
              <Link to="/registry" className="btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
                Browse the registry
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return <SharedShelfView shelf={shelf} now={now} />;
}

function SharedShelfView({ shelf, now }) {
  const { profile, stats, cooling, recentLetGo } = shelf;
  const title = profile.displayName || profile.username || "Cooldown shelf";

  return (
    <div className="app-page">
      <div className="app-shell public-shell">
        <PublicHeader />
        <main className="app-main">
          <section className="hero-card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className={`vis-pill ${profile.visibility}`}>
                {profile.visibility === "public" ? <Globe2 size={12} /> : <Link2 size={12} />}
                {profile.visibility === "public" ? "Public shelf" : "Shared shelf"}
              </span>
            </div>
            <div className="hero-num" style={{ fontSize: 34 }}>{title}</div>
            {profile.username && (
              <div style={{ fontSize: 13, color: "var(--jade-ink)", fontWeight: 650 }}>@{profile.username}</div>
            )}
            {profile.bio && (
              <p style={{ fontSize: 14, color: "var(--jade-ink)", opacity: .9, margin: "8px 0 0", lineHeight: 1.45 }}>
                {profile.bio}
              </p>
            )}
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            <Stat label="Saved by waiting" value={money(stats.saved)} />
            <Stat label="On the shelf" value={stats.cooling} />
            <Stat label="Let-go rate" value={stats.letgoRate == null ? "—" : `${stats.letgoRate}%`} />
            <Stat label="Decisions" value={stats.decisions} />
          </div>

          <section style={{ marginBottom: 18 }}>
            <h3 className="section-title">Cooling now</h3>
            {cooling.length === 0 ? (
              <div className="card" style={{ color: "var(--muted)", fontSize: 13.5, textAlign: "center" }}>
                Nothing on this shelf right now.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {cooling.map((w) => (
                  <div key={w.id} className="card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {w.image ? (
                        <img src={w.image} alt="" className="want-thumb" />
                      ) : (
                        <div className="want-thumb" style={{ display: "grid", placeItems: "center", color: "var(--amber)" }}>
                          <Clock size={18} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {w.name}
                          </span>
                          <span style={{ fontFamily: "var(--disp)", fontWeight: 700 }}>{money2(w.price)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                          {fmtLeft((w.coolUntil || 0) - now)} · {w.category}
                        </div>
                        {w.link && (
                          <a href={normalizeUrl(w.link)} target="_blank" rel="noopener noreferrer" className="link-chip" style={{ marginTop: 6 }}>
                            <ExternalLink size={12} /> {hostOf(w.link)}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {recentLetGo.length > 0 && (
            <section>
              <h3 className="section-title">Recently let go</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentLetGo.map((w, i) => (
                  <div key={`${w.name}-${i}`} className="log-row">
                    <span className="tag" style={{ background: "var(--jade-soft)", color: "var(--jade-ink)" }}>Let go</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                    <span style={{ fontWeight: 700 }}>{money2(w.price)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card" style={{ padding: "14px 15px" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 24, marginTop: 4, letterSpacing: "-.02em" }}>{value}</div>
    </div>
  );
}

export function PublicHeader() {
  return (
    <header className="app-header">
      <Link to="/registry" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
        <div className="logo-mark"><Snowflake size={18} strokeWidth={2.4} /></div>
        <div>
          <div className="brand-name">Cooldown</div>
          <div className="brand-sub">Public shelves</div>
        </div>
      </Link>
      <Link to="/" className="btn-link" style={{ textDecoration: "none" }}>
        <ArrowLeft size={14} /> Your shelf
      </Link>
    </header>
  );
}
