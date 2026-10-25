import LineChart from './LineChart.js';

import { createElement } from './dom.js';
import { createConvergenceCSV, downloadCSV } from './csv.js';
import {
    formatSpeedup,
    formatChartEnergy,
    formatChartResidual,
    formatLinearTick,
    formatDecadeTick,
    formatChartTime
} from './formatters.js';

const QUANTITIES = Object.freeze({
    residual: { label: 'Residual', logScale: true },
    energy: { label: 'Energy', logScale: false }
});

const X_AXES = Object.freeze({
    iterations: { label: 'Iterations', heading: 'Iteration' },
    time: { label: 'Time', heading: 'Time' }
});

const CHART_HEIGHT = 130;
const DIALOG_TITLE_ID = 'convergence-dialog-title';
const EMPTY_MESSAGE = 'No results for these parameters yet. Use Start or Compare first.';

class ConvergenceDialog {
    #dialogElement;
    #captionElement;
    #legendElement;
    #downloadButtonElement;
    #chartsElement;

    #quantity;
    #xAxis;
    #data;
    #charts;

    constructor() {
        this.#quantity = 'residual';
        this.#xAxis = 'iterations';
        this.#data = { caption: '', fileName: 'convergence.csv', states: [], residualTolerance: 0 };
        this.#charts = [];

        const dialogElement = createElement('dialog', { className: 'convergence-dialog' });
        const headerElement = createElement('header');
        const headingElement = createElement('div', { className: 'convergence-heading' });
        const titleElement = createElement('h2', { id: DIALOG_TITLE_ID, textContent: 'Convergence of all states' });
        const captionElement = createElement('p');
        const closeButtonElement = createElement('button', { type: 'button', className: 'dialog-close', textContent: '×' });

        dialogElement.setAttribute('aria-labelledby', DIALOG_TITLE_ID);
        closeButtonElement.setAttribute('aria-label', 'Close');

        headingElement.append(titleElement, captionElement);
        headerElement.append(headingElement, closeButtonElement);

        const toolbarElement = createElement('div', { className: 'convergence-toolbar' });
        const legendElement = createElement('div', { className: 'chart-legend' });
        const downloadButtonElement = createElement('button', {
            type: 'button',
            className: 'toolbar-button',
            textContent: 'Download CSV',
            title: 'Every convergence check of every state and backend'
        });

        const quantityControl = createSegmentedControl('Quantity', QUANTITIES, this.#quantity, (quantity) => {
            this.#quantity = quantity;

            this.#render();
        });

