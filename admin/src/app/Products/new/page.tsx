"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";
import { Trash2, Pencil, Check, X as XIcon } from "lucide-react";
import { ProductCategory } from "@/app/Assets/ProductData";

// Predefined subcategory options provided by business
const SUBCATEGORY_OPTIONS: string[] = [
  "None",
  "Annika Spring Summer 2010 Collection",
  "Annika Spring Summer 2011 Collection",
  "Annika Spring Summer 2012 Collection",
  "Annika Spring Summer 2013 Collection",
  "Dynasty Autumn Winter 2011 Collection",
  "Dynasty Autumn Winter 2012 Collection",
  "Dynasty Autumn Winter 2013 Collection",
  "Dynasty Autumn Winter 2014 Collection",
  "Dynasty Autumn Winter 2015 Collection",
  "Dynasty Autumn Winter 2016 Collection",
  "Dynasty Autumn Winter 2017 Collection",
  "Dynasty Autumn Winter 2018 Collection",
  "Dynasty Bridal Autumn Winter 2018 Collection",
  "Dynasty Bridal Spring Summer 2012 Collection",
  "Dynasty Bridal Spring Summer 2018 Collection",
  "Dynasty Bridal Spring Summer 2019",
  "Dynasty Cocktail Autumn Winter 2015 Collection",
  "Dynasty Cocktail Autumn Winter 2016 Collection",
  "Dynasty Cocktail Autumn Winter 2017 Collection",
  "Dynasty Cocktail Autumn Winter 2018 Collection",
  "Dynasty Cocktail Spring Summer 2016 Collection",
  "Dynasty Cocktail Spring Summer 2017 Collection",
  "Dynasty Cocktail Spring Summer 2018 Collection",
  "Dynasty Cocktail Spring Summer 2019",
  "Dynasty Curve Autumn Winter 2015 Collection",
  "Dynasty Curve Autumn Winter 2016 Collection",
  "Dynasty Curve Autumn Winter 2017 Collection",
  "Dynasty Curve Autumn Winter 2018 Collection",
  "Dynasty Curve Spring Summer 2016 Collection",
  "Dynasty Curve Spring Summer 2017 Collection",
  "Dynasty Curve Spring Summer 2018 Collection",
  "Dynasty Curve Spring Summer 2019",
  "Dynasty Curve Spring Summer 2020",
  "Dynasty Krystal London",
  "Dynasty London Spring Summer 2018 Collection",
  "Dynasty London Spring Summer 2019",
  "Dynasty London Spring Summer 2020",
  "Dynasty Premium Spring Summer 2019",
  "Dynasty Spirit Autumn Winter 2016 Collection",
  "Dynasty Spirit Autumn Winter 2017 Collection",
  "Dynasty Spirit Autumn Winter 2018 Collection",
  "Dynasty Spirit Spring Summer 2016 Collection",
  "Dynasty Spirit Spring Summer 2017 Collection",
  "Dynasty Spirit Spring Summer 2018 Collection",
  "Dynasty Spirit Spring Summer 2019",
  "Dynasty Spring Summer 2010 Collection",
  "Dynasty Spring Summer 2011 Collection",
  "Dynasty Spring Summer 2012 Collection",
  "Dynasty Spring Summer 2013 Collection",
  "Dynasty Spring Summer 2014 Collection",
  "Dynasty Spring Summer 2015 Collection",
  "Dynasty Spring Summer 2016 Collection",
  "Dynasty Spring Summer 2017 Collection",
  "Dynasty Spring Summer 2018 Collection",
  "Dynasty Spring Summer 2019",
  "Viviana Autumn Winter 2010 Collection",
  "Viviana Autumn Winter 2011 Collection",
  "Viviana Autumn Winter 2012 Collection",
  "Viviana Autumn Winter 2013 Collection",
  "Viviana Autumn Winter 2014 Collection",
  "Viviana Autumn Winter 2015 Collection",
  "Viviana Spring Summer 2011 Collection",
  "Viviana Spring Summer 2012 Collection",
  "Viviana Spring Summer 2013 Collection",
  "Viviana Spring Summer 2014 Collection",
  "Viviana Spring Summer 2015 Collection",
  "Yasmin Autumn Winter 2014 Collection",
  "Yasmin Spring Summer 2011 Collection",
  "Yasmin Spring Summer 2012 Collection",
  "Yasmin Spring Summer 2013 Collection",
  "Yasmin Spring Summer 2014 Collection",
  "Yasmin Spring Summer 2015 Collection",
];

// Predefined category options for quick selection + auto-detect from style number
const CATEGORY_OPTIONS: string[] = [
  "Annika",
  "Dynasty",
  "Dynasty Bridal",
  "Dynasty Cocktail",
  "Dynasty Curve",
  "Dynasty Krystal London",
  "Dynasty Premium",
  "Dynasty Spirit",
  "Viviana",
  "Yasmin",
];

