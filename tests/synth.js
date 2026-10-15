/**
 * FSST//LAB — synthetic ground-truth generator (brief section 13).
 *
 * Builds a full session of pose frames from a script of stages: foot floor trajectories
 * in unit-grid coordinates (stance at given positions, minimum-jerk swings), converted to
 * image pixels with the inverse homography of the preset grid; heel/toe offset by a foot
 * length; ankle/knee/hip/shoulder/nose from a standing body model scaled to a known height.
 *
 * Works in Node (module.exports) and the browser (window.FSSTSynth).
 */
(function (root) {
    'use strict';
    const CONFIG = (typeof require === 'function') ? require('../js/config.js') : root.CONFIG;
    const GEO = (typeof require === 'function') ? require('../js/geometry.js') : root.FSSTGeometry;

    const W = 720, H = 1280;
    const IDX = { nose: 0, l_sh: 1, r_sh: 2, l_el: 3, r_el: 4, l_wr: 5, r_wr: 6, l_hip: 7, r_hip: 8, l_kn: 9, r_kn: 10, l_an: 11, r_an: 12, l_heel: 13, r_heel: 14, l_toe: 15, r_toe: 16 };

    function minJerk(p0, p1, s) { const t = Math.max(0, Math.min(1, s)); const f = 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5; return p0 + (p1 - p0) * f; }

    // Standing body model in unit-grid-ish normalised image space, placed so the feet sit at a floor point.
    // We only need plausible, visible landmarks above the feet. Heights scale with the frame.
    function bodyFrame(opts) {
        // opts: { tMs, feet:{L:{u,v},R:{u,v}}, grounded:{L,R}, hom, heightCm, trunkLeanDeg, noise, dropFar, visOverride }
        const img = new Float32Array(17 * 4), world = new Float32Array(17 * 3);
        const rnd = () => (opts.noise ? (Math.random() * 2 - 1) * opts.noise : 0);
        const footLenRel = CONFIG.geometry.footLengthRel;

        // body vertical extents in normalised image units (rough standing adult in this framing)
        const legFrac = 0.34, trunkFrac = 0.26, headFrac = 0.08;

        function setPt(key, nx, ny, vis) {
            const i = IDX[key];
            img[i * 4] = nx + rnd(); img[i * 4 + 1] = ny + rnd(); img[i * 4 + 2] = 0;
            img[i * 4 + 3] = vis == null ? 0.95 : vis;
        }

        for (const side of ['L', 'R']) {
            const f = opts.feet[side];
            // ankle/foot image point from floor homography
            const im = opts.hom.toImage(f.u, f.v);
            let ankleY = im.ny;
            // if airborne, lift the foot upward in the image (smaller y)
            if (!opts.grounded[side]) ankleY -= 0.03;
            const toeIm = opts.hom.toImage(f.u, f.v - footLenRel * 0.5);  // toe a little toward camera
            const heelIm = opts.hom.toImage(f.u, f.v + footLenRel * 0.5);
            let vis = 0.95;
            if (opts.dropFar && side === opts.dropFar) vis = 0.3;         // far foot occlusion case
            if (opts.visOverride && opts.visOverride[side] != null) vis = opts.visOverride[side];
            const sidePref = side.toLowerCase();
            setPt(sidePref + '_an', im.nx, ankleY, vis);
            setPt(sidePref + '_heel', heelIm.nx, ankleY + 0.004, vis);
            setPt(sidePref + '_toe', toeIm.nx, ankleY - 0.004, vis);
            setPt(sidePref + '_kn', im.nx, ankleY - legFrac * 0.5, Math.min(0.95, vis + 0.3));
            setPt(sidePref + '_hip', im.nx, ankleY - legFrac, 0.95);
        }
        // mid-hip -> shoulders -> nose, with optional lateral lean
        const mhx = (img[IDX.l_hip * 4] + img[IDX.r_hip * 4]) / 2, mhy = (img[IDX.l_hip * 4 + 1] + img[IDX.r_hip * 4 + 1]) / 2;
        const lean = (opts.trunkLeanDeg || 0) * Math.PI / 180;
        const shY = mhy - trunkFrac, shDX = Math.sin(lean) * trunkFrac;
        const shx = mhx + shDX;
        setPt('l_sh', shx - 0.05, shY, 0.95);
        setPt('r_sh', shx + 0.05, shY, 0.95);
        setPt('l_el', shx - 0.07, shY + 0.08, 0.9);
        setPt('r_el', shx + 0.07, shY + 0.08, 0.9);
        setPt('l_wr', shx - 0.08, shY + 0.15, 0.9);
        setPt('r_wr', shx + 0.08, shY + 0.15, 0.9);
        setPt('nose', shx, shY - headFrac, 0.95);
        return { tMs: opts.tMs, img, world: null };
    }

    /**
     * Generate a session from a script.
     * script: {
     *   fps, heightCm, armLengthCm (null => estimate), noise, trunkLeanDeg,
     *   startHoldS, stages:[{square, swingS, dwellS, foot? ('both'|'L'|'R' order), wrongSquare?, extra?, hesitationS?}],
     *   stopAfterStage (number|null), dropFar ('L'|'R'|null), occludeFrames, movedBeforeGo (bool),
     *   startSquare (default 1)
     * }
     * Returns { frames, t0Ms, W, H, armLengthCm (truth), grid:{handles} }
     */
    function generate(script) {
        const fps = script.fps || 30, dt = 1000 / fps;
        const hom = GEO.makeHomography(GEO.presetHandles(W, H), W, H);
        const frames = [];
        let tMs = 0;
        const noise = script.noise != null ? script.noise : 0.002;
        const startSq = script.startSquare || 1;
        const sgn = GEO.SQUARE_SIGNS[startSq];
        // foot stance centres: both feet near the centre of their square, slightly apart on u
        const centre = sq => { const g = GEO.SQUARE_SIGNS[sq]; return { u: g[0] * 0.5, v: g[1] * 0.5 }; };
        let pos = { L: { u: centre(startSq).u - 0.12, v: centre(startSq).v }, R: { u: centre(startSq).u + 0.12, v: centre(startSq).v } };
        const grounded = { L: true, R: true };

        const t0Ms = Math.round((script.preRollS != null ? script.preRollS : CONFIG.protocol.preRollS) * 1000);

        function emit(leanDeg, dropFar, visOverride) {
            frames.push(bodyFrame({ tMs, feet: { L: pos.L, R: pos.R }, grounded: { L: grounded.L, R: grounded.R }, hom, heightCm: script.heightCm, trunkLeanDeg: leanDeg || 0, noise, dropFar: dropFar || null, visOverride: visOverride || null }));
            tMs += dt;
        }

        // --- pre-roll + start hold (feet still in start square), GO at tMs == t0Ms
        const holdS = script.startHoldS != null ? script.startHoldS : 1.2;
        if (script.movedBeforeGo) {
            // Pre-roll: brief hold, then L steps into square 2 and back, all before GO (tMs < t0Ms).
            const seg = Math.round((holdS * fps) / 3);
            const sq2 = centre(2);
            const home = { u: centre(startSq).u - 0.12, v: centre(startSq).v };
            for (let i = 0; i < seg; i++) emit(0, script.dropFar);                       // still in square 1
            // quick step into square 2
            const nSw = Math.max(2, Math.round(0.2 * fps));
            grounded.L = false;
            for (let i = 1; i <= nSw; i++) { const s = i / nSw; pos.L = { u: minJerk(home.u, sq2.u, s), v: minJerk(home.v, sq2.v, s) }; emit(0, script.dropFar); }
            grounded.L = true; for (let i = 0; i < seg; i++) emit(0, script.dropFar);     // grounded in square 2 (episode with tOn<0)
            // step back home
            grounded.L = false;
            for (let i = 1; i <= nSw; i++) { const s = i / nSw; pos.L = { u: minJerk(sq2.u, home.u, s), v: minJerk(sq2.v, home.v, s) }; emit(0, script.dropFar); }
            grounded.L = true; pos.L = home;
            for (let i = 0; i < seg; i++) emit(0, script.dropFar);
        } else {
            const preAndHold = Math.round((holdS + (script.preRollS != null ? script.preRollS : CONFIG.protocol.preRollS)) * fps);
            for (let i = 0; i < preAndHold; i++) emit(0, script.dropFar);
        }

        // --- stages
        let prevSquare = startSq;
        const stages = script.stages || [];
        for (let si = 0; si < stages.length; si++) {
            const st = stages[si];
            if (script.stopAfterStage != null && si >= script.stopAfterStage) break;
            const targetSq = st.wrongSquare != null ? st.wrongSquare : st.square;
            const tc = centre(targetSq);
            const target = { L: { u: tc.u - 0.12, v: tc.v }, R: { u: tc.u + 0.12, v: tc.v } };
            const swingS = st.swingS != null ? st.swingS : 0.32;
            const order = st.order || ['L', 'R'];           // lead foot first
            const nSwing = Math.max(2, Math.round(swingS * fps));

            for (const foot of order) {
                const p0 = Object.assign({}, pos[foot]);
                grounded[foot] = false;
                for (let i = 1; i <= nSwing; i++) {
                    const s = i / nSwing;
                    pos[foot] = { u: minJerk(p0.u, target[foot].u, s), v: minJerk(p0.v, target[foot].v, s) };
                    // lift mid-swing
                    emit(st.leanDeg || script.trunkLeanDeg || 0, script.dropFar);
                }
                pos[foot] = target[foot]; grounded[foot] = true;
                // settle frames so the contact episode has duration
                const settle = Math.max(3, Math.round(0.12 * fps));
                for (let i = 0; i < settle; i++) emit(st.leanDeg || 0, script.dropFar);
            }

            // extra shuffle inside the square: a clear quick lift + re-land so a distinct episode forms
            if (st.extra) {
                const foot = st.extra === 'R' ? 'R' : 'L';
                const p0 = Object.assign({}, pos[foot]);
                const dest = { u: p0.u + GEO.SQUARE_SIGNS[targetSq][0] * 0.22, v: p0.v };   // stay inside the same square
                const nS = Math.max(2, Math.round(0.14 * fps));
                grounded[foot] = false;
                for (let i = 1; i <= nS; i++) { const s = i / nS; pos[foot] = { u: minJerk(p0.u, dest.u, s), v: minJerk(p0.v, dest.v, s) }; emit(0, script.dropFar); }
                pos[foot] = dest; grounded[foot] = true;
                for (let i = 0; i < Math.round(0.16 * fps); i++) emit(0, script.dropFar);
            }

            // dwell (both feet down) — used for hesitation case
            const dwellS = st.hesitationS != null ? st.hesitationS : (st.dwellS != null ? st.dwellS : 0.1);
            const nD = Math.max(1, Math.round(dwellS * fps));
            for (let i = 0; i < nD; i++) emit(st.leanDeg || 0, script.dropFar, st.visOverride);

            prevSquare = targetSq;
        }

        // tail
        for (let i = 0; i < Math.round((script.tailS != null ? script.tailS : CONFIG.protocol.tailS) * fps); i++) emit(0, script.dropFar);

        return { frames, t0Ms, W, H, armLengthCmTruth: script.armLengthCm, grid: { handles: GEO.presetHandles(W, H), userAdjusted: false, confirmed: script.gridConfirmed !== false } };
    }

    const api = { generate, bodyFrame, W, H, IDX };
    root.FSSTSynth = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
