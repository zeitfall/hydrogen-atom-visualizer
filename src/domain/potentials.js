function createCoulombPotential(grid) {
    return grid.sample((x, y, z, r) => -1 / r);
}

export {
    createCoulombPotential
};
