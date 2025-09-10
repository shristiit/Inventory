import { Schema, model, Document } from 'mongoose';

export interface ColorMasterDoc extends Document {
  name: string;      // e.g., "Red"
  code?: string;     // hex like #FF0000 (optional)
  slug?: string;     // normalized unique key
  isActive: boolean;
}

const ColorMasterSchema = new Schema<ColorMasterDoc>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String },
    slug: { type: String, unique: true, sparse: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

ColorMasterSchema.index({ name: 'text' });

export default model<ColorMasterDoc>('ColorMaster', ColorMasterSchema);

