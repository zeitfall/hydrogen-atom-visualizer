import { ORBITALS, getOrbital, getExactEnergy } from './domain/index.js';
import {
    SolverRegistry,
    ResultsStore,
    SimulationController,
    DisplayModel,
    SimulationStatus,
    DisplaySource
} from './application/index.js';
import { CPUSolver, GPUSolver } from './solvers/index.js';
import { SceneView, OrbitalScene } from './rendering/index.js';
import {
    ControlPanel,
    MetricsPanel,
    ResultsTable,
    ConvergencePanel,
    ConvergenceDialog,
    CONVERGENCE_PLACEHOLDER_MESSAGE
} from './ui/index.js';
import { getSystemInfo } from './platform/index.js';

const COMPARISON = Object.freeze({
    baselineId: 'cpu',
    candidateId: 'gpu',
    backendIds: ['gpu', 'cpu']
});

const BACKEND_COLORS = Object.freeze({
    cpu: '--chart-cpu',
    gpu: '--chart-gpu'
});

class App {
    #solverRegistry;
    #resultsStore;
    #simulationController;
    #displayModel;

    #sceneView;
    #orbitalScene;

    #controlPanel;
    #metricsPanel;
    #resultsTable;
    #convergencePanel;
    #convergenceDialog;
    #hudElement;
    #showAllStatesButtonElement;

    #activeRun;

    constructor(gpuContext) {
        const { device, adapterInfo } = gpuContext;

        const solverRegistry = new SolverRegistry()
            .register('cpu', 'CPU', () => new CPUSolver())
            .register('gpu', 'GPU', () => new GPUSolver(device));

        const resultsStore = new ResultsStore();

        this.#solverRegistry = solverRegistry;
        this.#resultsStore = resultsStore;
        this.#simulationController = new SimulationController(solverRegistry, resultsStore);
        this.#displayModel = new DisplayModel(resultsStore);

        this.#sceneView = new SceneView(document.getElementById('viewport'), device);
        this.#orbitalScene = new OrbitalScene();

        this.#controlPanel = new ControlPanel(document.getElementById('pane'), solverRegistry.getBackends());
        this.#metricsPanel = new MetricsPanel(document.getElementById('metrics'));
        this.#resultsTable = new ResultsTable(document.getElementById('results'));
        this.#convergencePanel = new ConvergencePanel(document.getElementById('convergence'));
        this.#convergenceDialog = new ConvergenceDialog();
        this.#hudElement = document.getElementById('hud');
        this.#showAllStatesButtonElement = document.getElementById('show-all-states');

        this.#activeRun = null;

        this.#metricsPanel.setSystemInfo(getSystemInfo(adapterInfo));
    }

    async init() {
        await this.#sceneView.init();

        this.#sceneView.physicsRoot.add(this.#orbitalScene.object);

        this.#addModelListeners();
        this.#addControlPanelListeners();
        this.#addSimulationListeners();

        this.#showAllStatesButtonElement.addEventListener('click', () => this.#openConvergenceDialog());

        this.#applyViewSettings();
        this.#refreshSelection();
    }

    #addModelListeners() {
        this.#displayModel.addEventListener('change', (event) => this.#handleDisplayChange(event));

