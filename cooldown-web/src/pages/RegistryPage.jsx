import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Snowflake, Search } from "lucide-react";
import * as store from "../store";
import { PublicHeader } from "./SharedShelfPage";

const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

export default function RegistryPage() {
  const [shelves, setShelves] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await store.listPublicShelves();
        if (alive) setShelves(list);
      } catch (e) {
        console.error(e);
        if (alive) {
          setShelves([]);
          setError("Couldn’t load the registry. Make sure the shelf-visibility migration has been run in Supabase.");
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = (shelves || []).filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [s.username, s.displayName, s.bio].join(" ").toLowerCase().includes(q);
  });

  return (
    <div className="app-page">
      <div className="app-shell public-shell">
        <PublicHeader />
        <main className="app-main">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Compass size={22} color="var(--jade)" />
            <h1 className="page-title" style={{ fontSize: 28 }}>Registry</h1>
          </div>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Browse public Cooldown shelves. See what others are waiting on — and how much they’ve saved by letting go.
          </p>

          <div style={{ position: "relative", marginBottom: 14 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--muted)" }} />
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or username"
            />
          </div>

          {error && <div className="auth-msg" style={{ marginBottom: 14 }}>{error}</div>}

          {shelves === null ? (
            <div className="loading" style={{ minHeight: 160 }}>Loading registry…</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "32px 18px" }}>
              <div className="logo-mark" style={{ margin: "0 auto 12px", width: 42, height: 42 }}>
                <Snowflake size={20} />
              </div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {shelves.length === 0 ? "No public shelves yet" : "No matches"}
              </div>
              <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.45 }}>
                {shelves.length === 0
                  ? "Be the first — open Settings on your shelf and set visibility to Public."
                  : "Try a different search."}
              </p>
              <Link to="/" className="btn-primary" style={{ display: "inline-block", width: "auto", padding: "12px 18px", textDecoration: "none" }}>
                Go to your shelf
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((s) => (
                <Link key={s.username} to={`/u/${s.username}`} className="registry-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontFamily: "var(--disp)", fontSize: 18, letterSpacing: "-.02em" }}>
                        {s.displayName}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--jade)", fontWeight: 700, marginTop: 2 }}>@{s.username}</div>
                      {s.bio && (
                        <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 0", lineHeight: 1.4 }}>
                          {s.bio}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, color: "var(--jade-ink)" }}>
                        {money(s.savedAmount)}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>saved</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
                    {s.coolingCount} cooling on the shelf
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
