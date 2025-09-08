"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";

type ProductLite = { _id: string; styleNumber?: string; title?: string; name?: string };
type SizeRow = {
  _id: string;
  styleNumber: string;
  title: string;
  size: string;
  price: number;         // minor units (pence)
  quantity?: number;     // on-hand (if you expose it)
  attributes?: Record<string, any>;
};

type SiblingsResponse = { styleNumber: string; count: number; rows: SizeRow[] };

type Line = {
  // productId here is just the "base" product we use to fetch siblings (sizes)
  productId: string;
  // sizeId is the actual product row (size) we will order
  sizeId: string;
  quantity: number;
  location: string;
};

const DEFAULT_LOCATION = "WH-DEFAULT";

export default function NewOrderPage() {
  const router = useRouter();

  // Customer + addresses
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [shipName, setShipName] = useState("");
  const [shipPhone, setShipPhone] = useState("");
  const [shipLine1, setShipLine1] = useState("");
  const [shipLine2, setShipLine2] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipPostcode, setShipPostcode] = useState("");
  const [shipCountry, setShipCountry] = useState("GB");

  const [billSame, setBillSame] = useState(true);
  const [billName, setBillName] = useState("");
  const [billPhone, setBillPhone] = useState("");
  const [billLine1, setBillLine1] = useState("");
  const [billLine2, setBillLine2] = useState("");
  const [billCity, setBillCity] = useState("");
  const [billPostcode, setBillPostcode] = useState("");
  const [billCountry, setBillCountry] = useState("GB");

  const [notes, setNotes] = useState("");

  // Catalog data
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [sizesCache, setSizesCache] = useState<Record<string, SizeRow[]>>({});
  const [filter, setFilter] = useState("");

  // Lines
  const [lines, setLines] = useState<Line[]>([
    { productId: "", sizeId: "", quantity: 1, location: DEFAULT_LOCATION },
  ]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetch product list (lightweight styles list)
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        let data: any;
        try {
          const res = await api.get("/api/products", { params: { page: 1, limit: 500 } });
          data = res.data;
        } catch {
          const res = await api.get("/api/products/list", { params: { page: 1, limit: 500 } });
          data = res.data;
        }
        const arr: any[] = Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data)
          ? data
          : [];

        // Deduplicate to style-level options (pick first row per styleNumber)
        const byStyle = new Map<string, any>();
        for (const p of arr) {
          const style = p.styleNumber ?? p.sku ?? "";
          if (!style) continue;
          if (!byStyle.has(style)) byStyle.set(style, p);
        }
        const styleOptions = Array.from(byStyle.values()).map((p) => ({
          _id: p._id, // use any row _id in this style as the base to fetch siblings
          styleNumber: p.styleNumber ?? p.sku,
          title: p.title ?? p.name,
          name: p.name,
        }));

        setProducts(styleOptions);
      } catch (e: any) {
        console.error(e);
        setErr(e?.response?.data?.message || "Failed to load products.");
      }
    })();
  }, []);

  const filteredProducts = useMemo(() => {
    if (!filter.trim()) return products;
    const f = filter.toLowerCase();
    return products.filter(
      (p) =>
        (p.styleNumber || "").toLowerCase().includes(f) ||
        (p.title || "").toLowerCase().includes(f) ||
        (p.name || "").toLowerCase().includes(f)
    );
  }, [products, filter]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { productId: "", sizeId: "", quantity: 1, location: DEFAULT_LOCATION },
    ]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function ensureSizes(productId: string) {
    if (!productId || sizesCache[productId]) return;
    const { data } = await api.get<SiblingsResponse>(`/api/products/${productId}/sizes`);
    const rows = (data?.rows ?? []) as SizeRow[];
    setSizesCache((prev) => ({ ...prev, [productId]: rows }));
  }

  // When product changes, reset size and fetch related sizes
  async function onChangeProduct(i: number, productId: string) {
    updateLine(i, { productId, sizeId: "" });
    if (productId) await ensureSizes(productId);
  }

  // Find the selected size row for a line
  function getSelectedSizeRow(ln: Line): SizeRow | undefined {
    if (!ln.productId || !ln.sizeId) return undefined;
    const rows = sizesCache[ln.productId] || [];
    return rows.find((r) => r._id === ln.sizeId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);

    try {
      if (!customerName.trim() || !customerPhone.trim()) {
        setErr("Customer name and phone are required.");
        setSaving(false);
        return;
      }
      for (const [idx, ln] of lines.entries()) {
        if (!ln.productId || !ln.sizeId) {
          setErr(`Line ${idx + 1}: choose product and size.`);
          setSaving(false);
          return;
        }
        if (ln.quantity < 1) {
          setErr(`Line ${idx + 1}: quantity must be at least 1.`);
          setSaving(false);
          return;
        }
      }

      // Build products[] and total from chosen size rows
      const productsPayload: Array<{ name: string; price: number; quantity: number; product_id: string }> = [];

      for (const ln of lines) {
        let sizeRow = getSelectedSizeRow(ln);

        // Fallback: if cache missed, fetch directly
        if (!sizeRow && ln.sizeId) {
          const { data } = await api.get<SizeRow>(`/api/products/${ln.sizeId}`);
          sizeRow = data;
        }
        if (!sizeRow) throw new Error("Failed to resolve size for one of the lines.");

        const priceGBP = (sizeRow.price || 0) / 100;
        const displayName = `${sizeRow.styleNumber}${sizeRow.title ? ` — ${sizeRow.title}` : ""} — Size ${sizeRow.size}`;

        productsPayload.push({
          name: displayName,
          price: Number(priceGBP.toFixed(2)),
          quantity: ln.quantity,
          product_id: sizeRow._id, // <-- use the exact product-size id
        });
      }

      const totalAmount = Number(
        productsPayload.reduce((sum, p) => sum + p.price * p.quantity, 0).toFixed(2)
      );

      const shippingAddress = [
        shipName || customerName,
        shipPhone || customerPhone,
        shipLine1,
        shipLine2,
        shipCity,
        shipPostcode,
        shipCountry || "GB",
      ]
        .filter(Boolean)
        .join(", ");

      const customer = `${customerName} (${customerPhone})${customerEmail ? ` <${customerEmail}>` : ""}`;

      const payload = {
        customer,
        products: productsPayload,
        totalAmount,
        shippingAddress,
        notes: notes || undefined,
      };

      const { data } = await api.post("/api/orders/create", payload);

      alert("Order created ✅");
      const orderId = data?._id;
      if (orderId) router.replace(`/orders/${orderId}`);
      else router.replace("/orders");
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.errors?.[0]?.msg ||
        "Failed to create order.";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create Order</h1>
        <Link href="/orders" className="underline">
          Back to Orders
        </Link>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        {/* Customer */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 border rounded p-4">
          <div className="md:col-span-3">
            <h2 className="font-medium mb-2">Customer</h2>
          </div>
          <div>
            <Label className="m-2">Name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          </div>
          <div>
            <Label className="m-2">Phone</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
          </div>
          <div>
            <Label className="m-2">Email (optional)</Label>
            <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </div>
        </section>

        {/* Shipping */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 border rounded p-4">
          <div className="md:col-span-3">
            <h2 className="font-medium mb-2">Shipping Address</h2>
          </div>
          <div>
            <Label className="m-2">Name</Label>
            <Input value={shipName} onChange={(e) => setShipName(e.target.value)} />
          </div>
          <div>
            <Label className="m-2">Phone</Label>
            <Input value={shipPhone} onChange={(e) => setShipPhone(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label className="m-2">Address line 1</Label>
            <Input value={shipLine1} onChange={(e) => setShipLine1(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label className="m-2">Address line 2</Label>
            <Input value={shipLine2} onChange={(e) => setShipLine2(e.target.value)} />
          </div>
          <div>
            <Label className="m-2">City</Label>
            <Input value={shipCity} onChange={(e) => setShipCity(e.target.value)} />
          </div>
          <div>
            <Label className="m-2">Postal code</Label>
            <Input value={shipPostcode} onChange={(e) => setShipPostcode(e.target.value)} />
          </div>
          <div>
            <Label className="m-2">Country</Label>
            <Input value={shipCountry} onChange={(e) => setShipCountry(e.target.value)} />
          </div>
        </section>

        {/* Billing (UI only – kept as in your original) */}
        {/* ... unchanged billing section ... */}

        {/* Lines */}
        <section className="space-y-3 border rounded p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Items</h2>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Filter products by style/title…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-72"
              />
              <Button type="button" onClick={addLine}>
                Add line
              </Button>
            </div>
          </div>

          {lines.map((ln, i) => {
            const sizes = ln.productId ? sizesCache[ln.productId] || [] : [];

            return (
              <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 border rounded p-3">
                {/* Product (style) */}
                <div className="md:col-span-3">
                  <Label className="m-2">Product</Label>
                  <select
                    className="w-full h-10 border rounded px-3"
                    value={ln.productId}
                    onChange={(e) => onChangeProduct(i, e.target.value)}
                  >
                    <option value="">— select product —</option>
                    {filteredProducts.map((p) => (
                      <option key={p._id} value={p._id}>
                        {(p.styleNumber || p.title || p.name) + (p.title ? ` — ${p.title}` : "")}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Size (derived from related products of same style) */}
                <div className="md:col-span-2">
                  <Label className="m-2">Size</Label>
                  <select
                    className="w-full h-10 border rounded px-3"
                    value={ln.sizeId}
                    onChange={(e) => updateLine(i, { sizeId: e.target.value })}
                    disabled={!sizes.length}
                  >
                    <option value="">
                      {sizes.length ? "— select size —" : "— select product first —"}
                    </option>
                    {sizes.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.size}
                        {typeof s.quantity === "number" ? ` — stock ${s.quantity}` : ""}
                        {s.attributes?.barcode ? ` — ${s.attributes.barcode}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <Label className="m-2">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={ln.quantity}
                    onChange={(e) =>
                      updateLine(i, { quantity: Math.max(1, Number(e.target.value || 1)) })
                    }
                  />
                </div>

                {/* Location */}
                <div>
                  <Label className="m-2">Location</Label>
                  <Input
                    value={ln.location}
                    onChange={(e) => updateLine(i, { location: e.target.value })}
                    placeholder={DEFAULT_LOCATION}
                  />
                </div>

                <div className="flex items-end justify-end md:col-span-6">
                  <Button type="button" variant="secondary" onClick={() => removeLine(i)}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </section>

        {/* Notes */}
        <section className="border rounded p-4">
          <Label className="m-2">Notes</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>

        {err && <p className="text-red-600">{err}</p>}

        <div className="flex gap-2">
          <Button type="submit" className="bg-green-600" disabled={saving}>
            {saving ? "Creating…" : "Create order"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/orders")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
