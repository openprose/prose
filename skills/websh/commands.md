---
role: command-reference
summary: |
  Complete reference for all websh commands. Navigation, query, process management,
  monitoring, environment, mounting, and more—treating the web as a Unix filesystem.
see-also:
  - shell.md: Shell semantics and execution model
  - state/cache.md: How cache is structured
---

# websh Command Reference

## Navigation Commands

### `cd <url>`

Navigate to a URL. Fetches the page, caches it, and spawns async extraction.

**Syntax:**
```
cd <url>
cd <relative-path>
cd -                 # go to previous location
cd ~                 # go to home/start (clears navigation)
```

**Examples:**
```
cd https://news.ycombinator.com
cd https://x.com/deepfates
cd /item?id=12345          # relative to current domain
cd ..                       # up one path level
cd -                        # back to previous URL
```

**Output:** Navigation confirmation, extraction status

---

### `pwd`

Print the current URL.

**Syntax:**
```
pwd
pwd -P               # show full resolved URL (no aliases)
```

**Output:** Full current URL or `(no page loaded)`

---

### `back`

Go back to the previous URL in navigation history.

**Syntax:**
```
back
back <n>             # go back n steps
```

**Behavior:** Uses cached content, no refetch.

---

### `forward`

Go forward in navigation history (after using `back`).

**Syntax:**
```
forward
forward <n>
```

---

### `follow <target>`

Navigate to a link on the current page.

**Syntax:**
```
follow <index>       # by number from ls output
follow "<text>"      # by link text (partial match)
follow -n            # follow without adding to history
```

**Examples:**
```
follow 3                    # follow the 4th link (0-indexed)
follow "State of AI"        # follow link containing this text
```

---

### `refresh`

Re-fetch the current URL, updating the cache.

**Syntax:**
```
refresh
refresh --hard       # clear extraction, start fresh
```

---

### `chroot <url>`

Restrict navigation to a subdomain or path prefix.

**Syntax:**
```
chroot <url>         # set root boundary
chroot               # show current chroot
chroot /             # clear chroot
```

**Example:**
```
chroot https://docs.python.org/3/
cd tutorial          # OK: within chroot
cd https://google.com # error: outside chroot
```

---

## Query Commands

### `ls [selector]`

List links or elements on the current page.

**Syntax:**
```
ls                   # list all links
ls <selector>        # list elements matching CSS selector
ls -l                # long format with hrefs
ls -a                # include hidden/navigation links
ls -t                # sort by position in page
ls -S                # sort by text length
```

**Output:**
```
[0] First link text
[1] Second link text
```

With `-l`:
```
[0] First link text → /path/to/page
[1] Second link text → https://external.com/
```

**Pipeable:** Yes

---

### `cat <selector>`

Extract text content from elements.

**Syntax:**
```
cat <selector>
cat .                # entire page text
cat -n               # with line numbers
cat -A               # show all (including hidden elements)
```

**Examples:**
```
cat .title
cat article
cat .comment | head 3
cat -n .code-block
```

**Pipeable:** Yes

---

### `grep <pattern>`

Filter content by text pattern (regex supported).

**Syntax:**
```
grep <pattern>
grep -i <pattern>    # case-insensitive
grep -v <pattern>    # invert match
grep -c <pattern>    # count matches
grep -n <pattern>    # show line numbers
grep -o <pattern>    # only matching part
grep -A <n>          # n lines after match
grep -B <n>          # n lines before match
grep -C <n>          # n lines context (before and after)
grep -E <pattern>    # extended regex
grep -l              # list pages with matches (for locate/find)
```

**Pipeable:** Yes (filters input stream or searches page)

---

### `stat`

Show metadata about the current page.

**Syntax:**
```
stat
stat -v              # verbose (all metadata)
```

**Output:**
```
URL:       https://news.ycombinator.com
Title:     Hacker News
Fetched:   2026-01-24T10:30:00Z
Extracted: 3 passes, complete
Links:     30
Forms:     2
Images:    0
Size:      45 KB (html), 12 KB (parsed)
```

