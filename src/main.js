import App from './App.js';

import { createGPUContext } from './platform/index.js';

async function main() {
    const gpuContext = await createGPUContext();

    if (!gpuContext.isFloat32Filterable) {
        console.warn('The "float32-filterable" feature is not supported, so the volume is sampled without interpolation.');
    }

    const app = new App(gpuContext);

    await app.init();
}

function showFatalError(error) {
    const statusElement = document.getElementById('status');

    console.error(error);

    statusElement.textContent = error instanceof Error ? error.message : String(error);
    statusElement.hidden = false;
}

main().catch(showFatalError);
