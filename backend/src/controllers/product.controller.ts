import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Product from "../models/product.model";

type ProductStatus = "active" | "inactive" | "draft" | "archived";

const norm = (v: any) => String(v ?? "").trim().toUpperCase();
const toInt = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def;
};

const pickUpdatable = (src: any) => {
  const out: any = {};
  if (src.styleNumber != null) out.styleNumber = String(src.styleNumber);
  if (src.title != null) out.title = String(src.title);
  if (src.description != null) out.description = String(src.description);
  if (src.price != null) out.price = Number(src.price);
  if (src.size != null) out.size = String(src.size);
  if (src.quantity != null) out.quantity = Number(src.quantity); // allow updating quantity
  if (src.attributes != null) out.attributes = src.attributes;
  if (src.status != null) out.status = src.status as ProductStatus;
  return out;
};

// ---- helpers to parse sizes with quantities ----
type SizeLike =
  | string
  | { size?: string; quantity?: number | string; qty?: number | string };

function parseSizes(body: any): Array<{ size: string; quantity: number }> {
  let sizes: SizeLike[] = [];

  if (Array.isArray(body.items) && body.items.length) {
    sizes = body.items;
  } else if (Array.isArray(body.sizes) && body.sizes.length) {
    sizes = body.sizes;
  } else if (body.size) {
    sizes = [{ size: body.size, quantity: body.quantity ?? body.qty }];
  }

  // normalize and validate
  const entries = sizes
    .map((s) =>
      typeof s === "string"
        ? { size: norm(s), quantity: 0 }
        : { size: norm(s.size), quantity: toInt(s.quantity ?? s.qty ?? 0) }
    )
    .filter((x) => !!x.size);

  if (!entries.length) return [];

  // dedupe by size, summing quantities if repeated
  const map = new Map<string, number>();
  for (const { size, quantity } of entries) {
    map.set(size, (map.get(size) ?? 0) + toInt(quantity, 0));
  }
  return Array.from(map, ([size, quantity]) => ({ size, quantity }));
}

// POST /api/products
// Accepts:
//   { size: "M", quantity: 5 }
//   { sizes: ["S","M","L"] }            // quantities default to 0
//   { items: [{ size:"S", quantity:3 }, { size:"M", quantity:7 }] }
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

    // collect sizes with quantities
    const sizeRows = parseSizes(body);
    if (!sizeRows.length) {
      return res
        .status(400)
        .json({ message: "At least one size is required (use size, sizes[], or items[])." });
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

    const docs = sizeRows.map(({ size, quantity }) => ({
      ...base,
      size,
      quantity, // quantity per size row
    }));

    const created = await Product.insertMany(docs, { ordered: false });

    return res.status(201).json({ count: created.length, created });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Some sizes already exist for this styleNumber.",
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

// NEW: GET /api/products/:id/sizes  -> all rows with the same styleNumber
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
      .sort({ size: 1, updatedAt: -1 })
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
    if (patch.quantity != null) {
      const n = Number(patch.quantity);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        return res.status(400).json({ message: "quantity must be a non-negative integer." });
      }
      patch.quantity = n;
    }

    const updated = await Product.findByIdAndUpdate(
      id,
      { $set: { ...patch, updatedBy: (req as any).user?._id } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.json(updated);
  } catch (err) {
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
