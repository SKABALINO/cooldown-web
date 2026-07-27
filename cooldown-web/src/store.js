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
  // user_id is filled by the column default (auth.uid()).
  const { data, error } = await supabase.from("wants").insert(row).select().single();
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
