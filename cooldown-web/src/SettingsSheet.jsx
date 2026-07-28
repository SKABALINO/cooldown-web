import { useState } from "react";
import { Link } from "react-router-dom";
import { X, Copy, Check, RefreshCw, Globe2, Link2, Lock, Compass } from "lucide-react";
import * as store from "./store";

const OPTIONS = [
  {
    id: store.VISIBILITY.private,
    title: "Private",
    blurb: "Only you can see your shelf. Nothing is listed or linkable.",
    icon: Lock,
  },
  {
    id: store.VISIBILITY.shareable,
    title: "Shareable",
    blurb: "Anyone with your secret link can view a read-only shelf. Not listed in the registry.",
    icon: Link2,
  },
  {
    id: store.VISIBILITY.public,
    title: "Public",
    blurb: "Listed in the registry and open at /u/yourname. Great for accountability.",
    icon: Globe2,
  },
];

export default function SettingsSheet({ profile, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(profile.displayName || "");
  const [username, setUsername] = useState(profile.username || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [visibility, setVisibility] = useState(profile.visibility || store.VISIBILITY.private);
  const [shareToken, setShareToken] = useState(profile.shareToken);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");

  const shareLink = shareToken ? `${window.location.origin}/s/${shareToken}` : "";
  const publicLink = username ? `${window.location.origin}/u/${username.trim().toLowerCase()}` : "";

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setMsg("Couldn’t copy — select the link and copy manually.");
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const saved = await store.saveProfile({
        displayName,
        username,
        bio,
        visibility,
      });
      setShareToken(saved.shareToken);
      setUsername(saved.username || "");
      onSaved(saved);
      setMsg("Saved.");
    } catch (e) {
      setMsg(e.message || "Couldn’t save settings.");
    }
    setBusy(false);
  };

  const rotate = async () => {
    setBusy(true);
    setMsg("");
    try {
      const saved = await store.regenerateShareToken();
      setShareToken(saved.shareToken);
      onSaved(saved);
      setMsg("New share link created. The old one no longer works.");
    } catch (e) {
      setMsg(e.message || "Couldn’t regenerate link.");
    }
    setBusy(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-.02em" }}>
            Shelf settings
          </h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.45 }}>
          Control who can see your shelf — keep it private, share a secret link, or list it in the public registry.
        </p>

        {msg && <div className="auth-msg" style={{ marginBottom: 14 }}>{msg}</div>}

        <Field label="Display name">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        </Field>

        <Field label="Username">
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: 13, color: "var(--muted)", fontWeight: 700 }}>@</span>
            <input
              className="input"
              style={{ paddingLeft: 30 }}
              value={username}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="yourname"
            />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            3–24 characters. Required for public shelves.
          </div>
        </Field>

        <Field label="Bio (optional)">
          <textarea
            className="input"
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Waiting on fewer impulse buys…"
            style={{ resize: "vertical", minHeight: 64 }}
          />
        </Field>

        <Field label="Visibility">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {OPTIONS.map((o) => {
              const Icon = o.icon;
              const on = visibility === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`visibility-option${on ? " on" : ""}`}
                  onClick={() => setVisibility(o.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Icon size={16} />
                    <span style={{ fontWeight: 700, fontSize: 14.5 }}>{o.title}</span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.4, opacity: .85, textAlign: "left" }}>{o.blurb}</div>
                </button>
              );
            })}
          </div>
        </Field>

        {(visibility === store.VISIBILITY.shareable || visibility === store.VISIBILITY.public) && (
          <Field label="Share link">
            <div className="share-row">
              <input className="input" readOnly value={shareLink} />
              <button className="btn-small-add" type="button" onClick={() => copy(shareLink, "share")} disabled={!shareLink}>
                {copied === "share" ? <Check size={15} /> : <Copy size={15} />}
                {copied === "share" ? "Copied" : "Copy"}
              </button>
            </div>
            <button className="btn-link" type="button" onClick={rotate} disabled={busy} style={{ marginTop: 8 }}>
              <RefreshCw size={13} /> Regenerate link
            </button>
          </Field>
        )}

        {visibility === store.VISIBILITY.public && (
          <Field label="Public profile URL">
            <div className="share-row">
              <input className="input" readOnly value={publicLink || "Save a username first"} />
              <button className="btn-small-add" type="button" onClick={() => copy(publicLink, "public")} disabled={!publicLink}>
                {copied === "public" ? <Check size={15} /> : <Copy size={15} />}
                {copied === "public" ? "Copied" : "Copy"}
              </button>
            </div>
          </Field>
        )}

        <button className="btn-primary" onClick={save} disabled={busy} style={{ marginTop: 4 }}>
          {busy ? "Saving…" : "Save settings"}
        </button>

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
