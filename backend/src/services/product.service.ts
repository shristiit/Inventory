// src/services/product.service.ts
import mongoose, { Types } from 'mongoose';
import Product from '../models/product.model';
import Variant from '../models/variant.model';
import Size from '../models/size.model';
import Archive from '../models/archive.model';

type DeepCreateInput = {
  product: {
    styleNumber: string;
    title: string;
    description?: string;
    price: number;
    attributes?: any;
    status?: 'active' | 'inactive' | 'draft' | 'archived';
  };
  variants: Array<{
    sku: string;
    color: { name: string; code?: string };
    media?: Array<{
      url: string;
      type: 'image' | 'video';
      alt?: string;
      isPrimary?: boolean;
    }>;
    sizes: Array<{
      label: string;
      barcode: string;
      inventory: Array<{
        location: string;
        onHand: number;
        onOrder?: number;
        reserved?: number;
      }>;
    }>;
  }>;
};

export async function createDeep(input: DeepCreateInput, adminId: any) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1) product
    const [product] = await Product.create(
      [
        {
          ...input.product,
          status: input.product.status ?? 'active',
          createdBy: adminId,
        },
      ],
      { session }
    );

    // 2) variants + sizes
    for (const v of input.variants) {
      const [variant] = await Variant.create(
        [
          {
            productId: product._id,
            sku: v.sku,
            color: v.color,
            media: v.media ?? [],
            createdBy: adminId,
          },
        ],
        { session }
      );

      if (v.sizes?.length) {
        const sizeDocs = v.sizes.map((s) => ({
          variantId: variant._id,
          label: s.label,
          barcode: s.barcode,
          inventory:
            s.inventory?.map((i) => ({
              location: i.location,
              onHand: i.onHand,
              onOrder: i.onOrder ?? 0,
              reserved: i.reserved ?? 0,
            })) ?? [],
          createdBy: adminId,
        }));
        await Size.insertMany(sizeDocs, { session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    // return product with variants+sizes (filtered)
    return getDeep(product._id.toString());
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    throw e;
  }
}

/**
 * Single source of truth for reading a product "deep":
 * - Excludes soft-deleted docs (isDeleted: false)
 * - Can also exclude archived variants via status if you use that
 * - Computes per-size totals (total, reserved, sellable)
 */
export async function getDeep(productId: string) {
  if (!Types.ObjectId.isValid(productId)) return null;

  const [doc] = await Product.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(productId), isDeleted: false } },

    {
      $lookup: {
        from: 'variants',
        localField: '_id',
        foreignField: 'productId',
        as: 'variants',
        pipeline: [
          // exclude soft-deleted and optionally archived variants
          { $match: { isDeleted: false /* , status: { $ne: 'archived' } */ } },
          {
            $lookup: {
              from: 'sizes',
              localField: '_id',
              foreignField: 'variantId',
              as: 'sizes',
              pipeline: [
                { $match: { isDeleted: false } },
                {
                  $addFields: {
                    totalQuantity: { $sum: '$inventory.onHand' },
                    reservedTotal: { $sum: '$inventory.reserved' },
                    onOrderTotal: { $sum: '$inventory.onOrder' },
                  },
                },
                {
                  $addFields: {
                    sellableQuantity: {
                      $max: [{ $subtract: ['$totalQuantity', '$reservedTotal'] }, 0],
                    },
                  },
                },
                // (optional) order sizes by label
                { $sort: { label: 1 } },
              ],
            },
          },
          // (optional) order variants by SKU
          { $sort: { sku: 1 } },
        ],
      },
    },
  ]).exec();

  return doc || null;
}

export async function list({
  page,
  limit,
  q,
  status,
}: {
  page: number;
  limit: number;
  q?: string;
  status?: string;
}) {
  const match: any = { isDeleted: false };
  if (status) match.status = status;
  if (q) match.$text = { $search: q };

  const cursor = Product.aggregate([
    { $match: match },
    { $sort: { updatedAt: -1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              styleNumber: 1,
              title: 1,
              status: 1,
              price: 1,
              updatedAt: 1,
            },
          },
          {
            $lookup: {
              from: 'variants',
              localField: '_id',
              foreignField: 'productId',
              as: 'variants',
              pipeline: [{ $match: { isDeleted: false } }, { $project: { _id: 1 } }],
            },
          },
          { $addFields: { variantCount: { $size: '$variants' } } },
          { $project: { variants: 0 } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const [result] = await cursor.exec();
  const total = result?.total?.[0]?.count ?? 0;
  return { page, limit, total, rows: result?.rows ?? [] };
}

export async function updatePartial(productId: string, patch: any, adminId: any) {
  return Product.findByIdAndUpdate(
    productId,
    { $set: { ...patch, updatedBy: adminId } },
    { new: true }
  ).lean();
}

export async function setStatus(
  productId: string,
  status: 'active' | 'inactive' | 'draft' | 'archived',
  adminId: any
) {
  return Product.findByIdAndUpdate(
    productId,
    { $set: { status, updatedBy: adminId } },
    { new: true }
  ).lean();
}

export async function removeCascadeArchive(productId: string, adminId: any) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const product = await Product.findById(productId).session(session);
    if (!product) throw new Error('Not found');

    const variants = await Variant.find({ productId: product._id }).session(session);
    const variantIds = variants.map((v) => v._id);
    const sizes = await Size.find({ variantId: { $in: variantIds } }).session(session);

    // snapshot to Archive
    await Archive.insertMany(
      [
        {
          kind: 'product',
          originalId: product._id,
          snapshot: product.toObject(),
          deletedBy: adminId,
        },
        ...variants.map((v) => ({
          kind: 'variant',
          originalId: v._id,
          snapshot: v.toObject(),
          deletedBy: adminId,
        })),
        ...sizes.map((s) => ({
          kind: 'size',
          originalId: s._id,
          snapshot: s.toObject(),
          deletedBy: adminId,
        })),
      ],
      { session }
    );

    // soft delete
    await Size.updateMany({ _id: { $in: sizes.map((s) => s._id) } }, { $set: { isDeleted: true } }, { session });
    await Variant.updateMany({ _id: { $in: variantIds } }, { $set: { isDeleted: true } }, { session });
    await Product.updateOne(
      { _id: product._id },
      { $set: { isDeleted: true, status: 'archived' } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    throw e;
  }
}
