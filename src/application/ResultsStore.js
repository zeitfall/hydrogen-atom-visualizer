import { ORBITALS, computeMaxAbsoluteDifference, computeSpeedup } from '../domain/index.js';

class ResultsStore extends EventTarget {
    #signature;
    #resultsByBackend;
    #comparisons;

    constructor() {
        super();

        this.#signature = null;
        this.#resultsByBackend = new Map();
        this.#comparisons = new Map();
    }

    beginRun(backendId, signature) {
        if (signature !== this.#signature) {
            this.#signature = signature;
            this.#resultsByBackend.clear();
        }

        this.#resultsByBackend.set(backendId, new Map());
        this.#comparisons.clear();

        this.#dispatchChange();
    }

    add(signature, result) {
        if (signature !== this.#signature) {
            throw new Error('[ResultsStore]: Result does not belong to the current run.');
        }

        const { backendId, orbitalId } = result;

        if (!this.#resultsByBackend.has(backendId)) {
            this.#resultsByBackend.set(backendId, new Map());
        }

        this.#resultsByBackend.get(backendId).set(orbitalId, result);

        this.#invalidateComparisons(orbitalId);
        this.#dispatchChange();
    }

    getResult(backendId, signature, orbitalId) {
        if (signature !== this.#signature) {
            return undefined;
        }

        return this.#resultsByBackend.get(backendId)?.get(orbitalId);
    }

    getResults(backendId, signature) {
        if (signature !== this.#signature) {
            return [];
        }

        const results = this.#resultsByBackend.get(backendId);

        if (!results) {
            return [];
        }

        return ORBITALS
            .filter((orbital) => results.has(orbital.id))
            .map((orbital) => results.get(orbital.id));
    }

    getComparison(baselineId, candidateId, signature, orbitalId) {
        const baselineResult = this.getResult(baselineId, signature, orbitalId);
        const candidateResult = this.getResult(candidateId, signature, orbitalId);

        if (!baselineResult || !candidateResult) {
            return null;
        }

        const comparisonKey = `${baselineId}|${candidateId}|${orbitalId}`;

        if (!this.#comparisons.has(comparisonKey)) {
            this.#comparisons.set(comparisonKey, {
                speedup: computeSpeedup(baselineResult.elapsedMs, candidateResult.elapsedMs),
                maxDifference: computeMaxAbsoluteDifference(baselineResult.state, candidateResult.state)
            });
        }

        return this.#comparisons.get(comparisonKey);
    }

    getTotals(baselineId, candidateId, signature) {
        let baselineMs = 0;
        let candidateMs = 0;
        let stateCount = 0;

        this.getResults(baselineId, signature).forEach((baselineResult) => {
            const candidateResult = this.getResult(candidateId, signature, baselineResult.orbitalId);

            if (!candidateResult) {
                return;
            }

            baselineMs += baselineResult.elapsedMs;
            candidateMs += candidateResult.elapsedMs;
            stateCount++;
        });

        if (stateCount === 0) {
            return null;
        }

        return {
            stateCount,
            baselineMs,
            candidateMs,
            speedup: computeSpeedup(baselineMs, candidateMs)
        };
    }

    #invalidateComparisons(orbitalId) {
        const comparisonKeySuffix = `|${orbitalId}`;

        this.#comparisons.forEach((_, comparisonKey) => {
            if (comparisonKey.endsWith(comparisonKeySuffix)) {
                this.#comparisons.delete(comparisonKey);
            }
        });
    }

    #dispatchChange() {
        this.dispatchEvent(new Event('change'));
    }
}

export default ResultsStore;
