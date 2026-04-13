---
name: discovery
kind: service
---

requires:
- (nothing -- discovers all installed skills)

ensures:
- inventory: structured list of installed skills with path, name, and source tool (claude-code, amp, etc.)

Checks: ~/.claude/skills/, .claude/skills/, ~/.claude/plugins/, .agents/skills/, ~/.config/agents/skills/
