import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
const events = [];
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
};
globalThis.document = {
    dispatchEvent: event => events.push(event.type)
};
globalThis.CustomEvent = class {
    constructor(type) { this.type = type; }
};

const state = await import('../js/state.js');

test('updates persistent starting statistics using whole non-negative totals', () => {
    const result = state.updateStatistics(1250, 84);

    assert.deepEqual(result, { balls: 1250, drills: 84 });
    assert.deepEqual(state.appStats, result);
    assert.deepEqual(JSON.parse(values.get('nova_stats')), result);
    assert.ok(events.includes('stats-updated'));
});

test('rejects negative, decimal, and unsafe statistics', () => {
    assert.throws(() => state.updateStatistics(-1, 2), /non-negative whole/);
    assert.throws(() => state.updateStatistics(1.5, 2), /non-negative whole/);
    assert.throws(() => state.updateStatistics(Number.MAX_SAFE_INTEGER + 1, 2),
        /non-negative whole/);
});
