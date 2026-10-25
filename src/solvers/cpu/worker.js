import CPUKernel from './CPUKernel.js';

let kernel = null;

const handlers = {
    initialize(parameters) {
        kernel = new CPUKernel(parameters);
    },

    setInitialGuess({ initialGuess }) {
        getKernel().setState(initialGuess);
    },

    iterate({ iterationCount }) {
        const activeKernel = getKernel();
        const startTime = performance.now();

        activeKernel.iterate(iterationCount);

        const { energy, residual } = activeKernel.measure();
        const elapsedMs = performance.now() - startTime;

        return { energy, residual, elapsedMs };
    },

    readOverlaps() {
        return getKernel().computeOverlaps();
    },

    readState() {
        return getKernel().readState();
    },

    commitState() {
        getKernel().commitState();
    }
};

function getKernel() {
    if (!kernel) {
        throw new Error('[CPUWorker]: Kernel has not been initialized.');
    }

    return kernel;
}

function handleMessage(event) {
    const { id, method, parameters } = event.data;

    try {
        const result = handlers[method](parameters);
        const transfer = ArrayBuffer.isView(result) ? [result.buffer] : [];

        self.postMessage({ id, result }, transfer);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        self.postMessage({ id, error: message });
    }
}

self.onmessage = handleMessage;
