const SOLVER_METHOD_NAMES = Object.freeze([
    'initialize',
    'setInitialGuess',
    'iterate',
    'readOverlaps',
    'readState',
    'commitState',
    'dispose'
]);

function assertSolver(solver) {
    const missingMethodNames = SOLVER_METHOD_NAMES.filter((methodName) => typeof solver?.[methodName] !== 'function');

    if (missingMethodNames.length > 0) {
        throw new TypeError(`Solver is missing the following methods: ${missingMethodNames.join(', ')}.`);
    }

    return solver;
}

export {
    assertSolver
};
