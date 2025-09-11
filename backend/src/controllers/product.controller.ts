import { Request, Response } from 'express';
import type { RequestHandler } from 'express';
import * as productSvc from '../services/product.service';
import * as variantSvc from '../services/variant.service';
import Product from '../models/product.model';
import Variant from '../models/variant.model';
import * as sizeSvc from '../services/size.service';
import asyncHandler from '../utils/asyncHandler';

// Products
export const createProductDeep = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user?._id ?? null;
  try {
    const created = await productSvc.createDeep(req.body, adminId);
    return res.status(201).json(created);
  } catch (e: any) {
    if (e?.code === 11000) {
      // Duplicate key (likely variant SKU unique index)
      const key = e?.keyValue ? JSON.stringify(e.keyValue) : 'duplicate key';
      return res.status(409).json({
        message: 'Duplicate key',
        detail: `A unique key already exists: ${key}. Ensure each variant SKU is unique.`,
      });
    }
    throw e;
  }
});

// Read-only media endpoints
export const getProductMedia: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const doc = await Product.findById(id).select('media').lean();
  if (!doc) return res.status(404).json({ message: 'Not found' });
  return res.json(doc.media ?? []);
});

export const getVariantMedia: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const { variantId } = req.params as { variantId: string };
  const doc = await Variant.findById(variantId).select('media').lean();
  if (!doc) return res.status(404).json({ message: 'Variant not found' });
  return res.json(doc.media ?? []);
});

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', q, status } = req.query as any;
  const result = await productSvc.list({
    page: parseInt(String(page), 10),
    limit: parseInt(String(limit), 10),
    q: q || '',
    status,
  });
  res.json(result);
});

export const getProductDeep = asyncHandler(async (req: Request, res: Response) => {
  const product = await productSvc.getDeep(req.params.id);
  if (!product) return res.status(404).json({ message: 'Not found' });
  res.json(product);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  res.json(await productSvc.updatePartial(req.params.id, req.body, actorId));
});

export const setProductStatus = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  const { status } = req.body;
  res.json(await productSvc.setStatus(req.params.id, status, actorId));
});

// Variants
export const addVariant = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  const variant = await variantSvc.add(req.params.id, req.body, actorId);
  res.status(201).json(variant);
});

export const updateVariant = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  res.json(await variantSvc.update(req.params.variantId, req.body, actorId));
});

export const deleteVariantCascadeArchive = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  await variantSvc.removeCascadeArchive(req.params.variantId, actorId);
  res.status(204).send();
});

// ✅ Added deep reads
export const getVariantDeep = asyncHandler(async (req: Request, res: Response) => {
  const { variantId } = req.params;
  const doc = await variantSvc.findDeepById(variantId);
  if (!doc) return res.status(404).json({ message: 'Variant not found' });
  res.json(doc);
});

export const getVariantBySku = asyncHandler(async (req: Request, res: Response) => {
  const { sku } = req.params;
  if (!sku) return res.status(400).json({ message: 'Missing sku' });
  const doc = await variantSvc.findDeepBySku(sku);
  if (!doc) return res.status(404).json({ message: 'Variant not found' });
  res.json(doc);
});

// Sizes
export const addSize = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  res.status(201).json(await sizeSvc.add(req.params.variantId, req.body, actorId));
});

export const updateSize = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  res.json(await sizeSvc.update(req.params.sizeId, req.body, actorId));
});

export const deleteSizeArchive = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  await sizeSvc.removeArchive(req.params.sizeId, actorId);
  res.status(204).send();
});

// Product delete
export const deleteProductCascadeArchive = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  await productSvc.removeCascadeArchive(req.params.id, actorId);
  res.status(204).send();
});

// Media upload for variant
export const addVariantMedia: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  const { variantId } = req.params as { variantId: string };
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) {
    return res.status(400).json({ message: 'No files uploaded' });
  }

  const items = files.map((f) => ({
    url: `/static/uploads/${f.filename}`,
    type: f.mimetype?.startsWith('video/') ? 'video' as const : 'image' as const,
  }));

  const updated = await variantSvc.addMedia(variantId, items, actorId);
  return res.status(201).json({ media: items, variant: updated });
});

// Product-level media upload
export const addProductMedia: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null;
  const { id } = req.params as { id: string };
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) {
    return res.status(400).json({ message: 'No files uploaded' });
  }
  const items = files.map((f) => ({
    url: `/static/uploads/${f.filename}`,
    type: f.mimetype?.startsWith('video/') ? 'video' as const : 'image' as const,
  }));
  const updated = await productSvc.addProductMedia(id, items, actorId);
  return res.status(201).json({ media: items, product: updated });
});
