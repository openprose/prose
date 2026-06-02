---
name: lint
kind: function
---

### Parameters

- target: path to the contract `*.prose.md` file to lint

### Returns

- report: structured lint report with file-level validation results, contract matching checks, shape consistency checks, and warnings

### Errors

- not-found: target file does not exist
- not-contract: target file is not a valid contract (missing or invalid `kind`)

### Execution

- Recursively resolve all contracts the target depends on, following nested dependency trees (the resolver).
- Validate each file's frontmatter against the OpenProse schema — valid `kind`, valid contract sections, valid shape structure (the validator).
- Check that all contracts referenced as dependencies exist as files.
- Verify that shape `delegates` entries reference known contracts.
- Attempt basic contract matching — does each contract's `requires` have a plausible match in another contract's `maintains` (the checker).
