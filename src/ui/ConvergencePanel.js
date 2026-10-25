import LineChart from './LineChart.js';

import { CONVERGENCE_PLACEHOLDER_MESSAGE } from './constants.js';
import { formatChartEnergy, formatChartResidual, formatLinearTick, formatDecadeTick } from './formatters.js';

class ConvergencePanel {
    #energyChart;
    #residualChart;

    constructor(containerElement) {
        this.#energyChart = new LineChart(containerElement, {
            title: 'Energy (hartree)',
            referenceLabel: 'Exact',
            formatValue: formatChartEnergy,
            formatYTick: formatLinearTick
        });

        this.#residualChart = new LineChart(containerElement, {
            title: 'Residual',
            referenceLabel: 'Tolerance',
            logScale: true,
            formatValue: formatChartResidual,
            formatYTick: formatDecadeTick
        });

        this.clear(CONVERGENCE_PLACEHOLDER_MESSAGE);
    }

    show(convergence) {
        const { subtitle, history, exactEnergy, residualTolerance, seriesLabel, color } = convergence;

        this.#energyChart.setData({
            series: [{ label: seriesLabel, color, x: history.iterations, y: history.energy }],
            reference: exactEnergy,
            subtitle
        });

        this.#residualChart.setData({
            series: [{ label: seriesLabel, color, x: history.iterations, y: history.residual }],
            reference: residualTolerance,
            subtitle
        });
    }

    clear(message) {
        this.#energyChart.clear(message);
        this.#residualChart.clear(message);
    }
}

export default ConvergencePanel;
