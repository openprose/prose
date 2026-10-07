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
- destination: file path or URI — local path, s3:// URI, or gs:// URI; it must be within the configured output root or an explicitly allowlisted bucket
- format: (optional, default "md") output format — one of "md", "json", "csv", "html"

### Returns

- written_path: the resolved path or URI where the file was written
- bytes_written: the size of the written file in bytes

On return, the file exists at `written_path` holding `content` serialized in the requested format, and `bytes_written` equals the size of that written file in bytes.

### Errors

- write-failed: the write operation failed (disk full, network error, service unavailable)
- path-not-found: the parent directory or bucket does not exist
- permission-denied: insufficient permissions to write to the destination

### Environment

- AWS_ACCESS_KEY_ID: (optional) required for S3 destinations
- AWS_SECRET_ACCESS_KEY: (optional) required for S3 destinations
- GOOGLE_APPLICATION_CREDENTIALS: (optional) required for GCS destinations
- OPENPROSE_OUTPUT_ROOT: (required for local destinations) the canonical directory under which writes are permitted
- OPENPROSE_ALLOWED_BUCKETS: (required for cloud destinations) a comma-separated allowlist of destination buckets

### Invariants

- content is serialized faithfully in the requested format — no fields added, removed, or transformed beyond format encoding
- if the destination already exists, it is overwritten (not appended)
- local destinations are canonicalized and must remain under `OPENPROSE_OUTPUT_ROOT`; absolute paths outside that root, `..` traversal, and symlink escapes are rejected
- cloud destinations must use an allowlisted bucket and a normalized object key; bucket names, credentials, and credential-file contents are never written to logs or returned as error details
- credentials are read by the storage client from the named environment variables only; raw credential values are never passed through prompts, bindings, or artifacts

### Strategies

- when format is "json": serialize the content as formatted JSON
- when format is "csv": serialize the content as CSV with headers derived from the data structure
- when format is "html": write the content as an HTML document
- when format is "md": write the content as Markdown
- when destination is an S3 URI: use AWS SDK or CLI to upload
- when destination is a GCS URI: use Google Cloud SDK or CLI to upload
- when destination is a local path: write directly to the filesystem
- when the destination fails canonicalization, escapes the output root, or names a non-allowlisted bucket: signal permission-denied before writing
- when a cloud upload follows a redirect to a different host: fail rather than forwarding credentials
