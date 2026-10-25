import { Vector3, Color, BoxGeometry, NodeMaterial, Mesh, BackSide } from 'three/webgpu';
import {
    Fn,
    If,
    Loop,
    Break,
    abs,
    cameraPosition,
    dot,
    exp,
    float,
    max,
    min,
    mix,
    modelWorldMatrixInverse,
    positionGeometry,
    pow,
    select,
    step,
    texture3D,
    uniform,
    varying,
    vec3,
    vec4
} from 'three/tsl';

import { RENDER_ORDER, POSITIVE_COLOR, NEGATIVE_COLOR } from './constants.js';

const DEFAULT_DENSITY_GAIN = 40;
const DEFAULT_STEP_COUNT = 192;
const OPAQUE_ALPHA = 0.99;

class VolumeRenderer {
    #volumeTexture;
    #textureNode;
    #uniforms;
    #mesh;

    constructor(volumeTexture) {
        this.#volumeTexture = volumeTexture;
        this.#textureNode = texture3D(volumeTexture.texture, null, 0);
        this.#uniforms = {
            densityGain: uniform(DEFAULT_DENSITY_GAIN),
            gamma: uniform(1),
            stepCount: uniform(DEFAULT_STEP_COUNT),
            inverseMaxDensity: uniform(1),
            positiveColor: uniform(new Color(POSITIVE_COLOR)),
            negativeColor: uniform(new Color(NEGATIVE_COLOR)),
            clipEnabled: uniform(0),
            clipNormal: uniform(new Vector3(0, 0, 1)),
            clipOffset: uniform(0)
        };

        const material = new NodeMaterial();

        material.colorNode = this.#createRaymarchingNode();
        material.side = BackSide;
        material.transparent = true;
        material.depthWrite = false;
        material.depthTest = false;

        const mesh = new Mesh(new BoxGeometry(2, 2, 2), material);

        mesh.renderOrder = RENDER_ORDER.VOLUME;

        this.#mesh = mesh;

        volumeTexture.addEventListener('change', () => this.#syncTexture());

        this.#syncTexture();
    }

    get mesh() {
        return this.#mesh;
    }

    setAppearance(settings) {
        const { densityGain, gamma, stepCount, positiveColor, negativeColor } = settings;
        const uniforms = this.#uniforms;

        uniforms.densityGain.value = densityGain;
        uniforms.gamma.value = gamma;
        uniforms.stepCount.value = stepCount;
        uniforms.positiveColor.value.set(positiveColor);
        uniforms.negativeColor.value.set(negativeColor);
    }

    setClipPlane(normal, offset = 0) {
        const uniforms = this.#uniforms;

        uniforms.clipEnabled.value = normal ? 1 : 0;
        uniforms.clipOffset.value = offset;

        if (normal) {
            uniforms.clipNormal.value.copy(normal);
        }
    }

    #syncTexture() {
        const volumeTexture = this.#volumeTexture;

        this.#textureNode.value = volumeTexture.texture;
        this.#uniforms.inverseMaxDensity.value = 1 / volumeTexture.maxAbsoluteValue ** 2;
    }

    #createRaymarchingNode() {
        const uniforms = this.#uniforms;
        const textureNode = this.#textureNode;

        const rayOrigin = varying(modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz);
        const rayOffset = varying(positionGeometry.sub(rayOrigin));

        return Fn(() => {
            const rayDirection = rayOffset.normalize().toVar();
            const inverseRayDirection = rayDirection.reciprocal();

            const lowerIntersection = vec3(-1).sub(rayOrigin).mul(inverseRayDirection);
            const upperIntersection = vec3(1).sub(rayOrigin).mul(inverseRayDirection);
            const nearIntersection = min(lowerIntersection, upperIntersection);
            const farIntersection = max(lowerIntersection, upperIntersection);

            const startDistance = max(max(nearIntersection.x, max(nearIntersection.y, nearIntersection.z)), 0).toVar();
            const endDistance = min(farIntersection.x, min(farIntersection.y, farIntersection.z)).toVar();

            const isClippingEnabled = uniforms.clipEnabled.greaterThan(0.5);

            If(isClippingEnabled, () => {
                const clipFacing = dot(rayDirection, uniforms.clipNormal);
                const clipDistance = uniforms.clipOffset.sub(dot(rayOrigin, uniforms.clipNormal)).div(clipFacing);

                If(abs(clipFacing).greaterThan(1e-6).and(clipDistance.greaterThan(startDistance)), () => {
                    endDistance.assign(min(endDistance, clipDistance));
                });
            });

            const stepLength = float(2).div(uniforms.stepCount);
            const accumulatedColor = vec4(0).toVar();

            Loop({ type: 'float', start: startDistance, end: endDistance, update: stepLength }, ({ i: distance }) => {
                const samplePosition = rayOrigin.add(rayDirection.mul(distance));
                const value = textureNode.sample(samplePosition.mul(0.5).add(0.5)).r;

                const visibility = select(isClippingEnabled, step(dot(samplePosition, uniforms.clipNormal), uniforms.clipOffset), float(1));
                const density = pow(value.mul(value).mul(uniforms.inverseMaxDensity), uniforms.gamma).mul(visibility);
                const opacity = float(1).sub(exp(density.mul(uniforms.densityGain).mul(stepLength).negate()));
                const signColor = mix(uniforms.negativeColor, uniforms.positiveColor, step(0, value));

                accumulatedColor.rgb.addAssign(accumulatedColor.a.oneMinus().mul(opacity).mul(signColor));
                accumulatedColor.a.addAssign(accumulatedColor.a.oneMinus().mul(opacity));

                If(accumulatedColor.a.greaterThan(OPAQUE_ALPHA), () => {
                    Break();
                });
            });

            // NOTE: The accumulated color is premultiplied, while the material expects straight alpha.
            return vec4(accumulatedColor.rgb.div(max(accumulatedColor.a, 1e-4)), accumulatedColor.a);
        })();
    }
}

export default VolumeRenderer;
