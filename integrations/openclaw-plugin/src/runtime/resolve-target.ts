/**
 * Program target resolution.
 *
 * Resolves user input to a concrete program source:
 *  - Local file path
 *  - Direct URL (http:// or https://)
 *  - Registry shorthand (@owner/slug or owner/slug)
 */

export type TargetKind = "local" | "url" | "registry";

export interface ResolvedTarget {
  kind: TargetKind;
  raw: string;
  resolved: string;
  format: "md" | "prose" | "unknown";
}

export function resolveTarget(
  input: string,
  registryBaseUrl: string = "https://p.prose.md",
): ResolvedTarget {
  const raw = input.trim();

  if (!raw) {
    throw new Error("Empty target. Provide a file path, URL, or @owner/slug.");
  }

  // Direct URL
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return {
      kind: "url",
      raw,
      resolved: raw,
      format: detectFormat(raw),
    };
  }

  // Registry shorthand: @owner/slug or owner/slug (when it contains exactly one slash and no dots/spaces)
  if (raw.startsWith("@") || isRegistryShorthand(raw)) {
    const slug = raw.startsWith("@") ? raw.slice(1) : raw;
    const resolved = `${registryBaseUrl.replace(/\/$/, "")}/${slug}`;
    return {
      kind: "registry",
      raw,
      resolved,
      format: "md", // Registry always serves current format
    };
  }

  // Local file
  return {
    kind: "local",
    raw,
    resolved: raw,
    format: detectFormat(raw),
  };
}

function isRegistryShorthand(input: string): boolean {
  const parts = input.split("/");
  if (parts.length !== 2) return false;
  // Both parts must be non-empty, no dots, no spaces
  return parts.every((p) => p.length > 0 && !p.includes(".") && !p.includes(" "));
}

function detectFormat(path: string): "md" | "prose" | "unknown" {
  if (path.endsWith(".md")) return "md";
  if (path.endsWith(".prose")) return "prose";
  return "unknown";
}
