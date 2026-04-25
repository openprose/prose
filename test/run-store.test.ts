import { readFileSync, statSync } from "node:fs";
import {
  describe,
  expect,
  fixturePath,
  initLocalStore,
  join,
  mkdtempSync,
  readLocalStoreMetadata,
  readRunIndex,
  readStoreJsonRecord,
  resolveLocalStoreLayout,
  test,
  tmpdir,
  upsertRunIndexEntry,
  writeFileSync,
  writeStoreJsonRecord,
} from "./support";

describe("OpenProse local run store", () => {
  test("resolves the canonical local store layout", () => {
    const layout = resolveLocalStoreLayout("/tmp/openprose-store");
    const golden = JSON.parse(readFileSync(fixturePath("store/layout.golden.json"), "utf8"));

    expect(layout).toEqual(golden);
  });

  test("initializes versioned store metadata and directories", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-store-"));
    const { layout, metadata } = await initLocalStore(root, {
      now: "2026-04-25T12:00:00.000Z",
    });

    for (const path of [
      layout.runs_dir,
      layout.artifacts_dir,
      layout.graphs_dir,
      layout.indexes_dir,
      layout.meta_dir,
    ]) {
      expect(statSync(path).isDirectory()).toBe(true);
    }
    expect(metadata).toEqual({
      store_version: "0.1",
      created_at: "2026-04-25T12:00:00.000Z",
      updated_at: "2026-04-25T12:00:00.000Z",
      layout: {
        runs: "runs",
        artifacts: "artifacts",
        graphs: "graphs",
        indexes: "indexes",
        meta: "meta",
      },
      migrations: [],
    });
    expect(await readLocalStoreMetadata(root)).toEqual(metadata);
  });

  test("writes immutable JSON records and refuses accidental overwrite", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-store-record-"));
    const path = await writeStoreJsonRecord(root, "runs", "run-1/run.json", {
      run_id: "run-1",
    });

    expect(path.endsWith("/runs/run-1/run.json")).toBe(true);
    const stored = await readStoreJsonRecord<{ run_id: string }>(
      root,
      "runs",
      "run-1/run.json",
    );
    expect(stored).toEqual({
      run_id: "run-1",
    });
    await expect(
      writeStoreJsonRecord(root, "runs", "run-1/run.json", { run_id: "run-1b" }),
    ).rejects.toThrow("Refusing to overwrite immutable store record");
  });

  test("upserts and sorts the run query index", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-store-index-"));

    await upsertRunIndexEntry(root, {
      run_id: "run-a",
      kind: "component",
      component_ref: "writer",
      status: "succeeded",
      acceptance: "accepted",
      created_at: "2026-04-25T12:00:00.000Z",
      completed_at: "2026-04-25T12:01:00.000Z",
      record_ref: "runs/run-a/run.json",
    });
    await upsertRunIndexEntry(root, {
      run_id: "run-b",
      kind: "graph",
      component_ref: "workflow",
      status: "blocked",
      acceptance: "pending",
      created_at: "2026-04-25T13:00:00.000Z",
      completed_at: null,
      record_ref: "runs/run-b/run.json",
    });
    await upsertRunIndexEntry(root, {
      run_id: "run-a",
      kind: "component",
      component_ref: "writer",
      status: "failed",
      acceptance: "rejected",
      created_at: "2026-04-25T12:00:00.000Z",
      completed_at: "2026-04-25T12:02:00.000Z",
      record_ref: "runs/run-a/run.json",
    });

    expect((await readRunIndex(root)).map((entry) => [entry.run_id, entry.status])).toEqual([
      ["run-b", "blocked"],
      ["run-a", "failed"],
    ]);
  });

  test("rejects unsupported store versions before migration hooks are added", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-store-version-"));
    await initLocalStore(root);
    writeFileSync(
      join(root, "meta", "store.json"),
      JSON.stringify(
        {
          store_version: "0.0",
          created_at: "2026-04-25T12:00:00.000Z",
          updated_at: "2026-04-25T12:00:00.000Z",
          layout: {
            runs: "runs",
            artifacts: "artifacts",
            graphs: "graphs",
            indexes: "indexes",
            meta: "meta",
          },
          migrations: [],
        },
        null,
        2,
      ),
    );

    await expect(readLocalStoreMetadata(root)).rejects.toThrow(
      "Unsupported OpenProse store version",
    );
  });
});
