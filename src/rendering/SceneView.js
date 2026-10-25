import { WebGPURenderer, Scene, Color, PerspectiveCamera, Group } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { BACKGROUND_COLOR } from './constants.js';

const MAX_PIXEL_RATIO = 2;

class SceneView {
    #canvasElement;
    #renderer;
    #scene;
    #camera;
    #controls;
    #physicsRoot;
    #needsRender;

    constructor(canvasElement, device) {
        const renderer = new WebGPURenderer({ canvas: canvasElement, device, antialias: true });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

        const scene = new Scene();

        scene.background = new Color(BACKGROUND_COLOR);

        const camera = new PerspectiveCamera(40, 1, 0.01, 100);

        camera.position.set(3.4, 2.4, 3.8);

        const controls = new OrbitControls(camera, canvasElement);

        controls.enablePan = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 0.5;
        controls.maxDistance = 12;
        controls.autoRotateSpeed = 1.5;

        controls.addEventListener('change', () => this.requestRender());

        const physicsRoot = new Group();

        physicsRoot.rotation.x = -Math.PI / 2;

        scene.add(physicsRoot);

        this.#canvasElement = canvasElement;
        this.#renderer = renderer;
        this.#scene = scene;
        this.#camera = camera;
        this.#controls = controls;
        this.#physicsRoot = physicsRoot;
        this.#needsRender = true;
    }

    get physicsRoot() {
        return this.#physicsRoot;
    }

    async init() {
        await this.#renderer.init();

        const resizeObserver = new ResizeObserver(() => this.#handleResize());

        resizeObserver.observe(this.#canvasElement);

        this.#handleResize();

        this.#renderer.setAnimationLoop(() => this.#handleAnimationFrame());
    }

    requestRender() {
        this.#needsRender = true;
    }

    setAutoRotate(enabled) {
        this.#controls.autoRotate = enabled;
    }

    #handleResize() {
        const canvasElement = this.#canvasElement;
        const width = canvasElement.clientWidth;
        const height = canvasElement.clientHeight;

        if (width === 0 || height === 0) {
            return;
        }

        this.#renderer.setSize(width, height, false);

        this.#camera.aspect = width / height;
        this.#camera.updateProjectionMatrix();

        this.requestRender();
    }

    #handleAnimationFrame() {
        this.#controls.update();

        if (!this.#needsRender) {
            return;
        }

        this.#needsRender = false;

        this.#renderer.render(this.#scene, this.#camera);
    }
}

export default SceneView;
