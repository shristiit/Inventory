import { Schema, model, Document } from 'mongoose';

export interface SizeMasterDoc extends Document {
  label: string;     // e.g., "S", "M", "L", "EU 42"
  sortOrder?: number;
  slug?: string;     // normalized unique key
  isActive: boolean;
}

const SizeMasterSchema = new Schema<SizeMasterDoc>(
  {
    label: { type: String, required: true, unique: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    slug: { type: String, unique: true, sparse: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

SizeMasterSchema.index({ label: 'text' });

export default model<SizeMasterDoc>('SizeMaster', SizeMasterSchema);

