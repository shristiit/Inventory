"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";

type Status = "active" | "inactive" | "draft" | "archived";

type SizeRow = { size: string; quantity: number };
type ColorBlock = { id: string; color: string; sizeInput: string; sizeRows: SizeRow[] };

const norm = (v: string) => v.trim().toUpperCase();
const toInt = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};
function toMinor(pounds: string | number) {
  const n = Number(pounds);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
const uid = () => Math.random().toString(36).slice(2, 9);



// Even sizes 0..32
const EVEN_SIZES = Array.from({ length: 17 }, (_, i) => String(i * 2));

export default function NewProductPage() {
  const router = useRouter();

  // core product fields
  const [styleNumber, setStyleNumber] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priceGBP, setPriceGBP] = useState<string>("");
  const [status, setStatus] = useState<Status>("active");

  // optional attributes
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [season, setSeason] = useState("");
  const [wholesale, setWholesale] = useState<string>("");

  // colors (each with its own sizes)
  const [colorInput, setColorInput] = useState("");
  const [blocks, setBlocks] = useState<ColorBlock[]>([]);

  // multi-select size picker state (for the add-colors action)
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sizePickerOpen, setSizePickerOpen] = useState(false);
  const sizePickerRef = useRef<HTMLDivElement | null>(null);

  const [saving, setSaving] = useState(false);

  // --- utils ---
  // split on comma, slash, or any whitespace; trim & dedupe
  const tokenize = (raw: string) =>
    [...new Set(raw.split(/[,\s/]+/g).map(norm).filter(Boolean))];

  const toggleSize = (s: string) =>
    setSelectedSizes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  // Click outside to close size dropdown
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!sizePickerRef.current) return;
      if (!sizePickerRef.current.contains(e.target as Node)) {
        setSizePickerOpen(false);
      }
    }
    if (sizePickerOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [sizePickerOpen]);

  // Add multiple colors at once + add all selected sizes to each color
  function addColorsWithSizes(rawColors: string, sizesToAdd: string[]) {
    const tokens = tokenize(rawColors);
    if (!tokens.length) return;
    if (!sizesToAdd.length) {
      alert("Please select at least one size from the size dropdown.");
      return;
    }
    const sizes = sizesToAdd.map(norm);

    setBlocks((prev) => {
      let next = [...prev];
      for (const color of tokens) {
        const idx = next.findIndex((b) => b.color === color);
        if (idx === -1) {
          // add new color block with all selected sizes
          next.push({
            id: uid(),
            color,
            sizeInput: "",
            sizeRows: sizes.map((s) => ({ size: s, quantity: 0 })),
          });
        } else {
          // merge sizes into existing block (dedupe)
          const b = next[idx];
          const current = new Set(b.sizeRows.map((r) => r.size));
          const toAppend = sizes
            .filter((s) => !current.has(s))
            .map((s) => ({ size: s, quantity: 0 }));
          if (toAppend.length) {
            next[idx] = { ...b, sizeRows: [...b.sizeRows, ...toAppend] };
          }
        }
      }
      return next;
    });

    setColorInput("");
  }
// ----- size sorting + flat view helpers -----
const ALPHA_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

function sizeSortKey(label: string): [number, number | string] {
  const v = norm(label);
  if (/^\d+(\.\d+)?$/.test(v)) return [0, parseFloat(v)]; // numeric sizes first (asc)
  const idx = ALPHA_SIZES.indexOf(v);
  if (idx !== -1) return [1, idx];                        // then XXS..XXXL in this order
  return [2, v];                                          // then any custom labels (A→Z)
}

function sizeCompare(a: string, b: string) {
  const ka = sizeSortKey(a);
  const kb = sizeSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (typeof ka[1] === "number" && typeof kb[1] === "number") {
    return (ka[1] as number) - (kb[1] as number);
  }
  return String(ka[1]).localeCompare(String(kb[1]));
}

