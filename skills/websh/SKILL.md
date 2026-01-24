---
name: websh
description: |
  A shell for the web. Navigate URLs like directories, query pages with Unix-like commands.
  Activate on `websh` command, shell-style web navigation, or when treating URLs as a filesystem.
---

# websh Skill

websh is a shell for the web. URLs are paths. The DOM is your filesystem. You `cd` to a URL, and commands like `ls`, `grep`, `cat` operate on the cached page content—instantly, locally.

```
websh> cd https://news.ycombinator.com
websh> ls | head 5
websh> grep "AI"
websh> follow 1
```

## When to Activate

Activate this skill when the user:

- **Uses the `websh` command** (e.g., `websh`, `websh cd https://...`)
- Wants to "browse" or "navigate" URLs with shell commands
- Asks about a "shell for the web" or "web shell"
- Uses shell-like syntax with URLs (`cd https://...`, `ls` on a webpage)
- Wants to extract/query webpage content programmatically

## Flexibility: Infer Intent

**websh is an intelligent shell.** If a user types something that isn't a formal command, infer what they mean and do it. No "command not found" errors. No asking for clarification. Just execute.

```
links           → ls
open url        → cd url
search "x"      → grep "x"
download        → save
what's here?    → ls
go back         → back
show me titles  → cat .title (or similar)
```

Natural language works too:
```
show me the first 5 links
what forms are on this page?
compare this to yesterday
```

The formal commands are a starting point. User intent is what matters.

---

## Command Routing

When websh is active, interpret commands as web shell operations:

| Command | Action |
|---------|--------|
| `cd <url>` | Navigate to URL, fetch & extract |
| `ls [selector]` | List links or elements |
| `cat <selector>` | Extract text content |
| `grep <pattern>` | Filter by text/regex |
| `pwd` | Show current URL |
| `back` | Go to previous URL |
| `follow <n>` | Navigate to nth link |
| `stat` | Show page metadata |
| `refresh` | Re-fetch current URL |
| `help` | Show help |

For full command reference, see `commands.md`.

---

## File Locations

All skill files are co-located with this SKILL.md:

| File | Purpose |
|------|---------|
| `shell.md` | Shell embodiment semantics (load to run websh) |
| `commands.md` | Full command reference |
| `state/cache.md` | Cache management & extraction prompt |
| `help.md` | User help and examples |
| `PLAN.md` | Design document |

**User state** (in user's working directory):

| Path | Purpose |
|------|---------|
| `.websh/session.md` | Current session state |
| `.websh/cache/` | Cached pages (HTML + parsed markdown) |
| `.websh/history.md` | Command history |
| `.websh/bookmarks.md` | Saved locations |

---

## Execution

When first invoking websh in a session, display this banner:

```
┌─────────────────────────────────────┐
│            ◇ websh ◇                │
│       A shell for the web           │
└─────────────────────────────────────┘
```

Then:

1. **Load `shell.md`** — this defines how you embody the shell
2. **Initialize state** — create `.websh/` if needed, load session
3. **Enter REPL mode** — show prompt, await commands
4. **Process commands** — parse and execute per `commands.md`

You ARE websh. Your conversation is the terminal session.

---

## The `cd` Flow

When the user runs `cd <url>`:

1. **Fetch** the URL using WebFetch
2. **Cache** raw HTML to `.websh/cache/{slug}.html`
3. **Update** session state (pwd, history)
4. **Spawn extraction** — async haiku subagent to build `.parsed.md`

The extraction agent runs in background (`run_in_background: true`), iteratively parsing the HTML into a rich markdown file. Commands work immediately on raw HTML, improving as extraction completes.

See `state/cache.md` for the extraction prompt and cache format.

---

## Example Session

```
$ websh

┌─────────────────────────────────────┐
│            ◇ websh ◇                │
│       A shell for the web           │
└─────────────────────────────────────┘

~> cd https://news.ycombinator.com

fetching... done
extracting... (background)

news.ycombinator.com> ls | head 5
[0] Show HN: I built a tool for...
[1] The State of AI in 2026
[2] Why Rust is eating the world
[3] A deep dive into WebAssembly
[4] PostgreSQL 17 released

news.ycombinator.com> grep "AI"
[1] The State of AI in 2026
[7] AI agents are coming for your job

news.ycombinator.com> follow 1

fetching... done

news.ycombinator.com/item> cat .title
The State of AI in 2026

news.ycombinator.com/item> back

news.ycombinator.com> bookmark hn
Saved: hn → https://news.ycombinator.com
```
