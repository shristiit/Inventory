import { Schema, model, Document, Types } from 'mongoose';

export type MasterKind = 'category' | 'supplier';

export interface MasterDoc extends Document {
  kind: MasterKind;
  name: string;
  slug?: string;
  parentId?: Types.ObjectId | null; // for subcategories when kind === 'category'
  isActive: boolean;
  sortOrder?: number;
}

const MasterSchema = new Schema<MasterDoc>(
  {
    kind: { type: String, enum: ['category', 'supplier'], required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Master', default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Unique name within the same (kind, parent)
MasterSchema.index({ kind: 1, parentId: 1, name: 1 }, { unique: true });
MasterSchema.index({ kind: 1, parentId: 1, slug: 1 });

export default model<MasterDoc>('Master', MasterSchema);

