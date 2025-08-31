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
  status: "Active" | "Inactive" | "Draft" | "Archived";
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

/** ---- Variant list (from GET /api/products/:id/variants) ---- */
type VariantRow = {
  _id: string;
  sku: string;
  color?: { name?: string; code?: string };
  status?: "Active" | "Inactive";
  // (sizes aren’t returned by this endpoint unless you add a populate)
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

  // Variants per product
  const [variantMap, setVariantMap] = useState<Record<string, VariantRow[]>>(
    {}
  );
  const [variantLoading, setVariantLoading] = useState<Record<string, boolean>>(
    {}
  );

  // Totals per product (keep your existing structure if you had it)
  const [qtyMap, setQtyMap] = useState<
    Record<string, { total: number; reserved: number; sellable: number }>
  >({});
  const [qtyLoading, setQtyLoading] = useState<Record<string, boolean>>({});

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
  console.log("products ==>", rows);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total]
  );

  // Visible rows on this page
  const visible = rows;

  /** ---- Fetch variants for currently visible products (lazy) ---- */
  const fetchVariantsForVisible = useCallback(async () => {
    const idsToFetch = visible
      .map((r) => r._id)
      .filter((id) => !variantMap[id] && !variantLoading[id]);

    if (idsToFetch.length === 0) return;

    // mark in-flight
    setVariantLoading((prev) => {
      const next = { ...prev };
      idsToFetch.forEach((id) => {
        next[id] = true;
      });
      return next;
    });

    try {
      const results = await Promise.allSettled(
        idsToFetch.map(async (id) => {
          const { data } = await api.get<VariantRow[]>(
            `/api/products/${id}/variants`
          );
          return { id, variants: data || [] };
        })
      );
     console.log(results)

      const add: Record<string, VariantRow[]> = {};
      const done: Record<string, boolean> = {};

      results.forEach((r) => {
        if (r.status === "fulfilled") {
          const { id, variants } = r.value;
          add[id] = variants;
          done[id] = true;
        } else {
          const failedId =
            (r as any).reason?.config?.url?.split("/").pop() ?? null;
          if (failedId) done[failedId] = true;
        }
      });

      if (Object.keys(add).length) {
        setVariantMap((prev) => ({ ...prev, ...add }));
      }
      if (Object.keys(done).length) {
        setVariantLoading((prev) => {
          const next = { ...prev };
          Object.keys(done).forEach((id) => {
            delete next[id];
          });
          return next;
        });
      }
    } catch (e) {
      console.error(e);
      // clear in-flight flags on error
      setVariantLoading((prev) => {
        const next = { ...prev };
        idsToFetch.forEach((id) => delete next[id]);
        return next;
      });
    }
  }, [visible, variantMap, variantLoading]);

  useEffect(() => {
    fetchVariantsForVisible();
  }, [fetchVariantsForVisible]);

  // (Optional) If you still want to compute and show totals, keep your existing logic here.
  // For brevity, the following demo shows only the Variants column from the variants API.

  // render a list of variant chips
  function renderVariantChips(
    vs?: VariantRow[] | undefined,
    productId: string
  ) {
    if (!vs || vs.length === 0) return <span>—</span>;
    const max = 6;
    const head = vs.slice(0, max);
    const extra = vs.length - head.length;
    return (
      <div className="flex flex-wrap gap-1">
        {head.map((v) => {
          const label = v.color?.name ? `${v.sku} ·${v.color.name} ${v.status}` : v.sku;
          return (
            <span
              key={v._id}
              className={`${v.status === "inactive" ? "bg-red-200 px-2 py-1 rounded-lg" : "bg-gray-200 px-2 py-1 rounded-lg"}`}
              title={label}
            >
              {label}
            </span>
          );
        })}
        {extra > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
            +{extra} more
          </span>
        )}
      </div>
    );
  }

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
              <TableHead className="font-semibold">Colors and Styles</TableHead>
              <TableHead className="font-semibold">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-6 text-gray-500"
                >
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((p) => {
                const vList = variantMap[p._id];
                const vLoading = !!variantLoading[p._id];
                return (
                  <TableRow
                    key={p._id}
                    className="hover:bg-indigo-50 transition-colors"
                  >
                    <TableCell className="font-mono">
                      <Link
                        href={`/products/${p._id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {p.styleNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">
                      <Link
                        href={`/products/${p._id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{p.status}</TableCell>
                    <TableCell className="capitalize">{formatMinorGBP(p.price)}</TableCell>

                    {/* Variants from GET /api/products/:id/variants */}
                    <TableCell className="capitalize">{renderVariantChips(vList, p._id)}</TableCell>

                    <TableCell>
                      {p.updatedAt
                        ? new Date(p.updatedAt).toLocaleDateString("en-GB")
                        : "—"}
                    </TableCell>
                  </TableRow>
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
