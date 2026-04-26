import {
  describe,
  expect,
  join,
  listRunAttemptRecords,
  mkdtempSync,
  renderStatusText,
  statusPath,
  test,
  tmpdir,
  updateGraphNodePointer,
  upsertRunIndexEntry,
  writeRunAttemptRecord,
} from "./support";

describe("OpenProse run attempts", () => {
  test("records failed attempts with retry and resume metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-attempts-"));

    const failed = await writeRunAttemptRecord(root, {
      runId: "run-1",
      componentRef: "writer",
      attemptNumber: 1,
      status: "failed",
      nodeSessionRef: "pi:session-1",
      startedAt: "2026-04-25T12:00:00.000Z",
      finishedAt: "2026-04-25T12:01:00.000Z",
      failure: {
        code: "provider_error",
        message: "Provider session failed before producing outputs.",
        retryable: true,
      },
      retry: {
        max_attempts: 3,
        next_attempt_after: "2026-04-25T12:02:00.000Z",
        reason: "retryable provider error",
      },
      resume: {
        checkpoint_ref: "checkpoints/run-1/attempt-1.json",
        reason: "provider returned partial transcript",
      },
    });
    const retry = await writeRunAttemptRecord(root, {
      runId: "run-1",
      componentRef: "writer",
      attemptNumber: 2,
      status: "succeeded",
      nodeSessionRef: "pi:session-2",
      startedAt: "2026-04-25T12:02:00.000Z",
      finishedAt: "2026-04-25T12:03:00.000Z",
    });

    expect(failed).toMatchObject({
      attempt_id: "run-1:attempt-1",
      status: "failed",
      failure: {
        retryable: true,
      },
      retry: {
        max_attempts: 3,
      },
      resume: {
        checkpoint_ref: "checkpoints/run-1/attempt-1.json",
      },
    });
    expect((await listRunAttemptRecords(root, "run-1")).map((attempt) => attempt.attempt_id)).toEqual([
      failed.attempt_id,
      retry.attempt_id,
    ]);
  });

  test("failed attempts do not replace current graph node pointers and appear in status", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-attempt-status-"));

    await updateGraphNodePointer(root, {
      graphId: "workflow",
      nodeId: "writer",
      componentRef: "writer",
      runId: "run-current",
      status: "succeeded",
      acceptance: "accepted",
      updatedAt: "2026-04-25T12:00:00.000Z",
    });
    const failedPointer = await updateGraphNodePointer(root, {
      graphId: "workflow",
      nodeId: "writer",
      componentRef: "writer",
      runId: "run-failed",
      status: "failed",
      acceptance: "rejected",
      updatedAt: "2026-04-25T12:05:00.000Z",
    });
    await writeRunAttemptRecord(root, {
      runId: "run-failed",
      componentRef: "writer",
      attemptNumber: 1,
      status: "failed",
      nodeSessionRef: "scripted-pi:failed",
      startedAt: "2026-04-25T12:05:00.000Z",
      finishedAt: "2026-04-25T12:06:00.000Z",
      failure: {
        code: "missing_output",
        message: "No output artifact was produced.",
        retryable: false,
      },
    });
    await upsertRunIndexEntry(root, {
      run_id: "run-failed",
      kind: "component",
      component_ref: "writer",
      status: "failed",
      acceptance: "rejected",
      created_at: "2026-04-25T12:05:00.000Z",
      completed_at: "2026-04-25T12:06:00.000Z",
      record_ref: "runs/run-failed/run.json",
    });

    expect(failedPointer).toMatchObject({
      current_run_id: "run-current",
      failed_run_id: "run-failed",
      latest_run_id: "run-failed",
    });
    const status = await statusPath(root);
    expect(status.runs[0]).toMatchObject({
      run_id: "run-failed",
      attempt_count: 1,
      latest_attempt_status: "failed",
    });
    expect(renderStatusText(status)).toContain("attempts=1 latest_attempt=failed");
  });
});
