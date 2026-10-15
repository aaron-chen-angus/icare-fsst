/**
 * FSST//LAB — Floor geometry: grid preset, 4-point homography (image <-> unit floor),
 * square membership, and the responsive video->canvas mapping shared by the grid,
 * skeleton, charts and the synthetic test generator.
 *
 * Floor unit coordinates (u, v): one unit = one arm length. u points to screen-right,
 * v points away from the camera. Handles map T->(0,+1) R->(+1,0) B->(0,-1) L->(-1,0).
 * Squares (brief 7.2): 1=(u>0,v>0) 2=(u>0,v<0) 3=(u<0,v<0) 4=(u<0,v>0).
 *
 * Global namespace FSSTGeometry; Node-exportable via module.exports.
 */
(function (root) {
    'use strict';

    // Quadrant sign table for each square: [sign(u), sign(v)].
    const SQUARE_SIGNS = { 1: [+1, +1], 2: [+1, -1], 3: [-1, -1], 4: [-1, +1] };

    /**
     * Default grid preset in normalised image coordinates (x/W, y/H), from the Flutter
     * getGridCoordinates port (brief 7.1). rho = W/H. Returns {T,R,B,L} arm-tip handles.
     */
    function presetHandles(W, H) {
        const rho = W / H;
        return {
            T: { x: 0.5,            y: 0.975 - rho / 2.25 },  // far
            R: { x: 0.5 + 0.95 / 3, y: 0.975 - rho / 4.5 },   // right
            B: { x: 0.5,            y: 0.975 },               // near
            L: { x: 0.5 - 0.95 / 3, y: 0.975 - rho / 4.5 }    // left
        };
    }

    // ---------------------------------------------------------------- homography (DLT)
    // Solve a 3x3 homography mapping 4 source points to 4 destination points.
    // Source = image pixels (aspect-corrected), destination = floor unit coords.
    function solveHomography(src, dst) {
        // Build 8x8 linear system A h = b for h = [h0..h7], h8 = 1.
        const A = [], b = [];
        for (let i = 0; i < 4; i++) {
            const sx = src[i].x, sy = src[i].y, dx = dst[i].x, dy = dst[i].y;
            A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]); b.push(dx);
            A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]); b.push(dy);
        }
        const h = solveLinear(A, b);
        if (!h) return null;
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }

    // Gaussian elimination with partial pivoting for an n x n system.
    function solveLinear(A, b) {
        const n = b.length;
        const M = A.map((row, i) => row.concat([b[i]]));
        for (let col = 0; col < n; col++) {
            let piv = col;
            for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
            if (Math.abs(M[piv][col]) < 1e-12) return null;
            [M[col], M[piv]] = [M[piv], M[col]];
            const d = M[col][col];
            for (let c = col; c <= n; c++) M[col][c] /= d;
            for (let r = 0; r < n; r++) {
                if (r === col) continue;
                const f = M[r][col];
                if (f === 0) continue;
                for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
            }
        }
        return M.map(row => row[n]);
    }

    function applyH(h, x, y) {
        const d = h[6] * x + h[7] * y + h[8];
        return { x: (h[0] * x + h[1] * y + h[2]) / d, y: (h[3] * x + h[4] * y + h[5]) / d };
    }

    /**
     * Build a homography context from normalised handles and the video pixel size.
     * We work in aspect-corrected pixel space (x in [0,W], y in [0,H]) so the DLT is well scaled.
     * Returns { toFloor(nx,ny)->{u,v}, toImage(u,v)->{nx,ny}, handles, W, H }.
     */
    function makeHomography(handles, W, H) {
        const pxFor = p => ({ x: p.x * W, y: p.y * H });
        const src = [pxFor(handles.T), pxFor(handles.R), pxFor(handles.B), pxFor(handles.L)];
        const dst = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];
        const Hfwd = solveHomography(src, dst);
        const Hinv = solveHomography(dst, src);
        return {
            handles, W, H, ok: !!(Hfwd && Hinv),
            toFloor(nx, ny) { const p = applyH(Hfwd, nx * W, ny * H); return { u: p.x, v: p.y }; },
            toImage(u, v) { const p = applyH(Hinv, u, v); return { nx: p.x / W, ny: p.y / H }; }
        };
    }

    // ---------------------------------------------------------------- square membership
    /** Which square a floor point sits in (0 = outside), with the on-line band and outside margin. */
    function squareOf(u, v, cfg) {
        const band = cfg.geometry.lineBandRel, margin = cfg.geometry.outsideMarginRel;
        if (Math.max(Math.abs(u), Math.abs(v)) > 1 + margin) return 0;
        for (const s of [1, 2, 3, 4]) {
            const [su, sv] = SQUARE_SIGNS[s];
            if (u * su >= -band && v * sv >= -band) return s;
        }
        return 0;
    }

    /** True if an episode point matches a specific target square (allowing the line band). */
    function matchesSquare(u, v, square, cfg) {
        const band = cfg.geometry.lineBandRel, margin = cfg.geometry.outsideMarginRel;
        const sg = SQUARE_SIGNS[square]; if (!sg) return false;
        const [su, sv] = sg;
        return u * su >= -band && v * sv >= -band && Math.max(Math.abs(u), Math.abs(v)) <= 1 + margin;
    }

    /** True if a point lies on a tape line (near an axis). */
    function onLine(u, v, cfg) {
        return Math.min(Math.abs(u), Math.abs(v)) < cfg.geometry.lineBandRel;
    }

    // ---------------------------------------------------------------- responsive mapping
    /**
     * Map normalised video coordinates (0..1) to canvas pixels, accounting for object-fit:contain,
     * the displayed CSS size and devicePixelRatio. videoBox = {vw, vh} intrinsic video size;
     * el = {cssW, cssH} the displayed element size. Returns {x, y} in canvas backing-store pixels.
     * The canvas backing store is assumed to be cssW*dpr by cssH*dpr.
     */
    function videoToCanvas(nx, ny, videoBox, el, dpr) {
        const vw = videoBox.vw, vh = videoBox.vh, cssW = el.cssW, cssH = el.cssH;
        // object-fit: contain => uniform scale, letterboxed.
        const scale = Math.min(cssW / vw, cssH / vh);
        const dispW = vw * scale, dispH = vh * scale;
        const offX = (cssW - dispW) / 2, offY = (cssH - dispH) / 2;
        return { x: (offX + nx * dispW) * dpr, y: (offY + ny * dispH) * dpr };
    }

    const api = {
        SQUARE_SIGNS, presetHandles, makeHomography, solveHomography, applyH, solveLinear,
        squareOf, matchesSquare, onLine, videoToCanvas
    };
    root.FSSTGeometry = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
