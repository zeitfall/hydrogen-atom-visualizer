import { Pane } from 'tweakpane';

import {
    ORBITALS,
    GRID_SIZES,
    DEFAULT_SIMULATION_CONFIG,
    SIMULATION_PRESETS,
    SimulationConfig,
    getOrbitalSequence
} from '../domain/index.js';
import { SimulationStatus, DisplaySource } from '../application/index.js';
import { POSITIVE_COLOR, NEGATIVE_COLOR } from '../rendering/index.js';

const BYTES_PER_MEBIBYTE = 1024 ** 2;
const GPU_BYTES_PER_VALUE = 4;
const CPU_BYTES_PER_VALUE = 8;
const WORKING_ARRAY_COUNT = 3;

const DEFAULT_TARGET_ID = '2pz';

const DEFAULT_VIEW_SETTINGS = Object.freeze({
    source: DisplaySource.REFERENCE,
    stateId: ORBITALS[0].id,
    followSolver: true,
    displayMode: 'volume',
    sliceAxis: 'z',
    sliceOffset: 0,
    densityGain: 40,
    gamma: 1,
    stepCount: 192,
    positiveColor: POSITIVE_COLOR,
    negativeColor: NEGATIVE_COLOR,
    showEdges: true,
    showAxes: true,
    autoRotate: false
});

const ORBITAL_OPTIONS = Object.fromEntries(ORBITALS.map((orbital) => [orbital.label, orbital.id]));
const GRID_SIZE_OPTIONS = Object.fromEntries(GRID_SIZES.map((gridSize) => [String(gridSize), gridSize]));
const DISPLAY_MODE_OPTIONS = Object.freeze({ Volume: 'volume', Slice: 'slice', 'Volume and slice': 'combined' });
const SLICE_AXIS_OPTIONS = Object.freeze({ x: 'x', y: 'y', z: 'z' });

class ControlPanel extends EventTarget {
    #pane;
    #buttons;
    #lockedWhileRunning;
    #isConfigChangeScheduled;

    #runSettings;
    #gridSettings;
    #solverSettings;
    #viewSettings;
    #derivedValues;

    constructor(containerElement, backends) {
        super();

        this.#runSettings = {
            backendId: backends[0].id,
            targetId: DEFAULT_TARGET_ID,
            livePreview: true
        };

