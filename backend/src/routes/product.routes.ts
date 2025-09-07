import { Router } from "express";
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  setProductStatus,
  deleteProduct,
} from "../controllers/product.controller";

const r = Router();

// base mount is typically: app.use("/api/products", r);

r.post("/", createProduct);          // POST   /api/products
r.get("/", listProducts);            // GET    /api/products
r.get("/:id", getProduct);           // GET    /api/products/:id
r.patch("/:id", updateProduct);      // PATCH  /api/products/:id
r.post("/:id/status", setProductStatus); // POST /api/products/:id/status
r.delete("/:id", deleteProduct);     // DELETE /api/products/:id  (soft)

export default r;
