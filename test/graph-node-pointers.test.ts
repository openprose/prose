import {
  describe,
  expect,
  join,
  listGraphNodePointers,
  mkdtempSync,
  readGraphNodePointer,
  renderStatusText,
  statusPath,
  test,
  tmpdir,
  updateGraphNodePointer,
  upsertRunIndexEntry,
} from "./support";

describe("OpenProse graph node pointers", () => {
  test("tracks current, latest, failed, and pending run pointers", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-pointers-"));

    const accepted = await updateGraphNodePointer(root, {
      graphId: "workflow",
      nodeId: "writer",
      componentRef: "writer",
      runId: "run-accepted",
      status: "succeeded",
      acceptance: "accepted",
      updatedAt: "2026-04-25T12:00:00.000Z",
    });
    const failed = await updateGraphNodePointer(root, {
      graphId: "workflow",
      nodeId: "writer",
      componentRef: "writer",
      runId: "run-failed",
      status: "failed",
      acceptance: "rejected",
      updatedAt: "2026-04-25T12:05:00.000Z",
    });
    const pending = await updateGraphNodePointer(root, {
      graphId: "workflow",
      nodeId: "writer",
      componentRef: "writer",
      runId: "run-pending",
      status: "blocked",
      acceptance: "pending",
      updatedAt: "2026-04-25T12:10:00.000Z",
    });

    expect(accepted).toMatchObject({
      current_run_id: "run-accepted",
      latest_run_id: "run-accepted",
    });
    expect(failed).toMatchObject({
      current_run_id: "run-accepted",
      latest_run_id: "run-failed",
      failed_run_id: "run-failed",
    });
    expect(pending).toMatchObject({
      current_run_id: "run-accepted",
      latest_run_id: "run-pending",
      failed_run_id: "run-failed",
      pending_run_id: "run-pending",
    });
    expect(await readGraphNodePointer(root, "workflow", "writer")).toEqual(pending);
  });

  test("lists pointers for a graph and reads status from a store root", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-store-status-"));
    await updateGraphNodePointer(root, {
      graphId: "workflow",
      nodeId: "writer",
      componentRef: "writer",
      runId: "run-1",
      status: "succeeded",
      acceptance: "accepted",
      updatedAt: "2026-04-25T12:00:00.000Z",
    });
    await updateGraphNodePointer(root, {
      graphId: "workflow",
      nodeId: "reviewer",
      componentRef: "reviewer",
      runId: "run-2",
      status: "blocked",
      acceptance: "pending",
      updatedAt: "2026-04-25T12:05:00.000Z",
    });
    await upsertRunIndexEntry(root, {
      run_id: "run-1",
      kind: "component",
      component_ref: "writer",
      status: "succeeded",
      acceptance: "accepted",
      created_at: "2026-04-25T12:00:00.000Z",
      completed_at: "2026-04-25T12:01:00.000Z",
      record_ref: "runs/run-1/run.json",
    });

    expect((await listGraphNodePointers(root, "workflow")).map((pointer) => pointer.node_id)).toEqual([
      "reviewer",
      "writer",
    ]);

    const status = await statusPath(root);
    expect(status.runs.map((run) => [run.run_id, run.status, run.run_dir])).toEqual([
      ["run-1", "succeeded", `${root}/runs/run-1/run.json`],
    ]);
    expect(renderStatusText(status)).toContain("run-1: writer [component] succeeded");
  });
});
