import ColorMaster from '../models/colorMaster.model';
import SizeMaster from '../models/sizeMaster.model';
import Master from '../models/master.model';

function slugify(s: string) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
}

export async function upsertColor(name: string, code?: string) {
  const slug = slugify(name);
  if (!slug) throw new Error('Color name required');
  // Do not set `name` in $set when also using $setOnInsert(name) —
  // MongoDB disallows updating the same path in both operators during upsert.
  const update: any = { isActive: true };
  if (code) update.code = code;
  if (slug) update.slug = slug;
  const doc = await ColorMaster.findOneAndUpdate(
    { $or: [{ slug }, { name }] },
    { $setOnInsert: { name }, $set: update },
    { new: true, upsert: true }
  ).lean();
  return doc;
}

export async function upsertSize(label: string) {
  const slug = slugify(label);
  if (!slug) throw new Error('Size label required');
  // Avoid updating the same path in both $set and $setOnInsert
  const update: any = { isActive: true, slug };
  const doc = await SizeMaster.findOneAndUpdate(
    { $or: [{ slug }, { label }] },
    { $setOnInsert: { label }, $set: update },
    { new: true, upsert: true }
  ).lean();
  return doc;
}

export async function searchColors(q: string, limit = 10) {
  const query: any = {};
  if (q && q.trim().length) {
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { code: { $regex: q, $options: 'i' } },
      { slug: { $regex: q.replace(/\s+/g, '-'), $options: 'i' } },
    ];
  }
  return ColorMaster.find(query).sort({ name: 1 }).limit(limit).lean();
}

export async function searchSizes(q: string, limit = 10) {
  const query: any = {};
  if (q && q.trim().length) {
    query.$or = [
      { label: { $regex: q, $options: 'i' } },
      { slug: { $regex: q.replace(/\s+/g, '-'), $options: 'i' } },
    ];
  }
  return SizeMaster.find(query).sort({ sortOrder: 1, label: 1 }).limit(limit).lean();
}

export async function upsertCategory(name: string, parentId?: any) {
  const slug = slugify(name);
  const filter: any = { kind: 'category', parentId: parentId || null, name };
  const update: any = { kind: 'category', name, slug, isActive: true };
  const doc = await Master.findOneAndUpdate(
    filter,
    { $setOnInsert: { kind: 'category', name }, $set: update },
    { new: true, upsert: true }
  ).lean();
  return doc;
}

export async function searchCategories(q: string, parentId?: any, limit = 10) {
  const query: any = { kind: 'category' };
  if (typeof parentId !== 'undefined') {
    query.parentId = parentId || null;
  }
  if (q && q.trim().length) {
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { slug: { $regex: q.replace(/\s+/g, '-'), $options: 'i' } },
    ];
  }
  return Master.find(query).sort({ sortOrder: 1, name: 1 }).limit(limit).lean();
}

export async function upsertSupplier(name: string) {
  const slug = slugify(name);
  const filter: any = { kind: 'supplier', parentId: null, name };
  const update: any = { kind: 'supplier', name, slug, isActive: true };
  const doc = await Master.findOneAndUpdate(
    filter,
    { $setOnInsert: { kind: 'supplier', name }, $set: update },
    { new: true, upsert: true }
  ).lean();
  return doc;
}

export async function searchSuppliers(q: string, limit = 10) {
  const query: any = { kind: 'supplier' };
  if (q && q.trim().length) {
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { slug: { $regex: q.replace(/\s+/g, '-'), $options: 'i' } },
    ];
  }
  return Master.find(query).sort({ sortOrder: 1, name: 1 }).limit(limit).lean();
}
