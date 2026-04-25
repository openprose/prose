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


### Effects

- `delivers`: sends content to an external delivery channel

### Errors

- delivery-failed: the email provider rejected the send request or returned a non-success status
- invalid-recipient: one or more addresses in to, cc, or bcc are malformed or undeliverable
- auth-failed: the EMAIL_API_KEY is invalid, expired, or lacks send permission
- provider-not-configured: EMAIL_PROVIDER is not set or is not a recognized value
- missing-from: neither from_email nor EMAIL_FROM_ADDRESS is set — cannot send without a sender

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

### Invariants

- the html body is sent exactly as provided — no rewriting, no stripping, no wrapping
- if reply_to is provided, the Reply-To header is always set — never silently drop it

### Strategies

- SMTP is the default and recommended provider — it works with any email service (Loops, Postmark, SendGrid, SES, Mailpit) via standard credentials
- for local development, pair with Mailpit (localhost:1025, no auth, SMTP_SECURE=false) for a local inbox UI at http://localhost:8025
- when to is a list: send a single email with all addresses in the To field — do not send separate emails per recipient
- when attachments are provided: encode as multipart MIME with the HTML body as the primary part

### SMTP implementation (primary)

When EMAIL_PROVIDER is "smtp", send the email using Python's smtplib via the Bash tool. This is the most reliable approach on Claude Code because Python's email and smtplib modules handle MIME encoding, headers, and TLS correctly.

Write a Python script to a temporary file and execute it. The script must:

1. Read the HTML body from a file (pass the path as an argument, do not inline large HTML in the command)
2. Build a proper MIME message with email.mime.multipart and email.mime.text
3. Set all headers: From, To, Cc, Bcc, Reply-To, Subject, X-Mailer, List-Unsubscribe
4. Connect via smtplib.SMTP (or SMTP_SSL if SMTP_SECURE is true and port is 465)
5. Call starttls() if SMTP_SECURE is true and port is not 465
6. Authenticate with SMTP_USER/SMTP_PASS if provided (skip auth for Mailpit)
7. Send and return the message ID

Here is the reference implementation. Use this as the template — adapt only the variable values:

```python
#!/usr/bin/env python3
import smtplib, sys, os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# Read HTML body from file
html_path = sys.argv[1]
with open(html_path, 'r') as f:
    html_body = f.read()

# Build message
msg = MIMEMultipart('alternative')
msg['From'] = f"{os.environ.get('EMAIL_FROM_NAME', 'OpenProse')} <{os.environ.get('EMAIL_FROM_ADDRESS', 'noreply@openprose.ai')}>"
msg['To'] = sys.argv[2]          # recipient email
msg['Subject'] = sys.argv[3]     # subject line
if os.environ.get('REPLY_TO'):
    msg['Reply-To'] = os.environ['REPLY_TO']
if os.environ.get('CC'):
    msg['Cc'] = os.environ['CC']
msg['X-Mailer'] = 'OpenProse/1.0'

# Attach HTML part
msg.attach(MIMEText(html_body, 'html', 'utf-8'))

# Send
host = os.environ.get('SMTP_HOST', 'localhost')
port = int(os.environ.get('SMTP_PORT', '587'))
secure = os.environ.get('SMTP_SECURE', 'true').lower() == 'true'
user = os.environ.get('SMTP_USER', '')
password = os.environ.get('SMTP_PASS', '')

if secure and port == 465:
    server = smtplib.SMTP_SSL(host, port)
else:
    server = smtplib.SMTP(host, port)
    if secure:
        server.starttls()

if user and password:
    server.login(user, password)

recipients = [msg['To']]
if msg.get('Cc'):
    recipients += [a.strip() for a in msg['Cc'].split(',')]
if os.environ.get('BCC'):
    recipients += [a.strip() for a in os.environ['BCC'].split(',')]

server.sendmail(msg['From'], recipients, msg.as_string())
server.quit()
print(f"Sent to {msg['To']} via {host}:{port}")
```

To use this: write the HTML to a temp file, write the script to a temp file, then run:
```bash
python3 /tmp/send_email.py /tmp/email_body.html "remi@aicepower.com" "⚡ AICE Daily Brief — 3 anomalies, est. €247/day"
```

### API-based providers (alternative)

When EMAIL_PROVIDER is "resend": POST to https://api.resend.com/emails with header "Authorization: Bearer $EMAIL_API_KEY" and JSON body {"from": "...", "to": "...", "subject": "...", "html": "..."}

When EMAIL_PROVIDER is "sendgrid": POST to https://api.sendgrid.com/v3/mail/send with header "Authorization: Bearer $EMAIL_API_KEY"

When EMAIL_PROVIDER is "postmark": POST to https://api.postmarkapp.com/email with header "X-Postmark-Server-Token: $EMAIL_API_KEY"

For API providers, use curl via the Bash tool. Read the HTML body from a file and pass it in the JSON payload (escape properly for JSON).

### Common rules

- always set Reply-To if reply_to is provided — this is how customers give feedback, never silently drop it
- always set X-Mailer: OpenProse/1.0
- the html body must be sent exactly as provided — no rewriting, no stripping, no wrapping in additional markup
- if the send fails, return the error message from the server — do not retry automatically, let the caller decide
