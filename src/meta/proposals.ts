import { stableStringify } from "../hash.js";
import type {
  MetaOperationProposalIR,
  MetaOperationProposalPayloadIR,
} from "../types.js";

export function normalizeMetaProposal(
  proposal: MetaOperationProposalIR,
): MetaOperationProposalIR {
  return {
    ...proposal,
    evidence: [...proposal.evidence].sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) ||
        a.ref.localeCompare(b.ref) ||
        a.summary.localeCompare(b.summary),
    ),
    payload: normalizeProposalPayload(proposal.payload),
  };
}

export function normalizeMetaProposals(
  proposals: MetaOperationProposalIR[],
): MetaOperationProposalIR[] {
  return proposals
    .map(normalizeMetaProposal)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function acceptedMetaProposals(
  proposals: MetaOperationProposalIR[],
): MetaOperationProposalIR[] {
  return normalizeMetaProposals(proposals).filter(
    (proposal) => proposal.state === "accepted",
  );
}

export function serializeMetaProposals(proposals: MetaOperationProposalIR[]): string {
  return `${stableStringify(normalizeMetaProposals(proposals))}\n`;
}

export function deserializeMetaProposals(source: string): MetaOperationProposalIR[] {
  const parsed = JSON.parse(source) as MetaOperationProposalIR[];
  if (!Array.isArray(parsed)) {
    throw new Error("Meta proposal file must contain a JSON array.");
  }
  return normalizeMetaProposals(parsed);
}

export function metaProposalSemanticProjection(
  proposal: MetaOperationProposalIR,
): unknown {
  return {
    proposal_version: proposal.proposal_version,
    id: proposal.id,
    kind: proposal.kind,
    state: proposal.state,
    title: proposal.title,
    rationale: proposal.rationale,
    evidence: proposal.evidence,
    payload: proposal.payload,
    decision: proposal.decision,
  };
}

function normalizeProposalPayload(
  payload: MetaOperationProposalPayloadIR,
): MetaOperationProposalPayloadIR {
  if (payload.kind !== "eval_generation") {
    return payload;
  }
  return {
    ...payload,
    criteria: [...payload.criteria].sort(),
  };
}
