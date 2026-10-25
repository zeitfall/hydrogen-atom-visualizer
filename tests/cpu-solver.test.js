import assert from 'node:assert/strict';

import { test, before, after } from 'node:test';

import WorkerShim from './support/WorkerShim.js';

import { CPUSolver } from '../src/solvers/index.js';
import { SimulationConfig, getOrbital, createCoulombPotential, createInitialGuess } from '../src/domain/index.js';

const config = new SimulationConfig({ gridSize: 24, halfWidth: 12 });

const OriginalWorker = globalThis.Worker;

before(() => {
    globalThis.Worker = WorkerShim;
});

after(() => {
    globalThis.Worker = OriginalWorker;
});

test('CPU solver runs the kernel in a worker', async () => {
    const grid = config.createGrid();
    const solver = new CPUSolver();

    try {
        await solver.initialize(config, createCoulombPotential(grid), 2);
        await solver.setInitialGuess(createInitialGuess(grid, getOrbital('1s'), 4));

        const firstMeasurement = await solver.iterate(50);
        const secondMeasurement = await solver.iterate(200);

        assert.ok(secondMeasurement.residual < firstMeasurement.residual, 'residual decreases');
        assert.ok(secondMeasurement.energy < -0.4 && secondMeasurement.energy > -0.5);
        assert.ok(secondMeasurement.elapsedMs > 0);

        const state = await solver.readState();

        assert.ok(state instanceof Float32Array && state.length === grid.nodeCount);
        assert.equal((await solver.readOverlaps()).length, 0);

        await solver.commitState();
        await solver.setInitialGuess(createInitialGuess(grid, getOrbital('2s'), 4));
        await solver.iterate(50);

        const overlaps = await solver.readOverlaps();

        assert.equal(overlaps.length, 1);
        assert.ok(Math.abs(overlaps[0]) < 1e-12);
    } finally {
        solver.dispose();
    }
});

test('worker errors reject the call and dispose rejects pending and later calls', async () => {
    const grid = config.createGrid();
    const solver = new CPUSolver();

    await assert.rejects(solver.iterate(10), /not been initialized/, 'iterate before initialize');

    await solver.initialize(config, createCoulombPotential(grid), 1);
    await solver.setInitialGuess(createInitialGuess(grid, getOrbital('1s'), 4));

    const pendingIteration = solver.iterate(100_000);

    solver.dispose();

    await assert.rejects(pendingIteration, /disposed/);
    await assert.rejects(solver.readState(), /disposed/);
});
