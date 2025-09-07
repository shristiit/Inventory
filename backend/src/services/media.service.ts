// src/services/media.service.ts
import { Types } from 'mongoose';
import Media from '../models/media.model';

export async function addFromUpload(params: {
  variantId: string;
  file: Express.Multer.File;
  altText?: string;
  order?: number;
}) {
  if (!Types.ObjectId.isValid(params.variantId)) throw new Error('Invalid variantId');

  const url  = `/static/uploads/${params.file.filename}`;
  const type = params.file.mimetype.startsWith('image/') ? 'image' : 'video';

  return Media.create({
    variantId: new Types.ObjectId(params.variantId),
    url,
    type,
    altText: params.altText,
    order: params.order ?? 0,
  });
}

export function listByVariant(variantId: string) {
  return Media.find({ variantId, /* could also filter: isDeleted:false */ })
              .sort({ order: 1, createdAt: 1 })
              .lean();
}

export async function remove(mediaId: string) {
  return Media.findByIdAndDelete(mediaId);
}
