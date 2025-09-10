

import { Router } from "express";
import { body, param } from "express-validator";
import {
  createOrder,
  listOrders,
  getOrderById,
  deleteOrderById,
  updateOrder
} from "../controllers/order.controller";
import { authGuard } from "../middlewares/authGaurd";
import { roleAnyGuard, roleGuard } from "../middlewares/roleGaurd";

const router = Router();

// Create Order
router.post(
  "/create",
  [
    body("customer").isString().notEmpty(),
    body("products").isArray({ min: 1 }),
    body("products.*.name").isString().notEmpty(),
    body("products.*.price").isFloat({ min: 0 }),
    body("products.*.quantity").isInt({ min: 1 }),
    body("products.*.product_id").isString().notEmpty(),
    body("products.*.variantId").optional().isString(),
    body("products.*.sizeId").optional().isString(),
    body("products.*.location").optional().isString(),
    body("totalAmount").isFloat({ min: 0 }),
    body("shippingAddress").optional().isString(),
  ],
  authGuard,
  roleAnyGuard('admin', 'staff'),
  createOrder
);
// update Order 
router.post(
  "/update",
  [
    body("orderNumber").isString().notEmpty(),
    body("status").isString().notEmpty(),
  ],
  authGuard,
  roleGuard('admin'),
  updateOrder
);
// List Orders (admin or staff)
router.get("/list", authGuard, roleAnyGuard('admin', 'staff'), listOrders);

// Get Order by ID (admin or staff)
router.get("/:id", [param("id").isString().notEmpty()], authGuard, roleAnyGuard('admin', 'staff'), getOrderById);

// Delete Order (admin only)
router.delete("/:id", [param("id").isString().notEmpty()], authGuard, roleGuard('admin'), deleteOrderById);

export default router;
