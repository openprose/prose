export const pipelineOutputs = {
  review: { feedback: "Tighten the intro." },
  "fact-check": { claims: "[{\"claim\":\"All claims verified.\"}]" },
  polish: { final: "The polished draft." },
};

export const approvalReleaseOutputs = {
  "qa-check": { qa_report: "QA passed." },
  "release-note-writer": { release_summary: "Release summary." },
  "announce-release": { delivery_receipt: "Delivered to releases." },
};
