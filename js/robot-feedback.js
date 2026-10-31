// Notification mappings documented by cadot-eu/nova-s-pro (src/auth.js),
// building on the Olanga/Smee reverse-engineered protocol. Observations only:
// an ACTIVE report does not prove that a physical ball has left the robot.
export function decodeRobotFeedback(value) {
    const bytes = ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array(value);
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    if (hex === '01810000') return { type: 'REJECTED', hex };
    if (hex === '01800000') return { type: 'ALREADY_STOPPED', hex };
    if (bytes.length === 7 && hex.startsWith('00020300')) {
        const state = { 2: 'STANDBY', 3: 'STANDBY', 4: 'ACTIVE',
            5: 'COMPLETE', 6: 'PAUSED' }[bytes[4]];
        if (state) return { type: 'STATE', state, hex };
    }
    if (bytes.length === 11 && hex.startsWith('00050700')) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return { type: 'PROGRESS', totalShots: view.getUint16(4, true),
            ballIndex: view.getUint16(6, true), sequence: view.getUint16(8, true),
            cycle: bytes[10], hex };
    }
    return null;
}
