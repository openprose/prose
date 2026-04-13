---
name: executor
kind: service
---

requires:
- task: what to execute (pre-flight check, version update, commit, tag, push, GitHub release)

ensures:
- result: execution status with details

errors:
- execution-failed: the operation failed

strategies:
- when release execution fails: rollback (delete local tag, reset commits)
