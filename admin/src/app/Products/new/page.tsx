"use client";

import React, { useState } from "react";
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

  const [saving, setSaving] = useState(false);

  // ---- color block helpers ----
  function addColor(raw: string) {
    const color = norm(raw);
    if (!color) return;
    // avoid duplicate color blocks
    if (blocks.some((b) => b.color === color)) {
      setColorInput("");
      return;
    }
    setBlocks((prev) => [...prev, { id: uid(), color, sizeInput: "", sizeRows: [] }]);
    setColorInput("");
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

  // ---- paste / key handlers ----
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
    const tokens = [...new Set(text.split(/[, \s]+/g).map(norm).filter(Boolean))];
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
        items, // <-- [{ color, size, quantity }]
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

        {/* ---------- Color input (adds a block) ---------- */}
        <section className="border rounded p-4 space-y-3">
          <Label className="m-2">Add Color</Label>
          <div className="flex gap-2">
            <Input
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              onKeyDown={(e) => {
                if (["Enter", "Tab", ","].includes(e.key)) {
                  e.preventDefault();
                  addColor(colorInput);
                }
              }}
              onBlur={() => addColor(colorInput)}
              placeholder="Type a color then Enter (e.g., BLACK)"
              className="max-w-md"
            />
            <Button type="button" onClick={() => addColor(colorInput)}>
              Add color
            </Button>
          </div>
        </section>

        {/* ---------- One section per color, with its own sizes ---------- */}
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No colors yet. Add one above.</p>
        ) : (
          <div className="space-y-6">
            {blocks.map((b) => (
              <section key={b.id} className="border rounded p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500">Color</span>
                    <Input
                      value={b.color}
                      onChange={(e) => updateColorLabel(b.id, e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button type="button" variant="destructive" onClick={() => removeColor(b.id)}>
                    Remove color
                  </Button>
                </div>

                <div>
                  <Label className="m-2">Add sizes for {b.color || "color"}</Label>
                  <Input
                    value={b.sizeInput}
                    onChange={(e) =>
                      setBlocks((prev) =>
                        prev.map((x) => (x.id === b.id ? { ...x, sizeInput: e.target.value } : x))
                      )
                    }
                    onKeyDown={(e) => onSizeKeyDown(e, b.id, b.sizeInput)}
                    onPaste={(e) => onSizePaste(e, b.id)}
                    onBlur={() => addSize(b.id, b.sizeInput)}
                    placeholder="Type size then Enter (e.g., S). You can paste: S, M, L"
                  />
                </div>

                {b.sizeRows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border rounded">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2 border">Size</th>
                          <th className="text-left p-2 border">Quantity</th>
                          <th className="p-2 border w-16">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.sizeRows.map((r) => (
                          <tr key={r.size}>
                            <td className="p-2 border">{r.size}</td>
                            <td className="p-2 border">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                value={String(r.quantity)}
                                onChange={(e) => updateSizeQty(b.id, r.size, toInt(e.target.value))}
                              />
                            </td>
                            <td className="p-2 border text-center">
                              <button
                                type="button"
                                className="text-red-600"
                                onClick={() => removeSize(b.id, r.size)}
                                aria-label={`Remove size ${r.size}`}
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
            ))}
          </div>
        )}

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
