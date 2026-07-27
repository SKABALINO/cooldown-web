import { supabase } from "./supabaseClient";

const DAY = 86400000;
const toMs = (t) => (t ? new Date(t).getTime() : null);

export const VISIBILITY = {
  private: "private",
  shareable: "shareable",
  public: "public",
};

export function mapWant(r) {
  return {
    id: r.id,
    name: r.name,
    price: Number(r.price) || 0,
    category: r.category || "Other",
    note: r.note || "",
    link: r.link || "",
    image: r.image || "",
    addedAt: toMs(r.added_at || r.addedAt),
    coolUntil: toMs(r.cool_until || r.coolUntil),
    status: r.status,
    decidedAt: toMs(r.decided_at || r.decidedAt),
  };
}

function mapProfile(r) {
  if (!r) return null;
  return {
    userId: r.user_id,
    displayName: r.display_name || "",
    username: r.username || "",
    bio: r.bio || "",
    visibility: r.shelf_visibility || VISIBILITY.private,
    shareToken: r.share_token,
    updatedAt: toMs(r.updated_at),
  };
}

function mapShelfPayload(data) {
  if (!data) return null;
  return {
    profile: {
      username: data.profile?.username || "",
      displayName: data.profile?.displayName || data.profile?.username || "Cooldown shelf",
      bio: data.profile?.bio || "",
      visibility: data.profile?.visibility || VISIBILITY.private,
    },
    stats: {
      saved: Number(data.stats?.saved) || 0,
      spent: Number(data.stats?.spent) || 0,
      cooling: Number(data.stats?.cooling) || 0,
      letgo: Number(data.stats?.letgo) || 0,
      bought: Number(data.stats?.bought) || 0,
      decisions: Number(data.stats?.decisions) || 0,
      letgoRate: data.stats?.letgoRate == null ? null : Number(data.stats.letgoRate),
    },
    cooling: (data.cooling || []).map(mapWant),
    recentLetGo: (data.recentLetGo || []).map((w) => ({
      name: w.name,
      price: Number(w.price) || 0,
      category: w.category || "Other",
      decidedAt: toMs(w.decided_at || w.decidedAt),
    })),
  };
}

export async function fetchWants() {
  const { data, error } = await supabase
    .from("wants")
    .select("*")
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data.map(mapWant);
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
  return mapWant(data);
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
  return mapWant(data);
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
  return mapWant(data);
}

export async function updateStatus(id, status) {
  const { data, error } = await supabase
    .from("wants")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapWant(data);
}

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
  return mapWant(data);
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

/** Ensure the signed-in user has a profiles row, then return it. */
export async function ensureProfile() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Not signed in");

  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing) return mapProfile(existing);

  const display = (u.user.email || "Cooldowner").split("@")[0];
  const { data: created, error: createErr } = await supabase
    .from("profiles")
    .insert({ user_id: u.user.id, display_name: display })
    .select()
    .single();
  if (createErr) throw createErr;
  return mapProfile(created);
}

export async function saveProfile(fields) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Not signed in");

  const username = fields.username === "" || fields.username == null
    ? null
    : String(fields.username).trim().toLowerCase();

  if (username && !/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new Error("Username must be 3–24 characters: lowercase letters, numbers, underscores.");
  }
  if (fields.visibility === VISIBILITY.public && !username) {
    throw new Error("Pick a username before making your shelf public.");
  }

  const row = {
    user_id: u.user.id,
    display_name: (fields.displayName || "").trim(),
    username,
    bio: (fields.bio || "").trim(),
    shelf_visibility: fields.visibility || VISIBILITY.private,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That username is already taken.");
    throw error;
  }
  return mapProfile(data);
}

export async function regenerateShareToken() {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("profiles")
    .update({ share_token: crypto.randomUUID(), updated_at: new Date().toISOString() })
    .eq("user_id", u.user.id)
    .select()
    .single();
  if (error) throw error;
  return mapProfile(data);
}

export async function listPublicShelves() {
  const { data, error } = await supabase.rpc("list_public_shelves");
  if (error) throw error;
  return (data || []).map((s) => ({
    username: s.username,
    displayName: s.displayName || s.username,
    bio: s.bio || "",
    coolingCount: Number(s.coolingCount) || 0,
    savedAmount: Number(s.savedAmount) || 0,
    updatedAt: toMs(s.updatedAt),
  }));
}

export async function fetchSharedShelfByToken(token) {
  const { data, error } = await supabase.rpc("get_shared_shelf", { p_token: token });
  if (error) throw error;
  return mapShelfPayload(data);
}

export async function fetchPublicShelfByUsername(username) {
  const { data, error } = await supabase.rpc("get_public_shelf", { p_username: username });
  if (error) throw error;
  return mapShelfPayload(data);
}

export function shareUrlFor(profile) {
  if (!profile?.shareToken) return "";
  return `${window.location.origin}/s/${profile.shareToken}`;
}

export function publicUrlFor(username) {
  if (!username) return "";
  return `${window.location.origin}/u/${username}`;
}
