---
name: file-writer
kind: service
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

### Requires

- `content`: Markdown<Content> - structured output to write
- `destination`: string - file path or URI — local path, s3:// URI, or gs:// URI
- `format`: string - (optional, default "md") output format — one of "md", "json", "csv", "html"

### Ensures

- `written_path`: string - the resolved path or URI where the file was written
- `bytes_written`: number - the size of the written file in bytes


### Effects

- `mutates_repo`: writes content to a requested file path

### Errors

- write-failed: the write operation failed (disk full, network error, service unavailable)
- path-not-found: the parent directory or bucket does not exist
- permission-denied: insufficient permissions to write to the destination

### Environment

- AWS_ACCESS_KEY_ID: (optional) required for S3 destinations
- AWS_SECRET_ACCESS_KEY: (optional) required for S3 destinations
- GOOGLE_APPLICATION_CREDENTIALS: (optional) required for GCS destinations

### Invariants

- content is serialized faithfully in the requested format — no fields added, removed, or transformed beyond format encoding
- if the destination already exists, it is overwritten (not appended)

### Strategies

- when format is "json": serialize the content as formatted JSON
- when format is "csv": serialize the content as CSV with headers derived from the data structure
- when format is "html": write the content as an HTML document
- when format is "md": write the content as Markdown
- when destination is an S3 URI: use AWS SDK or CLI to upload
- when destination is a GCS URI: use Google Cloud SDK or CLI to upload
- when destination is a local path: write directly to the filesystem
