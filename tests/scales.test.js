import assert from 'node:assert/strict';

import { test } from 'node:test';

import { computeLinearTicks, computeLogTicks, findNearestIndex } from '../src/ui/scales.js';

test('linear ticks use 1-2-5 steps close to the requested count and enclose the data', () => {
    assert.deepEqual(computeLinearTicks(0, 650, 3), [0, 200, 400, 600, 800]);
    assert.deepEqual(computeLinearTicks(-0.5, -0.19, 3), [-0.5, -0.4, -0.3, -0.2, -0.1]);
    assert.deepEqual(computeLinearTicks(0, 10000, 3), [0, 5000, 10000]);
    assert.deepEqual(computeLinearTicks(-0.1266, -0.1214, 3), [-0.128, -0.126, -0.124, -0.122, -0.12]);
});

test('linear ticks widen a degenerate range instead of dividing by zero', () => {
    const ticks = computeLinearTicks(-0.125, -0.125);

    assert.ok(ticks.length >= 2 && ticks[0] < -0.125 && ticks.at(-1) > -0.125);
});

test('log ticks cover whole decades and are thinned to at most five labels', () => {
    assert.deepEqual(computeLogTicks(-4.3, -0.7), [-6, -4, -2, 0]);
    assert.deepEqual(computeLogTicks(-12, 0), [-12, -9, -6, -3, 0]);
    assert.deepEqual(computeLogTicks(-3, -3), [-3, -2]);
    assert.deepEqual(computeLogTicks(-4, -1), [-4, -3, -2, -1]);
});

test('nearest index is found in a sorted array', () => {
    const iterations = [50, 100, 150, 200];

    assert.equal(findNearestIndex(iterations, 0), 0);
    assert.equal(findNearestIndex(iterations, 124), 1);
    assert.equal(findNearestIndex(iterations, 126), 2);
    assert.equal(findNearestIndex(iterations, 999), 3);
    assert.equal(findNearestIndex([7], 3), 0);
});
