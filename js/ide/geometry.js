// ITTF Laws 2.1.1, 2.2.2–3, 2.3.1–2. See docs/IDE-02.md for sources.
export const ITTF_GEOMETRY = Object.freeze({
    lengthM: 2.74, widthM: 1.525, tableHeightM: 0.76,
    netHeightM: 0.1525, netOverhangM: 0.1525,
    ballRadiusM: 0.02, ballMassKg: 0.0027
});

export const COORDINATE_FRAME = 'table-center-player-left-v1';

// Origin on tabletop; +x toward player, +y player's left, +z up. All SI.
export function onTable(position, geometry = ITTF_GEOMETRY) {
    return Math.abs(position[0]) <= geometry.lengthM / 2 + 1e-9 &&
        Math.abs(position[1]) <= geometry.widthM / 2 + 1e-9;
}
