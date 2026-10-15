/**
 * FSST//LAB — Pose engine.
 * MediaPipe Pose Landmarker (browser, on-device), camera, frame capture, and the
 * canvas overlay that draws the floor grid (with draggable arm-tip handles) and the
 * skeleton. NEVER mirrors — all geometry is in raw image space (brief 4.2).
 *
 * Emits frames in the layout the analysis expects:
 *   { tMs, img: Float32Array(17*4) [x,y,z,visibility normalised], world: Float32Array(17*3) | null }
 *
 * Overlay registration uses FSSTGeometry.videoToCanvas so the grid and skeleton stay
 * aligned with the displayed (object-fit:contain) video through resize/rotation.
 */
class PoseEngine {
    constructor() {
        this.landmarker = null;
        this.video = null; this.canvas = null; this.ctx = null;
        this.running = false;
        this.onFrame = null;
        this.delegate = null; this.model = null;
        this.showLabels = true; this.showAll = false;
        this.lastFull = null;
        this.fpsEMA = 0; this._lastFrameWall = 0;
        this._lastTs = 0; this._rvfc = false; this._lastVT = -1;

        // grid overlay state
        this.handles = null;        // {T,R,B,L} normalised image coords
        this.showGrid = true;
        this.gridConfirmed = false;
        this.footStateL = 'swing';  // 'grounded' | 'swing' — set by live.js for the LED rings
        this.footStateR = 'swing';
        this.targetSquare = null;   // highlighted square during a trial
        this.wrongFlashUntil = 0;   // ms wall time to flash red
        this.liveFloor = null;      // {l:{u,v}, r:{u,v}} debug readout
    }

