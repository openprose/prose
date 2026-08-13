/// Returns markdown hover documentation for the word at (line, col).
/// Line and column are 0-indexed (LSP convention).
pub fn hover_at(source: &str, line: u32, col: u32) -> Option<String> {
    let target_line = source.lines().nth(line as usize)?;
    let trimmed = target_line.trim();

    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }

    let col = col as usize;
    if col >= target_line.len() {
        return None;
    }
    let bytes = target_line.as_bytes();
    if bytes.get(col).is_none_or(|&b| {
        b == b'"'
            || b == b' ' && col > 0 && {
                let before = &target_line[..col];
                let quotes = before.matches('"').count();
                quotes % 2 == 1
            }
    }) {
        return None;
    }

    let word = extract_word(target_line, col);
    if word.is_empty() {
        return None;
    }

    keyword_docs(word)
}

fn extract_word(line: &str, col: usize) -> &str {
    let bytes = line.as_bytes();
    let is_word = |b: u8| b.is_ascii_alphanumeric() || b == b'_' || b == b'-';
    if col >= bytes.len() || !is_word(bytes[col]) {
        return "";
    }
    let start = (0..col)
        .rev()
        .take_while(|&i| is_word(bytes[i]))
        .last()
        .unwrap_or(col);
    let end = (col..bytes.len())
        .take_while(|&i| is_word(bytes[i]))
        .last()
        .map_or(col + 1, |i| i + 1);
    &line[start..end]
}

fn keyword_docs(word: &str) -> Option<String> {
    let key = word.strip_suffix(':').unwrap_or(word);
    let doc = match key {
        "session" => {
            "**session** `\"prompt\"`\n\nA single LLM interaction turn. The prompt string is sent to the model as-is. Sessions execute sequentially unless inside a `parallel` block."
        }
        "agent" => {
            "**agent** `name:`\n\nDefines a named, reusable agent with specific configuration. Properties: `model`, `prompt`, `persist`, `context`, `retry`, `backoff`, `skills`, `permissions`."
        }
        "input" => {
            "**input** `name: \"prompt\"`\n\nDeclares a runtime input — pauses execution and prompts the user for a value. The result is available as a variable in subsequent sessions."
        }
        "output" => {
            "**output** `name: \"prompt\"`\n\nDeclares a named output that captures a value from the session for use downstream."
        }
        "loop" => {
            "**loop:**\n\nRepeats its body indefinitely (or until a `gate` breaks out). Contains sessions, agent invocations, or other control flow."
        }
        "gate" => {
            "**gate** `name:`\n\nA decision point that pauses execution for approval. Properties: `prompt`, `allow`, `timeout`, `on_reject`."
        }
        "exec" => "**exec:**\n\nExecutes a shell command. Properties: `timeout`, `cwd`, `on-fail`.",
        "resume" => {
            "**resume:** `agent_name`\n\nResumes a previously defined agent, continuing its conversation with persisted context."
        }
        "import" => "**import** `\"path\"`\n\nImports definitions from another `.prose` file.",
        "parallel" => {
            "**parallel:**\n\nExecutes its child sessions concurrently rather than sequentially."
        }
        "model" => {
            "**model:** `name`\n\nThe LLM model to use. Known values: `sonnet`, `opus`, `haiku`."
        }
        "prompt" => {
            "**prompt:** `\"text\"`\n\nThe system prompt or instruction for the agent or gate."
        }
        "persist" => {
            "**persist:** `bool`\n\nWhether the agent's conversation context persists across `resume` calls."
        }
        "context" => "**context:** `value`\n\nContext window configuration for the agent.",
        "retry" => "**retry:** `count`\n\nNumber of retry attempts on failure.",
        "backoff" => "**backoff:** `strategy`\n\nBackoff strategy between retries.",
        "skills" => "**skills:** `[list]`\n\nSkills available to the agent.",
        "permissions" => {
            "**permissions:** `type`\n\nAccess control for the agent. Types: `read`, `write`, `bash`, `web`, `edit`, `exec`. Values: `allow`, `deny`, `ask`, `prompt`."
        }
        "allow" => "**allow:** `[values]`\n\nAcceptable responses for a gate decision.",
        "timeout" => {
            "**timeout:** `duration`\n\nMaximum wait time before the operation fails or falls back."
        }
        "on_reject" | "on-reject" => {
            "**on_reject:** `action`\n\nAction to take when a gate decision is rejected."
        }
        "on_fail" | "on-fail" => {
            "**on_fail:** `action`\n\nAction to take when an exec command fails."
        }
        "cwd" => "**cwd:** `path`\n\nWorking directory for exec commands.",
        _ => return None,
    };
    Some(doc.to_string())
}
