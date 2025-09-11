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
  onOrder?: number;
  onOrderTotal?: number;
};

type MediaItem = {
  url: string;
  type?: "image" | "video";
  isPrimary?: boolean;
};

type VariantDeep = {
  _id: string;
  sku: string;
  status?: "active" | "inactive" | "draft" | "archived";
  color?: { name?: string; code?: string };
  priceMinor?: number;
  product?: {
    _id?: string;
    title?: string;
    styleNumber?: string;
    images?: string[];
    media?: (MediaItem | string)[];
  };
  updatedAt?: string;
  sizes?: Size[];
  images?: string[];               // simple form
  media?: (MediaItem | string)[];  // rich form OR strings
};

function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function guessTypeFromUrl(url: string): "image" | "video" {
  const u = url.toLowerCase();
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov")) return "video";
  return "image";
}

function filenameFromUrl(url: string) {
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").filter(Boolean).pop() || url;
    return decodeURIComponent(base.split("?")[0].split("#")[0]);
  } catch {
    const base = url.split("/").pop() || url;
    return decodeURIComponent(base.split("?")[0].split("#")[0]);
  }
}

/** Make absolute if the API returned a relative path */
function toAbsoluteAssetUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    // already absolute?
    new URL(u);
    return u;
  } catch {
    // Prefer explicit ASSET base, then API base, then window origin
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const base =
      process.env.NEXT_PUBLIC_ASSET_BASE_URL ||
      apiBase ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!base) return u;
    if (u.startsWith("/")) return `${base}${u}`;
    return `${base}/${u}`;
  }
}