    async initialize(modelKey, onStatus) {
        const say = m => onStatus && onStatus(m);
        if (this.landmarker && this.model === modelKey) return true;
        say('Loading pose model…');
        const mod = await import(CONFIG.pose.bundleUrl);
        const { PoseLandmarker, FilesetResolver } = mod;
        const fileset = await FilesetResolver.forVisionTasks(CONFIG.pose.wasmUrl);
        const opts = delegate => ({
            baseOptions: { modelAssetPath: CONFIG.pose.models[modelKey], delegate },
            runningMode: 'VIDEO', numPoses: CONFIG.pose.numPoses,
            minPoseDetectionConfidence: CONFIG.pose.detectionConfidence,
            minPosePresenceConfidence: CONFIG.pose.presenceConfidence,
            minTrackingConfidence: CONFIG.pose.trackingConfidence
        });
        try { this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU')); this.delegate = 'GPU'; }
        catch (e) { console.warn('GPU delegate failed, using CPU', e); this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU')); this.delegate = 'CPU'; }
        this.model = modelKey;
        say('Pose model ready (' + modelKey + ', ' + this.delegate + ')');
        return true;
    }

    async startCamera(video, canvas, facing) {
        this.video = video; this.canvas = canvas; this.ctx = canvas.getContext('2d');
        const portrait = window.innerHeight >= window.innerWidth;
        const videoConstraints = { facingMode: facing, width: { ideal: portrait ? 720 : 1280 }, height: { ideal: portrait ? 1280 : 720 }, frameRate: { ideal: 30 } };
        if (portrait) videoConstraints.aspectRatio = { ideal: 9 / 16 };
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false }); }
        catch (e) { delete videoConstraints.aspectRatio; stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false }); }
        this.stream = stream;
        video.srcObject = stream;
        await new Promise(res => { video.onloadedmetadata = () => { video.play(); res(); }; });
        this._resizeCanvas();
        if (!this.handles) this.handles = FSSTGeometry.presetHandles(video.videoWidth, video.videoHeight);
        this.running = true; this._lastTs = 0;
        this._rvfc = typeof video.requestVideoFrameCallback === 'function';
        this._schedule();
    }

    /** Size the canvas backing store to its displayed CSS size x devicePixelRatio. */
    _resizeCanvas() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const cssW = this.canvas.clientWidth || this.canvas.width;
        const cssH = this.canvas.clientHeight || this.canvas.height;
        this.canvas.width = Math.round(cssW * dpr);
        this.canvas.height = Math.round(cssH * dpr);
    }

    stop() {
        this.running = false;
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
        if (this.video) this.video.srcObject = null;
    }

    _schedule() {
        if (!this.running) return;
        if (this._rvfc) this.video.requestVideoFrameCallback((now, meta) => this._tick(meta));
        else requestAnimationFrame(() => this._tick(null));
    }

    _tick(meta) {
        if (!this.running) return;
        const v = this.video;
        if (!this._rvfc && v.currentTime === this._lastVT) { this._schedule(); return; }
        this._lastVT = v.currentTime;
        if (v.readyState < 2) { this._schedule(); return; }
        let tMs = meta ? (meta.captureTime != null ? meta.captureTime : (meta.presentationTime != null ? meta.presentationTime : performance.now())) : performance.now();
        if (tMs <= this._lastTs) tMs = this._lastTs + 1;
        this._lastTs = tMs;
        const wall = performance.now();
        if (this._lastFrameWall) { const f = 1000 / Math.max(1, wall - this._lastFrameWall); this.fpsEMA = this.fpsEMA ? 0.9 * this.fpsEMA + 0.1 * f : f; }
        this._lastFrameWall = wall;
        let res = null;
        try { res = this.landmarker.detectForVideo(v, tMs); } catch (e) { console.warn('detect error', e); }
        let frame = null, full = null;
        if (res && res.landmarks && res.landmarks.length) {
            full = res.landmarks[0];
            const wl = res.worldLandmarks && res.worldLandmarks[0];
            const img = new Float32Array(CONFIG.tracked.length * 4), world = new Float32Array(CONFIG.tracked.length * 3);
            CONFIG.tracked.forEach((m, i) => {
                const l = full[m.idx];
                img[i * 4] = l.x; img[i * 4 + 1] = l.y; img[i * 4 + 2] = l.z; img[i * 4 + 3] = l.visibility == null ? 0 : l.visibility;
                if (wl) { const w = wl[m.idx]; world[i * 3] = w.x; world[i * 3 + 1] = w.y; world[i * 3 + 2] = w.z; }
            });
            frame = { tMs, img, world: wl ? world : null };
        }
        this.lastFull = full;
        this.draw(full);
        if (this.onFrame) { try { this.onFrame(frame, tMs); } catch (e) { console.error(e); } }
        this._schedule();
    }

    // ------------------------------------------------------------ overlay helpers
    _map(nx, ny) {
        const dpr = window.devicePixelRatio || 1;
        return FSSTGeometry.videoToCanvas(nx, ny,
            { vw: this.video.videoWidth, vh: this.video.videoHeight },
            { cssW: this.canvas.clientWidth, cssH: this.canvas.clientHeight }, dpr);
    }
    _text(str, x, y, color, size) {
        const c = this.ctx;
        c.save();
        c.font = '600 ' + size + 'px Rajdhani, -apple-system, Segoe UI, sans-serif';
        c.textBaseline = 'middle';
        c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(str, x, y);
        c.fillStyle = color; c.fillText(str, x, y);
        c.restore();
    }

    draw(lm) {
        if (!this.ctx) return;
        this._resizeCanvas();
        const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
        c.clearRect(0, 0, W, H);
        const base = Math.max(W, H) / 1000;
        if (this.showGrid && this.handles) this._drawGrid(base);
        if (lm) this._drawSkeleton(lm, base);
        this._drawFloorDebug(base);
    }

    _drawGrid(base) {
        const c = this.ctx, h = this.handles;
        const hom = FSSTGeometry.makeHomography(h, this.video.videoWidth, this.video.videoHeight);
        const P = p => this._map(p.x, p.y);
        const pT = P(h.T), pR = P(h.R), pB = P(h.B), pL = P(h.L);
        const flashing = performance.now() < this.wrongFlashUntil;

        // fill target square if set
        if (this.targetSquare && hom.ok) {
            const sg = FSSTGeometry.SQUARE_SIGNS[this.targetSquare];
            const corners = [[0, 0], [sg[0], 0], [sg[0], sg[1]], [0, sg[1]]].map(([u, v]) => {
                const im = hom.toImage(u, v); return this._map(im.nx, im.ny);
            });
            c.save(); c.beginPath(); c.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < corners.length; i++) c.lineTo(corners[i].x, corners[i].y);
            c.closePath();
            c.fillStyle = flashing ? 'rgba(255,59,48,0.28)' : 'rgba(255,106,0,0.18)';
            c.fill(); c.restore();
        }

        // outer diamond (arm tips) + cross
        c.save();
        c.strokeStyle = flashing ? 'rgba(255,59,48,0.95)' : 'rgba(0,212,255,0.9)';
        c.lineWidth = 2.5 * base; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(pT.x, pT.y); c.lineTo(pR.x, pR.y); c.lineTo(pB.x, pB.y); c.lineTo(pL.x, pL.y); c.closePath(); c.stroke();
        // cross: T-B and L-R
        c.strokeStyle = 'rgba(255,106,0,0.85)';
        c.beginPath(); c.moveTo(pT.x, pT.y); c.lineTo(pB.x, pB.y); c.moveTo(pL.x, pL.y); c.lineTo(pR.x, pR.y); c.stroke();
        c.restore();

        // square number labels at centroids
        const lbl = { 1: [pT, pR], 2: [pR, pB], 3: [pB, pL], 4: [pL, pT] };
        const ctr = { x: (pT.x + pB.x) / 2, y: (pT.y + pB.y) / 2 };
        for (const sq of [1, 2, 3, 4]) {
            const [a, b] = lbl[sq];
            const mx = (a.x + b.x + ctr.x) / 3, my = (a.y + b.y + ctr.y) / 3;
            this._text(String(sq), mx - 5 * base, my, '#dfe9ff', 20 * base);
        }

        // draggable handles
        for (const k of ['T', 'R', 'B', 'L']) {
            const p = P(h[k]);
            c.beginPath(); c.arc(p.x, p.y, 14 * base, 0, 6.2832);
            c.fillStyle = 'rgba(255,106,0,0.25)'; c.fill();
            c.lineWidth = 2.5 * base; c.strokeStyle = this.gridConfirmed ? 'rgba(76,223,124,0.95)' : 'rgba(255,106,0,0.95)'; c.stroke();
        }
    }

    _drawSkeleton(lm, base) {
        const c = this.ctx;
        const byKey = {}; CONFIG.tracked.forEach(m => { byKey[m.key] = m; });
        const P = key => { const m = byKey[key], l = lm[m.idx]; return l ? this._map(l.x, l.y) : null; };
        const vis = key => { const l = lm[byKey[key].idx]; return l ? (l.visibility || 0) : 0; };
        const conn = [['l_sh', 'r_sh'], ['l_sh', 'l_el'], ['l_el', 'l_wr'], ['r_sh', 'r_el'], ['r_el', 'r_wr'],
            ['l_sh', 'l_hip'], ['r_sh', 'r_hip'], ['l_hip', 'r_hip'],
            ['l_hip', 'l_kn'], ['l_kn', 'l_an'], ['r_hip', 'r_kn'], ['r_kn', 'r_an'],
            ['l_an', 'l_heel'], ['l_heel', 'l_toe'], ['l_an', 'l_toe'],
            ['r_an', 'r_heel'], ['r_heel', 'r_toe'], ['r_an', 'r_toe']];
        c.lineCap = 'round';
        for (const [a, b] of conn) {
            const A = P(a), B = P(b); if (!A || !B) continue;
            const v = Math.min(vis(a), vis(b));
            c.strokeStyle = 'rgba(0,212,255,' + (v > 0.5 ? 0.95 : 0.3) + ')';
            c.lineWidth = 4 * base; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
        }
        if (this.showAll) {
            c.fillStyle = 'rgba(255,255,255,0.3)';
            for (const l of lm) { const p = this._map(l.x, l.y); c.beginPath(); c.arc(p.x, p.y, 2.5 * base, 0, 6.2832); c.fill(); }
        }
        for (const m of CONFIG.tracked) {
            const l = lm[m.idx]; if (!l) continue;
            const p = this._map(l.x, l.y);
            const good = (l.visibility || 0) >= CONFIG.signal.minVisibility;
            const isFoot = /heel|toe|_an/.test(m.key);
            const r = (isFoot ? 9 : 6) * base;
            c.beginPath(); c.arc(p.x, p.y, r, 0, 6.2832);
            if (good) { c.fillStyle = 'rgba(255,106,0,0.95)'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2 * base; c.stroke(); }
            else { c.strokeStyle = 'rgba(255,200,0,0.9)'; c.lineWidth = 3 * base; c.stroke(); }
            if (this.showLabels && (isFoot || m.key === 'nose')) this._text(m.key.toUpperCase() + ' ' + Math.round((l.visibility || 0) * 100), p.x + 12 * base, p.y, good ? '#fff' : '#ffc800', 13 * base);
        }
        // foot-state rings around each ankle-foot centroid
        for (const [side, state] of [['l', this.footStateL], ['r', this.footStateR]]) {
            const an = P(side + '_an'), heel = P(side + '_heel'), toe = P(side + '_toe');
            if (!an) continue;
            const cx = ((heel ? heel.x : an.x) + (toe ? toe.x : an.x) + an.x) / 3;
            const cy = ((heel ? heel.y : an.y) + (toe ? toe.y : an.y) + an.y) / 3;
            c.beginPath(); c.arc(cx, cy, 18 * base, 0, 6.2832);
            c.lineWidth = 3 * base;
            c.strokeStyle = state === 'grounded' ? 'rgba(76,223,124,0.95)' : 'rgba(255,140,58,0.8)';
            c.stroke();
        }
    }

    _drawFloorDebug(base) {
        if (!this.liveFloor) return;
        const c = this.ctx;
        const txt = (lab, f) => f ? lab + ' u' + f.u.toFixed(2) + ' v' + f.v.toFixed(2) : lab + ' —';
        this._text(txt('L', this.liveFloor.l), 10 * base, this.canvas.height - 40 * base, '#00d4ff', 15 * base);
        this._text(txt('R', this.liveFloor.r), 10 * base, this.canvas.height - 20 * base, '#ff6a00', 15 * base);
    }

    /** Hit-test a pointer (normalised image coords) against the handles. Returns 'T'|'R'|'B'|'L'|'inside'|null. */
    hitHandle(nx, ny) {
        if (!this.handles) return null;
        const dpr = window.devicePixelRatio || 1;
        const pr = this._map(nx, ny);
        let best = null, bestD = 26 * dpr;   // ~26 CSS px radius
        for (const k of ['T', 'R', 'B', 'L']) {
            const p = this._map(this.handles[k].x, this.handles[k].y);
            const d = Math.hypot(p.x - pr.x, p.y - pr.y);
            if (d < bestD) { bestD = d; best = k; }
        }
        if (best) return best;
        // inside the diamond? (rough bounding check)
        const h = this.handles;
        if (nx > Math.min(h.L.x, h.R.x) && nx < Math.max(h.L.x, h.R.x) && ny > Math.min(h.T.y, h.B.y) && ny < Math.max(h.T.y, h.B.y)) return 'inside';
        return null;
    }
}

if (typeof window !== 'undefined') window.PoseEngine = PoseEngine;
