#!/usr/bin/env bun

import { runCli } from "../src/cli";

await runCli(process.argv.slice(2));

