/**
 * FSST//LAB — TRON Four Square Step Test Biomechanics Lab — application controller.
 *
 * Flow: entry (instructions + language video + participant form + PROCEED)
 *       -> align (camera + grid handles + READY) -> countdown -> test (live tracking)
 *       -> analysing (offline FSSTAnalysis, authoritative) -> results (charts, tables, verdict)
 *       -> rest -> next trial slot ... -> history.
 *
 * FSSTAnalysis, PoseEngine, FSSTLive, FSSTExport and FSSTCharts are reused; this controller
 * drives the UI and feeds the engines. The offline analysis is authoritative.
 */
(function () {
    'use strict';
    const A = FSSTAnalysis, GEO = FSSTGeometry, LIVE = FSSTLive;
    const app = document.getElementById('app');
    const engine = new PoseEngine();
    const $ = s => document.querySelector(s);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (v, d, u) => (v === null || v === undefined || !Number.isFinite(v)) ? '–' : v.toFixed(d) + (u ? '<small> ' + u + '</small>' : '');

    const DISCLAIMER = 'Screening and research tool, not a medical device. Cut-offs were derived with canes, not flat tape — treat the tier as a screening indicator only.';
    const LIMITS = 'Frontal 2D camera · [TUNE] thresholds are unvalidated · line-touch and near-fall are experimental. Research use — not a diagnostic device.';

    const S = {
        participant: null, attemptGroupId: null,
        trials: [],              // completed trial results {summary,...}
        slotIndex: 0,            // index into CONFIG.protocol.slots
        attemptInSlot: 1,
        repeatReason: '',
        // live session state
        step: null, ring: [], tFrames: [], attempted: 0, t0: 0,
        live: null, result: null, rec: null,
        timer: null, cdTimer: null, restTimer: null,
        manualStop: false, timeout: false, aborted: false,
        audio: null, videoOpened: false, lang: null,
        grid: null,              // {handles, userAdjusted, confirmed}
        operator: null,
        drag: null
    };

    const FLAG_INFO = {
        LOW_FPS: 'Pose detection ran below 15 frames/s: timing precision is reduced. Use a faster device or the lite model.',
        LOW_VALID_FRAMES: 'Fewer than 90% of frames had hips, knees, ankles, heels and toes all detected. Improve lighting/clothing contrast and framing.',
        TRACKING_GAPS: 'Tracking dropped out for a long period; affected samples were bridged by interpolation.',
        FOOT_OCCLUSION: 'A foot was hidden for too much of the trial (often the far foot behind the near one).',
        NOT_IN_START_SQUARE: 'Both feet were not detected inside square 1 at GO (recorded, not blocking).',
        MOVED_BEFORE_GO: 'A foot left square 1 before GO (recorded, not blocking).',
        SEQUENCE_ERROR: 'A foot landed in a wrong square during the lap. Recorded as a metric — it does NOT block the time.',
        INCOMPLETE_SEQUENCE: 'Fewer than the 8 stages were formally matched, but a time was still captured where possible (recorded, not blocking).',
        NO_TIME_CAPTURED: 'No start/stop could be derived — the participant never stepped into square 2 and back to square 1. Re-run the trial.',
        MANUAL_STOP: 'The operator stopped the trial. The time up to the stop is recorded.',
        TIMEOUT: 'The trial exceeded the maximum duration; the time up to that point is recorded.',
        GRID_NOT_CONFIRMED: 'START was pressed before confirming the grid matched the tape (recorded, not blocking).',
        PROTOCOL_ADAPTATION_TAPE: 'A flat tape cross was used instead of canes (always raised). May shorten times versus the validation cohorts.',
        GRID_USER_ADJUSTED: 'The grid handles were moved from the preset (expected and recorded).',
        SCALE_ESTIMATED: 'Arm length was estimated from body proportions; metre values are approximate.',
        SCALE_UNAVAILABLE: 'No arm length and no usable body estimate; metre values are blank (times and counts are unaffected).',
        LINE_TOUCH_LOW_CONFIDENCE: 'A line touch was recorded while foot visibility was low — low confidence from a 2D camera.',
        HIGH_TRUNK_DEVIATION: 'Large lateral trunk lean was detected (experimental).',
        PARTIAL_BODY_IN_FRAME: 'The head or toes left the frame at some point.',
        PRACTICE_TRIAL: 'This is the practice trial.'
    };

    // ------------------------------------------------------------------ utilities
    const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
    function beep(freq, dur) {
        if (!CONFIG.sounds.enabled) return;
        try { S.audio = S.audio || new (window.AudioContext || window.webkitAudioContext)(); const o = S.audio.createOscillator(), g = S.audio.createGain(); o.frequency.value = freq; g.gain.value = 0.15; o.connect(g); g.connect(S.audio.destination); o.start(); o.stop(S.audio.currentTime + dur / 1000); } catch (e) {}
    }
    const slot = () => CONFIG.protocol.slots[S.slotIndex];
    const footer = () => `<div class="footer-limits">${LIMITS}</div>`;

    // ================================================================== ENTRY SCREEN
    function entry() {
        stopAll();
        document.body.classList.remove('live');
        const p = S.participant || {};
        const sheetsOn = !!CONFIG.sheets.webhookUrl;
        const V = CONFIG.videos;
        app.innerHTML = `<div class="screen">
          <div class="center">
            <div class="logo">FSST<span class="slash">//</span>LAB</div>
            <div class="subtitle">Four Square Step Test Biomechanics Lab</div>
            <div class="disclaimer">Screening and research tool, not a medical device.</div>
          </div>

          <div class="panel brackets">
            <h3>Floor &amp; camera setup</h3>
            ${crossSvg()}
            <ol class="instructions">
              <li>Tape a <b>cross</b> on a flat, non-slip floor: two lines crossing, four equal arms. Each square must hold <b>both feet</b>. Use the same size for everyone; enter the arm length below if measured.</li>
              <li>Stand the phone <b>upright (portrait)</b> on a stable support, rear camera, <b>in front of</b> the cross and centred on it. Move it back until the cross fits the on-screen grid.</li>
              <li>Clear 1 m around the cross. Non-slip footwear. A <b>spotter</b> within arm's reach for anyone at risk of falling.</li>
              <li>The participant stands in <b>square 1</b> (far right on screen) facing the phone.</li>
              <li>On GO: step into <b>2, 3, 4, 1, then 4, 3, 2, 1</b>. Both feet touch the floor in every square. Face the phone. Do not touch the lines.</li>
              <li>The clock starts at the first step into square 2 and stops when both feet are back in square 1.</li>
              <li>One <b>practice</b> trial, then <b>two timed</b> trials. Rest between trials if needed.</li>
            </ol>
          </div>

          <div class="panel">
            <h3>Participant &amp; setup</h3>
            <form class="form" id="f" autocomplete="off">
              <div class="fg"><label>Participant ID (pseudonymous — no real names)</label><input id="pid" required value="${esc(p.id)}"></div>
              <div class="grid2">
                <div class="fg"><label>Age (years)</label><input id="age" type="number" min="18" max="110" required value="${esc(p.age)}"></div>
                <div class="fg"><label>Sex</label><select id="sex"><option value="female">Female</option><option value="male">Male</option><option value="other">Other / prefer not to say</option></select></div>
              </div>
              <div class="grid2">
                <div class="fg"><label>Standing height (cm)</label><input id="h" type="number" min="120" max="210" step="0.1" required value="${esc(p.heightCm)}"><div class="hint">Used to estimate scale if no arm length is given.</div></div>
                <div class="fg"><label>Body mass (kg, optional)</label><input id="m" type="number" min="25" max="250" step="0.1" value="${esc(p.massKg)}"></div>
              </div>
              <div class="fg"><label>Population (sets the fall-risk cut-off)</label><select id="pop">
                <option value="older_adult_community">Older adult, community-dwelling, 65+</option>
                <option value="vestibular">Vestibular disorder</option>
                <option value="amputation_transtibial">Unilateral transtibial amputation</option>
                <option value="parkinson">Parkinson's disease</option>
                <option value="stroke_acute">Acute stroke</option>
                <option value="other_none">Other / healthy / under 65 — no validated cut-off</option>
              </select></div>
              <div class="grid2">
                <div class="fg"><label>Assistive device</label><select id="aid"><option value="none">None</option><option value="cane">Cane</option><option value="walker">Walker</option><option value="other">Other</option></select></div>
                <div class="fg"><label>Floor surface</label><select id="surface"><option value="hard">Hard</option><option value="foam">Foam</option><option value="other">Other</option></select></div>
              </div>
              <div class="grid2">
                <div class="fg"><label>Cross arm length (cm, optional)</label><input id="arm" type="number" min="20" max="200" step="0.5" value="${esc(p.armLengthCm)}"><div class="hint">Centre to one tip. Recommended for metre values.</div></div>
                <div class="fg"><label>Site / session label</label><input id="site" value="${esc(p.site)}"></div>
              </div>
              <div class="grid2">
                <div class="fg"><label>Camera</label><select id="cam"><option value="environment">Rear camera (default)</option><option value="user">Front camera / webcam</option></select></div>
                <div class="fg"><label>Pose model</label><select id="model"><option value="full">Full (recommended)</option><option value="heavy">Heavy (most accurate)</option><option value="lite">Lite (fastest)</option></select></div>
              </div>
              <div class="fg"><label>Notes (no identifying information)</label><textarea id="notes" rows="2">${esc(p.notes)}</textarea></div>
              <label class="check"><input type="checkbox" id="c1" required> Operator confirms the participant is fit to test and a spotter is present when needed.</label>
              <label class="check"><input type="checkbox" id="c2" required> Participant has seen the instructions and the floor cross is set up.</label>
              ${sheetsOn ? '<label class="check"><input type="checkbox" id="c3"> Participant consents to upload of the derived numeric results to the study Google Sheet.</label>' : '<div class="note info" style="margin-top:6px">Cloud upload not configured — results are saved locally and can be downloaded.</div>'}
              <div class="err" id="err"></div>
            </form>
          </div>

          <div class="panel brackets">
            <h3>Watch the demo</h3>
            <p style="margin-bottom:10px">Pick a language, then press PROCEED.</p>
            <div class="lang-grid" id="langs">
              ${Object.keys(V).map(k => `<button type="button" class="btn lang-btn" data-lang="${k}">${V[k].label}<span class="sub">${esc(V[k].sub)}</span></button>`).join('')}
            </div>
            <div id="videoHost"></div>
          </div>

          <button class="btn btn-primary btn-large" id="proceed" style="display:none" disabled>PROCEED ▸</button>
          <button class="btn btn-danger" id="cannot">Unable to perform test</button>

          <details class="more-info">
            <summary>Privacy &amp; history</summary>
            <p style="margin:8px 0"><b>Privacy.</b> Video never leaves the device and is never stored. Pose landmarks are processed in the browser; only numeric results are saved locally or (with consent) uploaded.</p>
            <div class="row"><button class="btn btn-secondary btn-small" id="hist">History &amp; unsent data</button></div>
            <p class="status" style="margin-top:8px">v${CONFIG.app.version} · analysis ${CONFIG.app.analysisVersion} · schema ${CONFIG.app.schemaVersion}</p>
          </details>
          ${footer()}
        </div>`;

        $('#sex').value = p.sex || 'female';
        $('#pop').value = p.population || 'older_adult_community';
        $('#aid').value = p.assistiveDevice || 'none';
        $('#surface').value = p.surface || 'hard';
        $('#cam').value = p.cam || 'environment';
        $('#model').value = p.model || CONFIG.pose.defaultModel;
        if (sheetsOn && p.consent) $('#c3').checked = true;
        $('#hist').onclick = history;
        $('#cannot').onclick = cannotDo;
        const form = $('#f');
        form.addEventListener('input', refreshProceed);
        form.addEventListener('change', refreshProceed);
        $('#langs').querySelectorAll('.lang-btn').forEach(b => b.onclick = () => openVideo(b.dataset.lang));
        $('#proceed').onclick = proceed;
        refreshProceed();
    }

    function crossSvg() {
        return `<svg class="cross-svg" viewBox="0 0 220 180" role="img" aria-label="Tape cross with four squares and the phone in front">
          <rect x="30" y="20" width="160" height="120" fill="none" stroke="rgba(0,212,255,0.3)"/>
          <line x1="110" y1="20" x2="110" y2="140" stroke="#ff6a00" stroke-width="2"/>
          <line x1="30" y1="80" x2="190" y2="80" stroke="#ff6a00" stroke-width="2"/>
          <text x="150" y="55" fill="#dfe9ff" font-family="Orbitron" font-size="16">1</text>
          <text x="150" y="115" fill="#dfe9ff" font-family="Orbitron" font-size="16">2</text>
          <text x="62" y="115" fill="#dfe9ff" font-family="Orbitron" font-size="16">3</text>
          <text x="62" y="55" fill="#dfe9ff" font-family="Orbitron" font-size="16">4</text>
          <rect x="98" y="150" width="24" height="26" rx="3" fill="none" stroke="#00d4ff"/>
          <text x="110" y="168" fill="#00d4ff" font-size="9" text-anchor="middle">cam</text>
        </svg>`;
    }

    function formValid() {
        const pid = $('#pid'), age = $('#age'), h = $('#h'), c1 = $('#c1'), c2 = $('#c2');
        if (!pid || !pid.value.trim()) return false;
        const a = parseInt(age.value, 10); if (!(a >= 18 && a <= 110)) return false;
        const hv = parseFloat(h.value); if (!(hv >= 120 && hv <= 210)) return false;
        if (!c1.checked || !c2.checked) return false;
        return true;
    }
    function refreshProceed() {
        const btn = $('#proceed'); if (!btn) return;
        btn.style.display = S.videoOpened ? '' : 'none';
        btn.disabled = !(S.videoOpened && formValid());
    }
    function openVideo(lang) {
        S.lang = lang; S.videoOpened = true;
        const v = CONFIG.videos[lang];
        $('#langs').querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
        const embed = `https://www.youtube.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
        const shorts = `https://www.youtube.com/shorts/${v.id}`;
        $('#videoHost').innerHTML = `<div class="video-panel">
            <div class="video-frame"><iframe src="${embed}" title="FSST demo (${esc(v.label)})" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
            <a class="yt-fallback" href="${shorts}" target="_blank" rel="noopener">Open on YouTube ▸</a>
            <div class="lang-switch">${Object.keys(CONFIG.videos).map(k => `<button type="button" class="btn btn-secondary${k === lang ? ' active' : ''}" data-lang="${k}">${CONFIG.videos[k].label}</button>`).join('')}</div>
          </div>`;
        $('#videoHost').querySelectorAll('.lang-switch .btn').forEach(b => b.onclick = () => openVideo(b.dataset.lang));
        refreshProceed();
    }

    function readForm() {
        const sheetsOn = !!CONFIG.sheets.webhookUrl;
        const h = parseFloat($('#h').value), age = parseInt($('#age').value, 10), m = parseFloat($('#m').value), arm = parseFloat($('#arm').value);
        return {
            id: $('#pid').value.trim(), age, sex: $('#sex').value, heightCm: h, massKg: Number.isFinite(m) ? m : NaN,
            population: $('#pop').value, assistiveDevice: $('#aid').value, surface: $('#surface').value,
            armLengthCm: Number.isFinite(arm) ? arm : NaN,
            site: $('#site').value.trim(), notes: $('#notes').value.trim(),
            cam: $('#cam').value, model: $('#model').value,
            safetyConfirmed: $('#c1').checked, setupConfirmed: $('#c2').checked,
            consent: sheetsOn && $('#c3') && $('#c3').checked
        };
    }

    function cannotDo() {
        if (!$('#pid').value.trim()) { $('#err').textContent = 'Enter a participant ID first.'; return; }
        const p = readForm();
        S.participant = p; S.attemptGroupId = S.attemptGroupId || uuid();
        const sum = {};
        for (const f of SCHEMA.sessions) sum[f.key] = null;
        Object.assign(sum, {
            session_id: uuid(), attempt_group_id: S.attemptGroupId, trial_slot: slot(), attempt_in_slot: 1,
            is_practice: slot() === 'PRACTICE', timestamp_utc: new Date().toISOString(), utc_offset_min: -new Date().getTimezoneOffset(),
            app_version: CONFIG.app.version, analysis_version: CONFIG.app.analysisVersion, schema_version: CONFIG.app.schemaVersion,
            participant_id: p.id, age_years: p.age, sex: p.sex, height_cm: p.heightCm, population: p.population,
            assistive_device: p.assistiveDevice, surface: p.surface, site: p.site, operator_notes: p.notes,
            test_status: 'CANNOT_DO', failure_reason: 'Unable to perform test', stage_progress: '0/8', stages_completed: 0,
            time_to_complete_s: null, fall_risk_tier: 'NOT_CLASSIFIED', risk_note: 'INVALID_TRIAL',
            qc_flags: 'CANNOT_DO', qc_pass: false, valid_trial: false, headline_basis: CONFIG.protocol.headlineBasis
        });
        FSSTExport.addHistory(sum);
        $('#err').innerHTML = '<span class="good">Recorded CANNOT_DO for ' + esc(p.id) + ' in History.</span>';
    }

    async function proceed() {
        if (!formValid()) return;
        S.participant = readForm();
        S.attemptGroupId = S.attemptGroupId || uuid();
        const btn = $('#proceed'); btn.disabled = true; btn.textContent = 'LOADING POSE MODEL…';
        $('#err').textContent = '';
        try { await engine.initialize(S.participant.model, msg => { btn.textContent = (msg || 'LOADING…').toUpperCase(); }); }
        catch (err) { console.error(err); $('#err').textContent = 'Could not load the pose model: ' + err.message + ' (needs internet on first load).'; btn.disabled = false; btn.textContent = 'PROCEED ▸'; return; }
        session();
    }

    // ================================================================== LIVE SESSION
    async function session() {
        stopAll();
        document.body.classList.add('live');
        Object.assign(S, { step: 'align', ring: [], tFrames: [], attempted: 0, result: null, rec: null, manualStop: false, timeout: false, aborted: false, live: null, operator: null });
        if (!S.grid) {
            const W = 720, H = 1280;
            S.grid = { handles: GEO.presetHandles(W, H), userAdjusted: false, confirmed: false };
        } else { S.grid.confirmed = false; }
        app.innerHTML = `<div class="live-session">
          <div class="live-video-wrap" id="vw">
            <video id="video" playsinline muted></video><canvas id="cv" class="interactive"></canvas>
            <div class="hud">
              <div class="hud-time" id="ht"></div>
              <div class="hud-right"><div class="stage-chip" id="hs"></div><div class="foot-leds"><div class="foot-led" id="ledL">L</div><div class="foot-led" id="ledR">R</div></div></div>
            </div>
            <div class="live-overlay"><div class="overlay-status" id="ov">Starting camera…</div></div>
            <div class="angle-panel" id="ap"></div>
            <div class="grid-hint" id="gh" style="display:none"></div>
          </div>
          <div class="controls" id="ctl"></div></div>`;
        try { await engine.startCamera($('#video'), $('#cv'), S.participant.cam); }
        catch (e) { $('#ov').textContent = 'Camera error: ' + e.message + '\nAllow camera access (HTTPS required) and retry.'; $('#ctl').innerHTML = '<button class="btn btn-secondary" id="b">Back</button>'; $('#b').onclick = entry; return; }
        engine.handles = S.grid.handles;
        engine.gridConfirmed = S.grid.confirmed;
        engine.showGrid = true; engine.showLabels = true; engine.showAll = false;
        engine.onFrame = onFrame;
        try { if (navigator.wakeLock) S.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
        wireGridDrag();
        setStep('align');
    }

    async function flipCamera() {
        S.participant.cam = S.participant.cam === 'user' ? 'environment' : 'user';
        engine.stop();
        try { await engine.startCamera($('#video'), $('#cv'), S.participant.cam); } catch (e) { $('#ov').textContent = 'Camera error: ' + e.message; return; }
        engine.handles = S.grid.handles; engine.onFrame = onFrame; wireGridDrag();
    }

    // ---- grid drag handling
    function wireGridDrag() {
        const cv = $('#cv'); if (!cv) return;
        const toNorm = (ev) => {
            const r = cv.getBoundingClientRect();
            const cssX = ev.clientX - r.left, cssY = ev.clientY - r.top;
            // invert object-fit:contain mapping
            const vw = engine.video.videoWidth, vh = engine.video.videoHeight;
            const scale = Math.min(r.width / vw, r.height / vh);
            const dispW = vw * scale, dispH = vh * scale, offX = (r.width - dispW) / 2, offY = (r.height - dispH) / 2;
            return { nx: (cssX - offX) / dispW, ny: (cssY - offY) / dispH };
        };
        cv.onpointerdown = (ev) => {
            if (S.step !== 'align') return;
            const { nx, ny } = toNorm(ev);
            const hit = engine.hitHandle(nx, ny);
            if (hit) { S.drag = { mode: hit, lastNx: nx, lastNy: ny }; cv.setPointerCapture(ev.pointerId); ev.preventDefault(); }
        };
        cv.onpointermove = (ev) => {
            if (!S.drag) return;
            const { nx, ny } = toNorm(ev);
            const h = S.grid.handles;
            if (S.drag.mode === 'inside') {
                const dx = nx - S.drag.lastNx, dy = ny - S.drag.lastNy;
                for (const k of ['T', 'R', 'B', 'L']) { h[k].x += dx; h[k].y += dy; }
            } else {
                h[S.drag.mode].x = Math.max(0, Math.min(1, nx)); h[S.drag.mode].y = Math.max(0, Math.min(1, ny));
            }
            S.drag.lastNx = nx; S.drag.lastNy = ny;
            S.grid.userAdjusted = true; S.grid.confirmed = false; engine.gridConfirmed = false;
            updateAlignHint();
        };
        cv.onpointerup = () => { S.drag = null; };
        cv.onpointercancel = () => { S.drag = null; };
    }

    function setStep(step, msg) {
        S.step = step;
        const ov = $('#ov'), ctl = $('#ctl'); if (!ov) return;
        ov.classList.remove('big');
        const back = '<button class="btn btn-secondary btn-small" id="bk">Exit</button>';
        const wireBack = () => { const b = $('#bk'); if (b) b.onclick = () => { stopAll(); entry(); }; };
        if (step === 'align') {
            engine.showGrid = true; engine.targetSquare = null;
            ctl.innerHTML = back +
                '<button class="btn btn-secondary btn-small" id="cm">Flip cam</button>' +
                '<button class="btn btn-secondary btn-small active" id="lb">Labels</button>' +
                '<button class="btn btn-secondary btn-small" id="al">All pts</button>' +
                '<button class="btn btn-secondary btn-small" id="rg">Reset grid</button>' +
                '<button class="btn btn-secondary btn-small" id="gc">Grid matches tape</button>' +
                '<button class="btn btn-primary" id="nx" disabled>Start trial</button>';
            wireBack();
            $('#cm').onclick = flipCamera;
            $('#lb').onclick = () => { engine.showLabels = !engine.showLabels; $('#lb').classList.toggle('active', engine.showLabels); };
            $('#al').onclick = () => { engine.showAll = !engine.showAll; $('#al').classList.toggle('active', engine.showAll); };
            $('#rg').onclick = () => { S.grid.handles = GEO.presetHandles(engine.video.videoWidth, engine.video.videoHeight); S.grid.userAdjusted = false; S.grid.confirmed = false; engine.handles = S.grid.handles; engine.gridConfirmed = false; updateAlignHint(); };
            $('#gc').onclick = () => { S.grid.confirmed = true; engine.gridConfirmed = true; $('#gc').classList.add('active'); updateAlignHint(); };
            $('#nx').onclick = () => { beep(1, 1); countdown(); };
            $('#gh').style.display = '';
            updateAlignHint();
        } else if (step === 'countdown') {
            engine.showGrid = true;
            ov.classList.add('big'); ctl.innerHTML = '<button class="btn btn-danger" id="ab">Abort</button>';
            $('#gh').style.display = 'none';
            $('#ab').onclick = () => { S.aborted = true; stopTimers(); setStep('align'); };
        } else if (step === 'test') {
            ov.textContent = ''; ctl.innerHTML = '<button class="btn btn-danger" id="se">Stop (safety)</button>';
            $('#se').onclick = () => finish({ manual: true });
        } else if (step === 'analysing') {
            ov.textContent = 'ANALYSING…'; ctl.innerHTML = '';
        }
    }

    function updateAlignHint() {
        const gh = $('#gh'); if (!gh) return;
        gh.innerHTML = S.grid.confirmed
            ? '<span class="good">Grid confirmed.</span> Participant in square 1 (far right), facing the phone.'
            : 'Drag the four handles onto your tape arm tips, then tap <b>Grid matches tape</b>.';
    }

    // ---- live frame handling
    function onFrame(f, tMs) {
        const step = S.step;
        if (f && ['align', 'countdown'].includes(step)) { S.ring.push(f); while (S.ring.length && S.ring[0].tMs < tMs - 2500) S.ring.shift(); }
        if (step === 'align') updateReadiness(f);
        if (step === 'test') {
            const el = (tMs - S.t0) / 1000;
            if (f) S.tFrames.push(f);
            if (el >= 0) S.attempted++;
            // live tracking
            const hud = S.live.update(f, el);
            renderHud(hud, el);
            engine.footStateL = hud.footL; engine.footStateR = hud.footR;
            engine.targetSquare = hud.target;
            engine.wrongFlashUntil = hud.wrongFlashUntil;
            if (f) {
                const flL = (S.live.lastPos.L), flR = (S.live.lastPos.R);
                engine.liveFloor = { l: flL, r: flR };
            }
            if (hud.done) { setTimeout(() => finish({ manual: false, liveTime: hud.liveTime }), CONFIG.protocol.tailS * 1000); S.step = 'test-ending'; }
            const ap = $('#ap'); if (ap) ap.textContent = engine.fpsEMA.toFixed(0) + ' fps · stage ' + hud.stage + '/8' + (hud.errors ? ' · ' + hud.errors + ' err' : '');
        }
        if (step === 'test-ending') { if (f) S.tFrames.push(f); }
    }

    function renderHud(hud, el) {
        const ht = $('#ht'), hs = $('#hs'), lL = $('#ledL'), lR = $('#ledR');
        if (ht) ht.textContent = (hud.started ? hud.elapsed : 0).toFixed(1);
        if (hs) hs.innerHTML = 'STAGE ' + hud.stage + '/8<span class="stage-sub">NEXT: SQ ' + (hud.target || '-') + '</span>';
        if (lL) lL.classList.toggle('on', hud.footL === 'grounded');
        if (lR) lR.classList.toggle('on', hud.footR === 'grounded');
    }

    function updateReadiness(f) {
        const nx = $('#nx'); if (!nx) return;
        let msg, ready = false;
        if (!f) msg = 'No person detected.';
        else {
            const need = ['l_hip', 'r_hip', 'l_kn', 'r_kn', 'l_an', 'r_an', 'l_heel', 'r_heel', 'l_toe', 'r_toe', 'nose'];
            const vis = key => f.img[A.IDX[key] * 4 + 3];
            const allVis = need.every(k => vis(k) >= CONFIG.signal.minVisibility);
            if (!allVis) msg = 'Whole body must be visible: hips, knees, ankles, heels, toes and head.';
            else if (!S.grid.confirmed) msg = 'Confirm the grid matches the tape (tap “Grid matches tape”).';
            else {
                // both feet inside square 1, stationary
                const hom = GEO.makeHomography(S.grid.handles, engine.video.videoWidth, engine.video.videoHeight);
                const footFloor = side => { const F = A.FOOT[side]; const fx = (f.img[F.heel * 4] + f.img[F.toe * 4]) / 2, fy = (f.img[F.heel * 4 + 1] + f.img[F.toe * 4 + 1]) / 2; return hom.toFloor(fx, fy); };
                const fl = footFloor('L'), fr = footFloor('R');
                const inSq1 = GEO.matchesSquare(fl.u, fl.v, 1, CONFIG) && GEO.matchesSquare(fr.u, fr.v, 1, CONFIG);
                if (!inSq1) msg = 'Step into square 1 (far right) with both feet.';
                else { msg = 'READY — in square 1, facing the phone.'; ready = true; }
                engine.liveFloor = { l: fl, r: fr };
            }
        }
        const ov = $('#ov'); if (ov && S.step === 'align') ov.innerHTML = '<span class="' + (ready ? 'good' : 'warn') + '">' + esc(msg) + '</span>';
        nx.disabled = !ready;
    }

    function countdown() {
        stopTimers(); let n = CONFIG.protocol.countdownS; setStep('countdown');
        const show = () => { $('#ov').textContent = n > 0 ? n : 'GO'; };
        show(); beep(600, 200);
        S.cdTimer = setInterval(() => {
            n--; if (n > 0) { show(); beep(600, 200); return; }
            clearInterval(S.cdTimer); S.cdTimer = null; show(); beep(1000, 400); startTest();
        }, 1000);
    }

    function startTest() {
        S.t0 = performance.now();
        const lo = S.t0 - CONFIG.protocol.preRollS * 1000;
        S.tFrames = S.ring.filter(f => f.tMs >= lo); S.attempted = 0;
        S.live = new LIVE.LiveTracker(CONFIG);
        S.live.setGrid(S.grid.handles, engine.video.videoWidth, engine.video.videoHeight);
        setStep('test');
        setTimeout(() => { const o = $('#ov'); if (o && S.step === 'test') { o.classList.remove('big'); o.innerHTML = '<span class="warn">STEP INTO SQUARE 2</span>'; } }, 400);
        const ht = $('#ht'); if (ht) ht.classList.add('counting');
        S.timer = setInterval(() => {
            const el = (performance.now() - S.t0) / 1000;
            if (el >= CONFIG.protocol.maxTrialS && (S.step === 'test' || S.step === 'test-ending')) { S.timeout = true; finish({ manual: false, timeout: true }); }
        }, 150);
    }

    function finish(opt) {
        opt = opt || {};
        if (S.step === 'analysing') return;
        const elapsed = (performance.now() - S.t0) / 1000;
        stopTimers(); S.manualStop = !!opt.manual; S.timeout = !!opt.timeout; setStep('analysing');
        const W = engine.video.videoWidth, H = engine.video.videoHeight;
        const sorted = S.tFrames.slice().sort((a, b) => a.tMs - b.tMs);
        const rec = { W, H, t0Ms: S.t0, attempted: S.attempted, frames: sorted };
        const meta = {
            sessionId: uuid(), timestampUtc: new Date().toISOString(), utcOffsetMin: -new Date().getTimezoneOffset(),
            poseModel: engine.model, delegate: engine.delegate, cameraFacing: S.participant.cam, userAgent: navigator.userAgent,
            elapsedS: elapsed, manualStop: S.manualStop, timeout: S.timeout, aborted: S.aborted,
            language: S.lang, videoOpened: S.videoOpened, safetyConfirmed: S.participant.safetyConfirmed,
            setupConfirmed: S.participant.setupConfirmed, consentUpload: S.participant.consent,
            liveTime: opt.liveTime != null ? opt.liveTime : (S.live ? S.live.hud(elapsed).liveTime : null)
        };
        engine.stop();
        if (S.wakeLock) { try { S.wakeLock.release(); } catch (e) {} S.wakeLock = null; }
        setTimeout(() => {
            let res;
            try {
                res = A.analyzeSession({
                    recording: rec, grid: { handles: S.grid.handles, userAdjusted: S.grid.userAdjusted, confirmed: S.grid.confirmed },
                    participant: S.participant, meta, cfg: CONFIG, schema: SCHEMA,
                    trial: { slot: slot(), attemptInSlot: S.attemptInSlot, attemptGroupId: S.attemptGroupId, repeatReason: S.repeatReason },
                    operator: {}
                });
            } catch (e) { console.error(e); res = { error: 'Analysis failed: ' + e.message }; }
            if (res.error) { document.body.classList.remove('live'); app.innerHTML = '<div class="screen center"><div class="panel brackets"><h2>Analysis problem</h2><p>' + esc(res.error) + '</p><button class="btn btn-primary" id="r">Try again</button></div></div>'; $('#r').onclick = session; return; }
            S.result = res; S.rec = rec; S.operator = { valid: true };
            results();
        }, 60);
    }

    function stopTimers() { if (S.timer) clearInterval(S.timer); if (S.cdTimer) clearInterval(S.cdTimer); if (S.restTimer) clearInterval(S.restTimer); S.timer = S.cdTimer = S.restTimer = null; }
    function stopAll() { stopTimers(); engine.onFrame = null; engine.stop(); if (S.wakeLock) { try { S.wakeLock.release(); } catch (e) {} S.wakeLock = null; } }

    // ================================================================== RESULTS
    function metric(t, v) { return '<div class="metric"><div class="t">' + t + '</div><div class="v">' + v + '</div></div>'; }

    function groupScores() {
        const valid = S.trials.filter(t => t.summary.valid_trial);
        const bestAll = valid.length ? Math.min.apply(null, valid.map(t => t.summary.time_to_complete_s).filter(Number.isFinite)) : null;
        const timed = valid.filter(t => !t.summary.is_practice);
        const bestTimed = timed.length ? Math.min.apply(null, timed.map(t => t.summary.time_to_complete_s).filter(Number.isFinite)) : null;
        return { bestAll: Number.isFinite(bestAll) ? bestAll : null, bestTimed: Number.isFinite(bestTimed) ? bestTimed : null };
    }
    function tierFor(timeS) {
        const r = A.classify(timeS, timeS != null ? 'COMPLETED' : 'INCOMPLETE', S.participant, CONFIG);
        return r;
    }

    function results() {
        document.body.classList.remove('live');
        const r = S.result, s = r.summary;
        // record provisional (will be re-stored if operator edits verdict)
        storeTrial();
        const flags = s.qc_flags ? s.qc_flags.split('; ').filter(Boolean) : [];
        const failed = s.test_status !== 'COMPLETED';
        const gs = groupScores();

        const slotLabel = { PRACTICE: 'PRACTICE', TIMED_1: 'TIMED 1', TIMED_2: 'TIMED 2' }[s.trial_slot] || s.trial_slot;
        const tierBadge = (tier, note) => {
            if (tier === 'ELEVATED') return '<span class="badge bad">Elevated fall risk</span>';
            if (tier === 'LOWER') return '<span class="badge ok">Lower fall risk</span>';
            return '<span class="badge neutral">Not classified' + (note ? ' (' + esc(note.toLowerCase().replace(/_/g, ' ')) + ')' : '') + '</span>';
        };

        const banner = (() => {
            const bt = gs.bestTimed, ba = gs.bestAll;
            if (ba == null && bt == null) return '';
            const baTier = ba != null ? tierFor(ba) : null, btTier = bt != null ? tierFor(bt) : null;
            let html = '<div class="panel"><h3>Attempt group</h3>';
            if (ba != null) html += '<div class="big-score"><div class="big-number">' + ba.toFixed(1) + '</div><div class="big-label">BEST (all valid attempts), seconds</div>' + (baTier ? tierBadge(baTier.tier, baTier.note) : '') + '</div>';
            if (bt != null && bt !== ba) html += '<p style="text-align:center">Protocol score (best of 2 timed): <b style="color:var(--blue)">' + bt.toFixed(1) + ' s</b> ' + (btTier ? tierBadge(btTier.tier, btTier.note) : '') + '</p>';
            else if (bt != null && bt === ba) html += '<p style="text-align:center">Protocol score (best of 2 timed) equals BEST.</p>';
            html += '</div>';
            return html;
        })();

        const panels = failed ? '' : metricPanels(r);

        app.innerHTML = `<div class="screen">
          <div class="panel brackets">
            <div class="big-score">
              <div class="big-number">${failed ? '–' : s.time_to_complete_s.toFixed(1)}</div>
              <div class="big-label">${esc(slotLabel)} · time (s)</div>
              <div>
                <span class="badge ${s.qc_pass ? 'ok' : 'review'}">${s.qc_pass ? 'QC PASS' : 'REVIEW'}</span>
                ${tierBadge(s.fall_risk_tier, s.risk_note)}
                <span class="badge neutral">${esc(s.stage_progress)}</span>
              </div>
            </div>
            ${failed ? '<div class="note"><b>' + esc(s.test_status) + '.</b> ' + esc(s.failure_reason || '') + ' Stage reached: ' + esc(s.stage_progress) + '.</div>' : ''}
            <p style="margin-top:8px;text-align:center">${esc(DISCLAIMER)}</p>
          </div>

          ${banner}

          <div class="trial-strip">${trialStrip()}</div>

          ${panels}

          <div class="panel"><h3>Charts</h3>
            <canvas class="chart path-map" id="chMap"></canvas>
            <canvas class="chart timeline" id="chTime"></canvas>
            <canvas class="chart" id="chTrunk"></canvas>
          </div>

          <div class="panel"><h3>Stages</h3>${stagesTable(r)}</div>

          <div class="panel"><h3>Quality flags</h3>${flagsHtml(flags)}</div>

          <div class="panel"><h3>Operator verdict</h3>
            <div class="operator-verdict">
              <label class="check"><input type="checkbox" id="ov_valid" checked> Valid trial</label>
              <label class="check"><input type="checkbox" id="ov_balance"> Balance lost</label>
              <label class="check"><input type="checkbox" id="ov_support"> Support / assistive device used</label>
              <label class="check"><input type="checkbox" id="ov_facing"> Not facing forward</label>
              <label class="check"><input type="checkbox" id="ov_line"> Line or cane contact</label>
              <div class="hint">Editing the verdict re-evaluates whether the trial counts toward BEST.</div>
            </div>
          </div>

          <details><summary>Data quality</summary>
            <div class="metrics" style="margin-top:10px">
              ${metric('Detection rate', fmt(s.effective_fs_hz, 1, 'fps'))}
              ${metric('Valid frames', fmt(s.valid_frame_pct, 0, '%'))}
              ${metric('Imputed', fmt(s.imputed_sample_pct, 0, '%'))}
              ${metric('Longest gap', fmt(s.longest_gap_s, 2, 's'))}
              ${metric('Scale source', esc(s.arm_length_source || '–'))}
              ${metric('Arm length', fmt(s.arm_length_cm, 1, 'cm'))}
            </div>
          </details>

          <div class="row">
            <button class="btn" id="dl">Download all data (ZIP)</button>
            ${CONFIG.sheets.webhookUrl ? '<button class="btn" id="up">Upload to Sheets</button>' : ''}
          </div>
          <div class="status" id="upst"></div>
          <div class="row">
            ${nextButtons(failed)}
          </div>
          <div class="row">
            <button class="btn btn-secondary" id="np">New participant</button>
            <button class="btn btn-secondary" id="home">Home</button>
          </div>
          ${footer()}
        </div>`;

        // wire verdict
        ['ov_valid', 'ov_balance', 'ov_support', 'ov_facing', 'ov_line'].forEach(id => { const el = $('#' + id); if (el) el.onchange = reVerdict; });
        drawCharts(r);
        $('#dl').onclick = () => { const files = FSSTExport.sessionFiles(r, S.rec, CONFIG, SCHEMA); FSSTExport.download('fsst_' + s.session_id + '.zip', FSSTExport.makeZip(files), 'application/zip'); };
        const up = $('#up'); if (up) up.onclick = uploadSheets;
        const rb = $('#repeat'); if (rb) rb.onclick = repeatTrial;
        const nb = $('#next'); if (nb) nb.onclick = nextTrial;
        $('#np').onclick = newParticipant;
        $('#home').onclick = () => { stopAll(); entry(); };
        if (CONFIG.sheets.webhookUrl && S.participant.consent && !failed) uploadSheets();
    }

    function nextButtons(failed) {
        const slots = CONFIG.protocol.slots;
        const atLast = S.slotIndex >= slots.length - 1;
        let html = '';
        if (failed || (!S.result.summary.valid_trial && S.attemptInSlot <= CONFIG.protocol.maxRepeatsPerSlot)) {
            html += '<button class="btn btn-primary" id="repeat">Repeat this trial</button>';
        }
        if (!atLast) html += '<button class="btn btn-primary" id="next">Next trial (' + ({ PRACTICE: 'TIMED 1', TIMED_1: 'TIMED 2' }[slot()] || 'next') + ') ▸</button>';
        else html += '<button class="btn" id="next" disabled>All trials done</button>';
        return html;
    }

    function trialStrip() {
        const slots = CONFIG.protocol.slots, label = { PRACTICE: 'PRACTICE', TIMED_1: 'TIMED 1', TIMED_2: 'TIMED 2' };
        return slots.map((sl, i) => {
            const t = S.trials.filter(x => x.summary.trial_slot === sl).sort((a, b) => (b.summary.valid_trial - a.summary.valid_trial))[0];
            const cls = i === S.slotIndex ? 'active' : (t && t.summary.valid_trial ? 'done' : '');
            const time = t && Number.isFinite(t.summary.time_to_complete_s) ? t.summary.time_to_complete_s.toFixed(1) + 's' : '—';
            return '<div class="trial-chip ' + cls + '">' + label[sl] + '<span class="time">' + time + '</span></div>';
        }).join('');
    }

    function metricPanels(r) {
        const s = r.summary;
        return `
          <div class="panel"><h3>Stepping</h3><div class="metrics">
            ${metric('Avg step duration', fmt(s.avg_step_duration_s, 2, 's'))}
            ${metric('Step variability', fmt(s.step_variability_s, 2, 's'))}
            ${metric('Step duration CV', fmt(s.step_duration_cv_pct, 1, '%'))}
            ${metric('Double support', fmt(s.double_support_time_ratio_pct, 0, '%'))}
            ${metric('Hesitations', fmt(s.hesitation_count, 0))}
            ${metric('Sequence errors', fmt(s.sequence_error_count, 0))}
            ${metric('Extra contacts', fmt(s.extra_contact_count, 0))}
            ${metric('Line touches*', fmt(s.line_touch_count, 0))}
          </div><p class="hint">* experimental, low confidence from a 2D camera.</p></div>

          <div class="panel"><h3>Step symmetry &amp; length</h3><div class="metrics">
            ${metric('Step length (mean)', fmt(s.step_length_mean_m, 2, 'm'))}
            ${metric('Left', fmt(s.step_length_left_m, 2, 'm'))}
            ${metric('Right', fmt(s.step_length_right_m, 2, 'm'))}
            ${metric('Symmetry index', fmt(s.step_symmetry_index_pct, 1, '%'))}
            ${metric('Step width', fmt(s.step_width_mean_m, 2, 'm'))}
          </div></div>

          <div class="panel"><h3>Directional timing</h3><div class="metrics">
            ${metric('Clockwise (1–4)', fmt(s.clockwise_time_s, 2, 's'))}
            ${metric('Anticlockwise (5–8)', fmt(s.anticlockwise_time_s, 2, 's'))}
            ${metric('Phase ratio', fmt(s.phase_time_ratio, 2))}
            ${metric('Interlimb coord', fmt(s.interlimb_coordination_s, 2, 's'))}
          </div></div>

          <div class="panel"><h3>Stability &amp; trunk</h3><div class="metrics">
            ${metric('Peak trunk dev', fmt(s.peak_trunk_angle_deg, 1, '°'))}
            ${metric('Trunk ang vel', fmt(s.mean_trunk_angular_velocity_deg_s, 1, '°/s'))}
            ${metric('Near-fall*', s.near_fall_event ? 'YES' : 'no')}
            ${metric('Agility', '–')}
            ${metric('Stability', '–')}
            ${metric('Instability', '–')}
          </div><p class="hint">* experimental, unvalidated. Agility / stability / instability scores are reserved (no published definition).</p></div>`;
    }

    function stagesTable(r) {
        if (!r.stages.length) return '<p>No stages completed.</p>';
        const rows = r.stages.map(st => '<tr><td>' + st.stage + '</td><td>' + st.target_square + '</td><td>' + fmt(st.t_first_contact_s, 2) + '</td><td>' + fmt(st.t_second_contact_s, 2) + '</td><td>' + fmt(st.stage_duration_s, 2) + '</td><td>' + fmt(st.dwell_s, 2) + '</td><td>' + (st.line_touch ? '✓' : '') + '</td><td>' + (st.sequence_error ? '✓' : '') + '</td></tr>').join('');
        return '<div class="tablewrap"><table><thead><tr><th>Stage</th><th>Target</th><th>1st</th><th>2nd</th><th>Dur</th><th>Dwell</th><th>Line</th><th>Err</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function flagsHtml(flags) {
        if (!flags.length) return '<p class="good">No quality flags.</p>';
        return flags.map(fl => { const block = CONFIG.qc.blocking.includes(fl); return '<div class="flag' + (block ? ' block' : '') + '"><b>' + esc(fl) + '</b> — ' + esc(FLAG_INFO[fl] || '') + '</div>'; }).join('');
    }

    function drawCharts(r) {
        const map = $('#chMap'), tl = $('#chTime'), tr = $('#chTrunk');
        const dbg = r._debug;
        if (map) FSSTCharts.floorMap(map, r.contacts);
        if (tl) {
            const s = r.summary;
            const t0 = Number.isFinite(s.t_start_s) ? s.t_start_s : 0, t1 = Number.isFinite(s.t_stop_s) ? s.t_stop_s : (r.frames.length ? r.frames[r.frames.length - 1].t_s : 1);
            const ivals = { L: [], R: [] };
            for (const ep of dbg.episodes) ivals[ep.foot].push({ t0: ep.tOn, t1: ep.tOff });
            const stages = dbg.stageRecs.map(st => ({ stage: st.stage, t0: st.first.tOn, t1: st.second.tOn }));
            FSSTCharts.footTimeline(tl, { L: ivals.L, R: ivals.R, stages }, { tMin: Math.min(0, t0), tMax: t1 });
        }
        if (tr) {
            const t = r.frames.map(f => f.t_s), y = r.frames.map(f => f.trunk_dev_deg);
            FSSTCharts.line(tr, { t, series: [{ label: 'trunk dev (deg)', color: '#00d4ff', y }], hlines: [{ y: CONFIG.trunk.nearFallDevDeg, color: '#ff3b30' }], yLabel: 'deg' });
        }
    }

    function reVerdict() {
        const op = {
            valid: $('#ov_valid').checked, balanceLost: $('#ov_balance').checked, supportUsed: $('#ov_support').checked,
            notFacingForward: $('#ov_facing').checked, lineOrCaneContact: $('#ov_line').checked
        };
        S.operator = op;
        const s = S.result.summary;
        s.operator_valid = op.valid; s.operator_balance_lost = op.balanceLost; s.operator_support_used = op.supportUsed;
        s.operator_not_facing_forward = op.notFacingForward; s.operator_line_or_cane_contact = op.lineOrCaneContact;
        const opInvalid = op.balanceLost || op.supportUsed || op.notFacingForward || !op.valid;
        s.valid_trial = s.test_status === 'COMPLETED' && s.qc_pass && !opInvalid;
        storeTrial();
        // refresh group banner + strip without full re-render
        results();
    }

    function storeTrial() {
        const s = S.result.summary;
        S.trials = S.trials.filter(t => t.summary.session_id !== s.session_id);
        S.trials.push(S.result);
        FSSTExport.addHistory(s);
    }

    async function uploadSheets() {
        const st = $('#upst'); if (st) st.textContent = 'Google Sheets: uploading…';
        if (!S.participant.consent) { if (st) st.innerHTML = '<span class="warn">Not uploaded — no consent for this participant.</span>'; return; }
        const payload = FSSTExport.buildPayload(S.result, CONFIG);
        const res = await FSSTExport.sendToSheets(payload, CONFIG);
        if (!st) return;
        if (res.status === 'confirmed') st.innerHTML = '<span class="good">Saved to Google Sheets.</span>';
        else if (res.status === 'sent_unconfirmed') st.innerHTML = '<span class="warn">Sent (unconfirmed) — check the Sheet; resending is safe.</span>';
        else if (res.status === 'disabled') st.textContent = '';
        else { FSSTExport.queue(payload); st.innerHTML = '<span class="warn">Offline — queued in the outbox; will retry when online.</span>'; }
    }

    // ================================================================== TRIAL ORCHESTRATION
    function repeatTrial() {
        S.attemptInSlot++;
        S.repeatReason = S.result.summary.test_status === 'COMPLETED' ? 'operator' : S.result.summary.test_status.toLowerCase();
        offerRest(() => session());
    }
    function nextTrial() {
        if (S.slotIndex >= CONFIG.protocol.slots.length - 1) return;
        S.slotIndex++; S.attemptInSlot = 1; S.repeatReason = '';
        offerRest(() => session());
    }
    function newParticipant() {
        S.trials = []; S.slotIndex = 0; S.attemptInSlot = 1; S.repeatReason = ''; S.attemptGroupId = uuid();
        S.participant = null; S.videoOpened = false; S.lang = null; S.grid = null;
        entry();
    }

    function offerRest(next) {
        if (CONFIG.protocol.restS <= 0) { next(); return; }
        document.body.classList.remove('live');
        let n = CONFIG.protocol.restS;
        app.innerHTML = `<div class="screen center"><div class="panel brackets rest-panel">
          <h2>Rest</h2><p>Take a short rest before the next trial.</p>
          <div class="rest-count" id="rc">${n}</div>
          <div class="row"><button class="btn btn-primary" id="skip">Skip rest ▸</button></div>
        </div></div>`;
        const go = () => { stopTimers(); next(); };
        $('#skip').onclick = go;
        S.restTimer = setInterval(() => { n--; const rc = $('#rc'); if (rc) rc.textContent = n; if (n <= 0) go(); }, 1000);
    }

    // ================================================================== HISTORY
    function history() {
        stopAll(); document.body.classList.remove('live');
        const h = FSSTExport.getHistory(), out = FSSTExport.outboxCount();
        const cards = h.length ? h.map(s => `<div class="card"><b>${esc(s.participant_id || '?')}</b> · ${esc(s.trial_slot || '')} · ${s.test_status === 'COMPLETED' && Number.isFinite(s.time_to_complete_s) ? s.time_to_complete_s.toFixed(1) + ' s' : esc(s.test_status || '')} · ${esc((s.timestamp_utc || '').slice(0, 16).replace('T', ' '))}<br><span class="status">${esc(s.fall_risk_tier || '')} · ${esc(s.qc_pass ? 'QC pass' : 'review')}</span></div>`).join('') : '<p>No local history yet.</p>';
        app.innerHTML = `<div class="screen">
          <div class="center"><div class="logo" style="font-size:1.6rem">HISTORY</div></div>
          <div class="panel"><h3>Unsent data</h3><p>${out} trial(s) queued in the outbox.</p>
            <div class="row"><button class="btn" id="retry">Retry now</button><button class="btn btn-secondary" id="clear">Clear local history</button></div>
            <div class="status" id="rst"></div></div>
          <div class="panel"><h3>Local trials</h3><div class="hist">${cards}</div></div>
          <button class="btn btn-primary" id="back">◂ Back</button>
          ${footer()}
        </div>`;
        $('#back').onclick = entry;
        $('#retry').onclick = async () => { const st = $('#rst'); if (st) st.textContent = 'Flushing outbox…'; const r = await FSSTExport.flushOutbox(CONFIG); if (st) st.textContent = 'Sent ' + r.sent + ', ' + r.remaining + ' remaining.'; };
        $('#clear').onclick = () => { FSSTExport.clearHistory(); history(); };
    }

    // ------------------------------------------------------------------ orientation + lifecycle
    function checkOrientation() {
        const landscape = window.innerWidth > window.innerHeight;
        document.body.classList.toggle('landscape', landscape);
    }
    window.addEventListener('resize', () => { checkOrientation(); if (engine && engine.running) engine.draw(engine.lastFull); });
    window.addEventListener('orientationchange', checkOrientation);
    window.addEventListener('online', () => { if (CONFIG.sheets.webhookUrl) FSSTExport.flushOutbox(CONFIG); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && (S.step === 'test' || S.step === 'countdown')) { S.aborted = true; stopTimers(); if (S.step) setStep('align'); } });

    // best-effort portrait lock
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}

    checkOrientation();
    entry();
    if (CONFIG.sheets.webhookUrl) FSSTExport.flushOutbox(CONFIG);
})();
