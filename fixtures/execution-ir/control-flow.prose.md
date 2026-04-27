---
name: control-flow
kind: program
---

### Services

- `guard`
- `worker`
- `poller`
- `finisher`

### Requires

- `items`: string[] - items to process
- `approved`: boolean - whether to proceed

### Ensures

- `result`: Markdown<Result> - final result

### Execution

```prose
if approved:
  call guard

for each item in items:
  let result = call worker
    item: item

loop:
  call poller

try:
  call finisher
catch delivery_failed:
  call fallback
finally:
  call cleanup

return result
```
