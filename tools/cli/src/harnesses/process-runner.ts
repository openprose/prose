import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

import type { ProcessRunner } from "./types.js";

export const nodeProcessRunner: ProcessRunner = (command, args, options) => {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ? { ...process.env, ...options.env } : process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let settled = false;
		const abort = () => {
			const signal = toNodeSignal(options.signal?.reason) ?? "SIGTERM";
			if (!child.killed) {
				child.kill(signal);
			}
		};

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			options.stdout.write(chunk);
		});
		child.stderr.on("data", (chunk: string) => {
			options.stderr.write(chunk);
		});

		if (options.signal?.aborted) {
			abort();
		} else {
			options.signal?.addEventListener("abort", abort, { once: true });
		}

		child.on("error", (error) => {
			if (!settled) {
				settled = true;
				options.signal?.removeEventListener("abort", abort);
				reject(error);
			}
		});
		child.on("close", (exitCode, signal) => {
			if (settled) {
				return;
			}
			settled = true;
			options.signal?.removeEventListener("abort", abort);
			resolve({
				exitCode: exitCode ?? exitCodeForSignal(signal),
			});
		});
	});
};

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
	if (signal === null) {
		return 1;
	}

	const signalNumber = (osConstants.signals as Record<string, number | undefined>)[signal];
	return signalNumber === undefined ? 1 : 128 + signalNumber;
}

function toNodeSignal(value: unknown): NodeJS.Signals | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	return value in osConstants.signals ? (value as NodeJS.Signals) : undefined;
}