---

### `head <n>` / `tail <n>`

Take first or last n items from a stream.

**Syntax:**
```
head <n>
head -n <n>          # same as head <n>
tail <n>
tail -f              # follow (for watch/stream)
```

**Pipeable:** Yes (must be in pipe or with file)

---

### `sort`

Sort lines of output.

**Syntax:**
```
sort                 # alphabetical
sort -n              # numeric
sort -r              # reverse
sort -u              # unique (remove duplicates)
sort -k <n>          # sort by nth field
sort -t <delim>      # field delimiter
```

**Pipeable:** Yes

---

### `uniq`

Remove duplicate lines.

**Syntax:**
```
uniq
uniq -c              # prefix with count
uniq -d              # only show duplicates
uniq -u              # only show unique
```

**Pipeable:** Yes

---

### `wc`

Count words, lines, characters.

**Syntax:**
```
wc                   # all counts
wc -l                # lines only
wc -w                # words only
wc -c                # characters only
wc -L                # longest line length
```

**Web-specific:**
```
wc --links           # count links
wc --images          # count images
wc --forms           # count forms
wc --headings        # count headings
```

**Pipeable:** Yes

---

### `cut`

Extract columns/fields from output.

**Syntax:**
```
cut -f <n>           # field n (1-indexed)
cut -f <n,m>         # fields n and m
cut -d <delim>       # delimiter (default: tab)
cut -c <range>       # character positions
```

**Example:**
```
ls -l | cut -f 1     # just link text, no URLs
```

**Pipeable:** Yes

---

### `tr`

Translate/transform characters.

**Syntax:**
```
tr <set1> <set2>     # replace set1 chars with set2
tr -d <set>          # delete characters
tr -s <set>          # squeeze repeated chars
tr '[:upper:]' '[:lower:]'  # lowercase
```

**Pipeable:** Yes

---

### `sed`

Stream editor for transformations.

**Syntax:**
```
sed 's/old/new/'     # replace first occurrence
sed 's/old/new/g'    # replace all
sed -n '5,10p'       # print lines 5-10
sed '/pattern/d'     # delete matching lines
```

**Pipeable:** Yes

---

### `source`

View raw HTML source.

**Syntax:**
```
source               # full HTML
source | head 50     # first 50 lines
source -l            # with line numbers
```

---

### `dom`

Show DOM tree structure.

**Syntax:**
```
dom                  # full tree
dom <selector>       # subtree from selector
dom -d <n>           # depth limit
dom --tags           # tag names only
```

**Output:**
```
html
├── head
│   ├── title
│   ├── meta
│   └── link
└── body
    ├── header
    │   └── nav
    ├── main
    │   ├── article
    │   └── aside
    └── footer
```

---

## Search & Discovery

### `find <pattern>`

Recursively search/crawl from current page.

**Syntax:**
```
find <text-pattern>              # search page content
find -name "<pattern>"           # search link text
find -href "<pattern>"           # search URLs
find -selector "<css>"           # find elements
find -depth <n>                  # crawl n levels deep
find -maxpages <n>               # limit pages to crawl
find -type <t>                   # filter: link, image, form, heading
find -follow                     # actually fetch found pages
```

**Examples:**
```
find "API documentation"                    # find text across linked pages
find -name "*.pdf" -depth 2                # find PDF links, 2 levels deep
find -selector "form" -depth 1             # find all forms on this + linked pages
find -href "/api/" -follow                 # crawl all /api/ pages
```

**Output:** List of matches with source page

---

### `locate <term>`

Instant search across ALL cached pages.

**Syntax:**
```
locate <pattern>
locate -i <pattern>  # case-insensitive
locate -r <regex>    # regex mode
locate --urls        # search URLs only
locate --titles      # search titles only
```

**Example:**
```
locate "authentication"    # find in all cached content
locate -i "OAuth"          # case-insensitive
```