        const xAxisControl = createSegmentedControl('X axis', X_AXES, this.#xAxis, (xAxis) => {
            this.#xAxis = xAxis;

            this.#render();
        });

        toolbarElement.append(quantityControl, xAxisControl, legendElement, downloadButtonElement);

        const chartsElement = createElement('div', { className: 'convergence-grid' });

        dialogElement.append(headerElement, toolbarElement, chartsElement);

        closeButtonElement.addEventListener('click', () => dialogElement.close());
        downloadButtonElement.addEventListener('click', () => this.#handleDownload());
        dialogElement.addEventListener('click', (event) => this.#handleDialogClick(event));

        document.body.append(dialogElement);

        this.#dialogElement = dialogElement;
        this.#captionElement = captionElement;
        this.#legendElement = legendElement;
        this.#downloadButtonElement = downloadButtonElement;
        this.#chartsElement = chartsElement;
    }

    get isOpen() {
        return this.#dialogElement.open;
    }

    open() {
        this.#dialogElement.showModal();

        this.#render();
    }

    update(data) {
        this.#data = data;

        if (this.isOpen) {
            this.#render();
        }
    }

    #render() {
        this.#charts.forEach((chart) => chart.dispose());
        this.#charts = [];
        this.#chartsElement.replaceChildren();

        const { caption, states, residualTolerance } = this.#data;

        this.#captionElement.textContent = caption;
        this.#downloadButtonElement.disabled = states.length === 0;

        this.#renderLegend(states);

        if (states.length === 0) {
            const emptyElement = createElement('p', { className: 'convergence-empty', textContent: EMPTY_MESSAGE });

            this.#chartsElement.append(emptyElement);

            return;
        }

        const { logScale } = QUANTITIES[this.#quantity];
        const isTimeAxis = this.#xAxis === 'time';
        const sharedDomain = logScale ? computeResidualDomain(states, residualTolerance) : null;

        states.forEach((state) => {
            const chart = new LineChart(this.#chartsElement, {
                title: state.label,
                logScale,
                formatValue: logScale ? formatChartResidual : formatChartEnergy,
                formatYTick: logScale ? formatDecadeTick : formatLinearTick,
                formatX: isTimeAxis ? formatChartTime : String,
                xLabel: X_AXES[this.#xAxis].heading,
                referenceLabel: logScale ? 'Tolerance' : 'Exact',
                showEndLabel: false,
                height: CHART_HEIGHT
            });

            const series = state.runs.map((run) => ({
                label: run.label,
                color: run.color,
                x: isTimeAxis ? run.history.elapsedMs : run.history.iterations,
                y: logScale ? run.history.residual : run.history.energy
            }));

            chart.setData({
                series,
                reference: logScale ? residualTolerance : state.exactEnergy,
                yDomain: sharedDomain,
                subtitle: state.speedup ? `speed-up ${formatSpeedup(state.speedup)}` : ''
            });

            this.#charts.push(chart);
        });
    }

    #renderLegend(states) {
        const legendElement = this.#legendElement;
        const backendColors = new Map();

        states.forEach((state) => {
            state.runs.forEach((run) => backendColors.set(run.label, run.color));
        });

        legendElement.replaceChildren();

        if (backendColors.size < 2) {
            return;
        }

        backendColors.forEach((color, label) => {
            const itemElement = createElement('span');
            const keyElement = createElement('i', { className: 'chart-key' });

            keyElement.style.background = `var(${color})`;

            itemElement.append(keyElement, document.createTextNode(label));

            legendElement.append(itemElement);
        });
    }

    #handleDownload() {
        const { fileName, states } = this.#data;

        downloadCSV(fileName, createConvergenceCSV(states));
    }

    #handleDialogClick(event) {
        if (event.target === this.#dialogElement) {
            this.#dialogElement.close();
        }
    }
}

function computeResidualDomain(states, residualTolerance) {
    let minExponent = Math.log10(residualTolerance);
    let maxExponent = minExponent;

    states.forEach((state) => {
        state.runs.forEach((run) => {
            run.history.residual.forEach((residual) => {
                const exponent = Math.log10(residual);

                if (Number.isFinite(exponent)) {
                    minExponent = Math.min(minExponent, exponent);
                    maxExponent = Math.max(maxExponent, exponent);
                }
            });
        });
    });

    return [minExponent, maxExponent];
}

function createSegmentedControl(label, options, selectedValue, handleChange) {
    const groupElement = createElement('div', { className: 'segmented' });
    const labelElement = createElement('span', { className: 'segmented-label', textContent: label });

    groupElement.setAttribute('role', 'group');
    groupElement.setAttribute('aria-label', label);

    const buttonElements = Object.entries(options).map(([value, option]) => {
        const buttonElement = createElement('button', { type: 'button', textContent: option.label });

        buttonElement.setAttribute('aria-pressed', String(value === selectedValue));

        buttonElement.addEventListener('click', () => {
            buttonElements.forEach((otherButtonElement) => {
                otherButtonElement.setAttribute('aria-pressed', String(otherButtonElement === buttonElement));
            });

            handleChange(value);
        });

        return buttonElement;
    });

    groupElement.append(labelElement, ...buttonElements);

    return groupElement;
}

export default ConvergenceDialog;
