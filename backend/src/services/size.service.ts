import Size from '../models/size.model';
import * as master from './master.service';

export async function add(variantId: string, dto: any, adminId: any) {
  let sizeMasterId = dto.sizeMasterId;
  if (!sizeMasterId && dto?.label) {
    try {
      const sm = await master.upsertSize(dto.label);
      sizeMasterId = sm?._id;
    } catch {}
  }

  return Size.create({
    variantId,
    sizeMasterId,
    label: dto.label,
    barcode: dto.barcode,
    inventory: dto.inventory ?? [],
    createdBy: adminId,
  });
}

export async function update(sizeId: string, patch: any, adminId: any) {
  return Size.findByIdAndUpdate(sizeId, { $set: { ...patch, updatedBy: adminId } }, { new: true }).lean();
}

export async function removeArchive(sizeId: string, adminId: any) {
  const size = await Size.findById(sizeId);
  if (!size) return;
  const Archive = (await import('../models/archive.model')).default;
  await Archive.create({ kind: 'size', originalId: size._id, snapshot: size.toObject(), deletedBy: adminId });
  await Size.updateOne({ _id: size._id }, { $set: { isDeleted: true } });
}