        this.#resultsStore.addEventListener('change', () => {
            this.#renderResultsTable();
            this.#showStoredConvergence();
            this.#refreshConvergenceDialog();
        });
    }

    #addControlPanelListeners() {
        const controlPanel = this.#controlPanel;
        const simulationController = this.#simulationController;

        controlPanel.addEventListener('configchange', () => {
            this.#refreshSelection();
            this.#refreshConvergenceDialog();
        });

        controlPanel.addEventListener('runchange', () => this.#refreshSelection());
        controlPanel.addEventListener('viewchange', (event) => this.#handleViewChange(event));
        controlPanel.addEventListener('start', () => this.#startRun());
        controlPanel.addEventListener('compare', () => this.#startComparison());
        controlPanel.addEventListener('pause', () => this.#togglePause());
        controlPanel.addEventListener('stop', () => simulationController.stop());
    }

    #addSimulationListeners() {
        const simulationController = this.#simulationController;

        simulationController.addEventListener('statuschange', (event) => this.#handleStatusChange(event));
        simulationController.addEventListener('runstart', (event) => this.#handleRunStart(event));
        simulationController.addEventListener('statestart', (event) => this.#handleStateStart(event));
        simulationController.addEventListener('progress', (event) => this.#handleProgress(event));
        simulationController.addEventListener('preview', (event) => this.#displayModel.showPreview(event.detail));
        simulationController.addEventListener('rundone', (event) => this.#handleRunDone(event));
        simulationController.addEventListener('error', (event) => this.#handleRunError(event));
    }

    #handleDisplayChange(event) {
        const { data, size, caption } = event.detail;

        if (data) {
            this.#orbitalScene.setWavefunction(data, size);
        }
        else {
            this.#orbitalScene.clearWavefunction();
        }

        this.#hudElement.textContent = caption;

        this.#sceneView.requestRender();
    }

    #handleViewChange(event) {
        const { key } = event.detail;

        if (key === 'source' || key === 'stateId') {
            this.#refreshSelection();
        }
        else {
            this.#applyViewSettings();
        }
    }

    #handleStatusChange(event) {
        const { status } = event.detail;

        this.#controlPanel.setRunStatus(status);

        if (status === SimulationStatus.IDLE) {
            this.#showStoredConvergence();
        }
        else {
            this.#metricsPanel.setStatus(status);
        }
    }

    #handleRunStart(event) {
        const { backendId, config } = event.detail;
        const backendLabel = this.#solverRegistry.getLabel(backendId);

        this.#activeRun = {
            backendId,
            backendLabel,
            residualTolerance: config.residualTolerance
        };

        this.#metricsPanel.startRun(backendLabel);
        this.#controlPanel.showBackend(backendId);
    }

    #handleStateStart(event) {
        const stateStart = event.detail;

        this.#metricsPanel.startState(stateStart);
        this.#controlPanel.followState(stateStart.orbital.id, this.#activeRun.backendId);
        this.#convergencePanel.clear(`Solving ${stateStart.orbital.label}`);
    }

    #handleProgress(event) {
        const progress = event.detail;
        const { backendLabel, residualTolerance } = this.#activeRun;

        this.#metricsPanel.showProgress(progress);

        this.#convergencePanel.show({
            subtitle: `${progress.orbital.label}, ${backendLabel}`,
            history: progress.history,
            exactEnergy: progress.exactEnergy,
            residualTolerance,
            seriesLabel: backendLabel,
            color: BACKEND_COLORS[progress.backendId]
        });
    }

    #handleRunDone(event) {
        const { stopped } = event.detail;

        this.#metricsPanel.setStatus(SimulationStatus.IDLE, stopped ? 'Stopped' : 'Finished');
        this.#displayModel.clearPreview();
    }

    #handleRunError(event) {
        const { error } = event.detail;

        console.error(error);

        this.#metricsPanel.setStatus(SimulationStatus.IDLE, `Error: ${error.message}`);
        this.#displayModel.clearPreview();
    }

    #startRun() {
        const controlPanel = this.#controlPanel;
        const { backendId, targetId, livePreview } = controlPanel.runSettings;

        this.#displayModel.clearPreview();

        this.#simulationController
            .start({ backendId, config: controlPanel.config, targetId, livePreview })
            .catch((error) => console.error(error));
    }

    #startComparison() {
        const controlPanel = this.#controlPanel;
        const { targetId, livePreview } = controlPanel.runSettings;

        this.#displayModel.clearPreview();

        this.#simulationController
            .compare({ backendIds: COMPARISON.backendIds, config: controlPanel.config, targetId, livePreview })
            .catch((error) => console.error(error));
    }

    #togglePause() {
        const simulationController = this.#simulationController;

        if (simulationController.status === SimulationStatus.PAUSED) {
            simulationController.resume();
        }
        else {
            simulationController.pause();
        }
    }

    #applyViewSettings() {
        const viewSettings = this.#controlPanel.viewSettings;

        this.#orbitalScene.applySettings(viewSettings);
        this.#sceneView.setAutoRotate(viewSettings.autoRotate);
        this.#sceneView.requestRender();
    }

    #refreshSelection() {
        this.#displayModel.select(this.#getSelection());

        this.#renderResultsTable();
        this.#showStoredConvergence();
    }

    #getViewedBackendId() {
        const { source } = this.#controlPanel.viewSettings;

        if (source === DisplaySource.REFERENCE) {
            return this.#controlPanel.runSettings.backendId;
        }

        return source;
    }

    #getSelection() {
        const config = this.#controlPanel.config;
        const viewSettings = this.#controlPanel.viewSettings;
        const backendId = this.#getViewedBackendId();
        const isReference = viewSettings.source === DisplaySource.REFERENCE;

        return {
            grid: config.createGrid(),
            signature: config.signature,
            backendId,
            backendLabel: this.#solverRegistry.getLabel(backendId),
            source: isReference ? DisplaySource.REFERENCE : DisplaySource.NUMERICAL,
            stateId: viewSettings.stateId
        };
    }

    #renderResultsTable() {
        const resultsStore = this.#resultsStore;
        const { baselineId, candidateId } = COMPARISON;
        const { grid, signature, backendId, backendLabel } = this.#getSelection();

        const rows = resultsStore.getResults(backendId, signature).map((result) => {
            const comparison = resultsStore.getComparison(baselineId, candidateId, signature, result.orbitalId);

            return { result, comparison };
        });

        const comparisonTotals = resultsStore.getTotals(baselineId, candidateId, signature);

        const totals = {
            iterations: rows.reduce((sum, { result }) => sum + result.iterations, 0),
            elapsedMs: rows.reduce((sum, { result }) => sum + result.elapsedMs, 0),
            speedup: comparisonTotals?.speedup ?? null
        };

        const title = `Results: ${backendLabel}, grid ${grid.size} × ${grid.size} × ${grid.size}`;

        this.#resultsTable.render(title, rows, totals);
    }

    #showStoredConvergence() {
        if (this.#simulationController.status !== SimulationStatus.IDLE) {
            return;
        }

        const resultsStore = this.#resultsStore;
        const { signature, backendId, backendLabel, stateId } = this.#getSelection();
        const result = resultsStore.getResult(backendId, signature, stateId);

        if (!result) {
            const hasResults = resultsStore.getResults(backendId, signature).length > 0;
            const message = hasResults
                ? `No ${backendLabel} result for ${getOrbital(stateId).label}`
                : CONVERGENCE_PLACEHOLDER_MESSAGE;

            this.#convergencePanel.clear(message);

            return;
        }

        this.#convergencePanel.show({
            subtitle: `${result.label}, ${backendLabel}`,
            history: result.history,
            exactEnergy: result.exactEnergy,
            residualTolerance: this.#controlPanel.config.residualTolerance,
            seriesLabel: backendLabel,
            color: BACKEND_COLORS[backendId]
        });
    }

    #openConvergenceDialog() {
        this.#convergenceDialog.update(this.#getConvergenceDialogData());
        this.#convergenceDialog.open();
    }

    #refreshConvergenceDialog() {
        if (this.#convergenceDialog.isOpen) {
            this.#convergenceDialog.update(this.#getConvergenceDialogData());
        }
    }

    #getConvergenceDialogData() {
        const resultsStore = this.#resultsStore;
        const backends = this.#solverRegistry.getBackends();
        const { baselineId, candidateId } = COMPARISON;
        const { grid, signature } = this.#getSelection();

        const states = ORBITALS
            .map((orbital) => {
                const runs = [];

                backends.forEach(({ id, label }) => {
                    const result = resultsStore.getResult(id, signature, orbital.id);

                    if (result) {
                        runs.push({ label, color: BACKEND_COLORS[id], history: result.history });
                    }
                });

                const comparison = resultsStore.getComparison(baselineId, candidateId, signature, orbital.id);

                return {
                    id: orbital.id,
                    label: orbital.label,
                    n: orbital.n,
                    l: orbital.l,
                    exactEnergy: getExactEnergy(orbital.n),
                    speedup: comparison?.speedup ?? null,
                    runs
                };
            })
            .filter((state) => state.runs.length > 0);

        return {
            caption: `Grid ${grid.size} × ${grid.size} × ${grid.size}, half-width ${grid.halfWidth} bohr`,
            fileName: `hydrogen-convergence-N${grid.size}-L${grid.halfWidth}.csv`,
            residualTolerance: this.#controlPanel.config.residualTolerance,
            states
        };
    }
}

export default App;
