import { Router } from 'express';
import * as ctrl from '../controllers/product.controller';
import { authGuard } from '../middlewares/authGaurd';
import { roleGuard, roleAnyGuard } from '../middlewares/roleGaurd';
import { upload } from '../config/storage';

const r = Router();

// Create product + variants + sizes (admin or staff)
r.post('/', authGuard, roleAnyGuard('admin', 'staff'), ctrl.createProductDeep);

// Public reads (LIST first)
r.get('/', ctrl.listProducts);

// ---- Variant reads must come BEFORE '/:id' so they don't get shadowed ----
r.get('/variants/by-sku/:sku', ctrl.getVariantBySku);
r.get('/variants/:variantId', ctrl.getVariantDeep);
// Read-only variant media
r.get('/variants/:variantId/media', ctrl.getVariantMedia);

// Variant CRUD (admin only)
r.post('/:id/variants', authGuard, roleGuard('admin'), ctrl.addVariant);
r.patch('/variants/:variantId', authGuard, roleGuard('admin'), ctrl.updateVariant);
r.delete('/variants/:variantId', authGuard, roleGuard('admin'), ctrl.deleteVariantCascadeArchive);

// Sizes CRUD (admin only)
r.post('/variants/:variantId/sizes', authGuard, roleGuard('admin'), ctrl.addSize);
r.patch('/sizes/:sizeId', authGuard, roleGuard('admin'), ctrl.updateSize);
r.delete('/sizes/:sizeId', authGuard, roleGuard('admin'), ctrl.deleteSizeArchive);

// Product updates / status / deep read / delete (keep AFTER variant routes)
r.get('/:id', ctrl.getProductDeep);
// Read-only product media
r.get('/:id/media', ctrl.getProductMedia);
r.patch('/:id', authGuard, roleGuard('admin'), ctrl.updateProduct);
r.post('/:id/status', authGuard, roleGuard('admin'), ctrl.setProductStatus);
r.delete('/:id', authGuard, roleGuard('admin'), ctrl.deleteProductCascadeArchive);

// Media upload for a variant (admin or staff)
// Accepts multipart/form-data with one or more files under field name 'files'
r.post('/variants/:variantId/media', authGuard, roleAnyGuard('admin', 'staff'), upload.array('files', 10), ctrl.addVariantMedia);

// Media upload for a product (admin or staff)
// Accepts multipart/form-data with one or more files under field name 'files'
r.post('/:id/media', authGuard, roleAnyGuard('admin', 'staff'), upload.array('files', 10), ctrl.addProductMedia);

export default r;
