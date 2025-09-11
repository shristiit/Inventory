"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import type {} from 'react';
const DRESS_TYPES: string[] = [
  "Ball Gown",
  "Bracelets",
  "Bridal",
  "Classic Prom",
  "Cocktail",
  "Curve Allure",
  "Curve Classic",
  "Curve Cocktail",
  "Earrings",
  "Evening Elegance",
  "Headpieces",
  "Jewellery",
  "Necklace",
  "Pageant",
  "Premium",
  "Red Carpet Glamour",
  "Rings",
];

// Preset sizes used in size pickers (same as Create Product)
const PRESET_SIZES: string[] = [
  "OS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  ...Array.from({ length: (34 - 2) / 2 + 1 }, (_, i) => String(2 + i * 2)),
];

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
  dressType?: string;
  attributes?: Record<string, any>;
  variants?: Variant[];
  media?: Array<{ url: string; type: 'image' | 'video'; isPrimary?: boolean; _id?: string }>;
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
function skuSuffixFromColor(name: string) {
  const letters = (name || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return letters.slice(0, 6) || "CLR";
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
  const searchParams = useSearchParams();
  const readOnly = (searchParams?.get('readonly') ?? '').toLowerCase() === '1' || (searchParams?.get('view') ?? '').toLowerCase() === 'readonly';

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
  const [dressType, setDressType] = useState<string>("");
  // category/subcategory/supplier (friendly names)
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [subcategorySuggestions, setSubcategorySuggestions] = useState<string[]>([]);
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([]);
  const categoryDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const subcategoryDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const supplierDebounceRef = useRef<NodeJS.Timeout | null>(null);
  // product media (existing + upload queue)
  const [productMedia, setProductMedia] = useState<Array<{ url: string; type: 'image' | 'video'; isPrimary?: boolean; _id?: string }>>([]);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);
  // variant media map (variantId -> media[])
  const [variantMedia, setVariantMedia] = useState<Record<string, Array<{ url: string; type: 'image' | 'video' }>>>({});
  // attributes removed from edit UI

  // variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // inline edit for a variant
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [draftVariant, setDraftVariant] = useState<Variant | null>(null);
  // Variant total quantity inline draft when editing
  const [variantQtyDraft, setVariantQtyDraft] = useState<Record<string, number | ''>>({});

  // size inline edit
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [sizeDraft, setSizeDraft] = useState<SizeDraft | null>(null);

  // add new variant (+ multiple sizes)
  const [addingVariant, setAddingVariant] = useState(false);
  // Color suggestions and chips (multi-color like Create)
  const [allColors, setAllColors] = useState<string[]>([]);
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  const colorDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [colorList, setColorList] = useState<string[]>([]);
  const [colorInput, setColorInput] = useState("");
  const [colorOpen, setColorOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const [newSelectedSizes, setNewSelectedSizes] = useState<string[]>([]);
  // Improved size picker (with backend sizes and checkbox grid)
  const [allSizes, setAllSizes] = useState<string[]>([]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizePickerRef = useRef<HTMLDivElement | null>(null);
  // Per-variant: add-more-sizes selection + new size inputs
  const [moreSelectedSizes, setMoreSelectedSizes] = useState<Record<string, string[]>>({});
  const [newSizeLabelMap, setNewSizeLabelMap] = useState<Record<string, string>>({});
  const [newSizeSavingMap, setNewSizeSavingMap] = useState<Record<string, boolean>>({});
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
      setDressType(data.dressType || "");
      // category/subcategory/supplier are stored as IDs; best-effort leave blank (user can set)
      setCategory("");
      setSubcategory("");
      setSupplier("");
      setProductMedia((data as any)?.media || []);

      // attributes ignored in edit UI

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

  // Load sizes from master for nicer picker
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/masters/sizes`, { params: { q: '', limit: 1000 } });
        const labels: string[] = Array.isArray(data)
          ? Array.from(new Set(
              data
                .map((s: any) => (typeof s === 'string' ? s : s?.label))
                .filter((n: any) => typeof n === 'string' && n.trim().length)
            )).sort((a,b)=>a.localeCompare(b))
          : [];
        setAllSizes(labels);
      } catch { setAllSizes([]); }
    })();
  }, []);

  // Close size dropdown when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!sizePickerRef.current) return;
      if (!sizePickerRef.current.contains(e.target as Node)) setSizeOpen(false);
    }
    if (sizeOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [sizeOpen]);

  // Load media per variant when variants change
  useEffect(() => {
    (async () => {
      const map: Record<string, Array<{ url: string; type: 'image' | 'video' }>> = {};
      await Promise.all(
        (variants || []).map(async (v) => {
          try {
            const { data } = await api.get(`/api/products/variants/${v._id}/media`);
            map[v._id] = Array.isArray(data) ? data : [];
          } catch {
            map[v._id] = [];
          }
        })
      );
      setVariantMedia(map);
    })();
  }, [variants]);

  // Load all colors once for local prefix search in Add Color & Sizes
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/masters/colors`, { params: { q: '', limit: 1000 } });
        const names: string[] = Array.isArray(data)
          ? Array.from(new Set(
              data
                .map((c: any) => (typeof c === 'string' ? c : c?.name))
                .filter((n: any) => typeof n === 'string' && n.trim().length)
            )).sort((a, b) => a.localeCompare(b))
          : [];
        setAllColors(names);
      } catch {
        setAllColors([]);
      }
    })();
  }, []);

  // Attributes editor removed

  /* ---------- Save product core ---------- */
  async function onSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload: Partial<ProductDeep> = {
        styleNumber: styleNumber.trim(),
        title: title.trim(),
        description: desc,
        status,
        dressType: dressType || undefined,
        // Friendly strings - backend will upsert and map to IDs
        ...(category ? { category } : {}),
        ...(subcategory ? { subcategory } : {}),
        ...(supplier ? { supplier } : {}),
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

      // If inline total quantity was edited, apply delta to first size
      const desired = variantQtyDraft[v._id];
      // Use live variant from state to compute current totals and sizes
      const live = (variants || []).find((x) => x._id === v._id);
      const currentTotal = variantTotals(live).total;
      const hasSizes = Array.isArray(live?.sizes) && (live!.sizes as any[]).length > 0;
      if (hasSizes && desired !== undefined && desired !== '' && Number.isFinite(Number(desired))) {
        const newTotal = Math.max(0, Number(desired));
        const delta = newTotal - currentTotal;
        if (delta !== 0) {
          const s0 = live!.sizes![0];
          const newOnHand = Math.max(0, (s0.totalQuantity || 0) + delta);
          try {
            await api.patch(`/api/products/sizes/${s0._id}`, {
              inventory: [{ location: 'WH-DEFAULT', onHand: newOnHand }],
            });
          } catch (e: any) {
            console.warn('Failed to adjust size quantity:', e?.response?.data || e);
          }
        }
      }
      await refreshProduct();
      setEditingVariantId(null);
      setDraftVariant(null);
      setVariantQtyDraft((m) => { const { [v._id]: _, ...rest } = m; return rest; });
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

  /** ADD VARIANT with MULTIPLE SIZES (supports multiple colors like Create) */
  async function addVariant() {
    // Colors: use selected chips if any; else fall back to single input
    const selectedColors = colorList.length ? colorList : (newVariant.colorName.trim() ? [newVariant.colorName] : []);
    if (!selectedColors.length) { alert('Add at least one color.'); return; }
    // Prefer selected sizes; fallback to free text
    let sizeEntries: Array<{ label: string; quantity: number }> = [];
    if (newSelectedSizes.length > 0) {
      const qty = Math.max(0, Number(newVariant.defaultQty || 0));
      sizeEntries = newSelectedSizes.map((label) => ({ label, quantity: qty }));
    } else {
      sizeEntries = parseSizesInput(
        newVariant.sizesInput,
        Math.max(0, Number(newVariant.defaultQty || 0))
      );
    }
    if (sizeEntries.length === 0) {
      alert('Add at least one size (e.g., "S,M,L" or "S:10,M:5").');
      return;
    }

    try {
      const cleanStyle = tokenize(styleNumber);
      for (const cnameRaw of selectedColors) {
        const cname = String(cnameRaw).trim();
        const suffix = skuSuffixFromColor(cname);
        const sku = cleanStyle ? `${cleanStyle}-${suffix}` : (newVariant.sku.trim().toUpperCase() || `${rand(6)}-${suffix}`);
        // 1) create variant (color-level)
        const { data: created } = await api.post(`/api/products/${id}/variants`, {
          sku,
          color: { name: cname, code: newVariant.colorCode.trim() || undefined },
          media: [],
          status: newVariant.status,
        });

        // obtain variantId (fallback to refresh+find)
        let variantId: string | undefined = created?._id;
        if (!variantId) {
          await refreshProduct();
          const v = (variants || []).find((x) => x.sku?.toUpperCase() === sku);
          variantId = v?._id;
        }

        // 2) create sizes under the newly created variant
        if (variantId) {
          const location = (newVariant.location || 'WH-DEFAULT').trim();
          await Promise.allSettled(
            sizeEntries.map(({ label, quantity }) => {
              const sizeTok = tokenize(label || 'OS');
              const barcode = `${sku}-${sizeTok}-${rand(5)}`;
              return api.post(`/api/products/variants/${variantId}/sizes`, {
                label: label || 'OS',
                barcode,
                inventory: [{ location, onHand: Math.max(0, Number(quantity || 0)), reserved: 0 }],
              });
            })
          );
        }
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
      setColorList([]);
      setColorInput('');
      setAddingVariant(false);
      setNewSelectedSizes([]);
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
  async function addSizesToVariantFromSelection(
    variantId: string,
    sku: string,
    labels: string[],
    defaultQty: number,
    location: string
  ) {
    if (!labels || labels.length === 0) {
      alert('Select at least one size.');
      return;
    }
    const qty = Math.max(0, Number(defaultQty || 0));
    try {
      await Promise.allSettled(
        labels.map((label) => {
          const sizeTok = tokenize(label || 'OS');
          const barcode = `${sku}-${sizeTok}-${rand(5)}`;
          return api.post(`/api/products/variants/${variantId}/sizes`, {
            label: label || 'OS',
            barcode,
            inventory: [{ location: (location || 'WH-DEFAULT').trim(), onHand: qty, reserved: 0 }],
          });
        })
      );
      await refreshProduct();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to add sizes.');
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
      {readOnly && (
        <div className="mb-2 text-xs text-gray-600">Read-only view (opened from barcode)</div>
      )}
      <form onSubmit={onSaveProduct} className="space-y-8">
        <fieldset disabled={readOnly} className={readOnly ? 'opacity-90' : ''}>
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

        {/* Category / Subcategory / Supplier */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 border rounded p-4">
          <div className="relative">
            <Label className="m-2">Category</Label>
            <Input
              value={category}
              onChange={(e) => {
                const v = e.target.value; setCategory(v);
                if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
                if (!v.trim()) { setCategorySuggestions([]); return; }
                categoryDebounceRef.current = setTimeout(async () => {
                  try {
                    const { data } = await api.get(`/api/masters/categories`, { params: { q: v, limit: 8 } });
                    const names: string[] = Array.isArray(data)
                      ? Array.from(new Set(data.map((x: any) => x?.name).filter((n: any) => typeof n === 'string')))
                      : [];
                    setCategorySuggestions(names);
                  } catch { setCategorySuggestions([]); }
                }, 200);
              }}
              placeholder="e.g., Dynasty"
            />
            {categorySuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow">
                {categorySuggestions.map((c) => (
                  <button key={c} type="button" className="w-full text-left px-2 py-1 hover:bg-gray-100" onClick={() => { setCategory(c); setCategorySuggestions([]); }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <Label className="m-2">Subcategory</Label>
            <Input
              value={subcategory}
              onChange={(e) => {
                const v = e.target.value; setSubcategory(v);
                if (subcategoryDebounceRef.current) clearTimeout(subcategoryDebounceRef.current);
                if (!v.trim()) { setSubcategorySuggestions([]); return; }
                subcategoryDebounceRef.current = setTimeout(async () => {
                  try {
                    const { data } = await api.get(`/api/masters/categories`, { params: { q: v, limit: 8 } });
                    const names: string[] = Array.isArray(data)
                      ? Array.from(new Set(data.map((x: any) => x?.name).filter((n: any) => typeof n === 'string')))
                      : [];
                    setSubcategorySuggestions(names);
                  } catch { setSubcategorySuggestions([]); }
                }, 200);
              }}
              placeholder="Optional"
            />
            {subcategorySuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow">
                {subcategorySuggestions.map((c) => (
                  <button key={c} type="button" className="w-full text-left px-2 py-1 hover:bg-gray-100" onClick={() => { setSubcategory(c); setSubcategorySuggestions([]); }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <Label className="m-2">Supplier</Label>
            <Input
              value={supplier}
              onChange={(e) => {
                const v = e.target.value; setSupplier(v);
                if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current);
                if (!v.trim()) { setSupplierSuggestions([]); return; }
                supplierDebounceRef.current = setTimeout(async () => {
                  try {
                    const { data } = await api.get(`/api/masters/suppliers`, { params: { q: v, limit: 8 } });
                    const names: string[] = Array.isArray(data)
                      ? Array.from(new Set(data.map((x: any) => x?.name).filter((n: any) => typeof n === 'string')))
                      : [];
                    setSupplierSuggestions(names);
                  } catch { setSupplierSuggestions([]); }
                }, 200);
              }}
              placeholder="Optional"
            />
            {supplierSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow">
                {supplierSuggestions.map((c) => (
                  <button key={c} type="button" className="w-full text-left px-2 py-1 hover:bg-gray-100" onClick={() => { setSupplier(c); setSupplierSuggestions([]); }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Product Media (upload and list) */}
        <section className="border rounded p-4 space-y-2">
          <h2 className="font-medium">Product Media</h2>
          <div className="flex items-start gap-3">
            <Input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={async (e) => {
                const inputEl = e.currentTarget;
                const files = Array.from(inputEl?.files || []);
                if (!files.length) return;
                setUploadFiles((prev) => [...prev, ...files]);
                const urls = files.map((f) => URL.createObjectURL(f));
                setUploadPreviews((prev) => [...prev, ...urls]);
                // Immediately upload
                try {
                  const fd = new FormData();
                  files.forEach((f) => fd.append('files', f));
                  const { data } = await api.post(`/api/products/${id}/media`, fd);
                  // Merge returned media into existing list
                  const added = (data?.media || []) as Array<{ url: string; type: 'image' | 'video'; isPrimary?: boolean }>;
                  if (added.length) setProductMedia((prev) => [...prev, ...added]);
                } catch (err) {
                  alert('Failed to upload media');
                } finally {
                  // cleanup previews queued
                  setUploadFiles([]);
                  uploadPreviews.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
                  setUploadPreviews([]);
                }
                if (inputEl) inputEl.value = '';
              }}
            />
          </div>
          {productMedia?.length ? (
            <ul className="mt-2 w-full space-y-1 text-sm">
              {productMedia.map((m, i) => (
                <li key={(m._id || m.url) + i} className="flex items-center justify-between gap-3 rounded border px-2 py-1">
                  <span className="truncate">{m.url.split('/').pop()} ({m.type})</span>
                  <button
                    type="button"
                    className="text-xs px-2 py-0.5 border rounded text-red-600"
                    title="Delete media"
                    onClick={async () => {
                      try {
                        await api.delete(`/api/products/${id}/media/${m._id}`);
                        setProductMedia((prev) => prev.filter((_, idx) => idx !== i));
                      } catch {
                        alert('Failed to delete media');
                      }
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">No product media yet.</p>
          )}
        </section>

        {/* Dress Type */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label className="m-2">Dress Type</Label>
            <select
              className="w-full h-10 border rounded px-3"
              value={dressType}
              onChange={(e) => setDressType(e.target.value)}
            >
              <option value="">None</option>
              {DRESS_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Attributes editor removed */}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || readOnly}>
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
            disabled={readOnly}
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
                  <Label className="m-2">Colors</Label>
                  <div ref={colorPickerRef} className="relative">
                    <Input
                      value={colorInput}
                      onChange={(e) => {
                        const v = e.target.value; setColorInput(v); setColorOpen(true);
                        const q = v.trim().toLowerCase();
                        if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
                        if (!q) { setColorOptions([]); return; }
                        const local = allColors.filter((n) => n.toLowerCase().includes(q)).slice(0, 15);
                        setColorOptions(local);
                        colorDebounceRef.current = setTimeout(async () => {
                          try {
                            const { data } = await api.get(`/api/masters/colors`, { params: { q: v, limit: 15 } });
                            const names: string[] = Array.isArray(data)
                              ? Array.from(new Set(data.map((c: any) => (typeof c === 'string' ? c : c?.name)).filter((n: any) => typeof n === 'string' && n.trim().length)))
                              : [];
                            if (names.length) setColorOptions(names);
                          } catch {}
                        }, 200);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = colorInput.trim();
                          if (!val) return;
                          try { await api.post('/api/masters/colors', { name: val }); } catch {}
                          const disp = val.toUpperCase();
                          setColorList((prev) => (prev.includes(disp) ? prev : [...prev, disp]));
                          setColorInput(''); setColorOptions([]); setColorOpen(false);
                        }
                      }}
                      onFocus={() => setColorOpen(true)}
                      placeholder="Search or add colors"
                    />
                    {colorOpen && colorOptions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded border bg-white shadow">
                        {colorOptions.map((name) => (
                          <button
                            type="button"
                            key={name}
                            className="w-full text-left px-2 py-1 hover:bg-gray-100"
                            onClick={() => {
                              const disp = name.toUpperCase();
                              setColorList((prev) => (prev.includes(disp) ? prev : [...prev, disp]));
                              setColorInput(''); setColorOptions([]); setColorOpen(false);
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                    {colorList.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {colorList.map((c, idx) => (
                          <span key={`${c}-${idx}`} className="inline-flex items-center bg-gray-100 border border-gray-300 rounded-full px-2 py-1 text-xs">
                            {c}
                            <button type="button" className="ml-2 text-gray-500 hover:text-gray-700" onClick={() => setColorList((prev) => prev.filter((_, i) => i !== idx))} aria-label={`Remove ${c}`}>
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
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
                  <div ref={sizePickerRef} className="relative">
                    <Input
                      readOnly
                      value={newSelectedSizes.length ? newSelectedSizes.join(', ') : ''}
                      onFocus={() => setSizeOpen(true)}
                      onClick={() => setSizeOpen(true)}
                      placeholder="Select size(s)"
                    />
                    {sizeOpen && (
                      <div className="absolute z-20 mt-1 w-full border rounded bg-white shadow p-2 max-h-56 overflow-auto">
                        <div className="grid grid-cols-3 gap-2">
                          {[...new Set([...PRESET_SIZES, ...allSizes])].map((sz) => {
                            const id = `new-sz-${sz}`;
                            const checked = newSelectedSizes.includes(sz);
                            return (
                              <label key={sz} htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  id={id}
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={(e) => {
                                    setNewSelectedSizes((prev) =>
                                      e.target.checked ? (prev.includes(sz) ? prev : [...prev, sz]) : prev.filter((s) => s !== sz)
                                    );
                                  }}
                                />
                                <span>{sz}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {newSelectedSizes.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Selected: {newSelectedSizes.join(', ')}</p>
                  )}
                  {/* Add new size (create in master and select) */}
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={newSizeLabelMap['__new'] || ''}
                      onChange={(e) => setNewSizeLabelMap((m) => ({ ...m, ['__new']: e.target.value }))}
                      placeholder="Add new size (e.g., XXL or EU 42)"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (newSizeLabelMap['__new'] || '').trim();
                          if (!val || newSizeSavingMap['__new']) return;
                          try {
                            setNewSizeSavingMap((m) => ({ ...m, ['__new']: true }));
                            await api.post('/api/masters/sizes', { label: val });
                            setAllSizes((prev) => Array.from(new Set([...(prev || []), val])).sort((a,b)=>a.localeCompare(b)));
                            setNewSelectedSizes((prev) => (prev.includes(val) ? prev : [...prev, val]));
                            setNewSizeLabelMap((m) => ({ ...m, ['__new']: '' }));
                          } catch {}
                          setNewSizeSavingMap((m) => ({ ...m, ['__new']: false }));
                        }
                      }}
                    />
                    <Button
                      type="button"
                      disabled={!!newSizeSavingMap['__new'] || !(newSizeLabelMap['__new'] || '').trim()}
                      onClick={async () => {
                        const val = (newSizeLabelMap['__new'] || '').trim();
                        if (!val || newSizeSavingMap['__new']) return;
                        try {
                          setNewSizeSavingMap((m) => ({ ...m, ['__new']: true }));
                          await api.post('/api/masters/sizes', { label: val });
                          setAllSizes((prev) => Array.from(new Set([...(prev || []), val])).sort((a,b)=>a.localeCompare(b)));
                          setNewSelectedSizes((prev) => (prev.includes(val) ? prev : [...prev, val]));
                          setNewSizeLabelMap((m) => ({ ...m, ['__new']: '' }));
                        } catch {}
                        setNewSizeSavingMap((m) => ({ ...m, ['__new']: false }));
                      }}
                    >
                      {newSizeSavingMap['__new'] ? 'Saving…' : 'Add'}
                    </Button>
                  </div>
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
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Qty</TableHead>
                <TableHead className="font-semibold">Sizes</TableHead>
                <TableHead className="font-semibold">Media</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
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

                        {/* Variant total quantity (inline editable when editing) */}
                        <TableCell className="align-middle">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              value={variantQtyDraft[v._id] ?? variantTotals(v).total}
                              onChange={(e) => {
                                const val = e.target.value;
                                setVariantQtyDraft((m) => ({ ...m, [v._id]: val === '' ? '' : Math.max(0, Number(val)) }));
                              }}
                              className="w-24"
                            />
                          ) : (
                            <span>{variantTotals(v).total}</span>
                          )}
                        </TableCell>

                        {/* Size chips (click to edit) */}
                        <TableCell className="align-middle">
                          {renderSizeChips(v.sizes, (s) =>
                            openSizeEditor(v._id, s)
                          )}
                        </TableCell>

                        {/* Media inside line item */}
                        <TableCell className="align-middle">
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept="image/*,video/*"
                              multiple
                              onChange={async (e) => {
                                const inputEl = e.currentTarget;
                                const files = Array.from(inputEl?.files || []);
                                if (!files.length) return;
                                const fd = new FormData();
                                files.forEach((f) => fd.append('files', f));
                                try {
                                  const { data } = await api.post(`/api/products/variants/${v._id}/media`, fd);
                                  const added = (data?.media || []) as Array<{ url: string; type: 'image' | 'video' }>;
                                  if (added.length) setVariantMedia((prev) => ({ ...prev, [v._id]: [ ...(prev[v._id] || []), ...added ] }));
                                } catch {
                                  alert('Failed to upload variant media');
                                }
                                if (inputEl) inputEl.value = '';
                              }}
                              className="h-8"
                            />
                            {Boolean((variantMedia[v._id] || []).length) && (
                              <span className="text-xs text-gray-600">{(variantMedia[v._id] || []).length} file{(variantMedia[v._id] || []).length>1?'s':''}</span>
                            )}
                          </div>
                          {(variantMedia[v._id] || []).length ? (
                            <ul className="mt-2 space-y-1 text-xs">
                              {(variantMedia[v._id] || []).map((m, i) => (
                                <li key={`${v._id}-${m.url}-${i}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                                  <span className="truncate">{m.url.split('/').pop()} ({m.type})</span>
                                  <button
                                    type="button"
                                    className="px-2 py-0.5 border rounded text-red-600"
                                    title="Delete media"
                                    onClick={async () => {
                                      try {
                                        const mediaId = (m as any)._id;
                                        await api.delete(`/api/products/variants/${v._id}/media/${mediaId}`);
                                        setVariantMedia((prev) => ({ ...prev, [v._id]: (prev[v._id] || []).filter((_, idx) => idx !== i) }));
                                      } catch {
                                        alert('Failed to delete media');
                                      }
                                    }}
                                  >
                                    ×
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
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
                                  setVariantQtyDraft((m) => ({ ...m, [v._id]: variantTotals(v).total }));
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
                                  <div className="border rounded p-2">
                                    <div className="grid grid-cols-3 gap-2">
                                      {[...new Set([...PRESET_SIZES, ...allSizes])].map((sz) => {
                                        const checked = (moreSelectedSizes[v._id] || []).includes(sz);
                                        const id = `more-${v._id}-${sz}`;
                                        return (
                                          <label key={id} htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                              id={id}
                                              type="checkbox"
                                              className="h-4 w-4"
                                              checked={checked}
                                              onChange={(e) => {
                                                setMoreSelectedSizes((prev) => {
                                                  const cur = prev[v._id] || [];
                                                  const next = e.target.checked ? (cur.includes(sz) ? cur : [...cur, sz]) : cur.filter((s) => s !== sz);
                                                  return { ...prev, [v._id]: next };
                                                });
                                              }}
                                            />
                                            <span>{sz}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                    {Boolean((moreSelectedSizes[v._id] || []).length) && (
                                      <p className="text-xs text-muted-foreground mt-1">Selected: {(moreSelectedSizes[v._id] || []).join(', ')}</p>
                                    )}
                                    {/* Add new size into master and select */}
                                    <div className="mt-2 flex items-center gap-2">
                                      <Input
                                        value={newSizeLabelMap[v._id] || ''}
                                        onChange={(e) => setNewSizeLabelMap((m) => ({ ...m, [v._id]: e.target.value }))}
                                        placeholder="Add new size"
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const val = (newSizeLabelMap[v._id] || '').trim();
                                            if (!val || newSizeSavingMap[v._id]) return;
                                            try {
                                              setNewSizeSavingMap((m) => ({ ...m, [v._id]: true }));
                                              await api.post('/api/masters/sizes', { label: val });
                                              setAllSizes((prev) => Array.from(new Set([...(prev || []), val])).sort((a,b)=>a.localeCompare(b)));
                                              setMoreSelectedSizes((prev) => ({ ...prev, [v._id]: [ ...(prev[v._id] || []), val ] }));
                                              setNewSizeLabelMap((m) => ({ ...m, [v._id]: '' }));
                                            } catch {}
                                            setNewSizeSavingMap((m) => ({ ...m, [v._id]: false }));
                                          }
                                        }}
                                      />
                                      <Button
                                        type="button"
                                        disabled={!!newSizeSavingMap[v._id] || !(newSizeLabelMap[v._id] || '').trim()}
                                        onClick={async () => {
                                          const val = (newSizeLabelMap[v._id] || '').trim();
                                          if (!val || newSizeSavingMap[v._id]) return;
                                          try {
                                            setNewSizeSavingMap((m) => ({ ...m, [v._id]: true }));
                                            await api.post('/api/masters/sizes', { label: val });
                                            setAllSizes((prev) => Array.from(new Set([...(prev || []), val])).sort((a,b)=>a.localeCompare(b)));
                                            setMoreSelectedSizes((prev) => ({ ...prev, [v._id]: [ ...(prev[v._id] || []), val ] }));
                                            setNewSizeLabelMap((m) => ({ ...m, [v._id]: '' }));
                                          } catch {}
                                          setNewSizeSavingMap((m) => ({ ...m, [v._id]: false }));
                                        }}
                                      >
                                        {newSizeSavingMap[v._id] ? 'Saving…' : 'Add'}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <Label className="m-2">Default Qty</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={defQty}
                                    onChange={(e) => setDefQty(Math.max(0, Number(e.target.value || 0)))}
                                    placeholder="0"
                                  />
                                </div>
                                <div>
                                  <Label className="m-2">Location</Label>
                                  <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="WH-DEFAULT" />
                                </div>
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    onClick={() => addSizesToVariantFromSelection(v._id, v.sku, (moreSelectedSizes[v._id] || []), defQty, loc)}
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
