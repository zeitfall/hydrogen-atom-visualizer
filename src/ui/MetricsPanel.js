import { Pane } from 'tweakpane';

import { computeRelativeEnergyError, computeThroughput } from '../domain/index.js';
import { SimulationStatus } from '../application/index.js';

import { PLACEHOLDER } from './constants.js';
import {
    formatEnergy,
    formatPercent,
    formatScientific,
    formatDuration,
    formatIterationTime,
    formatThroughput
} from './formatters.js';

const STATUS_LABELS = Object.freeze({
    [SimulationStatus.IDLE]: 'Idle',
    [SimulationStatus.RUNNING]: 'Running',
    [SimulationStatus.PAUSED]: 'Paused',
    [SimulationStatus.STOPPING]: 'Stopping'
});

class MetricsPanel {
    #pane;
    #runValues;
    #systemValues;

    constructor(containerElement) {
        this.#runValues = {
            status: STATUS_LABELS[SimulationStatus.IDLE],
            backend: PLACEHOLDER,
            state: PLACEHOLDER,
            iterations: PLACEHOLDER,
            energy: PLACEHOLDER,
            exactEnergy: PLACEHOLDER,
            relativeEnergyError: PLACEHOLDER,
            residual: PLACEHOLDER,
            iterationTime: PLACEHOLDER,
            stateTime: PLACEHOLDER,
            runTime: PLACEHOLDER,
            throughput: PLACEHOLDER
        };

        this.#systemValues = {
            gpu: PLACEHOLDER,
            browser: PLACEHOLDER,
            platform: PLACEHOLDER,
            cpuThreadCount: PLACEHOLDER
        };

        this.#pane = new Pane({ container: containerElement, title: 'Metrics' });

        this.#addMonitors('Run', this.#runValues, {
            status: 'Status',
            backend: 'Backend',
            state: 'State',
            iterations: 'Iterations'
        });

        this.#addMonitors('Accuracy', this.#runValues, {
            energy: 'Energy (hartree)',
            exactEnergy: 'Exact energy (hartree)',
            relativeEnergyError: 'Relative energy error',
            residual: 'Residual'
        });

        this.#addMonitors('Performance', this.#runValues, {
            iterationTime: 'Time per iteration',
            stateTime: 'State time',
            runTime: 'Run time',
            throughput: 'Node updates per second'
        });

        this.#addMonitors('System', this.#systemValues, {
            gpu: 'GPU',
            browser: 'Browser',
            platform: 'Platform',
            cpuThreadCount: 'CPU threads'
        }, false);
    }

    setSystemInfo(systemInfo) {
        const systemValues = this.#systemValues;

        systemValues.gpu = systemInfo.gpu;
        systemValues.browser = systemInfo.browser;
        systemValues.platform = systemInfo.platform;
        systemValues.cpuThreadCount = String(systemInfo.cpuThreadCount || PLACEHOLDER);

        this.#pane.refresh();
    }

    setStatus(status, message) {
        this.#runValues.status = message ?? STATUS_LABELS[status];

        this.#pane.refresh();
    }

    startRun(backendLabel) {
        const runValues = this.#runValues;

        Object.keys(runValues).forEach((key) => {
            runValues[key] = PLACEHOLDER;
        });

        runValues.backend = backendLabel;
        runValues.status = STATUS_LABELS[SimulationStatus.RUNNING];

        this.#pane.refresh();
    }

    startState(stateStart) {
        const { orbital, stateIndex, stateCount } = stateStart;
        const runValues = this.#runValues;

        runValues.state = `${orbital.label} (${stateIndex + 1} of ${stateCount})`;
        runValues.iterations = '0';

        this.#pane.refresh();
    }

    showProgress(progress) {
        const { iterations, energy, exactEnergy, residual, elapsedMs, runElapsedMs, nodeCount } = progress;
        const runValues = this.#runValues;

        runValues.iterations = String(iterations);
        runValues.energy = formatEnergy(energy);
        runValues.exactEnergy = formatEnergy(exactEnergy);
        runValues.relativeEnergyError = formatPercent(computeRelativeEnergyError(energy, exactEnergy));
        runValues.residual = formatScientific(residual);
        runValues.iterationTime = formatIterationTime(elapsedMs / iterations);
        runValues.stateTime = formatDuration(elapsedMs);
        runValues.runTime = formatDuration(runElapsedMs);
        runValues.throughput = formatThroughput(computeThroughput(nodeCount, iterations, elapsedMs));

        this.#pane.refresh();
    }

    #addMonitors(title, values, labels, expanded = true) {
        const folder = this.#pane.addFolder({ title, expanded });

        Object.entries(labels).forEach(([key, label]) => {
            folder.addBinding(values, key, { label, readonly: true, interval: 0 });
        });
    }
}

export default MetricsPanel;
