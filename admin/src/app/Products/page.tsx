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
import { Plus } from "lucide-react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";

/** ---- List response types (unchanged) ---- */
type ProductRow = {
  _id: string;
  styleNumber: string;
  title: string;
  status:
    | "Active"
    | "Inactive"
    | "Draft"
    | "Archived"
    | "active"
    | "inactive"
    | "draft"
    | "archived";
  price: number; // minor units (pence)
  updatedAt?: string;
  variantCount?: number;
};
type ListResponse = {
  page: number;
  limit: number;
  total: number;
  rows: ProductRow[];
};

/** ---- Deep product (now includes onOrderTotal on Size) ---- */
type SizeRow = {
  _id: string;
  label: string; // size
  barcode: string;
  totalQuantity?: number;
  reservedTotal?: number;
  sellableQuantity?: number;
  onOrderTotal?: number; // <-- product.getDeep should provide this
};
type VariantDeep = {
  _id: string;
  sku: string;
  status?: "Active" | "Inactive" | "active" | "inactive";
  color?: { name?: string; code?: string };
  sizes?: SizeRow[];
};
type ProductDeep = {
  _id: string;
  styleNumber: string;
  title: string;
  status: ProductRow["status"];
  price: number; // minor units
  updatedAt?: string;
  dressType?: string;
  variants?: VariantDeep[];
};

/** ---- Flattened line-item for rendering ---- */
type SizeLineItem = {
  productId: string;
  variantId: string;
  sizeId: string;
  barcode: string;
  title: string;
  styleNumber: string;
  sku: string;
  sizeLabel: string;
  priceMinor: number;
  totalStock: number;
  onOrder: number;
  freeToSell: number;
  dressType?: string;
};

const ITEMS_PER_PAGE = 15;

function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function n0(n: unknown, fallback = 0) {
  return typeof n === "number" && !Number.isNaN(n) ? n : fallback;
}

/** Highlight matched text inside a cell (very small helper) */
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

