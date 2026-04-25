import {
  compilePackagePath,
  describe,
  expect,
  fixturePath,
  test,
} from "./support";
import {
  acceptedMetaProposals,
  deserializeMetaProposals,
  serializeMetaProposals,
} from "../src/meta/proposals";
import type { MetaOperationProposalIR } from "../src/types";

function wiringProposal(state: MetaOperationProposalIR["state"]): MetaOperationProposalIR {
  return {
    proposal_version: "0.1",
    id: "wire-findings-to-source-material",
    kind: "intelligent_wiring",
    state,
    title: "Wire researcher findings into writer source material",
    rationale:
      "The writer asks for source material and the researcher produces findings with a compatible shape.",
    created_by: "agent",
    created_at: "2026-04-25T00:00:00.000Z",
    evidence: [
      {
        kind: "port",
        ref: "program.prose.md#writer.source_material",
        summary: "Writer requires source material.",
      },
      {
        kind: "port",
        ref: "program.prose.md#researcher.findings",
        summary: "Researcher ensures findings.",
      },
    ],
    decision:
      state === "accepted"
        ? {
            decided_by: "test",
            decided_at: "2026-04-25T00:01:00.000Z",
            reason: "Accepted for deterministic graph normalization.",
          }
        : null,
    payload: {
      kind: "graph_wiring",
      edge: {
        from: {
          component: "program--researcher",
          port: "findings",
        },
        to: {
          component: "program--writer",
          port: "source_material",
        },
        kind: "semantic",
        confidence: 0.86,
        reason: "findings can satisfy source_material",
        source: "wiring",
      },
    },
  };
}

describe("OpenProse meta-operation proposals", () => {
  test("serializes proposals durably and filters accepted state", () => {
    const proposals = [
      wiringProposal("pending"),
      {
        ...wiringProposal("accepted"),
        id: "accepted-wire-findings-to-source-material",
      },
      {
        ...wiringProposal("rejected"),
        id: "rejected-wire-findings-to-source-material",
      },
    ];
    const serialized = serializeMetaProposals(proposals);
    const parsed = deserializeMetaProposals(serialized);

    expect(parsed.map((proposal) => proposal.id)).toEqual([
      "accepted-wire-findings-to-source-material",
      "rejected-wire-findings-to-source-material",
      "wire-findings-to-source-material",
    ]);
    expect(acceptedMetaProposals(parsed).map((proposal) => proposal.id)).toEqual([
      "accepted-wire-findings-to-source-material",
    ]);
  });

  test("accepted wiring proposals deterministically change package graph normalization", async () => {
    const root = fixturePath("package-ir/meta-proposals");
    const pending = await compilePackagePath(root, {
      proposals: [wiringProposal("pending")],
    });
    const accepted = await compilePackagePath(root, {
      proposals: [wiringProposal("accepted")],
    });

    expect(pending.meta.accepted_proposals).toEqual([]);
    expect(
      pending.graph.edges.some(
        (edge) =>
          edge.from.component === "program--researcher" &&
          edge.from.port === "findings" &&
          edge.to.component === "program--writer" &&
          edge.to.port === "source_material",
      ),
    ).toBe(false);
    expect(accepted.meta.accepted_proposals.map((proposal) => proposal.id)).toEqual([
      "wire-findings-to-source-material",
    ]);
    expect(
      accepted.graph.edges.some(
        (edge) =>
          edge.kind === "semantic" &&
          edge.source === "wiring" &&
          edge.from.component === "program--researcher" &&
          edge.from.port === "findings" &&
          edge.to.component === "program--writer" &&
          edge.to.port === "source_material",
      ),
    ).toBe(true);
    expect(accepted.semantic_hash).not.toBe(pending.semantic_hash);
  });
});
