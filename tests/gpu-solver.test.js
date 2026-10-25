import assert from 'node:assert/strict';

import { test, after } from 'node:test';

import InProcessSolver from './support/InProcessSolver.js';

import { GPUSolver } from '../src/solvers/index.js';
import { SimulationConfig, getOrbital, createCoulombPotential, createInitialGuess } from '../src/domain/index.js';
import { SolverRegistry, ResultsStore, SimulationController, RunOutcome } from '../src/application/index.js';

const webgpu = await import('webgpu').catch(() => null);
const skip = webgpu ? false : 'install the "webgpu" package to run GPU tests';

const config = new SimulationConfig({ gridSize: 32, halfWidth: 12 });

let device = null;

if (webgpu) {
    Object.assign(globalThis, webgpu.globals);

    // NOTE: The GPU instance must stay referenced, otherwise Dawn crashes on the next async call.
    globalThis.dawnInstance = webgpu.create([]);

    const adapter = await globalThis.dawnInstance.requestAdapter();

    device = adapter && (await adapter.requestDevice());
}

after(() => {
    device?.destroy();

    globalThis.dawnInstance = null;
});

test('GPU and CPU backends agree up to float32 rounding', { skip }, async () => {
    const solverRegistry = new SolverRegistry()
        .register('cpu', 'CPU', () => new InProcessSolver())
        .register('gpu', 'GPU', () => new GPUSolver(device));

    const resultsStore = new ResultsStore();
    const controller = new SimulationController(solverRegistry, resultsStore);

    controller.addEventListener('error', (event) => assert.fail(event.detail.error));

    const outcome = await controller.compare({ backendIds: ['gpu', 'cpu'], config, targetId: '2pz', livePreview: false });

    assert.equal(outcome, RunOutcome.COMPLETED);

    resultsStore.getResults('cpu', config.signature).forEach((cpuResult) => {
        const { orbitalId } = cpuResult;
        const gpuResult = resultsStore.getResult('gpu', config.signature, orbitalId);
        const { maxDifference } = resultsStore.getComparison('cpu', 'gpu', config.signature, orbitalId);

        assert.ok(gpuResult.converged, `${orbitalId} converged on the GPU`);
        assert.ok(Math.abs(gpuResult.energy - cpuResult.energy) < 1e-6, `${orbitalId}: dE = ${gpuResult.energy - cpuResult.energy}`);
        assert.equal(gpuResult.iterations, cpuResult.iterations);
        assert.ok(gpuResult.maxOverlap < 1e-6, `${orbitalId}: GPU overlap ${gpuResult.maxOverlap}`);
        assert.ok(maxDifference < 1e-6, `${orbitalId}: max |psi_cpu - psi_gpu| = ${maxDifference}`);
    });
});

test('disposing the GPU solver aborts a pending batch', { skip }, async () => {
    const grid = config.createGrid();
    const solver = new GPUSolver(device);

    await solver.initialize(config, createCoulombPotential(grid), 1);
    await solver.setInitialGuess(createInitialGuess(grid, getOrbital('1s'), 4));

    const pendingIteration = solver.iterate(2000);

    solver.dispose();

    await assert.rejects(pendingIteration);
    await assert.rejects(solver.readState(), /disposed/);
});
