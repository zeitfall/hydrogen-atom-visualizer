import assert from 'node:assert/strict';

import { test } from 'node:test';

import {
    Grid,
    SimulationConfig,
    DEFAULT_SIMULATION_CONFIG,
    ORBITALS,
    getOrbital,
    getOrbitalSequence,
    getExactEnergy,
    createCoulombPotential,
    createInitialGuess,
    createReferenceState,
    computeL2Error,
    computeMaxAbsoluteDifference,
    computeRelativeEnergyError,
    computeMaxOverlap,
    computeSpeedup
} from '../src/domain/index.js';

test('config defaults are valid and derived values follow the formulas', () => {
    const config = new SimulationConfig();

    assert.equal(config.gridSize, DEFAULT_SIMULATION_CONFIG.gridSize);
    assert.equal(config.spacing, (2 * config.halfWidth) / config.gridSize);
    assert.equal(config.timeStepLimit, config.spacing ** 2 / 3);
    assert.equal(config.timeStep, config.timeStepFactor * config.timeStepLimit);
    assert.ok(Object.isFrozen(config));
});

test('config rejects an odd grid size, an unstable time step and invalid tolerances', () => {
    assert.throws(() => new SimulationConfig({ gridSize: 63 }), RangeError);
    assert.throws(() => new SimulationConfig({ timeStepFactor: 1 }), RangeError);
    assert.throws(() => new SimulationConfig({ timeStepFactor: 1.2 }), RangeError);
    assert.throws(() => new SimulationConfig({ residualTolerance: 0 }), RangeError);
    assert.throws(() => new SimulationConfig({ checkInterval: 100, maxIterations: 50 }), RangeError);
});

test('config signature identifies the parameter set', () => {
    const config = new SimulationConfig({ gridSize: 64 });

    assert.equal(config.signature, new SimulationConfig({ gridSize: 64 }).signature);
    assert.notEqual(config.signature, new SimulationConfig({ gridSize: 96 }).signature);
    assert.notEqual(config.signature, new SimulationConfig({ initialGuessWidth: 5 }).signature);
});

test('grid is symmetric and has no node at the nucleus', () => {
    const grid = new Grid(16, 8);
    const { coordinates, size, spacing } = grid;

    for (let index = 0; index < size; index++) {
        assert.equal(coordinates[index], -coordinates[size - 1 - index]);
    }

    const closestCoordinate = Math.min(...Array.from(coordinates, Math.abs));

    assert.equal(closestCoordinate, spacing / 2);
    assert.equal(grid.getNodeIndex(1, 2, 3), 1 + 16 * (2 + 16 * 3));
    assert.throws(() => new Grid(15, 8), RangeError);
});

test('grid samples values in x-fastest order', () => {
    const grid = new Grid(4, 2);
    const values = grid.sample((x, y, z) => 100 * x + 10 * y + z);
    const [x0, x1] = grid.coordinates;

    assert.equal(values[grid.getNodeIndex(1, 0, 0)], 100 * x1 + 10 * x0 + x0);
});

test('Coulomb potential is finite and equals -1/r at the innermost node', () => {
    const grid = new Grid(16, 8);
    const potential = createCoulombPotential(grid);
    const innermostRadius = (grid.spacing * Math.sqrt(3)) / 2;

    assert.ok(potential.every(Number.isFinite));
    assert.ok(Math.abs(Math.min(...potential) + 1 / innermostRadius) < 1e-12);
});

test('orbitals come in search order with exact energies', () => {
    const orbitalIds = ORBITALS.map((orbital) => orbital.id);
    const sequenceIds = getOrbitalSequence('2pz').map((orbital) => orbital.id);

    assert.equal(ORBITALS.length, 14);
    assert.equal(new Set(orbitalIds).size, 14);
    assert.deepEqual(sequenceIds, ['1s', '2s', '2px', '2py', '2pz']);
    assert.equal(getExactEnergy(1), -0.5);
    assert.equal(getExactEnergy(3), -1 / 18);
    assert.throws(() => getOrbital('4f'), RangeError);

    for (let index = 1; index < ORBITALS.length; index++) {
        assert.ok(ORBITALS[index].n >= ORBITALS[index - 1].n);
    }
});

test('analytical wavefunctions are normalized on a fine grid', () => {
    const grid = new Grid(96, 24);

    ['1s', '2s', '2pz', '3s', '3pz', '3dxy', '3dz2'].forEach((orbitalId) => {
        const orbital = getOrbital(orbitalId);
        const norm = grid.norm(grid.sample(orbital.wavefunction));

        assert.ok(Math.abs(norm - 1) < 0.02, `${orbitalId}: ||psi|| = ${norm}`);
    });
});

test('reference states are mutually orthogonal', () => {
    const grid = new Grid(64, 20);
    const referenceStates = ORBITALS.map((orbital) => createReferenceState(grid, orbital));

    for (let leftIndex = 0; leftIndex < referenceStates.length; leftIndex++) {
        assert.ok(Math.abs(grid.norm(referenceStates[leftIndex]) - 1) < 1e-12);

        for (let rightIndex = 0; rightIndex < leftIndex; rightIndex++) {
            const overlap = Math.abs(grid.dot(referenceStates[leftIndex], referenceStates[rightIndex]));

            assert.ok(overlap < 0.03, `<${ORBITALS[leftIndex].id}|${ORBITALS[rightIndex].id}> = ${overlap}`);
        }
    }

    const groundState = referenceStates[0];
    const pzState = referenceStates[ORBITALS.indexOf(getOrbital('2pz'))];

    assert.ok(Math.abs(grid.dot(groundState, pzState)) < 1e-14);
});

test('initial guess is normalized, has the target symmetry and differs from the exact solution', () => {
    const grid = new Grid(32, 16);
    const orbital = getOrbital('2pz');
    const initialGuess = createInitialGuess(grid, orbital, 4);
    const lastIndex = grid.size - 1;

    assert.ok(Math.abs(grid.norm(initialGuess) - 1) < 1e-12);

    [[3, 5, 7], [10, 2, 1], [0, 31, 12]].forEach(([i, j, k]) => {
        const value = initialGuess[grid.getNodeIndex(i, j, k)];
        const mirroredValue = initialGuess[grid.getNodeIndex(i, j, lastIndex - k)];

        assert.ok(Math.abs(value + mirroredValue) < 1e-15);
    });

    const overlap = Math.abs(grid.dot(initialGuess, createReferenceState(grid, orbital)));

    assert.ok(overlap > 0.3 && overlap < 0.99, `overlap = ${overlap}`);
});

test('metrics are invariant to the sign of the state', () => {
    const grid = new Grid(16, 8);
    const state = createReferenceState(grid, getOrbital('1s'));
    const flippedState = state.map((value) => -value);

    assert.ok(computeL2Error(state, flippedState, grid) < 1e-12);
    assert.equal(computeMaxAbsoluteDifference(state, flippedState), 0);
    assert.ok(Math.abs(computeRelativeEnergyError(-0.49, -0.5) - 0.02) < 1e-15);
    assert.equal(computeMaxOverlap(new Float64Array([1e-9, -3e-8, 2e-8])), 3e-8);
    assert.equal(computeMaxOverlap(new Float64Array(0)), 0);
    assert.equal(computeSpeedup(1000, 10), 100);
});
