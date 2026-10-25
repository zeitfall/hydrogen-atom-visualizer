import { Group } from 'three/webgpu';

import DomainBox from './DomainBox.js';
import VolumeTexture from './VolumeTexture.js';
import VolumeRenderer from './VolumeRenderer.js';
import SliceRenderer from './SliceRenderer.js';

import { SLICE_NORMALS } from './constants.js';

class OrbitalScene {
    #object;
    #volumeTexture;
    #domainBox;
    #volumeRenderer;
    #sliceRenderer;

    constructor() {
        const volumeTexture = new VolumeTexture();
        const domainBox = new DomainBox();
        const volumeRenderer = new VolumeRenderer(volumeTexture);
        const sliceRenderer = new SliceRenderer(volumeTexture);

        const object = new Group();

        object.add(domainBox.object, volumeRenderer.mesh, sliceRenderer.mesh);

        this.#object = object;
        this.#volumeTexture = volumeTexture;
        this.#domainBox = domainBox;
        this.#volumeRenderer = volumeRenderer;
        this.#sliceRenderer = sliceRenderer;
    }

    get object() {
        return this.#object;
    }

    setWavefunction(data, size) {
        this.#volumeTexture.upload(data, size);
    }

    clearWavefunction() {
        this.#volumeTexture.clear();
    }

    applySettings(settings) {
        const { displayMode, sliceAxis, sliceOffset, showEdges, showAxes } = settings;

        const volumeRenderer = this.#volumeRenderer;
        const sliceRenderer = this.#sliceRenderer;
        const clipNormal = displayMode === 'combined' ? SLICE_NORMALS[sliceAxis] : null;

        volumeRenderer.mesh.visible = displayMode !== 'slice';
        volumeRenderer.setAppearance(settings);
        volumeRenderer.setClipPlane(clipNormal, sliceOffset);

        sliceRenderer.mesh.visible = displayMode !== 'volume';
        sliceRenderer.setAppearance(settings);
        sliceRenderer.setPlane(sliceAxis, sliceOffset);

        this.#domainBox.setEdgesVisible(showEdges);
        this.#domainBox.setAxesVisible(showAxes);
    }
}

export default OrbitalScene;
