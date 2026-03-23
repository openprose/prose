---
description: Initialize OpenProse and prepare the VM
---

Invoke the open-prose skill to boot the OpenProse VM.

1. Check for `.prose/state.json` to detect if this is a returning user
2. Search for any `.prose` files in the current directory
3. If first time:
   - Welcome the user to OpenProse
   - Show available examples from the plugin's examples/ directory
4. If returning user:
   - Show any existing `.prose` files found
   - Offer to run one or create a new workflow

Read the SKILL.md file for full onboarding instructions.
