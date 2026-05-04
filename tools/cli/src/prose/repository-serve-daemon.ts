import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import type { AddressInfo } from "node:net";
import type { WritableStreamLike } from "../harnesses/types.js";
import {
	dispatchRepositoryServeEvent,
	formatRepositoryServeSummary,
	formatTriggerRegistration,
	prepareRepositoryServe,
	RepositoryServeError,
	type LaunchActivationRunOptions,
	type LoadActiveRepositoryIrOptions,
	type RepositoryServeDispatchResult,
	type RepositoryServeEvent,
	type RepositoryServeSummary,
	type RepositoryServeTriggerRegistration,
} from "./repository-serve.js";

export const DEFAULT_REPOSITORY_SERVE_HOST = "127.0.0.1";
export const DEFAULT_REPOSITORY_SERVE_PORT = 7331;

export interface RepositoryServeTimerHandle {
	cancel(): void;
}

export interface RepositoryServeTimerScheduler {
	setTimeout(callback: () => void | Promise<void>, delayMs: number): RepositoryServeTimerHandle;
}

export interface RepositoryServeDaemonOptions extends LoadActiveRepositoryIrOptions {
	commandRunner: LaunchActivationRunOptions["commandRunner"];
	env: Readonly<Record<string, string | undefined>>;
	host?: string;
	port?: number;
	signal?: AbortSignal;
	stderr: WritableStreamLike;
	stdout: WritableStreamLike;
	now?: () => Date;
	timerScheduler?: RepositoryServeTimerScheduler;
}

export interface RepositoryServeDaemonAddress {
	host: string;
	port: number;
	url: string;
}

export interface RepositoryServeDaemon {
	summary: RepositoryServeSummary;
	address?: RepositoryServeDaemonAddress;
	closed: Promise<void>;
	dispatchEvent(event: RepositoryServeEvent): Promise<RepositoryServeDispatchResult>;
	stop(): Promise<void>;
}

interface CronField {
	values: Set<number>;
	wildcard: boolean;
}

interface CronSchedule {
	minute: CronField;
	hour: CronField;
	dayOfMonth: CronField;
	month: CronField;
	dayOfWeek: CronField;
}

interface CronDateParts {
	minute: number;
	hour: number;
	dayOfMonth: number;
	month: number;
	dayOfWeek: number;
}

const MAX_TIMER_DELAY_MS = 2_147_483_647;
const CRON_SEARCH_MINUTES = 5 * 366 * 24 * 60;

export async function startRepositoryServeDaemon(
	options: RepositoryServeDaemonOptions,
): Promise<RepositoryServeDaemon> {
	const summary = await prepareRepositoryServe(options);
	const host = options.host ?? DEFAULT_REPOSITORY_SERVE_HOST;
	const port = options.port ?? DEFAULT_REPOSITORY_SERVE_PORT;
	const now = options.now ?? (() => new Date());
	const timerScheduler = options.timerScheduler ?? nodeTimerScheduler;
	const timers: RepositoryServeTimerHandle[] = [];
	const inflight = new Set<Promise<unknown>>();
	const httpRegistrations = summary.registrations.filter((registration) => registration.adapter === "http");
	const timerRegistrations = summary.registrations.filter((registration) => registration.adapter === "timer");
	let httpServer: ServerType | undefined;
	let closed = false;
	let cleanupSignal = () => {};

	const dispatchEvent = async (event: RepositoryServeEvent): Promise<RepositoryServeDispatchResult> => {
		const dispatch = dispatchRepositoryServeEvent({
			loaded: summary.loaded,
			event,
			run: {
				commandRunner: options.commandRunner,
				cwd: options.cwd,
				env: options.env,
				stderr: options.stderr,
				stdout: options.stdout,
				...(options.signal === undefined ? {} : { signal: options.signal }),
			},
		});
		track(dispatch, inflight);
		return dispatch;
	};

	options.stdout.write(`${formatRepositoryServeSummary(summary)}\n`);

	let address: RepositoryServeDaemonAddress | undefined;
	try {
		for (const registration of timerRegistrations) {
			timers.push(
				startCronTimer({
					dispatchEvent,
					now,
					registration,
					scheduler: timerScheduler,
					stderr: options.stderr,
					stdout: options.stdout,
				}),
			);
		}

		if (httpRegistrations.length > 0) {
			const app = buildHttpApp({
				dispatchEvent,
				now,
				registrations: httpRegistrations,
				stderr: options.stderr,
			});
			const started = await startHttpServer(app, host, port);
			httpServer = started.server;
			address = started.address;
			options.stdout.write(`HTTP listening on ${address.url}\n`);
		}
	} catch (error) {
		for (const timer of timers) {
			timer.cancel();
		}
		if (httpServer !== undefined) {
			await closeHttpServer(httpServer);
		}
		throw error;
	}

	if (timerRegistrations.length === 0 && httpRegistrations.length === 0) {
		options.stdout.write("No live cron or HTTP triggers registered.\n");
	}
	options.stdout.write("OpenProse serve is running. Stop with Ctrl-C.\n");

	let resolveClosed!: () => void;
	const closedPromise = new Promise<void>((resolve) => {
		resolveClosed = resolve;
	});

	const stop = async () => {
		if (closed) {
			return;
		}
		closed = true;
		cleanupSignal();
		for (const timer of timers) {
			timer.cancel();
		}
		if (httpServer !== undefined) {
			await closeHttpServer(httpServer);
		}
		await Promise.allSettled([...inflight]);
		options.stdout.write("OpenProse serve stopped.\n");
		resolveClosed();
	};

	if (options.signal?.aborted) {
		await stop();
	} else if (options.signal !== undefined) {
		const onAbort = () => {
			void stop();
		};
		options.signal.addEventListener("abort", onAbort, { once: true });
		cleanupSignal = () => {
			options.signal?.removeEventListener("abort", onAbort);
		};
	}

	return {
		summary,
		...(address === undefined ? {} : { address }),
		closed: closedPromise,
		dispatchEvent,
		stop,
	};
}

