import { Command, Flags } from "@oclif/core";
import { HARNESS_NAMES } from "../harnesses/index.js";
import {
	buildOpenProseSkillInstallCommand,
	checkOpenProseSkill,
	formatSkillStatus,
	installOpenProseSkill,
	skillAgentsForHarness,
	type SkillAgent,
} from "../skills/open-prose.js";

export default class Doctor extends Command {
	static summary = "Check the local OpenProse CLI setup.";
	static usage = "doctor [--harness <name>] [--install]";
	static examples = ["<%= config.bin %> doctor", "<%= config.bin %> doctor --harness claude-sdk --install"];
	static flags = {
		harness: Flags.string({
			description: "Limit checks to the skill locations used by one harness.",
			options: [...HARNESS_NAMES],
		}),
		install: Flags.boolean({
			description: "Install any missing OpenProse skill with npx skills.",
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Doctor);
		const agents = selectedAgents(flags.harness);

		if (agents.length === 0) {
			this.log("OpenProse skill: not required for the selected harness.");
			return;
		}

		const initial = await checkOpenProseSkill({ agents, cwd: process.cwd(), env: process.env });
		const missing = initial.filter((status) => !status.installed).map((status) => status.agent);

		if (missing.length > 0 && flags.install) {
			this.log(`OpenProse skill: installing for ${missing.join(", ")}...`);
			const result = await installOpenProseSkill({
				agents: missing,
				cwd: process.cwd(),
				env: process.env,
				stdout: process.stderr,
				stderr: process.stderr,
			});

			if (result.exitCode !== 0) {
				this.error(`OpenProse skill install failed with exit code ${result.exitCode}.`, { exit: result.exitCode });
			}
		}

		const statuses = flags.install
			? await checkOpenProseSkill({ agents, cwd: process.cwd(), env: process.env })
			: initial;

		this.log("OpenProse skill:");
		for (const status of statuses) {
			this.log(`  ${formatSkillStatus(status)}`);
		}

		const stillMissing = statuses.filter((status) => !status.installed).map((status) => status.agent);
		if (stillMissing.length > 0) {
			this.log("");
			this.log("Install missing skill support with:");
			this.log(`  ${buildOpenProseSkillInstallCommand(stillMissing).argsWithCommand.join(" ")}`);
			this.exit(1);
		}
	}
}

function selectedAgents(harness: string | undefined): SkillAgent[] {
	if (harness) {
		return skillAgentsForHarness(harness);
	}

	return ["codex", "claude-code"];
}