// Flatten blocks -> rows (keeps color order as added, sorts sizes asc within each color)
const flatRows = React.useMemo(
  () =>
    blocks.flatMap((b) =>
      [...b.sizeRows]
        .sort((a, z) => sizeCompare(a.size, z.size))
        .map((r) => ({
          colorBlockId: b.id,
          color: b.color,
          size: r.size,
          quantity: r.quantity,
        }))
    ),
  [blocks]
);

// Update just one cell's quantity
function updateQtyFlat(colorBlockId: string, size: string, qty: number) {
  setBlocks((prev) =>
    prev.map((b) => {
      if (b.id !== colorBlockId) return b;
      const idx = b.sizeRows.findIndex((r) => r.size === size);
      if (idx === -1) {
        return { ...b, sizeRows: [...b.sizeRows, { size, quantity: qty }] };
      }
      const next = [...b.sizeRows];
      next[idx] = { ...next[idx], quantity: qty };
      return { ...b, sizeRows: next };
    })
  );
}

// Remove one (color, size) row
function removeFlatRow(colorBlockId: string, size: string) {
  setBlocks((prev) =>
    prev
      .map((b) =>
        b.id === colorBlockId
          ? { ...b, sizeRows: b.sizeRows.filter((r) => r.size !== size) }
          : b
      )
      // (optional) auto-remove empty color block
      .filter((b) => b.sizeRows.length > 0 || b.id !== colorBlockId)
  );
}

// union of all sizes across colors, sorted ascending
const allSizes = React.useMemo(() => {
  const set = new Set<string>();
  blocks.forEach((b) => b.sizeRows.forEach((r) => set.add(r.size)));
  return Array.from(set).sort((a, b) => {
    const ka = sizeSortKey(a);
    const kb = sizeSortKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (typeof ka[1] === "number" && typeof kb[1] === "number") {
      return (ka[1] as number) - (kb[1] as number);
    }
    return String(ka[1]).localeCompare(String(kb[1]));
  });
}, [blocks]);

function getQty(block: ColorBlock, size: string) {
  const r = block.sizeRows.find((x) => x.size === size);
  return r ? r.quantity : 0;
}

