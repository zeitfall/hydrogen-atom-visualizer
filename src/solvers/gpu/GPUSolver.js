import {
    WORKGROUP_SIZE,
    MAX_WORKGROUPS_PER_DIMENSION,
    MAX_REDUCTION_GROUP_COUNT,
    VALUES_PER_REDUCTION_THREAD,
    MAX_STATE_COUNT,
    BYTES_PER_VALUE,
    PARAMETERS_BYTE_SIZE,
    STATE_COUNT_BYTE_OFFSET,
    UNIFORM_BYTE_SIZE,
    SCALAR_OFFSETS,
    SCALAR_COUNT
} from './constants.js';
import {
    EVOLUTION_SHADER_CODE,
    PARTIAL_DOT_PRODUCT_SHADER_CODE,
    FINAL_SUM_SHADER_CODE,
    ORTHOGONALIZATION_SHADER_CODE,
    NORMALIZATION_SHADER_CODE,
    PARTIAL_ENERGY_SHADER_CODE,
    PARTIAL_RESIDUAL_SHADER_CODE
} from './shaders/index.js';

class GPUSolver {
    #device;
    #isDisposed;
    #allocatedBuffers;

    #nodeCount;
    #stateCount;
    #reductionGroupCount;
    #nodeWorkgroupCount;

    #buffers;
    #kernels;

    constructor(device) {
        this.#device = device;
        this.#isDisposed = false;
        this.#allocatedBuffers = [];

        this.#nodeCount = 0;
        this.#stateCount = 0;
        this.#reductionGroupCount = 0;
        this.#nodeWorkgroupCount = null;

        this.#buffers = null;
        this.#kernels = null;
    }

