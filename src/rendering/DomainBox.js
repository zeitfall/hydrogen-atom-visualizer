import {
    Group,
    Vector3,
    BoxGeometry,
    EdgesGeometry,
    SphereGeometry,
    BufferGeometry,
    LineBasicMaterial,
    MeshBasicMaterial,
    SpriteMaterial,
    LineSegments,
    Line,
    Mesh,
    Sprite,
    CanvasTexture,
    SRGBColorSpace
} from 'three/webgpu';

import { RENDER_ORDER } from './constants.js';

const EDGE_COLOR = 0x9aa4b2;
const EDGE_OPACITY = 0.45;

const NUCLEUS_COLOR = 0xffffff;
const NUCLEUS_RADIUS = 0.012;

const AXIS_LENGTH = 0.35;
const AXIS_LABEL_OFFSET = 0.08;
const AXIS_LABEL_SCALE = 0.12;
const AXIS_LABEL_TEXTURE_SIZE = 64;
const AXIS_LABEL_FONT_SIZE = 0.7 * AXIS_LABEL_TEXTURE_SIZE;

const AXES = Object.freeze([
    { label: 'x', direction: new Vector3(1, 0, 0), color: '#ff6b6b' },
    { label: 'y', direction: new Vector3(0, 1, 0), color: '#6bdc8b' },
    { label: 'z', direction: new Vector3(0, 0, 1), color: '#6ba8ff' }
]);

class DomainBox {
    #object;
    #edges;
    #nucleus;
    #axes;

    constructor() {
        const edges = createEdges();
        const nucleus = createNucleus();
        const axes = createAxes(new Vector3(-1, -1, -1));

        const object = new Group();

        object.add(edges, nucleus, axes);

        this.#object = object;
        this.#edges = edges;
        this.#nucleus = nucleus;
        this.#axes = axes;
    }

    get object() {
        return this.#object;
    }

    setEdgesVisible(visible) {
        this.#edges.visible = visible;
    }

    setAxesVisible(visible) {
        this.#axes.visible = visible;
    }
}

function createEdges() {
    const geometry = new EdgesGeometry(new BoxGeometry(2, 2, 2));
    const material = new LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: EDGE_OPACITY, depthWrite: false });
    const edges = new LineSegments(geometry, material);

    edges.renderOrder = RENDER_ORDER.OVERLAY;

    return edges;
}

function createNucleus() {
    const geometry = new SphereGeometry(NUCLEUS_RADIUS, 12, 8);
    const material = new MeshBasicMaterial({ color: NUCLEUS_COLOR });
    const nucleus = new Mesh(geometry, material);

    nucleus.renderOrder = RENDER_ORDER.MARKER;

    return nucleus;
}

function createAxes(origin) {
    const axes = new Group();

    AXES.forEach(({ label, direction, color }) => {
        const end = origin.clone().addScaledVector(direction, AXIS_LENGTH);

        const geometry = new BufferGeometry().setFromPoints([origin, end]);
        const material = new LineBasicMaterial({ color, transparent: true, depthWrite: false });
        const line = new Line(geometry, material);

        line.renderOrder = RENDER_ORDER.OVERLAY;

        const axisLabel = createAxisLabel(label, color);

        axisLabel.position.copy(origin).addScaledVector(direction, AXIS_LENGTH + AXIS_LABEL_OFFSET);

        axes.add(line, axisLabel);
    });

    return axes;
}

function createAxisLabel(text, color) {
    const textureSize = AXIS_LABEL_TEXTURE_SIZE;
    const canvasElement = document.createElement('canvas');

    canvasElement.width = textureSize;
    canvasElement.height = textureSize;

    const context = canvasElement.getContext('2d');

    context.fillStyle = color;
    context.font = `bold ${AXIS_LABEL_FONT_SIZE}px ui-monospace, Menlo, monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, textureSize / 2, textureSize / 2);

    const texture = new CanvasTexture(canvasElement);

    texture.colorSpace = SRGBColorSpace;

    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new Sprite(material);

    sprite.scale.setScalar(AXIS_LABEL_SCALE);
    sprite.renderOrder = RENDER_ORDER.OVERLAY;

    return sprite;
}

export default DomainBox;
