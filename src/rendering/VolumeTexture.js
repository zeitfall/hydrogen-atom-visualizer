import { Data3DTexture, RedFormat, FloatType, LinearFilter, ClampToEdgeWrapping } from 'three/webgpu';

class VolumeTexture extends EventTarget {
    #texture;
    #maxAbsoluteValue;

    constructor() {
        super();

        this.#texture = createDataTexture(new Float32Array(1), 1);
        this.#maxAbsoluteValue = 1;
    }

    get texture() {
        return this.#texture;
    }

    get maxAbsoluteValue() {
        return this.#maxAbsoluteValue;
    }

    upload(data, size) {
        const expectedLength = size ** 3;

        if (data.length !== expectedLength) {
            throw new RangeError(`[VolumeTexture]: Expected ${expectedLength} values, ${data.length} is given.`);
        }

        const texture = this.#texture;

        if (texture.image.width === size) {
            texture.image.data = data;
            texture.needsUpdate = true;
        }
        else {
            this.#texture = createDataTexture(data, size);

            texture.dispose();
        }

        this.#maxAbsoluteValue = findMaxAbsoluteValue(data) || 1;

        this.dispatchEvent(new Event('change'));
    }

    clear() {
        this.upload(new Float32Array(1), 1);
    }
}

function createDataTexture(data, size) {
    const texture = new Data3DTexture(data, size, size, size);

    texture.format = RedFormat;
    texture.type = FloatType;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.wrapR = ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    return texture;
}

function findMaxAbsoluteValue(data) {
    let maxAbsoluteValue = 0;

    for (let index = 0; index < data.length; index++) {
        const absoluteValue = Math.abs(data[index]);

        if (absoluteValue > maxAbsoluteValue) {
            maxAbsoluteValue = absoluteValue;
        }
    }

    return maxAbsoluteValue;
}

export default VolumeTexture;
