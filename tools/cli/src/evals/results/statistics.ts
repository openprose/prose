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

export interface PairedPowerPilotResult {
	method: "phase-1b-paired-pilot-normal-approximation";
	pilotN: number;
	pairedTokenDeltaSd: number;
	minimumTokenEffect: number;
	wilcoxonApproxN: number;
	correctnessDiscordanceRate: number;
	mcnemarApproxN: number;
	recommendedN: number;
	floorN: number;
}

export interface BcaBootstrapConfidenceInterval {
	method: "bca-bootstrap-paired-difference";
	statistic: "median";
	confidenceLevel: number;
	resamples: number;
	n: number;
	estimate: number;
	lower: number;
	upper: number;
	acceleration: number;
	biasCorrection: number;
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

export function pairedPowerPilot(
	leftTokens: readonly number[],
	rightTokens: readonly number[],
	leftCorrect: readonly boolean[],
	rightCorrect: readonly boolean[],
	options: { alpha?: number; minimumTokenReductionRatio?: number; power?: number; floorN?: number } = {},
): PairedPowerPilotResult {
	if (leftTokens.length !== rightTokens.length) {
		throw new Error(`paired power pilot token inputs must have equal length: ${leftTokens.length} != ${rightTokens.length}`);
	}
	if (leftCorrect.length !== rightCorrect.length || leftTokens.length !== leftCorrect.length) {
		throw new Error("paired power pilot correctness inputs must match token input length");
	}

	const floorN = options.floorN ?? 12;
	const alpha = options.alpha ?? 0.05;
	const power = options.power ?? 0.8;
	const minimumTokenReductionRatio = options.minimumTokenReductionRatio ?? 3;
	const differences = leftTokens.map((left, index) => requireFinite(left, `leftTokens[${index}]`) - requireFinite(rightTokens[index], `rightTokens[${index}]`));
	const pilotN = differences.length;
	const pairedTokenDeltaSd = sampleStandardDeviation(differences);
	const rightMedian = median(rightTokens.map((value, index) => requireFinite(value, `rightTokens[${index}]`)));
	const minimumTokenEffect = rightMedian <= 0 ? 1 : rightMedian * (1 - 1 / minimumTokenReductionRatio);
	const zAlpha = inverseNormalCdf(1 - alpha / 2);
	const zPower = inverseNormalCdf(power);
	const wilcoxonApproxN =
		minimumTokenEffect <= 0 || pairedTokenDeltaSd === 0
			? floorN
			: Math.ceil(((zAlpha + zPower) * pairedTokenDeltaSd / minimumTokenEffect) ** 2);
	const discordant = leftCorrect.reduce((count, left, index) => count + (left !== rightCorrect[index] ? 1 : 0), 0);
	const correctnessDiscordanceRate = pilotN === 0 ? 0 : discordant / pilotN;
	const mcnemarApproxN =
		correctnessDiscordanceRate === 0
			? floorN
			: Math.ceil(((zAlpha + zPower) ** 2 * correctnessDiscordanceRate * (1 - correctnessDiscordanceRate)) / 0.1 ** 2);
	const recommendedN = Math.max(floorN, wilcoxonApproxN, mcnemarApproxN);

	return {
		method: "phase-1b-paired-pilot-normal-approximation",
		pilotN,
		pairedTokenDeltaSd,
		minimumTokenEffect,
		wilcoxonApproxN,
		correctnessDiscordanceRate,
		mcnemarApproxN,
		recommendedN,
		floorN,
	};
}

export function bcaBootstrapPairedDifferenceCi(
	left: readonly number[],
	right: readonly number[],
	options: { confidenceLevel?: number; resamples?: number; seed?: number } = {},
): BcaBootstrapConfidenceInterval {
	if (left.length !== right.length) {
		throw new Error(`paired bootstrap inputs must have equal length: ${left.length} != ${right.length}`);
	}

	const differences = left.map((value, index) => requireFinite(value, `left[${index}]`) - requireFinite(right[index], `right[${index}]`));
	const n = differences.length;
	const confidenceLevel = options.confidenceLevel ?? 0.95;
	if (confidenceLevel <= 0 || confidenceLevel >= 1) {
		throw new Error(`confidenceLevel must be between 0 and 1: ${confidenceLevel}`);
	}
	const resamples = options.resamples ?? 10_000;
	if (!Number.isInteger(resamples) || resamples < 1) {
		throw new Error(`resamples must be a positive integer: ${resamples}`);
	}
	if (n === 0) {
		return {
			method: "bca-bootstrap-paired-difference",
			statistic: "median",
			confidenceLevel,
			resamples,
			n,
			estimate: 0,
			lower: 0,
			upper: 0,
			acceleration: 0,
			biasCorrection: 0,
		};
	}

	const estimate = median(differences);
	const bootstrapStatistics = bootstrapMedians(differences, resamples, options.seed ?? 0x5eed_1b);
	const sorted = [...bootstrapStatistics].sort((leftValue, rightValue) => leftValue - rightValue);
	const proportionLess = clampProportion(sorted.filter((value) => value < estimate).length / sorted.length);
	const biasCorrection = inverseNormalCdf(proportionLess);
	const acceleration = jackknifeAcceleration(differences);
	const alpha = (1 - confidenceLevel) / 2;
	const lowerProbability = adjustedBcaProbability(alpha, biasCorrection, acceleration);
	const upperProbability = adjustedBcaProbability(1 - alpha, biasCorrection, acceleration);

	return {
		method: "bca-bootstrap-paired-difference",
		statistic: "median",
		confidenceLevel,
		resamples,
		n,
		estimate,
		lower: quantile(sorted, lowerProbability),
		upper: quantile(sorted, upperProbability),
		acceleration,
		biasCorrection,
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

function bootstrapMedians(values: readonly number[], resamples: number, seed: number): number[] {
	const random = seededRandom(seed);
	const statistics: number[] = [];
	for (let resampleIndex = 0; resampleIndex < resamples; resampleIndex += 1) {
		const sample: number[] = [];
		for (let index = 0; index < values.length; index += 1) {
			sample.push(values[Math.floor(random() * values.length)] ?? 0);
		}
		statistics.push(median(sample));
	}
	return statistics;
}

function jackknifeAcceleration(values: readonly number[]): number {
	if (values.length < 3) {
		return 0;
	}
	const jackknife = values.map((_value, index) => median(values.filter((_candidate, candidateIndex) => candidateIndex !== index)));
	const average = jackknife.reduce((sum, value) => sum + value, 0) / jackknife.length;
	const numerator = jackknife.reduce((sum, value) => sum + (average - value) ** 3, 0);
	const denominatorBase = jackknife.reduce((sum, value) => sum + (average - value) ** 2, 0);
	if (denominatorBase === 0) {
		return 0;
	}
	return numerator / (6 * denominatorBase ** 1.5);
}

function adjustedBcaProbability(probability: number, biasCorrection: number, acceleration: number): number {
	const z = inverseNormalCdf(clampProportion(probability));
	const numerator = biasCorrection + z;
	const denominator = 1 - acceleration * numerator;
	if (denominator === 0) {
		return clampProportion(probability);
	}
	return clampProportion(normalCdf(biasCorrection + numerator / denominator));
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

function inverseNormalCdf(probability: number): number {
	if (probability <= 0 || probability >= 1) {
		throw new Error(`probability must be between 0 and 1: ${probability}`);
	}

	const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
	const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
	const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
	const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
	const low = 0.02425;
	const high = 1 - low;

	if (probability < low) {
		const q = Math.sqrt(-2 * Math.log(probability));
		return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
			((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
	}
	if (probability > high) {
		const q = Math.sqrt(-2 * Math.log(1 - probability));
		return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
			((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
	}

	const q = probability - 0.5;
	const r = q * q;
	return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
		(((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

function quantile(sortedValues: readonly number[], probability: number): number {
	if (sortedValues.length === 0) {
		return 0;
	}
	const clamped = Math.max(0, Math.min(1, probability));
	const position = clamped * (sortedValues.length - 1);
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const lower = sortedValues[lowerIndex] ?? 0;
	const upper = sortedValues[upperIndex] ?? lower;
	return lower + (upper - lower) * (position - lowerIndex);
}

function median(values: readonly number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function sampleStandardDeviation(values: readonly number[]): number {
	if (values.length < 2) {
		return 0;
	}
	const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
	const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
	return Math.sqrt(variance);
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

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

function clampProportion(value: number): number {
	if (!Number.isFinite(value)) {
		return 0.5;
	}
	return Math.min(1 - 1e-9, Math.max(1e-9, value));
}

function requireFinite(value: number | undefined, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${path} must be a finite number`);
	}
	return value;
}
