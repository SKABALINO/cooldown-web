import { useState } from "react";
import { Link } from "react-router-dom";
import { Snowflake } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || pw.length < 6) {
      setMsg("Enter an email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password: pw });
        if (error) throw error;
        setMsg("Account created. If email confirmation is on, check your inbox, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
      }
    } catch (e) {
      setMsg(e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  const onKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-mark"><Snowflake size={22} strokeWidth={2.4} /></span>
          <div>
            <div className="auth-name">Cooldown</div>
            <div className="auth-sub">Wait first. Buy later, if ever.</div>
          </div>
        </div>

        <h1 className="auth-h">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-p">
          {mode === "signup"
            ? "Create shelves like wishlists — keep them private, share a link, or list them publicly."
            : "Sign in to reach your shelves from anywhere."}
        </p>

        {msg && <div className="auth-msg">{msg}</div>}

        <label className="auth-label">Email</label>
        <input className="auth-input" type="email" value={email} autoComplete="email"
          onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey} placeholder="you@example.com" />

        <label className="auth-label">Password</label>
        <input className="auth-input" type="password" value={pw}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          onChange={(e) => setPw(e.target.value)} onKeyDown={onKey} placeholder="At least 6 characters" />

        <button className="auth-btn" onClick={submit} disabled={busy}>
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>

        <button className="auth-toggle" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMsg(""); }}>
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>

        <Link to="/registry" className="auth-toggle" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          Browse public shelves
        </Link>
      </div>
    </div>
  );
}
