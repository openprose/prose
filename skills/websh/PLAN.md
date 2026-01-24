# websh: A Shell for the Web

## Vision

A shell where URLs are paths and the DOM is your filesystem. You navigate to a URL, and commands operate on the cached page content—instantly, locally, no refetching.

```
websh> cd https://news.ycombinator.com
websh> ls                    # list links
websh> grep "AI" | head 5    # filter
websh> cat .title            # CSS selector extraction
websh> follow 3              # navigate to 3rd link
```

The web becomes a computing environment you explore with familiar commands.

---

## Design Principles

1. **Fetch once, operate locally** — `cd` fetches and caches; all other commands work on cache
2. **Flat cache structure** — URLs become flat filenames (slashes → dashes)
3. **You ARE the shell** — Claude embodies websh, maintaining session state
4. **Composable primitives** — small commands that pipe together
5. **Familiar UX** — Unix-like commands adapted for web semantics

---

## Directory Structure

### Skill files (in this directory)

```
prose/skills/websh/
├── SKILL.md              # Activation triggers, command routing
├── PLAN.md               # This file
├── shell.md              # Core shell semantics (you ARE websh)
├── commands.md           # Command reference (ls, cat, grep, etc.)
├── state/
│   └── cache.md          # Cache management and format
└── help.md               # User help and examples
```

### User state (in working directory)

```
.websh/
├── session.md            # Current session state (pwd, history)
├── cache/
│   ├── {url-slug}.html       # Raw HTML
│   ├── {url-slug}.parsed.md  # Iterative extraction (by haiku)
│   └── index.md              # URL → slug mapping, fetch times
├── history.md            # Command history
└── bookmarks.md          # Saved locations
```

### Cache filename convention

URLs flatten to readable slugs:
- `https://news.ycombinator.com` → `news-ycombinator-com`
- `https://x.com/deepfates/status/123` → `x-com-deepfates-status-123`
- `https://techcrunch.com/2024/06/25/article-name/` → `techcrunch-com-2024-06-25-article-name`

Each cached URL gets two files:
- `{slug}.html` — raw HTML
- `{slug}.parsed.md` — iterative extraction

The `index.md` maps full URLs to slugs and tracks fetch/extraction status.

---

## Core Commands

| Command | Description | Operates On |
|---------|-------------|-------------|
| `cd <url>` | Navigate to URL, fetch & extract (async) | Network → Cache → Haiku extraction |
| `pwd` | Show current URL | Session |
| `ls [selector]` | List links or elements | Cache |
| `cat <selector>` | Extract text content | Cache |
| `grep <pattern>` | Filter by text/regex | Cache |
| `head <n>` / `tail <n>` | Slice results | Pipe |
| `follow <n\|text>` | Navigate to nth link or matching text | Cache → Network |
| `back` | Go to previous URL | Session history |
| `refresh` | Re-fetch current URL | Network → Cache |
| `stat` | Show page metadata (title, links count, etc.) | Cache |
| `save <path>` | Save current page to file | Cache → Filesystem |
| `history` | Show navigation history | Session |
| `bookmarks` | List saved locations | User state |
| `bookmark [name]` | Save current URL | User state |

### Planned extensions

| Command | Description |
|---------|-------------|
| `diff <url1> <url2>` | Compare two pages |
| `watch <url>` | Poll for changes |
| `form <selector>` | Interact with forms |
| `click <selector>` | Simulate click (JS-heavy sites) |
| `mount <api> <path>` | Mount API as virtual directory |

---

## The `cd` Flow: Fetch + Extract

When the user runs `cd <url>`, websh performs a two-phase operation:

### Phase 1: Fetch (synchronous)

```
cd https://news.ycombinator.com
   │
   ├─→ WebFetch the URL
   ├─→ Save raw HTML to .websh/cache/{hash}.html
   ├─→ Update index.json with URL → hash mapping
   └─→ Update session.md with new pwd
```

The user sees: `fetching... done`

### Phase 2: Extract (async haiku subagent, iterative)

Immediately after fetch, spawn a background haiku agent that **loops** to build up a rich markdown extraction:

```
Task({
  description: "websh: iterative page extraction",
  prompt: "<extraction prompt - see below>",
  subagent_type: "general-purpose",
  model: "haiku",
  run_in_background: true
})
```

The haiku agent runs an **iterative intelligent parse**:

