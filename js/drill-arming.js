export function createDrillArmingController({
    isDrillAvailable = () => true
} = {}) {
    let enabled = false;
    let armedDrill = null;

    return {
        isEnabled() {
            return enabled;
        },

        setEnabled(nextEnabled) {
            enabled = nextEnabled === true;

            if (!enabled) {
                armedDrill = null;
            }

            return enabled;
        },

        arm(key, label = key) {
            if (!enabled || !key || !isDrillAvailable(key)) {
                return false;
            }

            armedDrill = {
                key,
                label: String(label || key)
            };

            return true;
        },

        clear() {
            armedDrill = null;
        },

        reconcile() {
            if (
                armedDrill &&
                !isDrillAvailable(armedDrill.key)
            ) {
                armedDrill = null;
            }

            return armedDrill;
        },

        getArmedDrill() {
            return armedDrill
                ? { ...armedDrill }
                : null;
        }
    };
}
