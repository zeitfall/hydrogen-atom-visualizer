export const SimulationStatus = Object.freeze({
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPING: 'stopping'
});

export const RunOutcome = Object.freeze({
    COMPLETED: 'completed',
    STOPPED: 'stopped',
    FAILED: 'failed'
});

export const DisplaySource = Object.freeze({
    REFERENCE: 'reference',
    NUMERICAL: 'numerical'
});
