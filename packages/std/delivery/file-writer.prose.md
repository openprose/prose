---
name: file-writer
kind: function
version: 0.15.0
---

### Shape

- `self`:
  - write content to a file at a local
  - S3
  - or GCS destination
- `delegates`: none
- `prohibited`:
  - modifying the content substance — you serialize and write
  - you do not edit

### Parameters

- content: structured output to write
- destination: file path or URI — local path, s3:// URI, or gs:// URI
- format: (optional, default "md") output format — one of "md", "json", "csv", "html"

### Returns

- written_path: the resolved path or URI where the file was written
- bytes_written: the size of the written file in bytes

On return, the file exists at `written_path` holding `content` serialized in the requested format, and `bytes_written` equals the size of that written file in bytes.

### Errors

- write-failed: the write operation failed (disk full, network error, service unavailable)
- path-not-found: the parent directory or bucket does not exist
- permission-denied: insufficient permissions to write to the destination
- destination-not-allowed: the destination is outside the caller-approved workspace or bucket allowlist, or a local path escapes its root after canonicalization
- insecure-destination: the destination uses an unapproved scheme, endpoint, or transport

### Environment

- AWS_ACCESS_KEY_ID: (optional) required for S3 destinations
- AWS_SECRET_ACCESS_KEY: (optional) required for S3 destinations
- GOOGLE_APPLICATION_CREDENTIALS: (optional) required for GCS destinations

### Invariants

- content is serialized faithfully in the requested format — no fields added, removed, or transformed beyond format encoding
- if the destination already exists, it is overwritten (not appended)
- local destinations are confined to an explicitly caller-approved root after canonicalization; absolute paths, `..` traversal, NUL bytes, and symlink escapes are rejected
- S3 and GCS destinations are confined to an explicitly caller-approved bucket and prefix and use the provider's authenticated TLS transport; credentials never come from the destination URI or content
- destination policy is evaluated before any parent creation, network connection, or overwrite

### Strategies

- when format is "json": serialize the content as formatted JSON
- when format is "csv": serialize the content as CSV with headers derived from the data structure
- when format is "html": write the content as an HTML document
- when format is "md": write the content as Markdown
- when destination is an S3 URI: use AWS SDK or CLI to upload
- when destination is a GCS URI: use Google Cloud SDK or CLI to upload
- when destination is a local path: canonicalize the path without following an escape outside the approved root, then write directly to the filesystem only after the containment check
- when the destination is missing an approval root, bucket, or prefix: signal `destination-not-allowed`; never infer permission from the path or create a new trust boundary
