"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

/* ---- Types (match your API) ---- */
type Size = {
  _id: string;
  label: string;
  barcode: string;
  totalQuantity?: number;
  reservedTotal?: number;
  sellableQuantity?: number;
  onOrder?: number;        // variant.service.ts returns onOrder (sum)
  onOrderTotal?: number;   // product.getDeep uses onOrderTotal — handle both
};

type VariantDeep = {
  _id: string;
  sku: string;
  status?: "active" | "inactive" | "draft" | "archived";
  color?: { name?: string; code?: string };
  priceMinor?: number;
  product?: { _id?: string; title?: string; styleNumber?: string };
  updatedAt?: string;
  sizes?: Size[];
  images?: string[]; // alias of media
};

function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export default function VariantPage() {
  const { sku } = useParams<{ sku: string }>();
  const router = useRouter();
  const [data, setData] = useState<VariantDeep | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        // ✅ hits your Express route: GET /products/variants/by-sku/:sku
        const resp = await api.get<VariantDeep>(`/api/products/variants/by-sku/${encodeURIComponent(String(sku))}`);
        if (!cancelled) setData(resp.data);
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || "Unknown error";
        if (!cancelled) setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sku]);

  const priceGBP = useMemo(() => formatMinorGBP(data?.priceMinor), [data?.priceMinor]);
  const updated = useMemo(() => {
    if (!data?.updatedAt) return "—";
    try {
      return new Date(data.updatedAt).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return data.updatedAt; }
  }, [data?.updatedAt]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Color and Details</h1>
          <p className="text-sm text-muted-foreground">SKU: {sku}</p>
        </div>
        <div className="flex gap-2">
          {data?.product?._id && (
            <Button variant="outline" onClick={() => router.push(`/Products/${data.product!._id}`)}>
              View Product
            </Button>
          )}
          <Button variant="outline" onClick={() => router.back()}>Back</Button>
        </div>
      </div>

      {loading && <p className="text-sm">Loading variant…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      {!loading && !err && data && (
        <>
          {/* Overview */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Overview</h2>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="w-48 font-medium">Product</TableCell>
                  <TableCell>
                    {data.product?.title || "—"}
                    {data.product?.styleNumber && (
                      <span className="ml-2 text-muted-foreground">(Style: {data.product.styleNumber})</span>
                    )}
                  </TableCell>
                </TableRow>
                <TableRow><TableCell className="font-medium">SKU</TableCell><TableCell>{data.sku}</TableCell></TableRow>
                <TableRow>
                  <TableCell className="font-medium">Status</TableCell>
                  <TableCell>
                    <span className={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs capitalize",
                      data.status === "active" ? "bg-green-100 text-green-800"
                        : data.status === "inactive" ? "bg-gray-100 text-gray-800"
                        : data.status === "draft" ? "bg-yellow-100 text-yellow-800"
                        : data.status === "archived" ? "bg-red-100 text-red-800"
                        : "bg-slate-100 text-slate-800",
                    ].join(" ")}>
                      {data.status || "unknown"}
                    </span>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Colour</TableCell>
                  <TableCell className="flex items-center gap-3">
                    
                    <span>
                      {data.color?.name || "—"}
                      {data.color?.code && <span className="ml-2 text-muted-foreground"></span>}
                    </span>
                  </TableCell>
                </TableRow>
                <TableRow><TableCell className="font-medium">Price</TableCell><TableCell>{priceGBP}</TableCell></TableRow>
                <TableRow><TableCell className="font-medium">Updated</TableCell><TableCell>{updated}</TableCell></TableRow>
                <TableRow><TableCell className="font-medium">Variant ID</TableCell><TableCell className="text-xs text-muted-foreground">{data._id}</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Sizes */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Sizes & Inventory</h2>
            {data.sizes?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Size</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Sellable</TableHead>
                    <TableHead className="text-right">On&nbsp;Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sizes.map((s) => {
                    const total = s.totalQuantity ?? 0;
                    const reserved = s.reservedTotal ?? 0;
                    const sellable = s.sellableQuantity ?? Math.max(total - reserved, 0);
                    const onOrder = (s.onOrder ?? s.onOrderTotal ?? 0);
                    return (
                      <TableRow key={s._id}>
                        <TableCell className="font-medium">{s.label}</TableCell>
                        <TableCell className="font-mono text-xs">{s.barcode || "—"}</TableCell>
                        <TableCell className="text-right">{total}</TableCell>
                        <TableCell className="text-right">{reserved}</TableCell>
                        <TableCell className="text-right">{sellable}</TableCell>
                        <TableCell className="text-right">{onOrder}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No sizes found.</p>
            )}
          </div>

          {/* Images */}
          {Array.isArray(data.images) && data.images.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Images</h2>
              <div className="flex flex-wrap gap-3">
                {data.images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`Variant image ${i + 1}`} className="h-24 w-24 rounded-md object-cover border" />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
