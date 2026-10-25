import {
    getOrbitalSequence,
    getExactEnergy,
    createCoulombPotential,
    createInitialGuess,
    createReferenceState,
    computeRelativeEnergyError,
    computeL2Error,
    computeMaxOverlap
} from '../domain/index.js';

import { SimulationStatus, RunOutcome } from './enums.js';

const DEFAULT_PREVIEW_INTERVAL_MS = 250;

class SimulationController extends EventTarget {
    #solverRegistry;
    #resultsStore;

    #status;
    #solver;
    #pauseGate;
    #isStopRequested;

    constructor(solverRegistry, resultsStore) {
        super();

        this.#solverRegistry = solverRegistry;
        this.#resultsStore = resultsStore;

        this.#status = SimulationStatus.IDLE;
        this.#solver = null;
        this.#pauseGate = null;
        this.#isStopRequested = false;
    }

    get status() {
        return this.#status;
    }

    async start(request) {
        const {
            backendId,
            config,
            targetId,
            livePreview = true,
            previewIntervalMs = DEFAULT_PREVIEW_INTERVAL_MS
        } = request;

        if (this.#status !== SimulationStatus.IDLE) {
            throw new Error('[SimulationController]: Cannot start. A run is already in progress.');
        }

        const grid = config.createGrid();
        const signature = config.signature;
        const orbitalSequence = getOrbitalSequence(targetId);
        const stateCount = orbitalSequence.length;
        const solver = this.#solverRegistry.createSolver(backendId);

        const run = {
            backendId,
            config,
            grid,
            orbitalSequence,
            livePreview,
            previewIntervalMs,
            elapsedMs: 0
        };

        this.#solver = solver;
        this.#isStopRequested = false;

        this.#setStatus(SimulationStatus.RUNNING);
        this.#resultsStore.beginRun(backendId, signature);
        this.#dispatch('runstart', { backendId, config, orbitalSequence });

        try {
            await solver.initialize(config, createCoulombPotential(grid), stateCount);

            for (let stateIndex = 0; stateIndex < stateCount; stateIndex++) {
                const result = await this.#solveState(solver, run, stateIndex);

                if (!result) {
                    break;
                }

                this.#resultsStore.add(signature, result);
                this.#dispatch('statedone', { result, stateIndex, stateCount });
            }

            this.#dispatch('rundone', { stopped: this.#isStopRequested, runElapsedMs: run.elapsedMs });

            return this.#isStopRequested ? RunOutcome.STOPPED : RunOutcome.COMPLETED;
        } catch (error) {
            if (this.#isStopRequested) {
                this.#dispatch('rundone', { stopped: true, runElapsedMs: run.elapsedMs });

                return RunOutcome.STOPPED;
            }

            this.#dispatch('error', { error });

            return RunOutcome.FAILED;
        } finally {
            solver.dispose();

            this.#solver = null;
            this.#pauseGate = null;

            this.#setStatus(SimulationStatus.IDLE);
        }
    }

    async compare(request) {
        const { backendIds, ...runRequest } = request;

        let outcome = RunOutcome.COMPLETED;

        for (const backendId of backendIds) {
            outcome = await this.start({ ...runRequest, backendId });

            if (outcome !== RunOutcome.COMPLETED) {
                break;
            }
        }

        return outcome;
    }

    pause() {
        if (this.#status !== SimulationStatus.RUNNING) {
            return;
        }

        this.#pauseGate = Promise.withResolvers();

        this.#setStatus(SimulationStatus.PAUSED);
    }

    resume() {
        if (this.#status !== SimulationStatus.PAUSED) {
            return;
        }

        this.#pauseGate?.resolve();
        this.#pauseGate = null;

        this.#setStatus(SimulationStatus.RUNNING);
    }

    stop() {
        if (this.#status === SimulationStatus.IDLE || this.#status === SimulationStatus.STOPPING) {
            return;
        }

        this.#isStopRequested = true;
        this.#pauseGate?.resolve();

        this.#setStatus(SimulationStatus.STOPPING);

        this.#solver?.dispose();
    }

    async #solveState(solver, run, stateIndex) {
        const { backendId, config, grid, orbitalSequence, livePreview, previewIntervalMs } = run;

        const orbital = orbitalSequence[stateIndex];
        const stateCount = orbitalSequence.length;
        const exactEnergy = getExactEnergy(orbital.n);
        const initialGuess = createInitialGuess(grid, orbital, config.initialGuessWidth);

        await solver.setInitialGuess(initialGuess);

        this.#dispatch('statestart', { orbital, stateIndex, stateCount });

        if (livePreview) {
            this.#dispatch('preview', {
                orbitalId: orbital.id,
                backendId,
                data: Float32Array.from(initialGuess),
                size: grid.size,
                iterations: 0
            });
        }

        const history = {
            iterations: [],
            elapsedMs: [],
            energy: [],
            residual: []
        };

        let iterations = 0;
        let elapsedMs = 0;
        let energy = NaN;
        let residual = NaN;
        let previousEnergy = NaN;
        let converged = false;
        let lastPreviewTime = -Infinity;

        while (iterations < config.maxIterations && !converged) {
            if (this.#pauseGate) {
                await this.#pauseGate.promise;
            }

            if (this.#isStopRequested) {
                return null;
            }

            const batchSize = Math.min(config.checkInterval, config.maxIterations - iterations);
            const measurement = await solver.iterate(batchSize);

            iterations += batchSize;
            elapsedMs += measurement.elapsedMs;
            run.elapsedMs += measurement.elapsedMs;

            energy = measurement.energy;
            residual = measurement.residual;

            if (!Number.isFinite(energy) || !Number.isFinite(residual)) {
                throw new Error(`[SimulationController]: Iteration diverged while solving ${orbital.label}.`);
            }

            converged = Math.abs(energy - previousEnergy) < config.energyTolerance && residual < config.residualTolerance;
            previousEnergy = energy;

            history.iterations.push(iterations);
            history.elapsedMs.push(elapsedMs);
            history.energy.push(energy);
            history.residual.push(residual);

            this.#dispatch('progress', {
                backendId,
                orbital,
                stateIndex,
                stateCount,
                iterations,
                energy,
                exactEnergy,
                residual,
                elapsedMs,
                runElapsedMs: run.elapsedMs,
                nodeCount: grid.nodeCount,
                history
            });

            if (livePreview && !converged && performance.now() - lastPreviewTime >= previewIntervalMs) {
                lastPreviewTime = performance.now();

                const data = await solver.readState();

                this.#dispatch('preview', {
                    orbitalId: orbital.id,
                    backendId,
                    data,
                    size: grid.size,
                    iterations
                });
            }
        }

        const state = await solver.readState();
        const overlaps = await solver.readOverlaps();

        await solver.commitState();

        return {
            orbitalId: orbital.id,
            label: orbital.label,
            backendId,
            energy,
            exactEnergy,
            relativeEnergyError: computeRelativeEnergyError(energy, exactEnergy),
            residual,
            l2Error: computeL2Error(state, createReferenceState(grid, orbital), grid),
            maxOverlap: computeMaxOverlap(overlaps),
            iterations,
            elapsedMs,
            converged,
            state,
            history
        };
    }

    #setStatus(status) {
        this.#status = status;

        this.#dispatch('statuschange', { status });
    }

    #dispatch(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}

export default SimulationController;
