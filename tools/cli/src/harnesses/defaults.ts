export const CLAUDE_SDK_DEFAULTS = {
	model: "claude-sonnet-4-6",
	thinking: { type: "adaptive" as const },
} as const;

export const CODEX_SDK_DEFAULTS = {
	model: "gpt-5-codex",
} as const;

export function resolveClaudeModel(env: Record<string, string | undefined> | undefined): string {
	return env?.ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? CLAUDE_SDK_DEFAULTS.model;
}

export function resolveCodexModel(env: Record<string, string | undefined> | undefined): string {
	return env?.OPENAI_MODEL ?? env?.CODEX_MODEL ?? process.env.OPENAI_MODEL ?? process.env.CODEX_MODEL ?? CODEX_SDK_DEFAULTS.model;
}
