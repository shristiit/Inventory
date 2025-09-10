import { Request, Response } from "express";
import { validationResult } from "express-validator";
import Order from "../models/order.model";
import Product from "../models/product.model";
import { reserveStock, commitShipment, releaseReservation } from "../services/stock.service";
/** Create Order */
export const createOrder = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: "Validation failed", errors: errors.array() });

  try {
    const { customer, products, shippingAddress } = req.body;
    const totalAmount = products.reduce(
      (sum: number, p: {price: number; quantity: number}) => sum + (p.price * p.quantity), 0
    )
    // Try to reserve stock for each line if identifiers are present
    const reserved: Array<{ sizeId: string; location: string; qty: number }> = [];
    for (const p of products) {
      const sizeId = (p as any).sizeId;
      const location = (p as any).location || 'WH-DEFAULT';
      const qty = Number(p.quantity || 0);
      if (sizeId && qty > 0) {
        const ok = await reserveStock(sizeId, location, qty);
        if (ok) reserved.push({ sizeId, location, qty });
        else {
          // rollback previous reservations
          for (const r of reserved) {
            await releaseReservation(r.sizeId, r.location, r.qty);
          }
          return res.status(400).json({ message: `Insufficient stock for size ${sizeId} at ${location}` });
        }
      }
    }

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

/*Update*/

export const updateOrder = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if(!errors.isEmpty()) return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  try {
    const { orderNumber, status } = req.body;

    // load existing
    const order = await Order.findById(orderNumber);
    if (!order) throw new Error("Order not found");

    // On Delivered, commit shipment for each line
    if (status === 'Delivered' && order.status !== 'Delivered') {
      for (const p of order.products) {
        const sizeId = (p as any).sizeId;
        const location = (p as any).location || 'WH-DEFAULT';
        const qty = Number(p.quantity || 0);
        if (sizeId && qty > 0) {
          await commitShipment(sizeId, location, qty);
        }
      }
    }

    order.status = status;
    await order.save();
    res.status(201).json(order);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: "Failed to update order", error: err.message });
  }
}


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
