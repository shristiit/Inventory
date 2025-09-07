// src/controllers/media.controller.ts
import { Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import * as mediaSvc from '../services/media.service';

export const uploadMedia = asyncHandler(async (req: Request, res: Response) => {
  const { variantId } = req.params;
  if (!req.file) return res.status(400).json({ message: 'file is required' });

  const doc = await mediaSvc.addFromUpload({
    variantId,
    file: req.file,
    altText: (req.body?.altText as string) || undefined,
    order: req.body?.order ? Number(req.body.order) : undefined,
  });

  res.status(201).json(doc);
});

export const getMediaByVariant = asyncHandler(async (req: Request, res: Response) => {
  const list = await mediaSvc.listByVariant(req.params.variantId);
  res.json(list);
});

export const deleteMedia = asyncHandler(async (req: Request, res: Response) => {
  await mediaSvc.remove(req.params.mediaId);
  res.status(204).send();
});
