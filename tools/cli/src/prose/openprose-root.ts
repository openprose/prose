import { stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export const ATTACHED_OPENPROSE_ROOT_PATH = ".agents/prose";

export type OpenProseRootMode = "native" | "attached";

export interface OpenProseRoot {
	mode: OpenProseRootMode;
	path: string;
	absolutePath: string;
}

export interface ResolveOpenProseRootOptions {
	cwd: string;
}

export async function resolveOpenProseRoot(options: ResolveOpenProseRootOptions): Promise<OpenProseRoot> {
	const containingAttachedRoot = findContainingAttachedRoot(options.cwd);
	if (containingAttachedRoot !== undefined) {
		return {
			mode: "attached",
			path: containingAttachedRoot,
			absolutePath: containingAttachedRoot,
		};
	}

	const attachedRoot = resolve(options.cwd, ATTACHED_OPENPROSE_ROOT_PATH);
	if (await isDirectory(attachedRoot)) {
		return {
			mode: "attached",
			path: ATTACHED_OPENPROSE_ROOT_PATH,
			absolutePath: attachedRoot,
		};
	}

	return {
		mode: "native",
		path: ".",
		absolutePath: resolve(options.cwd),
	};
}

export function rootRelativePath(root: OpenProseRoot, absolutePath: string): string {
	const relativePath = relative(root.absolutePath, absolutePath);
	return relativePath === "" ? "." : relativePath;
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

function findContainingAttachedRoot(cwd: string): string | undefined {
	const segments = resolve(cwd).split(sep);
	for (let index = 0; index < segments.length - 1; index += 1) {
		if (segments[index] === ".agents" && segments[index + 1] === "prose") {
			return segments.slice(0, index + 2).join(sep);
		}
	}
	return undefined;
}
