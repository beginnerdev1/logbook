import mongoose from "mongoose";

const { Schema } = mongoose;
const changeSchema = new Schema(
  {
    field: String,
    from: Schema.Types.Mixed,
    to: Schema.Types.Mixed,
  },
  { _id: false },
);

const activityLogSchema = new Schema(
  {
    at: { type: Date, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    userName: String,
    action: String,
    resourceType: String,
    resourceId: { type: Schema.Types.ObjectId, ref: "Entry" },
    resourceRef: String,
    result: String,
    details: String,
    comment: String,
    selfReview: Boolean,
    changes: { type: [changeSchema], default: [] },
  },
  { collection: "activityLogs" },
);

activityLogSchema.index({ at: -1 });
activityLogSchema.index({ resourceId: 1, at: -1 });

export const ActivityLog =
  mongoose.models.ActivityLog ??
  mongoose.model("ActivityLog", activityLogSchema);