        this.#gridSettings = {
            gridSize: DEFAULT_SIMULATION_CONFIG.gridSize,
            halfWidth: DEFAULT_SIMULATION_CONFIG.halfWidth
        };

        this.#solverSettings = {
            timeStepFactor: DEFAULT_SIMULATION_CONFIG.timeStepFactor,
            initialGuessWidth: DEFAULT_SIMULATION_CONFIG.initialGuessWidth,
            energyTolerance: DEFAULT_SIMULATION_CONFIG.energyTolerance,
            residualTolerance: DEFAULT_SIMULATION_CONFIG.residualTolerance,
            checkInterval: DEFAULT_SIMULATION_CONFIG.checkInterval,
            maxIterations: DEFAULT_SIMULATION_CONFIG.maxIterations
        };

        this.#viewSettings = { ...DEFAULT_VIEW_SETTINGS };

        this.#derivedValues = {
            spacing: '',
            gpuMemory: '',
            cpuMemory: '',
            timeStepLimit: '',
            timeStep: ''
        };

        this.#pane = new Pane({ container: containerElement, title: 'Hydrogen Atom' });
        this.#buttons = {};
        this.#lockedWhileRunning = [];
        this.#isConfigChangeScheduled = false;

        this.#addRunFolder(backends);
        this.#addGridFolder();
        this.#addSolverFolder();
        this.#addViewFolder(backends);

        this.#updateDerivedValues();

        this.setRunStatus(SimulationStatus.IDLE);
    }

    get config() {
        return new SimulationConfig({ ...this.#gridSettings, ...this.#solverSettings });
    }

    get runSettings() {
        return this.#runSettings;
    }

    get viewSettings() {
        return this.#viewSettings;
    }

    setRunStatus(status) {
        const isIdle = status === SimulationStatus.IDLE;
        const isActive = status === SimulationStatus.RUNNING || status === SimulationStatus.PAUSED;
        const { start, compare, pause, stop } = this.#buttons;

        this.#lockedWhileRunning.forEach((blade) => {
            blade.disabled = !isIdle;
        });

        start.disabled = !isIdle;

        if (compare) {
            compare.disabled = !isIdle;
        }

        pause.disabled = !isActive;
        pause.title = status === SimulationStatus.PAUSED ? 'Resume' : 'Pause';

        stop.disabled = !isActive;
    }

    showBackend(backendId) {
        if (this.#runSettings.backendId === backendId) {
            return;
        }

        this.#runSettings.backendId = backendId;

        this.#pane.refresh();
    }

    followState(stateId, backendId) {
        const viewSettings = this.#viewSettings;

        if (!viewSettings.followSolver) {
            return;
        }

        viewSettings.source = backendId;
        viewSettings.stateId = stateId;

        this.#pane.refresh();
    }

    #addRunFolder(backends) {
        const folder = this.#pane.addFolder({ title: 'Run' });
        const runSettings = this.#runSettings;

        const backendOptions = Object.fromEntries(backends.map(({ id, label }) => [label, id]));

        const backendBinding = folder.addBinding(runSettings, 'backendId', { label: 'Backend', options: backendOptions });
        const targetBinding = folder.addBinding(runSettings, 'targetId', { label: 'Target state', options: ORBITAL_OPTIONS });
        const livePreviewBinding = folder.addBinding(runSettings, 'livePreview', { label: 'Live preview' });

        // NOTE: Change events are listened on bindings only, never on a folder.
        // Readonly monitors fire "change" on every refresh, so a folder listener that refreshes the pane loops forever.
        targetBinding.on('change', () => this.#updateDerivedValues());

        [backendBinding, targetBinding, livePreviewBinding].forEach((binding) => {
            binding.on('change', () => this.#dispatchKeyedEvent('runchange', binding.key));
        });

        this.#buttons.start = folder.addButton({ title: 'Start' });

        if (backends.length > 1) {
            this.#buttons.compare = folder.addButton({ title: 'Compare CPU and GPU' });
        }

        this.#buttons.pause = folder.addButton({ title: 'Pause' });
        this.#buttons.stop = folder.addButton({ title: 'Stop' });

        Object.entries(this.#buttons).forEach(([eventType, button]) => {
            button.on('click', () => this.dispatchEvent(new Event(eventType)));
        });

        this.#lockedWhileRunning.push(backendBinding, targetBinding, livePreviewBinding);
    }

    #addGridFolder() {
        const folder = this.#pane.addFolder({ title: 'Grid' });
        const gridSettings = this.#gridSettings;
        const derivedValues = this.#derivedValues;

        this.#watchConfigBindings([
            folder.addBinding(gridSettings, 'gridSize', { label: 'Nodes per axis', options: GRID_SIZE_OPTIONS }),
            folder.addBinding(gridSettings, 'halfWidth', { label: 'Domain half-width (bohr)', min: 10, max: 40, step: 1 })
        ]);

        folder.addBinding(derivedValues, 'spacing', { label: 'Grid spacing (bohr)', readonly: true, interval: 0 });
        folder.addBinding(derivedValues, 'gpuMemory', { label: 'GPU memory', readonly: true, interval: 0 });
        folder.addBinding(derivedValues, 'cpuMemory', { label: 'CPU memory', readonly: true, interval: 0 });

        folder.addButton({ title: 'Fast preset' }).on('click', () => this.#applyPreset(SIMULATION_PRESETS.FAST));
        folder.addButton({ title: 'Accurate preset' }).on('click', () => this.#applyPreset(SIMULATION_PRESETS.ACCURATE));

        this.#lockedWhileRunning.push(folder);
    }

    #addSolverFolder() {
        const folder = this.#pane.addFolder({ title: 'Solver' });
        const solverSettings = this.#solverSettings;
        const derivedValues = this.#derivedValues;

        this.#watchConfigBindings([
            folder.addBinding(solverSettings, 'timeStepFactor', { label: 'Time step factor', min: 0.1, max: 0.99, step: 0.01 }),
            folder.addBinding(solverSettings, 'initialGuessWidth', { label: 'Initial guess width (bohr)', min: 1, max: 12, step: 0.5 }),
            folder.addBinding(solverSettings, 'energyTolerance', { label: 'Energy tolerance', options: createToleranceOptions(3, 10) }),
            folder.addBinding(solverSettings, 'residualTolerance', { label: 'Residual tolerance', options: createToleranceOptions(2, 8) }),
            folder.addBinding(solverSettings, 'checkInterval', { label: 'Convergence check interval', min: 10, max: 500, step: 10 }),
            folder.addBinding(solverSettings, 'maxIterations', { label: 'Maximum iterations', min: 1000, max: 500_000, step: 1000 })
        ]);

        folder.addBinding(derivedValues, 'timeStepLimit', { label: 'Time step limit', readonly: true, interval: 0 });
        folder.addBinding(derivedValues, 'timeStep', { label: 'Time step', readonly: true, interval: 0 });

        this.#lockedWhileRunning.push(folder);
    }

    #addViewFolder(backends) {
        const folder = this.#pane.addFolder({ title: 'View' });
        const viewSettings = this.#viewSettings;

        const sourceOptions = { Reference: DisplaySource.REFERENCE };

        backends.forEach(({ id, label }) => {
            sourceOptions[`Numerical (${label})`] = id;
        });

        const bindings = [
            folder.addBinding(viewSettings, 'source', { label: 'Source', options: sourceOptions }),
            folder.addBinding(viewSettings, 'stateId', { label: 'State', options: ORBITAL_OPTIONS }),
            folder.addBinding(viewSettings, 'followSolver', { label: 'Follow solver' }),
            folder.addBinding(viewSettings, 'displayMode', { label: 'Display mode', options: DISPLAY_MODE_OPTIONS }),
            folder.addBinding(viewSettings, 'sliceAxis', { label: 'Slice axis', options: SLICE_AXIS_OPTIONS }),
            folder.addBinding(viewSettings, 'sliceOffset', { label: 'Slice position', min: -1, max: 1, step: 0.01 }),
            folder.addBinding(viewSettings, 'densityGain', { label: 'Opacity', min: 1, max: 200, step: 1 }),
            folder.addBinding(viewSettings, 'gamma', { label: 'Gamma', min: 0.1, max: 1.5, step: 0.05 }),
            folder.addBinding(viewSettings, 'stepCount', { label: 'Ray marching steps', min: 64, max: 512, step: 16 }),
            folder.addBinding(viewSettings, 'positiveColor', { label: 'Positive color', view: 'color' }),
            folder.addBinding(viewSettings, 'negativeColor', { label: 'Negative color', view: 'color' }),
            folder.addBinding(viewSettings, 'showEdges', { label: 'Box edges' }),
            folder.addBinding(viewSettings, 'showAxes', { label: 'Axes' }),
            folder.addBinding(viewSettings, 'autoRotate', { label: 'Auto-rotate' })
        ];

        bindings.forEach((binding) => {
            binding.on('change', () => this.#dispatchKeyedEvent('viewchange', binding.key));
        });
    }

    #watchConfigBindings(bindings) {
        bindings.forEach((binding) => {
            binding.on('change', (event) => {
                if (event.last) {
                    this.#scheduleConfigChange();
                }
            });
        });
    }

    #applyPreset(preset) {
        Object.assign(this.#gridSettings, preset);

        this.#pane.refresh();

        this.#scheduleConfigChange();
    }

    #scheduleConfigChange() {
        if (this.#isConfigChangeScheduled) {
            return;
        }

        this.#isConfigChangeScheduled = true;

        queueMicrotask(() => {
            this.#isConfigChangeScheduled = false;

            this.#updateDerivedValues();

            this.dispatchEvent(new Event('configchange'));
        });
    }

    #updateDerivedValues() {
        const config = this.config;
        const derivedValues = this.#derivedValues;

        const arrayCount = getOrbitalSequence(this.#runSettings.targetId).length + WORKING_ARRAY_COUNT;
        const valueCount = arrayCount * config.gridSize ** 3;

        derivedValues.spacing = config.spacing.toFixed(4);
        derivedValues.gpuMemory = formatMebibytes(valueCount * GPU_BYTES_PER_VALUE);
        derivedValues.cpuMemory = formatMebibytes(valueCount * CPU_BYTES_PER_VALUE);
        derivedValues.timeStepLimit = config.timeStepLimit.toPrecision(4);
        derivedValues.timeStep = config.timeStep.toPrecision(4);

        this.#pane.refresh();
    }

    #dispatchKeyedEvent(type, key) {
        this.dispatchEvent(new CustomEvent(type, { detail: { key } }));
    }
}

function createToleranceOptions(minExponent, maxExponent) {
    const options = {};

    for (let exponent = minExponent; exponent <= maxExponent; exponent++) {
        const label = `1e-${exponent}`;

        options[label] = Number(label);
    }

    return options;
}

function formatMebibytes(byteCount) {
    return `${(byteCount / BYTES_PER_MEBIBYTE).toFixed(0)} MiB`;
}

export default ControlPanel;
