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
import {
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";

/* ---------- Types ---------- */
type Size = {
  _id: string;
  label: string;
  barcode: string;
  totalQuantity?: number;
  reservedTotal?: number;
  sellableQuantity?: number;
};

type Variant = {
  _id: string;
  sku: string;
  status?: "active" | "inactive";
  color?: { name?: string; code?: string };
  sizes?: Size[];
};

type ProductDeep = {
  _id: string;
  styleNumber: string;
  title: string;
  description?: string;
  price: number; // pence
  status: "active" | "inactive" | "draft" | "archived";
  attributes?: Record<string, any>;
  variants?: Variant[];
};

const PRODUCT_STATUSES: ProductDeep["status"][] = [
  "active",
  "inactive",
  "draft",
  "archived",
];
const VARIANT_STATUSES: Nonnullable<Variant["status"]>[] = [
  "active",
  "inactive",
];

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
function rand(n = 5) {
  return Math.random().toString(36).slice(-n).toUpperCase();
}
function tokenize(s: string) {
  return (s || "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}
/** Parse "S,M,L" or "S:10,M:5,UK 8:0" -> [{label, quantity}] */
function parseSizesInput(
  input: string,
  defaultQty: number
): Array<{ label: string; quantity: number }> {
  const out: Array<{ label: string; quantity: number }> = [];
  for (const raw of (input || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)) {
    const [labelPart, qtyPart] = raw.split(":");
    const label = (labelPart || "").trim();
    if (!label) continue;
    let qty = defaultQty;
    if (qtyPart != null && qtyPart.trim() !== "") {
      const qn = Number(qtyPart);
      if (Number.isFinite(qn) && qn >= 0) qty = qn;
    }
    out.push({ label, quantity: qty });
  }
  return out;
}

function sum(ns: number[]) {
  return ns.reduce((a, b) => a + b, 0);
}
function variantTotals(v?: Variant) {
  const sizes = v?.sizes || [];
  const total = sum(sizes.map((s) => s.totalQuantity || 0));
  const reserved = sum(sizes.map((s) => s.reservedTotal || 0));
  const sellable = sum(
    sizes.map(
      (s) =>
        s.sellableQuantity ??
        Math.max(0, (s.totalQuantity || 0) - (s.reservedTotal || 0))
    )
  );
  return { total, reserved, sellable };
}

/* ---------- Size editor draft ---------- */
type SizeDraft = {
  _id: string;
  label: string;
  barcode: string;
  // Optional quick stock adjust (single location)
  onHand?: number | "";
  reserved?: number | "";
  location?: string;
};

export default function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sizesInput, setSizesInput] = useState("");
  const [defQty, setDefQty] = useState<number>(0);
  const [loc, setLoc] = useState("WH-DEFAULT");

  // product fields
  const [styleNumber, setStyleNumber] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pricePounds, setPricePounds] = useState("");
  const [status, setStatus] = useState<ProductDeep["status"]>("draft");
  const [attributes, setAttributes] = useState<Record<string, string>>({});

  // variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // inline edit for a variant
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [draftVariant, setDraftVariant] = useState<Variant | null>(null);

  // size inline edit
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [sizeDraft, setSizeDraft] = useState<SizeDraft | null>(null);

  // add new variant (+ multiple sizes)
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVariant, setNewVariant] = useState<{
    sku: string;
    colorName: string;
    colorCode: string;
    status: "active" | "inactive";
    sizesInput: string; // e.g. "S,M,L" or "S:10,M:5"
    defaultQty: number; // used when a size has no :qty
    location: string; // inventory location for created sizes
  }>({
    sku: "",
    colorName: "",
    colorCode: "",
    status: "active",
    sizesInput: "",
    defaultQty: 0,
    location: "WH-DEFAULT",
  });

  /* ---------- Load product deep ---------- */
  async function refreshProduct() {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get<ProductDeep>(`/api/products/${id}`);
      setStyleNumber(data.styleNumber || "");
      setTitle(data.title || "");
      setDesc(data.description || "");
      setPricePounds(poundsFromMinor(data.price));
      setStatus(data.status || "draft");

      const attrs: Record<string, string> = {};
      if (data.attributes && typeof data.attributes === "object") {
        Object.entries(data.attributes).forEach(([k, v]) => {
          attrs[k] = v != null ? String(v) : "";
        });
      }
      setAttributes(attrs);

      setVariants(data.variants || []);
      setEditingVariantId(null);
      setDraftVariant(null);
      setEditingSizeId(null);
      setSizeDraft(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to load product.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    refreshProduct();
  }, [id]);

  /* ---------- Attributes editor ---------- */
  const attrPairs = useMemo(() => Object.entries(attributes), [attributes]);

  function addAttrRow() {
    let i = 1;
    let key = "key";
    while (attributes[key]) {
      i += 1;
      key = `key${i}`;
    }
    setAttributes((a) => ({ ...a, [key]: "" }));
  }
  function updateAttrKey(oldKey: string, newKey: string) {
    if (!newKey || newKey === oldKey) return;
    setAttributes((attrs) => {
      const next: Record<string, string> = {};
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === oldKey) next[newKey] = v;
        else next[k] = v;
      });
      return next;
    });
  }
  function updateAttrVal(k: string, v: string) {
    setAttributes((a) => ({ ...a, [k]: v }));
  }
  function removeAttr(k: string) {
    setAttributes((a) => {
      const { [k]: _, ...rest } = a;
      return rest;
    });
  }

  /* ---------- Save product core ---------- */
  async function onSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const cleanAttrs: Record<string, any> = {};
      for (const [k, v] of Object.entries(attributes)) {
        if (!k.trim()) continue;
        cleanAttrs[k.trim()] = v;
      }
      const payload: Partial<ProductDeep> = {
        styleNumber: styleNumber.trim(),
        title: title.trim(),
        description: desc,
        status,
        attributes: cleanAttrs,
      };
      const cents = minorFromPounds(pricePounds);
      if (typeof cents === "number") payload.price = cents;

      const { data } = await api.patch(`/api/products/${id}`, payload);
      setStyleNumber(data.styleNumber || payload.styleNumber || "");
      setTitle(data.title || payload.title || "");
      setDesc(data.description || payload.description || "");
      setStatus(data.status || payload.status || "draft");
      setPricePounds(poundsFromMinor(data.price ?? cents));
      alert("Saved ✅");
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteProduct() {
    if (!confirm("Archive this product (and its variants & sizes)?")) return;
    try {
      const { data } = await api.delete(`/api/products/${id}`);
      if (data?.deleted || data?.ok || true) {
        alert("Product archived.");
        router.replace("/products");
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to delete product.");
    }
  }

  /* ---------- Variant helpers ---------- */
  function updateVariantLocal(vId: string, patch: Partial<Variant>) {
    setVariants((prev) =>
      prev.map((v) =>
        v._id === vId
          ? {
              ...v,
              ...patch,
              color: { ...(v.color || {}), ...(patch.color || {}) },
            }
          : v
      )
    );
  }

  async function saveVariant(v: Variant) {
    try {
      const payload: Partial<Variant> = {
        sku: v.sku,
        status: (v.status as any) || "active",
        color: { name: v.color?.name || "", code: v.color?.code || undefined },
      };
      const { data } = await api.patch(
        `/api/products/variants/${v._id}`,
        payload
      );
      updateVariantLocal(v._id, {
        sku: data.sku ?? payload.sku ?? v.sku,
        status: data.status ?? payload.status ?? v.status,
        color: data.color ?? payload.color ?? v.color,
      });
      setEditingVariantId(null);
      setDraftVariant(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to save variant.");
    }
  }

  async function deleteVariant(vId: string) {
    if (!confirm("Delete this color and all its sizes?")) return;
    try {
      await api.delete(`/api/products/variants/${vId}`);
      setVariants((prev) => prev.filter((v) => v._id !== vId));
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to delete variant.");
    }
  }

  /** ADD VARIANT with MULTIPLE SIZES (comma-separated) */
  async function addVariant() {
    // basic checks
    if (!newVariant.sku.trim() || !newVariant.colorName.trim()) {
      alert("SKU and Color name are required.");
      return;
    }
    const sizeEntries = parseSizesInput(
      newVariant.sizesInput,
      Math.max(0, Number(newVariant.defaultQty || 0))
    );
    if (sizeEntries.length === 0) {
      alert('Add at least one size (e.g., "S,M,L" or "S:10,M:5").');
      return;
    }

    const cleanSku = newVariant.sku.trim().toUpperCase();

    try {
      // 1) create variant (color-level)
      const { data: created } = await api.post(`/api/products/${id}/variants`, {
        sku: cleanSku,
        color: {
          name: newVariant.colorName.trim(),
          code: newVariant.colorCode.trim() || undefined,
        },
        media: [],
        status: newVariant.status,
      });

      // obtain variantId (fallback to refresh+find)
      let variantId: string | undefined = created?._id;
      if (!variantId) {
        await refreshProduct();
        const v = (variants || []).find(
          (x) => x.sku?.toUpperCase() === cleanSku
        );
        variantId = v?._id;
      }

      // 2) create sizes under the newly created variant
      if (variantId) {
        const location = (newVariant.location || "WH-DEFAULT").trim();

        await Promise.allSettled(
          sizeEntries.map(async ({ label, quantity }) => {
            const sizeTok = tokenize(label || "OS");
            const barcode = `${cleanSku}-${sizeTok}-${rand(5)}`;

            return api.post(`/api/products/variants/${variantId}/sizes`, {
              label: label || "OS",
              barcode,
              inventory: [
                {
                  location,
                  onHand: Math.max(0, Number(quantity || 0)),
                  reserved: 0,
                },
              ],
            });
          })
        );
      }

      // 3) cleanup and refresh UI
      await refreshProduct();
      setNewVariant({
        sku: "",
        colorName: "",
        colorCode: "",
        status: "active",
        sizesInput: "",
        defaultQty: 0,
        location: "WH-DEFAULT",
      });
      setAddingVariant(false);
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to add variant.");
    }
  }

  /* ---------- Size actions ---------- */
  function startEditSize(s: Size, opts?: { location?: string }) {
    setEditingSizeId(s._id);
    setSizeDraft({
      _id: s._id,
      label: s.label,
      barcode: s.barcode,
      onHand: s.totalQuantity ?? "",
      reserved: s.reservedTotal ?? "",
      location: opts?.location || "WH-DEFAULT",
    });
  }
  function cancelEditSize() {
    setEditingSizeId(null);
    setSizeDraft(null);
  }
  async function saveSize() {
    if (!editingSizeId || !sizeDraft) return;
    try {
      const payload: any = {
        label: (sizeDraft.label || "").trim(),
        barcode: (sizeDraft.barcode || "").trim(),
      };
      const hasStockEdit =
        (sizeDraft.onHand !== "" && sizeDraft.onHand != null) ||
        (sizeDraft.reserved !== "" && sizeDraft.reserved != null);
      if (hasStockEdit) {
        payload.inventory = [
          {
            location: sizeDraft.location || "WH-DEFAULT",
            onHand:
              sizeDraft.onHand === "" || sizeDraft.onHand == null
                ? undefined
                : Math.max(0, Number(sizeDraft.onHand)),
            reserved:
              sizeDraft.reserved === "" || sizeDraft.reserved == null
                ? undefined
                : Math.max(0, Number(sizeDraft.reserved)),
          },
        ];
      }

      await api.patch(`/api/products/sizes/${editingSizeId}`, payload);
      await refreshProduct();
      setEditingSizeId(null);
      setSizeDraft(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to save size.");
    }
  }
  async function deleteSize(sizeId: string) {
    if (!confirm("Delete this size?")) return;
    try {
      await api.delete(`/api/products/sizes/${sizeId}`);
      await refreshProduct();
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to delete size.");
    }
  }

  /* ---------- Add more sizes to an existing variant ---------- */
  async function addSizesToVariant(
    variantId: string,
    sku: string,
    sizesInput: string,
    defaultQty: number,
    location: string
  ) {
    const sizeEntries = parseSizesInput(
      sizesInput,
      Math.max(0, Number(defaultQty || 0))
    );
    if (sizeEntries.length === 0) {
      alert('Add at least one size (e.g., "S,M,L" or "S:10,M:5").');
      return;
    }
    try {
      await Promise.allSettled(
        sizeEntries.map(({ label, quantity }) => {
          const sizeTok = tokenize(label || "OS");
          const barcode = `${sku}-${sizeTok}-${rand(5)}`;
          return api.post(`/api/products/variants/${variantId}/sizes`, {
            label: label || "OS",
            barcode,
            inventory: [
              {
                location: (location || "WH-DEFAULT").trim(),
                onHand: Math.max(0, Number(quantity || 0)),
                reserved: 0,
              },
            ],
          });
        })
      );
      await refreshProduct();
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to add sizes.");
    }
  }

  /* ---------- UI helpers ---------- */
  function toggleExpand(vId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(vId)) next.delete(vId);
      else next.add(vId);
      return next;
    });
  }
  function renderSizeChips(sizes?: Size[], onChipClick?: (s: Size) => void) {
    if (!sizes || sizes.length === 0) return <span>—</span>;
    const max = 8;
    const head = sizes.slice(0, max);
    const extra = sizes.length - head.length;

    return (
      <div className="flex flex-wrap gap-1">
        {head.map((s) =>
          onChipClick ? (
            <button
              key={s._id}
              type="button"
              onClick={() => onChipClick(s)}
              className="px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
              title={`Edit ${s.label}`}
            >
              {s.label}
            </button>
          ) : (
            <span
              key={s._id}
              className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800"
              title={s.label}
            >
              {s.label}
            </span>
          )
        )}
        {extra > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
            +{extra} more
          </span>
        )}
      </div>
    );
  }

  function openSizeEditor(variantId: string, s: Size) {
    // Ensure the row is expanded, then start editing
    setExpanded((prev) => new Set(prev).add(variantId));
    startEditSize(s);
  }

  /* ---------- UI ---------- */
  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-600">{err}</div>;

  return (
    <div className="p-4 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Product</h1>
        <Link href="/Products" className="underline">
          Back to Products
        </Link>
      </div>

      {/* Product core form */}
      <form onSubmit={onSaveProduct} className="space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label className="m-2">Style number</Label>
            <Input
              value={styleNumber}
              onChange={(e) => setStyleNumber(e.target.value)}
              required
            />
          </div>
          <div>
            <Label className="m-2">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <Label className="m-2">Price ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={pricePounds}
              onChange={(e) => setPricePounds(e.target.value)}
              placeholder="e.g. 79.99"
            />
          </div>

          <div>
            <Label className="m-2">Status</Label>
            <select
              className="w-full h-10 border rounded px-3"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as ProductDeep["status"])
              }
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <Label className="m-2">Description</Label>
            <Textarea
              rows={4}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
        </section>

        {/* Attributes editor */}
        <section className="border rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Attributes</h2>
            <Button type="button" variant="secondary" onClick={addAttrRow}>
              Add row
            </Button>
          </div>

          {attrPairs.length === 0 && (
            <p className="text-sm text-muted-foreground">No attributes yet.</p>
          )}

          {attrPairs.map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input
                value={k}
                onChange={(e) => updateAttrKey(k, e.target.value)}
                placeholder="key (e.g., brand)"
              />
              <Input
                value={v}
                onChange={(e) => updateAttrVal(k, e.target.value)}
                placeholder="value (e.g., Aurum)"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => updateAttrVal(k, "")}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => removeAttr(k)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save product"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.refresh()}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="ml-auto"
            onClick={onDeleteProduct}
          >
            Archive product
          </Button>
        </div>
      </form>

      {/* ------- VARIANTS (Editable table) ------- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Colors and Sizes</h2>

          {!addingVariant ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddingVariant(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Color & Sizes
            </Button>
          ) : (
            <div className="w-full border rounded p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <Label className="m-2">SKU</Label>
                  <Input
                    value={newVariant.sku}
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, sku: e.target.value })
                    }
                    placeholder="e.g., STY-100001-BLK"
                  />
                </div>
                <div>
                  <Label className="m-2">Color name</Label>
                  <Input
                    value={newVariant.colorName}
                    onChange={(e) =>
                      setNewVariant({
                        ...newVariant,
                        colorName: e.target.value,
                      })
                    }
                    placeholder="Black"
                  />
                </div>
                <div>
                  <Label className="m-2">Color code (optional)</Label>
                  <Input
                    value={newVariant.colorCode}
                    onChange={(e) =>
                      setNewVariant({
                        ...newVariant,
                        colorCode: e.target.value,
                      })
                    }
                    placeholder="#111111"
                  />
                </div>
                <div>
                  <Label className="m-2">Status</Label>
                  <select
                    className="w-full h-10 border rounded px-3"
                    value={newVariant.status}
                    onChange={(e) =>
                      setNewVariant({
                        ...newVariant,
                        status: e.target.value as "active" | "inactive",
                      })
                    }
                  >
                    {VARIANT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="m-2">Location</Label>
                  <Input
                    value={newVariant.location}
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, location: e.target.value })
                    }
                    placeholder="WH-DEFAULT"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label className="m-2">Sizes</Label>
                  <Input
                    value={newVariant.sizesInput}
                    onChange={(e) =>
                      setNewVariant({
                        ...newVariant,
                        sizesInput: e.target.value,
                      })
                    }
                    placeholder='OS / "S,M,L" or "S:10,M:5,UK 8:0"'
                  />
                </div>
                <div>
                  <Label className="m-2">Default Qty</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newVariant.defaultQty}
                    onChange={(e) =>
                      setNewVariant({
                        ...newVariant,
                        defaultQty: Math.max(0, Number(e.target.value || 0)),
                      })
                    }
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" onClick={addVariant}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAddingVariant(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100">
                <TableHead />
                <TableHead className="font-semibold">SKU</TableHead>
                <TableHead className="font-semibold">Color</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Qty</TableHead>
                <TableHead className="font-semibold">Sizes</TableHead>
                <TableHead className="font-semibold text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-6 text-gray-500"
                  >
                    No Colors yet.
                  </TableCell>
                </TableRow>
              ) : (
                variants.map((v) => {
                  const isEditing = editingVariantId === v._id;
                  const draft = isEditing ? draftVariant : null;

                  return (
                    <React.Fragment key={v._id}>
                      <TableRow>
                        {/* Expand/Collapse */}
                        <TableCell className="w-10">
                          <button
                            className="p-1 rounded hover:bg-gray-100"
                            onClick={() => toggleExpand(v._id)}
                            title={
                              expanded.has(v._id) ? "Hide sizes" : "Show sizes"
                            }
                          >
                            {expanded.has(v._id) ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                          </button>
                        </TableCell>

                        {/* SKU */}
                        <TableCell className="align-middle">
                          {isEditing ? (
                            <Input
                              value={draft?.sku || ""}
                              onChange={(e) =>
                                setDraftVariant((d) =>
                                  d ? { ...d, sku: e.target.value } : d
                                )
                              }
                            />
                          ) : (
                            <span className="font-mono">{v.sku}</span>
                          )}
                        </TableCell>

                        {/* Color name */}
                        <TableCell className="align-middle">
                          {isEditing ? (
                            <Input
                              value={draft?.color?.name || ""}
                              onChange={(e) =>
                                setDraftVariant((d) =>
                                  d
                                    ? {
                                        ...d,
                                        color: {
                                          ...(d.color || {}),
                                          name: e.target.value,
                                        },
                                      }
                                    : d
                                )
                              }
                            />
                          ) : (
                            v.color?.name || "—"
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="align-middle">
                          {isEditing ? (
                            <select
                              className="w-full h-10 border rounded px-3"
                              value={draft?.status || "active"}
                              onChange={(e) =>
                                setDraftVariant((d) =>
                                  d
                                    ? {
                                        ...d,
                                        status: e.target.value as any,
                                      }
                                    : d
                                )
                              }
                            >
                              {VARIANT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            v.status || "active"
                          )}
                        </TableCell>

                        {/* Variant total quantity */}
                        <TableCell className="align-middle">
                          {variantTotals(v).total}
                        </TableCell>

                        {/* Size chips (click to edit) */}
                        <TableCell className="align-middle">
                          {renderSizeChips(v.sizes, (s) =>
                            openSizeEditor(v._id, s)
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="align-middle text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => draft && saveVariant(draft)}
                              >
                                <Check className="h-4 w-4 mr-2" />
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setEditingVariantId(null);
                                  setDraftVariant(null);
                                }}
                              >
                                <XIcon className="h-4 w-4 mr-2" />
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setEditingVariantId(v._id);
                                  setDraftVariant({
                                    _id: v._id,
                                    sku: v.sku,
                                    status: v.status || "active",
                                    color: {
                                      name: v.color?.name || "",
                                      code: v.color?.code || "",
                                    },
                                  });
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteVariant(v._id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete color
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded: quick color-level qty editor + sizes table */}
                      {expanded.has(v._id) && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-gray-50">
                            {/* Quick quantity editor (color level, pick a size) */}
                            <div className="border rounded p-3 mb-3">
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                                <div className="md:col-span-2">
                                  <Label className="m-2">Size to edit</Label>
                                  <select
                                    className="w-full h-10 border rounded px-3"
                                    value={
                                      sizeDraft?._id &&
                                      v.sizes?.some(
                                        (s) => s._id === sizeDraft._id
                                      )
                                        ? sizeDraft._id
                                        : v.sizes?.[0]?._id || ""
                                    }
                                    onChange={(e) => {
                                      const s = v.sizes?.find(
                                        (x) => x._id === e.target.value
                                      );
                                      if (s) {
                                        setEditingSizeId(s._id);
                                        setSizeDraft({
                                          _id: s._id,
                                          label: s.label,
                                          barcode: s.barcode,
                                          onHand: s.totalQuantity ?? "",
                                          reserved: s.reservedTotal ?? "",
                                          location: "WH-DEFAULT",
                                        });
                                      }
                                    }}
                                  >
                                    {(v.sizes || []).map((s) => (
                                      <option key={s._id} value={s._id}>
                                        {s.label} (qty {s.totalQuantity ?? 0})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <Label className="m-2">On hand</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={sizeDraft?.onHand ?? ""}
                                    onChange={(e) =>
                                      setSizeDraft((d) =>
                                        d
                                          ? {
                                              ...d,
                                              onHand:
                                                e.target.value === ""
                                                  ? ""
                                                  : Math.max(
                                                      0,
                                                      Number(e.target.value)
                                                    ),
                                            }
                                          : d
                                      )
                                    }
                                    placeholder="leave blank"
                                  />
                                </div>
                                <div>
                                  <Label className="m-2">Reserved</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={sizeDraft?.reserved ?? ""}
                                    onChange={(e) =>
                                      setSizeDraft((d) =>
                                        d
                                          ? {
                                              ...d,
                                              reserved:
                                                e.target.value === ""
                                                  ? ""
                                                  : Math.max(
                                                      0,
                                                      Number(e.target.value)
                                                    ),
                                            }
                                          : d
                                      )
                                    }
                                    placeholder="leave blank"
                                  />
                                </div>
                                <div>
                                  <Label className="m-2">Location</Label>
                                  <Input
                                    value={sizeDraft?.location ?? "WH-DEFAULT"}
                                    onChange={(e) =>
                                      setSizeDraft((d) =>
                                        d
                                          ? { ...d, location: e.target.value }
                                          : d
                                      )
                                    }
                                  />
                                </div>
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    onClick={saveSize}
                                    disabled={!editingSizeId || !sizeDraft}
                                  >
                                    <Check className="h-4 w-4 mr-2" />
                                    Save quantity
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Add more sizes to this variant */}
                            <div className="border rounded p-3 mb-3">
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                                <div className="md:col-span-3">
                                  <Label className="m-2">Add sizes</Label>
                                  <Input
                                    value={sizesInput}
                                    onChange={(e) =>
                                      setSizesInput(e.target.value)
                                    }
                                    placeholder='e.g. "S,M,L" or "S:10,M:5,XL:2"'
                                  />
                                </div>
                                <div>
                                  <Label className="m-2">Default Qty</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={defQty}
                                    onChange={(e) =>
                                      setDefQty(
                                        Math.max(0, Number(e.target.value || 0))
                                      )
                                    }
                                    placeholder="0"
                                  />
                                </div>
                                <div>
                                  <Label className="m-2">Location</Label>
                                  <Input
                                    value={loc}
                                    onChange={(e) => setLoc(e.target.value)}
                                    placeholder="WH-DEFAULT"
                                  />
                                </div>
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    onClick={() =>
                                      addSizesToVariant(
                                        v._id,
                                        v.sku,
                                        sizesInput,
                                        defQty,
                                        loc
                                      )
                                    }
                                  >
                                    Add sizes
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Sizes table */}
                            {v.sizes && v.sizes.length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-gray-100">
                                      <th className="text-left p-2">Size</th>
                                      <th className="text-left p-2">Barcode</th>
                                      <th className="text-left p-2">Total</th>
                                      <th className="text-left p-2">
                                        Reserved
                                      </th>
                                      <th className="text-left p-2">
                                        Sellable
                                      </th>
                                      <th className="text-right p-2">
                                        Actions
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {v.sizes.map((s) => {
                                      const isSizeEditing =
                                        editingSizeId === s._id;
                                      return (
                                        <tr key={s._id} className="border-t">
                                          {/* Size label */}
                                          <td className="p-2 align-middle">
                                            {isSizeEditing ? (
                                              <Input
                                                value={sizeDraft?.label ?? ""}
                                                onChange={(e) =>
                                                  setSizeDraft((d) =>
                                                    d
                                                      ? {
                                                          ...d,
                                                          label: e.target.value,
                                                        }
                                                      : d
                                                  )
                                                }
                                              />
                                            ) : (
                                              s.label
                                            )}
                                          </td>

                                          {/* Barcode */}
                                          <td className="p-2 align-middle">
                                            {isSizeEditing ? (
                                              <Input
                                                value={sizeDraft?.barcode ?? ""}
                                                onChange={(e) =>
                                                  setSizeDraft((d) =>
                                                    d
                                                      ? {
                                                          ...d,
                                                          barcode:
                                                            e.target.value,
                                                        }
                                                      : d
                                                  )
                                                }
                                              />
                                            ) : (
                                              <span className="font-mono">
                                                {s.barcode}
                                              </span>
                                            )}
                                          </td>

                                          {/* Totals (display) */}
                                          <td className="p-2 align-middle">
                                            {s.totalQuantity ?? "—"}
                                          </td>
                                          <td className="p-2 align-middle">
                                            {s.reservedTotal ?? "—"}
                                          </td>
                                          <td className="p-2 align-middle">
                                            {s.sellableQuantity ?? "—"}
                                          </td>

                                          {/* Actions / inline save */}
                                          <td className="p-2 align-middle text-right">
                                            {isSizeEditing ? (
                                              <div className="flex flex-col gap-2 items-end">
                                                {/* Optional quick stock adjust */}
                                                <div className="grid grid-cols-3 gap-2 w-full md:w-2/3">
                                                  <div>
                                                    <Label className="m-2 text-xs">
                                                      On hand (opt.)
                                                    </Label>
                                                    <Input
                                                      type="number"
                                                      min={0}
                                                      value={
                                                        sizeDraft?.onHand ?? ""
                                                      }
                                                      onChange={(e) => {
                                                        const v =
                                                          e.target.value;
                                                        setSizeDraft((d) =>
                                                          d
                                                            ? {
                                                                ...d,
                                                                onHand:
                                                                  v === ""
                                                                    ? ""
                                                                    : Math.max(
                                                                        0,
                                                                        Number(
                                                                          v
                                                                        )
                                                                      ),
                                                              }
                                                            : d
                                                        );
                                                      }}
                                                      placeholder="leave blank"
                                                    />
                                                  </div>
                                                  <div>
                                                    <Label className="m-2 text-xs">
                                                      Reserved (opt.)
                                                    </Label>
                                                    <Input
                                                      type="number"
                                                      min={0}
                                                      value={
                                                        sizeDraft?.reserved ??
                                                        ""
                                                      }
                                                      onChange={(e) => {
                                                        const v =
                                                          e.target.value;
                                                        setSizeDraft((d) =>
                                                          d
                                                            ? {
                                                                ...d,
                                                                reserved:
                                                                  v === ""
                                                                    ? ""
                                                                    : Math.max(
                                                                        0,
                                                                        Number(
                                                                          v
                                                                        )
                                                                      ),
                                                              }
                                                            : d
                                                        );
                                                      }}
                                                      placeholder="leave blank"
                                                    />
                                                  </div>
                                                  <div>
                                                    <Label className="m-2 text-xs">
                                                      Location
                                                    </Label>
                                                    <Input
                                                      value={
                                                        sizeDraft?.location ??
                                                        "WH-DEFAULT"
                                                      }
                                                      onChange={(e) =>
                                                        setSizeDraft((d) =>
                                                          d
                                                            ? {
                                                                ...d,
                                                                location:
                                                                  e.target
                                                                    .value,
                                                              }
                                                            : d
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                </div>

                                                <div className="flex justify-end gap-2">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={saveSize}
                                                  >
                                                    <Check className="h-4 w-4 mr-2" />
                                                    Save
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={cancelEditSize}
                                                  >
                                                    <XIcon className="h-4 w-4 mr-2" />
                                                    Cancel
                                                  </Button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="flex justify-end gap-2">
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="secondary"
                                                  onClick={() =>
                                                    startEditSize(s)
                                                  }
                                                >
                                                  <Pencil className="h-4 w-4 mr-2" />
                                                  Edit
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="destructive"
                                                  onClick={() =>
                                                    deleteSize(s._id)
                                                  }
                                                >
                                                  <Trash2 className="h-4 w-4 mr-2" />
                                                  Delete
                                                </Button>
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="p-3 text-sm text-gray-600">
                                No sizes for this variant.
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
