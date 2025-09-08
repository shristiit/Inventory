import { Schema, model, Document, Types } from "mongoose";

export type ProductStatus = "active" | "inactive" | "draft" | "archived";

export interface ProductDoc extends Document {
  styleNumber: string;      // same for all variants in a style
  title: string;
  description?: string;
  price: number;            // minor units (pence)
  color: string;            // one color per document  👈 NEW
  size: string;             // one size per document
  quantity: number;         // stock for this color+size
  attributes?: Record<string, any>;
  status: ProductStatus;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}

const ProductSchema = new Schema<ProductDoc>(
  {
    styleNumber: { type: String, required: true, index: true, trim: true, uppercase: true },
    title:       { type: String, required: true, index: true, trim: true },
    description: { type: String },
    price:       { type: Number, required: true, min: 0 },

    // NEW FIELD
    color:       { type: String, required: true, trim: true, uppercase: true, index: true },

    size:        { type: String, required: true, trim: true, uppercase: true, index: true },
    quantity:    { type: Number, required: true, min: 0 },

    attributes:  { type: Schema.Types.Mixed },
    status:      { type: String, enum: ["active","inactive","draft","archived"], default: "draft", index: true },
    isDeleted:   { type: Boolean, default: false, index: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy:   { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// text search on title/description
ProductSchema.index({ title: "text", description: "text" });

// unique row per (styleNumber, color, size)
ProductSchema.index({ styleNumber: 1, color: 1, size: 1 }, { unique: true });

export default model<ProductDoc>("Product", ProductSchema);
