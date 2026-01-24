---
role: user-documentation
summary: |
  User-facing help for websh. Quick start, full command cheatsheet, examples.
---

# websh Help

A Unix-like shell for the web. Navigate URLs like directories, query pages with familiar commands.

## Quick Start

```
websh                                # start the shell
ls                                   # shows suggested sites
go hn                                # go to Hacker News (preset bookmark)
ls | head 5                          # first 5 links
grep "AI"                            # search for text
follow 1                             # click the 2nd link
cat .title                           # extract text by selector
back                                 # go back
```

## Starter Bookmarks

websh comes with bookmarks for accessible public sites:

| Shortcut | Site |
|----------|------|
| `go hn` | Hacker News |
| `go wiki` | Wikipedia |
| `go lobsters` | Lobsters |
| `go tildes` | Tildes |
| `go npr` | NPR (text) |
| `go cnn` | CNN (lite) |
| `go wiby` | Wiby (indie search) |

Add your own with `bookmark <name>`.

---

## Command Cheatsheet

### Navigation

| Command | Description |
|---------|-------------|
| `cd <url>` | Go to URL |
| `cd -` | Go to previous URL |
| `cd ~` | Go to start (clear navigation) |
| `pwd` | Show current URL |
| `back` / `forward` | Navigate history |
| `follow <n>` | Follow nth link |
| `follow "text"` | Follow link containing text |
| `refresh` | Re-fetch current page |
| `chroot <url>` | Restrict navigation to URL prefix |

### Query & Extract

| Command | Description |
|---------|-------------|
| `ls` | List all links |
| `ls -l` | List with URLs |
| `ls <selector>` | List elements matching selector |
| `cat <selector>` | Extract text content |
| `grep <pattern>` | Search/filter by pattern |
| `grep -i` | Case-insensitive |
| `grep -v` | Invert match |
| `stat` | Show page metadata |
| `source` | View raw HTML |
| `dom` | Show DOM tree |

### Search & Discovery

| Command | Description |
|---------|-------------|
| `find <pattern>` | Recursive search/crawl |
| `find -depth <n>` | Crawl n levels deep |
| `locate <term>` | Search all cached pages |
| `tree` | Show site structure |
| `which <link>` | Resolve redirects |

### Text Processing

| Command | Description |
|---------|-------------|
| `head <n>` | First n items |
| `tail <n>` | Last n items |
| `sort` | Sort output |
| `sort -r` | Reverse sort |
| `uniq` | Remove duplicates |
| `wc` | Count lines/words |
| `wc --links` | Count links |
| `cut -f <n>` | Extract field |
| `tr` | Transform characters |
| `sed 's/a/b/'` | Stream edit |

### Comparison

| Command | Description |
|---------|-------------|
| `diff <url1> <url2>` | Compare two pages |
| `diff -t 1h` | Compare to 1 hour ago |
| `diff --wayback <date>` | Compare to Wayback snapshot |

### Monitoring

| Command | Description |
|---------|-------------|
| `watch <url>` | Monitor for changes |
| `watch -n 30` | Poll every 30 seconds |
| `watch --notify` | System notification on change |
| `ping <url>` | Check if site is up |
| `traceroute <url>` | Show redirect chain |
| `time <cmd>` | Measure execution time |

### Jobs & Background

| Command | Description |
|---------|-------------|
| `<cmd> &` | Run in background |
| `ps` | Show running tasks |
| `jobs` | List background jobs |
| `fg %<n>` | Bring job to foreground |
| `bg %<n>` | Continue in background |
| `kill %<n>` | Cancel job |
| `wait` | Wait for all jobs |

### Environment & Auth

| Command | Description |
|---------|-------------|
| `env` | Show environment |
| `export VAR=val` | Set variable |
| `export HEADER_X=val` | Set request header |
| `export COOKIE_x=val` | Set cookie |
| `unset VAR` | Remove variable |
| `whoami` | Show logged-in identity |
| `login` | Interactive login |
| `logout` | Clear session |
| `su <profile>` | Switch profile |

### Mounting

| Command | Description |
|---------|-------------|
| `mount <api> <path>` | Mount API as directory |
| `mount -t github ...` | Mount GitHub API |
| `mount -t rss ...` | Mount RSS feed |
| `umount <path>` | Unmount |
| `df` | Show mounts and cache usage |
| `quota` | Show rate limits |

### Archives & Snapshots

| Command | Description |
|---------|-------------|
| `tar -c <file> <urls>` | Archive pages |
| `tar -x <file>` | Extract archive |
| `snapshot` | Save timestamped version |
| `snapshot -l` | List snapshots |
| `wayback <url>` | List Wayback snapshots |
| `wayback <url> <date>` | Fetch from Wayback |

### Site Metadata

| Command | Description |
|---------|-------------|
| `robots` | Show robots.txt |
| `sitemap` | Show sitemap.xml |
| `headers` | Show HTTP headers |
| `cookies` | Manage cookies |

### Interaction

| Command | Description |
|---------|-------------|
| `click <selector>` | Click element |
| `submit <form>` | Submit form |
| `type <sel> "text"` | Fill input |
| `scroll` | Trigger infinite scroll |
| `screenshot <file>` | Capture page |

