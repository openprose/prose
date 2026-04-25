# 06.2 Artifact Validation

This slice starts validating runtime values against the type IR introduced in
06.1.

## What Is Validated

- JSON-shaped inputs (`Json<T>`, arrays) before provider execution.
- Primitive inputs and outputs where they can be checked from text.
- `run<T>` JSON output references.
- Provider output artifacts before run acceptance.

Opaque named types and `Markdown<T>` remain `unchecked` until package schema
resources become a real symbol table.

## Runtime Behavior

- Invalid inputs block the component before provider execution.
- Invalid provider outputs mark the component run as `failed`.
- Invalid output artifacts are still written to the local artifact store with
  `schema.status = "invalid"` so they remain inspectable.
- Valid or unchecked artifacts are stored with `valid` or `unchecked`
  respectively.

## Example

For an output declared as:

```md
- `count`: number - numeric output
```

Provider content `not a number` produces:

```json
{
  "status": "invalid",
  "diagnostics": [
    {
      "code": "schema_number_expected",
      "message": "Expected 'number' to be number."
    }
  ]
}
```

## Remaining Work

- Resolve named package schemas into `$defs`.
- Validate full JSON objects against those resolved schemas.
- Carry validation summaries directly in run records, not only artifact records
  and acceptance reasons.
