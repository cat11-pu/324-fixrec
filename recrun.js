// recrun.js：按处理预算处理并留账；收尾不限预算把账补齐
import { packRecord, checksumOf } from "./records.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function codesOf(spec) {
  return {
    field: spec.field_error_code || "E_FIELD_TOO_BIG",
    ordinal: spec.ordinal_error_code || "E_BAD_ORDINAL",
    event: spec.event_error_code || "E_BAD_EVENT"
  };
}

function validateEvent(event, widths, eventCode) {
  if (!event || typeof event !== "object") fail(eventCode, "事件不是对象");
  if (event.kind !== "write") fail(eventCode, "事件类型不是 write");
  if (!Number.isInteger(event.seq) || event.seq < 0) fail(eventCode, "序号不是非负整数");
  const values = event.values;
  if (!Array.isArray(values) || values.length !== widths.length) {
    fail(eventCode, "字段个数对不上位宽表");
  }
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0) fail(eventCode, "字段值为负或不是整数");
  }
}

function cloneState(state) {
  const source = state || {};
  return {
    records: (source.records || []).map(function (row) {
      return [row[0], row[1].slice(), row[2]];
    }),
    total_bytes: source.total_bytes || 0,
    ledger: (source.ledger || []).map(function (entry) { return entry.slice(); }),
    applied: (source.applied || []).slice()
  };
}

function recordBytes(widths) {
  return widths.reduce(function (acc, width) { return acc + width; }, 0) + 2;
}

function applyEntry(state, widths, entry, codes) {
  if (entry.seq !== state.records.length + 1) {
    fail(codes.ordinal, "序号不是已打包条数加一");
  }
  for (let index = 0; index < widths.length; index += 1) {
    if (entry.values[index] >= Math.pow(10, widths[index])) {
      fail(codes.field, "字段值放不进对应位宽");
    }
  }
  packRecord(entry.values, widths);
  state.records.push([entry.seq, entry.values.slice(), checksumOf(entry.values)]);
  state.total_bytes += recordBytes(widths);
  state.applied.push(entry.id !== undefined ? entry.id : entry.seq);
}

function normalizeLedgerEntry(entry) {
  return { kind: entry[0], seq: entry[1], values: entry[2] };
}

export function step(spec) {
  const widths = spec.widths || [];
  const codes = codesOf(spec);
  const events = spec.events || [];
  for (const event of events) validateEvent(event, widths, codes.event);

  const state = cloneState(spec.state);
  const carried = state.ledger.map(normalizeLedgerEntry);
  state.ledger = [];
  const seen = new Set(state.applied);
  let budget = spec.budget || 0;
  let served = 0;
  let judged = 0;
  const items = carried.map(function (entry) { return { entry: entry, fresh: false }; })
    .concat(events.map(function (event) { return { entry: event, fresh: true }; }));

  for (const item of items) {
    judged += 1;
    const entry = item.entry;
    if (item.fresh) {
      const key = entry.id !== undefined ? entry.id : entry.seq;
      if (seen.has(key)) continue;
    }
    if (budget > 0) {
      budget -= 1;
      applyEntry(state, widths, entry, codes);
      served += 1;
      seen.add(entry.id !== undefined ? entry.id : entry.seq);
    } else {
      state.ledger.push([entry.kind, entry.seq, entry.values.slice()]);
    }
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (entry) { return entry.slice(); }),
    judged: judged,
    judged_bound: items.length
  };
}

export function close(spec) {
  const widths = spec.widths || [];
  const codes = codesOf(spec);
  const state = cloneState(spec.state);
  const carried = state.ledger.map(normalizeLedgerEntry);
  state.ledger = [];
  let catchup = 0;
  for (const entry of carried) {
    applyEntry(state, widths, entry, codes);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
