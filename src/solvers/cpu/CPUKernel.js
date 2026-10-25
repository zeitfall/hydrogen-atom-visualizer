class CPUKernel {
    #size;
    #nodeCount;
    #cellVolume;
    #timeStep;
    #kineticFactor;
    #potential;
    #maxStateCount;

    #state;
    #evolvedState;
    #committedStates;
    #projectionCoefficients;

    constructor(parameters) {
        const { size, spacing, timeStep, potential, maxStateCount } = parameters;
        const nodeCount = size ** 3;

        if (potential.length !== nodeCount) {
            throw new RangeError('[CPUKernel]: Potential does not match the grid.');
        }

        this.#size = size;
        this.#nodeCount = nodeCount;
        this.#cellVolume = spacing ** 3;
        this.#timeStep = timeStep;
        this.#kineticFactor = 1 / (2 * spacing * spacing);
        this.#potential = potential;
        this.#maxStateCount = maxStateCount;

        this.#state = new Float64Array(nodeCount);
        this.#evolvedState = new Float64Array(nodeCount);
        this.#committedStates = [];
        this.#projectionCoefficients = new Float64Array(maxStateCount);
    }

    get state() {
        return this.#state;
    }

    setState(initialState) {
        const state = this.#state;

        state.set(initialState);

        this.#scale(state, 1 / Math.sqrt(this.#dot(state, state)));
    }

    iterate(iterationCount) {
        for (let iteration = 0; iteration < iterationCount; iteration++) {
            this.step();
        }
    }

    step() {
        const state = this.#state;
        const evolvedState = this.#evolvedState;

        this.#evolve(state, evolvedState);
        this.#orthogonalize(evolvedState);
        this.#scale(evolvedState, 1 / Math.sqrt(this.#dot(evolvedState, evolvedState)));

        this.#state = evolvedState;
        this.#evolvedState = state;
    }

    measure() {
        const size = this.#size;
        const layerSize = size * size;
        const state = this.#state;
        const potential = this.#potential;
        const kineticFactor = this.#kineticFactor;

        let energySum = 0;
        let nodeIndex = 0;

        for (let k = 0; k < size; k++) {
            for (let j = 0; j < size; j++) {
                for (let i = 0; i < size; i++, nodeIndex++) {
                    const value = state[nodeIndex];
                    const neighbourSum = sumNeighbours(state, nodeIndex, i, j, k, size, layerSize);
                    const hamiltonianValue = -kineticFactor * (neighbourSum - 6 * value) + potential[nodeIndex] * value;

                    energySum += value * hamiltonianValue;
                }
            }
        }

        const energy = energySum * this.#cellVolume;

        let residualSum = 0;

        nodeIndex = 0;

        for (let k = 0; k < size; k++) {
            for (let j = 0; j < size; j++) {
                for (let i = 0; i < size; i++, nodeIndex++) {
                    const value = state[nodeIndex];
                    const neighbourSum = sumNeighbours(state, nodeIndex, i, j, k, size, layerSize);
                    const hamiltonianValue = -kineticFactor * (neighbourSum - 6 * value) + potential[nodeIndex] * value;
                    const deviation = hamiltonianValue - energy * value;

                    residualSum += deviation * deviation;
                }
            }
        }

        const residual = Math.sqrt(residualSum * this.#cellVolume);

        return { energy, residual };
    }

    computeOverlaps() {
        const state = this.#state;

        return Float64Array.from(this.#committedStates, (committedState) => this.#dot(committedState, state));
    }

    commitState() {
        if (this.#committedStates.length >= this.#maxStateCount) {
            throw new RangeError('[CPUKernel]: Cannot commit state. Orthogonalization basis is full.');
        }

        this.#committedStates.push(Float64Array.from(this.#state));
    }

    readState() {
        return Float32Array.from(this.#state);
    }

    #evolve(sourceState, targetState) {
        const size = this.#size;
        const layerSize = size * size;
        const potential = this.#potential;
        const timeStep = this.#timeStep;
        const diffusionFactor = timeStep * this.#kineticFactor;

        let nodeIndex = 0;

        for (let k = 0; k < size; k++) {
            for (let j = 0; j < size; j++) {
                for (let i = 0; i < size; i++, nodeIndex++) {
                    const value = sourceState[nodeIndex];
                    const neighbourSum = sumNeighbours(sourceState, nodeIndex, i, j, k, size, layerSize);

                    targetState[nodeIndex] = value
                        + diffusionFactor * (neighbourSum - 6 * value)
                        - timeStep * potential[nodeIndex] * value;
                }
            }
        }
    }

    // NOTE: Unlike the GPU, which loops over the states inside every node, the projections are subtracted
    // one state at a time. On the CPU it is about 1.7x faster and gives the same result up to rounding.
    #orthogonalize(targetState) {
        const nodeCount = this.#nodeCount;
        const committedStates = this.#committedStates;
        const committedStateCount = committedStates.length;
        const coefficients = this.#projectionCoefficients;

        for (let stateIndex = 0; stateIndex < committedStateCount; stateIndex++) {
            coefficients[stateIndex] = this.#dot(committedStates[stateIndex], targetState);
        }

        for (let stateIndex = 0; stateIndex < committedStateCount; stateIndex++) {
            const committedState = committedStates[stateIndex];
            const coefficient = coefficients[stateIndex];

            for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
                targetState[nodeIndex] -= coefficient * committedState[nodeIndex];
            }
        }
    }

    #dot(leftState, rightState) {
        const nodeCount = this.#nodeCount;

        let sum = 0;

        for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
            sum += leftState[nodeIndex] * rightState[nodeIndex];
        }

        return sum * this.#cellVolume;
    }

    #scale(targetState, factor) {
        const nodeCount = this.#nodeCount;

        for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
            targetState[nodeIndex] *= factor;
        }
    }
}

function sumNeighbours(values, nodeIndex, i, j, k, size, layerSize) {
    const lastIndex = size - 1;

    const previousX = i > 0 ? values[nodeIndex - 1] : 0;
    const nextX = i < lastIndex ? values[nodeIndex + 1] : 0;
    const previousY = j > 0 ? values[nodeIndex - size] : 0;
    const nextY = j < lastIndex ? values[nodeIndex + size] : 0;
    const previousZ = k > 0 ? values[nodeIndex - layerSize] : 0;
    const nextZ = k < lastIndex ? values[nodeIndex + layerSize] : 0;

    return previousX + nextX + previousY + nextY + previousZ + nextZ;
}

export default CPUKernel;
