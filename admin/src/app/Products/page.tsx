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

/** ---- List response types ---- */
type ProductRow = {
  _id: string;
  styleNumber: string;
  title: string;
  status: "Active" | "Inactive" | "Draft" | "Archived" | "active" | "inactive" | "draft" | "archived";
  price: number; // minor units
  updatedAt?: string;
  variantCount?: number;
};
type ListResponse = {
  page: number;
  limit: number;
  total: number;
  rows: ProductRow[];
};

/** ---- Deep product (for variants + sizes) ---- */
type SizeRow = {
  _id: string;
  label: string;
  barcode: string;
  totalQuantity?: number;
  reservedTotal?: number;
  sellableQuantity?: number;
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

const ITEMS_PER_PAGE = 15;

function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export default function ProductsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // 0-based for UI
  const [total, setTotal] = useState(0);

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

  if (loading)
    return <div className="p-6 text-lg font-medium">Loading products…</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-6">Products</h1>
        <div className="flex justify-end mb-4 gap-2">
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
            onClick={() => router.push("/products/new")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create product
          </Button>
          <Button onClick={() => router.push("/products/inactive")}>
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
              <TableHead className="font-semibold">Style No.</TableHead>
              <TableHead className="font-semibold">Title</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Price</TableHead>
              <TableHead className="font-semibold">Color (Variant)</TableHead>
              <TableHead className="font-semibold">Size</TableHead>
              <TableHead className="font-semibold">Updated</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-gray-500">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((p) => {
                const deep = deepMap[p._id];
                const loadingDeep = !!deepLoading[p._id];
                const variants = deep?.variants ?? [];

                if (!deep && loadingDeep) {
                  return (
                    <TableRow key={p._id}>
                      <TableCell className="font-mono">
                        <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                          {p.styleNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">
                        <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                          {p.title}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{p.status}</TableCell>
                      <TableCell>{formatMinorGBP(p.price)}</TableCell>
                      <TableCell colSpan={2}>Loading variants…</TableCell>
                      <TableCell>
                        {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("en-GB") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                }

                // compute total rows this product will occupy = sum of sizes per variant (min 1)
                const totalRowsForProduct = (variants?.length
                  ? variants.reduce((sum, v) => sum + Math.max(1, (v.sizes?.length ?? 0)), 0)
                  : 1);

                // no variants case
                if (!variants || variants.length === 0) {
                  return (
                    <TableRow key={p._id}>
                      <TableCell className="font-mono">
                        <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                          {p.styleNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">
                        <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                          {p.title}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{p.status}</TableCell>
                      <TableCell>{formatMinorGBP(p.price)}</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("en-GB") : "—"}</TableCell>
                    </TableRow>
                  );
                }

                // there ARE variants; explode down to the size level
                let isFirstRowForProduct = true;

                return (
                  <React.Fragment key={p._id}>
                    {variants.map((v) => {
                      const sizes = (v.sizes && v.sizes.length > 0) ? v.sizes : [null as unknown as SizeRow];
                      const variantRowSpan = sizes.length;

                      // badge for variant status
                      const vStatus = (v.status || "active").toString().toLowerCase();
                      const badgeClass =
                        vStatus === "inactive"
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700";

                      return sizes.map((s, idx) => {
                        const isFirstSizeOfVariant = idx === 0;

                        const row = (
                          <TableRow key={`${p._id}-${v._id}-${s ? s._id : "nosize"}-${idx}`} className="align-top">
                            {/* product cells once per product group, spanning all its size rows */}
                            {isFirstRowForProduct && (
                              <>
                                <TableCell rowSpan={totalRowsForProduct} className="font-mono align-top">
                                  <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                                    {p.styleNumber}
                                  </Link>
                                </TableCell>
                                <TableCell rowSpan={totalRowsForProduct} className="capitalize align-top">
                                  <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                                    {p.title}
                                  </Link>
                                </TableCell>
                                <TableCell rowSpan={totalRowsForProduct} className="capitalize align-top">
                                  {p.status}
                                </TableCell>
                                <TableCell rowSpan={totalRowsForProduct} className="align-top">
                                  {formatMinorGBP(p.price)}
                                </TableCell>
                              </>
                            )}

                            {/* variant cell once per variant, spanning its sizes */}
                            {isFirstSizeOfVariant && (
                              <TableCell rowSpan={variantRowSpan} className="align-top">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 text-xs rounded-full ${badgeClass}`}>
                                    {v.status ?? "Active"}
                                  </span>
                                  <span>
                                    {v.color?.name ? `${v.color.name} (${v.sku})` : v.sku}
                                  </span>
                                </div>
                              </TableCell>
                            )}

                            {/* size cell (one per row) */}
                            <TableCell className="align-top">
                              {s ? (
                                <div>
                                  <div className="font-medium">{s.label}</div>
                                  <div className="text-xs text-gray-500 font-mono">{s.barcode}</div>
                                  {/* Optional: quantities */}
                                  {(typeof s.totalQuantity === "number" ||
                                    typeof s.reservedTotal === "number" ||
                                    typeof s.sellableQuantity === "number") && (
                                    <div className="text-xs text-gray-600 mt-1">
                                      {typeof s.totalQuantity === "number" && <>Total: {s.totalQuantity} </>}
                                      {typeof s.reservedTotal === "number" && <>· Reserved: {s.reservedTotal} </>}
                                      {typeof s.sellableQuantity === "number" && <>· Sellable: {s.sellableQuantity}</>}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>

                            {/* updatedAt only once per product group */}
                            {isFirstRowForProduct && (
                              <TableCell rowSpan={totalRowsForProduct} className="align-top">
                                {p.updatedAt
                                  ? new Date(p.updatedAt).toLocaleDateString("en-GB")
                                  : "—"}
                              </TableCell>
                            )}
                          </TableRow>
                        );

                        // flip the flag after rendering the first size row of the product
                        if (isFirstRowForProduct) isFirstRowForProduct = false;

                        return row;
                      });
                    })}
                  </React.Fragment>
                );
              })
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
