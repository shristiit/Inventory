"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";

function toMinor(pounds: string | number) {
  const n = Number(pounds);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
const norm = (v: string) => v.trim().toUpperCase();

export default function NewProductPage() {
  const router = useRouter();

  const [styleNumber, setStyleNumber] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priceGBP, setPriceGBP] = useState<string>("");
  const [status, setStatus] = useState<"active" | "inactive" | "draft" | "archived">("active");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [season, setSeason] = useState("");
  const [wholesale, setWholesale] = useState<string>("");

  // multi-size chips
  const [sizes, setSizes] = useState<string[]>([]);
  const [sizeInput, setSizeInput] = useState("");

  const [saving, setSaving] = useState(false);

  const tryAddSize = (raw: string) => {
    const token = norm(raw);
    if (!token) return;
    setSizes(prev => (prev.includes(token) ? prev : [...prev, token]));
    setSizeInput("");
  };
  const removeSize = (token: string) => setSizes(prev => prev.filter(s => s !== token));

  const onSizeKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (["Enter", "Tab", ",", " "].includes(e.key)) {
      e.preventDefault();
      tryAddSize(sizeInput);
      return;
    }
    if (e.key === "Backspace" && !sizeInput) setSizes(prev => prev.slice(0, -1));
  };
  const onSizePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
    const text = e.clipboardData.getData("text");
    const tokens = [...new Set(text.split(/[, \s]+/g).map(norm).filter(Boolean))];
    if (tokens.length) {
      e.preventDefault();
      setSizes(prev => [...new Set([...prev, ...tokens])]);
    }
  };

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const style = styleNumber.trim();
    const name = title.trim();
    const priceMinor = toMinor(priceGBP);

    if (!style) return alert("Style number is required.");
    if (!name) return alert("Title is required.");
    if (!desc.trim()) return alert("Product must contain description.");
    if (priceMinor == null) return alert("Price is required and must be a valid number.");
    if (!sizes.length) return alert("Add at least one size.");

    setSaving(true);
    try {
      const product = {
        styleNumber: style.toUpperCase(),
        title: name,
        description: desc.trim() || undefined,
        price: priceMinor,
        sizes, // send array
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

      console.log("➡️ POST /api/products", product);
      await api.post("/api/products", { product });

      router.push("/Products");
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || "Failed to create product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create Product</h1>
        <Link href="/Products" className="underline">Back to Products</Link>
      </div>

      <form onSubmit={onSave} className="space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label className="m-2">Style Number</Label>
            <Input value={styleNumber} onChange={(e) => setStyleNumber(e.target.value)} required placeholder="STY-900001" />
          </div>

          <div>
            <Label className="m-2">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Test Runner" />
          </div>

          <div>
            <Label className="m-2">Price (£)</Label>
            <Input type="number" step="0.01" min="0" required value={priceGBP} onChange={(e) => setPriceGBP(e.target.value)} placeholder="123.45" />
          </div>

          <div className="md:col-span-2">
            <Label className="m-2">Sizes</Label>
            <Input
              type="text"
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              onKeyDown={onSizeKeyDown}
              onPaste={onSizePaste}
              onBlur={() => tryAddSize(sizeInput)}
              placeholder="Type size then Enter (e.g., S). You can paste: S, M, L"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {sizes.map((s) => (
                <span key={s} className="inline-flex items-center rounded-full border px-2 py-1 text-sm">
                  {s}
                  <button type="button" className="ml-1 text-xs opacity-60 hover:opacity-100" onClick={() => removeSize(s)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <Label className="m-2">Status</Label>
            <select className="w-full h-10 border rounded px-3" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <Label className="m-2">Description</Label>
            <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Product description" />
          </div>

          <div>
            <Label className="m-2">Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Shoes" />
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
            <Input type="number" step="0.01" value={wholesale} onChange={(e) => setWholesale(e.target.value)} placeholder="e.g., 45.00" />
          </div>
        </section>

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
