import { readFile } from "node:fs/promises";

import { validateEvalSuite } from "./schema.js";
import type { EvalSuite } from "./types.js";

export async function loadEvalSuite(path: string): Promise<EvalSuite> {
	const raw = await readFile(path, "utf8");
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse eval suite JSON at ${path}: ${message}`);
	}

	return validateEvalSuite(value);
}
