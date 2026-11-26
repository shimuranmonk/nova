import { simulateFlight, predictShot, fromLegacy } from '../js/ide/index.js';

// Synthetic physical launch for exercising the engine; not a Nova calibration.
const synthetic = simulateFlight({
    positionM: [-1, 0, 0.5], velocityMps: [4, 0, 0], spinRadPerS: [0, 0, 0]
}, { bounce: { restitution: 0.8, tangentialRetention: 0.9 } });

const drill = predictShot(fromLegacy([3545, 2177, 50, -5, 40, 1]).shot);
console.log(JSON.stringify({
    syntheticExample: { status: synthetic.status, firstBounce: synthetic.firstBounce,
        secondBounce: synthetic.secondBounce, net: synthetic.net,
        termination: synthetic.termination },
    actualDrillWithoutCalibration: { status: drill.status, outcome: drill.outcome,
        firstBounce: drill.firstBounce, issues: drill.issues }
}, null, 2));
