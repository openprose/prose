---
name: interactive-tutor
kind: service
---

Demonstrates how Contract Markdown handles interactive input. `### Requires` collects inputs at program start. Mid-program prompts should use `gate()` when available.

### Requires

- name: the learner's name
- topic: what they want to learn about
- level: experience level (beginner, intermediate, advanced)

### Ensures

- explanation: a personalized, engaging explanation of the topic appropriate for the learner's level, addressed by name
- if learner wants deeper dive: expanded explanation with advanced details
- if learner wants practice: 3 practice exercises at the appropriate level
- if learner is satisfied: summary of what was learned

### Strategies

- when level is beginner: use analogies and first principles
- when level is intermediate: give concise examples with documentation links
- when level is advanced: provide technical deep-dive with configuration options
