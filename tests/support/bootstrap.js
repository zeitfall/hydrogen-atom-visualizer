import { parentPort, workerData } from 'node:worker_threads';

const queuedMessages = [];

globalThis.self = {
    onmessage: null,
    postMessage: (data, transfer) => parentPort.postMessage(data, transfer)
};

parentPort.on('message', (data) => {
    if (self.onmessage) {
        self.onmessage({ data });
    }
    else {
        queuedMessages.push(data);
    }
});

await import(workerData.scriptURL);

queuedMessages.splice(0).forEach((data) => self.onmessage({ data }));
