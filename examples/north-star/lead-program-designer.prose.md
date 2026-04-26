---
name: lead-program-designer
kind: program
---

### Services

- `lead-profile-normalizer`
- `lead-qualification-scorer`
- `save-grow-program-drafter`

### Requires

- `lead_profile`: Json<LeadProfile> - raw lead record, account metadata, and known pains
- `brand_context`: Markdown<BrandContext> - positioning, target customer, and product constraints

### Ensures

- `lead_normalized_profile`: Json<NormalizedLeadProfile> - clean account profile with provenance fields
- `lead_qualification_score`: Json<QualificationScore> - fit score, confidence, and disqualifying risks
- `lead_program_plan`: Markdown<SaveGrowProgramPlan> - Save/Grow program pair tailored to the lead

### Effects

- `pure`: deterministic synthesis over caller-provided lead data

## lead-profile-normalizer

### Requires

- `lead_profile`: Json<LeadProfile> - raw lead record, account metadata, and known pains

### Ensures

- `lead_normalized_profile`: Json<NormalizedLeadProfile> - clean account profile with provenance fields

### Effects

- `pure`: normalizes only declared lead fields

## lead-qualification-scorer

### Requires

- `lead_normalized_profile`: Json<NormalizedLeadProfile> - clean account profile with provenance fields

### Ensures

- `lead_qualification_score`: Json<QualificationScore> - fit score, confidence, and disqualifying risks

### Effects

- `pure`: scores the normalized profile against declared criteria

## save-grow-program-drafter

### Requires

- `lead_normalized_profile`: Json<NormalizedLeadProfile> - clean account profile with provenance fields
- `lead_qualification_score`: Json<QualificationScore> - fit score, confidence, and disqualifying risks
- `brand_context`: Markdown<BrandContext> - positioning, target customer, and product constraints

### Ensures

- `lead_program_plan`: Markdown<SaveGrowProgramPlan> - Save/Grow program pair tailored to the lead

### Effects

- `pure`: drafts programs only from accepted upstream artifacts

