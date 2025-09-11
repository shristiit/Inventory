"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";

type ProductRow = {
  _id: string;
  styleNumber: string;
  title: string;
  status: "active" | "inactive" | "draft" | "archived";
  price: number; // minor units
  updatedAt?: string;
};
type ListResponse = {
  page: number;
  limit: number;
  total: number;
  rows: ProductRow[];
};

type SizeRow = {
  _id: string;
  label: string;
  barcode: string;
  totalQuantity?: number;
  reservedTotal?: number;
  sellableQuantity?: number;
  onOrderTotal?: number;
};
type VariantDeep = { _id: string; sku: string; sizes?: SizeRow[] };
type ProductDeep = { _id: string; styleNumber: string; title: string; price: number; variants?: VariantDeep[] };

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

const ITEMS_PER_PAGE = 20;

function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export default function DraftProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const [deepMap, setDeepMap] = useState<Record<string, ProductDeep>>({});
  const [deepLoading, setDeepLoading] = useState<Record<string, boolean>>({});

  const fetchPage = useCallback(async (uiPage: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>(`/api/products`, { params: { page: uiPage + 1, limit: ITEMS_PER_PAGE, status: 'draft' } });
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPage(page); }, [page, fetchPage]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)), [total]);

  const visible = rows;

  // Fetch deep product lazily for visible rows
  useEffect(() => {
    const idsToFetch = visible.map(r => r._id).filter(id => !deepMap[id] && !deepLoading[id]);
    if (idsToFetch.length === 0) return;
    setDeepLoading(prev => ({ ...prev, ...Object.fromEntries(idsToFetch.map(id => [id, true])) }));
    (async () => {
      try {
        const results = await Promise.allSettled(idsToFetch.map(async (id) => ({ id, deep: (await api.get<ProductDeep>(`/api/products/${id}`)).data })));
        const add: Record<string, ProductDeep> = {}; const done: Record<string, boolean> = {};
        results.forEach(r => { if (r.status === 'fulfilled') { add[r.value.id] = r.value.deep; done[r.value.id] = true; } });
        if (Object.keys(add).length) setDeepMap(prev => ({ ...prev, ...add }));
        if (Object.keys(done).length) setDeepLoading(prev => { const n = { ...prev }; Object.keys(done).forEach(id => delete n[id]); return n; });
      } catch {
        setDeepLoading(prev => { const n = { ...prev }; idsToFetch.forEach(id => delete n[id]); return n; });
      }
    })();
  }, [visible, deepMap, deepLoading]);

  const sizeLineItems = useMemo<SizeLineItem[]>(() => {
    const out: SizeLineItem[] = [];
    for (const p of visible) {
      const deep = deepMap[p._id];
      if (!deep?.variants?.length) continue;
      for (const v of deep.variants) {
        for (const s of v.sizes || []) {
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
            totalStock: s.totalQuantity ?? 0,
            onOrder: s.onOrderTotal ?? 0,
            freeToSell: s.sellableQuantity ?? Math.max((s.totalQuantity ?? 0) - (s.reservedTotal ?? 0), 0),
          });
        }
      }
    }
    return out;
  }, [visible, deepMap]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between gap-3 flex-wrap md:flex-nowrap mb-4">
        <h1 className="text-2xl font-bold">Draft Products — Size</h1>
        <Button asChild variant="outline"><Link href="/Products">Back to Products</Link></Button>
      </div>

      {loading ? (
        <div className="p-3 text-gray-600">Loading drafts…</div>
      ) : (
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
            {sizeLineItems.length === 0 ? (
              visible.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-sm text-gray-500">No draft products.</TableCell></TableRow>
              ) : (
                visible.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell colSpan={9} className="text-sm text-gray-500">
                      {deepLoading[p._id] ? `Loading sizes for ${p.title} (${p.styleNumber})…` : `No sizes found for ${p.title} (${p.styleNumber}).`}
                    </TableCell>
                  </TableRow>
                ))
              )
            ) : (
              sizeLineItems.map((li) => (
                <TableRow key={`${li.productId}-${li.variantId}-${li.sizeId}`}>
                  <TableCell className="font-mono">{li.barcode}</TableCell>
                  <TableCell>
                    <Link href={`/Products/${li.productId}`} className="text-indigo-600 hover:underline" title="Open product details">{li.title}</Link>
                  </TableCell>
                  <TableCell className="font-mono">{li.styleNumber}</TableCell>
                  <TableCell>
                    <Link href={`/Variant/${encodeURIComponent(li.sku)}`} className="text-indigo-600 hover:underline" title={`Open variant ${li.sku}`}>{li.sku}</Link>
                  </TableCell>
                  <TableCell>{li.sizeLabel}</TableCell>
                  <TableCell>{formatMinorGBP(li.priceMinor)}</TableCell>
                  <TableCell>{li.totalStock}</TableCell>
                  <TableCell>{li.onOrder}</TableCell>
                  <TableCell>{li.freeToSell}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-4 mt-6">
          <Button variant="outline" onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0}>Previous</Button>
          <span className="flex items-center text-gray-700">Page {page + 1} of {totalPages}</span>
          <Button variant="outline" onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))} disabled={page >= totalPages - 1}>Next</Button>
        </div>
      )}
    </div>
  );
}
