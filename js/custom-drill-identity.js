const CUSTOM_CATEGORIES = [
    'custom-a',
    'custom-b',
    'custom-c'
];

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CUSTOM_DATA_KEY = 'custom_data';
export const CUSTOM_DATA_BACKUP_KEY =
    'custom_data_backup_pre_uuid_v1';
export const CUSTOM_DATA_PENDING_KEY =
    'custom_data_uuid_v1_pending';
export const CUSTOM_DATA_MIGRATION_KEY =
    'custom_data_uuid_migration';

export function isValidCustomDrillId(value) {
    return typeof value === 'string' &&
        UUID_PATTERN.test(value);
}

function isValidCustomDrillBackup(value) {
    if (!value) {
        return false;
    }

    try {
        const parsed = JSON.parse(value);

        return parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            CUSTOM_CATEGORIES.every(category =>
                Array.isArray(parsed[category]) &&
                parsed[category].every(entry =>
                    entry &&
                    typeof entry === 'object' &&
                    !Array.isArray(entry) &&
                    Boolean(entry.name) &&
                    Boolean(entry.key)
                )
            );
    }
    catch (error) {
        return false;
    }
}

export function createCustomDrillMigrationReport(result) {
    const error = result?.error;
    const reason = error?.message || 'Unknown migration error';

    return [
        'Nova custom-drill UUID migration failed.',
        `Reason: ${reason}`,
        'Original custom drills were retained or restored.',
        'Custom MSYNC references are disabled until this is resolved.'
    ].join('\n');
}

export function createCustomDrillId(
    cryptoProvider = globalThis.crypto
) {
    if (!cryptoProvider?.randomUUID) {
        throw new Error(
            'This browser cannot create stable custom drill IDs'
        );
    }

    return cryptoProvider.randomUUID().toLowerCase();
}

export function normalizeCustomDrillData(
    source,
    makeId = () => createCustomDrillId()
) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        throw new Error('Custom drill list is invalid');
    }

    const normalized = {
        ...source
    };
    const usedIds = new Set();
    let changed = false;

    for (const category of CUSTOM_CATEGORIES) {
        const entries = source[category];

        if (!Array.isArray(entries)) {
            throw new Error(`Custom drill category ${category} is invalid`);
        }

        normalized[category] = entries.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw new Error(
                    `Custom drill ${category} item ${index + 1} is invalid`
                );
            }

            if (!entry.name || !entry.key) {
                throw new Error(
                    `Custom drill ${category} item ${index + 1} is missing its name or key`
                );
            }

            let id = entry.id;

            if (id === undefined || id === null || id === '') {
                do {
                    id = makeId();
                } while (usedIds.has(String(id).toLowerCase()));

                if (!isValidCustomDrillId(id)) {
                    throw new Error('Generated custom drill ID is invalid');
                }

                changed = true;
            }
            else if (!isValidCustomDrillId(id)) {
                throw new Error(
                    `Custom drill ${entry.name} has an invalid ID`
                );
            }

            const normalizedId = id.toLowerCase();

            if (usedIds.has(normalizedId)) {
                throw new Error(
                    `Custom drill ${entry.name} has a duplicate ID`
                );
            }

            usedIds.add(normalizedId);

            if (normalizedId !== entry.id) {
                changed = true;
            }

            return {
                ...entry,
                id: normalizedId
            };
        });
    }

    return {
        data: normalized,
        changed
    };
}

export function migrateCustomDrillIds(
    storage,
    makeId = () => createCustomDrillId()
) {
    const originalText = storage.getItem(CUSTOM_DATA_KEY);

    if (!originalText) {
        return {
            ok: true,
            migrated: false,
            data: null
        };
    }

    try {
        const originalData = JSON.parse(originalText);
        const result = normalizeCustomDrillData(
            originalData,
            makeId
        );

        if (!result.changed) {
            storage.setItem(CUSTOM_DATA_MIGRATION_KEY, '1');

            return {
                ok: true,
                migrated: false,
                data: result.data
            };
        }

        if (!isValidCustomDrillBackup(
            storage.getItem(CUSTOM_DATA_BACKUP_KEY)
        )) {
            storage.setItem(
                CUSTOM_DATA_BACKUP_KEY,
                originalText
            );
        }

        const migratedText = JSON.stringify(result.data);

        storage.setItem(
            CUSTOM_DATA_PENDING_KEY,
            migratedText
        );

        const pendingText = storage.getItem(
            CUSTOM_DATA_PENDING_KEY
        );

        const pendingResult = normalizeCustomDrillData(
            JSON.parse(pendingText),
            makeId
        );

        if (pendingResult.changed) {
            throw new Error('Pending custom drill migration is incomplete');
        }

        storage.setItem(CUSTOM_DATA_KEY, pendingText);

        const storedText = storage.getItem(CUSTOM_DATA_KEY);
        const storedResult = normalizeCustomDrillData(
            JSON.parse(storedText),
            makeId
        );

        if (storedResult.changed || storedText !== pendingText) {
            throw new Error('Stored custom drill migration could not be verified');
        }

        storage.setItem(CUSTOM_DATA_MIGRATION_KEY, '1');
        storage.removeItem(CUSTOM_DATA_PENDING_KEY);

        return {
            ok: true,
            migrated: true,
            data: storedResult.data
        };
    }
    catch (error) {
        try {
            storage.setItem(CUSTOM_DATA_KEY, originalText);

            storage.removeItem(CUSTOM_DATA_PENDING_KEY);
            storage.removeItem(CUSTOM_DATA_MIGRATION_KEY);
        }
        catch (recoveryError) {
            console.error(
                'Unable to restore custom drill migration backup:',
                recoveryError
            );
        }

        return {
            ok: false,
            migrated: false,
            data: null,
            error
        };
    }
}

export function findCustomDrillByKey(collections, key) {
    for (const category of CUSTOM_CATEGORIES) {
        const entry = collections[category]?.find(
            drill => drill.key === key
        );

        if (entry) {
            return entry;
        }
    }

    return null;
}

export function findCustomDrillById(collections, id) {
    const normalizedId = String(id || '').toLowerCase();

    for (const category of CUSTOM_CATEGORIES) {
        const entry = collections[category]?.find(
            drill => drill.id === normalizedId
        );

        if (entry) {
            return entry;
        }
    }

    return null;
}