### Scheduling

| Command | Description |
|---------|-------------|
| `cron "<sched>" <cmd>` | Schedule recurring |
| `at "<time>" <cmd>` | Schedule one-time |
| `cron -l` | List scheduled |

### Aliases & Shortcuts

| Command | Description |
|---------|-------------|
| `alias name='cmd'` | Create alias |
| `alias` | List aliases |
| `unalias name` | Remove alias |
| `ln -s <url> <name>` | Create URL shortcut |

### State & History

| Command | Description |
|---------|-------------|
| `history` | Show command history |
| `!!` | Repeat last command |
| `!<n>` | Repeat command n |
| `bookmark <name>` | Save current URL |
| `bookmarks` | List bookmarks |
| `go <name>` | Go to bookmark |

### File Operations

| Command | Description |
|---------|-------------|
| `save <path>` | Save page to file |
| `save --parsed` | Save extracted markdown |
| `tee <file>` | Save while displaying |
| `xargs <cmd>` | Build commands from input |
| `parallel` | Run in parallel |

---

## Pipes & Redirection

```
ls | grep "AI" | head 5              # pipe commands
ls > links.txt                       # write to file
ls >> links.txt                      # append to file
ls | tee links.txt                   # save and display
cd $(wayback https://x.com 2020)     # command substitution
```

---

## Selectors

CSS selectors work with `ls`, `cat`, `click`:

```
cat .article          # class
cat #main             # id
cat article           # tag
cat .post .title      # descendant
cat h1:first          # first match
ls nav a              # links in nav
click button.submit   # button with class
```

---

## Examples

### Browse Hacker News

```
cd https://news.ycombinator.com
ls | head 10                         # top 10 stories
grep "Show HN"                       # filter
follow "Show HN"                     # go to first match
cat .comment | head 20               # read comments
back
```

### Research a topic

```
cd https://en.wikipedia.org/wiki/Unix
cat #mw-content-text | head 50       # intro
ls #toc                              # table of contents
follow "History"
bookmark unix-history
```

### Monitor a page

```
watch https://status.example.com -n 30 --notify
# Polls every 30s, notifies on change
```

### Mount GitHub API

```
mount https://api.github.com /gh
cd /gh/users/torvalds
cat bio
cd /gh/repos/torvalds/linux
ls issues | head 10
```

### Compare page over time

```
cd https://example.com
snapshot "before"
# ... wait ...
refresh
diff --snapshot "before"
```

### Batch fetch

```
parallel cd ::: https://a.com https://b.com https://c.com
locate "error" | head 10
```

### Search across cached pages

```
locate "authentication"
# Searches all cached pages instantly

locate -i "OAuth" --urls
# Case-insensitive, show URLs
```

### Archive research

```
cd https://paper1.com &
cd https://paper2.com &
cd https://paper3.com &
wait
tar -cz research.tar.gz https://paper1.com https://paper2.com https://paper3.com
```

### Set auth headers

```
export HEADER_Authorization="Bearer mytoken"
cd https://api.example.com/protected
cat .
```

### Schedule monitoring

```
cron "0 * * * *" 'cd https://news.com && ls | head 5 >> hourly.txt'
cron "0 9 * * *" 'snapshot "daily"'
```

---

## How It Works

When you `cd` to a URL:

1. **Fetch** — Downloads the HTML
2. **Cache** — Saves to `.websh/cache/`
3. **Extract** — Background haiku agent parses into rich markdown

Commands like `ls`, `grep`, `cat` work on cached content—instant, no refetching.

Mounted APIs work similarly—API responses cached and navigable.

---

## Files

```
.websh/
├── session.md      # current session
├── cache/          # cached pages (HTML + parsed markdown)
├── history.md      # command history
├── bookmarks.md    # saved URLs
├── profiles/       # auth profiles
└── snapshots/      # saved versions
```

---

## Natural Language

websh understands intent, not just commands. These all work:

```
links                    → ls
open https://example.com → cd https://example.com
search "AI"              → grep "AI"
what's on this page?     → ls + stat
show me the title        → cat title
go back                  → back
how many links?          → wc --links
download this            → save
```

Just say what you want. websh will figure it out.

---

## Tips

- **Use indexes**: `ls` numbers links, `follow 3` clicks the 4th
- **Pipe everything**: `ls | grep "foo" | head 5 | tee results.txt`
- **Background long tasks**: `cd https://slow-site.com &`
- **Search your cache**: `locate` searches all cached pages instantly
- **Mount APIs**: `mount` makes REST APIs navigable like directories
- **Compare over time**: `snapshot` + `diff --snapshot`
- **Schedule checks**: `cron` for recurring, `at` for one-time

---

## Limitations

- **JavaScript sites**: Some content requires JS to render
- **Authentication**: `login` is best-effort, may need manual cookies
- **Rate limits**: Respect site limits, use `quota` to check
- **Interaction**: `click`, `submit` limited without full browser

---

## Getting Help

```
help                 # this help
help <command>       # specific command help
man <command>        # detailed manual
```
