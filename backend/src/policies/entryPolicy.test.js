import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteDraft,
  canEdit,
  canReview,
  canSubmit,
  canView,
} from "./entryPolicy.js";

const owner = { id: "owner-id", role: "user" };
const other = { id: "other-id", role: "user" };
const admin = { id: "admin-id", role: "admin" };
const statuses = ["draft", "pending", "approved", "rejected", "failed"];

test("policy matrix scopes viewing, editing, submitting, and draft deletion", () => {
  const roleOwnerPairs = [
    { user: owner, owns: true },
    { user: owner, owns: false },
    { user: admin, owns: true },
    { user: admin, owns: false },
  ];
  let cases = 0;
  for (const { user, owns } of roleOwnerPairs) {
    for (const status of statuses) {
      const entry = { submittedBy: owns ? user.id : other.id, status };
      const editable = ["draft", "rejected"].includes(status);
      assert.equal(canView(user, entry), user.role === "admin" || owns);
      assert.equal(canEdit(user, entry), user.role === "admin" || (owns && editable));
      assert.equal(canDeleteDraft(user, entry), user.role !== "admin" && owns && status === "draft");
      assert.equal(canSubmit(user, entry), owns && editable);
      assert.equal(canReview(user, entry), user.role === "admin" && status === "pending");
      cases += 5;
    }
  }
  assert.equal(cases, 100);
  assert.equal(
    canDeleteDraft(owner, {
      submittedBy: owner.id,
      status: "draft",
      referenceNo: "DOC-2026-00001",
    }),
    false,
  );
});
