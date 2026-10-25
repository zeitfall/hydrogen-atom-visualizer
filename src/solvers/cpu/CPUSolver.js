class CPUSolver {
    #worker;
    #pendingCalls;
    #nextCallId;

    constructor() {
        const workerURL = new URL('./worker.js', import.meta.url);
        const worker = new Worker(workerURL, { type: 'module' });

        worker.onmessage = (event) => this.#handleMessage(event);
        worker.onerror = (event) => this.#handleError(event);

        this.#worker = worker;
        this.#pendingCalls = new Map();
        this.#nextCallId = 0;
    }

    initialize(config, potential, maxStateCount) {
        return this.#call('initialize', {
            size: config.gridSize,
            spacing: config.spacing,
            timeStep: config.timeStep,
            potential,
            maxStateCount
        });
    }

    setInitialGuess(initialGuess) {
        return this.#call('setInitialGuess', { initialGuess });
    }

    iterate(iterationCount) {
        return this.#call('iterate', { iterationCount });
    }

    readOverlaps() {
        return this.#call('readOverlaps');
    }

    readState() {
        return this.#call('readState');
    }

    commitState() {
        return this.#call('commitState');
    }

    dispose() {
        const worker = this.#worker;

        if (!worker) {
            return;
        }

        worker.terminate();

        this.#worker = null;

        this.#rejectPendingCalls(new Error('[CPUSolver]: Solver has been disposed.'));
    }

    #call(method, parameters) {
        const worker = this.#worker;

        if (!worker) {
            return Promise.reject(new Error('[CPUSolver]: Solver has been disposed.'));
        }

        const id = this.#nextCallId++;
        const { promise, resolve, reject } = Promise.withResolvers();

        this.#pendingCalls.set(id, { resolve, reject });

        worker.postMessage({ id, method, parameters });

        return promise;
    }

    #handleMessage(event) {
        const { id, result, error } = event.data;
        const pendingCall = this.#pendingCalls.get(id);

        if (!pendingCall) {
            return;
        }

        this.#pendingCalls.delete(id);

        if (typeof error === 'undefined') {
            pendingCall.resolve(result);
        }
        else {
            pendingCall.reject(new Error(error));
        }
    }

    #handleError(event) {
        event.preventDefault();

        this.#rejectPendingCalls(new Error(`[CPUSolver]: Worker has failed. ${event.message}`));
    }

    #rejectPendingCalls(error) {
        this.#pendingCalls.forEach((pendingCall) => pendingCall.reject(error));
        this.#pendingCalls.clear();
    }
}

export default CPUSolver;
