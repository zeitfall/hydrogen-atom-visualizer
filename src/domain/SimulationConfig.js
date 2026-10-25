import Grid from './Grid.js';

import { MIN_GRID_SIZE, DEFAULT_SIMULATION_CONFIG } from './constants.js';

class SimulationConfig {
    constructor(parameters = {}) {
        const {
            gridSize,
            halfWidth,
            timeStepFactor,
            initialGuessWidth,
            energyTolerance,
            residualTolerance,
            checkInterval,
            maxIterations
        } = { ...DEFAULT_SIMULATION_CONFIG, ...parameters };

        if (!Number.isInteger(gridSize) || gridSize < MIN_GRID_SIZE || gridSize % 2 !== 0) {
            throw new RangeError(`[SimulationConfig]: Grid size must be an even integer not less than ${MIN_GRID_SIZE}, ${gridSize} is given.`);
        }

        if (!(halfWidth > 0)) {
            throw new RangeError(`[SimulationConfig]: Half-width must be positive, ${halfWidth} is given.`);
        }

        if (!(timeStepFactor > 0 && timeStepFactor < 1)) {
            throw new RangeError(`[SimulationConfig]: Time step factor must lie in (0, 1) to keep the scheme stable, ${timeStepFactor} is given.`);
        }

        if (!(initialGuessWidth > 0)) {
            throw new RangeError(`[SimulationConfig]: Initial guess width must be positive, ${initialGuessWidth} is given.`);
        }

        if (!(energyTolerance > 0)) {
            throw new RangeError(`[SimulationConfig]: Energy tolerance must be positive, ${energyTolerance} is given.`);
        }

        if (!(residualTolerance > 0)) {
            throw new RangeError(`[SimulationConfig]: Residual tolerance must be positive, ${residualTolerance} is given.`);
        }

        if (!Number.isInteger(checkInterval) || checkInterval < 1) {
            throw new RangeError(`[SimulationConfig]: Check interval must be a positive integer, ${checkInterval} is given.`);
        }

        if (!Number.isInteger(maxIterations) || maxIterations < checkInterval) {
            throw new RangeError(`[SimulationConfig]: Max iterations must be an integer not less than the check interval, ${maxIterations} is given.`);
        }

        this.gridSize = gridSize;
        this.halfWidth = halfWidth;
        this.timeStepFactor = timeStepFactor;
        this.initialGuessWidth = initialGuessWidth;
        this.energyTolerance = energyTolerance;
        this.residualTolerance = residualTolerance;
        this.checkInterval = checkInterval;
        this.maxIterations = maxIterations;

        Object.freeze(this);
    }

    get spacing() {
        return (2 * this.halfWidth) / this.gridSize;
    }

    get timeStepLimit() {
        return this.spacing ** 2 / 3;
    }

    get timeStep() {
        return this.timeStepFactor * this.timeStepLimit;
    }

    get signature() {
        const parameters = [
            this.gridSize,
            this.halfWidth,
            this.timeStepFactor,
            this.initialGuessWidth,
            this.energyTolerance,
            this.residualTolerance,
            this.checkInterval,
            this.maxIterations
        ];

        return parameters.join('|');
    }

    createGrid() {
        return new Grid(this.gridSize, this.halfWidth);
    }
}

export default SimulationConfig;
