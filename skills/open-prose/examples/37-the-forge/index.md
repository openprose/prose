---
name: the-forge
kind: program
services: [smith, smelter, hammer, quench, crucible]
---

### Requires

- test-url: URL to test the browser against (default: https://prose.md)

### Ensures

- browser: a working web browser in Rust that can fetch, parse HTML/CSS, execute JavaScript, and render to a native window

### Execution

```prose
# Phase 0: Project setup
let project = call smith
  task: "initialize the forge and plan the browser build"

let structure = call hammer
  task: "create Rust project structure with all modules"

call quench
  task: "verify project builds and tests pass"

# Phase 1: Networking
let http-design = call smelter
  task: "design HTTP/1.1 client with TLS support"

call hammer
  task: "implement HTTP client"
  design: http-design

loop until all networking tests pass (max: 5):
  let test-results = call quench
    task: "test HTTP client (plain, TLS, redirects, chunked)"
  if failures:
    call hammer
      task: "fix networking bugs"
      test-results: test-results

# Phase 2: HTML parsing
let html-design = call smelter
  task: "design HTML tokenizer and tree builder"

call hammer
  task: "implement HTML tokenizer and parser"
  design: html-design

loop until all HTML tests pass (max: 5):
  let test-results = call quench
    task: "test HTML parsing"
  if failures:
    call hammer
      task: "fix HTML parsing bugs"
      test-results: test-results

# Phase 3: CSS parsing
let css-design = call smelter
  task: "design CSS tokenizer and parser"

call hammer
  task: "implement CSS tokenizer and parser"
  design: css-design

loop until all CSS tests pass (max: 5):
  let test-results = call quench
    task: "test CSS parsing"
  if failures:
    call hammer
      task: "fix CSS parsing bugs"
      test-results: test-results

# Phase 4: Style resolution
let style-design = call smelter
  task: "design selector matching, cascade, and computed styles"

call hammer
  task: "implement style resolution"
  design: style-design

loop until all style tests pass (max: 5):
  let test-results = call quench
    task: "test style resolution"
  if failures:
    call hammer
      task: "fix style resolution bugs"
      test-results: test-results

# Phase 5: Layout
let layout-design = call smelter
  task: "design layout engine (block and inline)"

call hammer
  task: "implement layout engine"
  design: layout-design

loop until all layout tests pass (max: 5):
  let test-results = call quench
    task: "test layout engine"
  if failures:
    call hammer
      task: "fix layout bugs"
      test-results: test-results

# Phase 6: Painting and window
let paint-design = call smelter
  task: "design display list rasterizer with bitmap font"

call hammer
  task: "implement painting system and window shell"
  design: paint-design

loop until painting pipeline works (max: 5):
  let test-results = call quench
    task: "test full paint pipeline: HTML to window"
  if failures:
    call hammer
      task: "fix painting issues"
      test-results: test-results

# Phase 7: JavaScript engine (Crucible leads)
call crucible
  task: "coordinate JavaScript engine build"

let js-lexer-design = call smelter
  task: "design JavaScript lexer"

call hammer
  task: "implement JavaScript lexer"
  design: js-lexer-design

let js-parser-design = call smelter
  task: "design JavaScript parser with Pratt parsing"

call hammer
  task: "implement JavaScript parser and AST"
  design: js-parser-design

let js-value-design = call smelter
  task: "design JavaScript value representation and GC"

call hammer
  task: "implement JavaScript values and garbage collector"
  design: js-value-design

let js-bytecode-design = call smelter
  task: "design bytecode instruction set"

call hammer
  task: "implement bytecode compiler"
  design: js-bytecode-design

call hammer
  task: "implement JavaScript VM"
  design: js-bytecode-design

call hammer
  task: "implement JavaScript builtins (Object, Array, String, console, Math)"

loop until JS engine passes all tests (max: 10):
  let test-results = call quench
    task: "test JavaScript engine"
  if failures:
    call crucible
      task: "analyze JS engine bugs"
      test-results: test-results
    call hammer
      task: "fix JS engine bugs"

# Phase 8: DOM bindings
let bindings-design = call smelter
  task: "design DOM bindings and event system"

call hammer
  task: "implement DOM bindings (document, element, events)"
  design: bindings-design

loop until DOM bindings work (max: 5):
  let test-results = call quench
    task: "test DOM bindings and event dispatch"
  if failures:
    call hammer
      task: "fix DOM binding issues"
      test-results: test-results

# Phase 9: Integration
call hammer
  task: "implement full browser integration and URL bar"

loop until browser works end-to-end (max: 10):
  let test-results = call quench
    task: "integration test: fetch, parse, render, interact"
    test-url: test-url
  if failures:
    call smith
      task: "diagnose integration issues"
      test-results: test-results
    call hammer
      task: "fix integration issues"

let browser = call smith
  task: "final inventory and README"

return browser
```
