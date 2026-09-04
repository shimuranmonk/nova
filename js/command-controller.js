export const COMMANDS = Object.freeze({
    START: 'START',
    STOP: 'STOP',
    PAUSE: 'PAUSE',
    RESUME: 'RESUME'
});

export const SESSION_STATES = Object.freeze({
    IDLE: 'IDLE',
    ARMED: 'ARMED',
    COUNTDOWN: 'COUNTDOWN',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED'
});

export const COMMAND_RESULTS = Object.freeze({
    EXECUTED: 'EXECUTED',
    IGNORED: 'IGNORED',
    BLOCKED: 'BLOCKED'
});

function result(status, command, state, reason = '') {
    return { status, command, state, reason };
}

export function createCommandController({
    getState,
    start,
    stop,
    pause,
    resume
}) {
    if (typeof getState !== 'function') {
        throw new TypeError('getState is required');
    }

    const actions = {
        [COMMANDS.START]: start,
        [COMMANDS.STOP]: stop,
        [COMMANDS.PAUSE]: pause,
        [COMMANDS.RESUME]: resume
    };

    return {
        getState,

        execute(command, context = {}) {
            const state = getState();
            const action = actions[command];

            if (!action) {
                return result(
                    COMMAND_RESULTS.BLOCKED,
                    command,
                    state,
                    'Unknown command'
                );
            }

            if (
                command === COMMANDS.START &&
                state !== SESSION_STATES.IDLE &&
                state !== SESSION_STATES.ARMED
            ) {
                return result(
                    COMMAND_RESULTS.IGNORED,
                    command,
                    state,
                    'Session already active'
                );
            }

            if (
                command === COMMANDS.STOP &&
                state === SESSION_STATES.IDLE
            ) {
                return result(
                    COMMAND_RESULTS.IGNORED,
                    command,
                    state,
                    'Nothing to stop'
                );
            }

            if (
                command === COMMANDS.PAUSE &&
                state !== SESSION_STATES.RUNNING
            ) {
                return result(
                    COMMAND_RESULTS.IGNORED,
                    command,
                    state,
                    state === SESSION_STATES.PAUSED
                        ? 'Session already paused'
                        : 'Session is not running'
                );
            }

            if (
                command === COMMANDS.RESUME &&
                state !== SESSION_STATES.PAUSED
            ) {
                return result(
                    COMMAND_RESULTS.IGNORED,
                    command,
                    state,
                    'Session is not paused'
                );
            }

            const outcome = action(context);

            if (outcome === false) {
                return result(
                    COMMAND_RESULTS.BLOCKED,
                    command,
                    state,
                    'Command requirements not met'
                );
            }

            return result(
                COMMAND_RESULTS.EXECUTED,
                command,
                getState()
            );
        }
    };
}
