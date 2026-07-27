import { supabase } from "./supabaseClient";

const DAY = 86400000;
const toMs = (t) => (t ? new Date(t).getTime() : null);

// DB row (snake_case, timestamps) -> UI shape (camelCase, ms)
function mapRow(r) {
  return {
    id: r.id,
    name: r.name,
    price: Number(r.price) || 0,
    category: r.category || "Other",
    note: r.note || "",
    link: r.link || "",
    image: r.image || "",
    addedAt: toMs(r.added_at),
    coolUntil: toMs(r.cool_until),
    status: r.status,
    decidedAt: toMs(r.decided_at),
  };
}

export async function fetchWants() {
  const { data, error } = await supabase
    .from("wants")
    .select("*")
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data.map(mapRow);
}

export async function insertWant(w) {
  const now = Date.now();
  const row = {
    name: w.name,
    price: w.price,
    category: w.category,
    note: w.note || "",
    link: w.link || "",
    image: w.image || "",
    added_at: new Date(now).toISOString(),
    cool_until: new Date(now + (w.days || 7) * DAY).toISOString(),
    status: "cooling",
  };
  const { data, error } = await supabase.from("wants").insert(row).select().single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateWant(id, fields) {
  const row = {};
  if (fields.name !== undefined) row.name = fields.name;
  if (fields.price !== undefined) row.price = fields.price;
  if (fields.category !== undefined) row.category = fields.category;
  if (fields.note !== undefined) row.note = fields.note;
  if (fields.link !== undefined) row.link = fields.link;
  if (fields.image !== undefined) row.image = fields.image;
  if (fields.days !== undefined) {
    // Rebase cool_until from original added_at when possible; fallback to now.
    const { data: current, error: readErr } = await supabase
      .from("wants")
      .select("added_at")
      .eq("id", id)
      .single();
    if (readErr) throw readErr;
    const base = toMs(current.added_at) || Date.now();
    row.cool_until = new Date(base + fields.days * DAY).toISOString();
    row.status = "cooling";
    row.decided_at = null;
  }
  const { data, error } = await supabase.from("wants").update(row).eq("id", id).select().single();
  if (error) throw error;
  return mapRow(data);
}

export async function extendCool(id, extraDays) {
  const { data: current, error: readErr } = await supabase
    .from("wants")
    .select("cool_until")
    .eq("id", id)
    .single();
  if (readErr) throw readErr;
  const base = Math.max(Date.now(), toMs(current.cool_until) || Date.now());
  const { data, error } = await supabase
    .from("wants")
    .update({
      cool_until: new Date(base + extraDays * DAY).toISOString(),
      status: "cooling",
      decided_at: null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateStatus(id, status) {
  const { data, error } = await supabase
    .from("wants")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

/** Put a decided item back on the shelf, ready to decide again. */
export async function undoDecision(id) {
  const { data, error } = await supabase
    .from("wants")
    .update({
      status: "cooling",
      decided_at: null,
      cool_until: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteWant(id) {
  const { error } = await supabase.from("wants").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchGoal() {
  const { data, error } = await supabase.from("goals").select("*").maybeSingle();
  if (error) throw error;
  return data ? { name: data.name, target: Number(data.target) } : { name: "Savings goal", target: 500 };
}

export async function saveGoal(goal) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Not signed in");
  const row = { user_id: u.user.id, name: goal.name, target: goal.target, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("goals").upsert(row, { onConflict: "user_id" });
  if (error) throw error;
}
