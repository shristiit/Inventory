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

export default r;
