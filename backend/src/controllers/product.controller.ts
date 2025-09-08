import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Product from "../models/product.model";

type ProductStatus = "active" | "inactive" | "draft" | "archived";

const norm = (v: any) => String(v ?? "").trim().toUpperCase();
const toInt = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def;
};

// fields allowed in PATCH
const pickUpdatable = (src: any) => {
  const out: any = {};
  if (src.styleNumber != null) out.styleNumber = String(src.styleNumber);
  if (src.title != null) out.title = String(src.title);
  if (src.description != null) out.description = String(src.description);
  if (src.price != null) out.price = Number(src.price);
  if (src.color != null) out.color = String(src.color);     // 👈 allow color update
  if (src.size != null) out.size = String(src.size);
  if (src.quantity != null) out.quantity = Number(src.quantity);
  if (src.attributes != null) out.attributes = src.attributes;
  if (src.status != null) out.status = src.status as ProductStatus;
  return out;
};

/**
 * Parse color+size+quantity rows.
 * Accepts any of:
 *  - { items: [{ color, size, quantity }] }
 *  - { items: [{ size, quantity }], color: "BLACK" }       // fallback color
 *  - { sizes: ["S","M"], color: "BLACK" }                  // quantity→0
 *  - { size: "M", quantity: 3, color: "BLACK" }
 */
function parseColorSizeRows(body: any): Array<{ color: string; size: string; quantity: number }> {
  if (Array.isArray(body.items) && body.items.length) {
    const rows = body.items
      .map((it: any) => ({
        color: norm(it?.color ?? body.color ?? "UNSPECIFIED"),
        size: norm(it?.size),
        quantity: toInt(it?.quantity ?? it?.qty ?? 0),
      }))
      .filter((r) => !!r.size && !!r.color);

    // de-dupe by (color,size) while summing quantities
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.color}__${r.size}`;
      map.set(k, (map.get(k) ?? 0) + r.quantity);
    }
    return Array.from(map, ([k, quantity]) => {
      const [color, size] = k.split("__");
      return { color, size, quantity };
    });
  }

  if (Array.isArray(body.sizes) && body.sizes.length) {
    const color = norm(body.color ?? "UNSPECIFIED");
    return [...new Set(body.sizes.map((s: any) => norm(s)).filter(Boolean))].map((size) => ({
      color,
      size,
      quantity: 0,
    }));
  }

  if (body.size) {
    return [
      {
        color: norm(body.color ?? "UNSPECIFIED"),
        size: norm(body.size),
        quantity: toInt(body.quantity ?? body.qty ?? 0),
      },
    ];
  }

  return [];
}

// POST /api/products
export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.body?.product ?? req.body) || {};
    const { styleNumber, title, description, price, attributes, status } = body;

    if (!styleNumber || !title) {
      return res.status(400).json({ message: "styleNumber and title are required." });
    }
    if (price == null || !Number.isFinite(Number(price))) {
      return res.status(400).json({ message: "price is required and must be a number." });
    }

    const rows = parseColorSizeRows(body);
    if (!rows.length) {
      return res.status(400).json({
        message:
          "At least one item is required. Provide items[{color,size,quantity}] or color + sizes[].",
      });
    }

    const sNum = norm(styleNumber);
    const base = {
      styleNumber: sNum,
      title: String(title).trim(),
      description: description ? String(description) : undefined,
      price: Number(price),
      attributes: attributes ?? undefined,
      status: (status as ProductStatus) ?? "active",
      createdBy: (req as any).user?._id,
    };

    const docs = rows.map(({ color, size, quantity }) => ({
      ...base,
      color,
      size,
      quantity,
    }));

    const created = await Product.insertMany(docs, { ordered: false });
    return res.status(201).json({ count: created.length, created });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Some color/size rows already exist for this styleNumber.",
        code: "DUPLICATE_KEY",
        keyValue: err.keyValue,
      });
    }
    next(err);
  }
}

// GET /api/products
export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(parseInt(String(req.query.page || 1), 10), 1);
    const limit = Math.max(parseInt(String(req.query.limit || 20), 10), 1);
    const q = req.query.q ? String(req.query.q) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const styleFilter = req.query.styleNumber ? norm(req.query.styleNumber) : undefined;

    const match: any = { isDeleted: false };
    if (status) match.status = status;
    if (q) match.$text = { $search: q };
    if (styleFilter) match.styleNumber = styleFilter;

    const [rows, total] = await Promise.all([
      Product.find(match, { __v: 0 })
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(match),
    ]);

    return res.json({ page, limit, total, rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/products/:id
export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }
    const doc = await Product.findOne({ _id: id, isDeleted: false }).lean();
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json(doc);
  } catch (err) {
    next(err);
  }
}

// GET /api/products/:id/sizes  -> all rows with the same styleNumber (all colors+sizes)
export async function listSizesForProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }
    const base = await Product.findOne({ _id: id, isDeleted: false }, { styleNumber: 1 }).lean();
    if (!base) return res.status(404).json({ message: "Not found" });

    const rows = await Product.find(
      { styleNumber: base.styleNumber, isDeleted: false },
      { __v: 0 }
    )
      .sort({ color: 1, size: 1, updatedAt: -1 })
      .lean();

    return res.json({ styleNumber: base.styleNumber, count: rows.length, rows });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/products/:id
export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const patch = pickUpdatable(req.body?.product ?? req.body);

    if (patch.price != null && !Number.isFinite(Number(patch.price))) {
      return res.status(400).json({ message: "price must be a number." });
    }
    if (patch.size != null && String(patch.size).trim() === "") {
      return res.status(400).json({ message: "size cannot be empty." });
    }
    if (patch.color != null && String(patch.color).trim() === "") {
      return res.status(400).json({ message: "color cannot be empty." });
    }
    if (patch.quantity != null) {
      const n = Number(patch.quantity);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        return res.status(400).json({ message: "quantity must be a non-negative integer." });
      }
      patch.quantity = n;
    }

    const updated = await Product.findByIdAndUpdate(
      id,
      {
        $set: {
          ...patch,
          ...(patch.styleNumber != null ? { styleNumber: norm(patch.styleNumber) } : {}),
          ...(patch.color != null ? { color: norm(patch.color) } : {}),
          ...(patch.size != null ? { size: norm(patch.size) } : {}),
          updatedBy: (req as any).user?._id,
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.json(updated);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "A row with this styleNumber + color + size already exists.",
        code: "DUPLICATE_KEY",
        keyValue: err.keyValue,
      });
    }
    next(err);
  }
}

// POST /api/products/:id/status
export async function setProductStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};
    const allowed: ProductStatus[] = ["active", "inactive", "draft", "archived"];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const updated = await Product.findByIdAndUpdate(
      id,
      { $set: { status, updatedBy: (req as any).user?._id } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.json(updated);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/products/:id (soft delete)
export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }
    const updated = await Product.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, status: "archived", updatedBy: (req as any).user?._id } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}
