/**
 * Product link preview — prefers page HTML (JSON-LD / Open Graph / store-specific
 * hooks) over generic link APIs, and filters out brand logos (Prime, etc.).
 */

const LOGO_RE =
  /logo|prime|sprite|favicon|icon|badge|button|banner|nav-|header|footer|brand|wordmark|svg\+xml|spinner|placeholder|transparent-pixel|1x1|tracking|adsystem|pixel\./i;

const BAD_TITLE_RE =
  /product not found|page not found|access denied|robot check|captcha|something went wrong|enable javascript|denied|unavailable|error\s*404|not available|^target search$|^amazon\.com$|try again later|currently unavailable|page is currently unavailable/i;

export async function fetchLinkPreview(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error("Paste a product URL first.");

  const errors = [];

  // 1) Parse the actual product page HTML (best for Amazon / Target).
  try {
    const html = await fetchHtml(url);
    if (/page is currently unavailable|we'?re sorry! this page is currently unavailable/i.test(html)) {
      errors.push(storeBlockMessage(url));
    } else {
      const parsed = parseProductHtml(html, url);
      // Jina sometimes returns markdown instead of raw HTML
      const fromMd = parseJinaMarkdown(html);
      const merged = {
        name: cleanTitle(parsed.name || fromMd.name || ""),
        image: upgradeImageUrl(parsed.image || fromMd.image || ""),
        price: parsed.price ?? fromMd.price ?? null,
        description: parsed.description || fromMd.description || "",
      };
      if (isUseful(merged) && !BAD_TITLE_RE.test(merged.name || "")) {
        return { url, ...merged };
      }
      if (merged?.name && BAD_TITLE_RE.test(merged.name)) {
        errors.push(storeBlockMessage(url));
      }
    }
  } catch (e) {
    errors.push(e.message || "HTML lookup failed");
  }

  // 2) Microlink fallback — but never use their "logo" field as the product image.
  try {
    const micro = await fetchMicrolink(url);
    if (isUseful(micro) && !BAD_TITLE_RE.test(micro.name || "")) {
      return { url, ...micro };
    }
  } catch (e) {
    errors.push(e.message || "Preview API failed");
  }

  const hint = errors.find(Boolean) || "Couldn’t read that product page.";
  throw new Error(hint);
}

function isUseful(p) {
  return !!(p && (p.name || p.image || p.price != null));
}

function normalizeUrl(u) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

async function fetchHtml(url) {
  const proxies = [
    // Jina reader often gets past light bot walls and returns cleaner HTML/text
    (u) => `https://r.jina.ai/http://${u.replace(/^https?:\/\//i, "")}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  ];

  let lastErr = null;
  for (const make of proxies) {
    try {
      const res = await fetch(make(url), {
        headers: { Accept: "text/html,application/xhtml+xml,application/json" },
      });
      if (!res.ok) {
        lastErr = new Error(`Lookup failed (${res.status})`);
        continue;
      }
      const text = await res.text();
      if (text && text.length > 200) return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Couldn’t fetch that page");
}

function parseProductHtml(html, pageUrl) {
  const host = safeHost(pageUrl);
  const fromLd = parseJsonLd(html);
  const fromMeta = parseMetaTags(html);
  const fromAmazon = host.includes("amazon.") || host.includes("amzn.") || host === "a.co"
    ? parseAmazon(html)
    : {};
  const fromTarget = host.includes("target.com") ? parseTarget(html) : {};

  const name = cleanTitle(
    fromLd.name || fromAmazon.name || fromTarget.name || fromMeta.title || ""
  );
  const image = pickImage([
    fromLd.image,
    fromAmazon.image,
    fromTarget.image,
    fromMeta.image,
    ...(fromAmazon.images || []),
    ...(fromTarget.images || []),
    ...(fromLd.images || []),
  ]);
  const price =
    coercePrice(fromLd.price) ??
    coercePrice(fromAmazon.price) ??
    coercePrice(fromTarget.price) ??
    coercePrice(fromMeta.price);

  return {
    name,
    image: upgradeImageUrl(image || ""),
    price,
    description: fromLd.description || fromMeta.description || "",
  };
}

function parseJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Some pages concatenate multiple JSON objects
      try {
        blocks.push(JSON.parse(`[${raw.replace(/}\s*{/g, "},{")}]`));
      } catch {
        /* ignore */
      }
    }
  }

  const products = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    const type = node["@type"];
    const types = Array.isArray(type) ? type : type ? [type] : [];
    if (types.some((t) => /Product/i.test(String(t)))) products.push(node);
    if (node["@graph"]) visit(node["@graph"]);
    // Target sometimes nests product under mainEntity
    if (node.mainEntity) visit(node.mainEntity);
  };
  blocks.forEach(visit);

  const product = products[0];
  if (!product) return { images: [] };

  const images = flattenImages(product.image);
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const price =
    offer?.price ??
    offer?.lowPrice ??
    offer?.priceSpecification?.price ??
    product.price;

  return {
    name: product.name || "",
    description: product.description || "",
    image: images[0] || "",
    images,
    price,
  };
}

function parseMetaTags(html) {
  const get = (prop) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["'][^>]*>`,
      "i"
    );
    const m = html.match(re);
    return m ? decodeHtml(m[1] || m[2] || "") : "";
  };
  return {
    title: get("og:title") || get("twitter:title") || titleTag(html),
    image: get("og:image") || get("og:image:secure_url") || get("twitter:image"),
    description: get("og:description") || get("description"),
    price: get("product:price:amount") || get("og:price:amount"),
  };
}

