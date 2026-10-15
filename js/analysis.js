/**
 * FSST//LAB — Offline analysis (pure functions, no DOM). The authoritative result.
 *
 * Pipeline (brief section 9): raw landmark frames -> per-marker gap handling & uniform
 * resampling (30 Hz) -> zero-lag Butterworth low-pass -> floor positions via homography ->
 * shank-normalised foot speed -> contact episodes (hysteresis) -> square membership ->
 * 8-stage state machine -> timing / spatial / trunk metrics + QC + fall-risk classification.
 *
 * Reuses the STS signal-processing primitives filtfilt / biquadLP / resampleOnGrid verbatim.
 * Works in the browser (window.FSSTAnalysis) and Node (module.exports) for unit testing.
 */
(function (root) {
    'use strict';

    const G = (typeof require === 'function' && typeof module !== 'undefined') ? require('./geometry.js') : root.FSSTGeometry;

    // Order of the tracked landmark array (matches CONFIG.tracked indices 0..16).
    const IDX = {
        nose: 0, l_sh: 1, r_sh: 2, l_el: 3, r_el: 4, l_wr: 5, r_wr: 6,
        l_hip: 7, r_hip: 8, l_kn: 9, r_kn: 10, l_an: 11, r_an: 12,
        l_heel: 13, r_heel: 14, l_toe: 15, r_toe: 16
    };
    const FOOT = {
        L: { an: IDX.l_an, heel: IDX.l_heel, toe: IDX.l_toe, kn: IDX.l_kn },
        R: { an: IDX.r_an, heel: IDX.r_heel, toe: IDX.r_toe, kn: IDX.r_kn }
    };
    const NL = 17;
    const DEG = 180 / Math.PI;

    // ---------------------------------------------------------------- small helpers
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
    const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); };
    const median = a => { if (!a.length) return NaN; const b = Array.from(a).sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
    const fin = a => Array.from(a).filter(Number.isFinite);
    const rnd = (x, d) => (x === null || x === undefined || !Number.isFinite(x)) ? null : Math.round(x * Math.pow(10, d)) / Math.pow(10, d);

    // ---------------------------------------------------------------- signal processing (verbatim from STS)
    function resampleOnGrid(ts, vs, ok, grid, maxGap) {
        const T = [], V = [];
        for (let i = 0; i < ts.length; i++) if (ok[i] && Number.isFinite(vs[i])) { T.push(ts[i]); V.push(vs[i]); }
        const n = T.length, y = new Float64Array(grid.length), gap = new Uint8Array(grid.length);
        if (n === 0) { y.fill(NaN); gap.fill(1); return { y, gap }; }
        let j = 0;
        for (let k = 0; k < grid.length; k++) {
            const g = grid[k];
            if (g <= T[0]) { y[k] = V[0]; gap[k] = (T[0] - g > maxGap) ? 1 : 0; }
            else if (g >= T[n - 1]) { y[k] = V[n - 1]; gap[k] = (g - T[n - 1] > maxGap) ? 1 : 0; }
            else {
                while (j < n - 2 && T[j + 1] <= g) j++;
                const t0 = T[j], t1 = T[j + 1], a = (g - t0) / (t1 - t0);
                y[k] = V[j] + a * (V[j + 1] - V[j]);
                gap[k] = (t1 - t0 > maxGap) ? 1 : 0;
            }
        }
        return { y, gap };
    }
    function biquadLP(fs, fc) {
        const K = Math.tan(Math.PI * fc / fs), s2 = Math.SQRT2, norm = 1 / (1 + s2 * K + K * K);
        return { b0: K * K * norm, b1: 2 * K * K * norm, b2: K * K * norm, a1: 2 * (K * K - 1) * norm, a2: (1 - s2 * K + K * K) * norm };
    }
    function runBiquad(x, c) {
        const y = new Float64Array(x.length);
        let x1 = x[0], x2 = x[0], y1 = x[0], y2 = x[0];
        for (let i = 0; i < x.length; i++) { const yi = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = yi; y[i] = yi; }
        return y;
    }
    function filtfilt(x, fs, fc, padN) {
        const n = x.length;
        if (n < 12) return Float64Array.from(x);
        const fd = Math.min(fc / 0.802, 0.45 * fs);
        const c = biquadLP(fs, fd);
        const pad = Math.min(n - 1, padN || 30);
        const ext = new Float64Array(n + 2 * pad);
        for (let i = 0; i < pad; i++) { ext[i] = 2 * x[0] - x[pad - i]; ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i]; }
        for (let i = 0; i < n; i++) ext[pad + i] = x[i];
        const f = runBiquad(ext, c); f.reverse();
        const b = runBiquad(f, c); b.reverse();
        return b.slice(pad, pad + n);
    }
    function deriv(y, dt) {
        const n = y.length, d = new Float64Array(n);
        for (let i = 0; i < n; i++) { const lo = Math.max(0, i - 1), hi = Math.min(n - 1, i + 1); d[i] = (y[hi] - y[lo]) / ((hi - lo) * dt); }
        return d;
    }

    const okPt = (v, x, y, minVis) => v >= minVis && x > -0.02 && x < 1.02 && y > -0.02 && y < 1.02;

    // ---------------------------------------------------------------- fall-risk classification
    function classify(timeS, status, participant, cfg) {
        const popKey = participant.population || 'other_none';
        const def = cfg.protocol.riskCutoffs[popKey] || cfg.protocol.riskCutoffs.other_none;
        const out = { tier: 'NOT_CLASSIFIED', note: '', population: popKey, cutoffS: def.cutoffS, rule: def.rule, source: def.source };
        if (status !== 'COMPLETED' || !Number.isFinite(timeS)) { out.note = 'INVALID_TRIAL'; return out; }
        if (def.rule === 'none' || def.cutoffS == null) { out.note = 'NO_VALIDATED_CUTOFF'; return out; }
        if (def.minAge && Number.isFinite(participant.age) && participant.age < def.minAge) { out.note = 'AGE_BELOW_COHORT'; return out; }
        const elevated = timeS > def.cutoffS;   // strict greater-than [CLINICAL]
        out.tier = elevated ? 'ELEVATED' : 'LOWER';
        return out;
    }

    // ---------------------------------------------------------------- main analysis
    /**
     * args: { recording:{W,H,t0Ms,attempted,frames:[{tMs,img,world}]},
     *         grid:{handles,userAdjusted,confirmed}, participant, meta, cfg, schema,
     *         trial:{slot, attemptInSlot, attemptGroupId, repeatReason},
     *         operator:{valid,balanceLost,supportUsed,notFacingForward,lineOrCaneContact} }
     */
    function analyzeSession(args) {
        const { recording: rec, grid, participant: pt, meta, cfg, schema } = args;
        const trial = args.trial || {}, operator = args.operator || {};
        const fs = cfg.signal.resampleHz;
        const fr = rec.frames, W = rec.W, H = rec.H;
        if (!fr || fr.length < 15) return { error: 'Too few pose frames recorded (' + (fr ? fr.length : 0) + '). Check lighting and framing.' };

        // documented summary object
        const sum = {};
        for (const f of schema.sessions) sum[f.key] = null;
        const put = (k, v) => { if (!(k in sum)) throw new Error('Undocumented summary field: ' + k); sum[k] = v; };

        const minVis = cfg.signal.minVisibility, maxGap = cfg.signal.maxGapS;
        const ts = fr.map(f => (f.tMs - rec.t0Ms) / 1000);
        const tStart = Math.max(ts[0], -cfg.protocol.preRollS), tEnd = ts[ts.length - 1];
        const n = Math.max(2, Math.floor((tEnd - tStart) * fs) + 1);
        const gridT = new Float64Array(n);
        for (let k = 0; k < n; k++) gridT[k] = tStart + k / fs;
        const dt = 1 / fs;

        // --- resample & filter every marker in normalised image coords
        const NX = [], NY = [], NV = [], rawOk = [];
        for (let li = 0; li < NL; li++) {
            const x = new Float64Array(fr.length), y = new Float64Array(fr.length), v = new Float64Array(fr.length), o = new Uint8Array(fr.length);
            for (let i = 0; i < fr.length; i++) {
                const q = li * 4, nx = fr[i].img[q], ny = fr[i].img[q + 1];
                x[i] = nx; y[i] = ny; v[i] = fr[i].img[q + 3];
                o[i] = okPt(v[i], nx, ny, minVis) ? 1 : 0;
            }
            rawOk.push(o);
            const feetCut = cfg.signal.cutoffFeetHz, trunkCut = cfg.signal.cutoffTrunkHz;
            const cut = (li === IDX.l_sh || li === IDX.r_sh || li === IDX.l_hip || li === IDX.r_hip || li === IDX.nose) ? trunkCut : feetCut;
            const rx = resampleOnGrid(ts, x, o, gridT, maxGap), ry = resampleOnGrid(ts, y, o, gridT, maxGap), rv = resampleOnGrid(ts, v, new Uint8Array(fr.length).fill(1), gridT, maxGap);
            const hasData = Number.isFinite(rx.y[0]);
            NX.push(hasData ? filtfilt(rx.y, fs, cut, cfg.signal.padSamples) : rx.y);
            NY.push(hasData ? filtfilt(ry.y, fs, cut, cfg.signal.padSamples) : ry.y);
            NV.push(rv.y);
        }

        // --- homography (image normalised -> floor units)
        const hom = G.makeHomography(grid.handles, W, H);

        // --- per-foot: foot point (mean heel/toe, image px), floor (u,v), shank length px, speed (shank/s)
        const foot = {};
        const shankWin = Math.max(1, Math.round(cfg.contacts.shankWindowS * fs));
        for (const side of ['L', 'R']) {
            const F = FOOT[side];
            const u = new Float64Array(n), v = new Float64Array(n), vis = new Float64Array(n), gap = new Uint8Array(n), shankPx = new Float64Array(n);
            for (let k = 0; k < n; k++) {
                const hv = NV[F.heel][k], tv = NV[F.toe][k];
                let fx, fy;
                if (hv >= minVis && tv >= minVis) { fx = (NX[F.heel][k] + NX[F.toe][k]) / 2; fy = (NY[F.heel][k] + NY[F.toe][k]) / 2; }
                else if (hv >= minVis) { fx = NX[F.heel][k]; fy = NY[F.heel][k]; }
                else if (tv >= minVis) { fx = NX[F.toe][k]; fy = NY[F.toe][k]; }
                else { fx = NX[F.an][k]; fy = NY[F.an][k]; gap[k] = 1; }
                vis[k] = Math.max(hv, tv, NV[F.an][k]);
                const fl = hom.ok ? hom.toFloor(fx, fy) : { u: NaN, v: NaN };
                u[k] = fl.u; v[k] = fl.v;
                // shank length in px (knee-ankle), aspect-corrected to pixels
                const kx = NX[F.kn][k] * W, ky = NY[F.kn][k] * H, ax = NX[F.an][k] * W, ay = NY[F.an][k] * H;
                shankPx[k] = Math.hypot(kx - ax, ky - ay);
            }
            // median-smooth shank over the window
            const shankMed = new Float64Array(n);
            for (let k = 0; k < n; k++) {
                const lo = Math.max(0, k - (shankWin >> 1)), hi = Math.min(n - 1, k + (shankWin >> 1));
                shankMed[k] = median(fin(Array.prototype.slice.call(shankPx, lo, hi + 1)));
            }
            // foot point speed in px/s then normalise by shank -> shank/s
            const fxPx = new Float64Array(n), fyPx = new Float64Array(n);
            for (let k = 0; k < n; k++) { fxPx[k] = (NX[F.heel][k] + NX[F.toe][k]) / 2 * W; fyPx[k] = (NY[F.heel][k] + NY[F.toe][k]) / 2 * H; }
            const vx = deriv(fxPx, dt), vy = deriv(fyPx, dt);
            const speed = new Float64Array(n);
            for (let k = 0; k < n; k++) { const sp = Math.hypot(vx[k], vy[k]); speed[k] = (shankMed[k] > 1) ? sp / shankMed[k] : NaN; }
            foot[side] = { u, v, vis, gap, shankPx: shankMed, speed };
        }

        // --- contact episodes per foot (hysteresis state machine, brief 9.2)
        const C = cfg.contacts;
        function detectContacts(side) {
            const f = foot[side], eps = [];
            let state = 'SWING', tOn = null, iOn = 0;
            for (let k = 0; k < n; k++) {
                const sp = f.speed[k], visible = f.vis[k] >= minVis;
                if (state === 'SWING') {
                    if (Number.isFinite(sp) && sp < C.vOnShankS && visible) { state = 'GROUNDED'; tOn = gridT[k]; iOn = k; }
                } else {
                    if (!Number.isFinite(sp) || sp > C.vOffShankS) { closeEp(iOn, k - 1); state = 'SWING'; }
                }
            }
            if (state === 'GROUNDED') closeEp(iOn, n - 1);
            function closeEp(i0, i1) {
                if (i1 < i0) return;
                const us = [], vs = [], viss = [];
                for (let k = i0; k <= i1; k++) { if (Number.isFinite(f.u[k])) { us.push(f.u[k]); vs.push(f.v[k]); } viss.push(f.vis[k]); }
                eps.push({ foot: side, tOn: gridT[i0] + C.onsetBiasS, tOff: gridT[i1], u: median(us), v: median(vs), vis: mean(viss), i0, i1 });
            }
            // merge gaps
            const merged = [];
            for (const e of eps) {
                const last = merged[merged.length - 1];
                if (last && e.tOn - last.tOff < C.mergeGapS) { last.tOff = e.tOff; last.i1 = e.i1; last.u = (last.u + e.u) / 2; last.v = (last.v + e.v) / 2; }
                else merged.push(Object.assign({}, e));
            }
            // drop short, finalise fields
            return merged.filter(e => (e.tOff - e.tOn) >= C.minContactS).map(e => {
                e.square = G.squareOf(e.u, e.v, cfg);
                e.onLine = G.onLine(e.u, e.v, cfg);
                return e;
            });
        }
        const epsL = detectContacts('L'), epsR = detectContacts('R');
        const episodes = epsL.concat(epsR).sort((a, b) => a.tOn - b.tOn);

        // --- start condition: both feet grounded in square 1 at/just after GO
        const flags = [];
        const SEQ = cfg.protocol.sequence;
        const startEps = { L: null, R: null };
        for (const e of episodes) {
            if (e.tOn <= 0.25 && G.matchesSquare(e.u, e.v, 1, cfg)) { if (!startEps[e.foot]) startEps[e.foot] = e; }
        }
        if (!startEps.L || !startEps.R) flags.push('NOT_IN_START_SQUARE');

        // MOVED_BEFORE_GO: a foot left square 1 before GO (any episode in another square starting < 0)
        for (const e of episodes) { if (e.tOn < -0.05 && e.square !== 1 && e.square !== 0) { flags.push('MOVED_BEFORE_GO'); break; } }

        // --- 8-stage state machine (brief 9.4)
        const startTon = Math.max(startEps.L ? startEps.L.tOn : 0, startEps.R ? startEps.R.tOn : 0, 0);
        // LENIENT stage machine (see config.qc.blocking comment). We advance greedily toward the
        // expected square; a contact in the wrong square is RECORDED as a sequence error but does
        // NOT stall progress or block the time. A stage completes when BOTH feet have reached the
        // expected square; if the participant skips the trail-foot touch we still move on once the
        // next expected square is reached. The goal: always capture the time when they return to 1.
        let k = 1, stageFoot = { L: null, R: null }, extra = 0, errors = 0;
        const stageRecs = [];
        const postStart = episodes.filter(e => e.tOn >= startTon - 1e-6);
        for (const e of postStart) {
            if (k > 8) { e.stage = 8; e.isExtra = true; e.isError = false; continue; }
            const target = SEQ[k - 1], prev = (k === 1) ? 1 : SEQ[k - 2];
            if (G.matchesSquare(e.u, e.v, target, cfg)) {
                e.stage = k; e.isError = false;
                if (!stageFoot[e.foot]) { stageFoot[e.foot] = e; e.isExtra = false; }
                else { extra++; e.isExtra = true; }
                if (stageFoot.L && stageFoot.R) {
                    const first = stageFoot.L.tOn <= stageFoot.R.tOn ? stageFoot.L : stageFoot.R;
                    const second = first === stageFoot.L ? stageFoot.R : stageFoot.L;
                    stageRecs.push({ stage: k, target, lead: first.foot, first, second });
                    k++; stageFoot = { L: null, R: null };
                }
            } else if (G.matchesSquare(e.u, e.v, prev, cfg)) {
                e.stage = k - 1;
                if (!stageFoot[e.foot]) { extra++; e.isExtra = true; e.isError = false; }
                else { extra++; e.isExtra = true; e.isError = false; }   // repositioning, not an error
            } else {
                // wrong square: record the violation but keep going (do NOT stall the sequence).
                errors++; e.stage = k; e.isExtra = false; e.isError = true;
            }
        }
        // Lenient completion of the final return: if we reached stage 8's target region but only one
        // foot was detected there, still close the stage using the single foot so t_stop is captured.
        if (k === 8 && (stageFoot.L || stageFoot.R)) {
            const only = stageFoot.L || stageFoot.R;
            stageRecs.push({ stage: 8, target: SEQ[7], lead: only.foot, first: only, second: only });
            k = 9;
        }
        const stagesCompleted = Math.min(8, stageRecs.length);

        // --- timing (brief 9.5), with robust lenient fallbacks
        const stage1 = stageRecs.find(s => s.stage === 1);
        const stage4 = stageRecs.find(s => s.stage === 4);
        const stage8 = stageRecs.find(s => s.stage === 8);
        // t_start: first contact in square 2 after GO (even if ordering was imperfect).
        let tStartTime = stage1 ? stage1.first.tOn : null;
        if (tStartTime == null) {
            const firstSq2 = postStart.filter(e => e.square === 2).sort((a, b) => a.tOn - b.tOn)[0];
            if (firstSq2) tStartTime = firstSq2.tOn;
        }
        // t_stop: last-foot return to square 1 after the lap. Prefer the formal stage 8; else the
        // last contact in square 1 that occurs after the participant has left square 1 (the return).
        let tStopTime = stage8 ? stage8.second.tOn : null;
        if (tStopTime == null && tStartTime != null) {
            // Stage-independent FINAL-return detection (robust to wrong steps). Build the ordered list
            // of in-square contacts after t_start, find the LAST contiguous run of square-1 contacts
            // (the final return), and require that the participant genuinely went AWAY first (visited
            // squares 3 and/or 4 — the far side of the cross — between t_start and that return).
            const seqC = postStart.filter(e => e.square >= 1 && e.square <= 4 && e.tOn >= tStartTime).sort((a, b) => a.tOn - b.tOn);
            // index where the final square-1 run begins
            let i = seqC.length - 1;
            while (i >= 0 && seqC[i].square === 1) i--;
            const finalRunStart = i + 1;   // seqC[finalRunStart..] are all square 1
            if (finalRunStart < seqC.length) {
                const wentAway = seqC.slice(0, finalRunStart).some(e => e.square === 3 || e.square === 4);
                if (wentAway) {
                    // both feet back in square 1: take the later of the two feet's first contact in the run
                    const run = seqC.slice(finalRunStart);
                    const byFoot = { L: null, R: null };
                    for (const e of run) { if (byFoot[e.foot] == null) byFoot[e.foot] = e.tOn; }
                    if (byFoot.L != null && byFoot.R != null) tStopTime = Math.max(byFoot.L, byFoot.R);
                    else tStopTime = run[0].tOn;   // single foot fallback
                }
            }
        }
        // Manual stop / timeout: the operator always gets a time. Prefer a square-1 return; else use
        // the moment the operator stopped (last frame), so the elapsed time is always recorded.
        if (tStopTime == null && (meta.manualStop || meta.timeout) && tStartTime != null) {
            const lastSq1 = postStart.filter(e => e.square === 1 && e.tOn > tStartTime).sort((a, b) => a.tOn - b.tOn).pop();
            tStopTime = lastSq1 ? lastSq1.tOn : (tEnd > tStartTime ? tEnd : null);
        }
        const timeToComplete = (tStartTime != null && tStopTime != null && tStopTime > tStartTime) ? tStopTime - tStartTime : null;

        // stage durations D_k: first[k+1]-first[k]; D_8 = tStop - first[8]
        const stageFirst = {}; for (const s of stageRecs) stageFirst[s.stage] = s.first.tOn;
        const D = [];
        for (let s = 1; s <= 8; s++) {
            if (stageFirst[s] == null) continue;
            if (s < 8 && stageFirst[s + 1] != null) D.push(stageFirst[s + 1] - stageFirst[s]);
            else if (s === 8 && tStopTime != null) D.push(tStopTime - stageFirst[8]);
        }
        const avgStep = D.length ? mean(D) : NaN;
        const sdStep = D.length > 1 ? sd(D) : NaN;
        const cvStep = (Number.isFinite(sdStep) && avgStep) ? 100 * sdStep / avgStep : NaN;

        const cwTime = (stage4 && tStartTime != null) ? stage4.second.tOn - tStartTime : NaN;
        const acwTime = (stage4 && tStopTime != null) ? tStopTime - stage4.second.tOn : NaN;
        const phaseRatio = (Number.isFinite(cwTime) && cwTime > 0 && Number.isFinite(acwTime)) ? acwTime / cwTime : NaN;
        const interlimb = stageRecs.length ? mean(stageRecs.map(s => s.second.tOn - s.first.tOn)) : NaN;

        // double support ratio + hesitation within [tStart,tStop]
        let dsRatio = NaN, hesitationCount = 0;
        const hesStageFlag = {};
        if (tStartTime != null && tStopTime != null && tStopTime > tStartTime) {
            const grounded = side => { const f = foot[side], g = new Uint8Array(n); for (const e of episodes.filter(x => x.foot === side)) for (let i = e.i0; i <= e.i1; i++) g[i] = 1; return g; };
            const gL = grounded('L'), gR = grounded('R');
            let both = 0, win = 0, runStart = null;
            for (let i = 0; i < n; i++) {
                if (gridT[i] < tStartTime || gridT[i] > tStopTime) { runStart = null; continue; }
                win++;
                if (gL[i] && gR[i]) { both++; if (runStart == null) runStart = gridT[i]; }
                else { if (runStart != null && gridT[i] - runStart > cfg.protocol.hesitationS) { hesitationCount++; const st = stageAt(gridT[i]); if (st) hesStageFlag[st] = true; } runStart = null; }
            }
            if (runStart != null && tStopTime - runStart > cfg.protocol.hesitationS) hesitationCount++;
            dsRatio = win ? 100 * both / win : NaN;
        }
        function stageAt(t) { for (const s of stageRecs) if (t >= s.first.tOn && (stageFirst[s.stage + 1] == null || t < stageFirst[s.stage + 1])) return s.stage; return null; }

        // --- scale (brief 7.3)
        const scale = computeScale(pt, foot, episodes, hom, startTon, cfg);
        const armLenCm = scale.armLengthCm, armSrc = scale.source;
        if (armSrc === 'BODY_ESTIMATED') flags.push('SCALE_ESTIMATED');
        if (armSrc === 'NONE') flags.push('SCALE_UNAVAILABLE');
        const toM = relArm => (armLenCm != null && Number.isFinite(relArm)) ? relArm * armLenCm / 100 : null;

        // --- spatial metrics (relative to arm length)
        const spatial = computeSpatial(stageRecs, episodes, startEps, cfg);
        const stepLenMeanRel = spatial.allLens.length ? mean(spatial.allLens) : NaN;
        const stepLenLRel = spatial.leftLens.length ? mean(spatial.leftLens) : NaN;
        const stepLenRRel = spatial.rightLens.length ? mean(spatial.rightLens) : NaN;
        const symIndex = (Number.isFinite(stepLenLRel) && Number.isFinite(stepLenRRel) && (stepLenLRel + stepLenRRel) > 0)
            ? 100 * Math.abs(stepLenLRel - stepLenRRel) / (0.5 * (stepLenLRel + stepLenRRel)) : NaN;
        const stepWidthRel = spatial.widths.length ? mean(spatial.widths) : NaN;

        const lineTouchEps = episodes.filter(e => e.onLine && e.square !== 0 && e.tOn >= startTon - 1e-6);
        const lineTouchCount = lineTouchEps.length;
        if (lineTouchEps.some(e => e.vis < 0.5)) flags.push('LINE_TOUCH_LOW_CONFIDENCE');

        // --- trunk (brief 9.7)
        const trunk = computeTrunk(NX, NY, gridT, n, tStartTime, tStopTime, cfg);
        let nearFall = false;
        if (Number.isFinite(trunk.peakDev) && trunk.peakDev > cfg.trunk.nearFallDevDeg) {
            const evTimes = episodes.filter(e => e.isExtra || e.isError).map(e => e.tOn);
            if (evTimes.some(t => Math.abs(t - trunk.peakTime) <= cfg.trunk.nearFallWindowS)) nearFall = true;
            flags.push('HIGH_TRUNK_DEVIATION');
        }

        // --- QC (brief 9.8)
        const dur = (tEnd - Math.max(0, ts[0]));
        const inWin = []; for (let i = 0; i < fr.length; i++) if (ts[i] >= 0) inWin.push(i);
        const chainIdx = [IDX.l_hip, IDX.r_hip, IDX.l_kn, IDX.r_kn, IDX.l_an, IDX.r_an, IDX.l_heel, IDX.r_heel, IDX.l_toe, IDX.r_toe];
        let validN = 0, lastOk = 0, longest = 0;
        for (const i of inWin) {
            const all = chainIdx.every(li => rawOk[li][i]);
            if (all) { longest = Math.max(longest, ts[i] - lastOk); lastOk = ts[i]; validN++; }
        }
        longest = Math.max(longest, (tEnd) - lastOk);
        const attempted = Math.max(rec.attempted || inWin.length, inWin.length);
        const effFs = dur > 0 ? attempted / dur : NaN;
        const validPct = attempted ? 100 * validN / attempted : NaN;
        // imputed samples (gap) over running window
        let imp = 0, gi1 = n;
        for (let kk = 0; kk < n; kk++) if (gridT[kk] >= 0) { if (foot.L.gap[kk] || foot.R.gap[kk]) imp++; }
        const runCount = gridT.filter(t => t >= 0).length;
        const impPct = runCount ? 100 * imp / runCount : NaN;
        // foot occlusion
        const occ = side => { let bad = 0, tot = 0; for (let kk = 0; kk < n; kk++) if (gridT[kk] >= 0) { tot++; if (foot[side].vis[kk] < 0.5) bad++; } return tot ? 100 * bad / tot : 0; };
        const occL = occ('L'), occR = occ('R');
        const medVis = median(fin([mean(fin(Array.from(foot.L.vis))), mean(fin(Array.from(foot.R.vis)))]));

        if (effFs < cfg.qc.minEffectiveFps) flags.push('LOW_FPS');
        if (validPct < cfg.qc.minValidFramePct) flags.push('LOW_VALID_FRAMES');
        if (impPct > cfg.qc.maxImputedPct || longest > cfg.qc.maxLongestGapS) flags.push('TRACKING_GAPS');
        if (occL > cfg.qc.maxFootOcclusionPct || occR > cfg.qc.maxFootOcclusionPct) flags.push('FOOT_OCCLUSION');
        if (errors > 0) flags.push('SEQUENCE_ERROR');
        if (stagesCompleted < 8) flags.push('INCOMPLETE_SEQUENCE');
        if (meta.manualStop) flags.push('MANUAL_STOP');
        if (meta.timeout) flags.push('TIMEOUT');
        if (!grid.confirmed) flags.push('GRID_NOT_CONFIRMED');
        if (grid.userAdjusted) flags.push('GRID_USER_ADJUSTED');
        flags.push('PROTOCOL_ADAPTATION_TAPE');   // always (tape cross instead of canes)
        if (trial.slot === 'PRACTICE') flags.push('PRACTICE_TRIAL');
        // partial body
        {
            let partial = false;
            for (let i = 0; i < fr.length; i++) { if (ts[i] < 0) continue; const nvis = fr[i].img[IDX.nose * 4 + 3], tvis = Math.min(fr[i].img[IDX.l_toe * 4 + 3], fr[i].img[IDX.r_toe * 4 + 3]); if (nvis < minVis || tvis < minVis) { partial = true; break; } }
            if (partial) flags.push('PARTIAL_BODY_IN_FRAME');
        }

        // NO_TIME_CAPTURED is the only sequence-related blocking flag: it fires only when we could
        // not derive a start+stop time at all (so there is genuinely nothing to report).
        const haveTime = Number.isFinite(timeToComplete);
        if (!haveTime && !meta.cannotDo && !meta.aborted) flags.push('NO_TIME_CAPTURED');

        const qcPass = !flags.some(f => cfg.qc.blocking.includes(f));

        // --- status (lenient): a captured time + return to square 1 => COMPLETED, even with errors.
        let status;
        if (meta.cannotDo) status = 'CANNOT_DO';
        else if (meta.aborted) status = 'ABORTED';
        else if (validPct < 50 || !hom.ok) status = 'TRACKING_FAILED';
        else if (haveTime) status = 'COMPLETED';          // time recorded; violations are metrics, not blockers
        else status = 'INCOMPLETE';                        // never reached square 1 / no usable time

        const risk = classify(timeToComplete, status, pt, cfg);

        // operator validity. A trial COUNTS toward BEST when a time was captured, QC passed, and the
        // operator did not mark it invalid. Sequence errors / line touches alone do NOT invalidate.
        const opInvalid = operator.balanceLost || operator.supportUsed || operator.notFacingForward || (operator.valid === false);
        const validTrial = status === 'COMPLETED' && qcPass && !opInvalid;

        // --- build stages table rows
        const stageRows = stageRecs.map(s => {
            const nextFirst = stageFirst[s.stage + 1];
            const liftoff = (s.stage < 8 && nextFirst != null) ? s.first.tOff : null;
            const dwell = (nextFirst != null) ? nextFirst - s.second.tOn : (tStopTime != null && s.stage === 8 ? 0 : null);
            const dur_ = (s.stage < 8 && nextFirst != null) ? nextFirst - s.first.tOn : (s.stage === 8 && tStopTime != null ? tStopTime - s.first.tOn : null);
            const lead = s.first, trail = s.second;
            return {
                session_id: meta.sessionId, stage: s.stage, target_square: s.target, lead_foot: s.lead,
                t_first_contact_s: rnd(s.first.tOn, 3), t_second_contact_s: rnd(s.second.tOn, 3),
                t_liftoff_s: rnd(liftoff, 3), stage_duration_s: rnd(dur_, 3),
                dwell_s: rnd(dwell, 3), interlimb_lag_s: rnd(s.second.tOn - s.first.tOn, 3),
                lead_u: rnd(lead.u, 3), lead_v: rnd(lead.v, 3), trail_u: rnd(trail.u, 3), trail_v: rnd(trail.v, 3),
                step_length_lead_rel: rnd(spatial.stageLead[s.stage], 3), step_length_trail_rel: rnd(spatial.stageTrail[s.stage], 3),
                step_width_rel: rnd(Math.hypot(lead.u - trail.u, lead.v - trail.v), 3),
                line_touch: !!(lead.onLine || trail.onLine), sequence_error: false, hesitation: !!hesStageFlag[s.stage]
            };
        });

        // --- contacts table rows
        const contactRows = episodes.map((e, i) => ({
            session_id: meta.sessionId, contact_index: i + 1, foot: e.foot, stage: e.stage == null ? 0 : e.stage, square: e.square,
            t_on_s: rnd(e.tOn, 3), t_off_s: rnd(e.tOff, 3), duration_s: rnd(e.tOff - e.tOn, 3),
            u: rnd(e.u, 3), v: rnd(e.v, 3), on_line: !!e.onLine, is_extra: !!e.isExtra, is_error: !!e.isError, mean_visibility: rnd(e.vis, 3)
        }));

        // --- analysed frames rows
        const frameRows = [];
        for (let kk = 0; kk < n; kk++) {
            const t = gridT[kk];
            frameRows.push({
                session_id: meta.sessionId, t_s: rnd(t, 3), phase: t < 0 ? 'PREROLL' : (tStopTime != null && t > tStopTime ? 'DONE' : 'RUNNING'),
                tracking_gap: (foot.L.gap[kk] || foot.R.gap[kk]) ? 1 : 0,
                l_u: rnd(foot.L.u[kk], 3), l_v: rnd(foot.L.v[kk], 3), l_speed_shank_s: rnd(foot.L.speed[kk], 3), l_grounded: groundedAt('L', kk) ? 1 : 0,
                r_u: rnd(foot.R.u[kk], 3), r_v: rnd(foot.R.v[kk], 3), r_speed_shank_s: rnd(foot.R.speed[kk], 3), r_grounded: groundedAt('R', kk) ? 1 : 0,
                trunk_dev_deg: rnd(trunk.dev[kk], 2), trunk_angvel_deg_s: rnd(trunk.angvel[kk], 2)
            });
        }
        function groundedAt(side, idx) { for (const e of episodes) if (e.foot === side && idx >= e.i0 && idx <= e.i1) return true; return false; }

        // --- fill summary
        put('session_id', meta.sessionId); put('attempt_group_id', trial.attemptGroupId || meta.sessionId);
        put('trial_slot', trial.slot || 'PRACTICE'); put('attempt_in_slot', trial.attemptInSlot || 1);
        put('is_practice', (trial.slot || 'PRACTICE') === 'PRACTICE'); put('repeat_reason', trial.repeatReason || '');
        put('timestamp_utc', meta.timestampUtc); put('utc_offset_min', meta.utcOffsetMin);
        put('app_version', cfg.app.version); put('analysis_version', cfg.app.analysisVersion); put('schema_version', cfg.app.schemaVersion);
        put('participant_id', pt.id); put('age_years', pt.age); put('sex', pt.sex); put('height_cm', pt.heightCm);
        put('body_mass_kg', Number.isFinite(pt.massKg) ? pt.massKg : null); put('population', pt.population);
        put('assistive_device', pt.assistiveDevice); put('surface', pt.surface); put('site', pt.site || ''); put('operator_notes', pt.notes || '');
        put('pose_model', meta.poseModel); put('pose_delegate', meta.delegate); put('camera_facing', meta.cameraFacing);
        put('video_width_px', W); put('video_height_px', H); put('user_agent', (meta.userAgent || '').slice(0, 200));
        put('instruction_language', meta.language || ''); put('video_opened', !!meta.videoOpened);
        put('safety_confirmed', !!meta.safetyConfirmed); put('setup_confirmed', !!meta.setupConfirmed); put('consent_upload', !!meta.consentUpload);
        put('headline_basis', cfg.protocol.headlineBasis);
        put('planned_max_duration_s', cfg.protocol.maxTrialS); put('test_duration_s', rnd(meta.elapsedS, 2)); put('manual_stop', !!meta.manualStop);
        put('filter_cutoff_feet_hz', cfg.signal.cutoffFeetHz); put('filter_cutoff_trunk_hz', cfg.signal.cutoffTrunkHz); put('resample_hz', fs);
        put('arm_length_cm', armLenCm != null ? rnd(armLenCm, 1) : null); put('arm_length_source', armSrc);
        put('grid_user_adjusted', !!grid.userAdjusted);
        put('grid_t_x', rnd(grid.handles.T.x, 4)); put('grid_t_y', rnd(grid.handles.T.y, 4));
        put('grid_r_x', rnd(grid.handles.R.x, 4)); put('grid_r_y', rnd(grid.handles.R.y, 4));
        put('grid_b_x', rnd(grid.handles.B.x, 4)); put('grid_b_y', rnd(grid.handles.B.y, 4));
        put('grid_l_x', rnd(grid.handles.L.x, 4)); put('grid_l_y', rnd(grid.handles.L.y, 4));
        put('test_status', status); put('failure_reason', meta.failureReason || (status === 'COMPLETED' ? '' : status));
        put('current_stage', Math.min(8, k)); put('stage_progress', stagesCompleted + '/8'); put('stages_completed', stagesCompleted);
        put('time_to_complete_s', rnd(timeToComplete, 3));
        put('live_time_s', Number.isFinite(meta.liveTime) ? rnd(meta.liveTime, 3) : null);
        put('time_difference_s', (Number.isFinite(timeToComplete) && Number.isFinite(meta.liveTime)) ? rnd(timeToComplete - meta.liveTime, 3) : null);
        put('t_start_s', rnd(tStartTime, 3)); put('t_stop_s', rnd(tStopTime, 3));
        put('clockwise_time_s', rnd(cwTime, 3)); put('anticlockwise_time_s', rnd(acwTime, 3)); put('phase_time_ratio', rnd(phaseRatio, 3));
        put('fall_risk_tier', risk.tier); put('risk_note', risk.note); put('risk_population', risk.population);
        put('risk_cutoff_s', risk.cutoffS); put('risk_rule', risk.rule); put('risk_cutoff_source', risk.source);
        put('avg_step_duration_s', rnd(avgStep, 3)); put('step_variability_s', rnd(sdStep, 3)); put('step_duration_cv_pct', rnd(cvStep, 2));
        put('step_length_mean_m', toM(stepLenMeanRel) != null ? rnd(toM(stepLenMeanRel), 3) : null);
        put('step_length_left_m', toM(stepLenLRel) != null ? rnd(toM(stepLenLRel), 3) : null);
        put('step_length_right_m', toM(stepLenRRel) != null ? rnd(toM(stepLenRRel), 3) : null);
        put('step_symmetry_index_pct', rnd(symIndex, 2));
        put('step_width_mean_m', toM(stepWidthRel) != null ? rnd(toM(stepWidthRel), 3) : null);
        put('hesitation_count', hesitationCount); put('line_touch_count', lineTouchCount);
        put('sequence_error_count', errors); put('extra_contact_count', extra);
        put('double_support_time_ratio_pct', rnd(dsRatio, 2)); put('interlimb_coordination_s', rnd(interlimb, 3));
        put('peak_trunk_angle_deg', rnd(trunk.peakDev, 2)); put('mean_trunk_angular_velocity_deg_s', rnd(trunk.meanAngvel, 2));
        put('peak_trunk_incl_3d_deg', null); put('near_fall_event', nearFall);
        put('agility_score', null); put('stability_score', null); put('instability_score', null);
        put('effective_fs_hz', rnd(effFs, 2)); put('frames_analysed', fr.length); put('valid_frame_pct', rnd(validPct, 1));
        put('imputed_sample_pct', rnd(impPct, 1)); put('longest_gap_s', rnd(longest, 3)); put('median_foot_visibility', rnd(medVis, 3));
        put('qc_flags', flags.join('; ')); put('qc_pass', qcPass); put('valid_trial', validTrial);
        put('operator_valid', operator.valid !== false); put('operator_balance_lost', !!operator.balanceLost);
        put('operator_support_used', !!operator.supportUsed); put('operator_not_facing_forward', !!operator.notFacingForward);
        put('operator_line_or_cane_contact', !!operator.lineOrCaneContact);

        return { summary: sum, stages: stageRows, contacts: contactRows, frames: frameRows, _debug: { foot, episodes, stageRecs, trunk } };
    }

    // ---------------------------------------------------------------- scale
    function computeScale(pt, foot, episodes, hom, startTon, cfg) {
        if (Number.isFinite(pt.armLengthCm) && pt.armLengthCm > 0) return { armLengthCm: pt.armLengthCm, source: 'OPERATOR_ENTERED' };
        // body estimate during READY hold: median shank px over the start window
        if (!hom.ok || !Number.isFinite(pt.heightCm)) return { armLengthCm: null, source: 'NONE' };
        const shanks = [];
        for (const side of ['L', 'R']) {
            const f = foot[side];
            for (let k = 0; k < f.shankPx.length; k++) if (Number.isFinite(f.shankPx[k]) && f.shankPx[k] > 0) shanks.push(f.shankPx[k]);
        }
        const shankPx = median(shanks);
        if (!(shankPx >= cfg.geometry.minShankPx)) return { armLengthCm: null, source: 'NONE' };
        const sCmPerPx = cfg.anthropometry.shankFractionOfHeight * pt.heightCm / shankPx;  // cm per px
        // v_p ~ median foot v during start; width across floor at that v in px
        const vs = [];
        for (const side of ['L', 'R']) { const f = foot[side]; const e = episodes.find(x => x.foot === side); if (e && Number.isFinite(e.v)) vs.push(e.v); }
        const vp = vs.length ? median(vs) : 0;
        const pA = hom.toImage(-1, vp), pB = hom.toImage(1, vp);
        const dPx = Math.hypot((pA.nx - pB.nx) * hom.W, (pA.ny - pB.ny) * hom.H);
        const armCm = dPx * sCmPerPx / 2;
        if (!(armCm > 0 && armCm < 400)) return { armLengthCm: null, source: 'NONE' };
        return { armLengthCm: armCm, source: 'BODY_ESTIMATED' };
    }

    // ---------------------------------------------------------------- spatial
    function computeSpatial(stageRecs, episodes, startEps, cfg) {
        const allLens = [], leftLens = [], rightLens = [], widths = [], stageLead = {}, stageTrail = {};
        const lastPos = { L: startEps.L ? { u: startEps.L.u, v: startEps.L.v } : null, R: startEps.R ? { u: startEps.R.u, v: startEps.R.v } : null };
        for (const s of stageRecs) {
            const lead = s.first, trail = s.second;
            const leadPrev = lastPos[lead.foot], trailPrev = lastPos[trail.foot];
            const leadLen = leadPrev ? Math.hypot(lead.u - leadPrev.u, lead.v - leadPrev.v) : NaN;
            const trailLen = trailPrev ? Math.hypot(trail.u - trailPrev.u, trail.v - trailPrev.v) : NaN;
            stageLead[s.stage] = leadLen; stageTrail[s.stage] = trailLen;
            for (const [foot, len] of [[lead.foot, leadLen], [trail.foot, trailLen]]) {
                if (!Number.isFinite(len)) continue;
                allLens.push(len);
                if (foot === 'L') leftLens.push(len); else rightLens.push(len);
            }
            widths.push(Math.hypot(lead.u - trail.u, lead.v - trail.v));
            lastPos[lead.foot] = { u: lead.u, v: lead.v };
            lastPos[trail.foot] = { u: trail.u, v: trail.v };
        }
        return { allLens, leftLens, rightLens, widths, stageLead, stageTrail };
    }

    // ---------------------------------------------------------------- trunk
    function computeTrunk(NX, NY, gridT, n, tStart, tStop, cfg) {
        const dev = new Float64Array(n), tilt = new Float64Array(n);
        for (let k = 0; k < n; k++) {
            const msx = (NX[IDX.l_sh][k] + NX[IDX.r_sh][k]) / 2, msy = (NY[IDX.l_sh][k] + NY[IDX.r_sh][k]) / 2;
            const mhx = (NX[IDX.l_hip][k] + NX[IDX.r_hip][k]) / 2, mhy = (NY[IDX.l_hip][k] + NY[IDX.r_hip][k]) / 2;
            tilt[k] = Math.atan2(msx - mhx, mhy - msy) * DEG;
        }
        const pre = []; for (let k = 0; k < n; k++) if (gridT[k] < 0) pre.push(tilt[k]);
        const baseline = pre.length ? median(fin(pre)) : (fin(Array.from(tilt))[0] || 0);
        for (let k = 0; k < n; k++) dev[k] = tilt[k] - baseline;
        const angvel = deriv(dev, 1 / cfg.signal.resampleHz);
        let peakDev = NaN, peakTime = NaN, sumAV = 0, cntAV = 0;
        for (let k = 0; k < n; k++) {
            const t = gridT[k];
            if (tStart != null && tStop != null && t >= tStart && t <= tStop) {
                if (!(Math.abs(dev[k]) <= Math.abs(peakDev))) { peakDev = Math.abs(dev[k]); peakTime = t; }
                if (Number.isFinite(angvel[k])) { sumAV += Math.abs(angvel[k]); cntAV++; }
            }
        }
        return { dev, angvel, peakDev, peakTime, meanAngvel: cntAV ? sumAV / cntAV : NaN };
    }

    const api = { analyzeSession, classify, filtfilt, biquadLP, resampleOnGrid, deriv, IDX, FOOT, median, mean, sd };
    root.FSSTAnalysis = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