export default function ProductsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // 0-based for UI
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
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
  const [dressFilter, setDressFilter] = useState<string>("");

  // Deep product cache (variants + sizes) per product
  const [deepMap, setDeepMap] = useState<Record<string, ProductDeep>>({});
  const [deepLoading, setDeepLoading] = useState<Record<string, boolean>>({});

  const fetchPage = useCallback(async (uiPage: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>(
        `/api/products?page=${uiPage + 1}&limit=${ITEMS_PER_PAGE}`
      );
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
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

  
  const visible = rows;
  console.log(visible)

  /** Fetch deep product (variants + sizes) for visible products (lazy) */
  const fetchDeepForVisible = useCallback(async () => {
    const idsToFetch = visible
      .map((r) => r._id)
      .filter((id) => !deepMap[id] && !deepLoading[id]);

    if (idsToFetch.length === 0) return;

    setDeepLoading((prev) => {
      const next = { ...prev };
      idsToFetch.forEach((id) => {
        next[id] = true;
      });
      return next;
    });

    try {
      const results = await Promise.allSettled(
        idsToFetch.map(async (id) => {
          const { data } = await api.get<ProductDeep>(`/api/products/${id}`);
          return { id, deep: data };
        })
      );

      const add: Record<string, ProductDeep> = {};
      const done: Record<string, boolean> = {};

      results.forEach((r) => {
        if (r.status === "fulfilled") {
          const { id, deep } = r.value;
          add[id] = deep;
          done[id] = true;
        } else {
          const failedId =
            (r as any).reason?.config?.url?.split("/").pop() ?? null;
          if (failedId) done[failedId] = true;
        }
      });

      if (Object.keys(add).length) {
        setDeepMap((prev) => ({ ...prev, ...add }));
      }
      if (Object.keys(done).length) {
        setDeepLoading((prev) => {
          const next = { ...prev };
          Object.keys(done).forEach((id) => delete next[id]);
          return next;
        });
      }
    } catch (e) {
      console.error(e);
      setDeepLoading((prev) => {
        const next = { ...prev };
        idsToFetch.forEach((id) => delete next[id]);
        return next;
      });
    }
  }, [visible, deepMap, deepLoading]);

  useEffect(() => {
    fetchDeepForVisible();
  }, [fetchDeepForVisible]);

  /** ---- FLATTEN: product→variant→sizes into size-level line items ---- */
  const sizeLineItems = useMemo<SizeLineItem[]>(() => {
    const out: SizeLineItem[] = [];

    for (const p of visible) {
      const deep = deepMap[p._id];
      if (!deep?.variants?.length) continue;

      for (const v of deep.variants) {
        const sizes = v.sizes ?? [];
        for (const s of sizes) {
          out.push({
            productId: p._id,
            variantId: v._id,
            sizeId: s._id,
            barcode: s.barcode,
            title: p.title,
            styleNumber: p.styleNumber,
            sku: v.sku,
            sizeLabel: s.label,
            priceMinor: p.price,
            dressType: (deep as any)?.dressType || undefined,
            totalStock: n0(s.totalQuantity),
            onOrder: n0(s.onOrderTotal),
            freeToSell: n0(s.sellableQuantity),
          });
        }
      }
    }
    return out;
  }, [visible, deepMap]);

  // ✅ Filter the list we actually render
  const filteredLines = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const byText = !q
      ? sizeLineItems
      : sizeLineItems.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.styleNumber.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      item.sizeLabel.toLowerCase().includes(q) ||
      item.barcode.toLowerCase().includes(q)
    );
    const byDress = dressFilter
      ? byText.filter((i) => (i.dressType || "").toLowerCase() === dressFilter.toLowerCase())
      : byText;
    return byDress;
  }, [sizeLineItems, searchTerm, dressFilter]);

  if (loading)
    return <div className="p-6 text-lg font-medium">Loading products…</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between gap-3 flex-wrap md:flex-nowrap">
        <h1 className="text-2xl font-bold mb-2 md:mb-6">Products</h1>
        <div className="flex flex-col md:flex-row md:items-center md:gap-3 mb-4">
          <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Product, Style, SKU, Size, Barcode"
              className="w-full md:w-72"
            />
            <select
              className="h-10 border rounded px-3 w-full md:w-auto"
              value={dressFilter}
              onChange={(e) => setDressFilter(e.target.value)}
            >
              <option value="">All Dress Types</option>
              {DRESS_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-2 md:mt-0">
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
              onClick={() => router.push("/Products/new")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create product
            </Button>
            <Button onClick={() => router.push("/Products/draft")}>Draft</Button>
            <Button variant="outline" onClick={() => fetchPage(page)}>Refresh</Button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto border rounded-lg shadow-sm hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="font-semibold">Barcode (Ref)</TableHead>
              <TableHead className="font-semibold">Title</TableHead>
              <TableHead className="font-semibold">Style No.</TableHead>
              <TableHead className="font-semibold">SKU</TableHead>
              <TableHead className="font-semibold">Size</TableHead>
              <TableHead className="font-semibold">Price</TableHead>
              <TableHead className="font-semibold">Total stock</TableHead>
              <TableHead className="font-semibold">On order</TableHead>
              <TableHead className="font-semibold">Free to sell</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredLines.length === 0 ? (
              <>
                {searchTerm ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-sm text-gray-500">
                      No matches for “{searchTerm}”.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell colSpan={9} className="text-sm text-gray-500">
                        {deepLoading[p._id]
                          ? `Loading sizes for ${p.title} (${p.styleNumber})…`
                          : `No sizes found for ${p.title} (${p.styleNumber}).`}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </>
            ) : (
              filteredLines.map((li) => (
                <TableRow key={`${li.productId}-${li.variantId}-${li.sizeId}`}>
                  <TableCell className="font-mono">
                    <span className="text-gray-900">
                      {highlight(li.barcode, searchTerm)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/Products/${li.productId}`}
                      className="text-indigo-600 hover:underline"
                      title="Open product details"
                    >
                      {highlight(li.title, searchTerm)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono">
                    <span className="text-gray-900">
                      {highlight(li.styleNumber, searchTerm)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/Variant/${encodeURIComponent(li.sku)}`}
                      className="text-indigo-600 hover:underline"
                      title={`Open variant ${li.sku}`}
                    >
                      {highlight(li.sku, searchTerm)}
                    </Link>
                  </TableCell>
                  <TableCell>{highlight(li.sizeLabel, searchTerm)}</TableCell>
                  <TableCell>{formatMinorGBP(li.priceMinor)}</TableCell>
                  <TableCell>{li.totalStock}</TableCell>
                  <TableCell>{li.onOrder}</TableCell>
                  <TableCell>{li.freeToSell}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filteredLines.length === 0 ? (
          <div className="text-sm text-gray-500 p-3 border rounded">No products found.</div>
        ) : (
          filteredLines.map((li) => (
            <div key={`${li.productId}-${li.variantId}-${li.sizeId}`} className="border rounded p-3 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{li.title}</div>
                <div className="text-xs text-gray-500">{formatMinorGBP(li.priceMinor)}</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-gray-500 text-xs">Barcode</div>
                  <div className="font-mono break-all">{li.barcode}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Style No.</div>
                  <div className="font-mono">{li.styleNumber}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">SKU</div>
                  <Link href={`/Variant/${encodeURIComponent(li.sku)}`} className="text-indigo-600 underline">
                    {li.sku}
                  </Link>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Size</div>
                  <div>{li.sizeLabel}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Total</div>
                  <div>{li.totalStock}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Sellable</div>
                  <div>{li.freeToSell}</div>
                </div>
              </div>
            </div>
          ))
        )}
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
