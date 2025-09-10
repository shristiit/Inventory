import { Router } from 'express';
import { query } from 'express-validator';
import * as master from '../services/master.service';

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

r.get('/sizes', async (req, res) => {
  const { q = '', limit = '10' } = req.query as any;
  const rows = await master.searchSizes(String(q), parseInt(String(limit), 10));
  res.json(rows);
});

export default r;
