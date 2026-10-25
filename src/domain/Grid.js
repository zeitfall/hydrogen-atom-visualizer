import { MIN_GRID_SIZE } from './constants.js';

class Grid {
    constructor(size, halfWidth) {
        if (!Number.isInteger(size) || size < MIN_GRID_SIZE || size % 2 !== 0) {
            throw new RangeError(`[Grid]: Size must be an even integer not less than ${MIN_GRID_SIZE}, ${size} is given.`);
        }

        if (!(halfWidth > 0)) {
            throw new RangeError(`[Grid]: Half-width must be positive, ${halfWidth} is given.`);
        }

        const spacing = (2 * halfWidth) / size;

        this.size = size;
        this.halfWidth = halfWidth;
        this.spacing = spacing;
        this.cellVolume = spacing ** 3;
        this.nodeCount = size ** 3;
        this.coordinates = Float64Array.from({ length: size }, (_, index) => -halfWidth + (index + 0.5) * spacing);

        Object.freeze(this);
    }

    getNodeIndex(i, j, k) {
        const size = this.size;

        return i + size * (j + size * k);
    }

    sample(callback) {
        const { size, coordinates } = this;
        const values = new Float64Array(this.nodeCount);

        let nodeIndex = 0;

        for (let k = 0; k < size; k++) {
            const z = coordinates[k];

            for (let j = 0; j < size; j++) {
                const y = coordinates[j];

                for (let i = 0; i < size; i++) {
                    const x = coordinates[i];
                    const r = Math.sqrt(x * x + y * y + z * z);

                    values[nodeIndex++] = callback(x, y, z, r);
                }
            }
        }

        return values;
    }

    dot(leftValues, rightValues) {
        const nodeCount = this.nodeCount;

        let sum = 0;

        for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
            sum += leftValues[nodeIndex] * rightValues[nodeIndex];
        }

        return sum * this.cellVolume;
    }

    norm(values) {
        return Math.sqrt(this.dot(values, values));
    }

    normalize(values) {
        const nodeCount = this.nodeCount;
        const scale = 1 / this.norm(values);

        for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
            values[nodeIndex] *= scale;
        }

        return values;
    }
}

export default Grid;
