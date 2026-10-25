export const MIN_GRID_SIZE = 4;

export const GRID_SIZES = Object.freeze([32, 48, 64, 96, 128]);

export const DEFAULT_SIMULATION_CONFIG = Object.freeze({
    gridSize: 64,
    halfWidth: 20,
    timeStepFactor: 0.9,
    initialGuessWidth: 4,
    energyTolerance: 1e-6,
    residualTolerance: 1e-4,
    checkInterval: 50,
    maxIterations: 100_000
});

export const SIMULATION_PRESETS = Object.freeze({
    FAST: Object.freeze({ gridSize: 64, halfWidth: 20 }),
    ACCURATE: Object.freeze({ gridSize: 128, halfWidth: 25 })
});
