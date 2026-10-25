import assert from 'node:assert/strict';

import { test } from 'node:test';

import { CPUKernel } from '../src/solvers/index.js';
import {
    Grid,
    getOrbital,
    getOrbitalSequence,
    getExactEnergy,
    createCoulombPotential,
    createInitialGuess
} from '../src/domain/index.js';

const BATCH_SIZE = 50;

function createKernel(size, halfWidth, options = {}) {
    const { timeStepFactor = 0.9, maxStateCount = 5 } = options;

    const grid = new Grid(size, halfWidth);
    const kernel = new CPUKernel({
        size,
        spacing: grid.spacing,
        timeStep: (timeStepFactor * grid.spacing ** 2) / 3,
        potential: createCoulombPotential(grid),
        maxStateCount
    });

    return { grid, kernel };
}

function converge(kernel, residualTolerance = 1e-6, maxIterations = 20_000) {
    let measurement = kernel.measure();

    for (let iterations = 0; iterations < maxIterations && measurement.residual > residualTolerance; iterations += BATCH_SIZE) {
        kernel.iterate(BATCH_SIZE);

        measurement = kernel.measure();
    }

    return measurement;
}

test('1s converges to the ground state with the expected cusp error', () => {
    const { grid, kernel } = createKernel(32, 10);

    kernel.setState(createInitialGuess(grid, getOrbital('1s'), 4));

    const { energy, residual } = converge(kernel);
    const relativeError = Math.abs(energy - getExactEnergy(1)) / 0.5;

    assert.ok(residual < 1e-6);
    assert.ok(energy > getExactEnergy(1) && relativeError > 0.04 && relativeError < 0.1, `E = ${energy}`);
    assert.ok(Math.abs(grid.norm(kernel.state) - 1) < 1e-12);
});

test('1s energy error decreases as O(h^2)', () => {
    const [coarseError, fineError] = [32, 48].map((size) => {
        const { grid, kernel } = createKernel(size, 10);

        kernel.setState(createInitialGuess(grid, getOrbital('1s'), 4));

        return Math.abs(converge(kernel).energy - getExactEnergy(1));
    });

    const observedOrder = Math.log(coarseError / fineError) / Math.log(48 / 32);

    assert.ok(observedOrder > 1.5 && observedOrder < 2.5, `observed order ${observedOrder.toFixed(2)}`);
});

test('excited states are orthogonal to all previous states and the 2p triplet is degenerate', () => {
    const orbitalSequence = getOrbitalSequence('2pz');
    const { grid, kernel } = createKernel(40, 16, { maxStateCount: orbitalSequence.length });
    const energies = {};

    orbitalSequence.forEach((orbital) => {
        kernel.setState(createInitialGuess(grid, orbital, 4));

        energies[orbital.id] = converge(kernel, 1e-5).energy;

        kernel.computeOverlaps().forEach((overlap) => {
            assert.ok(Math.abs(overlap) < 1e-12, `${orbital.id}: overlap ${overlap}`);
        });

        kernel.commitState();
    });

    assert.ok(Math.abs(energies['2s'] - getExactEnergy(2)) / 0.125 < 0.06);
    assert.ok(Math.abs(energies['2pz'] - getExactEnergy(2)) / 0.125 < 0.04);
    assert.ok(Math.abs(energies['2px'] - energies['2pz']) < 1e-9);
    assert.ok(Math.abs(energies['2py'] - energies['2pz']) < 1e-9);
});

test('time step above the stability limit makes the scheme blow up', () => {
    const { grid, kernel } = createKernel(24, 8, { timeStepFactor: 1.2 });

    kernel.setState(createInitialGuess(grid, getOrbital('1s'), 3));
    kernel.iterate(400);

    assert.ok(kernel.measure().energy > 1);
});

test('readState returns a float32 copy and commitState respects the capacity', () => {
    const { grid, kernel } = createKernel(16, 8, { maxStateCount: 1 });

    kernel.setState(createInitialGuess(grid, getOrbital('1s'), 3));

    const state = kernel.readState();

    assert.ok(state instanceof Float32Array && state.length === grid.nodeCount);

    kernel.commitState();

    assert.throws(() => kernel.commitState(), RangeError);
});
