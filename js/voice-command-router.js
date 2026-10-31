import {
    COMMANDS,
    COMMAND_RESULTS,
    SESSION_STATES
} from './command-controller.js';

function blocked(command, state, reason) {
    return {
        status: COMMAND_RESULTS.BLOCKED,
        command,
        state,
        reason
    };
}

function ignored(command, state, reason) {
    return {
        status: COMMAND_RESULTS.IGNORED,
        command,
        state,
        reason
    };
}

export function createVoiceCommandRouter({
    isTestMode = () => false,
    getMode = () => 'reps',
    getStandardState = () => SESSION_STATES.IDLE,
    startStandard,
    executeStandard,
    executeMsync = null
} = {}) {
    return {
        route(command) {
            if (!Object.values(COMMANDS).includes(command)) {
                return blocked(
                    command,
                    getStandardState(),
                    'Unknown command'
                );
            }

            if (isTestMode()) {
                return ignored(
                    command,
                    getStandardState(),
                    'Test Mode — commands disabled'
                );
            }

            if (getMode() === 'msync') {
                if (typeof executeMsync !== 'function') {
                    return blocked(
                        command,
                        SESSION_STATES.IDLE,
                        'MSYNC voice control is not available yet'
                    );
                }

                return executeMsync(command);
            }

            if (command === COMMANDS.START) {
                return typeof startStandard === 'function'
                    ? startStandard()
                    : blocked(
                        command,
                        getStandardState(),
                        'No standard START route'
                    );
            }

            return typeof executeStandard === 'function'
                ? executeStandard(command)
                : blocked(
                    command,
                    getStandardState(),
                    'No standard command route'
                );
        }
    };
}
