import { useState } from "react";
import {
  X, Link as LinkIcon, Gift, Pencil, Minus, Plus, Eye, Loader2,
} from "lucide-react";
import * as store from "./store";
import { fetchLinkPreview } from "./linkPreview";

function normalizeUrl(u) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

/**
 * Two-step add flow:
 * 1) Paste URL → View item (fetches title/image when possible)
 * 2) Item details (title, price, qty, shelf, toggles)
 */
export default function AddItemFlow({
  shelves,
  activeShelfId,
  onClose,
  onAdd,
  onCreateShelf,
  initial,
}) {
  const editing = !!initial?.id;
  const [step, setStep] = useState(editing ? "details" : "url");
  const [url, setUrl] = useState(initial?.link || "");
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [quantity, setQuantity] = useState(initial?.quantity || 1);
  const [shelfId, setShelfId] = useState(initial?.shelfId || activeShelfId || shelves[0]?.id || "");
  const [image, setImage] = useState(initial?.image || "");
  const [showImageEdit, setShowImageEdit] = useState(false);
  const [mostWanted, setMostWanted] = useState(!!initial?.mostWanted);
  const [isPrivate, setIsPrivate] = useState(!!initial?.isPrivate);
  const [openToSecondhand, setOpenToSecondhand] = useState(!!initial?.openToSecondhand);
  const [creatingShelf, setCreatingShelf] = useState(false);
  const [newShelfName, setNewShelfName] = useState("");
  const [newShelfVisibility, setNewShelfVisibility] = useState(store.VISIBILITY.private);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState("");

  const p = parseFloat(price) || 0;
  const valid = name.trim() && p > 0 && shelfId;

  const goDetails = async () => {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setMsg("Paste a product URL first.");
      return;
    }
    setUrl(normalized);
    setMsg("");
    setFetching(true);
    try {
      const preview = await fetchLinkPreview(normalized);
      if (preview.name && !name.trim()) setName(preview.name);
      if (preview.image && !image.trim()) setImage(preview.image);
      if (preview.price != null && !price.trim()) setPrice(String(preview.price));
      setStep("details");
      if (!preview.name && preview.price == null && !preview.image) {
        setMsg("Couldn’t auto-fill much from that page — enter the title and price.");
      } else if (preview.price == null) {
        setMsg("Title/image loaded. Add the price to finish.");
      }
    } catch (e) {
      setStep("details");
      setMsg(e.message || "Couldn’t look up that link. Fill in the details manually.");
    }
    setFetching(false);
  };

  const bumpQty = (delta) => setQuantity((q) => Math.max(1, (Number(q) || 1) + delta));

  const createShelfInline = async () => {
    setBusy(true);
    setMsg("");
    try {
      const shelf = await onCreateShelf({
        name: newShelfName.trim() || store.defaultShelfName(),
        visibility: newShelfVisibility,
      });
      setShelfId(shelf.id);
      setCreatingShelf(false);
      setNewShelfName("");
    } catch (e) {
      setMsg(e.message || "Couldn’t create shelf.");
    }
    setBusy(false);
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setMsg("");
    try {
      await onAdd({
        id: initial?.id,
        name: name.trim(),
        price: p,
        quantity,
        shelfId,
        link: normalizeUrl(url),
        image: image.trim(),
        mostWanted,
        isPrivate,
        openToSecondhand,
      });
    } catch (e) {
      setMsg(e.message || "Couldn’t save item.");
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet add-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-.02em" }}>
            {step === "url" ? "Add from a link" : editing ? "Edit item details" : "Add item details"}
          </h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {step === "url" ? (
          <>
            <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.45 }}>
              Paste a product URL. We’ll try to pull the title and image, then you can confirm price and shelf.
            </p>
            {msg && <div className="auth-msg">{msg}</div>}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <LinkIcon size={16} style={{ position: "absolute", left: 14, top: 14, color: "var(--muted)" }} />
              <input
                className="input"
                style={{ paddingLeft: 40 }}
                value={url}
                autoFocus
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="https://…"
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !fetching) goDetails(); }}
                disabled={fetching}
              />
            </div>
            <button
              className="btn-primary"
              onClick={goDetails}
              disabled={fetching}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {fetching ? <Loader2 size={17} className="spin" /> : <Eye size={17} />}
              {fetching ? "Looking up item…" : "View item"}
            </button>
            <button
              className="btn-link"
              style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
              onClick={() => { setStep("details"); setMsg(""); }}
              disabled={fetching}
            >
              Or add without a link
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.45 }}>
              {url
                ? "Confirm the details, add a price if needed, and pick which shelf this belongs on."
                : "Add a title and price, then pick which shelf it belongs on."}
            </p>
            {msg && <div className="auth-msg">{msg}</div>}

            {url && (
              <div className="url-bar">
                <LinkIcon size={14} />
                <a href={normalizeUrl(url)} target="_blank" rel="noopener noreferrer">{url}</a>
              </div>
            )}

            <div className="item-details-grid">
              <div className="item-image-panel">
                {image ? (
                  <img src={image} alt="" className="item-image-preview" />
                ) : (
                  <div className="item-image-placeholder">
                    <Gift size={42} strokeWidth={1.5} />
                  </div>
                )}
                <button
                  type="button"
                  className="image-edit-btn"
                  onClick={() => setShowImageEdit((v) => !v)}
                  aria-label="Edit image"
                >
                  <Pencil size={14} />
                </button>
              </div>

              <div className="item-fields">
                <label className="field-label">Title*</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Item name"
                  autoFocus={!url}
                />

                <div className="price-qty-row">
                  <div style={{ flex: 1 }}>
                    <label className="field-label">Price*</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }}>$</span>
                      <input
                        className="input"
                        style={{ paddingLeft: 26 }}
                        value={price}
                        inputMode="decimal"
                        onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div style={{ width: 120 }}>
                    <label className="field-label">Quantity</label>
                    <div className="qty-stepper">
                      <button type="button" onClick={() => bumpQty(-1)} aria-label="Decrease"><Minus size={14} /></button>
                      <span>{quantity}</span>
                      <button type="button" onClick={() => bumpQty(1)} aria-label="Increase"><Plus size={14} /></button>
                    </div>
                  </div>
                </div>

                <label className="field-label">Shelf</label>
                {!creatingShelf ? (
                  <select
                    className="input select-input"
                    value={shelfId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") setCreatingShelf(true);
                      else setShelfId(e.target.value);
                    }}
                  >
                    {shelves.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.visibility}
                      </option>
                    ))}
                    <option value="__new__">+ Create new shelf…</option>
                  </select>
                ) : (
                  <div className="new-shelf-box">
                    <input
                      className="input"
                      value={newShelfName}
                      onChange={(e) => setNewShelfName(e.target.value)}
                      placeholder={store.defaultShelfName()}
                    />
                    <div className="chip-wrap" style={{ marginTop: 8 }}>
                      {Object.values(store.VISIBILITY).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`chip${newShelfVisibility === v ? " on" : ""}`}
                          onClick={() => setNewShelfVisibility(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button className="btn-primary" style={{ padding: "10px" }} type="button" onClick={createShelfInline} disabled={busy}>
                        Create shelf
                      </button>
                      <button className="btn-buy" type="button" onClick={() => setCreatingShelf(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                <div className="toggle-row">
                  <Toggle label="Most wanted" on={mostWanted} onChange={setMostWanted} />
                  <Toggle label="Private" on={isPrivate} onChange={setIsPrivate} />
                  <Toggle label="Open to secondhand" on={openToSecondhand} onChange={setOpenToSecondhand} />
                </div>
              </div>
            </div>

            {showImageEdit && (
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Image URL</label>
                <input
                  className="input"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  autoCapitalize="off"
                />
              </div>
            )}

            {!url && (
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Product URL (optional)</label>
                <input
                  className="input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                />
              </div>
            )}

            <button
              className="btn-primary"
              style={{ marginTop: 16, opacity: valid ? 1 : .45, pointerEvents: valid ? "auto" : "none" }}
              onClick={submit}
              disabled={busy || !valid}
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Add to shelf"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }) {
  return (
    <button type="button" className="toggle-block" onClick={() => onChange(!on)}>
      <span className="toggle-label">{label}</span>
      <span className={`toggle-switch${on ? " on" : ""}`} aria-hidden>
        <span className="toggle-knob" />
      </span>
    </button>
  );
}
