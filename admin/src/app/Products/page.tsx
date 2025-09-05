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
    if (!q) return sizeLineItems;
    return sizeLineItems.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.styleNumber.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      item.sizeLabel.toLowerCase().includes(q) ||
      item.barcode.toLowerCase().includes(q)
    );
  }, [sizeLineItems, searchTerm]);

  if (loading)
    return <div className="p-6 text-lg font-medium">Loading products…</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-6">Products — Size </h1>
        <div className="flex justify-end mb-4 gap-2">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Product, Style, SKU, Size, Barcode"
            className="w-72"
          />
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
            onClick={() => router.push("/Products/new")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create product
          </Button>
          <Button onClick={() => router.push("/Products/inactive")}>
            In-active Products
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
                    <Link
                      href={`/Products/${li.productId}`}
                      className="text-indigo-600 hover:underline"
                      title="Open product"
                    >
                      {highlight(li.barcode, searchTerm)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/Products/${li.productId}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {highlight(li.title, searchTerm)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono">
                    {highlight(li.styleNumber, searchTerm)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/Variant/${encodeURIComponent(li.sku)}`}
                      className="text-indigo-600 hover:underline"
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
