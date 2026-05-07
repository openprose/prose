import { stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";

export const ATTACHED_OPENPROSE_ROOT_PATH = ".agents/prose";
export const USER_OPENPROSE_ROOT_PATH = "~/.agents/prose";
const TEMP_ROOTS = uniquePaths([tmpdir(), "/tmp", "/private/tmp"]);

export type OpenProseRootMode = "native" | "attached" | "user";

export interface OpenProseRoot {
	mode: OpenProseRootMode;
	path: string;
	absolutePath: string;
}

export interface ResolveOpenProseRootOptions {
	cwd: string;
	home?: string;
}

export async function resolveOpenProseRoot(options: ResolveOpenProseRootOptions): Promise<OpenProseRoot> {
	const home = resolve(options.home ?? homedir());
	const userRoot = resolve(home, ".agents/prose");
	if (isSameOrInside(resolve(options.cwd), userRoot)) {
		return {
			mode: "user",
			path: USER_OPENPROSE_ROOT_PATH,
			absolutePath: userRoot,
		};
	}

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

	const enclosingAttachedRoot = await findEnclosingAttachedRoot(options.cwd);
	if (enclosingAttachedRoot !== undefined) {
		return {
			mode: "attached",
			path: enclosingAttachedRoot,
			absolutePath: enclosingAttachedRoot,
		};
	}

	const nativeRoot = await findNativeRepositoryRoot(options.cwd);
	if (nativeRoot !== undefined) {
		return {
			mode: "native",
			path: isSamePath(nativeRoot, options.cwd) ? "." : nativeRoot,
			absolutePath: nativeRoot,
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

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
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

async function findEnclosingAttachedRoot(cwd: string): Promise<string | undefined> {
	for (let current = resolve(cwd); ; current = dirname(current)) {
		const attachedRoot = resolve(current, ATTACHED_OPENPROSE_ROOT_PATH);
		if (await isDirectory(attachedRoot)) {
			return attachedRoot;
		}
		if (dirname(current) === current) {
			return undefined;
		}
	}
}

async function findNativeRepositoryRoot(cwd: string): Promise<string | undefined> {
	const tempBoundary = findTempWorkspaceBoundary(cwd);
	for (let current = resolve(cwd); ; current = dirname(current)) {
		if ((await pathExists(resolve(current, "prose.lock"))) || (await pathExists(resolve(current, ".git")))) {
			return current;
		}
		if (tempBoundary !== undefined && isSamePath(current, tempBoundary)) {
			return undefined;
		}
		if (dirname(current) === current) {
			return undefined;
		}
	}
}

function isSameOrInside(path: string, parent: string): boolean {
	const relativePath = relative(parent, path);
	return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith(sep));
}

function isSamePath(left: string, right: string): boolean {
	return resolve(left) === resolve(right);
}

function findTempWorkspaceBoundary(cwd: string): string | undefined {
	const absoluteCwd = resolve(cwd);
	for (const tempRoot of TEMP_ROOTS) {
		if (!isSameOrInside(absoluteCwd, tempRoot)) {
			continue;
		}
		const [firstSegment] = relative(tempRoot, absoluteCwd).split(sep).filter(Boolean);
		return firstSegment === undefined ? tempRoot : resolve(tempRoot, firstSegment);
	}
	return undefined;
}

function uniquePaths(paths: string[]): string[] {
	return [...new Set(paths.map((path) => resolve(path)))];
}
