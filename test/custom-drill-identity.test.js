import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CUSTOM_DATA_BACKUP_KEY,
    CUSTOM_DATA_KEY,
    CUSTOM_DATA_MIGRATION_KEY,
    CUSTOM_DATA_PENDING_KEY,
    createCustomDrillMigrationReport,
    findCustomDrillById,
    findCustomDrillByKey,
    migrateCustomDrillIds,
    normalizeCustomDrillData
} from '../js/custom-drill-identity.js';

const IDS = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222'
];

function legacyData() {
    return {
        'custom-a': [
            {
                name: 'Serve Practice',
                key: 'cust_A_Serve_Practice_1'
            }
        ],
        'custom-b': [],
        'custom-c': [],
        futureField: {
            preserved: true
        }
    };
}

class MemoryStorage {
    constructor(initial = {}) {
        this.values = new Map(Object.entries(initial));
        this.failNextPrimaryWrite = false;
    }

    getItem(key) {
        return this.values.has(key)
            ? this.values.get(key)
            : null;
    }

    setItem(key, value) {
        if (key === CUSTOM_DATA_KEY && this.failNextPrimaryWrite) {
            this.failNextPrimaryWrite = false;
            throw new Error('simulated quota failure');
        }

        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

test('normalizes legacy custom drills without losing fields', () => {
    const result = normalizeCustomDrillData(
        legacyData(),
        () => IDS[0]
    );

    assert.equal(result.changed, true);
    assert.equal(result.data['custom-a'][0].id, IDS[0]);
    assert.equal(result.data['custom-a'][0].name, 'Serve Practice');
    assert.deepEqual(result.data.futureField, { preserved: true });
});

test('normalization is idempotent and lowercases UUIDs', () => {
    const source = legacyData();
    source['custom-a'][0].id = IDS[0].toUpperCase();

    const first = normalizeCustomDrillData(source);
    const second = normalizeCustomDrillData(first.data);

    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(second.data['custom-a'][0].id, IDS[0]);
});

test('rejects malformed and duplicate existing UUIDs', () => {
    const malformed = legacyData();
    malformed['custom-a'][0].id = 'not-a-uuid';

    assert.throws(
        () => normalizeCustomDrillData(malformed),
        /invalid ID/
    );

    const duplicate = legacyData();
    duplicate['custom-a'][0].id = IDS[0];
    duplicate['custom-b'].push({
        id: IDS[0],
        name: 'Duplicate',
        key: 'cust_B_Duplicate_1'
    });

    assert.throws(
        () => normalizeCustomDrillData(duplicate),
        /duplicate ID/
    );
});

test('migration writes a backup, verifies data, and marks completion', () => {
    const originalText = JSON.stringify(legacyData());
    const storage = new MemoryStorage({
        [CUSTOM_DATA_KEY]: originalText
    });

    const result = migrateCustomDrillIds(
        storage,
        () => IDS[0]
    );

    assert.equal(result.ok, true);
    assert.equal(result.migrated, true);
    assert.equal(storage.getItem(CUSTOM_DATA_BACKUP_KEY), originalText);
    assert.equal(storage.getItem(CUSTOM_DATA_MIGRATION_KEY), '1');
    assert.equal(storage.getItem(CUSTOM_DATA_PENDING_KEY), null);
    assert.equal(result.data['custom-a'][0].id, IDS[0]);
});

test('migration replaces an invalid backup but preserves a valid one', () => {
    const originalText = JSON.stringify(legacyData());
    const invalidStorage = new MemoryStorage({
        [CUSTOM_DATA_KEY]: originalText,
        [CUSTOM_DATA_BACKUP_KEY]: 'not-json'
    });

    migrateCustomDrillIds(invalidStorage, () => IDS[0]);

    assert.equal(
        invalidStorage.getItem(CUSTOM_DATA_BACKUP_KEY),
        originalText
    );

    const validBackup = JSON.stringify({
        'custom-a': [],
        'custom-b': [],
        'custom-c': []
    });
    const validStorage = new MemoryStorage({
        [CUSTOM_DATA_KEY]: originalText,
        [CUSTOM_DATA_BACKUP_KEY]: validBackup
    });

    migrateCustomDrillIds(validStorage, () => IDS[0]);

    assert.equal(
        validStorage.getItem(CUSTOM_DATA_BACKUP_KEY),
        validBackup
    );
});

test('migration restores the current original after a primary write failure', () => {
    const originalText = JSON.stringify(legacyData());
    const storage = new MemoryStorage({
        [CUSTOM_DATA_KEY]: originalText
    });
    storage.failNextPrimaryWrite = true;

    const result = migrateCustomDrillIds(
        storage,
        () => IDS[0]
    );

    assert.equal(result.ok, false);
    assert.equal(storage.getItem(CUSTOM_DATA_KEY), originalText);
    assert.equal(storage.getItem(CUSTOM_DATA_MIGRATION_KEY), null);
    assert.equal(storage.getItem(CUSTOM_DATA_PENDING_KEY), null);
});

test('finds custom drills by current key or immutable ID', () => {
    const normalized = normalizeCustomDrillData(
        legacyData(),
        () => IDS[0]
    ).data;

    assert.equal(
        findCustomDrillByKey(
            normalized,
            'cust_A_Serve_Practice_1'
        ).id,
        IDS[0]
    );
    assert.equal(
        findCustomDrillById(normalized, IDS[0].toUpperCase()).key,
        'cust_A_Serve_Practice_1'
    );
});

test('creates a copyable migration failure report without drill data', () => {
    const report = createCustomDrillMigrationReport({
        error: new Error('simulated quota failure')
    });

    assert.match(report, /simulated quota failure/);
    assert.match(report, /retained or restored/);
    assert.doesNotMatch(report, /Serve Practice/);
});
