export interface TextMateGrammar {
  $schema: string;
  name: string;
  scopeName: string;
  fileTypes: string[];
  patterns: Array<Record<string, unknown>>;
  repository: Record<string, unknown>;
}

export function buildTextMateGrammar(): TextMateGrammar {
  return {
    $schema:
      "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
    name: "OpenProse",
    scopeName: "text.openprose.markdown",
    fileTypes: ["prose", "prose.md"],
    patterns: [
      { include: "#frontmatter" },
      { include: "#executionBlock" },
      { include: "#requiresSection" },
      { include: "#ensuresSection" },
      { include: "#servicesSection" },
      { include: "#effectsSection" },
      { include: "#accessSection" },
      { include: "#environmentSection" },
      { include: "#sectionHeader" },
    ],
    repository: {
      frontmatter: {
        begin: "^(---)\\s*$",
        beginCaptures: {
          "1": { name: "punctuation.definition.frontmatter.begin.openprose" },
        },
        end: "^(---)\\s*$",
        endCaptures: {
          "1": { name: "punctuation.definition.frontmatter.end.openprose" },
        },
        name: "meta.frontmatter.openprose",
        patterns: [
          {
            match:
              "^(kind)(\\s*:\\s*)(program|service|composite|test)\\s*$",
            captures: {
              "1": { name: "keyword.other.frontmatter.key.openprose" },
              "2": { name: "punctuation.separator.key-value.openprose" },
              "3": { name: "storage.type.component-kind.openprose" },
            },
          },
          {
            match: "^([A-Za-z0-9_-]+)(\\s*:\\s*)(.*)$",
            captures: {
              "1": { name: "keyword.other.frontmatter.key.openprose" },
              "2": { name: "punctuation.separator.key-value.openprose" },
            },
          },
        ],
      },
      sectionHeader: {
        match:
          "^(###)(\\s+)(Requires|Ensures|Services|Environment|Effects|Access|Execution|Runtime|Strategies|Shape|Errors|Finally|Catch|Invariants)\\b.*$",
        captures: {
          "1": { name: "punctuation.definition.heading.openprose" },
          "3": { name: "entity.name.section.openprose" },
        },
      },
      requiresSection: buildSectionRule("Requires", ["#portLine"]),
      ensuresSection: buildSectionRule("Ensures", ["#portLine"]),
      servicesSection: buildSectionRule("Services", ["#serviceLine"]),
      effectsSection: buildSectionRule("Effects", ["#effectLine"]),
      accessSection: buildSectionRule("Access", ["#accessLine"]),
      environmentSection: buildSectionRule("Environment", ["#environmentLine"]),
      portLine: {
        match:
          "^(\\s*[-*]\\s+)(`)([^`]+)(`)(\\s*:\\s*)([A-Za-z][A-Za-z0-9_./<>,\\-\\[\\]]*)?",
        captures: {
          "2": { name: "punctuation.definition.port.openprose" },
          "3": { name: "variable.parameter.port.openprose" },
          "4": { name: "punctuation.definition.port.openprose" },
          "5": { name: "punctuation.separator.port-type.openprose" },
          "6": { name: "support.type.port.openprose" },
        },
      },
      serviceLine: {
        match: "^(\\s*[-*]\\s+)(`?)([^`]+)(`?)\\s*$",
        captures: {
          "3": { name: "entity.name.service-ref.openprose" },
        },
      },
      effectLine: {
        match: "^(\\s*[-*]\\s+)(`)([^`]+)(`)(\\s*:)",
        captures: {
          "2": { name: "punctuation.definition.effect.openprose" },
          "3": { name: "keyword.other.effect.openprose" },
          "4": { name: "punctuation.definition.effect.openprose" },
          "5": { name: "punctuation.separator.key-value.openprose" },
        },
      },
      accessLine: {
        match: "^(\\s*[-*]\\s+)([A-Za-z0-9_.-]+)(\\s*:)(.*)$",
        captures: {
          "2": { name: "keyword.other.access-key.openprose" },
          "3": { name: "punctuation.separator.key-value.openprose" },
          "4": { name: "entity.name.label.access.openprose" },
        },
      },
      environmentLine: {
        match: "^(\\s*[-*]\\s+)(`?)([A-Z0-9_]+)(`?)(\\s*:)",
        captures: {
          "3": { name: "variable.other.environment.openprose" },
          "5": { name: "punctuation.separator.key-value.openprose" },
        },
      },
      executionBlock: {
        begin: "^(```)\\s*(prose)\\s*$",
        beginCaptures: {
          "1": { name: "punctuation.definition.fence.begin.openprose" },
          "2": { name: "entity.name.language.openprose" },
        },
        end: "^(```)\\s*$",
        endCaptures: {
          "1": { name: "punctuation.definition.fence.end.openprose" },
        },
        name: "markup.raw.block.prose.openprose",
        patterns: [{ include: "#prosescript" }],
      },
      prosescript: {
        patterns: [
          {
            match: "\\b(let|call|return|parallel|loop|condition|try|catch|finally)\\b",
            name: "keyword.control.prose.openprose",
          },
          {
            match: "(\\bcall\\s+)([A-Za-z0-9_.-]+)",
            captures: {
              "1": { name: "keyword.control.call.openprose" },
              "2": { name: "entity.name.function.call-target.openprose" },
            },
          },
          {
            match: "(\\breturn\\s+)([A-Za-z0-9_.-]+)",
            captures: {
              "1": { name: "keyword.control.return.openprose" },
              "2": { name: "variable.other.return-value.openprose" },
            },
          },
          {
            match: "^(\\s+)([A-Za-z0-9_.-]+)(\\s*:)",
            captures: {
              "2": { name: "variable.parameter.binding.openprose" },
              "3": { name: "punctuation.separator.key-value.openprose" },
            },
          },
        ],
      },
    },
  };
}

export function renderTextMateGrammar(pretty = true): string {
  return `${JSON.stringify(buildTextMateGrammar(), null, pretty ? 2 : 0)}\n`;
}

function buildSectionRule(name: string, includes: string[]): Record<string, unknown> {
  return {
    begin: `^(###)(\\s+)(${name})\\s*$`,
    beginCaptures: {
      "1": { name: "punctuation.definition.heading.openprose" },
      "3": { name: "entity.name.section.openprose" },
    },
    end: "^(?=###\\s+|##\\s+|```\\s*prose\\s*$)",
    patterns: includes.map((include) => ({ include })),
  };
}
