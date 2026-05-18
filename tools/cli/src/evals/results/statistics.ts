export interface WilcoxonSignedRankResult {
	method: "wilcoxon-signed-rank-exact";
	n: number;
	pValue: number;
	rankSumNegative: number;
	rankSumPositive: number;
	statistic: number;
}

export interface McNemarExactResult {
	method: "mcnemar-exact";
	b: number;
	c: number;
	n: number;
	pValue: number;
}

interface RankedDifference {
	absolute: number;
	rank: number;
	sign: -1 | 1;
}

export function wilcoxonSignedRank(left: readonly number[], right: readonly number[]): WilcoxonSignedRankResult {
	if (left.length !== right.length) {
		throw new Error(`paired Wilcoxon inputs must have equal length: ${left.length} != ${right.length}`);
	}

	const differences = left
		.map((value, index) => value - requireFinite(right[index], `right[${index}]`))
		.map((difference, index) => requireFinite(difference, `difference[${index}]`))
		.filter((difference) => difference !== 0);
	const ranked = rankAbsoluteDifferences(differences);
	const rankSumPositive = ranked.filter((item) => item.sign > 0).reduce((sum, item) => sum + item.rank, 0);
	const rankSumNegative = ranked.filter((item) => item.sign < 0).reduce((sum, item) => sum + item.rank, 0);
	const statistic = Math.min(rankSumPositive, rankSumNegative);

	return {
		method: "wilcoxon-signed-rank-exact",
		n: ranked.length,
		pValue: exactWilcoxonPValue(ranked.map((item) => item.rank), statistic),
		rankSumNegative,
		rankSumPositive,
		statistic,
	};
}

export function mcnemarExact(
	leftCorrect: readonly boolean[],
	rightCorrect: readonly boolean[],
): McNemarExactResult {
	if (leftCorrect.length !== rightCorrect.length) {
		throw new Error(`paired McNemar inputs must have equal length: ${leftCorrect.length} != ${rightCorrect.length}`);
	}

	let b = 0;
	let c = 0;
	for (const [index, left] of leftCorrect.entries()) {
		const right = rightCorrect[index] ?? false;
		if (left && !right) {
			b += 1;
		} else if (!left && right) {
			c += 1;
		}
	}

	const discordant = b + c;
	const tail = binomialCdf(Math.min(b, c), discordant, 0.5);
	return {
		method: "mcnemar-exact",
		b,
		c,
		n: discordant,
		pValue: Math.min(1, 2 * tail),
	};
}

function rankAbsoluteDifferences(differences: readonly number[]): RankedDifference[] {
	const sorted = differences
		.map((difference, index) => ({
			absolute: Math.abs(difference),
			index,
			sign: difference < 0 ? (-1 as const) : (1 as const),
		}))
		.sort((left, right) => left.absolute - right.absolute);
	const ranks = new Array<number>(differences.length);
	let index = 0;
	while (index < sorted.length) {
		let end = index + 1;
		while (end < sorted.length && sorted[end]?.absolute === sorted[index]?.absolute) {
			end += 1;
		}
		const rank = (index + 1 + end) / 2;
		for (let rankIndex = index; rankIndex < end; rankIndex += 1) {
			const item = sorted[rankIndex];
			if (item !== undefined) {
				ranks[item.index] = rank;
			}
		}
		index = end;
	}

	return differences.map((difference, differenceIndex) => ({
		absolute: Math.abs(difference),
		rank: ranks[differenceIndex] ?? 0,
		sign: difference < 0 ? -1 : 1,
	}));
}

function exactWilcoxonPValue(ranks: readonly number[], observedStatistic: number): number {
	if (ranks.length === 0) {
		return 1;
	}
	if (ranks.length > 20) {
		return normalApproximationPValue(ranks, observedStatistic);
	}

	const totalRank = ranks.reduce((sum, rank) => sum + rank, 0);
	const assignments = 2 ** ranks.length;
	let atLeastAsExtreme = 0;
	for (let mask = 0; mask < assignments; mask += 1) {
		let positive = 0;
		for (const [index, rank] of ranks.entries()) {
			if ((mask & (1 << index)) !== 0) {
				positive += rank;
			}
		}
		const statistic = Math.min(positive, totalRank - positive);
		if (statistic <= observedStatistic + Number.EPSILON) {
			atLeastAsExtreme += 1;
		}
	}

	return atLeastAsExtreme / assignments;
}

function normalApproximationPValue(ranks: readonly number[], observedStatistic: number): number {
	const n = ranks.length;
	const mean = (n * (n + 1)) / 4;
	const variance = (n * (n + 1) * (2 * n + 1)) / 24;
	const z = (observedStatistic - mean + 0.5) / Math.sqrt(variance);
	return Math.min(1, 2 * normalCdf(z));
}

function binomialCdf(k: number, n: number, p: number): number {
	if (n === 0) {
		return 1;
	}

	let sum = 0;
	for (let i = 0; i <= k; i += 1) {
		sum += binomialCoefficient(n, i) * p ** i * (1 - p) ** (n - i);
	}
	return sum;
}

function binomialCoefficient(n: number, k: number): number {
	if (k < 0 || k > n) {
		return 0;
	}
	const m = Math.min(k, n - k);
	let result = 1;
	for (let i = 1; i <= m; i += 1) {
		result = (result * (n - m + i)) / i;
	}
	return result;
}

function normalCdf(value: number): number {
	return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value: number): number {
	const sign = value < 0 ? -1 : 1;
	const x = Math.abs(value);
	const t = 1 / (1 + 0.3275911 * x);
	const y =
		1 -
		((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
			t *
			Math.exp(-x * x);
	return sign * y;
}

function requireFinite(value: number | undefined, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${path} must be a finite number`);
	}
	return value;
}
