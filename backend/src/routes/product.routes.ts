import { Router } from "express";
import {
  listProducts,
  createProduct,
  getProduct,
  updateProduct,
  setProductStatus,
  deleteProduct,
  listSizesForProduct,
} from "../controllers/product.controller";

const router = Router();

// Collection
router.get("/", listProducts);
router.post("/", createProduct);

// Item helpers (keep before "/:id")
router.get("/:id/sizes", listSizesForProduct);

// Item CRUD
router.get("/:id", getProduct);
router.patch("/:id", updateProduct);
router.post("/:id/status", setProductStatus);
router.delete("/:id", deleteProduct);

export default router;
