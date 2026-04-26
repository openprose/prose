---
name: email-notifier
kind: service
---

### Shape

- `self`: send an HTML email via a configured email provider
- `delegates`: none
- `prohibited`: modifying content substance — you deliver, you do not edit

### Requires

- `html`: Html - rendered HTML email body, ready to send
- `to`: string - recipient email address, or list of addresses
- `subject`: string - email subject line
- `cc`: string - (optional) additional recipients to copy — address or list of addresses
- `bcc`: string - (optional) additional recipients to blind copy — address or list of addresses
- `from_name`: string - (optional, default from EMAIL_FROM_NAME) display name for the sender
- `from_email`: string - (optional, default from EMAIL_FROM_ADDRESS) sender email address
- `reply_to`: string - (optional) reply-to address — this is how recipients give feedback, always set it when provided
- `attachments`: JSON<Attachments> - (optional) list of attachments, each with filename, content (base64), and mime_type

### Ensures

- `sent`: boolean - confirmation with message ID and timestamp
- `provider`: Markdown<Provider> - which email provider handled the send


### Environment

- EMAIL_PROVIDER: which provider to use — one of "resend", "sendgrid", "postmark", "ses", "smtp"
- EMAIL_API_KEY: API key for the provider (required for resend, sendgrid, postmark)
- EMAIL_FROM_ADDRESS: default sender email address
- EMAIL_FROM_NAME: default sender display name
- SMTP_HOST: (required for smtp provider) SMTP server hostname
- SMTP_PORT: (optional, default 587) SMTP server port
- SMTP_USER: (required for smtp provider) SMTP username
- SMTP_PASS: (required for smtp provider) SMTP password
- SMTP_SECURE: (optional, default "true") use TLS — set to "false" for local dev with Mailpit

### Effects

- `delivers`: sends content to an external delivery channel

### Errors

- delivery-failed: the email provider rejected the send request or returned a non-success status
- invalid-recipient: one or more addresses in to, cc, or bcc are malformed or undeliverable
- auth-failed: the EMAIL_API_KEY is invalid, expired, or lacks send permission
- provider-not-configured: EMAIL_PROVIDER is not set or is not a recognized value
- missing-from: neither from_email nor EMAIL_FROM_ADDRESS is set — cannot send without a sender

### Invariants

- the html body is sent exactly as provided — no rewriting, no stripping, no wrapping
- if reply_to is provided, the Reply-To header is always set — never silently drop it

### Strategies

- SMTP is the default and recommended provider — it works with any email service (Loops, Postmark, SendGrid, SES, Mailpit) via standard credentials
- for local development, pair with Mailpit (localhost:1025, no auth, SMTP_SECURE=false) for a local inbox UI at http://localhost:8025
- when to is a list: send a single email with all addresses in the To field — do not send separate emails per recipient
- when attachments are provided: encode as multipart MIME with the HTML body as the primary part

### Provider Requirements

- smtp: send a standards-compliant MIME email using SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and SMTP_PASS
- resend: call the Resend email API with EMAIL_API_KEY
- sendgrid: call the SendGrid mail API with EMAIL_API_KEY
- postmark: call the Postmark email API with EMAIL_API_KEY
- ses: send through AWS SES using the configured AWS credentials
- every provider returns a stable message id or delivery receipt when the provider exposes one
- every provider maps provider errors into delivery-failed, invalid-recipient, auth-failed, provider-not-configured, or missing-from

### Common rules

- always set Reply-To if reply_to is provided — this is how customers give feedback, never silently drop it
- always set X-Mailer: OpenProse/1.0
- the html body must be sent exactly as provided — no rewriting, no stripping, no wrapping in additional markup
- if the send fails, return the error message from the server — do not retry automatically, let the caller decide
- never include EMAIL_API_KEY, SMTP_PASS, or provider credentials in the receipt, report, trace output, or error text
