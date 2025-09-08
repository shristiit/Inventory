"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye as ViewIcon, Plus, Trash2 } from "lucide-react"; // 👈 use Eye as ViewIcon
import api from "@/lib/api";
import { Input } from "@/components/ui/input";

/** ---- API types (matches your model/controller) ---- */
type ProductRow = {
  _id: string;
  styleNumber: string;
  title: string;
  color?: string;       // 👈 shows in the table
  size: string;
  quantity?: number;
  status:
    | "active"
    | "inactive"
    | "draft"
    | "archived"
    | "Active"
    | "Inactive"
    | "Draft"
    | "Archived";
  price: number;        // minor units (pence)
  updatedAt?: string;
};

type ListResponse = {
  page: number;
  limit: number;
  total: number;
  rows: ProductRow[];
};

const ITEMS_PER_PAGE = 15;

/* ---------- helpers ---------- */
function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100
  );
}
function prettyStatus(s: string) {
  const v = s.toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}
function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

// Minimal allow-list of CSS color names (add more if you like)
const CSS_COLOR_NAMES = new Set(
  [
    "black","white","red","green","blue","navy","maroon","silver","gray","grey","yellow","olive",
    "purple","teal","aqua","orange","pink","brown","beige","gold","tan","khaki","cyan","magenta",
    "violet","indigo","lavender","coral","salmon","crimson","turquoise","mint","peach"
  ]
);

// validate hex like #abc or #aabbcc (with or without #)
function isHexColor(str: string) {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str.trim());
}
function normalizeHex(str: string) {
  const t = str.trim();
  return t.startsWith("#") ? t : `#${t}`;
}
function safeCssColor(color?: string | null) {
  if (!color) return null;
  const t = String(color).trim();
  if (!t) return null;
  if (isHexColor(t)) return normalizeHex(t);
  const low = t.toLowerCase();
  if (CSS_COLOR_NAMES.has(low)) return low;
  return null;
}

/** Status badge with colored dot & background */
function StatusBadge({ status }: { status: string }) {
  const v = String(status).toLowerCase();
  let bg = "bg-gray-100 text-gray-800";
  let dot = "bg-gray-400";
  if (v === "active") {
    bg = "bg-green-100 text-green-800";
    dot = "bg-green-500";
  } else if (v === "inactive") {
    bg = "bg-red-100 text-red-800";
    dot = "bg-red-500";
  } else if (v === "draft") {
    bg = "bg-yellow-100 text-yellow-800";
    dot = "bg-yellow-500";
  } else if (v === "archived") {
    bg = "bg-zinc-100 text-zinc-700";
    dot = "bg-zinc-400";
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${bg}`}>
      <span className={`h-2 w-2 rounded-full mr-1.5 ${dot}`} />
      {prettyStatus(v)}
    </span>
  );
}

/** Color pill + swatch dot (falls back gracefully if no color) */
function ColorCell({ color, q }: { color?: string; q: string }) {
  const css = safeCssColor(color);
  const label = color || "—";
  return (
    <div className="flex items-center gap-2">
      {css ? <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: css }} /> : <span className="h-3 w-3 rounded-full border bg-gray-200" />}
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-gray-50">
        {highlight(label, q)}
      </span>
    </div>
  );
}

export default function ProductsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // 0-based for UI
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPage = useCallback(async (uiPage: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>(
        `/api/products?page=${uiPage + 1}&limit=${ITEMS_PER_PAGE}`
      );

      // Some older rows might not have `color`; try to derive from attributes if the API still returns it there.
      const raw: any[] = (data as any)?.rows ?? [];
      const normalized: ProductRow[] = raw.map((r: any) => ({
        ...r,
        // prefer top-level color; fallback to common attribute keys
        color:
          r.color ??
          r?.attributes?.color ??
          r?.attributes?.Color ??
          r?.attributes?.colour ??
          r?.attributes?.COLOUR ??
          undefined,
      }));

      setRows(normalized);
      setTotal(data.total ?? normalized.length ?? 0);
    } catch (err) {
      console.error("Error fetching products:", err);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total]
  );

  // Filter now includes color
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const qty = (r.quantity ?? 0).toString();
      return (
        r.title.toLowerCase().includes(q) ||
        r.styleNumber.toLowerCase().includes(q) ||
        (r.color ?? "").toLowerCase().includes(q) ||
        (r.size ?? "").toLowerCase().includes(q) ||
        (r.status ?? "").toString().toLowerCase().includes(q) ||
        qty.includes(q)
      );
    });
  }, [rows, searchTerm]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete (archive) this product row?")) return;
    try {
      setDeletingId(id);
      await api.delete(`/api/products/${id}`); // 204 on success
      await fetchPage(page);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to delete product.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <div className="p-6 text-lg font-medium">Loading products…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-6">Products</h1>
        <div className="flex justify-end mb-4 gap-2">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Title, Style, Color, Size, Status, Qty"
            className="w-80"
          />
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
            onClick={() => router.push("/Products/new")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create product
          </Button>
          <Button variant="outline" onClick={() => fetchPage(page)}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="font-semibold">Style No.</TableHead>
              <TableHead className="font-semibold">Title</TableHead>
              <TableHead className="font-semibold">Color</TableHead>
              <TableHead className="font-semibold">Size</TableHead>
              <TableHead className="font-semibold">Qty</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Price</TableHead>
              <TableHead className="font-semibold">Last Updated</TableHead>
              <TableHead className="font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-sm text-gray-500">
                  {searchTerm ? <>No matches for “{searchTerm}”.</> : <>No products found.</>}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p._id}>
                  <TableCell className="font-mono">
                    <Link href={`/Products/${p._id}`} className="text-indigo-600 hover:underline">
                      {highlight(p.styleNumber, searchTerm)}
                    </Link>
                  </TableCell>

                  <TableCell>{highlight(p.title, searchTerm)}</TableCell>

                  {/* Color cell */}
                  <TableCell>
                    <ColorCell color={p.color} q={searchTerm} />
                  </TableCell>

                  <TableCell>{highlight(p.size ?? "", searchTerm)}</TableCell>
                  <TableCell className="tabular-nums">{p.quantity ?? 0}</TableCell>

                  <TableCell>
                    <StatusBadge status={String(p.status)} />
                  </TableCell>

                  <TableCell>{formatMinorGBP(p.price)}</TableCell>
                  <TableCell>
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleString("en-GB") : "—"}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Link href={`/Products/${p._id}`} className="text-indigo-600 hover:underline inline-flex items-center gap-1">
                        <ViewIcon className="h-4 w-4" />
                        View
                      </Link>
                      <span className="opacity-30">|</span>
                      <button
                        className="text-red-500 inline-flex items-center gap-1"
                        onClick={() => handleDelete(p._id)}
                        aria-label="Delete product"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === p._id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-4 mt-6">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="flex items-center text-gray-700">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
