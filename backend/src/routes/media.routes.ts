// src/routes/media.routes.ts
import { Router } from 'express';
import { upload } from '../middlewares/upload';
import { uploadMedia, getMediaByVariant, deleteMedia } from '../controllers/media.controller';

const router = Router();
// POST /api/media/:variantId  (form-data: file, altText?, order?)
router.post('/:variantId', upload.single('file'), uploadMedia);
router.get('/by-variant/:variantId', getMediaByVariant);
router.delete('/:mediaId', deleteMedia);

export default router;
