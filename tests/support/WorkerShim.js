import { Worker as NodeWorker } from 'node:worker_threads';

const BOOTSTRAP_URL = new URL('./bootstrap.js', import.meta.url);

class WorkerShim {
    #worker;

    constructor(scriptURL) {
        const worker = new NodeWorker(BOOTSTRAP_URL, { workerData: { scriptURL: scriptURL.href } });

        this.#worker = worker;

        this.onmessage = null;
        this.onerror = null;

        worker.on('message', (data) => this.onmessage?.({ data }));
        worker.on('error', (error) => this.onerror?.({ message: error.message, preventDefault() {} }));
    }

    postMessage(data, transfer) {
        this.#worker.postMessage(data, transfer);
    }

    terminate() {
        this.#worker.terminate();
    }
}

export default WorkerShim;