**Output:**
```
news-ycombinator-com: [3 matches]
  - "OAuth authentication flow..."
  - "...using authentication tokens..."
techcrunch-com-article: [1 match]
  - "...new authentication method..."
```

---

### `tree`

Show site structure.

**Syntax:**
```
tree                 # from current page
tree -d <n>          # depth limit
tree -L <n>          # same as -d
tree --sitemap       # use sitemap.xml if available
tree --infer         # infer from links
tree -P <pattern>    # only matching paths
```

**Output:**
```
https://example.com/
├── /about
├── /products
│   ├── /products/widget
│   └── /products/gadget
├── /blog
│   ├── /blog/post-1
│   └── /blog/post-2
└── /contact
```

---

### `which <link>`

Resolve where a link actually goes (follow redirects).

**Syntax:**
```
which <url>
which <index>        # from ls output
which -a             # show all redirects in chain
```

**Output:**
```
https://bit.ly/xyz → https://example.com/actual-page
```

With `-a`:
```
https://bit.ly/xyz
  → https://example.com/redirect
  → https://example.com/actual-page (200 OK)
```

---

## Comparison & Diff

### `diff`

Compare pages or versions.

**Syntax:**
```
diff <url1> <url2>           # compare two URLs
diff <url>                   # compare current vs URL
diff -c                      # context format
diff -u                      # unified format
diff --side-by-side          # side by side
diff --links                 # compare only links
diff --text                  # compare only text content
```

**Time-based:**
```
diff -t <duration>           # compare to cached version from <duration> ago
diff --wayback <date>        # compare to Wayback Machine snapshot
```

**Examples:**
```
diff https://a.com https://b.com
diff -t 1h                   # compare to 1 hour ago
diff --wayback 2024-01-01    # compare to Wayback snapshot
```

---

### `patch`

Apply changes (for APIs with write access).

**Syntax:**
```
patch <file>         # apply diff file
```

*Note: Requires mounted API with write permissions.*

---

## Monitoring

### `watch`

Monitor URL for changes.

**Syntax:**
```
watch <url>                  # poll every 60s
watch -n <seconds>           # custom interval
watch -d                     # highlight differences
watch --notify               # system notification on change
watch --exec <cmd>           # run command on change
watch --selector <css>       # only watch specific element
```

**Examples:**
```
watch https://status.example.com -n 30
watch -d --selector ".price"
watch --notify --exec "echo 'Changed!'"
```

**Output:** Shows content, updates in place, highlights changes

---

### `tail -f <url>`

Stream live content (for SSE, websocket, or polling).

**Syntax:**
```
tail -f <url>                # stream updates
tail -f --sse                # Server-Sent Events
tail -f --ws                 # WebSocket
tail -f --poll <n>           # poll every n seconds
```

---

### `ping`

Check if site is up.

**Syntax:**
```
ping <url>
ping -c <n>          # count of pings
ping -i <seconds>    # interval
```

**Output:**
```
PING https://example.com
200 OK - 145ms
200 OK - 132ms
200 OK - 156ms
--- 3 requests, avg 144ms ---
```

---

### `traceroute`

Show redirect chain.

**Syntax:**
```
traceroute <url>
```

**Output:**
```
1. https://short.link/abc (301)
2. https://example.com/redirect (302)
3. https://example.com/final (200)
```

---

### `time`

Measure command execution time.

**Syntax:**
```
time <command>
```

**Output:**
```
[command output]

real    0.45s
fetch   0.32s
extract 0.13s
```

---

## Process & Job Management

### `ps`

Show running background tasks.

**Syntax:**
```
ps                   # list all tasks
ps -l                # long format
ps -a                # all (including completed)
```

**Output:**
```
PID   STATUS      URL/TASK
1     extracting  news-ycombinator-com
2     fetching    x-com-deepfates
3     watching    status.example.com
```

---

### `jobs`

List background jobs.

**Syntax:**
```
jobs
jobs -l              # with PIDs
jobs -r              # running only
jobs -s              # stopped only
```

