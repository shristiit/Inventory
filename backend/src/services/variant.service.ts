import mongoose, { Types } from 'mongoose';
import Variant from '../models/variant.model';
import Size from '../models/size.model';
import Product from '../models/product.model';
import Archive from '../models/archive.model';

/* ---------- Basic CRUD ---------- */
export async function add(productId: string, dto: any, adminId: any) {
  return Variant.create({
    productId,
    sku: dto.sku,
    color: dto.color,
    media: dto.media ?? [],
    createdBy: adminId,
  });
}

export async function update(variantId: string, patch: any, adminId: any) {
  return Variant.findByIdAndUpdate(
    variantId,
    { $set: { ...patch, updatedBy: adminId } },
    { new: true }
  ).lean();
}

export async function removeCascadeArchive(variantId: string, adminId: any) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const variant = await Variant.findById(variantId).session(session);
    if (!variant) throw new Error('Variant not found');

    const sizes = await Size.find({ variantId: variant._id }).session(session);

    await Archive.insertMany(
      [
        { kind: 'variant', originalId: variant._id, snapshot: variant.toObject(), deletedBy: adminId },
        ...sizes.map((s) => ({ kind: 'size', originalId: s._id, snapshot: s.toObject(), deletedBy: adminId })),
      ],
      { session }
    );

    await Size.updateMany({ variantId: variant._id }, { $set: { isDeleted: true, updatedBy: adminId } }, { session });
    await Variant.updateOne({ _id: variant._id }, { $set: { isDeleted: true, updatedBy: adminId } }, { session });

    await session.commitTransaction();
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

/* ---------- Deep reads ---------- */
export type VariantDeepDTO = {
  _id: string;
  sku: string;
  status?: 'active' | 'inactive' | 'draft' | 'archived';
  color?: { name?: string; code?: string };
  priceMinor?: number;
  media?: string[];
  images?: string[];
  updatedAt?: string;
  product?: { _id: string; title?: string; styleNumber?: string };
  sizes: Array<{
    _id: string;
    label: string;
    barcode: string;
    totalQuantity?: number;
    reservedTotal?: number;
    sellableQuantity?: number;
    onOrder?: number;
  }>;
};

const sizesLookupStage = {
  $lookup: {
    from: Size.collection.name,
    let: { vid: '$_id' },
    pipeline: [
      {
        $match: {
          $expr: { $and: [{ $eq: ['$variantId', '$$vid'] }, { $ne: ['$isDeleted', true] }] },
        },
      },
      // compute totals from inventory[]
      {
        $addFields: {
          totalQuantity: { $sum: '$inventory.onHand' },
          reservedTotal: { $sum: '$inventory.reserved' },
          onOrder: { $sum: '$inventory.onOrder' },
        },
      },
      {
        $addFields: {
          sellableQuantity: {
            $max: [
              { $subtract: [{ $ifNull: ['$totalQuantity', 0] }, { $ifNull: ['$reservedTotal', 0] }] },
              0,
            ],
          },
        },
      },
      { $project: { _id: 1, label: 1, barcode: 1, totalQuantity: 1, reservedTotal: 1, onOrder: 1, sellableQuantity: 1 } },
      { $sort: { label: 1 } },
    ],
    as: 'sizes',
  },
};

const productLookupStage = {
  $lookup: {
    from: Product.collection.name,
    localField: 'productId',
    foreignField: '_id',
    pipeline: [{ $project: { _id: 1, title: 1, styleNumber: 1 } }],
    as: 'product',
  },
};

const finalProjectStage = {
  $project: {
    _id: { $toString: '$_id' },
    sku: 1,
    status: 1,
    color: 1,
    priceMinor: 1,
    media: 1,
    images: '$media',
    updatedAt: 1,
    product: { $first: '$product' },
    sizes: 1,
  },
};

export async function findDeepById(variantId: string): Promise<VariantDeepDTO | null> {
  if (!Types.ObjectId.isValid(variantId)) return null;
  const _id = new Types.ObjectId(variantId);

  const [doc] = await Variant.aggregate<VariantDeepDTO>([
    { $match: { _id, isDeleted: { $ne: true } } },
    sizesLookupStage,
    productLookupStage,
    finalProjectStage,
    { $limit: 1 },
  ]);

  return doc || null;
}

export async function findDeepBySku(sku: string): Promise<VariantDeepDTO | null> {
  const [doc] = await Variant.aggregate<VariantDeepDTO>([
    { $match: { sku, isDeleted: { $ne: true } } },
    sizesLookupStage,
    productLookupStage,
    finalProjectStage,
    { $limit: 1 },
  ]);

  return doc || null;
}
