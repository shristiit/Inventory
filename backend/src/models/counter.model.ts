import { Schema, model, Document } from 'mongoose';

export interface CounterDoc extends Document {
  key: string;
  seq: number;
}

const CounterSchema = new Schema<CounterDoc>({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 100000 },
});

export default model<CounterDoc>('Counter', CounterSchema);

