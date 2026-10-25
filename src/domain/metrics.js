function computeRelativeEnergyError(energy, exactEnergy) {
    return Math.abs(energy - exactEnergy) / Math.abs(exactEnergy);
}

function computeL2Error(state, referenceState, grid) {
    let sameSignSum = 0;
    let oppositeSignSum = 0;

    for (let nodeIndex = 0; nodeIndex < grid.nodeCount; nodeIndex++) {
        const difference = state[nodeIndex] - referenceState[nodeIndex];
        const sum = state[nodeIndex] + referenceState[nodeIndex];

        sameSignSum += difference * difference;
        oppositeSignSum += sum * sum;
    }

    return Math.sqrt(Math.min(sameSignSum, oppositeSignSum) * grid.cellVolume);
}

function computeMaxAbsoluteDifference(leftState, rightState) {
    if (leftState.length !== rightState.length) {
        throw new RangeError('States must have equal length.');
    }

    let sameSignMax = 0;
    let oppositeSignMax = 0;

    for (let nodeIndex = 0; nodeIndex < leftState.length; nodeIndex++) {
        sameSignMax = Math.max(sameSignMax, Math.abs(leftState[nodeIndex] - rightState[nodeIndex]));
        oppositeSignMax = Math.max(oppositeSignMax, Math.abs(leftState[nodeIndex] + rightState[nodeIndex]));
    }

    return Math.min(sameSignMax, oppositeSignMax);
}

function computeMaxOverlap(overlaps) {
    let maxOverlap = 0;

    overlaps.forEach((overlap) => {
        maxOverlap = Math.max(maxOverlap, Math.abs(overlap));
    });

    return maxOverlap;
}

function computeThroughput(nodeCount, iterations, elapsedMs) {
    if (elapsedMs <= 0) {
        return 0;
    }

    return (nodeCount * iterations) / (elapsedMs / 1000);
}

function computeSpeedup(baselineMs, candidateMs) {
    if (candidateMs <= 0) {
        return NaN;
    }

    return baselineMs / candidateMs;
}

export {
    computeRelativeEnergyError,
    computeL2Error,
    computeMaxAbsoluteDifference,
    computeMaxOverlap,
    computeThroughput,
    computeSpeedup
};
