const FOUR_PI = 4 * Math.PI;

const S_ANGULAR_NORM = 1 / Math.sqrt(FOUR_PI);
const P_ANGULAR_NORM = Math.sqrt(3 / FOUR_PI);
const D_ANGULAR_NORM = Math.sqrt(15 / FOUR_PI);
const D_X2_Y2_ANGULAR_NORM = Math.sqrt(15 / (4 * FOUR_PI));
const D_Z2_ANGULAR_NORM = Math.sqrt(5 / (4 * FOUR_PI));

const RADIAL_PARTS = Object.freeze({
    '1s': (r) => 2 * Math.exp(-r),
    '2s': (r) => (1 / (2 * Math.SQRT2)) * (2 - r) * Math.exp(-r / 2),
    '2p': (r) => (1 / (2 * Math.sqrt(6))) * Math.exp(-r / 2),
    '3s': (r) => (2 / (81 * Math.sqrt(3))) * (27 - 18 * r + 2 * r * r) * Math.exp(-r / 3),
    '3p': (r) => (4 / (81 * Math.sqrt(6))) * (6 - r) * Math.exp(-r / 3),
    '3d': (r) => (4 / (81 * Math.sqrt(30))) * Math.exp(-r / 3)
});

const ORBITALS = Object.freeze([
    createOrbital('1s', '1s', 1, 0, () => 1, RADIAL_PARTS['1s'], S_ANGULAR_NORM),
    createOrbital('2s', '2s', 2, 0, () => 1, RADIAL_PARTS['2s'], S_ANGULAR_NORM),
    createOrbital('2px', '2px', 2, 1, (x) => x, RADIAL_PARTS['2p'], P_ANGULAR_NORM),
    createOrbital('2py', '2py', 2, 1, (x, y) => y, RADIAL_PARTS['2p'], P_ANGULAR_NORM),
    createOrbital('2pz', '2pz', 2, 1, (x, y, z) => z, RADIAL_PARTS['2p'], P_ANGULAR_NORM),
    createOrbital('3s', '3s', 3, 0, () => 1, RADIAL_PARTS['3s'], S_ANGULAR_NORM),
    createOrbital('3px', '3px', 3, 1, (x) => x, RADIAL_PARTS['3p'], P_ANGULAR_NORM),
    createOrbital('3py', '3py', 3, 1, (x, y) => y, RADIAL_PARTS['3p'], P_ANGULAR_NORM),
    createOrbital('3pz', '3pz', 3, 1, (x, y, z) => z, RADIAL_PARTS['3p'], P_ANGULAR_NORM),
    createOrbital('3dxy', '3dxy', 3, 2, (x, y) => x * y, RADIAL_PARTS['3d'], D_ANGULAR_NORM),
    createOrbital('3dxz', '3dxz', 3, 2, (x, y, z) => x * z, RADIAL_PARTS['3d'], D_ANGULAR_NORM),
    createOrbital('3dyz', '3dyz', 3, 2, (x, y, z) => y * z, RADIAL_PARTS['3d'], D_ANGULAR_NORM),
    createOrbital('3dx2y2', '3dx²−y²', 3, 2, (x, y) => x * x - y * y, RADIAL_PARTS['3d'], D_X2_Y2_ANGULAR_NORM),
    createOrbital('3dz2', '3dz²', 3, 2, (x, y, z) => 2 * z * z - x * x - y * y, RADIAL_PARTS['3d'], D_Z2_ANGULAR_NORM)
]);

function createOrbital(id, label, n, l, angularPart, radialPart, angularNorm) {
    return Object.freeze({
        id,
        label,
        n,
        l,
        angularPart,
        wavefunction: (x, y, z, r) => angularNorm * angularPart(x, y, z) * radialPart(r)
    });
}

function getOrbital(id) {
    const orbital = ORBITALS.find((orbital) => orbital.id === id);

    if (!orbital) {
        throw new RangeError(`Orbital with id "${id}" was not found.`);
    }

    return orbital;
}

function getOrbitalSequence(targetId) {
    const targetOrbital = getOrbital(targetId);
    const targetIndex = ORBITALS.indexOf(targetOrbital);

    return ORBITALS.slice(0, targetIndex + 1);
}

function getExactEnergy(n) {
    return -1 / (2 * n * n);
}

export {
    ORBITALS,
    getOrbital,
    getOrbitalSequence,
    getExactEnergy
};
