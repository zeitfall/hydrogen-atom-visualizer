import assert from 'node:assert/strict';

import { test } from 'node:test';

import InProcessSolver from './support/InProcessSolver.js';

import { CONVERGENCE_CSV_COLUMNS, createConvergenceCSV } from '../src/ui/csv.js';
import { SimulationConfig, ORBITALS, getExactEnergy } from '../src/domain/index.js';
import { SolverRegistry, ResultsStore, SimulationController } from '../src/application/index.js';

test('CSV has one row per convergence check of every state and backend', async () => {
    const solverRegistry = new SolverRegistry()
        .register('cpu', 'CPU', () => new InProcessSolver())
        .register('gpu', 'GPU', () => new InProcessSolver());

    const resultsStore = new ResultsStore();
    const controller = new SimulationController(solverRegistry, resultsStore);
    const config = new SimulationConfig({ gridSize: 24, halfWidth: 12 });

    await controller.compare({ backendIds: ['gpu', 'cpu'], config, targetId: '2s', livePreview: false });

    const states = ORBITALS.slice(0, 2).map((orbital) => {
        const runs = solverRegistry.getBackends().map(({ id, label }) => {
            const { history } = resultsStore.getResult(id, config.signature, orbital.id);

            return { label, history };
        });

        return {
            id: orbital.id,
            n: orbital.n,
            l: orbital.l,
            exactEnergy: getExactEnergy(orbital.n),
            runs
        };
    });

    const lines = createConvergenceCSV(states).trimEnd().split('\n');
    const rows = lines.slice(1).map((line) => line.split(','));

    const expectedRowCount = states.reduce((stateSum, state) => {
        return stateSum + state.runs.reduce((runSum, run) => runSum + run.history.iterations.length, 0);
    }, 0);

    assert.equal(lines[0], CONVERGENCE_CSV_COLUMNS.join(','));
    assert.equal(rows.length, expectedRowCount);
    assert.ok(rows.every((row) => row.length === CONVERGENCE_CSV_COLUMNS.length));

    const firstRow = Object.fromEntries(CONVERGENCE_CSV_COLUMNS.map((column, index) => [column, rows[0][index]]));

    assert.equal(firstRow.state, '1s');
    assert.equal(firstRow.backend, 'CPU');
    assert.equal(Number(firstRow.exact_energy_hartree), -0.5);

    ['iteration', 'time_ms', 'energy_hartree', 'residual'].forEach((column) => {
        assert.ok(Number.isFinite(Number(firstRow[column])), `${column} = ${firstRow[column]}`);
    });

    assert.deepEqual(new Set(rows.map((row) => row[3])), new Set(['CPU', 'GPU']));
});

test('CSV quotes fields that contain separators', () => {
    const csv = createConvergenceCSV([{
        id: 'a,b',
        n: 1,
        l: 0,
        exactEnergy: -0.5,
        runs: [{
            label: 'say "hi"',
            history: { iterations: [1], elapsedMs: [0.5], energy: [-0.4], residual: [0.1] }
        }]
    }]);

    assert.equal(csv.split('\n')[1], '"a,b",1,0,"say ""hi""",1,0.500,-0.4,-0.5,0.1');
});
