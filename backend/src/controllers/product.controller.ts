import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Product from "../models/product.model";

type ProductStatus = "active" | "inactive" | "draft" | "archived";

const pickUpdatable = (src: any) => {
  // only allow these fields via PATCH
  const out: any = {};
  if (src.styleNumber != null) out.styleNumber = String(src.styleNumber);
  if (src.title != null) out.title = String(src.title);
  if (src.description != null) out.description = String(src.description);
  if (src.price != null) out.price = Number(src.price);
  if (src.attributes != null) out.attributes = src.attributes;
  if (src.status != null) out.status = src.status as ProductStatus;
  return out;
};

// POST /api/products
export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.body?.product ?? req.body) || {};
    const { styleNumber, title, description, price, attributes, status } = body;

    if (!styleNumber || !title) {
      return res.status(400).json({ message: "styleNumber and title are required." });
    }
    if (price === undefined || price === null || !Number.isFinite(Number(price))) {
      return res.status(400).json({ message: "price is required and must be a number." });
    }

    const created = await Product.create({
      styleNumber: String(styleNumber).trim(),
      title: String(title).trim(),
      description: description ? String(description) : undefined,
      price: Number(price), // minor units (e.g., 12345)
      attributes: attributes ?? undefined,
      status: (status as ProductStatus) ?? "active",
      createdBy: (req as any).user?._id,
    });

    return res.status(201).json(created);
  } catch (err) {
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

    const match: any = { isDeleted: false };
    if (status) match.status = status;
    if (q) match.$text = { $search: q };

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

// POST /api/products/:id/status  { status: 'active' | ... }
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

// DELETE /api/products/:id  (soft delete)
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
