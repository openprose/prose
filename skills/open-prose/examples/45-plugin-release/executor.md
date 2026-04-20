---
name: executor
kind: service
---

### Requires

- task: what to execute (pre-flight check, version update, commit, tag, push, GitHub release)

### Ensures

- result: execution status with details

### Errors

- execution-failed: the operation failed

### Strategies

- when release execution fails: rollback (delete local tag, reset commits)
