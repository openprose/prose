import { cloneAdapterJsonValueV0 } from "../json";
import type {
  ReactorConnectorAdapter,
  ReactorConnectorRequest,
  ReactorConnectorResponse,
} from "../types";

export interface StaticConnectorSource {
  readonly source_id: string;
  readonly payload: unknown;
}

export interface StaticConnectorAdapter extends ReactorConnectorAdapter {
  readonly writeSource: (source: StaticConnectorSource) => void;
  readonly reads: () => readonly ReactorConnectorRequest[];
}

export function createStaticConnectorAdapter(
  sources: readonly StaticConnectorSource[] = [],
): StaticConnectorAdapter {
  const records = new Map<string, unknown>();
  const reads: ReactorConnectorRequest[] = [];

  for (const source of sources) {
    writeSource(records, source);
  }

  return {
    read(request: ReactorConnectorRequest): ReactorConnectorResponse {
      const requestCopy = cloneAdapterJsonValueV0(request);
      reads.push(requestCopy);
      if (!records.has(request.source_id)) {
        throw new Error(`connector source not found: ${request.source_id}`);
      }

      return {
        payload: cloneAdapterJsonValueV0(records.get(request.source_id)),
      };
    },
    writeSource(source: StaticConnectorSource): void {
      writeSource(records, source);
    },
    reads(): readonly ReactorConnectorRequest[] {
      return reads.map((read) => cloneAdapterJsonValueV0(read));
    },
  };
}

function writeSource(
  records: Map<string, unknown>,
  source: StaticConnectorSource,
): void {
  if (source.source_id.length === 0) {
    throw new Error("connector source_id must be non-empty");
  }
  records.set(source.source_id, cloneAdapterJsonValueV0(source.payload));
}
