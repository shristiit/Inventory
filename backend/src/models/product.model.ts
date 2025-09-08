import { Schema, model, Document, Types } from "mongoose";

export type ProductStatus = "active" | "inactive" | "draft" | "archived";

export interface ProductDoc extends Document {
  styleNumber: string;      // same for all sizes in the style
  title: string;
  description?: string;
  price: Number;            // minor units (pence)
  size: string;             // one size per document
  quantity: number
  attributes?: Record<string, any>;
  status: ProductStatus;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}

const ProductSchema = new Schema<ProductDoc>(
  {
    styleNumber: { type: String, required: true, index: true, trim: true },
    title:       { type: String, required: true, index: true, trim: true },
    description: { type: String },
    price:       { type: Number, required: true, min: 0 },
    size:        { type: String, required: true, trim: true, index: true },
    quantity : {type:Number, required:true},
    attributes:  { type: Schema.Types.Mixed },
    status:      { type: String, enum: ["active","inactive","draft","archived"], default: "draft", index: true },
    isDeleted:   { type: Boolean, default: false, index: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy:   { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ProductSchema.index({ title: "text", description: "text" });
// ensure one row per (styleNumber, size)
ProductSchema.index({ styleNumber: 1, size: 1 }, { unique: true });

export default model<ProductDoc>("Product", ProductSchema);
