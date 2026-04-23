export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[`'"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "component";
}

export function stripTicks(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function normalizeSectionName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

