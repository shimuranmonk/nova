function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function directParameters(ball) {
    const speed = Number.isFinite(ball[7])
        ? ball[7]
        : Math.round((((ball[0] + ball[1]) / 2 - 970) / 630.5) * 2) / 2;
    const spin = Number.isFinite(ball[8])
        ? ball[8]
        : Math.round((Math.abs(ball[0] - ball[1]) / 2 / 342) * 2) / 2;
    return {
        speed: clamp(speed, 0, 10),
        spin: clamp(spin, 0, 10),
        type: ball[9] || (ball[0] >= ball[1] ? 'top' : 'back'),
        height: clamp(ball[2], -50, 100),
        drop: clamp(ball[3], -10, 10),
        bpm: Math.round(30 + clamp(ball[4], 0, 100) * 0.6),
        reps: Math.round(clamp(ball[5], 1, 200)),
        scatter: clamp(ball[10] || 0, 0, 10)
    };
}

export function makeInlineAlias(name) {
    let stem = String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!stem) stem = 'DRILL';
    if (/^\d/.test(stem)) stem = `DRILL_${stem}`;
    return `INL_${stem.slice(0, 32)}`;
}

export function createMsyncInlineBlock({ name, steps, random = false }) {
    const displayName = String(name || 'Drill').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
    const lines = [
        `[INLINE:${makeInlineAlias(displayName)}]`,
        `NAME=${displayName || 'Drill'}`,
        `RANDOM=${Boolean(random)}`
    ];
    let exportedNumber = 0;
    for (const alternatives of steps || []) {
        const active = (alternatives || []).filter(ball =>
            Array.isArray(ball) && (ball[6] === undefined || ball[6] === 1));
        if (!active.length) continue;
        exportedNumber++;
        for (const ball of active) {
            const value = directParameters(ball);
            let line = `BALL=${exportedNumber};SPEED=${value.speed};SPIN=${value.spin};TYPE=${value.type};HEIGHT=${value.height};DROP=${value.drop};BPM=${value.bpm};REPS=${value.reps}`;
            if (value.scatter > 0) line += `;SCATTER=${value.scatter}`;
            lines.push(line);
        }
    }
    if (!exportedNumber) throw new Error('Drill has no active balls to export');
    return lines.join('\n');
}
