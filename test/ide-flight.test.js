import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateFlight, ITTF_GEOMETRY, COORDINATE_FRAME, onTable } from '../js/ide/index.js';

const gravity = 9.80665;
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by > ${tolerance}`);
const launch = (positionM = [-1, 0, 0.5], velocityMps = [4, 0, 0]) => ({ positionM, velocityMps });
const bounce = { restitution: 0.8, tangentialRetention: 0.9 };

test('ITTF SI geometry, table edges and coordinate frame are explicit', () => {
    assert.equal(ITTF_GEOMETRY.lengthM, 2.74);
    assert.equal(ITTF_GEOMETRY.widthM, 1.525);
    assert.equal(ITTF_GEOMETRY.netHeightM, 0.1525);
    assert.equal(ITTF_GEOMETRY.tableHeightM, 0.76);
    assert.equal(ITTF_GEOMETRY.ballRadiusM, 0.02);
    assert.equal(COORDINATE_FRAME, 'table-center-player-left-v1');
    assert.equal(onTable([1.37, 0.7625, 0.02]), true);
    assert.equal(onTable([1.37001, 0, 0.02]), false);
});

test('gravity-only first bounce and net clearance match analytic projectile solution', () => {
    const result = simulateFlight(launch());
    const time = Math.sqrt(2 * (0.5 - 0.02) / gravity);
    near(result.firstBounce.timeS, time);
    near(result.firstBounce.positionM[0], -1 + 4 * time);
    near(result.firstBounce.positionM[2], 0.02);
    near(result.net.timeS, 0.25);
    near(result.net.clearanceM, 0.5 - gravity * 0.25 ** 2 / 2 - 0.02 - 0.1525);
    assert.equal(result.net.classification, 'clear');
    assert.equal(result.outcome, 'player-half');
    assert.equal(result.status, 'uncalibrated');
    assert.equal(result.secondBounce, null);
    assert.equal(result.termination, 'BOUNCE_MODEL_REQUIRED');
    assert.equal(result.uncertainty.bounds, null);
});

test('second bounce is second TABLE contact, using explicit bounce coefficients', () => {
    const result = simulateFlight(launch([0.1, 0, 0.3], [0.7, 0, 0]), { bounce });
    const firstTime = Math.sqrt(2 * 0.28 / gravity);
    const afterTime = 2 * gravity * firstTime * bounce.restitution / gravity;
    near(result.secondBounce.timeS, firstTime + afterTime);
    near(result.secondBounce.positionM[0], 0.1 + 0.7 * firstTime + 0.7 * bounce.tangentialRetention * afterTime);
    assert.equal(result.termination, 'SECOND_TABLE_BOUNCE');
    assert.equal(result.floorContact, null);
});

test('net collision terminates trajectory without inventing a landing behind net', () => {
    const result = simulateFlight(launch([-0.2, 0, 0.15], [4, 0, 0]), { bounce });
    assert.equal(result.outcome, 'net');
    assert.equal(result.termination, 'NET_CONTACT');
    assert.equal(result.firstBounce, null);
    assert.equal(result.secondBounce, null);
});

test('net clearance uses bottom of ball, not ball-center height', () => {
    const crossingTime = 0.05;
    const centerAtNet = ITTF_GEOMETRY.netHeightM + 0.01;
    const z = centerAtNet + gravity * crossingTime ** 2 / 2;
    const result = simulateFlight(launch([-0.2, 0, z], [4, 0, 0]));
    near(result.net.clearanceM, -0.01);
    assert.equal(result.termination, 'NET_CONTACT');
});

test('around-net path is distinct from a clear over-net path', () => {
    const result = simulateFlight(launch([-0.2, 1.1, 0.2], [4, 0, 0]));
    assert.equal(result.net.classification, 'around-net');
    assert.equal(result.firstBounce, null);
    assert.equal(result.outcome, 'out');
    assert.ok(result.floorContact);
});

test('table miss records a plane intersection and floor contact, not a table bounce', () => {
    const result = simulateFlight(launch([0.1, 0, 0.3], [12, 0, 0]), { bounce });
    assert.equal(result.outcome, 'out');
    assert.equal(result.tablePlaneCrossing.onTable, false);
    assert.equal(result.firstBounce, null);
    assert.equal(result.secondBounce, null);
    assert.ok(result.floorContact.timeS > result.tablePlaneCrossing.timeS);
    near(result.floorContact.positionM[2], -0.74);
});

test('a floor contact after first table bounce never becomes the second bounce', () => {
    const result = simulateFlight(launch([1.0, 0, 0.3], [1, 0, 0]), { bounce });
    assert.ok(result.firstBounce);
    assert.equal(result.secondBounce, null);
    assert.equal(result.termination, 'FLOOR_CONTACT');
});

test('first robot-half bounce can precede net crossing and player-half second bounce', () => {
    const result = simulateFlight(launch([-0.5, 0, 0.3], [1, 0, -1]), { bounce: { restitution: 1, tangentialRetention: 1 } });
    assert.ok(result.firstBounce.positionM[0] < 0);
    assert.ok(result.net.timeS > result.firstBounce.timeS);
    assert.equal(result.net.classification, 'clear');
    assert.ok(result.secondBounce.positionM[0] > 0);
    assert.equal(result.outcome, 'robot-half');
});

test('earliest collision wins when net and table planes are crossed in the same step', () => {
    const result = simulateFlight(launch([-0.03, 0, 0.03], [100, 0, -5]), {}, { timeStepS: 0.01 });
    assert.equal(result.events[0].type, 'NET');
    assert.equal(result.firstBounce, null);
});

test('mirror symmetry and reverse travel preserve the geometry convention', () => {
    const forward = simulateFlight(launch([-1, 0.1, 0.5], [4, 0.2, 0]));
    const mirrored = simulateFlight(launch([-1, -0.1, 0.5], [4, -0.2, 0]));
    near(forward.firstBounce.positionM[1], -mirrored.firstBounce.positionM[1]);
    const reverse = simulateFlight(launch([1, 0.1, 0.5], [-4, 0.2, 0]));
    near(forward.firstBounce.positionM[0], -reverse.firstBounce.positionM[0]);
    assert.equal(reverse.net.classification, 'clear');
    assert.equal(reverse.outcome, 'robot-half');
});

test('drag and Magnus terms have correct direction and converge with smaller timestep', () => {
    const shot = { ...launch([-1, 0, 1], [5, 0, 1]), spinRadPerS: [0, 20, 0] };
    const environment = { aerodynamics: { dragPerM: 0.08, magnusCoefficient: 0.002 } };
    const coarse = simulateFlight(shot, environment, { timeStepS: 0.01, maxTimeS: 0.2 });
    const fine = simulateFlight(shot, environment, { timeStepS: 0.001, maxTimeS: 0.2 });
    const fineLast = fine.trajectory.at(-1);
    const coarseLast = coarse.trajectory.at(-1);
    near(fineLast.timeS, coarseLast.timeS);
    fineLast.positionM.forEach((value, i) => near(value, coarseLast.positionM[i], 1e-6));
    assert.ok(fineLast.velocityMps[0] < 5);
    const noSpin = simulateFlight(launch([-1, 0, 1], [5, 0, 1]), environment, { timeStepS: 0.001, maxTimeS: 0.2 });
    assert.ok(fineLast.positionM[2] < noSpin.trajectory.at(-1).positionM[2]);
});

test('invalid launch/model/timestep inputs fail without finite-looking fake predictions', () => {
    for (const bad of [null, {}, launch([0, 0, NaN]), launch([0, 0, 0.01]),
        launch([0, 0, 0.1]), launch([-1, 0, 1], [Infinity, 0, 0])]) {
        const result = simulateFlight(bad);
        assert.equal(result.status, 'unsupported');
        assert.equal(result.firstBounce, null);
        assert.equal(result.net, null);
    }
    for (const options of [{ timeStepS: 0 }, { timeStepS: 0.1 }, { maxTimeS: Infinity }, { maxTimeS: -1 }]) {
        assert.equal(simulateFlight(launch(), {}, options).status, 'unsupported');
    }
    for (const environment of [{ geometry: { widthM: -1 } }, { aerodynamics: { windMps: [0, NaN, 0] } },
        { bounce: { restitution: 2, tangentialRetention: 1 } }, { bounce: { restitution: 0.8 } },
        { coordinateFrame: 'floor-camera' }, null]) {
        assert.equal(simulateFlight(launch(), environment).status, 'unsupported');
    }
});

test('ball center contacts tabletop exactly at its edge; just outside is a miss', () => {
    const atEdge = simulateFlight(launch([1.37, 0.7625, 0.3], [0, 0, 0]));
    assert.ok(atEdge.firstBounce);
    const outside = simulateFlight(launch([1.37001, 0.7625, 0.3], [0, 0, 0]));
    assert.equal(outside.firstBounce, null);
    assert.equal(outside.outcome, 'out');
});

test('early horizon ends at exact requested time even between trajectory sample intervals', () => {
    const result = simulateFlight(launch(), {}, { maxTimeS: 0.013 });
    near(result.trajectory.at(-1).timeS, 0.013);
    assert.deepEqual(result.launch.positionM, [-1, 0, 0.5]);
    assert.equal(result.simulation.timeStepS, 0.002);
});

test('time-limited and divergent integrations return explicit unknown/unsupported status', () => {
    const result = simulateFlight(launch(), {}, { maxTimeS: 0.05 });
    assert.equal(result.termination, 'TIME_LIMIT');
    assert.equal(result.firstBounce, null);
    assert.equal(result.outcome, 'unknown');
    const unstable = simulateFlight(launch(), { aerodynamics: { dragPerM: 1e20 } });
    assert.equal(unstable.status, 'unsupported');
    assert.equal(unstable.termination, 'NUMERICAL_FAILURE');
});

test('simulation is deterministic and never mutates its launch, model or options', () => {
    const shot = launch();
    const environment = { bounce };
    const options = { timeStepS: 0.002 };
    const original = structuredClone({ shot, environment, options });
    assert.deepEqual(simulateFlight(shot, environment, options), simulateFlight(shot, environment, options));
    assert.deepEqual({ shot, environment, options }, original);
});
