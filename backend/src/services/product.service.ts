// src/services/product.service.ts
import mongoose, { Types } from 'mongoose';
import Product from '../models/product.model';
import Variant from '../models/variant.model';
import Size from '../models/size.model';
import Archive from '../models/archive.model';
import * as master from './master.service';

type DeepCreateInput = {
  product: {
    styleNumber: string;
    title: string;
    description?: string;
    price: number;
    vatprice: number;
    status?: 'active' | 'inactive' | 'draft' | 'archived';
    category?: string;
    subcategory?: string;
    dressType?: string;
    dresstype?: string;
    supplier?: string;
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
    // Omit unsupported fields like `attributes` from create payload
    const { attributes: _omitAttributes, category, subcategory, dressType, dresstype, supplier, ...productInput } = (input.product as any) || {};

    // Use provided styleNumber as-is (manual, can include letters and numbers)

    // Upsert category/subcategory
    let categoryId: any = null;
    let subcategoryId: any = null;
    let supplierId: any = null;
    if (category) {
      try {
        const cat = await master.upsertCategory(category);
        categoryId = cat?._id ?? null;
        if (subcategory) {
          const sub = await master.upsertCategory(subcategory, categoryId);
          subcategoryId = sub?._id ?? null;
        }
      } catch {}
    }
    if (supplier) {
      try {
        const sup = await master.upsertSupplier(supplier);
        supplierId = sup?._id ?? null;
      } catch {}
    }
    const [product] = await Product.create(
      [
        {
          ...productInput,
          status: productInput.status ?? 'active',
          createdBy: adminId,
          categoryId,
          subcategoryId,
          supplierId,
          dressType: dressType ?? dresstype ?? undefined,
        },
      ],
      { session }
    );

    // 2) variants + sizes
    for (const v of input.variants) {
      // upsert color master from provided color
      let colorMasterId: any = (v as any).colorMasterId;
      let color = v.color;
      if (!colorMasterId && color?.name) {
        try {
          const cm = await master.upsertColor(color.name, color.code);
          colorMasterId = cm?._id;
          color = { name: cm?.name || color.name, code: cm?.code || color.code };
        } catch {}
      }
      const [variant] = await Variant.create(
        [
          {
            productId: product._id,
            sku: v.sku,
            colorMasterId,
            color,
            media: v.media ?? [],
            createdBy: adminId,
          },
        ],
        { session }
      );

      if (v.sizes?.length) {
        const sizeDocs = [] as any[];
        for (const s of v.sizes) {
          let sizeMasterId: any = (s as any).sizeMasterId;
          if (!sizeMasterId && s?.label) {
            try {
              const sm = await master.upsertSize(s.label);
              sizeMasterId = sm?._id;
            } catch {}
          }
          sizeDocs.push({
            variantId: variant._id,
            sizeMasterId,
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
          });
        }
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

export async function addProductMedia(
  productId: string,
  items: Array<{ url: string; type: 'image' | 'video'; alt?: string; isPrimary?: boolean }>,
  adminId: any
) {
  return Product.findByIdAndUpdate(
    productId,
    { $push: { media: { $each: items } }, $set: { updatedBy: adminId } },
    { new: true }
  ).lean();
}
