/**
 * FSST//LAB — dependency-free canvas charts (brief 4.5):
 *   1. floorMap   — top-down squares + cross, numbered footprints, per-foot paths
 *   2. footTimeline — L/R grounded intervals with stage bands
 *   3. line       — generic time-series line chart (used for trunk deviation)
 * All resize-aware via devicePixelRatio. Global namespace FSSTCharts.
 */
const FSSTCharts = (function () {
    const BLUE = '#00d4ff', ORANGE = '#ff6a00', GRID = 'rgba(0,212,255,0.25)', DIM = '#8fa6c8', RED = '#ff3b30';

    function setup(canvas, defH) {
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.clientWidth || 360, ch = canvas.clientHeight || defH || 210;
        canvas.width = cw * dpr; canvas.height = ch * dpr;
        const c = canvas.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, cw, ch);
        c.fillStyle = '#0a1120'; c.fillRect(0, 0, cw, ch);
        return { c, cw, ch };
    }

    /** Top-down floor map in unit-grid coordinates. contacts: [{foot,square,stage,u,v}]. */
    function floorMap(canvas, contacts, opts) {
        opts = opts || {};
        const { c, cw, ch } = setup(canvas, 230);
        const pad = 24, R = 1.3; // view spans -R..R arm lengths
        const S = Math.min(cw, ch) - 2 * pad;
        const cx = cw / 2, cy = ch / 2;
        const X = u => cx + (u / (2 * R)) * S;
        const Y = v => cy - (v / (2 * R)) * S;   // v up = away from camera, draw it upward

        // squares (shaded)
        const quad = { 1: [+1, +1], 2: [+1, -1], 3: [-1, -1], 4: [-1, +1] };
        c.font = '700 14px Orbitron, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (const sq of [1, 2, 3, 4]) {
            const [su, sv] = quad[sq];
            const x0 = X(Math.min(0, su)), x1 = X(Math.max(0, su));
            const y0 = Y(Math.max(0, sv)), y1 = Y(Math.min(0, sv));
            c.fillStyle = 'rgba(0,212,255,0.05)'; c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
            c.fillStyle = DIM; c.fillText(String(sq), X(su * 0.5), Y(sv * 0.5));
        }
        // cross + outer bounds
        c.strokeStyle = GRID; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(X(0), Y(-1)); c.lineTo(X(0), Y(1)); c.moveTo(X(-1), Y(0)); c.lineTo(X(1), Y(0)); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.12)';
        c.strokeRect(X(-1), Y(1), X(1) - X(-1), Y(-1) - Y(1));

        // per-foot paths + numbered footprints
        for (const foot of ['L', 'R']) {
            const fc = foot === 'L' ? BLUE : ORANGE;
            const pts = contacts.filter(k => k.foot === foot && k.square > 0);
            c.strokeStyle = fc; c.globalAlpha = 0.5; c.lineWidth = 1.5; c.beginPath();
            pts.forEach((k, i) => { const x = X(k.u), y = Y(k.v); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); });
            c.stroke(); c.globalAlpha = 1;
            c.font = '700 11px Orbitron, sans-serif';
            pts.forEach((k, i) => {
                const x = X(k.u), y = Y(k.v);
                c.fillStyle = fc; c.beginPath(); c.arc(x, y, 9, 0, 6.2832); c.fill();
                c.fillStyle = '#05070d'; c.fillText(String(k.stage != null ? k.stage : i + 1), x, y);
            });
        }
        c.fillStyle = DIM; c.font = '11px sans-serif'; c.textAlign = 'left';
        c.fillText('L (blue) · R (orange) · numbers = stage · top = away from camera', 8, ch - 8);
    }

    /** Foot grounded timeline with stage bands. intervals: {L:[{t0,t1}],R:[...]}, stages:[{t0,t1,stage}]. */
    function footTimeline(canvas, data, opts) {
        opts = opts || {};
        const { c, cw, ch } = setup(canvas, 210);
        const L = 36, Rp = 10, T = 24, B = 26, w = cw - L - Rp, h = ch - T - B;
        const t0 = opts.tMin != null ? opts.tMin : 0, t1 = opts.tMax != null ? opts.tMax : 1;
        const X = t => L + (t - t0) / (t1 - t0 || 1) * w;
        // stage bands
        (data.stages || []).forEach((s, i) => {
            c.fillStyle = i % 2 ? 'rgba(0,212,255,0.06)' : 'rgba(255,106,0,0.05)';
            c.fillRect(X(s.t0), T, Math.max(1, X(s.t1) - X(s.t0)), h);
            c.fillStyle = DIM; c.font = '10px sans-serif'; c.textAlign = 'center';
            c.fillText(String(s.stage), (X(s.t0) + X(s.t1)) / 2, T - 8);
        });
        const rows = [['L', data.L || [], BLUE], ['R', data.R || [], ORANGE]];
        const rowH = h / 2;
        rows.forEach(([label, ivals, col], ri) => {
            const y = T + ri * rowH + rowH * 0.25, bh = rowH * 0.5;
            c.fillStyle = DIM; c.font = '700 11px Orbitron, sans-serif'; c.textAlign = 'right'; c.textBaseline = 'middle';
            c.fillStyle = col; c.fillText(label, L - 6, y + bh / 2);
            c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(L, y, w, bh);
            c.fillStyle = col;
            for (const iv of ivals) c.fillRect(X(iv.t0), y, Math.max(2, X(iv.t1) - X(iv.t0)), bh);
        });
        // x axis
        c.strokeStyle = 'rgba(255,255,255,0.1)'; c.beginPath(); c.moveTo(L, T + h); c.lineTo(L + w, T + h); c.stroke();
        c.fillStyle = DIM; c.font = '11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
        for (let k = 0; k <= 4; k++) { const t = t0 + (t1 - t0) * k / 4; c.fillText(t.toFixed(1), X(t), T + h + 4); }
        c.fillText('time from GO (s) — bars = foot grounded', L + w / 2, ch - 12);
    }

    /** Generic time-series line chart (trunk deviation, with the near-fall threshold line). */
    function line(canvas, o) {
        const { c, cw, ch } = setup(canvas, 210);
        const L = 44, R = 10, T = 14, B = 26, w = cw - L - R, h = ch - T - B;
        const t = o.t;
        const x0 = o.xMin !== undefined ? o.xMin : t[0], x1 = o.xMax !== undefined ? o.xMax : t[t.length - 1];
        let lo = Infinity, hi = -Infinity;
        for (const s of o.series) for (let i = 0; i < s.y.length; i++) { const v = s.y[i]; if (Number.isFinite(v) && t[i] >= x0 && t[i] <= x1) { if (v < lo) lo = v; if (v > hi) hi = v; } }
        for (const hl of (o.hlines || [])) { lo = Math.min(lo, hl.y); hi = Math.max(hi, hl.y); }
        if (o.yMin !== undefined) lo = o.yMin; if (o.yMax !== undefined) hi = o.yMax;
        if (!Number.isFinite(lo) || lo === hi) { lo = 0; hi = 1; }
        const pad = (hi - lo) * 0.08; if (o.yMin === undefined) lo -= pad; if (o.yMax === undefined) hi += pad;
        const X = v => L + (v - x0) / (x1 - x0 || 1) * w, Y = v => T + h - (v - lo) / (hi - lo) * h;
        c.strokeStyle = 'rgba(255,255,255,0.08)'; c.fillStyle = DIM; c.font = '11px sans-serif'; c.lineWidth = 1;
        const nice = (a, b, n) => { const r = (b - a) / n, p = Math.pow(10, Math.floor(Math.log10(r || 1))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
        const ys = nice(lo, hi, 4); c.textAlign = 'right'; c.textBaseline = 'middle';
        for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + w, Y(v)); c.stroke(); c.fillText(+v.toFixed(1), L - 5, Y(v)); }
        const xs = nice(x0, x1, 6); c.textAlign = 'center'; c.textBaseline = 'top';
        for (let v = Math.ceil(x0 / xs) * xs; v <= x1; v += xs) { c.beginPath(); c.moveTo(X(v), T); c.lineTo(X(v), T + h); c.stroke(); c.fillText(+v.toFixed(1), X(v), T + h + 4); }
        for (const hl of (o.hlines || [])) { c.save(); c.setLineDash([5, 4]); c.strokeStyle = hl.color || RED; c.beginPath(); c.moveTo(L, Y(hl.y)); c.lineTo(L + w, Y(hl.y)); c.stroke(); if (hl.y > -1e9) { c.setLineDash([]); c.strokeStyle = hl.color || RED; c.beginPath(); c.moveTo(L, Y(-hl.y)); c.lineTo(L + w, Y(-hl.y)); c.stroke(); } c.restore(); }
        for (const m of (o.marks || [])) { if (m.t < x0 || m.t > x1) continue; c.strokeStyle = m.color; c.lineWidth = 1.2; c.beginPath(); c.moveTo(X(m.t), T); c.lineTo(X(m.t), T + h); c.stroke(); }
        for (const s of o.series) {
            c.strokeStyle = s.color; c.lineWidth = 2; c.beginPath(); let pen = false;
            for (let i = 0; i < s.y.length; i++) { if (t[i] < x0 || t[i] > x1 || !Number.isFinite(s.y[i])) { pen = false; continue; } const px = X(t[i]), py = Y(s.y[i]); if (!pen) { c.moveTo(px, py); pen = true; } else c.lineTo(px, py); }
            c.stroke();
        }
        c.save(); c.translate(11, T + h / 2); c.rotate(-Math.PI / 2); c.fillStyle = DIM; c.textAlign = 'center'; c.fillText(o.yLabel || '', 0, 0); c.restore();
        c.fillStyle = DIM; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText('time from GO (s)', L + w / 2, ch - 2);
    }

    return { floorMap, footTimeline, line };
})();

if (typeof module !== 'undefined') module.exports = FSSTCharts;
