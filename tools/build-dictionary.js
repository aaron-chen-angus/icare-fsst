/**
 * FSST//LAB — DATA_DICTIONARY.md generator (brief phase 7, requirement 20).
 *
 * Renders the data dictionary from js/schema.js and js/config.js so the dictionary can
 * never drift from the code. Generation FAILS if any field lacks a description.
 *
 * Node:    node tools/build-dictionary.js   (writes DATA_DICTIONARY.md)
 * Browser: open tools/dictionary.html, click Generate, download.
 *
 * Global namespace FSSTDictionary; Node-exportable via module.exports.
 */
(function (root) {
    'use strict';
    const isNode = typeof require === 'function' && typeof module !== 'undefined';

    function build(CONFIG, SCHEMA) {
        const L = [];
        L.push('# FSST//LAB — Data Dictionary');
        L.push('');
        L.push('_Generated from `js/schema.js` and `js/config.js` by `tools/build-dictionary.js`. Do not hand-edit._');
        L.push('');
        L.push('App version ' + CONFIG.app.version + ' · analysis ' + CONFIG.app.analysisVersion + ' · schema ' + CONFIG.app.schemaVersion + '.');
        L.push('');
        L.push('This is a screening and research tool, not a medical device. Status: **defined** (operationally specified), **assumed** (inferred — the original backend was never available), **reserved** (column kept null until a formula is supplied).');
        L.push('');

        const tables = [['Sessions', SCHEMA.sessions], ['Stages', SCHEMA.stages], ['Contacts', SCHEMA.contacts], ['Frames', SCHEMA.frames]];
        for (const [name, fields] of tables) {
            L.push('## ' + name);
            L.push('');
            L.push('| Field | Type | Unit | Status | Description | Calculation |');
            L.push('|---|---|---|---|---|---|');
            let lastGroup = null;
            for (const f of fields) {
                if (!f.desc || !String(f.desc).trim()) throw new Error('Dictionary generation failed: field "' + f.key + '" in ' + name + ' has no description.');
                if (f.group && f.group !== lastGroup) { L.push('| **' + mdCell(f.group) + '** | | | | | |'); lastGroup = f.group; }
                const tune = f.tune ? ' [TUNE]' : '';
                L.push('| `' + f.key + '` | ' + mdCell(f.type) + ' | ' + mdCell(f.unit) + ' | ' + f.status + tune + ' | ' + mdCell(f.desc) + ' | ' + mdCell(f.calc || '') + ' |');
            }
            L.push('');
        }

        // Landmarks
        L.push('## Tracked landmarks (MediaPipe Pose, 17 of 33)');
        L.push('');
        L.push('| Key | MediaPipe index | Name | Role |');
        L.push('|---|---|---|---|');
        for (const m of CONFIG.tracked) L.push('| `' + m.key + '` | ' + m.idx + ' | ' + mdCell(m.name) + ' | ' + mdCell(m.role) + ' |');
        L.push('');

        // QC flags
        L.push('## Quality-control flags');
        L.push('');
        L.push('Blocking flags set `qc_pass = false`.');
        L.push('');
        L.push('| Flag | Blocking |');
        L.push('|---|---|');
        const allFlags = ['LOW_FPS', 'LOW_VALID_FRAMES', 'TRACKING_GAPS', 'FOOT_OCCLUSION', 'NOT_IN_START_SQUARE', 'MOVED_BEFORE_GO', 'SEQUENCE_ERROR', 'INCOMPLETE_SEQUENCE', 'MANUAL_STOP', 'TIMEOUT', 'GRID_NOT_CONFIRMED', 'PROTOCOL_ADAPTATION_TAPE', 'GRID_USER_ADJUSTED', 'SCALE_ESTIMATED', 'SCALE_UNAVAILABLE', 'LINE_TOUCH_LOW_CONFIDENCE', 'HIGH_TRUNK_DEVIATION', 'PARTIAL_BODY_IN_FRAME', 'PRACTICE_TRIAL'];
        for (const fl of allFlags) L.push('| `' + fl + '` | ' + (CONFIG.qc.blocking.includes(fl) ? 'yes' : 'no') + ' |');
        L.push('');

        // Parameters
        L.push('## Parameters (from `js/config.js`)');
        L.push('');
        L.push('`[TUNE]` values are engineering defaults pending the Phase 8 validation pilot.');
        L.push('');
        L.push('| Parameter | Value |');
        L.push('|---|---|');
        const flat = flatten(paramGroups(CONFIG));
        for (const [k, v] of flat) L.push('| `' + k + '` | ' + mdCell(JSON.stringify(v)) + ' |');
        L.push('');

        // Clinical cut-offs
        L.push('## Fall-risk cut-offs [CLINICAL]');
        L.push('');
        L.push('Strict greater-than; classification only when a validated cut-off applies to the selected population and age. Sources in `docs/FSST_Clinical_Reference.md`.');
        L.push('');
        L.push('| Population | Cut-off (s) | Rule | Min age | Source |');
        L.push('|---|---|---|---|---|');
        const rc = CONFIG.protocol.riskCutoffs;
        for (const key of Object.keys(rc)) { const c = rc[key]; L.push('| `' + key + '` | ' + (c.cutoffS == null ? '—' : c.cutoffS) + ' | ' + c.rule + ' | ' + (c.minAge || 0) + ' | ' + mdCell(c.source) + ' |'); }
        L.push('');
        L.push('### Alternative published values (not used for classification)');
        L.push('');
        L.push('| Label | Value (s) | Source |');
        L.push('|---|---|---|');
        for (const a of CONFIG.protocol.alternativeCutoffs) L.push('| ' + mdCell(a.label) + ' | ' + a.cutoffS + ' | ' + mdCell(a.source) + ' |');
        L.push('');
        L.push('**Tape caveat.** The cut-offs were derived with canes laid on the floor. A flat tape cross removes the obstacle and may shorten times; `PROTOCOL_ADAPTATION_TAPE` is raised on every trial.');
        L.push('');

        return L.join('\n');
    }

    function mdCell(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
    function paramGroups(CONFIG) { return { signal: CONFIG.signal, contacts: CONFIG.contacts, geometry: CONFIG.geometry, trunk: CONFIG.trunk, qc: { minEffectiveFps: CONFIG.qc.minEffectiveFps, minValidFramePct: CONFIG.qc.minValidFramePct, maxImputedPct: CONFIG.qc.maxImputedPct, maxLongestGapS: CONFIG.qc.maxLongestGapS, maxFootOcclusionPct: CONFIG.qc.maxFootOcclusionPct }, protocol: { sequence: CONFIG.protocol.sequence, countdownS: CONFIG.protocol.countdownS, preRollS: CONFIG.protocol.preRollS, tailS: CONFIG.protocol.tailS, maxTrialS: CONFIG.protocol.maxTrialS, restS: CONFIG.protocol.restS, hesitationS: CONFIG.protocol.hesitationS, maxRepeatsPerSlot: CONFIG.protocol.maxRepeatsPerSlot, headlineBasis: CONFIG.protocol.headlineBasis }, anthropometry: CONFIG.anthropometry }; }
    function flatten(obj, prefix) {
        const out = [];
        for (const k of Object.keys(obj)) {
            const key = prefix ? prefix + '.' + k : k, v = obj[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, key));
            else out.push([key, v]);
        }
        return out;
    }

    const api = { build };
    root.FSSTDictionary = api;
    if (typeof module !== 'undefined') module.exports = api;

    if (isNode && require.main === module) {
        const CONFIG = require('../js/config.js'), SCHEMA = require('../js/schema.js'), fs = require('fs'), path = require('path');
        const md = build(CONFIG, SCHEMA);
        fs.writeFileSync(path.join(__dirname, '..', 'DATA_DICTIONARY.md'), md);
        console.log('Wrote DATA_DICTIONARY.md (' + md.length + ' bytes).');
    }
})(typeof window !== 'undefined' ? window : globalThis);
