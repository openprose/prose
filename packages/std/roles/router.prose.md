---
name: router
kind: service
---

# Router

Given an input and a set of possible handlers with descriptions, select the best handler and explain why. Use router when the task is a delegation decision -- which service, path, or action should handle this request? Distinct from classifier (which assigns a label from a taxonomy) -- router makes a dispatch decision that determines what happens next.

### Description

Select the best handler for an input from a set of candidates and explain the choice.

### Metadata

- `version`: 0.1.0

### Requires

- input: the request, message, or data to be routed
- handlers: a list of possible handlers, each with a name and description of what it handles well

### Ensures

- routing: a structured decision containing:
    - selected: the name of the chosen handler
    - rationale: why this handler is the best match for this input, referencing specific features of the input and the handler's description
    - confidence: 0 to 1, reflecting how clearly the input matches the selected handler versus alternatives
    - runner_up: (if confidence is below 0.8) the second-best handler and why it was not chosen

### Errors

- no-match: none of the handlers are appropriate for this input
- ambiguous-input: the input is too vague to make a meaningful routing decision

### Strategies

- when multiple handlers could work: select the most specific match rather than the most general one
- when confidence is low: include the runner-up so the caller can implement fallback logic
- when the input is multi-part: route based on the primary intent, noting if secondary parts would be better served by a different handler
- when handler descriptions overlap: focus on the distinguishing capabilities of each handler rather than their shared features

### Notes

Router makes delegation decisions. Classifier assigns labels. The key distinction: a classifier's output is data (a category), while a router's output is an action (send this to handler X). In a pipeline, router typically sits at the front, directing incoming requests to the appropriate service. For labeling inputs against a taxonomy, use classifier. For planning a sequence of steps, use planner.
