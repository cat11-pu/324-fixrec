// recrun.js：按处理预算处理事件，预算用尽后连着载压账，收尾不限预算补齐
import { packRecord, checksumOf } from "./records.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function codes(spec) {
  return {
    field: spec.field_error_code || "E_FIELD_TOO_BIG",
    ordinal: spec.ordinal_error_code || "E_BAD_ORDINAL",
    event: spec.event_error_code || "E_BAD_EVENT"
  };
}

function copyState(state) {
  return {
    records: (state.records || []).map(function (row) { return [row[0], row[1].slice(), row[2]]; }),
    total_bytes: state.total_bytes || 0,
    ledger: (state.ledger || []).map(function (entry) { return [entry[0], entry[1], entry[2].slice()]; }),
    applied: (state.applied || []).slice()
  };
}

function validateEvent(event, widths, code) {
  const bad = !event || typeof event !== "object"
    || event.kind !== "write"
    || !Number.isInteger(event.seq) || event.seq < 0
    || !Array.isArray(event.values) || event.values.length !== widths.length
    || event.values.some(function (value) { return !Number.isInteger(value) || value < 0; });
  if (bad) fail(code, "bad event");
}

function applyOne(state, widths, seq, values, spec, errCodes) {
  if (seq !== state.records.length + 1) fail(errCodes.ordinal, "bad ordinal " + seq);
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= Math.pow(10, widths[index])) fail(errCodes.field, "field too big " + values[index]);
  }
  const packed = packRecord(values, widths);
  state.records.push([seq, values.slice(), checksumOf(values)]);
  state.total_bytes += packed.join("").length + 2;
  state.applied.push(seq);
}

export function step(spec) {
  const widths = spec.widths || [];
  const events = spec.events || [];
  const errCodes = codes(spec);
  events.forEach(function (event) { validateEvent(event, widths, errCodes.event); });

  const state = copyState(spec.state || {});
  let budget = spec.budget || 0;
  let served = 0;
  const judged_bound = state.ledger.length + events.length;

  const carried = state.ledger;
  let drained = 0;
  while (drained < carried.length && budget > 0) {
    const entry = carried[drained];
    applyOne(state, widths, entry[1], entry[2], spec, errCodes);
    drained += 1;
    budget -= 1;
    served += 1;
  }
  const ledger = carried.slice(drained);

  events.forEach(function (event) {
    if (state.applied.indexOf(event.seq) !== -1) return;
    if (budget <= 0) {
      ledger.push([event.kind, event.seq, event.values.slice()]);
      return;
    }
    applyOne(state, widths, event.seq, event.values, spec, errCodes);
    budget -= 1;
    served += 1;
  });

  state.ledger = ledger;
  return { state: state, served: served, ledger_before: ledger.length, ledger: ledger, judged: served, judged_bound: judged_bound };
}

export function close(spec) {
  const widths = spec.widths || [];
  const errCodes = codes(spec);
  const state = copyState(spec.state || {});
  let catchup = 0;
  state.ledger.forEach(function (entry) {
    applyOne(state, widths, entry[1], entry[2], spec, errCodes);
    catchup += 1;
  });
  state.ledger = [];
  return { state: state, catchup: catchup };
}