```
loop until **extraction is thorough**:
  1. Read the raw .html
  2. Read current .parsed.md (if exists)
  3. Identify what's missing or could be richer
  4. Append/update the .parsed.md with new findings
  5. Repeat until diminishing returns
```

Each pass focuses on different aspects:
- **Pass 1**: Basic structure (title, main headings, link inventory)
- **Pass 2**: Content extraction (article text, comments, key quotes)
- **Pass 3**: Metadata and context (author, date, related links, site structure)
- **Pass 4+**: Edge cases, missed content, cleanup

**Output: `.websh/cache/{hash}.parsed.md`**

```markdown
# https://news.ycombinator.com

Fetched: 2026-01-24T10:30:00Z
Extraction: 3 passes

## Summary

Hacker News front page. Tech news aggregator with user-submitted links
and discussions. 30 stories visible, mix of Show HN, technical articles,
and industry news.

## Links

| # | Title | Points | Comments |
|---|-------|--------|----------|
| 0 | Show HN: I built a tool for... | 142 | 87 |
| 1 | The State of AI in 2026 | 891 | 432 |
| 2 | Why Rust is eating the world | 234 | 156 |
...

## Navigation

- [new](/newest) - Newest submissions
- [past](/front) - Past front pages
- [comments](/newcomments) - Recent comments
- [ask](/ask) - Ask HN
- [show](/show) - Show HN
- [jobs](/jobs) - Jobs

## Content Patterns

This is a link aggregator. Each story has:
- Title (class: .titleline)
- Points and submitter (class: .score, .hnuser)
- Comment count (links to /item?id=...)
- Domain in parentheses

## Raw Text Snippets

### Top Stories
1. "Show HN: I built a tool for..." - 142 points, 87 comments
2. "The State of AI in 2026" - 891 points, 432 comments
...

## Forms

- Search: input[name=q] at /hn.algolia.com
- Login: /login (username, password)

## Notes

- No images on front page (text-only design)
- Mobile-friendly, minimal CSS
- Stories refresh frequently
```

**User experience:**

```
news.ycombinator.com> cd https://example.com

fetching... done
extracting... (pass 1)

example.com> ls

# Shows what's available so far
# Agent continues extracting in background
# Subsequent commands get richer data as passes complete
```

### Why iterative?

- **Progressive richness**: First pass gives basics fast, later passes add depth
- **Intelligent focus**: Haiku decides what to extract based on page type
- **Human-readable output**: Markdown is inspectable, debuggable, useful
- **Graceful degradation**: Commands work after pass 1, improve with more passes
- **Site-aware**: Haiku recognizes patterns (HN stories, tweets, blog posts) and adapts

### Why haiku?

- **Fast**: Each pass completes quickly
- **Cheap**: Multiple passes still economical
- **Parallel**: Doesn't block user commands
- **Smart**: Adapts extraction strategy to content type

---

## State Management

### Session state (`session.md`)

Tracks the current shell session:

```markdown
# websh session

pwd: https://news.ycombinator.com
started: 2026-01-24T10:30:00Z

## History
1. cd https://news.ycombinator.com
2. ls
3. grep "AI"

## Navigation stack
- https://news.ycombinator.com (current)
```

### Cache format

Each cached page has two files:

**`{hash}.html`** — Raw fetched HTML (for reference, selector queries)

**`{hash}.parsed.md`** — Intelligent extraction (written iteratively by haiku):

```markdown
# https://news.ycombinator.com

Fetched: 2026-01-24T10:30:00Z
Passes: 3
Status: complete

## Summary

Hacker News front page. Tech news aggregator with 30 stories.
Mix of Show HN projects, technical deep-dives, and industry news.

## Links

| # | Title | Href | Meta |
|---|-------|------|------|
| 0 | Show HN: I built... | /item?id=123 | 142 pts, 87 comments |
| 1 | The State of AI | /item?id=456 | 891 pts, 432 comments |
...

## Content

### Main content
(extracted article text, cleaned up)

### Comments
(if applicable)

### Sidebar / Navigation
- [new](/newest)
- [past](/front)
...

## Structure

Page type: Link aggregator
Key selectors:
- .titleline → story titles
- .score → point counts
- .hnuser → usernames

## Forms

### Login (/login)
- username (text)
- password (password)

## Media

(none on this page)

## Metadata

- og:title: Hacker News
- description: News for hackers

## Extraction Notes

Pass 1: Basic structure, 30 links found
Pass 2: Extracted metadata, identified page type
Pass 3: Cleaned up content, noted patterns
```

