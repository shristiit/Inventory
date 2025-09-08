import { Router } from "express";
import {
  listProducts,
  createProduct,
  getProduct,
  updateProduct,
  setProductStatus,
  deleteProduct,
  listSizesForProduct,   // <-- new
} from "../controllers/product.controller";

const router = Router();

// Collection
router.get("/", listProducts);
router.post("/", createProduct);

// Item-specific helpers (put this BEFORE "/:id")
router.get("/:id/sizes", listSizesForProduct); // <-- IMPORTANT: before the next line

// Item CRUD
router.get("/:id", getProduct);
router.patch("/:id", updateProduct);
router.post("/:id/status", setProductStatus);
router.delete("/:id", deleteProduct);

export default router;