**Output:**
```
[1]  + running     cd https://example.com &
[2]  - extracting  follow 3 &
[3]    watching    watch https://status.com
```

---

### `kill`

Cancel a background task.

**Syntax:**
```
kill <pid>
kill %<job-number>
kill -9 <pid>        # force kill
killall watch        # kill all watch processes
```

---

### `wait`

Wait for background task to complete.

**Syntax:**
```
wait                 # wait for all
wait <pid>           # wait for specific
wait %<job>          # wait for job number
```

---

### `bg` / `fg`

Move jobs to background/foreground.

**Syntax:**
```
bg %<job>            # continue job in background
fg %<job>            # bring job to foreground
```

---

### `&` (background operator)

Run command in background.

**Syntax:**
```
cd https://example.com &
watch https://status.com &
```

---

### `nohup`

Run command immune to hangups.

**Syntax:**
```
nohup watch https://example.com &
```

---

## Environment & Auth

### `env`

Show current environment (headers, cookies, settings).

**Syntax:**
```
env                  # all variables
env | grep COOKIE    # filter
```

**Output:**
```
USER_AGENT=websh/1.0
ACCEPT=text/html
COOKIE_session=abc123
HEADER_Authorization=Bearer xyz
TIMEOUT=30
RATE_LIMIT=10/min
```

---

### `export`

Set environment variable (headers, cookies).

**Syntax:**
```
export VAR=value
export HEADER_X-Custom=value
export COOKIE_session=abc123
export USER_AGENT="Custom Agent"
export TIMEOUT=60
```

**Examples:**
```
export HEADER_Authorization="Bearer mytoken"
export COOKIE_session="abc123"
export USER_AGENT="Mozilla/5.0..."
```

---

### `unset`

Remove environment variable.

**Syntax:**
```
unset VAR
unset HEADER_Authorization
unset COOKIE_session
```

---

### `whoami`

Show logged-in identity (if detectable).

**Syntax:**
```
whoami
whoami -v            # verbose (show how detected)
```

**Output:**
```
@deepfates (detected from: meta tag, cookie)
```

Or:
```
(not logged in)
```

---

### `login`

Interactive login flow.

**Syntax:**
```
login                        # login to current site
login <url>                  # login to specific site
login --form <selector>      # specify login form
login -u <user> -p <pass>    # provide credentials
login --cookie <file>        # import cookies from file
login --browser              # import from browser
```

**Flow:**
1. Detect login form
2. Prompt for credentials (or use provided)
3. Submit form
4. Store session cookies

---

### `logout`

Clear session for current site.

**Syntax:**
```
logout               # current site
logout <domain>      # specific domain
logout --all         # all sessions
```

---

### `su`

Switch user/profile.

**Syntax:**
```
su <profile>         # switch to profile
su -                 # switch to default
su -l <profile>      # login as profile (fresh session)
```

Profiles store separate cookies, headers, identities.

---

## Mounting & Virtual Filesystems

### `mount`

Mount an API or service as a browsable directory.

**Syntax:**
```
mount <source> <mountpoint>
mount -t <type> <source> <mountpoint>
```

**Types:**
- `rest` — REST API
- `github` — GitHub API
- `rss` — RSS/Atom feed
- `json` — JSON endpoint

**Examples:**
```
mount https://api.github.com /gh
mount -t github octocat/Hello-World /repo
mount -t rss https://example.com/feed.xml /feed
mount -t rest https://api.example.com /api
```

**After mounting:**
```
cd /gh/users/octocat
ls                           # list user properties
cat repos                    # fetch repos
cd /gh/repos/octocat/Hello-World
ls issues
cat issues/1
```

---

### `umount`

Unmount a mounted path.

**Syntax:**
```
umount <mountpoint>
umount -a            # unmount all
```

---

### `df`

Show mounted filesystems and cache usage.

**Syntax:**
```
df
df -h                # human readable sizes
```

