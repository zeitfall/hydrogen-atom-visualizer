async function createGPUContext() {
    const gpu = navigator.gpu;

    if (!gpu) {
        throw new Error('WebGPU API is not supported by this browser. Use a recent version of Chrome, Edge or Safari.');
    }

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });

    if (!adapter) {
        throw new Error('Failed to request the GPU adapter.');
    }

    const { features, limits } = adapter;

    const device = await adapter.requestDevice({
        requiredFeatures: Array.from(features),
        requiredLimits: {
            maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
            maxBufferSize: limits.maxBufferSize,
            maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension
        }
    });

    device.lost.then((deviceLostInfo) => {
        if (deviceLostInfo.reason !== 'destroyed') {
            console.error(`GPU device was lost. ${deviceLostInfo.message}`);
        }
    });

    return Object.freeze({
        adapter,
        device,
        adapterInfo: adapter.info ?? null,
        isFloat32Filterable: device.features.has('float32-filterable')
    });
}

export {
    createGPUContext
};
