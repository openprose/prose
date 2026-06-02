---
name: slack-notifier
kind: function
---

### Shape

- `self`:
  - format content for Slack
  - deliver via webhook or API
- `delegates`: none
- `prohibited`:
  - modifying the content substance — you format and deliver
  - you do not edit research or analysis

### Parameters

- content: structured output to deliver
- channel: Slack channel name
- format: (optional, default "summary+attachment") one of "summary+attachment", "full", "alert"

### Returns

Returns the delivery confirmation. `delivered` carries the confirmation with timestamp and permalink, and `attachment_url` links to the uploaded file — present only when format is "summary+attachment". The returned value postcondition: a successful return means the content was posted to the named channel and `delivered` reflects the actual Slack timestamp and permalink.

### Errors

- webhook-failed: the Slack webhook returned a non-2xx status or was unreachable
- channel-not-found: the specified channel does not exist or the bot lacks permission to post there

### Environment

- SLACK_WEBHOOK_URL: webhook for posting messages
- SLACK_BOT_TOKEN: (required for "summary+attachment" format which uploads files via the Slack API; optional for "full" and "alert" which use webhook only)

### Strategies

- when format is "summary+attachment": post a concise summary in the message body and attach the full content as a file (requires SLACK_BOT_TOKEN for file upload)
- when format is "full": post the entire content inline via webhook
- when format is "alert": post a short notification with a link to the full content via webhook