The markdown format is:
- **Human-readable**: You can `cat` it and understand the page
- **Grep-friendly**: Commands like `grep "AI"` work naturally
- **Iteratively built**: Each pass adds/refines sections
- **Site-aware**: Haiku adapts structure to content type

Commands like `ls`, `grep`, `cat` read from the `.json` file for speed. The `.html` is available for selector-based extraction.

---

## Shell Embodiment Pattern

Following the OpenProse VM pattern, websh uses the "you ARE the shell" approach:

```markdown
# From shell.md

You are websh—a shell for navigating and querying the web.

When you receive a command:
1. Parse it using the command grammar
2. Check if it requires network (cd, refresh, follow) or operates on cache
3. For cache operations, read from .websh/cache/
4. Update session state
5. Return output in shell format

You maintain:
- Current working URL (pwd)
- Navigation history (back stack)
- Command history
- Cache index

Your prompt format:
{domain}>

Example:
news.ycombinator.com> ls
```

---

## Files to Create

### Phase 1: Core shell

1. **SKILL.md** — Activation triggers, command routing
   - Activate on: `websh`, `web shell`, URLs in shell context
   - Route to shell.md for execution

2. **shell.md** — Shell semantics
   - Embodiment instructions
   - Command parsing
   - State management
   - Output formatting

3. **commands.md** — Command reference
   - Detailed syntax for each command
   - Examples
   - Piping behavior

4. **state/cache.md** — Cache management
   - Fetch and store
   - **Iterative extraction prompt** (the prompt that drives haiku's loop)
   - Index management
   - Graceful degradation (commands work before extraction completes)
   - Expiration/refresh

5. **help.md** — User documentation
   - Getting started
   - Command cheatsheet
   - Examples

### Phase 2: Extensions

- Form interaction
- JavaScript-rendered pages (via browser tools if available)
- API mounting
- Diff/watch commands

---

## Example Session

```
$ websh

┌─────────────────────────────────────┐
│          ◇ websh ◇                  │
│     A shell for the web             │
└─────────────────────────────────────┘

~> cd https://news.ycombinator.com

fetching... cached
navigated to news.ycombinator.com

news.ycombinator.com> ls | head 5
[0] Show HN: I built a tool for...
[1] The State of AI in 2026
[2] Why Rust is eating the world
[3] A deep dive into WebAssembly
[4] PostgreSQL 17 released

news.ycombinator.com> grep "AI"
[1] The State of AI in 2026
[7] AI agents are coming for your job
[12] OpenAI announces GPT-5

news.ycombinator.com> follow 1

fetching... cached
navigated to news.ycombinator.com/item?id=...

news.ycombinator.com/item> cat .title
The State of AI in 2026

news.ycombinator.com/item> cat .comment | head 3
[0] Great article, but I disagree with...
[1] This matches what I've seen at...
[2] The author missed the point about...

news.ycombinator.com/item> back

news.ycombinator.com> bookmark hn

Bookmarked: hn → https://news.ycombinator.com

news.ycombinator.com> stat
URL:      https://news.ycombinator.com
Title:    Hacker News
Fetched:  2026-01-24T10:30:00Z (5 min ago)
Links:    30
Size:     45 KB
```

---

## Open Questions

1. **JS-rendered pages**: Many sites require JavaScript. Options:
   - Fail gracefully with helpful message
   - Integrate with browser automation tools if available
   - Use APIs where possible (e.g., Twitter/X API vs scraping)

2. **Authentication**: How to handle logged-in sessions?
   - Cookie import from browser?
   - Manual header setting?

3. **Rate limiting**: Should websh rate-limit fetches automatically?

4. **Cache expiration**: TTL-based? Manual refresh only?

---

## Next Steps

1. Create SKILL.md with activation triggers
2. Write shell.md with core embodiment semantics
3. Write commands.md with command grammar
4. Write state/cache.md with caching logic
5. Write help.md for users
6. Test with real URLs

---

## Inspiration

- Unix shell philosophy (small tools, pipes, text streams)
- OpenProse VM pattern (embodiment, state files)
- The original tweet: "Is there a shell for the web?"
