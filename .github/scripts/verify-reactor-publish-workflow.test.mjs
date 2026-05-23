import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const WORKFLOW_PATH = '.github/workflows/ci-reactor-package.yml';
const PUBLISH_WORKFLOW_TEST_PATH =
  '.github/scripts/verify-reactor-publish-workflow.test.mjs';

test('reactor package workflow runs publish path only for reactor-v* tags', async () => {
  const source = await readWorkflow();
  const publishJob = extractJob(source, 'publish');

  assert.match(
    source,
    /push:\n    branches: \[main]\n    tags:\n      - "reactor-v\*"/,
    'workflow must subscribe to reactor-v* tag pushes',
  );
  assert.match(
    publishJob,
    /needs: ci/,
    'publish job must wait for the package test, pack, and smoke job',
  );
  assert.match(
    publishJob,
    /if: \$\{\{ startsWith\(github\.ref, 'refs\/tags\/reactor-v'\) \}\}/,
    'publish job must be gated to reactor-v* tags',
  );
  assert.match(
    publishJob,
    /id-token: write/,
    'publish job must request OIDC id-token permission for npm provenance',
  );
  assert.doesNotMatch(
    extractJob(source, 'ci'),
    /npm publish/,
    'ordinary CI job must not publish packages',
  );
});

test('reactor package workflow publishes both smoked tarballs with provenance', async () => {
  const source = await readWorkflow();
  const publishJob = extractJob(source, 'publish');

  assertInOrder(
    source,
    'Smoke release readiness example',
    'Upload Reactor package artifact',
  );
  assertInOrder(
    source,
    'Smoke release readiness example',
    'Upload Cradle package artifact',
  );
  assertInOrder(source, 'Upload Reactor package artifact', 'publish:');
  assertInOrder(source, 'Upload Cradle package artifact', 'publish:');

  assert.match(
    publishJob,
    /actions\/download-artifact@v4/,
    'publish job must download the CI-produced tarball artifacts',
  );
  assert.match(
    publishJob,
    /openprose-reactor-tarball/,
    'publish job must consume the Reactor tarball artifact',
  );
  assert.match(
    publishJob,
    /openprose-reactor-cradle-tarball/,
    'publish job must consume the Cradle tarball artifact',
  );
  assert.match(
    publishJob,
    /expected_version="\$\{GITHUB_REF_NAME#reactor-v\}"/,
    'publish job must derive the expected package version from the pushed tag',
  );
  assert.match(
    publishJob,
    /dist_tag="\$\{prerelease%%\.\*\}"/,
    'publish job must publish prerelease tags under their prerelease dist-tag',
  );
  assert.equal(
    countMatches(publishJob, /package_version="\$\(tar -xOf/g),
    2,
    'publish job must inspect both tarball package versions before publishing',
  );
  assert.equal(
    countMatches(publishJob, /does not match tag version/g),
    2,
    'publish job must fail when tarball package versions do not match the tag',
  );
  assert.match(
    publishJob,
    /find "\$\{RUNNER_TEMP\}\/openprose-reactor-publish\/reactor" -maxdepth 1 -name "openprose-reactor-\*\.tgz"/,
    'publish job must publish the packed Reactor tarball, not a local directory',
  );
  assert.match(
    publishJob,
    /find "\$\{RUNNER_TEMP\}\/openprose-reactor-publish\/cradle" -maxdepth 1 -name "openprose-reactor-cradle-\*\.tgz"/,
    'publish job must publish the packed Cradle tarball, not a local directory',
  );
  assert.equal(
    countMatches(
      publishJob,
      /npm publish "\$\{[^}]+_tarball\}" --access public --tag "\$\{\{ steps\.publish_meta\.outputs\.dist_tag \}\}" --provenance/g,
    ),
    2,
    'publish job must publish both packages with npm provenance and the resolved dist-tag',
  );
  assert.doesNotMatch(
    publishJob,
    /NPM_TOKEN|_authToken/,
    'publish job must rely on npm trusted publishing/OIDC without token fallback',
  );
  assertInOrder(publishJob, 'Publish Reactor package', 'Publish Cradle package');
  assert.doesNotMatch(
    publishJob,
    /--dry-run/,
    'tagged publish path must be the real publish path; local tests only scan it',
  );
});

test('reactor package workflow runs this verifier when the gate changes', async () => {
  const source = await readWorkflow();

  assert.match(
    source,
    new RegExp(escapeRegExp(`- "${PUBLISH_WORKFLOW_TEST_PATH}"`)),
    'pull_request paths must include the publish workflow verifier',
  );
  assert.equal(
    countMatches(source, new RegExp(escapeRegExp(PUBLISH_WORKFLOW_TEST_PATH), 'g')),
    2,
    'release-gate verifier test command must include the publish workflow verifier',
  );
});

async function readWorkflow() {
  return readFile(WORKFLOW_PATH, 'utf8');
}

function extractJob(source, jobName) {
  const startMarker = `\n  ${jobName}:\n`;
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `workflow job ${jobName} must exist`);

  const afterStart = start + startMarker.length;
  const nextJobMatch = /\n  [A-Za-z0-9_-]+:\n/.exec(source.slice(afterStart));
  const end = nextJobMatch
    ? afterStart + nextJobMatch.index
    : source.length;

  return source.slice(start, end);
}

function assertInOrder(source, earlier, later) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);

  assert.notEqual(earlierIndex, -1, `missing ${earlier}`);
  assert.notEqual(laterIndex, -1, `missing ${later}`);
  assert.ok(
    earlierIndex < laterIndex,
    `${earlier} must appear before ${later}`,
  );
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
