import { Router } from 'express';
import * as ctrl from '../controllers/product.controller';
import { upload } from '../config/storage';

const r = Router();

// Create product + variants + sizes
r.post('/', ctrl.createProductDeep);

// Public reads (LIST first)
r.get('/', ctrl.listProducts);

// ---- Variant reads must come BEFORE '/:id' so they don't get shadowed ----
r.get('/variants/by-sku/:sku', ctrl.getVariantBySku);
r.get('/variants/:variantId', ctrl.getVariantDeep);

// Variant CRUD
r.post('/:id/variants', ctrl.addVariant);
r.patch('/variants/:variantId', ctrl.updateVariant);
r.delete('/variants/:variantId', ctrl.deleteVariantCascadeArchive);

// Sizes CRUD
r.post('/variants/:variantId/sizes', ctrl.addSize);
r.patch('/sizes/:sizeId', ctrl.updateSize);
r.delete('/sizes/:sizeId', ctrl.deleteSizeArchive);

// Product updates / status / deep read / delete (keep AFTER variant routes)
r.get('/:id', ctrl.getProductDeep);
r.patch('/:id', ctrl.updateProduct);
r.post('/:id/status', ctrl.setProductStatus);
r.delete('/:id', ctrl.deleteProductCascadeArchive);

// Media upload for a variant
// Accepts multipart/form-data with one or more files under field name 'files'
r.post('/variants/:variantId/media', upload.array('files', 10), ctrl.addVariantMedia);

export default r;
