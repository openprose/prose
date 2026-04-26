import { readFileSync } from "node:fs";
import {
  describe,
  executeRemoteFile,
  expect,
  fixturePath,
  join,
  mkdtempSync,
  packagePath,
  test,
  tmpdir,
} from "./support";

const RUN_ID = "hosted-contract-success";
const FIXTURE_TIMESTAMP = "2026-04-26T00:00:00.000Z";
const LOGICAL_RUN_DIR = "fixtures/hosted-runtime/runs/hosted-contract-success";

describe("hosted runtime contract fixtures", () => {
  test("package hosted ingest metadata stays vendorable by the platform", async () => {
    const metadata = await packagePath(fixturePath("package/catalog-demo"));

    expect(metadata.hosted_ingest).toEqual(
      fixtureJson<typeof metadata.hosted_ingest>(
        "hosted-runtime/package-hosted-ingest.json",
      ),
    );
  });

  test("remote envelope, artifact manifest, run record, and plan stay compatible", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "openprose-hosted-contract-"));
    const envelope = await executeRemoteFile("fixtures/compiler/hello.prose.md", {
      outDir: join(tempRoot, "remote-runs"),
      runId: RUN_ID,
      createdAt: FIXTURE_TIMESTAMP,
      outputs: {
        message: "Hello from a hosted-compatible contract fixture.",
      },
      componentRef: "registry://openprose/@openprose/catalog-demo@0.1.0/brief-writer",
      packageMetadataPath: "package-hosted-ingest.json",
    });

    const normalizedEnvelope = {
      ...envelope,
      run_dir: LOGICAL_RUN_DIR,
    };

    expect(normalizedEnvelope).toEqual(
      fixtureJson<typeof normalizedEnvelope>(
        "hosted-runtime/remote-envelope.success.json",
      ),
    );

    expect(envelope.artifact_manifest).toEqual(
      fixtureJson<typeof envelope.artifact_manifest>(
        "hosted-runtime/artifact-manifest.success.json",
      ),
    );

    expect(readRunJson(envelope.run_dir, "run.json")).toEqual(
      fixtureJson("hosted-runtime/run-record.success.json"),
    );
    expect(readRunJson(envelope.run_dir, "plan.json")).toEqual(
      fixtureJson("hosted-runtime/plan.success.json"),
    );
  });
});

function fixtureJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(fixturePath(path), "utf8")) as T;
}

function readRunJson(runDir: string, path: string): unknown {
  return JSON.parse(readFileSync(join(runDir, path), "utf8"));
}
