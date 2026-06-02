import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { Receipt } from "../../shapes";
import { cloneAdapterJsonValue, renderAdapterJson } from "../json";
import {
  EMPTY_RUNTIME_REGISTRY,
  assertRuntimeRegistrySnapshot,
  cloneRuntimeRegistrySnapshot,
  type ReactorRuntimeRegistrySnapshot,
  type ReactorStorageRuntimeAdapter,
} from "../types";

export interface FileSystemStorageAdapterInput {
  readonly directory: string;
  readonly registry_file?: string;
  readonly receipts_file?: string;
  readonly initial_registry?: ReactorRuntimeRegistrySnapshot;
  /**
   * Open the trail READ-ONLY (B5). When `true`, construction NEVER touches the
   * filesystem: it does not `mkdir` the directory and does not seed empty
   * `registry.json` / `receipts.json`. `listReceipts()` / `readRegistry()` then
   * read what is on disk, treating an ABSENT file as the legitimate empty case
   * (`[]` / the empty registry) rather than creating it — so a pure-read open of
   * a bare or non-existent directory leaves the target byte-for-byte untouched.
   * The write paths (`appendReceipt` / `writeRegistry`) throw, since a read-only
   * adapter has no mutable trail. Default `false` keeps the write-path behavior
   * (mkdir + seed) UNCHANGED.
   */
  readonly read_only?: boolean;
}

export interface FileSystemStorageAdapter extends ReactorStorageRuntimeAdapter {
  readonly directory: string;
  readonly registryPath: string;
  readonly receiptsPath: string;
}

export function createFileSystemStorageAdapter(
  input: FileSystemStorageAdapterInput,
): FileSystemStorageAdapter {
  if (input.directory.length === 0) {
    throw new Error("filesystem storage directory must be non-empty");
  }

  const registryPath = join(
    input.directory,
    input.registry_file ?? "registry.json",
  );
  const receiptsPath = join(
    input.directory,
    input.receipts_file ?? "receipts.json",
  );

  const readOnly = input.read_only === true;

  if (!readOnly) {
    mkdirSync(input.directory, { recursive: true });
    initializeFile(
      registryPath,
      input.initial_registry ?? EMPTY_RUNTIME_REGISTRY,
    );
    initializeFile(receiptsPath, []);
  }

  return {
    directory: input.directory,
    registryPath,
    receiptsPath,
    appendReceipt(receipt: Receipt): void {
      if (readOnly) {
        throw new Error("read-only filesystem storage cannot append receipts");
      }
      const receipts = readReceiptLog(receiptsPath);
      writeJsonFile(receiptsPath, [...receipts, cloneReceipt(receipt)]);
    },
    listReceipts(): readonly Receipt[] {
      // Read-only open of an absent trail is the legitimate empty case — never
      // a create. A PRESENT but malformed file still throws (a corrupt trail is
      // a real error, not empty).
      if (readOnly && !existsSync(receiptsPath)) {
        return [];
      }
      return readReceiptLog(receiptsPath);
    },
    readRegistry(): ReactorRuntimeRegistrySnapshot {
      if (readOnly && !existsSync(registryPath)) {
        return cloneRuntimeRegistrySnapshot(EMPTY_RUNTIME_REGISTRY);
      }
      const value = readJsonFile(registryPath);
      assertRuntimeRegistrySnapshot(value);
      return cloneRuntimeRegistrySnapshot(value);
    },
    writeRegistry(registry: ReactorRuntimeRegistrySnapshot): void {
      if (readOnly) {
        throw new Error("read-only filesystem storage cannot write the registry");
      }
      writeJsonFile(registryPath, cloneRuntimeRegistrySnapshot(registry));
    },
  };
}

function initializeFile(path: string, value: unknown): void {
  if (!existsSync(path)) {
    writeJsonFile(path, value);
  }
}

function readReceiptLog(path: string): readonly Receipt[] {
  const value = readJsonFile(path);
  if (!Array.isArray(value)) {
    throw new Error("filesystem receipts file must contain an array");
  }

  return value.map((receipt) => cloneReceipt(receipt as Receipt));
}

function cloneReceipt(receipt: Receipt): Receipt {
  return cloneAdapterJsonValue(receipt);
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function writeJsonFile(path: string, value: unknown): void {
  const tempPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tempPath, `${renderAdapterJson(value)}\n`, "utf8");
  renameSync(tempPath, path);
}
