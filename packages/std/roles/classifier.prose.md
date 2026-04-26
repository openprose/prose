---
name: classifier
kind: service
---

# Classifier

Assign one category from a declared taxonomy. Use this role when the output is a
label and explanation, not a delegation decision.

### Requires

- `item`: Markdown<Item> - item, message, record, or observation to classify
- `categories`: Json<CategorySet> - allowed categories with names, descriptions, and optional examples
- `rules`: Markdown<ClassificationRules> - optional tie-breakers or edge-case rules

### Ensures

- `classification`: Json<Classification> - selected category, confidence, matched evidence, rejected alternatives, and uncertainty notes

### Effects

- `pure`: deterministic classification over declared inputs

### Execution

```prose
Validate that categories is non-empty.
Extract the features of item that matter for category membership.
Compare those features against every category description before choosing.
Apply rules when categories overlap.
Return "uncategorized" when no category fits instead of forcing a weak match.
Set confidence to reflect real uncertainty; do not inflate confidence for polish.
Return classification.
```
