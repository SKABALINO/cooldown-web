import { useState } from "react";
import { Link } from "react-router-dom";
import { X, Copy, Check, RefreshCw, Compass, Plus, Trash2 } from "lucide-react";
import * as store from "./store";

const VIS_OPTS = [
  { id: store.VISIBILITY.private, title: "Private", blurb: "Only you" },
  { id: store.VISIBILITY.shareable, title: "Shareable", blurb: "Secret link" },
  { id: store.VISIBILITY.public, title: "Public", blurb: "In the registry" },
];

export default function SettingsSheet({
  profile,
  shelves,
  activeShelfId,
  onClose,
  onSavedProfile,
  onShelvesChange,
  onSelectShelf,
}) {
  const [tab, setTab] = useState("shelves");
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [newName, setNewName] = useState("");
  const [newVis, setNewVis] = useState(store.VISIBILITY.private);

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setMsg("Couldn’t copy — select the link manually.");
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    setMsg("");
    try {
      const saved = await store.saveProfile({ displayName, username, bio });
      onSavedProfile(saved);
      setMsg("Profile saved.");
    } catch (e) {
      setMsg(e.message || "Couldn’t save profile.");
    }
    setBusy(false);
  };

  const createShelf = async () => {
    setBusy(true);
    setMsg("");
    try {
      const shelf = await store.createShelf({ name: newName, visibility: newVis });
      onShelvesChange([shelf, ...shelves]);
      onSelectShelf?.(shelf.id);
      setNewName("");
      setMsg("Shelf created.");
    } catch (e) {
      setMsg(e.message || "Couldn’t create shelf.");
    }
    setBusy(false);
  };

  const patchShelf = async (id, fields) => {
    setBusy(true);
    setMsg("");
    try {
      const updated = await store.updateShelf(id, fields);
      onShelvesChange(shelves.map((s) => (s.id === id ? updated : s)));
    } catch (e) {
      setMsg(e.message || "Couldn’t update shelf.");
    }
    setBusy(false);
  };

  const rotate = async (id) => {
    setBusy(true);
    try {
      const updated = await store.regenerateShelfShareToken(id);
      onShelvesChange(shelves.map((s) => (s.id === id ? updated : s)));
      setMsg("New share link created.");
    } catch (e) {
      setMsg(e.message || "Couldn’t regenerate link.");
    }
    setBusy(false);
  };

  const remove = async (id) => {
    if (shelves.length <= 1) {
      setMsg("Keep at least one shelf.");
      return;
    }
    if (!confirm("Delete this shelf and all items on it?")) return;
    setBusy(true);
    try {
      await store.deleteShelf(id);
      const next = shelves.filter((s) => s.id !== id);
      onShelvesChange(next);
      if (activeShelfId === id) onSelectShelf?.(next[0]?.id);
      setMsg("Shelf deleted.");
    } catch (e) {
      setMsg(e.message || "Couldn’t delete shelf.");
    }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-.02em" }}>
            Settings
          </h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="filter-bar" style={{ marginBottom: 14 }}>
          <button className={`filter-chip${tab === "shelves" ? " on" : ""}`} onClick={() => setTab("shelves")}>Shelves</button>
          <button className={`filter-chip${tab === "profile" ? " on" : ""}`} onClick={() => setTab("profile")}>Profile</button>
        </div>

        {msg && <div className="auth-msg">{msg}</div>}

        {tab === "shelves" ? (
          <>
            <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.45 }}>
              Each shelf is its own wishlist. Set visibility when you create it — private, shareable link, or public in the registry.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              {shelves.map((s) => {
                const shareLink = store.shelfShareUrl(s);
                const publicLink = store.shelfPublicUrl(s);
                return (
                  <div key={s.id} className="card" style={{ padding: 14 }}>
                    <input
                      className="input"
                      value={s.name}
                      onChange={(e) => onShelvesChange(shelves.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                      onBlur={(e) => patchShelf(s.id, { name: e.target.value })}
                    />
                    <div className="chip-wrap" style={{ marginTop: 10 }}>
                      {VIS_OPTS.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className={`chip${s.visibility === o.id ? " on" : ""}`}
                          onClick={() => patchShelf(s.id, { visibility: o.id })}
                        >
                          {o.title}
                        </button>
                      ))}
                    </div>

                    {(s.visibility === store.VISIBILITY.shareable || s.visibility === store.VISIBILITY.public) && (
                      <div className="share-row" style={{ marginTop: 10 }}>
                        <input className="input" readOnly value={shareLink} />
                        <button className="btn-small-add" type="button" onClick={() => copy(shareLink, s.id)}>
                          {copied === s.id ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                      </div>
                    )}
                    {s.visibility === store.VISIBILITY.public && (
                      <div className="share-row" style={{ marginTop: 8 }}>
                        <input className="input" readOnly value={publicLink} />
                        <button className="btn-small-add" type="button" onClick={() => copy(publicLink, `p-${s.id}`)}>
                          {copied === `p-${s.id}` ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                      {(s.visibility === store.VISIBILITY.shareable || s.visibility === store.VISIBILITY.public) && (
                        <button className="btn-link" type="button" onClick={() => rotate(s.id)} disabled={busy}>
                          <RefreshCw size={13} /> Regenerate link
                        </button>
                      )}
                      <button className="btn-ghost" type="button" onClick={() => remove(s.id)} aria-label="Delete shelf" style={{ marginLeft: "auto" }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={15} /> New shelf
              </div>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={store.defaultShelfName()}
              />
              <div className="chip-wrap" style={{ marginTop: 10 }}>
                {VIS_OPTS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`chip${newVis === o.id ? " on" : ""}`}
                    onClick={() => setNewVis(o.id)}
                  >
                    {o.title}
                  </button>
                ))}
              </div>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={createShelf} disabled={busy}>
                Create shelf
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.45 }}>
              Your public name on shared shelves and the registry. Visibility is set per shelf, not on your account.
            </p>
            <Field label="Display name">
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="Username">
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 14, top: 13, color: "var(--muted)", fontWeight: 700 }}>@</span>
                <input
                  className="input"
                  style={{ paddingLeft: 30 }}
                  value={username}
                  autoCapitalize="off"
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="yourname"
                />
              </div>
            </Field>
            <Field label="Bio">
              <textarea className="input" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} style={{ resize: "vertical" }} />
            </Field>
            <button className="btn-primary" onClick={saveProfile} disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
          </>
        )}

        <Link
          to="/registry"
          onClick={onClose}
          className="btn-link"
          style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16, textDecoration: "none", width: "100%" }}
        >
          <Compass size={14} /> Browse the public registry
        </Link>
      </div>
    </div>
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
