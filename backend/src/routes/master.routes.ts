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

r.get('/suppliers', async (req, res) => {
  const { q = '', limit = '10' } = req.query as any;
  const rows = await master.searchSuppliers(String(q), parseInt(String(limit), 10));
  res.json(rows);
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
  const { q = '', limit = '10' } = req.query as any;
  const rows = await master.searchSizes(String(q), parseInt(String(limit), 10));
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

export default r;
