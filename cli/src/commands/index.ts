import type { Command } from "@oclif/core";
import Doctor from "./doctor.js";
import Examples from "./examples.js";
import Help from "./help.js";
import Inspect from "./inspect.js";
import Install from "./install.js";
import Lint from "./lint.js";
import Migrate from "./migrate.js";
import Preflight from "./preflight.js";
import Run from "./run.js";
import Status from "./status.js";
import Test from "./test.js";

export default {
	doctor: Doctor,
	examples: Examples,
	help: Help,
	inspect: Inspect,
	install: Install,
	lint: Lint,
	migrate: Migrate,
	preflight: Preflight,
	run: Run,
	status: Status,
	test: Test,
} satisfies Record<string, typeof Command>;
