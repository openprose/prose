// prepack: copy the repo's open-prose SKILL bundle into this package so a bare
// `npm i @openprose/reactor` carries its own render VM. A render IS the SKILL
// (architecture.md §1), so the SDK must be able to find SKILL.md on any machine
// without a baked-in author path or a separate `npx skills add` step. The bundled
// copy is the second resolution candidate in
// `src/adapters/agent-render/instructions.ts` (after REACTOR_SKILL_PATH).
//
// This runs at `pnpm pack` / publish time only; `<pkg>/skill/` is gitignored and
// the dev/monorepo path resolves the skill by walking up to repo `skills/`.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <pkg>/scripts
const pkgRoot = dirname(here); // <pkg>

// Find skills/open-prose by walking up from the package root to the repo root.
let src = null;
let dir = pkgRoot;
for (let i = 0; i < 8; i++) {
  const cand = join(dir, "skills", "open-prose");
  if (existsSync(join(cand, "SKILL.md"))) {
    src = cand;
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) {
    break;
  }
  dir = parent;
}

if (src === null) {
  console.error(
    "[bundle-skill] could not locate skills/open-prose to bundle — " +
      "the packed tarball would ship without its render VM. Aborting pack.",
  );
  process.exit(1);
}

const dest = join(pkgRoot, "skill", "open-prose");
rmSync(join(pkgRoot, "skill"), { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[bundle-skill] bundled ${src} -> ${dest}`);