export function millisecondsUntilNextCron(cron: string, from = new Date(), timezone?: string): number {
	return nextCronDate(cron, from, timezone).getTime() - from.getTime();
}

export function nextCronDate(cron: string, after = new Date(), timezone?: string): Date {
	const schedule = parseCronSchedule(cron);
	const candidate = new Date(after.getTime());
	candidate.setSeconds(0, 0);
	candidate.setMinutes(candidate.getMinutes() + 1);

	for (let index = 0; index < CRON_SEARCH_MINUTES; index += 1) {
		if (cronMatchesDate(schedule, candidate, timezone)) {
			return candidate;
		}
		candidate.setMinutes(candidate.getMinutes() + 1);
	}

	throw new RepositoryServeError(`Unable to find next time for cron '${cron}' within five years.`);
}

function startCronTimer(options: {
	dispatchEvent(event: RepositoryServeEvent): Promise<RepositoryServeDispatchResult>;
	now: () => Date;
	registration: RepositoryServeTriggerRegistration;
	scheduler: RepositoryServeTimerScheduler;
	stderr: WritableStreamLike;
	stdout: WritableStreamLike;
}): RepositoryServeTimerHandle {
	const { registration } = options;
	if (registration.cron === undefined) {
		throw new RepositoryServeError(`Cron trigger '${registration.triggerId}' is missing cron.`);
	}
	const cron = registration.cron;

	let cancelled = false;
	let currentTimer: RepositoryServeTimerHandle | undefined;
	let due = nextCronDate(cron, options.now(), registration.timezone);

	const schedule = () => {
		if (cancelled) {
			return;
		}
		const delay = Math.max(0, due.getTime() - options.now().getTime());
		currentTimer = options.scheduler.setTimeout(async () => {
			if (cancelled) {
				return;
			}
			if (options.now().getTime() < due.getTime()) {
				schedule();
				return;
			}

			const scheduledAt = due;
			options.stdout.write(`Trigger ${registration.triggerId} fired from ${formatTriggerRegistration(registration)}\n`);
			try {
				await options.dispatchEvent({
					triggerId: registration.triggerId,
					payload: {
						kind: "openprose.cron-event",
						cron,
						firedAt: options.now().toISOString(),
						scheduledAt: scheduledAt.toISOString(),
					},
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				options.stderr.write(`Trigger ${registration.triggerId} failed: ${message}\n`);
			}

			due = nextCronDate(cron, options.now(), registration.timezone);
			schedule();
		}, Math.min(delay, MAX_TIMER_DELAY_MS));
	};

	options.stdout.write(
		`Registered ${registration.triggerId} [${formatTriggerRegistration(registration)}]; next ${due.toISOString()}\n`,
	);
	schedule();

	return {
		cancel() {
			cancelled = true;
			currentTimer?.cancel();
		},
	};
}

function buildHttpApp(options: {
	dispatchEvent(event: RepositoryServeEvent): Promise<RepositoryServeDispatchResult>;
	now: () => Date;
	registrations: RepositoryServeTriggerRegistration[];
	stderr: WritableStreamLike;
}): Hono {
	const app = new Hono();
	const routes = new Map<string, RepositoryServeTriggerRegistration[]>();
	app.get("/_openprose/health", (context) => context.json({ ok: true }));

	for (const registration of options.registrations) {
		if (registration.method === undefined || registration.path === undefined) {
			throw new RepositoryServeError(`HTTP trigger '${registration.triggerId}' is missing method or path.`);
		}
		const method = registration.method.toUpperCase();
		const key = `${method} ${registration.path}`;
		routes.set(key, [...(routes.get(key) ?? []), registration]);
	}

	for (const [key, registrations] of routes) {
		const [method, path] = splitRouteKey(key);
		app.on(method, path, async (context) => {
			const payload = await buildHttpEventPayload(context.req.raw, options.now());
			const results: RepositoryServeDispatchResult[] = [];
			try {
				for (const registration of registrations) {
					results.push(
						await options.dispatchEvent({
							triggerId: registration.triggerId,
							payload,
						}),
					);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				options.stderr.write(`HTTP trigger ${key} failed: ${message}\n`);
				return context.json({ ok: false, error: message }, 500);
			}

			return context.json({
				ok: true,
				results: results.map((result) => ({
					triggerId: result.triggerId,
					activations: result.activationResults,
				})),
			});
		});
	}

	return app;
}

async function buildHttpEventPayload(request: Request, receivedAt: Date): Promise<Record<string, unknown>> {
	const url = new URL(request.url);
	const contentType = request.headers.get("content-type") ?? "";
	const payload: Record<string, unknown> = {
		kind: "openprose.http-event",
		method: request.method,
		path: url.pathname,
		query: Object.fromEntries(url.searchParams.entries()),
		receivedAt: receivedAt.toISOString(),
	};

	if (request.body !== null) {
		const body = contentType.includes("application/json") ? await readJsonOrText(request) : await request.text();
		if (!(typeof body === "string" && body.length === 0)) {
			payload.body = body;
		}
	}

	return payload;
}

async function readJsonOrText(request: Request): Promise<unknown> {
	try {
		return await request.clone().json();
	} catch {
		return request.text();
	}
}

async function startHttpServer(
	app: Hono,
	host: string,
	port: number,
): Promise<{ address: RepositoryServeDaemonAddress; server: ServerType }> {
	let server: ServerType | undefined;
	const info = await new Promise<AddressInfo>((resolve, reject) => {
		server = serve(
			{
				fetch: app.fetch,
				hostname: host,
				port,
			},
			(address) => {
				server?.off("error", reject);
				resolve(address);
			},
		);
		server.once("error", reject);
	});

	if (server === undefined) {
		throw new RepositoryServeError("Unable to start HTTP listener.");
	}

	const resolvedHost = info.address === "::" ? host : info.address;
	return {
		server,
		address: {
			host: resolvedHost,
			port: info.port,
			url: `http://${resolvedHost}:${info.port}`,
		},
	};
}

async function closeHttpServer(server: ServerType): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error?: Error) => {
			if (error !== undefined) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

function track<T>(promise: Promise<T>, inflight: Set<Promise<unknown>>): void {
	inflight.add(promise);
	void promise.finally(() => {
		inflight.delete(promise);
	});
}

const nodeTimerScheduler: RepositoryServeTimerScheduler = {
	setTimeout(callback, delayMs) {
		const timeout = setTimeout(() => {
			void callback();
		}, delayMs);
		return {
			cancel() {
				clearTimeout(timeout);
			},
		};
	},
};

function parseCronSchedule(cron: string): CronSchedule {
	const fields = cron.trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new RepositoryServeError(`Cron '${cron}' must have five fields.`);
	}

	return {
		minute: parseCronField(fields[0]!, 0, 59),
		hour: parseCronField(fields[1]!, 0, 23),
		dayOfMonth: parseCronField(fields[2]!, 1, 31),
		month: parseCronField(fields[3]!, 1, 12),
		dayOfWeek: parseCronField(fields[4]!, 0, 7, true),
	};
}

function parseCronField(field: string, min: number, max: number, mapSevenToZero = false): CronField {
	const values = new Set<number>();
	const parts = field.split(",");
	let wildcard = false;

	for (const rawPart of parts) {
		const part = rawPart.trim();
		if (part.length === 0) {
			throw new RepositoryServeError(`Invalid empty cron field part in '${field}'.`);
		}

		const [rangePart, stepPart] = part.split("/");
		const step = stepPart === undefined ? 1 : parsePositiveInteger(stepPart, `Invalid cron step '${stepPart}'.`);
		if (step < 1) {
			throw new RepositoryServeError(`Invalid cron step '${stepPart}'.`);
		}

		let start: number;
		let end: number;
		if (rangePart === "*") {
			wildcard = true;
			start = min;
			end = max;
		} else if (rangePart?.includes("-")) {
			const [startRaw, endRaw] = rangePart.split("-");
			start = parseCronValue(startRaw ?? "", min, max, mapSevenToZero);
			end = parseCronValue(endRaw ?? "", min, max, mapSevenToZero);
			if (start > end && !(mapSevenToZero && end === 0)) {
				throw new RepositoryServeError(`Invalid cron range '${rangePart}'.`);
			}
		} else {
			start = parseCronValue(rangePart ?? "", min, max, mapSevenToZero);
			end = start;
		}

		if (mapSevenToZero && end === 0 && start > end) {
			for (let value = start; value <= 6; value += step) {
				values.add(value);
			}
			values.add(0);
			continue;
		}

		for (let value = start; value <= end; value += step) {
			values.add(mapSevenToZero && value === 7 ? 0 : value);
		}
	}

	return { values, wildcard };
}

function parseCronValue(value: string, min: number, max: number, mapSevenToZero: boolean): number {
	const parsed = parsePositiveInteger(value, `Invalid cron value '${value}'.`);
	if (parsed < min || parsed > max) {
		throw new RepositoryServeError(`Cron value '${value}' must be between ${min} and ${max}.`);
	}
	return mapSevenToZero && parsed === 7 ? 0 : parsed;
}

function parsePositiveInteger(value: string, errorMessage: string): number {
	if (!/^\d+$/.test(value)) {
		throw new RepositoryServeError(errorMessage);
	}
	return Number(value);
}

function cronMatchesDate(schedule: CronSchedule, date: Date, timezone?: string): boolean {
	const parts = cronDateParts(date, timezone);
	const dayOfMonthMatches = schedule.dayOfMonth.values.has(parts.dayOfMonth);
	const dayOfWeekMatches = schedule.dayOfWeek.values.has(parts.dayOfWeek);
	const dayMatches =
		schedule.dayOfMonth.wildcard && schedule.dayOfWeek.wildcard
			? true
			: schedule.dayOfMonth.wildcard
				? dayOfWeekMatches
				: schedule.dayOfWeek.wildcard
					? dayOfMonthMatches
					: dayOfMonthMatches || dayOfWeekMatches;

	return (
		schedule.minute.values.has(parts.minute) &&
		schedule.hour.values.has(parts.hour) &&
		schedule.month.values.has(parts.month) &&
		dayMatches
	);
}

function cronDateParts(date: Date, timezone?: string): CronDateParts {
	if (timezone === undefined) {
		return {
			minute: date.getMinutes(),
			hour: date.getHours(),
			dayOfMonth: date.getDate(),
			month: date.getMonth() + 1,
			dayOfWeek: date.getDay(),
		};
	}

	const parts = new Intl.DateTimeFormat("en-US", {
		day: "numeric",
		hour: "numeric",
		hourCycle: "h23",
		minute: "numeric",
		month: "numeric",
		timeZone: timezone,
		weekday: "short",
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
	const weekday = part("weekday").slice(0, 3).toLowerCase();

	return {
		minute: Number(part("minute")),
		hour: Number(part("hour")),
		dayOfMonth: Number(part("day")),
		month: Number(part("month")),
		dayOfWeek: weekdayToNumber(weekday),
	};
}

function weekdayToNumber(weekday: string): number {
	switch (weekday) {
		case "sun":
			return 0;
		case "mon":
			return 1;
		case "tue":
			return 2;
		case "wed":
			return 3;
		case "thu":
			return 4;
		case "fri":
			return 5;
		case "sat":
			return 6;
		default:
			throw new RepositoryServeError(`Unable to parse weekday '${weekday}'.`);
	}
}

function splitRouteKey(key: string): [string, string] {
	const separator = key.indexOf(" ");
	if (separator === -1) {
		throw new RepositoryServeError(`Invalid route key '${key}'.`);
	}
	return [key.slice(0, separator), key.slice(separator + 1)];
}
