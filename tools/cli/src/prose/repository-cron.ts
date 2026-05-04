export class RepositoryCronError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RepositoryCronError";
	}
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

const CRON_SEARCH_MINUTES = 5 * 366 * 24 * 60;

export function validateRepositoryCronExpression(cron: string, timezone?: string): void {
	parseCronSchedule(cron);
	if (timezone !== undefined) {
		validateTimeZone(timezone);
	}
	nextCronDate(cron, new Date("2026-01-01T00:00:00.000Z"), timezone);
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

	throw new RepositoryCronError(`Unable to find next time for cron '${cron}' within five years.`);
}

function parseCronSchedule(cron: string): CronSchedule {
	const fields = cron.trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new RepositoryCronError(`Cron '${cron}' must have five fields.`);
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
			throw new RepositoryCronError(`Invalid empty cron field part in '${field}'.`);
		}

		const [rangePart, stepPart] = part.split("/");
		const step = stepPart === undefined ? 1 : parsePositiveInteger(stepPart, `Invalid cron step '${stepPart}'.`);
		if (step < 1) {
			throw new RepositoryCronError(`Invalid cron step '${stepPart}'.`);
		}

		let start: number;
		let end: number;
		if (rangePart === "*") {
			wildcard = true;
			start = min;
			end = max;
		} else if (rangePart?.includes("-")) {
			const [startRaw, endRaw] = rangePart.split("-");
			start = parseCronValue(startRaw ?? "", min, max);
			end = parseCronValue(endRaw ?? "", min, max);
			if (start > end) {
				throw new RepositoryCronError(`Invalid cron range '${rangePart}'.`);
			}
		} else {
			start = parseCronValue(rangePart ?? "", min, max);
			end = start;
		}

		for (let value = start; value <= end; value += step) {
			values.add(mapSevenToZero && value === 7 ? 0 : value);
		}
	}

	return { values, wildcard };
}

function parseCronValue(value: string, min: number, max: number): number {
	const parsed = parsePositiveInteger(value, `Invalid cron value '${value}'.`);
	if (parsed < min || parsed > max) {
		throw new RepositoryCronError(`Cron value '${value}' must be between ${min} and ${max}.`);
	}
	return parsed;
}

function parsePositiveInteger(value: string, errorMessage: string): number {
	if (!/^\d+$/.test(value)) {
		throw new RepositoryCronError(errorMessage);
	}
	return Number(value);
}

function validateTimeZone(timezone: string): void {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
	} catch {
		throw new RepositoryCronError(`Invalid timezone '${timezone}'.`);
	}
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
			throw new RepositoryCronError(`Unable to parse weekday '${weekday}'.`);
	}
}
