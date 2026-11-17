import mongoose from "mongoose";

export async function nextReferenceNo(prefix, year) {
  const id = `${prefix}-${year}`;
  const result = await mongoose.connection
    .collection("counters")
    .findOneAndUpdate(
      { _id: id },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );

  const counter = result?.value !== undefined ? result.value : result;

  if (!counter || !Number.isInteger(counter.seq)) {
    throw new Error(`Counter update for ${id} did not return a sequence.`);
  }

  return `${id}-${String(counter.seq).padStart(5, "0")}`;
}
