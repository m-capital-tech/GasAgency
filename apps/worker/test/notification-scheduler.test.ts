import assert from "node:assert/strict";
import test from "node:test";
import { standingOrderReminderTarget } from "../src/push/scheduler";

test("standing-order reminders open at the configured India-local hour for the next delivery day", () => {
  assert.equal(standingOrderReminderTarget(new Date("2026-10-22T01:29:59.000Z"), "Asia/Kolkata", 7), null);
  assert.deepEqual(
    standingOrderReminderTarget(new Date("2026-10-22T01:30:00.000Z"), "Asia/Kolkata", 7),
    { date: "2026-10-23", weekday: 5 },
  );
});

test("standing-order reminder dates cross month and year boundaries without server-timezone drift", () => {
  assert.deepEqual(
    standingOrderReminderTarget(new Date("2026-12-31T03:00:00.000Z"), "Asia/Kolkata", 7),
    { date: "2027-01-01", weekday: 5 },
  );
});
