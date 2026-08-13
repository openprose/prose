---
name: daily-delivery
kind: program
services: [research, human-gate, notifier]
use:
  - std/delivery/human-gate
  - std/delivery/slack-notifier
---

# Daily Delivery

Run research, gate for review, deliver to Slack.

## Contract

requires:
- target: the subject to research
- gate_level: (optional, default "external") review level

environment:
- SLACK_WEBHOOK_URL: provided by the runtime
- SLACK_BOT_TOKEN: provided by the runtime

ensures:
- report: the research output
- delivered: confirmation of Slack delivery

### Execution

let report = call research
  target: target

let review = call human-gate
  content: report
  gate_level: gate_level

if review.approved:
  call notifier
    content: report
    channel: "#updates"