export default function VariantPage() {
  const { sku } = useParams<{ sku: string }>();
  const router = useRouter();
  const [data, setData] = useState<VariantDeep | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ group: 'variant' | 'product'; index: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const resp = await api.get<VariantDeep>(
          `/api/products/variants/by-sku/${encodeURIComponent(String(sku))}`
        );
        // Debug: see what your backend actually sends
        // Remove once confirmed.
        console.log("VariantDeep payload:", resp.data);
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

  const priceGBP = useMemo(() => {
    const minor = typeof data?.priceMinor === 'number' ? data!.priceMinor! : (data as any)?.product?.price;
    return formatMinorGBP(minor);
  }, [data?.priceMinor, (data as any)?.product?.price]);
  const updated = useMemo(() => {
    if (!data?.updatedAt) return "—";
    try {
      return new Date(data.updatedAt).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return data.updatedAt; }
  }, [data?.updatedAt]);

  // Build separate lists for variant and product media
  const variantMediaList = useMemo<MediaItem[]>(() => {
    const raw: Array<MediaItem | string> = [];
    if (Array.isArray(data?.media)) raw.push(...(data!.media!));
    if (Array.isArray(data?.images)) raw.push(...(data!.images!));
    const normalized: MediaItem[] = raw
      .map((m) => {
        if (typeof m === 'string') {
          const abs = toAbsoluteAssetUrl(m);
          return abs ? { url: abs, type: guessTypeFromUrl(abs) } : null;
        }
        const abs = toAbsoluteAssetUrl(m.url);
        if (!abs) return null;
        return { url: abs, type: m.type || guessTypeFromUrl(abs), isPrimary: m.isPrimary };
      })
      .filter(Boolean) as MediaItem[];
    const uniq = new Map<string, MediaItem>();
    normalized.forEach((m) => uniq.set(m.url, m));
    return Array.from(uniq.values()).sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  }, [data?.media, data?.images]);

  const productMediaList = useMemo<MediaItem[]>(() => {
    const raw: Array<MediaItem | string> = [];
    if (Array.isArray(data?.product?.media)) raw.push(...(data!.product!.media!));
    if (Array.isArray(data?.product?.images)) raw.push(...(data!.product!.images!));
    const normalized: MediaItem[] = raw
      .map((m) => {
        if (typeof m === 'string') {
          const abs = toAbsoluteAssetUrl(m);
          return abs ? { url: abs, type: guessTypeFromUrl(abs) } : null;
        }
        const mm = m as MediaItem;
        const abs = toAbsoluteAssetUrl(mm.url);
        if (!abs) return null;
        return { url: abs, type: mm.type || guessTypeFromUrl(abs), isPrimary: mm.isPrimary };
      })
      .filter(Boolean) as MediaItem[];
    const uniq = new Map<string, MediaItem>();
    normalized.forEach((m) => uniq.set(m.url, m));
    return Array.from(uniq.values());
  }, [data?.product?.media, data?.product?.images]);

  const openVariantAt = (i: number) => {
    if (i >= 0 && i < variantMediaList.length) setLightbox({ group: 'variant', index: i });
  };
  const openProductAt = (i: number) => {
    if (i >= 0 && i < productMediaList.length) setLightbox({ group: 'product', index: i });
  };
  const closeLightbox = () => setLightbox(null);
  const nextLightbox = () => {
    setLightbox((lb) => {
      if (!lb) return lb;
      const arr = lb.group === 'variant' ? variantMediaList : productMediaList;
      const next = (lb.index + 1) % Math.max(arr.length, 1);
      return { ...lb, index: next };
    });
  };
  const prevLightbox = () => {
    setLightbox((lb) => {
      if (!lb) return lb;
      const arr = lb.group === 'variant' ? variantMediaList : productMediaList;
      const prev = (lb.index - 1 + Math.max(arr.length, 1)) % Math.max(arr.length, 1);
      return { ...lb, index: prev };
    });
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") nextLightbox();
      else if (e.key === "ArrowLeft") prevLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, variantMediaList.length, productMediaList.length]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Details</h1>
        </div>
        <div className="flex gap-2">
          
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
                  
                </TableRow>
                <TableRow><TableCell className="font-medium">Updated</TableCell><TableCell>{updated}</TableCell></TableRow>

                {/* Media thumbnails in overview with filename captions (prefer variant; fallback to product) */}
                <TableRow>
                  <TableCell className="font-medium">Media</TableCell>
                  <TableCell>
                    {variantMediaList.length === 0 && productMediaList.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {(variantMediaList.length ? variantMediaList : productMediaList).slice(0, 4).map((m, i) => {
                          const name = filenameFromUrl(m.url);
                          const open = variantMediaList.length ? () => openVariantAt(i) : () => openProductAt(i);
                          return (
                            <figure key={m.url + i} className="w-20">
                              <button type="button" onClick={open} className="block" title="Click to expand">
                                {m.type === "video" ? (
                                  <video src={m.url} className="h-16 w-16 rounded border object-cover cursor-zoom-in" muted playsInline />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={m.url} alt={name} className="h-16 w-16 rounded border object-cover cursor-zoom-in" />
                                )}
                              </button>
                              <span className="block mt-1 text-[10px] text-muted-foreground truncate" title={name}>
                                {name}
                              </span>
                            </figure>
                          );
                        })}
                        {(variantMediaList.length ? variantMediaList :"").length > 4 && (
                          <span className="text-xs text-muted-foreground self-center">+{(variantMediaList.length ? variantMediaList : productMediaList).length - 4} more</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>

               
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

          {/* Variant media gallery */}
          {variantMediaList.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Color Media</h2>
              <div className="flex flex-wrap gap-3">
                {variantMediaList.map((m, i) => {
                  const name = filenameFromUrl(m.url);
                  return (
                    <figure key={m.url + i} className="w-28">
                      <button type="button" onClick={() => openVariantAt(i)} className="block" title="Click to expand">
                        {m.type === "video" ? (
                          <video src={m.url} className="h-24 w-24 rounded-md object-cover border cursor-zoom-in" muted playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt={name} className="h-24 w-24 rounded-md object-cover border cursor-zoom-in" />
                        )}
                      </button>
                      <span className="block mt-1 text-[10px] text-muted-foreground truncate" title={name}>
                        {name}
                      </span>
                    </figure>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product media gallery */}
          {productMediaList.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Product Media</h2>
              <div className="flex flex-wrap gap-3">
                {productMediaList.map((m, i) => {
                  const name = filenameFromUrl(m.url);
                  return (
                    <figure key={m.url + i} className="w-28">
                      <button type="button" onClick={() => openProductAt(i)} className="block" title="Click to expand">
                        {m.type === "video" ? (
                          <video src={m.url} className="h-24 w-24 rounded-md object-cover border cursor-zoom-in" muted playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt={name} className="h-24 w-24 rounded-md object-cover border cursor-zoom-in" />
                        )}
                      </button>
                      <span className="block mt-1 text-[10px] text-muted-foreground truncate" title={name}>
                        {name}
                      </span>
                    </figure>
                  );
                })}
              </div>
            </div>
          )}

          {lightbox && (
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={closeLightbox}
            >
              <button
                type="button"
                onClick={closeLightbox}
                aria-label="Close"
                className="absolute top-4 right-4 text-white/90 hover:text-white text-2xl"
              >
                ×
              </button>
              {(() => {
                const arr = lightbox.group === 'variant' ? variantMediaList : productMediaList;
                return arr.length > 1;
              })() && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); prevLightbox(); }}
                    aria-label="Previous"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/90 hover:text-white text-3xl"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); nextLightbox(); }}
                    aria-label="Next"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/90 hover:text-white text-3xl"
                  >
                    ›
                  </button>
                </>
              )}
              <div
                className="max-w-[95vw] max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const arr = lightbox.group === 'variant' ? variantMediaList : productMediaList;
                  const m = arr[lightbox.index];
                  const name = m ? filenameFromUrl(m.url) : '';
                  return (
                    <div className="flex flex-col items-center gap-2">
                      {m?.type === "video" ? (
                        <video
                          src={m?.url}
                          className="max-h-[80vh] max-w-[90vw] rounded shadow"
                          controls
                          autoPlay
                          playsInline
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m?.url}
                          alt={name}
                          className="max-h-[80vh] max-w-[90vw] rounded shadow"
                        />
                      )}
                      <div className="text-white/80 text-xs truncate max-w-full" title={name}>{name}</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
