import test from 'node:test';
import assert from 'node:assert/strict';

import { createDrillArmingController } from '../js/drill-arming.js';

test('drills start normally until Voice Start Ready is enabled', () => {
    const arming = createDrillArmingController();

    assert.equal(arming.isEnabled(), false);
    assert.equal(arming.arm('forehand', 'Forehand'), false);
    assert.equal(arming.getArmedDrill(), null);
});

test('one built-in or custom drill can be armed and replaced', () => {
    const available = new Set(['forehand', 'cust_A_Riffout']);
    const arming = createDrillArmingController({
        isDrillAvailable: (key) => available.has(key)
    });

    arming.setEnabled(true);
    assert.equal(arming.arm('forehand', 'Forehand'), true);
    assert.deepEqual(arming.getArmedDrill(), {
        key: 'forehand',
        label: 'Forehand'
    });

    assert.equal(arming.arm('cust_A_Riffout', 'Riffout'), true);
    assert.deepEqual(arming.getArmedDrill(), {
        key: 'cust_A_Riffout',
        label: 'Riffout'
    });
});

test('disabling Voice Start Ready clears the armed drill', () => {
    const arming = createDrillArmingController();

    arming.setEnabled(true);
    arming.arm('forehand', 'Forehand');
    arming.setEnabled(false);

    assert.equal(arming.getArmedDrill(), null);
});

test('reconcile clears an armed drill that is no longer available', () => {
    let available = true;
    const arming = createDrillArmingController({
        isDrillAvailable: () => available
    });

    arming.setEnabled(true);
    arming.arm('cust_A_Riffout', 'Riffout');
    available = false;

    assert.equal(arming.reconcile(), null);
    assert.equal(arming.getArmedDrill(), null);
});
