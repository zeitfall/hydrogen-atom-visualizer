import assert from 'node:assert/strict';

import { test } from 'node:test';

import InProcessSolver from './support/InProcessSolver.js';

import { SimulationConfig } from '../src/domain/index.js';
import {
    SolverRegistry,
    ResultsStore,
    SimulationController,
    SimulationStatus,
    RunOutcome
} from '../src/application/index.js';

const CONTROLLER_EVENT_TYPES = ['statuschange', 'runstart', 'statestart', 'progress', 'preview', 'statedone', 'rundone', 'error'];

const config = new SimulationConfig({
    gridSize: 24,
    halfWidth: 12,
    checkInterval: 20,
    residualTolerance: 1e-4
});

function createSingleBackendSetup() {
    const solvers = [];

    const solverRegistry = new SolverRegistry().register('cpu', 'CPU', () => {
        const solver = new InProcessSolver();

        solvers.push(solver);

        return solver;
    });

    const resultsStore = new ResultsStore();
    const controller = new SimulationController(solverRegistry, resultsStore);
    const events = [];

    CONTROLLER_EVENT_TYPES.forEach((type) => {
        controller.addEventListener(type, (event) => events.push({ type, detail: event.detail }));
    });

    return { controller, resultsStore, solvers, events };
}

function createComparisonSetup() {
    const solverRegistry = new SolverRegistry()
        .register('cpu', 'CPU', () => new InProcessSolver())
        .register('gpu', 'GPU', () => new InProcessSolver());

    const resultsStore = new ResultsStore();
    const controller = new SimulationController(solverRegistry, resultsStore);
    const startedBackendIds = [];

    controller.addEventListener('runstart', (event) => startedBackendIds.push(event.detail.backendId));

    return { controller, resultsStore, startedBackendIds };
}

function filterEvents(events, type) {
    return events.filter((event) => event.type === type);
}

test('solves the sequence up to the target and stores verified results', async () => {
    const { controller, resultsStore, solvers, events } = createSingleBackendSetup();

    await controller.start({ backendId: 'cpu', config, targetId: '2s', livePreview: false });

    const results = resultsStore.getResults('cpu', config.signature);

    assert.deepEqual(results.map((result) => result.orbitalId), ['1s', '2s']);

    results.forEach((result) => {
        assert.ok(result.converged, `${result.orbitalId} did not converge`);
        assert.ok(result.residual < config.residualTolerance);
        assert.ok(result.iterations % config.checkInterval === 0);
        assert.ok(result.elapsedMs > 0);
        assert.ok(result.state instanceof Float32Array);
        assert.ok(result.l2Error > 0 && result.l2Error < 0.3, `${result.orbitalId}: L2 error = ${result.l2Error}`);

        const { iterations, elapsedMs, energy, residual } = result.history;

        assert.equal(iterations.length, result.iterations / config.checkInterval);
        assert.equal(elapsedMs.length, iterations.length);
        assert.equal(elapsedMs.at(-1), result.elapsedMs);
        assert.equal(iterations.at(-1), result.iterations);
        assert.equal(energy.at(-1), result.energy);
        assert.equal(residual.at(-1), result.residual);
        assert.ok(residual[0] > residual.at(-1), 'residual decreases');
    });

    assert.equal(results[0].maxOverlap, 0);
    assert.ok(results[1].maxOverlap < 1e-12);

    const progressEvents = filterEvents(events, 'progress');
    const lastEvent = events.at(-1);

    assert.ok(progressEvents.every((event) => event.detail.history && event.detail.backendId === 'cpu'));
    assert.equal(filterEvents(events, 'statedone').length, 2);
    assert.equal(filterEvents(events, 'preview').length, 0, 'live preview was off');
    assert.equal(filterEvents(events, 'error').length, 0);
    assert.equal(filterEvents(events, 'rundone')[0].detail.stopped, false);
    assert.equal(lastEvent.type, 'statuschange');
    assert.equal(lastEvent.detail.status, SimulationStatus.IDLE);
    assert.ok(solvers[0].isDisposed);
});

test('stop keeps finished states and reports a stopped run', async () => {
    const { controller, resultsStore, events } = createSingleBackendSetup();

    controller.addEventListener('statedone', () => controller.stop(), { once: true });

    await controller.start({ backendId: 'cpu', config, targetId: '2pz', livePreview: true });

    const orbitalIds = resultsStore.getResults('cpu', config.signature).map((result) => result.orbitalId);
    const hasInitialPreview = events.some((event) => event.type === 'preview' && event.detail.iterations === 0);

    assert.deepEqual(orbitalIds, ['1s']);
    assert.equal(filterEvents(events, 'rundone')[0].detail.stopped, true);
    assert.ok(hasInitialPreview, 'initial guess preview');
    assert.equal(controller.status, SimulationStatus.IDLE);
});

test('pause holds the run until resume', async () => {
    const { controller, events } = createSingleBackendSetup();

    controller.addEventListener('progress', () => {
        controller.pause();

        setTimeout(() => controller.resume(), 30);
    }, { once: true });

    await controller.start({ backendId: 'cpu', config, targetId: '1s', livePreview: false });

    const statuses = filterEvents(events, 'statuschange').map((event) => event.detail.status);

    assert.deepEqual(statuses, [
        SimulationStatus.RUNNING,
        SimulationStatus.PAUSED,
        SimulationStatus.RUNNING,
        SimulationStatus.IDLE
    ]);
});

test('second start during a run is rejected', async () => {
    const { controller } = createSingleBackendSetup();

    const run = controller.start({ backendId: 'cpu', config, targetId: '1s', livePreview: false });

    await assert.rejects(controller.start({ backendId: 'cpu', config, targetId: '1s' }), /already in progress/);
    await run;
});

test('registry rejects objects that do not implement the solver interface', () => {
    const solverRegistry = new SolverRegistry().register('broken', 'Broken', () => ({ initialize() {} }));

    assert.throws(() => solverRegistry.createSolver('broken'), /missing/);
    assert.throws(() => solverRegistry.createSolver('absent'), /was not found/);
});

test('compare runs every backend with the same parameters and pairs their results', async () => {
    const { controller, resultsStore, startedBackendIds } = createComparisonSetup();

    const outcome = await controller.compare({ backendIds: ['gpu', 'cpu'], config, targetId: '2s', livePreview: false });

    assert.equal(outcome, RunOutcome.COMPLETED);
    assert.deepEqual(startedBackendIds, ['gpu', 'cpu']);

    ['1s', '2s'].forEach((orbitalId) => {
        const comparison = resultsStore.getComparison('cpu', 'gpu', config.signature, orbitalId);

        assert.ok(comparison && Number.isFinite(comparison.speedup));
        assert.equal(comparison.maxDifference, 0, 'identical solvers give identical states');
    });

    const totals = resultsStore.getTotals('cpu', 'gpu', config.signature);

    assert.equal(totals.stateCount, 2);
    assert.ok(totals.baselineMs > 0 && totals.candidateMs > 0);
});

test('stopping a comparison skips the remaining backends', async () => {
    const { controller, resultsStore, startedBackendIds } = createComparisonSetup();

    controller.addEventListener('statedone', () => controller.stop(), { once: true });

    const outcome = await controller.compare({ backendIds: ['gpu', 'cpu'], config, targetId: '2s', livePreview: false });

    assert.equal(outcome, RunOutcome.STOPPED);
    assert.deepEqual(startedBackendIds, ['gpu']);
    assert.equal(resultsStore.getResults('cpu', config.signature).length, 0);
});
