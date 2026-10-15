/**
 * FSST//LAB — Live (causal) contact detection and stage tracking for on-screen feedback.
 * The offline FSSTAnalysis is authoritative; this is a lightweight real-time mirror that
 * drives the HUD (timer start/stop, stage n/8, target square, foot LEDs, wrong-square flash).
 *
 * Global namespace FSSTLive.
 */
(function (root) {
    'use strict';
    const G = root.FSSTGeometry;

    class LiveTracker {
        constructor(cfg) {
            this.cfg = cfg;
            this.reset();
        }
        reset() {
            const cfg = this.cfg;
            this.seq = cfg.protocol.sequence;
            this.stage = 1;                 // next target stage (1..8)
            this.stageFoot = { L: null, R: null };
            this.started = false;           // timer started?
            this.done = false;
            this.tStart = null; this.tStop = null;
            this.errors = 0;
            this.prevSquare = { L: null, R: null };
            this.state = { L: 'swing', R: 'swing' };  // causal grounded/swing
            this.lastPos = { L: null, R: null };
            this.wrongFlash = 0;
            this.hom = null;
            this._prev = { L: null, R: null };   // last {t, x, y} per foot (px) for speed
        }

        setGrid(handles, W, H) { this.hom = G.makeHomography(handles, W, H); this.W = W; this.H = H; }

        /** Feed one frame. f = pose frame; tS = seconds from GO (can be negative pre-roll). Returns HUD state. */
        update(f, tS) {
            if (this.done || !this.hom || !this.hom.ok) return this.hud(tS);
            const cfg = this.cfg, A = root.FSSTAnalysis;
            for (const side of ['L', 'R']) {
                const F = A.FOOT[side];
                const hv = f ? f.img[F.heel * 4 + 3] : 0, tv = f ? f.img[F.toe * 4 + 3] : 0, av = f ? f.img[F.an * 4 + 3] : 0;
                const vis = Math.max(hv, tv, av);
                if (!f || vis < cfg.signal.minVisibility) { this._prev[side] = null; continue; }
                let fx, fy;
                if (hv >= cfg.signal.minVisibility && tv >= cfg.signal.minVisibility) { fx = (f.img[F.heel * 4] + f.img[F.toe * 4]) / 2; fy = (f.img[F.heel * 4 + 1] + f.img[F.toe * 4 + 1]) / 2; }
                else { fx = f.img[F.an * 4]; fy = f.img[F.an * 4 + 1]; }
                const kx = f.img[F.kn * 4] * this.W, ky = f.img[F.kn * 4 + 1] * this.H, ax = f.img[F.an * 4] * this.W, ay = f.img[F.an * 4 + 1] * this.H;
                const shank = Math.hypot(kx - ax, ky - ay) || 1;
                const pxx = fx * this.W, pxy = fy * this.H;
                let speed = 0;
                const pr = this._prev[side];
                if (pr && tS > pr.t) speed = Math.hypot(pxx - pr.x, pxy - pr.y) / (tS - pr.t) / shank;
                this._prev[side] = { t: tS, x: pxx, y: pxy };
                // hysteresis state
                if (this.state[side] === 'swing' && speed < cfg.contacts.vOnShankS) {
                    this.state[side] = 'grounded';
                    const fl = this.hom.toFloor(fx, fy);
                    this._onContact(side, fl, tS);
                } else if (this.state[side] === 'grounded' && speed > cfg.contacts.vOffShankS) {
                    this.state[side] = 'swing';
                }
            }
            return this.hud(tS);
        }

        _onContact(side, fl, tS) {
            const cfg = this.cfg, sq = G.squareOf(fl.u, fl.v, cfg);
            this.lastPos[side] = fl;
            this.lastSquare = this.lastSquare || { L: null, R: null };
            this.lastSquare[side] = sq;
            if (this.done) return;

            // Lenient start: the timer starts the moment the FIRST foot lands in square 2,
            // regardless of exact stage bookkeeping.
            if (!this.started && sq === 2) { this.started = true; this.tStart = tS; }
            if (this.started && sq !== 1) this.leftStartSquare = true;   // they have left square 1

            const target = this.seq[this.stage - 1];
            const prev = this.stage === 1 ? 1 : this.seq[this.stage - 2];
            if (G.matchesSquare(fl.u, fl.v, target, cfg)) {
                if (!this.stageFoot[side]) this.stageFoot[side] = tS;
                if (this.stageFoot.L != null && this.stageFoot.R != null) {
                    this.stage = Math.min(9, this.stage + 1);
                    this.stageFoot = { L: null, R: null };
                }
            } else if (G.matchesSquare(fl.u, fl.v, prev, cfg)) {
                // repositioning in the previous square — allowed, not an error
            } else if (sq !== 0) {
                // wrong square: flag it visually but keep going (never stall)
                this.errors++; this.wrongFlash = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 500;
            }

            // Lenient AUTO-STOP: once the participant has left square 1 and both feet are detected
            // back in square 1 near the end of the lap, stop and record — even if some middle stages
            // were imperfect. "Near the end" = we are at/after the final return stage (stage >= 7)
            // OR a reasonable number of contacts have occurred.
            if (this.started && this.leftStartSquare && !this.done) {
                const bothHome = this.lastSquare.L === 1 && this.lastSquare.R === 1;
                // Only treat a return to square 1 as the END once the participant is on the final
                // return leg (stage >= 7). This avoids a false stop early in the lap while still
                // tolerating imperfect intermediate steps.
                if (bothHome && this.stage >= 7) { this.tStop = tS; this.done = true; }
            }
        }

        hud(tS) {
            const target = this.stage <= 8 ? this.seq[this.stage - 1] : null;
            const elapsed = this.started ? (this.done ? this.tStop - this.tStart : Math.max(0, tS - this.tStart)) : 0;
            return {
                started: this.started, done: this.done, elapsed,
                stage: Math.min(this.stage, 8), target,
                footL: this.state.L, footR: this.state.R,
                errors: this.errors, wrongFlashUntil: this.wrongFlash,
                liveTime: (this.tStart != null && this.tStop != null) ? this.tStop - this.tStart : null
            };
        }
    }

    const api = { LiveTracker };
    root.FSSTLive = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
