/**
 * Best-effort product preview from a URL (title, image, sometimes price).
 * Uses Microlink's free API. Amazon/etc often block full price — user can edit.
 */
export async function fetchLinkPreview(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error("Paste a product URL first.");

  const endpoint = `https://api.microlink.io?url=${encodeURIComponent(url)}&meta=true&palette=false`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error("Couldn’t look up that link. You can still fill details manually.");

  const json = await res.json();
  if (json.status !== "success" || !json.data) {
    throw new Error("No preview found for that link. Fill in the details manually.");
  }

  const data = json.data;
  const image =
    (typeof data.image === "string" && data.image) ||
    data.image?.url ||
    data.logo?.url ||
    "";

  const price = extractPrice(data);

  return {
    url,
    name: cleanTitle(data.title || data.publisher || ""),
    image,
    price,
    description: data.description || "",
  };
}

function normalizeUrl(u) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

function cleanTitle(title) {
  return String(title || "")
    .replace(/\s*[|\-–—].*$/, (m, offset, str) => {
      // Keep short titles intact; strip long " | Amazon.com" style suffixes
      if (str.length > 80) return "";
      return m;
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function extractPrice(data) {
  const candidates = [
    data.price,
    data.meta?.price,
    data.meta?.["product:price:amount"],
    data.meta?.["og:price:amount"],
    typeof data.description === "string" && data.description.match(/\$\s?(\d+(?:\.\d{1,2})?)/)?.[1],
  ];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const n = Number(String(c).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
