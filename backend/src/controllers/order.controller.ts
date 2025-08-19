import { Request, Response } from "express";
import { validationResult } from "express-validator";
import Order from "../models/order.model";

/** Create Order */
export const createOrder = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: "Validation failed", errors: errors.array() });

  try {
    const { customer, products, shippingAddress } = req.body;
    const totalAmount = products.reduce(
      (sum: number, p: {price: number; quantity: number}) => sum + (p.price * p.quantity), 0
    )
    const order = await Order.create({
      customer,
      products,
      totalAmount,
      shippingAddress,
      // orderNumber is auto-generated
    });

    res.status(201).json(order);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to create order", error: err.message });
  }
};

/** List Orders */
export const listOrders = async (_req: Request, res: Response) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to list orders", error: err.message });
  }
};

/** Get Order by ID */
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to get order", error: err.message });
  }
};

/** Delete Order */
export const deleteOrderById = async (req: Request, res: Response) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to delete order", error: err.message });
  }
};

