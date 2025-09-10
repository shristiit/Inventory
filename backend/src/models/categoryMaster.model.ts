import { Schema, model, Document, Types } from 'mongoose';

export interface CategoryMasterDoc extends Document {
  name: string;
  slug?: string;
  parentId?: Types.ObjectId | null;
  isActive: boolean;
  sortOrder?: number;
}

const CategoryMasterSchema = new Schema<CategoryMasterDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'CategoryMaster', default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Unique within the same parent
CategoryMasterSchema.index({ parentId: 1, name: 1 }, { unique: true });
CategoryMasterSchema.index({ parentId: 1, slug: 1 }, { unique: false });

export default model<CategoryMasterDoc>('CategoryMaster', CategoryMasterSchema);

