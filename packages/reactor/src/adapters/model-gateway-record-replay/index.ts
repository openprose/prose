import { cloneAdapterJsonValueV0, renderAdapterJsonV0 } from "../json";
import {
  assertModelGatewayUsage,
  cloneModelGatewayUsage,
  type ReactorModelGatewayRequest,
  type ReactorModelGatewayResponseWithUsage,
  type ReactorModelGatewayRuntimeAdapter,
  type ReactorModelGatewayUsage,
} from "../types";

export interface RecordReplayModelGatewayRecord {
  readonly id: string;
  readonly request: ReactorModelGatewayRequest;
  readonly response: {
    readonly payload: unknown;
    readonly usage: ReactorModelGatewayUsage;
  };
}

export interface RecordReplayModelGatewayCall {
  readonly record_id: string;
  readonly request: ReactorModelGatewayRequest;
  readonly usage: ReactorModelGatewayUsage;
}

export interface RecordReplayModelGatewayAdapter
  extends ReactorModelGatewayRuntimeAdapter {
  readonly calls: () => readonly RecordReplayModelGatewayCall[];
  readonly remaining: () => number;
}

export interface RecordReplayModelGatewayInput {
  readonly records: readonly RecordReplayModelGatewayRecord[];
}

export function createRecordReplayModelGatewayAdapter(
  input: RecordReplayModelGatewayInput,
): RecordReplayModelGatewayAdapter {
  const records = input.records.map((record) => normalizeRecord(record));
  const calls: RecordReplayModelGatewayCall[] = [];
  let cursor = 0;

  return {
    invoke(
      request: ReactorModelGatewayRequest,
    ): ReactorModelGatewayResponseWithUsage {
      const requestCopy = cloneAdapterJsonValueV0(request);
      const record = records[cursor];
      if (record === undefined) {
        throw new Error("record-replay model gateway has no remaining records");
      }

      const expected = renderAdapterJsonV0(record.request);
      const actual = renderAdapterJsonV0(requestCopy);
      if (actual !== expected) {
        throw new Error(
          `record-replay model gateway request mismatch at record ${record.id}`,
        );
      }

      cursor += 1;
      const usage = cloneModelGatewayUsage(record.response.usage);
      calls.push({
        record_id: record.id,
        request: requestCopy,
        usage,
      });

      return {
        payload: cloneAdapterJsonValueV0(record.response.payload),
        usage,
      };
    },
    calls(): readonly RecordReplayModelGatewayCall[] {
      return calls.map((call) => cloneAdapterJsonValueV0(call));
    },
    remaining(): number {
      return records.length - cursor;
    },
  };
}

function normalizeRecord(
  record: RecordReplayModelGatewayRecord,
): RecordReplayModelGatewayRecord {
  if (record.id.length === 0) {
    throw new Error("record-replay model gateway record id must be non-empty");
  }

  assertModelGatewayUsage(record.response.usage);

  return {
    id: record.id,
    request: cloneAdapterJsonValueV0(record.request),
    response: {
      payload: cloneAdapterJsonValueV0(record.response.payload),
      usage: cloneModelGatewayUsage(record.response.usage),
    },
  };
}
