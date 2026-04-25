export {
  acceptedMetaProposals,
  deserializeMetaProposals,
  metaProposalSemanticProjection,
  normalizeMetaProposal,
  normalizeMetaProposals,
  serializeMetaProposals,
} from "./proposals.js";
export type {
  MetaContractRepairProposalPayloadIR,
  MetaEvalGenerationProposalPayloadIR,
  MetaFailureDiagnosisProposalPayloadIR,
  MetaMissingMetadataProposalPayloadIR,
  MetaOperationDecisionIR,
  MetaOperationEvidenceIR,
  MetaOperationKindIR,
  MetaOperationProposalIR,
  MetaOperationProposalPayloadIR,
  MetaOperationProposalStateIR,
  MetaWiringProposalPayloadIR,
} from "../types.js";
