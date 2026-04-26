import {
  describe,
  expect,
  join,
  listArtifactRecordsByHash,
  listArtifactRecordsForRun,
  mkdtempSync,
  readArtifactRecordForOutput,
  readLocalArtifactContent,
  readLocalArtifactRecord,
  test,
  tmpdir,
  writeLocalArtifactRecord,
} from "./support";

describe("OpenProse local artifact records", () => {
  test("writes content-addressed artifact records with provenance", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-artifacts-"));
    const record = await writeLocalArtifactRecord(root, {
      runId: "run-1",
      nodeId: "writer",
      port: "brief",
      direction: "output",
      content: "A durable brief.\n",
      contentType: "text/markdown",
      policyLabels: ["company_private.accounts", "admin"],
      schema: {
        status: "valid",
        schema_ref: "schemas/brief.schema.json",
      },
      createdAt: "2026-04-25T12:00:00.000Z",
    });

    expect(record).toMatchObject({
      artifact_record_version: "0.1",
      content_type: "text/markdown",
      size_bytes: 17,
      policy_labels: ["admin", "company_private.accounts"],
      provenance: {
        run_id: "run-1",
        node_id: "writer",
        port: "brief",
        direction: "output",
      },
      schema: {
        status: "valid",
        schema_ref: "schemas/brief.schema.json",
      },
      storage: {
        backend: "local",
      },
    });
    expect(record.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await readLocalArtifactContent(root, record)).toBe("A durable brief.\n");
    expect(await readLocalArtifactRecord(root, record)).toEqual(record);
  });

  test("indexes artifacts by run, output, and content hash", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-artifact-index-"));
    const first = await writeLocalArtifactRecord(root, {
      runId: "run-1",
      nodeId: "writer",
      port: "brief",
      direction: "output",
      content: "Same content",
      contentType: "text/plain",
      createdAt: "2026-04-25T12:00:00.000Z",
    });
    const second = await writeLocalArtifactRecord(root, {
      runId: "run-2",
      nodeId: "reviewer",
      port: "brief",
      direction: "output",
      content: "Same content",
      contentType: "text/plain",
      createdAt: "2026-04-25T12:05:00.000Z",
    });

    expect((await listArtifactRecordsForRun(root, "run-1")).map((record) => record.artifact_id)).toEqual([
      first.artifact_id,
    ]);
    expect(
      (await listArtifactRecordsByHash(root, first.content_hash)).map(
        (record) => record.artifact_id,
      ),
    ).toEqual([second.artifact_id, first.artifact_id].sort());
    expect(
      (await readArtifactRecordForOutput(root, "run-2", "reviewer", "brief"))
        ?.artifact_id,
    ).toBe(second.artifact_id);
  });
});