// upsert quantity for a (color, size) cell
function upsertQty(blockId: string, size: string, qty: number) {
  setBlocks((prev) =>
    prev.map((b) => {
      if (b.id !== blockId) return b;
      const idx = b.sizeRows.findIndex((r) => r.size === size);
      if (idx === -1) {
        return { ...b, sizeRows: [...b.sizeRows, { size, quantity: qty }] };
      }
      const next = [...b.sizeRows];
      next[idx] = { ...next[idx], quantity: qty };
      return { ...b, sizeRows: next };
    })
  );
}

  // ---- per-block size helpers ----
  function addSize(blockId: string, raw: string) {
    const size = norm(raw);
    if (!size) return;
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        if (b.sizeRows.some((r) => r.size === size)) return { ...b, sizeInput: "" };
        return {
          ...b,
          sizeInput: "",
          sizeRows: [...b.sizeRows, { size, quantity: 0 }],
        };
      })
    );
  }

  function removeColor(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function updateColorLabel(id: string, raw: string) {
    const color = norm(raw);
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, color } : b))
    );
  }

  function removeSize(blockId: string, size: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, sizeRows: b.sizeRows.filter((r) => r.size !== size) }
          : b
      )
    );
  }

  function updateSizeQty(blockId: string, size: string, q: number) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              sizeRows: b.sizeRows.map((r) =>
                r.size === size ? { ...r, quantity: q } : r
              ),
            }
          : b
      )
    );
  }

  function onSizeKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    blockId: string,
    value: string
  ) {
    if (["Enter", "Tab", ",", " "].includes(e.key)) {
      e.preventDefault();
      addSize(blockId, value);
    }
  }

  function onSizePaste(e: React.ClipboardEvent<HTMLInputElement>, blockId: string) {
    const text = e.clipboardData.getData("text");
    const tokens = tokenize(text);
    if (!tokens.length) return;
    e.preventDefault();
    tokens.forEach((t) => addSize(blockId, t));
  }

  // ---- submit ----
  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const style = styleNumber.trim();
    const name = title.trim();
    const priceMinor = toMinor(priceGBP);

    if (!style) return alert("Style number is required.");
    if (!name) return alert("Title is required.");
    if (!desc.trim()) return alert("Product must contain description.");
    if (priceMinor == null) return alert("Price is required and must be a valid number.");
    if (!blocks.length) return alert("Add at least one color.");
    if (!blocks.some((b) => b.sizeRows.length)) return alert("Add at least one size for a color.");

    // Build items: one row per (color, size)
    const items = blocks.flatMap((b) =>
      b.sizeRows.map((r) => ({
        color: b.color,
        size: r.size,
        quantity: r.quantity,
      }))
    );

    setSaving(true);
    try {
      const payload = {
        styleNumber: norm(style),
        title: name,
        description: desc.trim() || undefined,
        price: priceMinor,
        items, // [{ color, size, quantity }]
        attributes: {
          category: category || undefined,
          supplier: supplier || undefined,
          season: season || undefined,
          wholesale: (() => {
            const n = parseFloat(wholesale);
            return Number.isFinite(n) ? n : undefined;
          })(),
        },
        status,
      };

      await api.post("/api/products", { product: payload });
      router.push("/Products");
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || "Failed to create product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create Product</h1>
        <Link href="/Products" className="underline">
          Back to Products
        </Link>
      </div>

      <form onSubmit={onSave} className="space-y-8">
        {/* ---------- Core fields ---------- */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label className="m-2">Style Number</Label>
            <Input
              value={styleNumber}
              onChange={(e) => setStyleNumber(e.target.value)}
              required
              placeholder="STY-900001"
            />
          </div>

          <div>
            <Label className="m-2">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Basic Tee"
            />
          </div>

          <div>
            <Label className="m-2">Price (£)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              value={priceGBP}
              onChange={(e) => setPriceGBP(e.target.value)}
              placeholder="19.99"
            />
          </div>

          <div>
            <Label className="m-2">Status</Label>
            <select
              className="w-full h-10 border rounded px-3"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <Label className="m-2">Description</Label>
            <Textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Product description"
            />
          </div>

          {/* Attributes */}
          <div>
            <Label className="m-2">Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="T-Shirts" />
          </div>
          <div>
            <Label className="m-2">Supplier</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
          </div>
          <div>
            <Label className="m-2">Season</Label>
            <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="SS25" />
          </div>
          <div>
            <Label className="m-2">Cost Price (£)</Label>
            <Input
              type="number"
              step="0.01"
              value={wholesale}
              onChange={(e) => setWholesale(e.target.value)}
              placeholder="e.g., 7.50"
            />
          </div>
        </section>

        {/* ---------- Add multiple colors + multi-select sizes ---------- */}
        <section className="border rounded p-4 space-y-3">
          <Label className="m-2">Add Color(s) & Sizes</Label>
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            {/* Colors input (multi) */}
            <Input
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter, Tab, comma, or slash triggers batch-add
                if (["Enter"].includes(e.key)) {
                  e.preventDefault();
                  addColorsWithSizes(colorInput, selectedSizes);
                }
              }}
              onBlur={() => {
                // Optional: add on blur if user typed delimiters; otherwise ignore
                if (/[,\s/]/.test(colorInput)) {
                  addColorsWithSizes(colorInput, selectedSizes);
                }
              }}
              placeholder="Type colors separated by ',', '/' or spaces (e.g., BLACK, NAVY/OLIVE)"
              className="md:max-w-xl"
            />

            {/* Multi-select sizes (custom dropdown) */}
            <div className="relative" ref={sizePickerRef}>
              <button
                type="button"
                className="h-10 rounded border px-3 bg-white hover:bg-gray-50 transition"
                onClick={() => setSizePickerOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={sizePickerOpen}
              >
                {selectedSizes.length
                  ? `Sizes: ${selectedSizes.join(", ")}`
                  : "Select sizes (even 0–32)"}
              </button>

              {sizePickerOpen && (
                <div className="absolute z-20 mt-1 w-56 rounded border bg-white p-2 shadow">
                  <div className="max-h-60 overflow-auto">
                    {EVEN_SIZES.map((s) => (
                      <label
                        key={s}
                        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSizes.includes(s)}
                          onChange={() => toggleSize(s)}
                        />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-between gap-2 pt-2 border-t mt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setSelectedSizes([])}
                    >
                      Clear
                    </Button>
                    <Button type="button" onClick={() => setSizePickerOpen(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Button type="button" onClick={() => addColorsWithSizes(colorInput, selectedSizes)}>
              Add color(s)
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Example: <code>Black, Navy/Olive  </code> → adds <em>Black</em>, <em>Navy</em>, and <em>Olive</em>.
          </p>
        </section>


        {/*view 1 */}

       {/* ---------- Colors × Sizes matrix (chronological rows, ascending size columns) ---------- */}
<section className="border rounded p-4 space-y-3">
  <div className="flex items-center justify-between">
    <h2 className="font-medium">Colors &amp; Sizes</h2>
    {blocks.length > 0 && allSizes.length === 0 && (
      <span className="text-xs text-gray-500">No sizes yet — add sizes via the controls above.</span>
    )}
  </div>

  {blocks.length === 0 ? (
    <p className="text-sm text-muted-foreground">No colors yet. Add some above.</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border rounded">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2 border w-48">Color</th>
            {allSizes.map((s) => (
              <th key={s} className="text-center p-2 border">{s}</th>
            ))}
            <th className="text-center p-2 border w-16">Actions</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.id}>
              {/* Color (editable) */}
              <td className="p-2 border align-middle">
                <Input
                  value={b.color}
                  onChange={(e) => updateColorLabel(b.id, e.target.value)}
                  className="w-40"
                />
              </td>

              {/* One editable cell per size (inline quantity inputs) */}
              {allSizes.map((s) => (
                <td key={s} className="p-2 border text-center align-middle">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={String(getQty(b, s))}
                    onChange={(e) => upsertQty(b.id, s, toInt(e.target.value))}
                    className="w-20 mx-auto"
                  />
                </td>
              ))}

              {/* Remove color */}
              <td className="p-2 border text-center align-middle">
                <button
                  type="button"
                  className="text-red-600"
                  onClick={() => removeColor(b.id)}
                  aria-label={`Remove color ${b.color}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>

{/*view 2 */}
{/* ---------- Flat table: one row per (color, size) ---------- */}
<section className="border rounded p-4 space-y-3">
  <h2 className="font-medium">Variants</h2>

  {blocks.length === 0 || flatRows.length === 0 ? (
    <p className="text-sm text-muted-foreground">No rows yet. Add colors & sizes above.</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border rounded">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2 border w-48">Color</th>
            <th className="text-left p-2 border w-28">Size</th>
            <th className="text-left p-2 border w-32">Quantity</th>
            <th className="text-center p-2 border w-12">Action</th>
          </tr>
        </thead>
        <tbody>
          {flatRows.map((row) => (
            <tr key={`${row.colorBlockId}-${row.size}`}>
              <td className="p-2 border align-middle">{row.color}</td>
              <td className="p-2 border align-middle">{row.size}</td>
              <td className="p-2 border align-middle">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  className="w-24"
                  value={String(row.quantity ?? 0)}
                  onChange={(e) => updateQtyFlat(row.colorBlockId, row.size, toInt(e.target.value))}
                />
              </td>
              <td className="p-2 border text-center align-middle">
                <button
                  type="button"
                  className="text-red-600"
                  aria-label={`Remove ${row.color} / ${row.size}`}
                  onClick={() => removeFlatRow(row.colorBlockId, row.size)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>


        {/* ---------- Submit ---------- */}
        <div className="flex gap-2">
          <Button className="bg-green-600" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create product"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/Products")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