function titleTag(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeHtml(m[1]) : "";
}

function parseAmazon(html) {
  const images = [];

  // landingImage / dynamic image map
  const landing = html.match(/id=["']landingImage["'][^>]*>/i)?.[0] || "";
  const hires = landing.match(/data-old-hires=["']([^"']+)["']/i)?.[1]
    || landing.match(/data-a-dynamic-image=["']([^"']+)["']/i)?.[1];
  if (hires) {
    if (hires.startsWith("{")) {
      try {
        images.push(...Object.keys(JSON.parse(decodeHtml(hires))));
      } catch { /* ignore */ }
    } else {
      images.push(decodeHtml(hires));
    }
  }

  // colorImages / imageGalleryData blobs
  const colorBlock = html.match(/'colorImages'\s*:\s*(\{[\s\S]*?\}),\s*'colorToAsin'/);
  if (colorBlock) {
    try {
      const json = Function(`"use strict"; return (${colorBlock[1]})`)();
      const initial = json?.initial || [];
      for (const item of initial) {
        if (item.hiRes) images.push(item.hiRes);
        if (item.large) images.push(item.large);
        if (item.main) images.push(...Object.keys(item.main));
      }
    } catch { /* ignore */ }
  }

  // hiRes strings scattered in scripts
  const hiResRe = /"hiRes"\s*:\s*"(https:\/\/[^"]+?media-amazon\.com[^"]+)"/g;
  let hm;
  while ((hm = hiResRe.exec(html))) images.push(hm[1].replace(/\\u002F/g, "/"));

  // Prefer classic product image paths (.../images/I/....jpg)
  const imgPathRe = /https:\/\/[a-z0-9.-]*media-amazon\.com\/images\/I\/[A-Za-z0-9+\-_,.|%]+\.(?:jpg|jpeg|png|webp)/gi;
  let im;
  while ((im = imgPathRe.exec(html))) images.push(im[0]);

  const name =
    html.match(/id=["']productTitle["'][^>]*>\s*([^<]+?)\s*</i)?.[1] ||
    html.match(/"title"\s*:\s*"([^"]{8,200})"/)?.[1] ||
    "";

  // Price hooks (often missing when Amazon personalizes)
  const price =
    html.match(/class=["']a-price[^"']*["'][^>]*>[\s\S]*?class=["']a-offscreen["'][^>]*>\s*\$?\s*([\d,.]+)/i)?.[1] ||
    html.match(/"priceAmount"\s*:\s*([\d.]+)/)?.[1] ||
    html.match(/"price"\s*:\s*"?\$?([\d.]+)"?/)?.[1] ||
    html.match(/data-a-color=["']price["'][\s\S]{0,200}?\$([\d,.]+)/)?.[1] ||
    null;

  return {
    name: decodeHtml(name),
    image: "",
    images,
    price,
  };
}

function parseTarget(html) {
  // Target embeds product data in __TGT_DATA__ / JSON-LD; also check for soft 404 copy
  if (/product not found|we can'?t find|doesn'?t exist/i.test(html) && !/application\/ld\+json/i.test(html)) {
    return { name: "Product not found", images: [] };
  }

  const images = [];
  const sceneRe = /https:\/\/[^"'\\\s]+(?:target\.scene7\.com|targetimg1\.targetimg\.com)[^"'\\\s]+\.(?:jpg|jpeg|png|webp)/gi;
  let m;
  while ((m = sceneRe.exec(html))) images.push(m[0].replace(/\\u002F/g, "/").replace(/\\/g, ""));

  const name =
    html.match(/"title"\s*:\s*"([^"]{5,180})"/)?.[1] ||
    html.match(/data-test=["']product-title["'][^>]*>\s*([^<]+)/i)?.[1] ||
    "";

  const price =
    html.match(/"current_retail"\s*:\s*([\d.]+)/)?.[1] ||
    html.match(/"formatted_current_price"\s*:\s*"\$?([\d.]+)"/)?.[1] ||
    html.match(/"price"\s*:\s*([\d.]+)/)?.[1] ||
    null;

  return {
    name: decodeHtml(name),
    image: images[0] || "",
    images,
    price,
  };
}

async function fetchMicrolink(url) {
  const endpoint = `https://api.microlink.io?url=${encodeURIComponent(url)}&meta=true&palette=false`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error("Preview service unavailable");
  const json = await res.json();
  if (json.status !== "success" || !json.data) throw new Error("No preview found");

  const data = json.data;
  // Intentionally ignore data.logo — that was returning Amazon Prime marks.
  const candidates = [
    typeof data.image === "string" ? data.image : data.image?.url,
    data.image?.alternates,
  ].flat().filter(Boolean);

  return {
    name: cleanTitle(data.title || ""),
    image: upgradeImageUrl(pickImage(candidates) || ""),
    price: coercePrice(data.price) ?? coercePrice(data.meta?.["product:price:amount"]) ?? coercePrice(data.meta?.price),
    description: data.description || "",
  };
}

function flattenImages(image) {
  if (!image) return [];
  if (typeof image === "string") return [image];
  if (Array.isArray(image)) return image.flatMap(flattenImages);
  if (typeof image === "object") {
    return [image.url, image.contentUrl, image.thumbnailUrl].filter(Boolean);
  }
  return [];
}

function pickImage(candidates) {
  const urls = [...new Set(
    (candidates || [])
      .flat()
      .filter(Boolean)
      .map((u) => String(u).trim().replace(/&amp;/g, "&"))
      .filter((u) => /^https?:\/\//i.test(u))
  )];

  const scored = urls
    .map((u) => ({ u, score: scoreImage(u) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.u || "";
}

function scoreImage(url) {
  const u = url.toLowerCase();
  if (LOGO_RE.test(u)) return 0;
  if (/\.(css|js)(\?|$)/i.test(u)) return 0;
  if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u) && !/images\/I\//i.test(u) && !/scene7/i.test(u)) {
    // still allow extensionless CDN product images
    if (!/media-amazon\.com\/images\/I\//i.test(u) && !/target/i.test(u)) return 1;
  }

  let score = 5;
  if (/media-amazon\.com\/images\/I\//i.test(u)) score += 20;
  if (/_ac_sl\d+|_ac_sx\d+|_sl\d+|_ux\d+|_ul\d+/i.test(u)) score += 25; // large Amazon product
  if (/_ac_sr\d+|_ss\d+|_sx3\d|_sy3\d/i.test(u)) score -= 10; // tiny thumbs
  if (/scene7|targetimg/i.test(u)) score += 18;
  if (/prime|logo|icon|sprite/i.test(u)) score -= 50;
  if (/_\.css|_\.js|\.gif$/i.test(u)) score -= 30;
  const size = u.match(/_(?:ac_sl|ac_sx|sl|ux|ul|ss)_?(\d{3,4})/i)?.[1];
  if (size) score += Math.min(25, Number(size) / 80);
  return score;
}

function cleanTitle(title) {
  let t = decodeHtml(String(title || ""))
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  t = t
    .replace(/^Amazon\.com\s*:\s*/i, "")
    .replace(/\s*[:|\-–—]\s*(Amazon\.com.*|Target|Walmart\.com.*|Best Buy.*|Home & Kitchen|Electronics|Sports & Outdoors|Toys & Games|Beauty & Personal Care|Clothing.*)\s*$/i, "")
    .replace(/\s+Amazon\.com\s*$/i, "")
    .trim();
  return t.slice(0, 180);
}

/** Bump tiny Amazon thumbs (_AC_SR38,50_ / _AC_SX425_) up to a usable product image. */
function upgradeImageUrl(url) {
  if (!url) return "";
  let u = url;
  if (/media-amazon\.com\/images\/I\//i.test(u)) {
    // Keep the image id, force a large AC_SL variant
    const idMatch = u.match(/\/images\/I\/([A-Za-z0-9+\-]+)/);
    if (idMatch) {
      u = `https://m.media-amazon.com/images/I/${idMatch[1]}._AC_SL1500_.jpg`;
    }
  }
  return u;
}

function parseJinaMarkdown(text) {
  if (!/URL Source:|Markdown Content:/i.test(text)) return {};
  const name = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || "";
  const images = [];
  const imgRe = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+(?:media-amazon|scene7|targetimg)[^\s)]+\.(?:jpg|jpeg|png|webp))/gi;
  let m;
  while ((m = imgRe.exec(text))) images.push(m[1] || m[2]);
  const price = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/)?.[1] || null;
  return {
    name: BAD_TITLE_RE.test(name) ? "" : name,
    image: pickImage(images) || "",
    price: coercePrice(price),
    description: "",
  };
}

function storeBlockMessage(url) {
  const host = safeHost(url);
  if (host.includes("target.com")) {
    return "Target blocks automatic product lookups. Add the title, price, and image manually (pencil on the image).";
  }
  if (host.includes("amazon.") || host === "a.co") {
    return "Amazon hid some details (often the price). Title/image may still fill — add the price manually.";
  }
  return "That store blocked the automatic lookup.";
}

function coercePrice(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 1000000) return null;
  return Math.round(n * 100) / 100;
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\"/g, '"');
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
