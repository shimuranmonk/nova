import {
    COMMANDS,
    COMMAND_RESULTS,
    SESSION_STATES
} from './command-controller.js';

export function createMsyncVoiceController({
    getState,
    getTarget,
    start,
    stop,
    pause,
    resume
}) {
    function result(status, command, reason = '') {
        return {
            status,
            command,
            state: getState(),
            reason
        };
    }

    return {
        async execute(command) {
            const state = getState();

            if (command === COMMANDS.START) {
                const target = getTarget();

                if (state !== SESSION_STATES.ARMED || !target) {
                    return result(
                        state === SESSION_STATES.IDLE
                            ? COMMAND_RESULTS.BLOCKED
                            : COMMAND_RESULTS.IGNORED,
                        command,
                        state === SESSION_STATES.IDLE
                            ? 'No MSYNC target armed'
                            : 'MSYNC session already active'
                    );
                }

                const started = await start({ ...target });
                return result(
                    started
                        ? COMMAND_RESULTS.EXECUTED
                        : COMMAND_RESULTS.BLOCKED,
                    command,
                    started ? '' : 'MSYNC start requirements not met'
                );
            }

            if (command === COMMANDS.STOP) {
                if (![
                    SESSION_STATES.COUNTDOWN,
                    SESSION_STATES.RUNNING,
                    SESSION_STATES.PAUSED
                ].includes(state)) {
                    return result(
                        COMMAND_RESULTS.IGNORED,
                        command,
                        'Nothing to stop'
                    );
                }

                stop();
                return result(COMMAND_RESULTS.EXECUTED, command);
            }

            if (command === COMMANDS.PAUSE) {
                if (state !== SESSION_STATES.RUNNING) {
                    return result(
                        COMMAND_RESULTS.IGNORED,
                        command,
                        state === SESSION_STATES.PAUSED
                            ? 'Session already paused'
                            : 'Session is not running'
                    );
                }

                pause();
                return result(COMMAND_RESULTS.EXECUTED, command);
            }

            if (command === COMMANDS.RESUME) {
                if (state !== SESSION_STATES.PAUSED) {
                    return result(
                        COMMAND_RESULTS.IGNORED,
                        command,
                        'Session is not paused'
                    );
                }

                const resumed = await resume();
                return result(
                    resumed
                        ? COMMAND_RESULTS.EXECUTED
                        : COMMAND_RESULTS.BLOCKED,
                    command,
                    resumed ? '' : 'Unable to resume MSYNC'
                );
            }

            return result(
                COMMAND_RESULTS.BLOCKED,
                command,
                'Unknown command'
            );
        }
    };
}
