import { Command } from "@oclif/core";
import {
	DEFAULT_REPOSITORY_SERVE_HOST,
	DEFAULT_REPOSITORY_SERVE_PORT,
	RepositoryServeError,
	startRepositoryServeDaemon,
} from "../prose/index.js";
import { runForwardedProseCommand } from "./base.js";

export default class Serve extends Command {
	static summary = "Serve compiled OpenProse repository IR as live trigger adapters.";
	static usage = "serve [--host <host>] [--port <port>] [--harness <name>]";
	static strict = false;

	async run(): Promise<void> {
		const controller = new AbortController();
		const cleanup = forwardProcessSignals(controller);

		try {
			const args = parseServeArgs(this.argv);
			const daemon = await startRepositoryServeDaemon({
				cwd: process.cwd(),
				env: args.harness === undefined ? process.env : { ...process.env, PROSE_HARNESS: args.harness },
				host: args.host,
				port: args.port,
				signal: controller.signal,
				stderr: process.stderr,
				stdout: process.stdout,
				commandRunner: runForwardedProseCommand,
			});
			await daemon.closed;
		} catch (error) {
			if (error instanceof RepositoryServeError) {
				const details = error.details.length === 0 ? "" : `\n${error.details.map((detail) => `- ${detail}`).join("\n")}`;
				this.error(`${error.message}${details}`, { exit: 1 });
			}
			const message = error instanceof Error ? error.message : String(error);
			this.error(message, { exit: 1 });
		} finally {
			cleanup();
		}
	}
}

interface ServeArgs {
	host: string;
	port: number;
	harness?: string;
}

function parseServeArgs(argv: readonly string[]): ServeArgs {
	let host = DEFAULT_REPOSITORY_SERVE_HOST;
	let port = DEFAULT_REPOSITORY_SERVE_PORT;
	let harness: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === undefined) {
			continue;
		}
		if (arg === "--host") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("-")) {
				throw new RepositoryServeError("Missing value for --host.");
			}
			host = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--host=")) {
			host = arg.slice("--host=".length);
			if (host.length === 0) {
				throw new RepositoryServeError("Missing value for --host.");
			}
			continue;
		}
		if (arg === "--port") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("-")) {
				throw new RepositoryServeError("Missing value for --port.");
			}
			port = parsePort(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--port=")) {
			port = parsePort(arg.slice("--port=".length));
			continue;
		}
		if (arg === "--harness") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("-")) {
				throw new RepositoryServeError("Missing value for --harness.");
			}
			harness = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--harness=")) {
			harness = arg.slice("--harness=".length);
			if (harness.length === 0) {
				throw new RepositoryServeError("Missing value for --harness.");
			}
			continue;
		}

		throw new RepositoryServeError(`Unexpected argument '${arg}' for 'prose serve'.`);
	}

	return { host, port, ...(harness === undefined ? {} : { harness }) };
}

function parsePort(value: string): number {
	if (!/^\d+$/.test(value)) {
		throw new RepositoryServeError("--port must be a number.");
	}
	const port = Number(value);
	if (!Number.isInteger(port) || port < 0 || port > 65_535) {
		throw new RepositoryServeError("--port must be between 0 and 65535.");
	}
	return port;
}

function forwardProcessSignals(controller: AbortController): () => void {
	const onSignal = (signal: NodeJS.Signals) => {
		if (!controller.signal.aborted) {
			controller.abort(signal);
		}
	};
	const onSigint = () => onSignal("SIGINT");
	const onSigterm = () => onSignal("SIGTERM");
	process.once("SIGINT", onSigint);
	process.once("SIGTERM", onSigterm);
	return () => {
		process.off("SIGINT", onSigint);
		process.off("SIGTERM", onSigterm);
	};
}
