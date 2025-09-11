import { Schema, model, Document, Types } from 'mongoose';

export type ProductStatus = 'active' | 'inactive' | 'draft' | 'archived';

export interface ProductDoc extends Document {
  styleNumber: string;      // unique product-level style number
  title: string;
  description?: string;
  price: number;            // base/list price (use cents to avoid float drift)
  // vatprice: number;         // VAT-inclusive price 
  attributes?: Record<string, any>; // brand, category, etc.
  dressType?: string;
  status: ProductStatus;    // active/inactive for sales gating
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  categoryId?: Types.ObjectId | null;
  subcategoryId?: Types.ObjectId | null;
  supplierId?: Types.ObjectId | null;
  media?: Array<{
    url: string;
    type: 'image' | 'video';
    alt?: string;
    isPrimary?: boolean;
  }>;
}

const ProductSchema = new Schema<ProductDoc>(
  {
    styleNumber: { type: String, required: true, unique: true, index: true },
    title:       { type: String, required: true, index: true },
    description: { type: String },
    price:       { type: Number, required: true, min: 0 },
    // vatprice:    { type: Number, required: true, min: 0 },
    attributes:  { type: Schema.Types.Mixed },
    dressType:   { type: String },
    categoryId:  { type: Schema.Types.ObjectId, ref: 'Master', default: null, index: true },
    subcategoryId:{ type: Schema.Types.ObjectId, ref: 'Master', default: null, index: true },
    supplierId:  { type: Schema.Types.ObjectId, ref: 'Master', default: null, index: true },
    media:       [{
      url: { type: String, required: true },
      type:{ type: String, enum: ['image','video'], required: true },
      alt: { type: String },
      isPrimary: { type: Boolean, default: false }
    }],
    status:      { type: String, enum: ['active','inactive','draft','archived'], default: 'draft', index: true },
    isDeleted:   { type: Boolean, default: false, index: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ProductSchema.index({ title: 'text', description: 'text' });

export default model<ProductDoc>('Product', ProductSchema);
