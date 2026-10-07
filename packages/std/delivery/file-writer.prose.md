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
- destination: file path or URI — local path, s3:// URI, or gs:// URI. The
  destination is untrusted input and must be within the caller-authorized
  output root or cloud bucket allowlist.
- format: (optional, default "md") output format — one of "md", "json", "csv", "html"
- allowed_destinations: (optional) exact local roots and bucket URIs permitted
  for this write; without an explicit cloud allowlist, cloud destinations are
  rejected

### Returns

- written_path: the resolved path or URI where the file was written
- bytes_written: the size of the written file in bytes

On return, the file exists at `written_path` holding `content` serialized in the requested format, and `bytes_written` equals the size of that written file in bytes.

### Errors

- write-failed: the write operation failed (disk full, network error, service unavailable)
- path-not-found: the parent directory or bucket does not exist
- permission-denied: insufficient permissions to write to the destination
- destination-rejected: the destination escapes the authorized local root,
  traverses a symlink, contains embedded credentials, or names a cloud bucket
  not present in the caller's allowlist

### Environment

- AWS_ACCESS_KEY_ID: (optional) required for S3 destinations
- AWS_SECRET_ACCESS_KEY: (optional) required for S3 destinations
- GOOGLE_APPLICATION_CREDENTIALS: (optional) required for GCS destinations

### Invariants

- content is serialized faithfully in the requested format — no fields added, removed, or transformed beyond format encoding
- if the destination already exists, it is overwritten (not appended)
- local writes stay beneath an authorized output root after canonicalization;
  reject `..`, absolute paths outside that root, symlink escapes, device files,
  and special files
- cloud writes use provider SDKs over TLS with credentials read only from the
  declared environment configuration; never accept credentials in the URI,
  invoke a shell with interpolated content, or print credential material

### Strategies

- when format is "json": serialize the content as formatted JSON
- when format is "csv": serialize the content as CSV with headers derived from the data structure
- when format is "html": write the content as an HTML document
- when format is "md": write the content as Markdown
- when destination is an S3 URI: use the AWS SDK (or a fixed-argument CLI
  invocation with no interpolated content) to upload
- when destination is a GCS URI: use the Google Cloud SDK (or a fixed-argument
  CLI invocation with no interpolated content) to upload
- when destination is a local path: write directly to the filesystem
- when `allowed_destinations` is absent for an `s3://` or `gs://` destination:
  signal `destination-rejected` rather than guessing a bucket policy
