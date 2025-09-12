import { Router } from 'express';
import { query } from 'express-validator';
import * as master from '../services/master.service';
import { authGuard } from '../middlewares/authGaurd';
import { roleAnyGuard } from '../middlewares/roleGaurd';

const r = Router();

r.get('/categories', async (req, res) => {
  const { q = '', limit = '10', parent } = req.query as any;
  const rows = await master.searchCategories(String(q), parent ?? undefined, parseInt(String(limit), 10));
  res.json(rows);
});

// Create or update a category (optionally under a parent as subcategory)
r.post('/categories', authGuard, roleAnyGuard('admin', 'staff'), async (req, res) => {
  try {
    const { name, parentId, sortOrder } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }
    const doc = await master.upsertCategory(String(name).trim(), parentId || undefined);
    // Optionally set display order
    if (typeof sortOrder === 'number') {
      const Master = (await import('../models/master.model')).default;
      await Master.updateOne({ _id: (doc as any)?._id }, { $set: { sortOrder } });
      const updated = await Master.findById((doc as any)?._id).lean();
      return res.status(201).json(updated);
    }
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to save category' });
  }
});

r.get('/suppliers', async (req, res) => {
  const { q = '', limit = '10' } = req.query as any;
  const rows = await master.searchSuppliers(String(q), parseInt(String(limit), 10));
  res.json(rows);
});

// Create or update a supplier in Master
r.post('/suppliers', authGuard, roleAnyGuard('admin', 'staff'), async (req, res) => {
  try {
    const { name, sortOrder } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }
    const doc = await master.upsertSupplier(String(name).trim());
    if (typeof sortOrder === 'number') {
      const Master = (await import('../models/master.model')).default;
      await Master.updateOne({ _id: (doc as any)?._id }, { $set: { sortOrder } });
      const updated = await Master.findById((doc as any)?._id).lean();
      return res.status(201).json(updated);
    }
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to save supplier' });
  }
});

r.get('/colors', async (req, res) => {
  const { q = '', limit = '10' } = req.query as any;
  const rows = await master.searchColors(String(q), parseInt(String(limit), 10));
  res.json(rows);
});

// Create or update a color in ColorMaster
r.post('/colors', authGuard, roleAnyGuard('admin', 'staff'), async (req, res) => {
  try {
    const { name, code } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Color name is required' });
    }
    const doc = await master.upsertColor(String(name).trim(), code ? String(code).trim() : undefined);
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to save color' });
  }
});

r.get('/sizes', async (req, res) => {
  const { q = '', limit = '10', order = 'asc' } = req.query as any;
  const ord = String(order).toLowerCase() === 'desc' ? 'desc' : 'asc';
  const rows = await master.searchSizes(String(q), parseInt(String(limit), 10), ord as 'asc' | 'desc');
  res.json(rows);
});

// Create or update a size in SizeMaster
r.post('/sizes', authGuard, roleAnyGuard('admin', 'staff'), async (req, res) => {
  try {
    const { label, sortOrder } = req.body || {};
    if (!label || !String(label).trim()) {
      return res.status(400).json({ message: 'Size label is required' });
    }
    const doc = await master.upsertSize(String(label).trim());
    // Optionally update sortOrder if provided
    if (typeof sortOrder === 'number') {
      const SizeMaster = (await import('../models/sizeMaster.model')).default;
      await SizeMaster.updateOne({ _id: doc?._id }, { $set: { sortOrder } });
      const updated = await SizeMaster.findById(doc?._id).lean();
      return res.status(201).json(updated);
    }
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to save size' });
  }
});

// Seasons
r.get('/seasons', async (req, res) => {
  const { q = '', limit = '10', order = 'asc' } = req.query as any;
  const ord = String(order).toLowerCase() === 'desc' ? 'desc' : 'asc';
  const rows = await master.searchSeasons(String(q), parseInt(String(limit), 10), ord as 'asc' | 'desc');
  res.json(rows);
});

r.post('/seasons', authGuard, roleAnyGuard('admin', 'staff'), async (req, res) => {
  try {
    const { name, sortOrder } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Season name is required' });
    }
    const doc = await master.upsertSeason(String(name).trim());
    if (typeof sortOrder === 'number') {
      const Master = (await import('../models/master.model')).default;
      await Master.updateOne({ _id: (doc as any)?._id }, { $set: { sortOrder } });
      const updated = await Master.findById((doc as any)?._id).lean();
      return res.status(201).json(updated);
    }
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to save season' });
  }
});

export default r;
// Dress Types
r.get('/dress-types', async (req, res) => {
  const { q = '', limit = '10', order = 'asc' } = req.query as any;
  const ord = String(order).toLowerCase() === 'desc' ? 'desc' : 'asc';
  const rows = await master.searchDressTypes(String(q), parseInt(String(limit), 10), ord as 'asc' | 'desc');
  res.json(rows);
});

r.post('/dress-types', authGuard, roleAnyGuard('admin', 'staff'), async (req, res) => {
  try {
    const { name, sortOrder } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Dress type name is required' });
    }
    const doc = await master.upsertDressType(String(name).trim());
    if (typeof sortOrder === 'number') {
      const Master = (await import('../models/master.model')).default;
      await Master.updateOne({ _id: (doc as any)?._id }, { $set: { sortOrder } });
      const updated = await Master.findById((doc as any)?._id).lean();
      return res.status(201).json(updated);
    }
    res.status(201).json(doc);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to save dress type' });
  }
});
