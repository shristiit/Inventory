"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { RefreshCcw, Trash2 } from "lucide-react";

/* ---------- Types ---------- */
type ProductStatus = "active" | "inactive" | "draft" | "archived";

type Product = {
  _id: string;
  styleNumber: string;
  title: string;
  description?: string;
  price: number; // pence
  size: string;
  quantity?: number; // 👈 NEW
  status: ProductStatus;
  attributes?: Record<string, any>;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type SiblingsResponse = {
  styleNumber: string;
  count: number;
  rows: Product[];
};

/* ---------- Helpers ---------- */
function poundsFromMinor(minor?: number) {
  if (typeof minor !== "number") return "";
  return (minor / 100).toFixed(2);
}
function minorFromPounds(s: string) {
  const n = Number(s);
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * 100);
}
function fmtGBP(minor?: number) {
  if (typeof minor !== "number") return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100);
}
const toNonNegInt = (v: any) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const PRODUCT_STATUSES: ProductStatus[] = ["active", "inactive", "draft", "archived"];

export default function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the product being edited
  const [product, setProduct] = useState<Product | null>(null);

  // only the sizes belonging to THIS product's styleNumber
  const [sizes, setSizes] = useState<Product[]>([]);
  const [sizesLoading, setSizesLoading] = useState(false);
  const [sizesError, setSizesError] = useState<string | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | null>(null); // 👈 NEW

  // form state
  const [styleNumber, setStyleNumber] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pricePounds, setPricePounds] = useState("");
  const [status, setStatus] = useState<ProductStatus>("draft");
  const [size, setSize] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string>>({});

  /* ---------- load this product ---------- */
  async function loadProduct() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Product>(`/api/products/${id}`);
      setProduct(data);
      setStyleNumber(data.styleNumber || "");
      setTitle(data.title || "");
      setDesc(data.description || "");
      setPricePounds(poundsFromMinor(data.price));
      setStatus((data.status as ProductStatus) || "draft");
      setSize(data.size || "");

      // load sizes for this style via the dedicated endpoint
      await loadSizesForProduct(id);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load product.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- load only siblings (same styleNumber) for this product id ---------- */
  async function loadSizesForProduct(productId: string) {
    setSizesLoading(true);
    setSizesError(null);
    try {
      const { data } = await api.get<SiblingsResponse>(`/api/products/${productId}/sizes`);
      const sorted = (data.rows || []).sort((a, b) => (a.size || "").localeCompare(b.size || ""));
      setSizes(sorted);
    } catch (e: any) {
      setSizesError(e?.response?.data?.message || "Failed to load sizes.");
      setSizes([]);
    } finally {
      setSizesLoading(false);
    }
  }

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ---------- attribute helpers ---------- */
  const attrPairs = useMemo(() => Object.entries(attributes), [attributes]);

  function addAttrRow() {
    let i = 1; let key = "key";
    while (attributes[key]) { i += 1; key = `key${i}`; }
    setAttributes((a) => ({ ...a, [key]: "" }));
  }
  function updateAttrKey(oldKey: string, newKey: string) {
    if (!newKey || newKey === oldKey) return;
    setAttributes((attrs) => {
      const next: Record<string, string> = {};
      Object.entries(attrs).forEach(([k, v]) => { next[k === oldKey ? newKey : k] = v; });
      return next;
    });
  }
  function updateAttrVal(k: string, v: string) {
    setAttributes((a) => ({ ...a, [k]: v }));
  }
  function removeAttr(k: string) {
    setAttributes((a) => { const { [k]: _, ...rest } = a; return rest; });
  }

  /* ---------- save / archive core fields ---------- */
  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;

    setSaving(true);
    setError(null);
    try {
      const cleanAttrs: Record<string, any> = {};
      for (const [k, v] of Object.entries(attributes)) {
        const nk = k.trim(); if (!nk) continue;
        cleanAttrs[nk] = v;
      }
      const payload: Partial<Product> = {
        styleNumber: styleNumber.trim(),
        title: title.trim(),
        description: desc,
        status,
        size: size.trim(),           // you can change size of this row
        attributes: cleanAttrs,
      };
      const cents = minorFromPounds(pricePounds);
      if (typeof cents === "number") payload.price = cents;

      const { data } = await api.patch<Product>(`/api/products/${product._id}`, { product: payload });
      setProduct(data);
      setStyleNumber(data.styleNumber || payload.styleNumber || "");
      setTitle(data.title || payload.title || "");
      setDesc(data.description || payload.description || "");
      setStatus(data.status || payload.status || "draft");
      setPricePounds(poundsFromMinor(data.price ?? cents));
      setSize(data.size || payload.size || "");

      // re-fetch sizes (in case style/price changed)
      await loadSizesForProduct(data._id);

      alert("Saved ✅");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function onArchive() {
    if (!product) return;
    if (!confirm("Archive this product?")) return;
    try {
      await api.delete(`/api/products/${product._id}`);
      alert("Product archived.");
      router.replace("/Products");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to archive product.");
    }
  }

  /* ---------- quantity editing per row ---------- */
  const onChangeQty = (rowId: string, val: string) => {
    const nextQty = toNonNegInt(val);
    setSizes((prev) =>
      prev.map((r) => (r._id === rowId ? { ...r, quantity: nextQty } : r))
    );
  };

  const saveQty = async (row: Product) => {
    try {
      setSavingRowId(row._id);
      // Controller accepts either { quantity } or { product: { quantity } }
      const { data } = await api.patch<Product>(`/api/products/${row._id}`, {
        quantity: toNonNegInt(row.quantity ?? 0),
      });
      // reflect server canonical values (including updatedAt)
      setSizes((prev) => prev.map((r) => (r._id === row._id ? { ...r, quantity: data.quantity, updatedAt: data.updatedAt } : r)));
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to update quantity.");
    } finally {
      setSavingRowId(null);
    }
  };

  /* ---------- UI ---------- */
  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!product) return <div className="p-4">Not found.</div>;

  return (
    <div className="p-4 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Product</h1>
        <Link href="/Products" className="underline">Back to Products</Link>
      </div>

      {/* Core form */}
      <form onSubmit={onSave} className="space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label className="m-2">Style number</Label>
            <Input value={styleNumber} onChange={(e) => setStyleNumber(e.target.value)} required />
          </div>

          <div>
            <Label className="m-2">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div>
            <Label className="m-2">Price (£)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={pricePounds}
              onChange={(e) => setPricePounds(e.target.value)}
              placeholder="e.g. 79.99"
              required
            />
          </div>

          <div>
            <Label className="m-2">Status</Label>
            <select
              className="w-full h-10 border rounded px-3"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className="m-2">Size</Label>
            <Input value={size} onChange={(e) => setSize(e.target.value)} required className="w-40" />
          </div>

          <div className="md:col-span-2">
            <Label className="m-2">Description</Label>
            <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </section>

        {/* Attributes editor */}
        <section className="border rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Attributes</h2>
            <Button type="button" variant="secondary" onClick={addAttrRow}>Add row</Button>
          </div>

          {attrPairs.length === 0 && (
            <p className="text-sm text-muted-foreground">No attributes yet.</p>
          )}

          {attrPairs.map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input value={k} onChange={(e) => updateAttrKey(k, e.target.value)} placeholder="key (e.g., brand)" />
              <Input value={v} onChange={(e) => updateAttrVal(k, e.target.value)} placeholder="value (e.g., Aurum)" />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => updateAttrVal(k, "")}>Clear</Button>
                <Button type="button" variant="destructive" onClick={() => removeAttr(k)}>Remove</Button>
              </div>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save product"}</Button>
          <Button type="button" variant="secondary" onClick={() => loadProduct()}>
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button type="button" variant="destructive" className="ml-auto" onClick={onArchive}>
            <Trash2 className="h-4 w-4 mr-2" /> Archive product
          </Button>
        </div>
      </form>

      {/* ---------- Bottom: ONLY sizes for THIS product's style ---------- */}
      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">
            Sizes for style <span className="font-mono">{product.styleNumber}</span>
          </h2>
          <Button type="button" variant="outline" onClick={() => product && loadSizesForProduct(product._id)}>
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh sizes
          </Button>
        </div>

        {sizesError && <div className="text-red-600 text-sm">{sizesError}</div>}

        <div className="overflow-x-auto border rounded">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100">
                <TableHead>Style No.</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Qty</TableHead> {/* 👈 NEW */}
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Open</TableHead>
                <TableHead>Action</TableHead> {/* 👈 NEW */}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sizesLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-gray-500 py-6">
                    Loading sizes…
                  </TableCell>
                </TableRow>
              ) : sizes.length > 0 ? (
                sizes.map((row) => (
                  <TableRow key={row._id} className={row._id === product._id ? "bg-indigo-50/50" : ""}>
                    <TableCell className="font-mono">{row.styleNumber}</TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-gray-50">
                        {row.size}
                      </span>
                    </TableCell>

                    {/* 👇 Editable quantity */}
                    <TableCell className="w-36">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="tabular-nums"
                        value={String(row.quantity ?? 0)}
                        onChange={(e) => onChangeQty(row._id, e.target.value)}
                      />
                    </TableCell>

                    <TableCell>{row.status}</TableCell>
                    <TableCell>{fmtGBP(row.price)}</TableCell>
                    <TableCell>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell>
                      <Link href={`/Products/${row._id}`} className="text-indigo-600 hover:underline">
                        View
                      </Link>
                    </TableCell>

                    {/* Save button per row */}
                    <TableCell className="w-28">
                      <Button size="sm" onClick={() => saveQty(row)} disabled={savingRowId === row._id}>
                        {savingRowId === row._id ? "Saving…" : "Save"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-gray-500 py-6">
                    No sizes found for this style.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
