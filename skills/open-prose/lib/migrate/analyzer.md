---
name: analyzer
kind: service
---

requires:
- source: the contents of a `.prose` file to analyze

ensures:
- analysis: a structural analysis of the program containing:
    - purpose: a one-sentence summary of what the program does
    - complexity: simple (linear sessions), moderate (agents, parallel, or loops), or complex (nested control flow, imports, persistent agents)
    - patterns: which v0 constructs are used, drawn from: agent definitions, session statements, resume statements, parallel blocks, loop/repeat/for-each, try/catch/finally, choice/if-elif-else, block definitions, imports (use statements), input/output declarations, context passing, retry/backoff, discretion conditions, pipelines, string interpolation, throw statements
    - agents: list of agent names with their properties (model, prompt, persist, permissions)
    - control-flow: a summary of the program's execution structure (linear, branching, looping, recursive)
    - data-flow: how values move through the program (which sessions produce values consumed by later sessions)
    - error-handling: what error handling exists (try/catch, retry, throw)
    - imports: any external program dependencies (use statements)
    - statement-count: total number of executable statements

strategies:
- when the file is very short (under 10 statements): still produce a complete analysis, noting simplicity
- when the file uses deeply nested control flow: flatten the description into a readable summary rather than mirroring the nesting