    async initialize(config, potential, maxStateCount) {
        const device = this.#device;
        const nodeCount = config.gridSize ** 3;
        const stateByteSize = nodeCount * BYTES_PER_VALUE;
        const basisByteSize = maxStateCount * stateByteSize;

        if (maxStateCount > MAX_STATE_COUNT) {
            throw new RangeError(`[GPUSolver]: Orthogonalization basis can hold at most ${MAX_STATE_COUNT} states, ${maxStateCount} is given.`);
        }

        if (basisByteSize > device.limits.maxStorageBufferBindingSize) {
            const basisMebibytes = (basisByteSize / 2 ** 20).toFixed(0);

            throw new RangeError(`[GPUSolver]: Orthogonalization basis needs ${basisMebibytes} MiB, which is more than this GPU allows per buffer.`);
        }

        const reductionGroupCount = Math.min(MAX_REDUCTION_GROUP_COUNT, Math.ceil(nodeCount / (WORKGROUP_SIZE * VALUES_PER_REDUCTION_THREAD)));

        this.#nodeCount = nodeCount;
        this.#stateCount = 0;
        this.#reductionGroupCount = reductionGroupCount;
        this.#nodeWorkgroupCount = splitWorkgroupCount(Math.ceil(nodeCount / WORKGROUP_SIZE));

        const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
        const readbackUsage = GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST;

        const buffers = {
            parameters: this.#createBuffer(PARAMETERS_BYTE_SIZE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
            state: this.#createBuffer(stateByteSize, storageUsage),
            evolvedState: this.#createBuffer(stateByteSize, storageUsage),
            potential: this.#createBuffer(stateByteSize, storageUsage),
            committedStates: this.#createBuffer(Math.max(1, maxStateCount) * stateByteSize, storageUsage),
            partialSums: this.#createBuffer(MAX_STATE_COUNT * reductionGroupCount * BYTES_PER_VALUE, GPUBufferUsage.STORAGE),
            scalars: this.#createBuffer(SCALAR_COUNT * BYTES_PER_VALUE, storageUsage),
            scalarsReadback: this.#createBuffer(SCALAR_COUNT * BYTES_PER_VALUE, readbackUsage),
            stateReadback: this.#createBuffer(stateByteSize, readbackUsage)
        };

        this.#buffers = buffers;

        this.#writeParameters(config);

        device.queue.writeBuffer(buffers.potential, 0, Float32Array.from(potential));

        const [
            evolutionPipeline,
            partialDotProductPipeline,
            finalSumPipeline,
            orthogonalizationPipeline,
            normalizationPipeline,
            partialEnergyPipeline,
            partialResidualPipeline
        ] = await Promise.all([
            this.#createComputePipeline('evolution', EVOLUTION_SHADER_CODE),
            this.#createComputePipeline('partial-dot-product', PARTIAL_DOT_PRODUCT_SHADER_CODE),
            this.#createComputePipeline('final-sum', FINAL_SUM_SHADER_CODE),
            this.#createComputePipeline('orthogonalization', ORTHOGONALIZATION_SHADER_CODE),
            this.#createComputePipeline('normalization', NORMALIZATION_SHADER_CODE),
            this.#createComputePipeline('partial-energy', PARTIAL_ENERGY_SHADER_CODE),
            this.#createComputePipeline('partial-residual', PARTIAL_RESIDUAL_SHADER_CODE)
        ]);

        const basisStrideBuffer = this.#createUniformBuffer(nodeCount);
        const zeroStrideBuffer = this.#createUniformBuffer(0);

        this.#kernels = {
            evolution: this.#createKernel(evolutionPipeline, [
                buffers.parameters,
                buffers.state,
                buffers.potential,
                buffers.evolvedState
            ]),
            coefficients: this.#createKernel(partialDotProductPipeline, [
                buffers.parameters,
                basisStrideBuffer,
                buffers.committedStates,
                buffers.evolvedState,
                buffers.partialSums
            ]),
            coefficientsSum: this.#createKernel(finalSumPipeline, [
                buffers.parameters,
                this.#createUniformBuffer(SCALAR_OFFSETS.COEFFICIENTS),
                buffers.partialSums,
                buffers.scalars
            ]),
            orthogonalization: this.#createKernel(orthogonalizationPipeline, [
                buffers.parameters,
                buffers.committedStates,
                buffers.scalars,
                buffers.evolvedState
            ]),
            norm: this.#createKernel(partialDotProductPipeline, [
                buffers.parameters,
                zeroStrideBuffer,
                buffers.evolvedState,
                buffers.evolvedState,
                buffers.partialSums
            ]),
            normSum: this.#createKernel(finalSumPipeline, [
                buffers.parameters,
                this.#createUniformBuffer(SCALAR_OFFSETS.NORM),
                buffers.partialSums,
                buffers.scalars
            ]),
            normalization: this.#createKernel(normalizationPipeline, [
                buffers.parameters,
                buffers.scalars,
                buffers.evolvedState,
                buffers.state
            ]),
            energy: this.#createKernel(partialEnergyPipeline, [
                buffers.parameters,
                buffers.state,
                buffers.potential,
                buffers.partialSums
            ]),
            energySum: this.#createKernel(finalSumPipeline, [
                buffers.parameters,
                this.#createUniformBuffer(SCALAR_OFFSETS.ENERGY),
                buffers.partialSums,
                buffers.scalars
            ]),
            residual: this.#createKernel(partialResidualPipeline, [
                buffers.parameters,
                buffers.state,
                buffers.potential,
                buffers.scalars,
                buffers.partialSums
            ]),
            residualSum: this.#createKernel(finalSumPipeline, [
                buffers.parameters,
                this.#createUniformBuffer(SCALAR_OFFSETS.RESIDUAL),
                buffers.partialSums,
                buffers.scalars
            ]),
            overlaps: this.#createKernel(partialDotProductPipeline, [
                buffers.parameters,
                basisStrideBuffer,
                buffers.committedStates,
                buffers.state,
                buffers.partialSums
            ]),
            overlapsSum: this.#createKernel(finalSumPipeline, [
                buffers.parameters,
                this.#createUniformBuffer(SCALAR_OFFSETS.OVERLAPS),
                buffers.partialSums,
                buffers.scalars
            ])
        };

        await device.queue.onSubmittedWorkDone();
    }

    async setInitialGuess(initialGuess) {
        this.#assertNotDisposed();

        this.#device.queue.writeBuffer(this.#buffers.state, 0, Float32Array.from(initialGuess));
    }

    async iterate(iterationCount) {
        this.#assertNotDisposed();

        const buffers = this.#buffers;
        const startTime = performance.now();

        this.#submitCommands('iteration-batch', (commandEncoder) => {
            const computePass = commandEncoder.beginComputePass();

            for (let iteration = 0; iteration < iterationCount; iteration++) {
                this.#encodeIteration(computePass);
            }

            this.#encodeMeasurement(computePass);

            computePass.end();

            const energyByteOffset = SCALAR_OFFSETS.ENERGY * BYTES_PER_VALUE;

            commandEncoder.copyBufferToBuffer(buffers.scalars, energyByteOffset, buffers.scalarsReadback, 0, 2 * BYTES_PER_VALUE);
        });

        const [energy, residualSquared] = await this.#readScalars(2);
        const elapsedMs = performance.now() - startTime;

        return { energy, residual: Math.sqrt(residualSquared), elapsedMs };
    }

    async readOverlaps() {
        this.#assertNotDisposed();

        const stateCount = this.#stateCount;

        if (stateCount === 0) {
            return new Float64Array(0);
        }

        const buffers = this.#buffers;
        const kernels = this.#kernels;

        this.#submitCommands('overlaps', (commandEncoder) => {
            const computePass = commandEncoder.beginComputePass();

            this.#dispatch(computePass, kernels.overlaps, this.#reductionGroupCount, stateCount);
            this.#dispatch(computePass, kernels.overlapsSum, stateCount);

            computePass.end();

            const overlapsByteOffset = SCALAR_OFFSETS.OVERLAPS * BYTES_PER_VALUE;

            commandEncoder.copyBufferToBuffer(buffers.scalars, overlapsByteOffset, buffers.scalarsReadback, 0, stateCount * BYTES_PER_VALUE);
        });

        const overlaps = await this.#readScalars(stateCount);

        return Float64Array.from(overlaps);
    }

    async readState() {
        this.#assertNotDisposed();

        const { state: stateBuffer, stateReadback: readbackBuffer } = this.#buffers;
        const stateByteSize = this.#nodeCount * BYTES_PER_VALUE;

        this.#submitCommands('state-readback', (commandEncoder) => {
            commandEncoder.copyBufferToBuffer(stateBuffer, 0, readbackBuffer, 0, stateByteSize);
        });

        await readbackBuffer.mapAsync(GPUMapMode.READ);

        const state = new Float32Array(readbackBuffer.getMappedRange()).slice();

        readbackBuffer.unmap();

        return state;
    }

    async commitState() {
        this.#assertNotDisposed();

        const device = this.#device;
        const buffers = this.#buffers;
        const stateByteSize = this.#nodeCount * BYTES_PER_VALUE;
        const committedStateByteOffset = this.#stateCount * stateByteSize;

        this.#submitCommands('state-commit', (commandEncoder) => {
            commandEncoder.copyBufferToBuffer(buffers.state, 0, buffers.committedStates, committedStateByteOffset, stateByteSize);
        });

        this.#stateCount++;

        device.queue.writeBuffer(buffers.parameters, STATE_COUNT_BYTE_OFFSET, new Uint32Array([this.#stateCount]));

        await device.queue.onSubmittedWorkDone();
    }

    dispose() {
        if (this.#isDisposed) {
            return;
        }

        this.#isDisposed = true;

        this.#allocatedBuffers.forEach((buffer) => buffer.destroy());
        this.#allocatedBuffers = [];
    }

    #encodeIteration(computePass) {
        const kernels = this.#kernels;
        const stateCount = this.#stateCount;
        const reductionGroupCount = this.#reductionGroupCount;

        this.#dispatchPerNode(computePass, kernels.evolution);

        if (stateCount > 0) {
            this.#dispatch(computePass, kernels.coefficients, reductionGroupCount, stateCount);
            this.#dispatch(computePass, kernels.coefficientsSum, stateCount);
            this.#dispatchPerNode(computePass, kernels.orthogonalization);
        }

        this.#dispatch(computePass, kernels.norm, reductionGroupCount);
        this.#dispatch(computePass, kernels.normSum, 1);
        this.#dispatchPerNode(computePass, kernels.normalization);
    }

    #encodeMeasurement(computePass) {
        const kernels = this.#kernels;
        const reductionGroupCount = this.#reductionGroupCount;

        this.#dispatch(computePass, kernels.energy, reductionGroupCount);
        this.#dispatch(computePass, kernels.energySum, 1);
        this.#dispatch(computePass, kernels.residual, reductionGroupCount);
        this.#dispatch(computePass, kernels.residualSum, 1);
    }

    #dispatchPerNode(computePass, kernel) {
        const { x, y } = this.#nodeWorkgroupCount;

        this.#dispatch(computePass, kernel, x, y);
    }

    #dispatch(computePass, kernel, workgroupCountX, workgroupCountY = 1) {
        computePass.setPipeline(kernel.pipeline);
        computePass.setBindGroup(0, kernel.bindGroup);
        computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
    }

    #submitCommands(label, encodeCommands) {
        const device = this.#device;
        const commandEncoder = device.createCommandEncoder({ label });

        encodeCommands(commandEncoder);

        device.queue.submit([commandEncoder.finish()]);
    }

    async #readScalars(count) {
        const readbackBuffer = this.#buffers.scalarsReadback;
        const byteSize = count * BYTES_PER_VALUE;

        await readbackBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);

        const scalars = Array.from(new Float32Array(readbackBuffer.getMappedRange(0, byteSize)));

        readbackBuffer.unmap();

        return scalars;
    }

    #writeParameters(config) {
        const { gridSize, spacing, timeStep } = config;
        const kineticFactor = 1 / (2 * spacing ** 2);

        const parameters = new ArrayBuffer(PARAMETERS_BYTE_SIZE);
        const integerParameters = new Uint32Array(parameters);
        const floatParameters = new Float32Array(parameters);

        integerParameters[0] = gridSize;
        integerParameters[1] = this.#nodeCount;
        integerParameters[2] = this.#stateCount;
        integerParameters[3] = this.#reductionGroupCount;

        floatParameters[4] = timeStep * kineticFactor;
        floatParameters[5] = timeStep;
        floatParameters[6] = kineticFactor;
        floatParameters[7] = spacing ** 3;

        this.#device.queue.writeBuffer(this.#buffers.parameters, 0, parameters);
    }

    #createUniformBuffer(value) {
        const buffer = this.#createBuffer(UNIFORM_BYTE_SIZE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

        this.#device.queue.writeBuffer(buffer, 0, new Uint32Array([value, 0, 0, 0]));

        return buffer;
    }

    #createBuffer(size, usage) {
        const buffer = this.#device.createBuffer({ size, usage });

        this.#allocatedBuffers.push(buffer);

        return buffer;
    }

    async #createComputePipeline(label, code) {
        const device = this.#device;
        const shaderModule = device.createShaderModule({ label, code });
        const compilationInfo = await shaderModule.getCompilationInfo();
        const compilationErrors = compilationInfo.messages.filter((message) => message.type === 'error');

        if (compilationErrors.length > 0) {
            const errorDetails = compilationErrors
                .map((error) => `${error.lineNum}:${error.linePos} ${error.message}`)
                .join('; ');

            throw new Error(`[GPUSolver]: Failed to compile "${label}" shader. ${errorDetails}`);
        }

        return device.createComputePipelineAsync({
            label,
            layout: 'auto',
            compute: {
                module: shaderModule,
                entryPoint: 'main'
            }
        });
    }

    #createKernel(pipeline, buffers) {
        const bindGroup = this.#device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } }))
        });

        return { pipeline, bindGroup };
    }

    #assertNotDisposed() {
        if (this.#isDisposed) {
            throw new Error('[GPUSolver]: Solver has been disposed.');
        }
    }
}

function splitWorkgroupCount(workgroupCount) {
    const x = Math.min(workgroupCount, MAX_WORKGROUPS_PER_DIMENSION);
    const y = Math.ceil(workgroupCount / x);

    return { x, y };
}

export default GPUSolver;
