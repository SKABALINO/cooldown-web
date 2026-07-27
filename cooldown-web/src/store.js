import { supabase } from "./supabaseClient";

const DAY = 86400000;
const toMs = (t) => (t ? new Date(t).getTime() : null);

export const VISIBILITY = {
  private: "private",
  shareable: "shareable",
  public: "public",
};

export function defaultShelfName(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function mapWant(r) {
  return {
    id: r.id,
    shelfId: r.shelf_id || r.shelfId || null,
    name: r.name,
    price: Number(r.price) || 0,
    category: r.category || "Other",
    note: r.note || "",
    link: r.link || "",
    image: r.image || "",
    quantity: Number(r.quantity) || 1,
    mostWanted: !!(r.most_wanted ?? r.mostWanted),
    isPrivate: !!(r.is_private ?? r.isPrivate),
    openToSecondhand: !!(r.open_to_secondhand ?? r.openToSecondhand),
    addedAt: toMs(r.added_at || r.addedAt),
    coolUntil: toMs(r.cool_until || r.coolUntil),
    status: r.status,
    decidedAt: toMs(r.decided_at || r.decidedAt),
  };
}

export function mapShelf(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name || defaultShelfName(),
    visibility: r.visibility || VISIBILITY.private,
    shareToken: r.share_token,
    createdAt: toMs(r.created_at),
    updatedAt: toMs(r.updated_at),
  };
}

function mapProfile(r) {
  if (!r) return null;
  return {
    userId: r.user_id,
    displayName: r.display_name || "",
    username: r.username || "",
    bio: r.bio || "",
    // legacy account visibility kept for back-compat reads only
    visibility: r.shelf_visibility || VISIBILITY.private,
    shareToken: r.share_token,
    updatedAt: toMs(r.updated_at),
  };
}

function mapSharedPayload(data) {
  if (!data) return null;
  return {
    shelf: {
      id: data.shelf?.id,
      name: data.shelf?.name || "Shelf",
      visibility: data.shelf?.visibility || VISIBILITY.private,
      createdAt: toMs(data.shelf?.createdAt),
    },
    owner: {
      displayName: data.owner?.displayName || "Someone",
      username: data.owner?.username || "",
      bio: data.owner?.bio || "",
    },
    stats: {
      itemCount: Number(data.stats?.itemCount) || 0,
      mostWantedCount: Number(data.stats?.mostWantedCount) || 0,
      totalValue: Number(data.stats?.totalValue) || 0,
    },
    items: (data.items || []).map(mapWant),
  };
}

function suggestDays(price) {
  if (price < 25) return 1;
  if (price < 100) return 3;
  if (price < 500) return 7;
  return 30;
}

// ---- shelves ----
export async function fetchShelves() {
  const { data, error } = await supabase
    .from("shelves")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapShelf);
}

export async function ensureDefaultShelf() {
  const existing = await fetchShelves();
  if (existing.length) return existing;

  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("shelves")
    .insert({
      user_id: u.user.id,
      name: defaultShelfName(),
      visibility: VISIBILITY.private,
    })
    .select()
    .single();
  if (error) throw error;
  return [mapShelf(data)];
}

export async function createShelf({ name, visibility = VISIBILITY.private } = {}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("shelves")
    .insert({
      user_id: u.user.id,
      name: (name || "").trim() || defaultShelfName(),
      visibility: visibility || VISIBILITY.private,
    })
    .select()
    .single();
  if (error) throw error;
  return mapShelf(data);
}

export async function updateShelf(id, fields) {
  const row = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) row.name = (fields.name || "").trim() || defaultShelfName();
  if (fields.visibility !== undefined) row.visibility = fields.visibility;
  const { data, error } = await supabase
    .from("shelves")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapShelf(data);
}

export async function deleteShelf(id) {
  const { error } = await supabase.from("shelves").delete().eq("id", id);
  if (error) throw error;
}

export async function regenerateShelfShareToken(id) {
  const { data, error } = await supabase
    .from("shelves")
    .update({ share_token: crypto.randomUUID(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapShelf(data);
}

export function shelfShareUrl(shelf) {
  if (!shelf?.shareToken) return "";
  return `${window.location.origin}/s/${shelf.shareToken}`;
}

export function shelfPublicUrl(shelf) {
  if (!shelf?.id) return "";
  return `${window.location.origin}/shelf/${shelf.id}`;
}

// ---- wants ----
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
  const days = w.days ?? suggestDays(w.price);
  const row = {
    shelf_id: w.shelfId,
    name: w.name,
    price: w.price,
    category: w.category || "Other",
    note: w.note || "",
    link: w.link || "",
    image: w.image || "",
    quantity: Math.max(1, Number(w.quantity) || 1),
    most_wanted: !!w.mostWanted,
    is_private: !!w.isPrivate,
    open_to_secondhand: !!w.openToSecondhand,
    added_at: new Date(now).toISOString(),
    cool_until: new Date(now + days * DAY).toISOString(),
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
  if (fields.shelfId !== undefined) row.shelf_id = fields.shelfId;
  if (fields.quantity !== undefined) row.quantity = Math.max(1, Number(fields.quantity) || 1);
  if (fields.mostWanted !== undefined) row.most_wanted = !!fields.mostWanted;
  if (fields.isPrivate !== undefined) row.is_private = !!fields.isPrivate;
  if (fields.openToSecondhand !== undefined) row.open_to_secondhand = !!fields.openToSecondhand;
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

// ---- goals / profile ----
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

  const row = {
    user_id: u.user.id,
    display_name: (fields.displayName || "").trim(),
    username,
    bio: (fields.bio || "").trim(),
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

// ---- public / shared ----
export async function listPublicShelves() {
  const { data, error } = await supabase.rpc("list_public_shelves");
  if (error) throw error;
  return (data || []).map((s) => ({
    shelfId: s.shelfId,
    shelfName: s.shelfName,
    shareToken: s.shareToken,
    username: s.username || "",
    displayName: s.displayName || s.username || "Someone",
    bio: s.bio || "",
    itemCount: Number(s.itemCount) || 0,
    totalValue: Number(s.totalValue) || 0,
    updatedAt: toMs(s.updatedAt),
  }));
}

export async function fetchSharedShelfByToken(token) {
  const { data, error } = await supabase.rpc("get_shared_shelf", { p_token: token });
  if (error) throw error;
  return mapSharedPayload(data);
}

export async function fetchPublicShelfByUsername(username) {
  const { data, error } = await supabase.rpc("get_public_shelf", { p_username: username });
  if (error) throw error;
  return mapSharedPayload(data);
}

export async function fetchPublicShelfById(shelfId) {
  const { data, error } = await supabase.rpc("get_public_shelf_by_id", { p_shelf_id: shelfId });
  if (error) throw error;
  return mapSharedPayload(data);
}