**Output:**
```
Mount           Type    Size    Used    Quota
/               web     -       12MB    -
/gh             github  -       45KB    5000 req/hr (4892 left)
/api            rest    -       2KB     100 req/min (98 left)

Cache: 156 pages, 45MB
```

---

### `quota`

Show rate limit status.

**Syntax:**
```
quota
quota <domain>
```

**Output:**
```
api.github.com: 4892/5000 requests remaining (resets in 45min)
api.twitter.com: 98/100 requests remaining (resets in 12min)
```

---

## Archives & Snapshots

### `tar`

Archive multiple pages.

**Syntax:**
```
tar -c <file> <urls...>      # create archive
tar -c site.tar https://example.com/*   # glob
tar -x <file>                # extract (restore to cache)
tar -t <file>                # list contents
tar -z                       # compress (gzip)
```

**Examples:**
```
tar -cz research.tar.gz https://paper1.com https://paper2.com
tar -t research.tar.gz
tar -x research.tar.gz       # restore to cache
```

---

### `snapshot`

Save timestamped version of current page.

**Syntax:**
```
snapshot                     # save with auto timestamp
snapshot <name>              # save with name
snapshot -l                  # list snapshots
snapshot -r <name>           # restore snapshot
```

**Example:**
```
snapshot "before-update"
# ... time passes ...
diff --snapshot "before-update"
```

---

### `wayback`

Interact with Wayback Machine.

**Syntax:**
```
wayback <url>                # list available snapshots
wayback <url> <date>         # fetch specific snapshot
wayback --save <url>         # request Wayback to archive
```

**Examples:**
```
wayback https://example.com
wayback https://example.com 2023-06-15
cd $(wayback https://example.com 2020-01-01)
```

---

## Site Metadata

### `robots`

Show robots.txt.

**Syntax:**
```
robots
robots <url>
```

---

### `sitemap`

Show/parse sitemap.xml.

**Syntax:**
```
sitemap
sitemap <url>
sitemap --urls       # just list URLs
sitemap --tree       # as tree structure
```

---

### `headers`

Show HTTP response headers.

**Syntax:**
```
headers              # current page
headers <url>        # fetch headers only (HEAD request)
headers -v           # verbose (request + response)
```

---

### `cookies`

Manage cookies.

**Syntax:**
```
cookies              # list for current domain
cookies <domain>     # list for specific domain
cookies -a           # all domains
cookies --set <name>=<value>
cookies --delete <name>
cookies --clear      # clear all for domain
cookies --export <file>
cookies --import <file>
```

---

## Interaction

### `click`

Simulate click on element.

**Syntax:**
```
click <selector>
click <index>        # from ls output
click --js           # execute onclick handlers
```

*Note: Limited without full browser. Best effort.*

---

### `submit`

Submit a form.

**Syntax:**
```
submit <form-selector>
submit -d "field=value&field2=value2"
submit --json '{"field": "value"}'
```

**Interactive:**
```
submit               # if only one form, prompts for fields
```

---

### `type`

Fill input field.

**Syntax:**
```
type <selector> "text"
type --clear <selector>      # clear first
```

---

### `scroll`

Trigger scroll/pagination.

**Syntax:**
```
scroll               # scroll down (trigger infinite scroll)
scroll --bottom      # scroll to bottom
scroll --page <n>    # go to page n
scroll --next        # next page
```

*Note: Limited without full browser.*

---

### `screenshot`

Capture visual snapshot (requires browser tools).

**Syntax:**
```
screenshot <file>
screenshot --full    # full page
screenshot --selector <css>  # specific element
```

---

## Scheduling

### `cron`

Schedule recurring commands.

**Syntax:**
```
cron "<schedule>" <command>
cron -l              # list scheduled jobs
cron -r <id>         # remove job
```

**Examples:**
```
cron "0 * * * *" 'watch https://status.com --notify'
cron "0 9 * * *" 'cd https://news.com && ls | head 5 > daily.txt'
```

---

### `at`

Schedule one-time command.

