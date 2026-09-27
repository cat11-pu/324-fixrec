import assert from "node:assert";
import { packRecord, checksumOf } from "../records.js";
import { step, close } from "../recrun.js";
import { render } from "../app.js";

const base = {
  budget: 1, widths: [2, 3],
  state: { records: [], total_bytes: 0, ledger: [], applied: [] },
  events: [{ id: 1, kind: "write", seq: 1, values: [1, 2] }],
  field_error_code: "E_FIELD_TOO_BIG", ordinal_error_code: "E_BAD_ORDINAL",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("packRecord returns fields", () => {
  assert.ok(Array.isArray(packRecord([1, 2], [2, 3])));
});

check("checksumOf returns text", () => {
  assert.strictEqual(typeof checksumOf([1]), "string");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
