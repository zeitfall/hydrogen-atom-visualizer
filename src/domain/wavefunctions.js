function createInitialGuess(grid, orbital, width) {
    const inverseWidthSquared = 1 / (width * width);

    const initialGuess = grid.sample((x, y, z, r) => {
        return orbital.angularPart(x, y, z) * Math.exp(-r * r * inverseWidthSquared);
    });

    return grid.normalize(initialGuess);
}

function createReferenceState(grid, orbital) {
    const referenceState = grid.sample(orbital.wavefunction);

    return grid.normalize(referenceState);
}

export {
    createInitialGuess,
    createReferenceState
};
