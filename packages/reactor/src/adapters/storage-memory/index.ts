import type { Receipt } from "../../shapes";
import {
  EMPTY_RUNTIME_REGISTRY,
  cloneRuntimeRegistrySnapshot,
  type ReactorRuntimeRegistrySnapshot,
  type ReactorStorageRuntimeAdapter,
} from "../types";
import { cloneAdapterJsonValueV0 } from "../json";

export interface MemoryStorageAdapterInput {
  readonly registry?: ReactorRuntimeRegistrySnapshot;
  readonly receipts?: readonly Receipt[];
}

export interface MemoryStorageAdapter extends ReactorStorageRuntimeAdapter {
  readonly clear: () => void;
}

export function createMemoryStorageAdapter(
  input: MemoryStorageAdapterInput = {},
): MemoryStorageAdapter {
  let registry = cloneRuntimeRegistrySnapshot(
    input.registry ?? EMPTY_RUNTIME_REGISTRY,
  );
  let receipts = (input.receipts ?? []).map((receipt) => cloneReceipt(receipt));

  return {
    appendReceipt(receipt: Receipt): void {
      receipts = [...receipts, cloneReceipt(receipt)];
    },
    listReceipts(): readonly Receipt[] {
      return receipts.map((receipt) => cloneReceipt(receipt));
    },
    readRegistry(): ReactorRuntimeRegistrySnapshot {
      return cloneRuntimeRegistrySnapshot(registry);
    },
    writeRegistry(nextRegistry: ReactorRuntimeRegistrySnapshot): void {
      registry = cloneRuntimeRegistrySnapshot(nextRegistry);
    },
    clear(): void {
      registry = cloneRuntimeRegistrySnapshot(EMPTY_RUNTIME_REGISTRY);
      receipts = [];
    },
  };
}

function cloneReceipt(receipt: Receipt): Receipt {
  return cloneAdapterJsonValueV0(receipt);
}
