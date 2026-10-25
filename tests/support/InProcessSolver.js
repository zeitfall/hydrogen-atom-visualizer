import { CPUKernel } from '../../src/solvers/index.js';

class InProcessSolver {
    #kernel;
    #isDisposed;

    constructor() {
        this.#kernel = null;
        this.#isDisposed = false;
    }

    get isDisposed() {
        return this.#isDisposed;
    }

    async initialize(config, potential, maxStateCount) {
        this.#kernel = new CPUKernel({
            size: config.gridSize,
            spacing: config.spacing,
            timeStep: config.timeStep,
            potential,
            maxStateCount
        });
    }

    async setInitialGuess(initialGuess) {
        this.#kernel.setState(initialGuess);
    }

    async iterate(iterationCount) {
        const startTime = performance.now();

        this.#kernel.iterate(iterationCount);

        const { energy, residual } = this.#kernel.measure();
        const elapsedMs = performance.now() - startTime;

        return { energy, residual, elapsedMs };
    }

    async readOverlaps() {
        return this.#kernel.computeOverlaps();
    }

    async readState() {
        return this.#kernel.readState();
    }

    async commitState() {
        this.#kernel.commitState();
    }

    dispose() {
        this.#isDisposed = true;
    }
}

export default InProcessSolver;
