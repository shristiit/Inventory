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
import { Edit2, Plus, Trash2, ViewIcon } from "lucide-react"; // 👈 import Trash2
import api from "@/lib/api";
import { Input } from "@/components/ui/input";

/** ---- API types (matches your model/controller) ---- */
type ProductRow = {
  _id: string;
  styleNumber: string;
  title: string;
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
  price: number; // minor units (pence)
  updatedAt?: string;
};

type ListResponse = {
  page: number;
  limit: number;
  total: number;
  rows: ProductRow[];
};

const ITEMS_PER_PAGE = 15;

function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function prettyStatus(s: string) {
  const v = s.toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** Highlight matched text inside a cell */
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
  const [deletingId, setDeletingId] = useState<string | null>(null); // 👈 new

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

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const qty = (r.quantity ?? 0).toString();
      return (
        r.title.toLowerCase().includes(q) ||
        r.styleNumber.toLowerCase().includes(q) ||
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
      // Refresh the current page from server to keep pagination/total correct
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
            placeholder="Search Title, Style, Size, Status, Qty"
            className="w-72"
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
                <TableCell colSpan={8} className="text-sm text-gray-500">
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
                  <TableCell>{highlight(p.size ?? "", searchTerm)}</TableCell>
                  <TableCell className="tabular-nums">{p.quantity ?? 0}</TableCell>
                  <TableCell>{prettyStatus(String(p.status))}</TableCell>
                  <TableCell>{formatMinorGBP(p.price)}</TableCell>
                  <TableCell>
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleString("en-GB") : "—"}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/Products/${p._id}`} className="text-indigo-600 hover:underline">
                        <ViewIcon  className="h-4"/>
                      </Link>
                      <span className="opacity-30">|</span>
                      
                      {/* 👇 Real delete action */}
                      <button className="text-red-500"
                        onClick={() => handleDelete(p._id)}
                        aria-label="Delete product"
                      >
                        <Trash2 className="h-4"/>
                        {deletingId === p._id ? "Deleting…" : ""}
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
