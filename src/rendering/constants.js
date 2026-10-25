import { Vector3 } from 'three/webgpu';

export const BACKGROUND_COLOR = 0x0b0d12;

export const POSITIVE_COLOR = '#ff7a45';

export const NEGATIVE_COLOR = '#3fa7ff';

export const SLICE_NEUTRAL_COLOR = '#151922';

export const RENDER_ORDER = Object.freeze({
    SLICE: 0,
    VOLUME: 1,
    OVERLAY: 2,
    MARKER: 3
});

export const SLICE_NORMALS = Object.freeze({
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1)
});
