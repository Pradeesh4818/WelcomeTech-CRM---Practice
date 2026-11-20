import mongoose, { Schema } from 'mongoose';

// A single-row-per-sequence counter used to hand out monotonic numbers
// atomically, so concurrent creates can never collide on a unique field.
// _id is the sequence name (string), so we don't extend Document (whose _id is ObjectId).
export interface ICounter {
  _id: string; // sequence name, e.g. 'ticket' | 'invoice' | 'proposal' | 'task'
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { _id: false });

export const Counter = mongoose.model<ICounter>('Counter', CounterSchema);

/**
 * Return the next number in a named sequence, atomically.
 *
 * On first use the counter is seeded (via `$max`, which is idempotent under
 * concurrency) from the highest number already present in legacy data, so
 * numbers issued after deploy never collide with existing records. The final
 * `$inc` is a single atomic op, so two concurrent callers always get distinct
 * values.
 */
export const nextSequence = async (
  name: string,
  computeSeed: () => Promise<number>
): Promise<number> => {
  const existing = await Counter.findById(name);
  if (!existing) {
    const seed = await computeSeed();
    await Counter.updateOne({ _id: name }, { $max: { seq: seed } }, { upsert: true });
  }
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter!.seq;
};

// Highest numeric suffix currently stored in `field` on `model` (0 if none).
export const highestExistingNumber = async (
  model: mongoose.Model<any>,
  field: string
): Promise<number> => {
  const latest = await model
    .findOne({ [field]: { $exists: true, $nin: ['', null] } }, { [field]: 1 })
    .sort({ [field]: -1 })
    .lean();
  const value = latest ? (latest as Record<string, unknown>)[field] : undefined;
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    if (match) return parseInt(match[0], 10);
  }
  return 0;
};

