import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import type { EvalArtifact, EvalArtifactStore, JsonValue } from "./types.js";

export interface FilesystemArtifactStoreOptions {
	root: string;
}

export function createFilesystemArtifactStore(options: FilesystemArtifactStoreOptions): EvalArtifactStore {
	const root = resolve(options.root);

	return {
		root,
		appendJsonl: (relativePath, value) =>
			writeArtifact(root, relativePath, `${JSON.stringify(value)}\n`, "application/jsonl", true),
		writeJson: (relativePath, value) =>
			writeArtifact(root, relativePath, `${JSON.stringify(value, null, 2)}\n`, "application/json", false),
		writeText: (relativePath, value, mediaType = "text/plain") =>
			writeArtifact(root, relativePath, value, mediaType, false),
	};
}

async function writeArtifact(
	root: string,
	relativePath: string,
	content: string,
	mediaType: string,
	append: boolean,
): Promise<EvalArtifact> {
	const path = resolveArtifactPath(root, relativePath);
	await mkdir(dirname(path), { recursive: true });
	if (append) {
		await appendFile(path, content, "utf8");
	} else {
		await writeFile(path, content, "utf8");
	}

	const info = await stat(path);
	return {
		path,
		mediaType,
		bytes: info.size,
	};
}

function resolveArtifactPath(root: string, relativePath: string): string {
	if (relativePath.trim() === "") {
		throw new Error("artifact path must be non-empty");
	}

	if (isAbsolute(relativePath)) {
		throw new Error(`artifact path must be relative: ${relativePath}`);
	}

	const path = resolve(root, relativePath);
	if (path !== root && !path.startsWith(`${root}/`)) {
		throw new Error(`artifact path escapes root: ${relativePath}`);
	}

	return path;
}