/* ---------------- helpers ---------------- */
function skuSuffixFromColor(name: string) {
  const letters = (name || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return letters.slice(0, 6) || "CLR";
}
function toMinor(pounds: string | number) {
  const n = Number(pounds);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function rand(n = 6) {
  return Math.random().toString(36).slice(-n).toUpperCase();
}
function tokenize(s: string) {
  return (s || "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}
function normColor(s: string) {
  return (s || "").trim().toLowerCase();
}
function normSize(s: string) {
  return (s || "").trim().toLowerCase();
}

function humanFileSize(n: number) {
  if (!Number.isFinite(n)) return "";
  const units = ["B", "KB", "MB", "GB"]; 
  let i = 0; 
  let v = n; 
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Parse a size input like "S,M,L" or "S:10,M:5,UK 8:0" into entries. */
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

/* ---------------- localStorage key ---------------- */
const DRAFT_KEY = "product:new:draft:v1";

/* ---------------- types ---------------- */
type Line = {
  id: string; // stable key
  colorName: string;
  sizeLabel: string;
  quantity: number; // onHand at WH-DEFAULT
};

type DraftShape = {
  styleNumber: string;
  title: string;
  desc: string;
  priceGBP: string | number;
  status: "active" | "inactive" | "draft" | "archived";
  category: string;
  dressType?: string;
  supplier: string;
  season: string;
  wholesale: string | number;

  // quick add mini-form
  colorName: string;
  sizeLabel: string;

  // table
  lines: Line[];
};

export default function NewProductPage() {
  const router = useRouter();

  // product fields
  const [styleNumber, setStyleNumber] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priceGBP, setPriceGBP] = useState<string | number>("");
  const [status, setStatus] = useState<
    "active" | "inactive" | "draft" | "archived"
  >("active");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [dressType, setDressType] = useState("");

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

  // Preset sizes: OS, letter sizes, and even numeric sizes 2-34
  const PRESET_SIZES: string[] = [
    "OS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    ...Array.from({ length: (34 - 2) / 2 + 1 }, (_, i) => String(2 + i * 2)),
  ];
  // Quick-pick preset colors
  const PRESET_COLORS: string[] = [
    'Red', 'Green', 'Yellow', 'Blue', 'Black',
    'White', 'Pink', 'Purple', 'Orange', 'Brown',
  ];
  const [supplier, setSupplier] = useState("");
  const [season, setSeason] = useState("");
  const [wholesale, setWholesale] = useState<string | number>("");

  // quick add row (top mini-form)
  const [colorName, setColorName] = useState("");
  const [colorList, setColorList] = useState<string[]>([]);
  const [newColorName, setNewColorName] = useState("");
  const [newColorSaving, setNewColorSaving] = useState(false);
  // removed color code field
  const [sizeLabel, setSizeLabel] = useState("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sizeFilter, setSizeFilter] = useState("");
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizePickerRef = useRef<HTMLDivElement | null>(null);
  const [quantity, setQuantity] = useState<number>(0);
  const [location,setLocation] = useState("")
 const [mediaFile, setMediaFile] = useState<File | null>(null);
 const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  // Product-level media queue (multiple files)
  const [productMedia, setProductMedia] = useState<File[]>([]);
  const [productMediaPreviews, setProductMediaPreviews] = useState<string[]>([]);
  // Variant-level media staged by color (multiple files per color)
  const [colorMedia, setColorMedia] = useState<Record<string, File[]>>({});
  const [colorMediaPreviews, setColorMediaPreviews] = useState<Record<string, string[]>>({});

  // table rows
  const [lines, setLines] = useState<Line[]>([]);
  const [colorSuggestions, setColorSuggestions] = useState<string[]>([]);
  const [allColors, setAllColors] = useState<string[]>([]);
  const [colorOpen, setColorOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const [colorFilter, setColorFilter] = useState("");
  const [sizeSuggestions, setSizeSuggestions] = useState<Array<{ _id: string; label: string }>>([]);
  const [allSizes, setAllSizes] = useState<string[]>([]);
  const [newSizeLabel, setNewSizeLabel] = useState("");
  const [newSizeSaving, setNewSizeSaving] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState<Array<{ _id: string; name: string }>>([]);
  const [subcategorySuggestions, setSubcategorySuggestions] = useState<Array<{ _id: string; name: string }>>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<string[]>([]);
  const colorDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const sizeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const categoryDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const subcategoryDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // inline edit state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Line | null>(null);

  // ui
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [autoCategory, setAutoCategory] = useState<string | null>(null);
  // preview SKU for current color (per-color)
  const handleFileMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setMediaFile(file);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(file ? URL.createObjectURL(file) : null);
  };

  const skuPreview = useMemo(() => {
    const sty = tokenize(styleNumber);
    const suf = skuSuffixFromColor(colorName);
    return sty ? `${sty}-${suf}` : `STYLE?-${suf}`;
  }, [styleNumber, colorName]);

  /* ---------------- DRAFT: load on mount ---------------- */
  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
      productMediaPreviews.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      Object.values(colorMediaPreviews).forEach((arr) =>
        arr.forEach((u) => {
          try { URL.revokeObjectURL(u); } catch {}
        })
      );
    };
  }, [mediaPreview, productMediaPreviews, colorMediaPreviews]);

  // Close size dropdown when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!sizePickerRef.current) return;
      if (!sizePickerRef.current.contains(e.target as Node)) setSizeOpen(false);
    }
    if (sizeOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [sizeOpen]);
  // Load all colors once for local filtering (autocomplete startsWith)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/masters/colors`, { params: { q: '', limit: 1000 } });
        const names: string[] = Array.isArray(data)
          ? Array.from(new Set(
              data
                .map((c: any) => (typeof c === 'string' ? c : c?.name))
                .filter((n: any) => typeof n === 'string' && n.trim().length)
            ))
              .sort((a, b) => a.localeCompare(b))
          : [];
        setAllColors(names);
      } catch {
        setAllColors([]);
      }
    })();
  }, []);

  // Close color dropdown when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!colorPickerRef.current) return;
      if (!colorPickerRef.current.contains(e.target as Node)) setColorOpen(false);
    }
    if (colorOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [colorOpen]);

  // Load all sizes once to populate the size picker from master
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/masters/sizes`, { params: { q: '', limit: 1000 } });
        const labels: string[] = Array.isArray(data)
          ? Array.from(new Set(
              data
                .map((s: any) => (typeof s === 'string' ? s : s?.label))
                .filter((n: any) => typeof n === 'string' && n.trim().length)
            ))
              .sort((a, b) => a.localeCompare(b))
          : [];
        setAllSizes(labels);
      } catch {
        setAllSizes([]);
      }
    })();
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed: Partial<DraftShape> = JSON.parse(raw);

      if (parsed.styleNumber != null) setStyleNumber(parsed.styleNumber);
      if (parsed.title != null) setTitle(parsed.title);
      if (parsed.desc != null) setDesc(parsed.desc);
      if (parsed.priceGBP != null) setPriceGBP(parsed.priceGBP);
      if (
        parsed.status === "active" ||
        parsed.status === "inactive" ||
        parsed.status === "draft" ||
        parsed.status === "archived"
      ) {
        setStatus(parsed.status);
      }
      if (parsed.category != null) setCategory(parsed.category);
      if (parsed.dressType != null) setDressType(parsed.dressType);
      if (parsed.supplier != null) setSupplier(parsed.supplier);
      if (parsed.season != null) setSeason(parsed.season);
      if (parsed.wholesale != null) setWholesale(parsed.wholesale);

      if (parsed.colorName != null) setColorName(parsed.colorName);
      // color code removed
      if (parsed.sizeLabel != null) setSizeLabel(parsed.sizeLabel);
      if (typeof (parsed as any).quantity === 'number') setQuantity((parsed as any).quantity as number);

      if (Array.isArray(parsed.lines)) setLines(parsed.lines);
      setInfo("Draft restored from local storage.");
    } catch {
      // ignore bad drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (removed color dropdown open/close wrapper)

  // Auto-select category from style number when possible
  useEffect(() => {
    const alpha = (styleNumber || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
    if (!alpha) {
      setAutoCategory(null);
      return;
    }
    const norm = (s: string) => s.replace(/[^a-zA-Z]/g, "").toUpperCase();
    const mapped = CATEGORY_OPTIONS.map((c) => ({ c, n: norm(c) }));
    let hit = mapped.find((m) => alpha.startsWith(m.n));
    if (!hit) hit = mapped.find((m) => alpha.includes(m.n));
    const detected = hit?.c ?? null;
    setAutoCategory(detected);
    if (detected && !category) setCategory(detected);
  }, [styleNumber]);

  // Load all categories once to populate dropdown and datalist
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/masters/categories`, { params: { q: '', limit: 1000 } });
        const names: string[] = Array.isArray(data)
          ? Array.from(new Set(
              data
                .map((c: any) => (typeof c === 'string' ? c : c?.name))
                .filter((n: any) => typeof n === 'string' && n.trim().length)
            ))
              .sort((a, b) => a.localeCompare(b))
          : [];
        setAllCategories(names);
      } catch {
        setAllCategories([]);
      }
    })();
  }, []);

  // Load all suppliers once
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/masters/suppliers`, { params: { q: '', limit: 1000 } });
        const names: string[] = Array.isArray(data)
          ? Array.from(new Set(
              data
                .map((c: any) => (typeof c === 'string' ? c : c?.name))
                .filter((n: any) => typeof n === 'string' && n.trim().length)
            ))
              .sort((a, b) => a.localeCompare(b))
          : [];
        setAllSuppliers(names);
      } catch {
        setAllSuppliers([]);
      }
    })();
  }, []);

  /* ---------------- DRAFT: autosave (debounced) ---------------- */
  const autosaveTimer = useRef<number | null>(null);
  const scheduleAutosave = React.useCallback(() => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      const snapshot: DraftShape = {
        styleNumber,
        title,
        desc,
        priceGBP,
        status,
        category,
        dressType,
        supplier,
        season,
        wholesale,
        colorName,
        sizeLabel,
        quantity,
        lines,
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
      } catch {
        // ignore write failures
      }
    }, 300);
  }, [
    styleNumber,
    title,
    desc,
    priceGBP,
    status,
    category,
    dressType,
    supplier,
    season,
    wholesale,
    colorName,
    sizeLabel,
    quantity,
    lines,
  ]);

  // watch all form states
  useEffect(() => {
    scheduleAutosave();
  }, [scheduleAutosave]);

  /* ---------------- Manual draft actions ---------------- */
  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setInfo("Draft cleared.");
  }
  function saveDraftNow() {
    const snapshot: DraftShape = {
      styleNumber,
      title,
      desc,
      priceGBP,
      status,
      category,
      supplier,
      season,
      wholesale,
      colorName,
      sizeLabel,
      lines,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
    setInfo("Draft saved.");
  }

  /* ---------------- add / merge ---------------- */
  function addOrMergeRow(newRow: Omit<Line, "id">) {
    setLines((prev) => {
      const i = prev.findIndex(
        (r) =>
          normColor(r.colorName) === normColor(newRow.colorName) &&
          normSize(r.sizeLabel) === normSize(newRow.sizeLabel)
      );
      if (i >= 0) {
        const next = [...prev];
        next[i] = {
          ...next[i],
          quantity: next[i].quantity + Math.max(0, newRow.quantity),
        };
        return next;
      }
      return [...prev].concat([{ id: rand(), ...newRow }]);
    });
  }

  function addLine() {
    setErr(null);
    const c = colorName.trim();

    if (!c && colorList.length === 0) return setErr("Color is required.");
    if (selectedSizes.length === 0) return setErr("Select at least one size.");
    if (!Number.isFinite(quantity) || quantity < 0) return setErr("Quantity must be ≥ 0.");

    // Build entries from multi-select; default quantity 0
    const entries = selectedSizes.map((label) => ({ label, quantity: Math.max(0, Number(quantity || 0)) }));
    if (entries.length === 0) return setErr("Select at least one size.");

    const colors = colorList.length ? colorList : [c];
    for (const col of colors) {
      for (const { label, quantity } of entries) {
        addOrMergeRow({
          colorName: col,
          // color code removed
          sizeLabel: label,
          quantity: Math.max(0, quantity),
        });
      }
    }

    // Keep color so you can add more size batches for the same color
    setSizeLabel("");
    setSelectedSizes([]);
    if (colorList.length) setColorList([]);
    // leave colorName empty after bulk add
    if (colorList.length) setColorName("");
    // If you prefer clearing color too, uncomment:
    // setColorName(""); setColorCode("");
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
    if (editingIndex === i) {
      setEditingIndex(null);
      setDraft(null);
    }
  }

  /* ---------------- inline edit ---------------- */
  function startEdit(i: number) {
    setErr(null);
    setEditingIndex(i);
    setDraft({ ...lines[i] });
  }
  function cancelEdit() {
    setEditingIndex(null);
    setDraft(null);
  }
  function applyEdit() {
    if (editingIndex === null || !draft) return;
    const { colorName, sizeLabel, quantity } = draft;
    if (!colorName.trim()) return setErr("Color is required.");
    if (!sizeLabel.trim()) return setErr("Size is required.");
    if (!Number.isFinite(quantity) || quantity < 0)
      return setErr("Quantity must be ≥ 0.");

    setLines((prev) => {
      const next = [...prev];
      const id = next[editingIndex].id;
      // check if this edit collides with another row -> merge
      const dupIdx = next.findIndex(
        (r, idx) =>
          idx !== editingIndex &&
          normColor(r.colorName) === normColor(colorName) &&
          normSize(r.sizeLabel) === normSize(sizeLabel)
      );
      if (dupIdx >= 0) {
        // merge into dupIdx
        next[dupIdx] = {
          ...next[dupIdx],
          quantity: next[dupIdx].quantity + Math.max(0, quantity),
          // color code removed
        };
        // remove the original edited row
        next.splice(editingIndex, 1);
      } else {
        // simple replace
        next[editingIndex] = { ...draft, id };
      }
      return next;
    });

    setEditingIndex(null);
    setDraft(null);
  }

  /* ---------------- submit ---------------- */
  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setInfo(null);

    try {
      const style = tokenize(styleNumber);
      if (!style) throw new Error("Style number is required.");
      if (!title.trim()) throw new Error("Title is required.");
      if (lines.length === 0) throw new Error("Add at least one variant row.");
      if (editingIndex !== null)
        throw new Error("Finish or cancel the edit in progress.");

      // group rows by color
      const byColor = new Map<
        string,
        {
          colorName: string;
          sizes: Array<{ label: string; quantity: number }>;
        }
      >();
      for (const ln of lines) {
        const key = normColor(ln.colorName);
        const entry = byColor.get(key) || {
          colorName: ln.colorName,
          sizes: [],
        };
        entry.sizes.push({ label: ln.sizeLabel, quantity: ln.quantity });
        byColor.set(key, entry);
      }

      // build deep variants
      const variants = Array.from(byColor.values()).map((group) => {
        const suffix = skuSuffixFromColor(group.colorName);
        const sku = `${style}-${suffix}`;
        const sizes = group.sizes.map((s) => {
          const sizeTok = tokenize(s.label || "OS");
          const barcode = `${style}-${suffix}-${sizeTok}-${rand(5)}`;
          return {
            label: s.label || "OS",
            barcode,
            inventory: [
              {
                location: "WH-DEFAULT",
                onHand: Math.max(0, Number(s.quantity || 0)),
                onOrder: 0,
                reserved: 0,
              },
            ],
          };
        });
        return {
          sku,
          color: { name: group.colorName },
          status: "active" as const,
          media: [] as Array<{
            url: string;
            type: "image" | "video";
            isPrimary?: boolean;
          }>,
          sizes,
        };
      });

      // Ensure title starts with uppercase first letter
      const t = (title || '').trim();
      const titleCased = t ? t.charAt(0).toUpperCase() + t.slice(1) : t;

      const payload = {
        product: {
          styleNumber: style,
          title: titleCased,
          description: desc || undefined,
          price: toMinor(priceGBP),
          category: category || undefined,
          subcategory: subcategory || undefined,
          dressType: dressType || undefined,
          supplier: supplier || undefined,
          status,
        },
        variants,
      };

      const { data: created } = await api.post("/api/products", payload);
      const productId = created?._id;
      if (!productId) throw new Error("Create API did not return product _id");

      // If media files were selected, attach to the product (product-level media)
      try {
        if (mediaFile || productMedia.length) {
          const fd = new FormData();
          if (mediaFile) fd.append('files', mediaFile);
          productMedia.forEach((f) => fd.append('files', f));
          await api.post(`/api/products/${productId}/media`, fd);
        }
      } catch (e) {
        // non-fatal: media attach failed, but product is created
        console.warn('Media upload failed:', e);
      }

      // Upload variant-level media grouped by color (if any)
      try {
        let createdVariants: Array<{ _id: string; color?: { name?: string } }> = created?.variants || [];
        if (!Array.isArray(createdVariants) || createdVariants.length === 0) {
          // Fallback: fetch product deep to get variants
          try {
            const { data: deep } = await api.get(`/api/products/${productId}`);
            createdVariants = deep?.variants || [];
          } catch {}
        }
        const mapByColor = new Map<string, string>(); // norm color -> variantId
        const mapBySku = new Map<string, string>();   // sku -> variantId
        createdVariants.forEach((v) => {
          const key = normColor(v?.color?.name || "");
          if (key) mapByColor.set(key, v._id);
          if ((v as any)?.sku) mapBySku.set(String((v as any).sku), v._id);
        });
        for (const [key, files] of Object.entries(colorMedia)) {
          let variantId = mapByColor.get(normColor(key));
          if (!variantId) {
            // Try resolve by expected SKU if color is missing from response
            const expectedSku = `${tokenize(styleNumber)}-${skuSuffixFromColor(key)}`;
            variantId = mapBySku.get(expectedSku);
          }
          if (!variantId || !files?.length) continue;
          const fd = new FormData();
          files.forEach((f) => fd.append('files', f));
          await api.post(`/api/products/variants/${variantId}/media`, fd);
        }
      } catch (e) {
        console.warn('Variant media upload failed:', e);
      }

      // clear draft after successful save
      localStorage.removeItem(DRAFT_KEY);

      setInfo("Product created successfully.");
      router.push(`/Products/${productId}`);
    } catch (e: any) {
      setErr(
        e?.response?.data?.message || e?.message || "Failed to create product."
      );
    } finally {
      setSaving(false);
    }
  }
  console.log("media",mediaFile)

  return (
    <div className="p-4 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create Product</h1>
        <Link href="/Products" className="underline">
          Back to Products
        </Link>
      </div>

      {/* Draft controls */}
      {/* <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={saveDraftNow}>Save draft</Button>
        <Button type="button" variant="secondary" onClick={clearDraft}>Discard draft</Button>
      </div> */}

      <form onSubmit={onSave} className="space-y-8">
        {/* ---------- Product core (Table layout) ---------- */}
        <section className="border rounded p-4">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="w-48 align-top p-2 font-medium">Style Number</td>
                <td className="p-2">
                  <Input
                    value={styleNumber}
                    onChange={(e) => setStyleNumber(e.target.value)}
                    required
                    placeholder="e.g., STY-500010 or ABC123"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Use letters and/or numbers. Must be unique.</p>
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Title</td>
                <td className="p-2">
                  <Input
                    value={title}
                    onChange={(e) => {
                      const v = e.target.value;
                      const cased = v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
                      setTitle(cased);
                    }}
                    required
                    placeholder="Product title"
                  />
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Price ($)</td>
                <td className="p-2">
                  <Input type="number" step="0.01" value={priceGBP} onChange={(e) => setPriceGBP(e.target.value)} placeholder="79.99" />
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Status</td>
                <td className="p-2">
                  <select className="w-full h-10 border rounded px-3" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="draft">draft</option>
                    <option value="archived">archived</option>
                  </select>
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Description</td>
                <td className="p-2">
                  <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Product Media</td>
                <td className="p-2">
                  <div className="flex items-start gap-3">
                    <Input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        setProductMedia((prev) => [...prev, ...files]);
                        const urls = files.map((f) => URL.createObjectURL(f));
                        setProductMediaPreviews((prev) => [...prev, ...urls]);
                      }}
                    />
                    {productMedia.length > 0 && (
                      <ul className="mt-2 w-full space-y-1 text-sm">
                        {productMedia.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 rounded border px-2 py-1">
                            <span className="truncate">{f.name} {f.type ? `(${f.type.split('/')[0]})` : ''} · {humanFileSize(f.size)}</span>
                            <button
                              type="button"
                              className="text-xs px-2 py-0.5 border rounded"
                              onClick={() => {
                                const url = productMediaPreviews[i];
                                setProductMedia((prev) => prev.filter((_, idx) => idx !== i));
                                setProductMediaPreviews((prev) => prev.filter((_, idx) => idx !== i));
                                if (url) { try { URL.revokeObjectURL(url); } catch {} }
                              }}
                              aria-label={`Remove ${f.name}`}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">You can also attach media to each color below after adding lines.</p>
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Category</td>
                <td className="p-2">
                  <div className="relative">
                    <Input
                      value={category}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCategory(v);
                        setSelectedCategoryId(null);
                        if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
                        if (v.trim().length < 2) return setCategorySuggestions([]);
                        categoryDebounceRef.current = setTimeout(async () => {
                          try {
                            const { data } = await api.get(`/api/masters/categories`, { params: { q: v, limit: 8 } });
                            setCategorySuggestions(data || []);
                          } catch { setCategorySuggestions([]); }
                        }, 200);
                      }}
                      list="category-options"
                      placeholder="e.g., Dynasty"
                    />
                    {categorySuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded border bg-white shadow">
                        {categorySuggestions.map((c) => (
                          <button type="button" key={c._id} className="w-full text-left px-2 py-1 hover:bg-gray-100" onClick={() => { setCategory(c.name); setSelectedCategoryId(c._id); setCategorySuggestions([]); }}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {autoCategory && autoCategory !== category && (
                      <div className="text-xs text-gray-500 mt-1">
                        Auto-detected from style: <button type="button" className="underline" onClick={() => setCategory(autoCategory!)}>{autoCategory}</button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Subcategory</td>
                <td className="p-2">
                  <select className="w-full h-10 border rounded px-3" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
                    <option value="">None</option>
                    {SUBCATEGORY_OPTIONS.filter((o) => o !== "None").map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Supplier</td>
                <td className="p-2">
                  <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="supplier-options" />
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Season</td>
                <td className="p-2">
                  <select className="w-full h-10 border rounded px-3" value={season} onChange={(e) => setSeason(e.target.value)}>
                    <option value="">Select Season</option>
                    <option value="AW10">AW10</option>
                    <option value="AW11">AW11</option>
                    <option value="AW12">AW12</option>
                    <option value="AW13">AW13</option>
                    <option value="AW14">AW14</option>
                    <option value="AW15">AW15</option>
                    <option value="AW16">AW16</option>
                    <option value="AW17">AW17</option>
                    <option value="AW18">AW18</option>
                    <option value="SS10">SS10</option>
                    <option value="SS11">SS11</option>
                    <option value="SS12">SS12</option>
                    <option value="SS13">SS13</option>
                    <option value="SS14">SS14</option>
                    <option value="SS15">SS15</option>
                    <option value="SS16">SS16</option>
                    <option value="SS17">SS17</option>
                    <option value="SS18">SS18</option>
                    <option value="SS19">SS19</option>
                    <option value="SS20">SS20</option>
                  </select>
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Dress Type</td>
                <td className="p-2">
                  <select className="w-full h-10 border rounded px-3" value={dressType} onChange={(e) => setDressType(e.target.value)}>
                    <option value="">None</option>
                    {DRESS_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td className="align-top p-2 font-medium">Cost Price ($)</td>
                <td className="p-2">
                  <Input type="number" step="0.01" value={wholesale} onChange={(e) => setWholesale(e.target.value)} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ---------- Quick add row ---------- */}
        <section className="space-y-4 border rounded p-4">
          <h2 className="font-medium">Add Color and Size</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
            <div className="md:col-span-2">
              <Label className="m-2">Color</Label>
              <div ref={colorPickerRef} className="relative">
                <div className="flex gap-2">
                  <Input
                    value={newColorName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNewColorName(v);
                      // Debounced backend color suggestions
                      setColorOpen(true);
                      if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
                      colorDebounceRef.current = setTimeout(async () => {
                        if (!v.trim()) { setColorSuggestions([]); return; }
                        try {
                          const { data } = await api.get(`/api/masters/colors`, { params: { q: v, limit: 8 } });
                          const names: string[] = Array.isArray(data)
                            ? Array.from(new Set(
                                data
                                  .map((c: any) => (typeof c === 'string' ? c : c?.name))
                                  .filter((n: any) => typeof n === 'string' && n.trim().length)
                              ))
                            : [];
                          setColorSuggestions(names);
                        } catch { setColorSuggestions([]); }
                      }, 250);
                    }}
                    onFocus={() => setColorOpen(true)}
                    placeholder="Search or add a color (e.g., Teal)"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = newColorName.trim();
                        if (!val || newColorSaving) return;
                        try {
                          setNewColorSaving(true);
                          const { data } = await api.post('/api/masters/colors', { name: val });
                          const savedName = (data?.name || val).toString();
                          // Update master list and selected chips
                          setAllColors((prev) => Array.from(new Set([...(prev || []), savedName])).sort((a,b)=>a.localeCompare(b)));
                          const display = savedName.toUpperCase();
                          setColorList((prev) => (prev.includes(display) ? prev : [...prev, display]));
                          setNewColorName('');
                          setColorSuggestions([]);
                          setColorOpen(false);
                        } catch (err) {
                          console.warn('Failed to save color', err);
                        } finally {
                          setNewColorSaving(false);
                        }
                      }
                    }}
                  />
                </div>
                {colorOpen && newColorName.trim().length > 0 && colorSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow max-h-64 overflow-auto">
                    {colorSuggestions.map((c) => (
                      <button
                        type="button"
                        key={`sugg-${c}`}
                        className="w-full text-left px-2 py-1 hover:bg-gray-100"
                        onClick={() => {
                          const display = c.toUpperCase();
                          setColorList((prev) => (prev.includes(display) ? prev : [...prev, display]));
                          setNewColorName('');
                          setColorSuggestions([]);
                          setColorOpen(false);
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                {/* Selected colors (chips) */}
                {colorList.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 min-h-6">
                    {colorList.map((c, idx) => (
                      <span
                        key={`${c}-${idx}`}
                        className="inline-flex items-center bg-gray-100 border border-gray-300 rounded-full px-2 py-1 text-xs"
                      >
                        {c.toUpperCase()}
                        <button
                          type="button"
                          className="ml-2 text-gray-500 hover:text-gray-700"
                          onClick={() => setColorList((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label={`Remove ${c}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="md:col-span-2">
              <Label className="m-2">Size</Label>
              <div ref={sizePickerRef} className="relative">
                <Input
                  readOnly
                  value={selectedSizes.length ? selectedSizes.join(", ") : ""}
                  onFocus={() => setSizeOpen(true)}
                  onClick={() => setSizeOpen(true)}
                  placeholder="Select size(s)"
                />
                {sizeOpen && (
                  <div className="absolute z-20 mt-1 w-full border rounded bg-white shadow p-2 max-h-64 overflow-auto">
                    {allSizes.length === 0 ? (
                      <div className="text-sm text-gray-500 px-1 py-2">No sizes loaded from backend.</div>
                    ) : (
                      <>
                        <Input
                          value={sizeFilter}
                          onChange={(e) => setSizeFilter(e.target.value)}
                          placeholder="Filter sizes…"
                          className="mb-2 h-8 text-sm"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          {allSizes.filter((s) => s.toLowerCase().includes(sizeFilter.toLowerCase())).map((sz) => {
                            const id = `sz-${sz}`;
                            const checked = selectedSizes.includes(sz);
                            return (
                              <label key={sz} htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  id={id}
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={(e) => {
                                    setSelectedSizes((prev) =>
                                      e.target.checked ? (prev.includes(sz) ? prev : [...prev, sz]) : prev.filter((s) => s !== sz)
                                    );
                                  }}
                                />
                                <span>{sz}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              {selectedSizes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedSizes.map((sz, idx) => (
                    <span key={`${sz}-${idx}`} className="inline-flex items-center bg-gray-100 border border-gray-300 rounded-full px-2 py-1 text-xs">
                      {sz}
                      <button
                        type="button"
                        className="ml-2 text-gray-500 hover:text-gray-700"
                        onClick={() => setSelectedSizes((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={`Remove ${sz}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Add a new size (creates in SizeMaster and selects it) */}
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={newSizeLabel}
                  onChange={(e) => setNewSizeLabel(e.target.value)}
                  placeholder="Add new size (e.g., XXL or EU 42)"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = newSizeLabel.trim();
                      if (!val || newSizeSaving) return;
                      try {
                        setNewSizeSaving(true);
                        await api.post('/api/masters/sizes', { label: val });
                        // Update master list and select it
                        setAllSizes((prev) => Array.from(new Set([...(prev || []), val])).sort((a,b)=>a.localeCompare(b)));
                        setSelectedSizes((prev) => (prev.includes(val) ? prev : [...prev, val]));
                        setNewSizeLabel('');
                      } catch (err) {
                        console.warn('Failed to save size', err);
                      } finally {
                        setNewSizeSaving(false);
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  disabled={newSizeSaving || !newSizeLabel.trim()}
                  onClick={async () => {
                    const val = newSizeLabel.trim();
                    if (!val || newSizeSaving) return;
                    try {
                      setNewSizeSaving(true);
                      await api.post('/api/masters/sizes', { label: val });
                      setAllSizes((prev) => Array.from(new Set([...(prev || []), val])).sort((a,b)=>a.localeCompare(b)));
                      setSelectedSizes((prev) => (prev.includes(val) ? prev : [...prev, val]));
                      setNewSizeLabel('');
                    } catch (err) {
                      console.warn('Failed to save size', err);
                    } finally {
                      setNewSizeSaving(false);
                    }
                  }}
                >
                  {newSizeSaving ? 'Saving…' : 'Add'}
                </Button>
              </div>
            </div>
            <div>
              <Label className="m-2">Quantity</Label>
              <Input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, Number(e.target.value || 0)))}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="m-2">Location</Label>
              <Input
                value={location}
                defaultValue="WH"
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
              />
            </div>
            {/* Removed quick Media; use per-line Media in the table below */}
            {/* Quantity input removed in quick add */}

            <div className="flex items-end">
              <Button className="mt-7" type="button" onClick={addLine}>
                Add
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            SKU will be generated per color: <code>{skuPreview}</code>.
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: hold Ctrl/Cmd to select multiple sizes.
          </p>

          {/* ---------- Editable table ---------- */}
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Color</th>
                  <th className="text-left p-2">Size</th>
                  <th className="text-left p-2">Quantity</th>
                  <th className="text-left p-2">Media</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td className="p-3 text-center text-gray-500" colSpan={6}>
                      No variant rows yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  lines.map((ln, i) => {
                    const isEdit = editingIndex === i;
                    return (
                      <tr key={ln.id} className="border-t">
                        <td className="p-2 align-middle">{i + 1}</td>

                        {/* Color */}
                        <td className="p-2 align-middle">
                          {isEdit ? (
                            <Input
                              value={draft?.colorName || ""}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d ? { ...d, colorName: e.target.value } : d
                                )
                              }
                            />
                          ) : (
                            ln.colorName
                          )}
                        </td>

                        {/* Size */}
                        <td className="p-2 align-middle">
                          {isEdit ? (
                            <Input
                              value={draft?.sizeLabel || ""}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d ? { ...d, sizeLabel: e.target.value } : d
                                )
                              }
                            />
                          ) : (
                            ln.sizeLabel
                          )}
                        </td>

                        {/* Qty */}
                          <td>
                            {isEdit ? (
                            <Input
                              value={draft?.quantity || ""}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d ? { ...d, quantity: Number(e.target.value) } : d
                                )
                              }
                            />
                          ) : (
                            ln.quantity
                          )}
                          </td>
                        {/* Per-line media for this color */}
                        <td className="p-2 align-middle">
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept="image/*,video/*"
                              multiple
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                if (!files.length) return;
                                const key = normColor(ln.colorName);
                                setColorMedia((prev) => ({ ...prev, [key]: [ ...(prev[key] || []), ...files ] }));
                                const urls = files.map((f) => URL.createObjectURL(f));
                                setColorMediaPreviews((prev) => ({ ...prev, [key]: [ ...(prev[key] || []), ...urls ] }));
                                e.currentTarget.value = '';
                              }}
                            />
                            {(() => {
                              const key = normColor(ln.colorName);
                              const count = (colorMedia[key] || []).length;
                              return count ? <span className="text-xs text-gray-600">{count} file{count>1?'s':''}</span> : null;
                            })()}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="p-2 flex justify-end align-middle text-right">
                          {isEdit ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={applyEdit}
                              >
                                <Check className="h-4 w-4 mr-2" /> Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={cancelEdit}
                              >
                                <XIcon className="h-4 w-4 mr-2" /> Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => startEdit(i)}
                              >
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => removeLine(i)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Remove
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section> 

        {err && <p className="text-red-600">{err}</p>}
        {/* {info && <p className="text-emerald-700">{info}</p>} */}

        <div className="flex gap-2">
          <Button className="bg-green-600" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create product"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/Products")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
