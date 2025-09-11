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
// Delete a single variant media item
r.delete('/variants/:variantId/media/:mediaId', authGuard, roleAnyGuard('admin', 'staff'), ctrl.deleteVariantMedia);

// Variant CRUD (admin or staff for add/update; delete remains admin)
r.post('/:id/variants', authGuard, roleAnyGuard('admin', 'staff'), ctrl.addVariant);
r.patch('/variants/:variantId', authGuard, roleAnyGuard('admin', 'staff'), ctrl.updateVariant);
r.delete('/variants/:variantId', authGuard, roleGuard('admin'), ctrl.deleteVariantCascadeArchive);

// Sizes CRUD (admin or staff for add/update; delete remains admin)
r.post('/variants/:variantId/sizes', authGuard, roleAnyGuard('admin', 'staff'), ctrl.addSize);
r.patch('/sizes/:sizeId', authGuard, roleAnyGuard('admin', 'staff'), ctrl.updateSize);
r.delete('/sizes/:sizeId', authGuard, roleGuard('admin'), ctrl.deleteSizeArchive);

// Product updates / status / deep read / delete (keep AFTER variant routes)
r.get('/:id', ctrl.getProductDeep);
// Read-only product media
r.get('/:id/media', ctrl.getProductMedia);
// Delete a single product media item
r.delete('/:id/media/:mediaId', authGuard, roleAnyGuard('admin', 'staff'), ctrl.deleteProductMedia);
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