**Syntax:**
```
at <time> <command>
at -l                # list pending
at -r <id>           # remove
```

**Examples:**
```
at "10:00" 'refresh'
at "+1h" 'snapshot "hourly"'
at "2024-12-25 00:00" 'cd https://xmas.com'
```

---

## Aliases & Scripts

### `alias`

Create command shortcut.

**Syntax:**
```
alias <name>='<command>'
alias                # list all
alias <name>         # show specific
unalias <name>       # remove
```

**Examples:**
```
alias hn='cd https://news.ycombinator.com'
alias top5='ls | head 5'
alias search='grep -i'
```

---

### `ln -s`

Create URL alias/symlink.

**Syntax:**
```
ln -s <url> <name>
```

**Example:**
```
ln -s https://news.ycombinator.com hn
cd hn                # works like cd https://news.ycombinator.com
```

---

## State Commands

### `history`

Show command history.

**Syntax:**
```
history
history <n>          # last n commands
history -c           # clear history
history | grep <pattern>
!<n>                 # execute command n from history
!!                   # repeat last command
```

---

### `bookmark [name]`

Save URL as bookmark.

**Syntax:**
```
bookmark              # auto-name from domain
bookmark <name>
bookmark -d <name>    # delete
bookmark -l           # list (same as bookmarks)
```

---

### `bookmarks`

List all bookmarks.

**Syntax:**
```
bookmarks
bookmarks | grep <pattern>
```

---

### `go <bookmark>`

Navigate to bookmark.

**Syntax:**
```
go <name>
```

---

## File Commands

### `save`

Save page to local file.

**Syntax:**
```
save <path>                  # save HTML
save <path> --parsed         # save extracted markdown
save <path> --complete       # save with assets
```

---

### `tee`

Save output while displaying.

**Syntax:**
```
<command> | tee <file>
<command> | tee -a <file>    # append
```

**Example:**
```
ls | grep "AI" | tee ai-links.txt
```

---

### `xargs`

Build and execute commands from input.

**Syntax:**
```
<command> | xargs <cmd>
<command> | xargs -I {} <cmd> {}
<command> | xargs -P <n>     # parallel
```

**Examples:**
```
cat urls.txt | xargs -I {} cd {}
ls | head 5 | xargs -P 5 follow    # fetch first 5 in parallel
```

---

### `parallel`

Run commands in parallel.

**Syntax:**
```
parallel <cmd> ::: <args...>
parallel -j <n>              # n jobs
```

**Example:**
```
parallel cd ::: https://a.com https://b.com https://c.com
```

---

## Help & Documentation

### `help`

Show help.

**Syntax:**
```
help                 # general help
help <command>       # command-specific
```

---

### `man`

Detailed manual (or fetch site's API docs).

**Syntax:**
```
man <command>        # websh command manual
man <domain>         # try to fetch API docs for domain
```

---

## Special Syntax

### Pipes

Commands can be chained:
```
ls | grep "AI" | head 3 | tee results.txt
```

### Background

Append `&` to run in background:
```
cd https://slow-site.com &
```

### Command substitution

Use `$()` to substitute command output:
```
cd $(wayback https://example.com 2020-01-01)
diff $(locate "config" | head 1) $(locate "config" | tail 1)
```

### Glob patterns (for cached pages)

```
locate "error" --in "api-*"      # search pages matching api-*
tar -c backup.tar news-*         # archive all news pages
```

### Selectors

CSS selectors in commands:
```
cat .article-body
ls nav a
cat h1:first
click button.submit
```

---

## Error Messages

| Error | Meaning |
|-------|---------|
| `error: no page loaded` | Run `cd <url>` first |
| `error: selector not found` | No elements match |
| `error: fetch failed` | Network error |
| `error: rate limited` | Too many requests |
| `error: outside chroot` | URL outside chroot boundary |
| `error: mount failed` | Could not mount API |
| `error: permission denied` | Auth required |
| `error: job not found` | Invalid PID/job number |
