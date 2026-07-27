import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Snowflake, ExternalLink, ArrowLeft, Globe2, Link2, Gift, Star } from "lucide-react";
import * as store from "../store";

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

export function SharedShelfByToken() {
  const { token } = useParams();
  return <SharedShelfLoader key={`t-${token}`} kind="token" value={token} />;
}

export function SharedShelfByUsername() {
  const { username } = useParams();
  return <SharedShelfLoader key={`u-${username}`} kind="username" value={username} />;
}

export function SharedShelfById() {
  const { shelfId } = useParams();
  return <SharedShelfLoader key={`s-${shelfId}`} kind="id" value={shelfId} />;
}

function SharedShelfLoader({ kind, value }) {
  const [shelf, setShelf] = useState(undefined);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let data = null;
        if (kind === "token") data = await store.fetchSharedShelfByToken(value);
        else if (kind === "username") data = await store.fetchPublicShelfByUsername(value);
        else data = await store.fetchPublicShelfById(value);
        if (alive) setShelf(data);
      } catch (e) {
        console.error(e);
        if (alive) setShelf(null);
      }
    })();
    return () => { alive = false; };
  }, [kind, value]);

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
                This shelf is private, the link expired, or it doesn’t exist.
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

  return <SharedShelfView data={shelf} />;
}

function SharedShelfView({ data }) {
  const { shelf, owner, stats, items } = data;

  return (
    <div className="app-page">
      <div className="app-shell public-shell">
        <PublicHeader />
        <main className="app-main">
          <section className="hero-card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className={`vis-pill ${shelf.visibility}`}>
                {shelf.visibility === "public" ? <Globe2 size={12} /> : <Link2 size={12} />}
                {shelf.visibility === "public" ? "Public shelf" : "Shared shelf"}
              </span>
            </div>
            <div className="hero-num" style={{ fontSize: 32 }}>{shelf.name}</div>
            <div style={{ fontSize: 13.5, color: "var(--jade-ink)", fontWeight: 650, marginTop: 4 }}>
              by {owner.displayName}{owner.username ? ` · @${owner.username}` : ""}
            </div>
            {owner.bio && (
              <p style={{ fontSize: 14, color: "var(--jade-ink)", opacity: .9, margin: "8px 0 0", lineHeight: 1.45 }}>
                {owner.bio}
              </p>
            )}
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
            <MiniStat label="Items" value={stats.itemCount} />
            <MiniStat label="Most wanted" value={stats.mostWantedCount} />
            <MiniStat label="Value" value={money(stats.totalValue)} />
          </div>

          <section>
            <h3 className="section-title">On this shelf</h3>
            {items.length === 0 ? (
              <div className="card" style={{ color: "var(--muted)", fontSize: 13.5, textAlign: "center" }}>
                Nothing here yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((w) => (
                  <div key={w.id} className="card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {w.image ? (
                        <img src={w.image} alt="" className="want-thumb" />
                      ) : (
                        <div className="want-thumb" style={{ display: "grid", placeItems: "center", color: "var(--muted)" }}>
                          <Gift size={18} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {w.mostWanted && <Star size={13} style={{ marginRight: 4, verticalAlign: -1 }} color="var(--amber)" />}
                            {w.name}
                          </span>
                          <span style={{ fontFamily: "var(--disp)", fontWeight: 700 }}>{money2(w.price)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                          Qty {w.quantity || 1}
                          {w.openToSecondhand ? " · Open to secondhand" : ""}
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
        </main>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="card" style={{ padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 18, marginTop: 3 }}>{value}</div>
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
        <ArrowLeft size={14} /> Your shelves
      </Link>
    </header>
  );
}
