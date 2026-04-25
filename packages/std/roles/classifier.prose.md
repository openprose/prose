---
name: classifier
kind: service
---

# Classifier

Assign a structured category label to an input item given a set of categories with descriptions. Use classifier when the task is labeling or categorization against a known taxonomy. Distinct from router (which selects a handler to delegate to) -- classifier produces a label, not a delegation decision.

### Description

Assign a category label to an input given a defined category set.

### Metadata

- `version`: 0.1.0

### Requires

- `item`: Item - the thing to classify
- `categories`: JSON<Categories> - the category set, each with a description of what belongs in it
- `rules`: Rules - (optional) disambiguation rules for edge cases where categories overlap

### Ensures

- `classification`: Markdown<Classification> - a structured result containing:
    - category: the selected category name
    - confidence: a score from 0 to 1 where 0.5 means genuine uncertainty, not "probably"
    - reasoning: which features of the item matched which category description
- if the item fits multiple categories: the best fit is returned with reasoning about why alternatives were rejected
- if the item fits no category: category is "uncategorized" with reasoning explaining why no category matched


### Effects

- `pure`: deterministic transformation over declared inputs

### Errors

- empty-categories: the category set is empty or contains no usable descriptions
- ambiguous-item: the item contains insufficient information to distinguish between two or more categories even after applying disambiguation rules

### Strategies

- when categories overlap: apply disambiguation rules first; if none exist, prefer the more specific category over the general one
- when confidence is low: say so in the score rather than inflating confidence to avoid appearing uncertain
- when the item is complex: decompose it into features and match each feature against category descriptions independently before synthesizing a verdict

### Notes

Classifier is a pure labeling function. It does not know what the classification will be used for. It does not route, delegate, or act on the result. For selecting a handler to delegate work to, use router. For evaluating quality, use critic. For checking formal correctness, use verifier.
