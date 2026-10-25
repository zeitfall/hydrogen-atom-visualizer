import { Vector3, Color, PlaneGeometry, MeshBasicNodeMaterial, Mesh, DoubleSide } from 'three/webgpu';
import { Fn, abs, clamp, mix, positionLocal, pow, select, texture3D, uniform, vec4 } from 'three/tsl';

import { RENDER_ORDER, SLICE_NORMALS, POSITIVE_COLOR, NEGATIVE_COLOR, SLICE_NEUTRAL_COLOR } from './constants.js';

class SliceRenderer {
    #volumeTexture;
    #textureNode;
    #uniforms;
    #geometries;
    #mesh;

    constructor(volumeTexture) {
        this.#volumeTexture = volumeTexture;
        this.#textureNode = texture3D(volumeTexture.texture, null, 0);
        this.#uniforms = {
            offset: uniform(new Vector3()),
            inverseMaxAbsoluteValue: uniform(1),
            gamma: uniform(1),
            positiveColor: uniform(new Color(POSITIVE_COLOR)),
            negativeColor: uniform(new Color(NEGATIVE_COLOR)),
            neutralColor: uniform(new Color(SLICE_NEUTRAL_COLOR))
        };

        this.#geometries = {
            x: new PlaneGeometry(2, 2).rotateY(Math.PI / 2),
            y: new PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
            z: new PlaneGeometry(2, 2)
        };

        const material = new MeshBasicNodeMaterial({ side: DoubleSide });

        material.colorNode = this.#createColorNode();

        const mesh = new Mesh(this.#geometries.z, material);

        mesh.renderOrder = RENDER_ORDER.SLICE;

        this.#mesh = mesh;

        volumeTexture.addEventListener('change', () => this.#syncTexture());

        this.#syncTexture();
    }

    get mesh() {
        return this.#mesh;
    }

    setPlane(axis, offset) {
        const mesh = this.#mesh;

        mesh.geometry = this.#geometries[axis];
        mesh.position.copy(SLICE_NORMALS[axis]).multiplyScalar(offset);

        this.#uniforms.offset.value.copy(mesh.position);
    }

    setAppearance(settings) {
        const { gamma, positiveColor, negativeColor } = settings;
        const uniforms = this.#uniforms;

        uniforms.gamma.value = gamma;
        uniforms.positiveColor.value.set(positiveColor);
        uniforms.negativeColor.value.set(negativeColor);
    }

    #syncTexture() {
        const volumeTexture = this.#volumeTexture;

        this.#textureNode.value = volumeTexture.texture;
        this.#uniforms.inverseMaxAbsoluteValue.value = 1 / volumeTexture.maxAbsoluteValue;
    }

    #createColorNode() {
        const uniforms = this.#uniforms;
        const textureNode = this.#textureNode;

        return Fn(() => {
            const position = positionLocal.add(uniforms.offset);
            const textureCoordinates = position.mul(0.5).add(0.5);
            const value = textureNode.sample(textureCoordinates).r;
            const normalizedValue = clamp(value.mul(uniforms.inverseMaxAbsoluteValue), -1, 1);
            const signColor = select(normalizedValue.greaterThanEqual(0), uniforms.positiveColor, uniforms.negativeColor);
            const brightness = pow(abs(normalizedValue), uniforms.gamma);

            return vec4(mix(uniforms.neutralColor, signColor, brightness), 1);
        })();
    }
}

export default SliceRenderer;
