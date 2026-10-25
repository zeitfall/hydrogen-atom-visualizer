import { assertSolver } from './assertions.js';

class SolverRegistry {
    #entries;

    constructor() {
        this.#entries = new Map();
    }

    register(id, label, createSolver) {
        if (this.#entries.has(id)) {
            throw new Error(`[SolverRegistry]: Backend with id "${id}" has already been registered.`);
        }

        this.#entries.set(id, { label, createSolver });

        return this;
    }

    createSolver(id) {
        const entry = this.#entries.get(id);

        if (!entry) {
            throw new RangeError(`[SolverRegistry]: Cannot create solver. Backend with id "${id}" was not found.`);
        }

        const solver = entry.createSolver();

        return assertSolver(solver);
    }

    getLabel(id) {
        const entry = this.#entries.get(id);

        return entry?.label ?? id;
    }

    getBackends() {
        return Array.from(this.#entries, ([id, entry]) => ({ id, label: entry.label }));
    }
}

export default SolverRegistry;
