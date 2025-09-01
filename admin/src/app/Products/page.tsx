"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import api from "@/lib/api";

type ProductRow = {
  _id: string;
  styleNumber: string;
  title: string;
  status: "Active" | "Inactive" | "Draft" | "Archived";
  price: number;
  updatedAt?: string;
  variantCount?: number;
};
type ListResponse = {
  page: number;
  limit: number;
  total: number;
  rows: ProductRow[];
};

const ITEMS_PER_PAGE = 20;

export default function ProductsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [titleData, setTitleData] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      // ✅ hit the correct API route:
      const { data } = await api.get<ListResponse>(`/api/products?page=${p}&limit=${ITEMS_PER_PAGE}`);
      setTitleData(data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Error fetching products:", e);
      setTitleData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ actually call the fetch on mount & when page changes
  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total]
  );

   

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
          {/* ✅ wire Refresh to the correct function */}
          <Button variant="outline" onClick={() => fetchPage(page)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead>Bar Code</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="font-semibold">Title</TableHead>
              <TableHead className="font-semibold">Style No.</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>On Order</TableHead>
              <TableHead className="font-semibold">Free To Sell</TableHead>
              <TableHead className="font-semibold">Price (minor)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {titleData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                  {loading ? "Loading…" : "No products found."}
                </TableCell>
              </TableRow>
            ) : (
              titleData.map((p) => (
                <TableRow key={p._id}>
                  <TableCell className="font-mono">-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>{p.title}</TableCell>
                  <TableCell>{p.styleNumber}</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("en-GB") : "—"}
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
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="flex items-center text-gray-700">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
