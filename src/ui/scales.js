function computeLinearTicks(min, max, intervalCount = 4) {
    if (!(max > min)) {
        const padding = Math.abs(min) * 0.01 || 1e-3;

        return computeLinearTicks(min - padding, max + padding, intervalCount);
    }

    const roughStep = (max - min) / intervalCount;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const step = pickStepFactor(roughStep / magnitude) * magnitude;

    const firstTickIndex = Math.floor(min / step);
    const lastTickIndex = Math.ceil(max / step);

    const ticks = [];

    for (let tickIndex = firstTickIndex; tickIndex <= lastTickIndex; tickIndex++) {
        ticks.push(Number((tickIndex * step).toPrecision(12)));
    }

    return ticks;
}

function computeLogTicks(minExponent, maxExponent, maxTickCount = 5) {
    let lowExponent = Math.floor(minExponent);
    let highExponent = Math.ceil(maxExponent);

    if (highExponent === lowExponent) {
        highExponent += 1;
    }

    const exponentStride = Math.ceil((highExponent - lowExponent) / (maxTickCount - 1));

    lowExponent = Math.floor(lowExponent / exponentStride) * exponentStride;
    highExponent = Math.ceil(highExponent / exponentStride) * exponentStride;

    const ticks = [];

    for (let exponent = lowExponent; exponent <= highExponent; exponent += exponentStride) {
        ticks.push(exponent);
    }

    return ticks;
}

function findNearestIndex(sortedValues, value) {
    let lowIndex = 0;
    let highIndex = sortedValues.length - 1;

    while (highIndex - lowIndex > 1) {
        const middleIndex = (lowIndex + highIndex) >> 1;

        if (sortedValues[middleIndex] < value) {
            lowIndex = middleIndex;
        }
        else {
            highIndex = middleIndex;
        }
    }

    const lowDistance = Math.abs(sortedValues[lowIndex] - value);
    const highDistance = Math.abs(sortedValues[highIndex] - value);

    return highDistance < lowDistance ? highIndex : lowIndex;
}

function pickStepFactor(ratio) {
    if (ratio >= Math.sqrt(50)) {
        return 10;
    }

    if (ratio >= Math.sqrt(10)) {
        return 5;
    }

    if (ratio >= Math.SQRT2) {
        return 2;
    }

    return 1;
}

export {
    computeLinearTicks,
    computeLogTicks,
    findNearestIndex
};
