# FSST//LAB — Four Square Step Test Biomechanics Lab
### Clinical, Scientific and Technical Manual

A browser-based, computer-vision implementation of the **Four Square Step Test (FSST)**. It runs
entirely on the device using Google MediaPipe Pose — **no build step, no package manager, no
server-side analysis**. Video never leaves the device and is never stored; only derived numeric
results are kept locally and, with explicit consent, uploaded to a Google Sheet.

| | |
|---|---|
| **Live app** | https://aaron-chen-angus.github.io/icare-fsst/ |
| **Live results (Google Sheet)** | https://docs.google.com/spreadsheets/d/1J82ZEGGSQVQdTEJL_uldu6few7CDFZLvov8DNwEZ7z4/ |
| **Version** | App 1.0.0 · Analysis 1.0.0 · Schema 1.0 |

> ### ⚠️ Intended use
> **FSST//LAB is a screening and research tool, not a medical device.** It has not been cleared or
> approved by any regulator. The published FSST fall-risk cut-offs were derived using **canes/rods
> laid on the floor as low obstacles**; this app uses a **flat tape cross**, which removes the
> obstacle and may shorten times relative to the validation cohorts. Every classification must be
> read as a screening indicator, interpreted by a qualified clinician, and never used alone for
> diagnosis. Camera-based timing has not yet been validated against manual stopwatch timing in this
> implementation (see §9, Validation).

---

## Table of contents

1. [Clinical background](#1-clinical-background)
2. [The test protocol](#2-the-test-protocol)
3. [Fall-risk cut-offs and the evidence](#3-fall-risk-cut-offs-and-the-evidence)
4. [How the computer vision works](#4-how-the-computer-vision-works)
5. [The analysis pipeline, step by step](#5-the-analysis-pipeline-step-by-step)
6. [Metrics: definitions and derivation](#6-metrics-definitions-and-derivation)
7. [Data dictionary and data model](#7-data-dictionary-and-data-model)
8. [Software architecture](#8-software-architecture)
9. [Quality control, validity and validation](#9-quality-control-validity-and-validation)
10. [Operator manual](#10-operator-manual)
11. [Deployment and Google Sheets](#11-deployment-and-google-sheets)
12. [Privacy, consent and data governance](#12-privacy-consent-and-data-governance)
13. [Testing](#13-testing)
14. [Limitations](#14-limitations)
15. [Glossary](#15-glossary)
16. [References](#16-references)

---

## 1. Clinical background

The Four Square Step Test (FSST) is a clinical measure of **dynamic standing balance and the
ability to change direction rapidly while stepping over low objects**. It was introduced by Dite
and Temple (2002) as a quick test that challenges stepping in four directions (forward, backward,
and to each side) and was shown to discriminate multiple-fall older adults from non-multiple
fallers. Because falls in older adults and in several neurological and vestibular populations are
strongly associated with impaired rapid stepping and change-of-direction control, the FSST has
been adopted across many populations and is catalogued by the Shirley Ryan AbilityLab
Rehabilitation Measures Database and summarised by Physiopedia.

The test is attractive clinically because it is **fast (minutes), needs minimal equipment, and has
high reliability**. Reported reliability is excellent: test–retest ICC 0.98 and inter-rater ICC
0.99 in community-dwelling older adults (Dite & Temple, 2002); test–retest ICC 0.93 in vestibular
disorders (per Physiopedia); and across populations a systematic review reported inter-rater ICC
0.86–0.99 and test–retest ICC 0.73–0.98 (Moore & Barker, 2017). These values describe the manual,
stopwatch-timed test. **A camera-based version requires its own validation** (see §9).

FSST//LAB reproduces the clinical construct — timed four-direction stepping around a cross — and
adds objective, frame-by-frame biomechanical measurement of stepping behaviour that a stopwatch
cannot capture (step durations, variability, directional timing, double support, trunk sway). It
replaces a previous IntelliCARE Flutter prototype whose biomechanics were computed by an
undisclosed server-side component; that logic has been **re-specified and re-implemented in the
browser** and is documented in full here and in `DATA_DICTIONARY.md`.

---

## 2. The test protocol

**Equipment (classical).** Four canes/rods ~100 cm long and ~2.5 cm in diameter arranged in a
cross on the floor, plus a stopwatch. The literature does not standardise square size (Physiopedia;
SRA Lab instructions).

**Equipment (this app).** A **flat tape cross** of two crossing lines forming four equal arms, each
square large enough to hold both feet. The flat cross is a deliberate adaptation for safety and
reproducibility; its consequences are flagged on every trial (`PROTOCOL_ADAPTATION_TAPE`) and
discussed in §14. The app works **without any floor dimension**; if the operator measures one arm
(centre to tip) it is used to express distances in metres (see §6.4).

**Start position.** The participant stands in **square 1** facing **square 2**. On screen (rear
camera, in front of the participant), square 1 is the far-right square.

**Stepping sequence (8 stages, both feet into every square):**

```
          FAR (away from camera)
        +---------+---------+
        |    4    |    1    |   1 = start, facing 2
        +---------+---------+
        |    3    |    2    |
        +---------+---------+
          NEAR (camera side)

Sequence:  2 → 3 → 4 → 1   (clockwise lap)   then   4 → 3 → 2 → 1   (counter-clockwise lap)
Stage:     1   2   3   4                              5   6   7   8
```

**Instruction.** Move as fast as possible without touching the lines; both feet touch the floor in
every square; face forward throughout (SRA Lab; Physiopedia).

**Timing.** The clock **starts when the first foot contacts the floor in square 2** and **stops
when the last foot returns to the floor in square 1** (SRA Lab; Physiopedia).

**Trials.** One **practice** trial, then **two timed** trials; the **fastest timed trial** is the
clinical score (SRA Lab; Physiopedia). FSST//LAB records all three and reports both the author's
chosen headline (**best of all valid attempts**) and the **protocol score** (best of the two timed
trials) alongside it (§6.1).

**Repeat criteria.** A trial is repeated if the participant fails to complete the sequence, loses
balance, or touches a cane (SRA Lab; Physiopedia). In FSST//LAB these are captured as an **operator
verdict** and as metrics; the software never silently discards a trial.

---

## 3. Fall-risk cut-offs and the evidence

FSST//LAB classifies fall risk **only when a validated cut-off applies to the selected population
and age**, using a **strict greater-than** comparison. Values and the mapping to the `population`
field are below. Full provenance and caveats are in `docs/FSST_Clinical_Reference.md`.

| Population (`population` value) | Cut-off | Tier logic | Primary source (as summarised by SRA Lab / Physiopedia / Moore & Barker, 2017) |
|---|---|---|---|
| Community-dwelling older adults, ≥ 65 (`older_adult_community`) | **> 15 s** | > cut-off ⇒ Elevated | Dite & Temple (2002); the 15 s cut-off reaffirmed by Cleary & Skornyakov (2017) |
| Vestibular disorders (`vestibular`) | **> 12 s** | > cut-off ⇒ Elevated | Whitney et al. (2007) |
| Unilateral transtibial amputation (`amputation_transtibial`) | **> 24 s** | > cut-off ⇒ Elevated | Dite et al. (2007) |
| Parkinson's disease (`parkinson`) | **> 9.68 s** | > cut-off ⇒ Elevated | Duncan & Earhart (2013) |
| Acute stroke (`stroke_acute`) | **failed attempt or > 15 s** | fail or > cut-off ⇒ Elevated | Blennerhassett & Jayalath (2008) |
| Other / healthy / under 65 (`other_none`) | none | Not classified | No validated cut-off |

**Classification rules.**
- `fall_risk_tier` is `ELEVATED` (time strictly greater than the cut-off), `LOWER` (time at or below
  the cut-off), or `NOT_CLASSIFIED`.
- Reasons for `NOT_CLASSIFIED`: `NO_VALIDATED_CUTOFF` (population has no cut-off), `AGE_BELOW_COHORT`
  (older-adult cut-off selected but age < 65), `INVALID_TRIAL` (no valid completed time).
- The population, cut-off value, rule and literature source are written to **every row**
  (`risk_population`, `risk_cutoff_s`, `risk_rule`, `risk_cutoff_source`) so a reviewer can audit the
  classification.

**Reported but NOT used for classification** (shown in the data dictionary for context): 10.14 s on
a hard surface and 11.21 s on foam for older adults (Mathurapongsakul & Siriphorn, 2018; the SRA Lab
page notes inconsistent sensitivity/specificity in that paper); 11 s to distinguish chronic stroke
from healthy controls (Goh et al., 2013 — a discrimination threshold, not a fall-risk cut-off).

**Evidence-access caveat.** The cut-offs above are taken as reported by the SRA Lab summary,
Physiopedia, the Moore and Barker (2017) systematic review, and a Springer review's reference
annotations; several primary papers were paywalled or access-blocked at compilation time and were
not read in full. Verify each value against the primary paper before clinical or publication use.
*Content was rephrased for compliance with licensing restrictions.*

---

## 4. How the computer vision works

### 4.1 Pose estimation
FSST//LAB uses the **MediaPipe Pose Landmarker** (`@mediapipe/tasks-vision` 0.10.18) running
on-device via WebAssembly/WebGL. Each video frame yields up to 33 body landmarks in normalised
image coordinates (x, y ∈ [0, 1], plus a depth estimate z and a visibility score), and a parallel
set of metric "world" landmarks. The app records **17 landmarks** relevant to stepping and trunk
posture (nose; shoulders; elbows; wrists; hips; knees; ankles; heels; foot indices/toes). Model
options: `lite` (fastest), `full` (default), `heavy` (most accurate), float16, single pose,
detection/presence/tracking confidence 0.5, GPU delegate with CPU fallback.

Frames are timestamped from `requestVideoFrameCallback` (capture time where available) so the time
base follows the camera, not the render loop.

### 4.2 Why a floor homography, not raw landmarks
The camera views the participant **frontally**, and depth along the camera axis is MediaPipe's
weakest dimension. Foot *positions on the floor* are therefore **not** read from landmark z. Instead
the operator aligns an on-screen grid to the four tape arm-tips, defining four image points whose
floor coordinates are known. From these four correspondences the app computes a **planar homography**
(a projective 2-D transform) that maps any image point to **floor "unit-grid" coordinates (u, v)**,
where **one unit = one arm length**:

```
T (far)   → (0, +1)
R (right) → (+1, 0)
B (near)  → (0, −1)
L (left)  → (−1, 0)      u → screen-right, v → away from camera
```

Squares are then simple sign tests on (u, v): square 1 = (u>0, v>0), 2 = (u>0, v<0), 3 = (u<0, v<0),
4 = (u<0, v>0). A tolerance band around the axes (`lineBandRel`) means a foot on a tape line matches
**both** neighbouring squares, so stepping on a line never creates a false sequence error. The
homography is solved by a 4-point Direct Linear Transform with Gaussian elimination (no external
libraries).

### 4.3 Why contact is detected from motion, not position
An airborne foot projects to the wrong floor point, so a position-only rule would misassign swing
frames. FSST//LAB detects **foot–floor contact from stillness**: it computes each foot's image
speed, **normalises it by the participant's shank length in pixels** (so the threshold is
scale- and distance-independent, expressed in *shank-lengths per second*), and applies a **two-level
hysteresis** state machine (grounded below `vOnShankS`, swing above `vOffShankS`). Episodes shorter
than `minContactS` are dropped and episodes separated by less than `mergeGapS` are merged. Each
contact episode stores its onset/offset time, median floor (u, v), square, on-line flag and mean
visibility.

### 4.4 Responsive overlay
A single mapping (`videoToCanvas`) converts normalised video coordinates to canvas pixels, honouring
`object-fit: contain`, CSS element size and `devicePixelRatio`, and recomputes on resize and
orientation change. The grid, skeleton and foot-state rings all use it, so the overlay stays
registered with the live video on any screen. The preview is **never mirrored** — all geometry is
defined in raw image space.

---

## 5. The analysis pipeline, step by step

All metrics are computed **offline** from the buffered landmark frames after the trial ends; this
offline result is authoritative. A causal (live) tracker drives the on-screen HUD only.

1. **Buffering.** From GO, every pose frame is stored, plus a 1.0 s pre-roll (baseline trunk,
   movement-before-GO check) and a 1.0 s tail.
2. **Resampling.** Each landmark coordinate is resampled onto a uniform **30 Hz** grid by linear
   interpolation; gaps longer than `maxGapS` (0.25 s) are flagged and bridged.
3. **Filtering.** A **zero-phase (forward–backward) 2nd-order Butterworth low-pass** is applied
   (effective cutoff **8 Hz for feet**, **6 Hz for trunk**) with reflection padding, so there is no
   phase lag and therefore no timing bias.
4. **Foot points & floor coordinates.** The foot point is the mean of heel and toe in the image
   (falling back to a single visible marker, else the ankle); it is mapped to floor (u, v) by the
   homography. Per-leg shank length (knee–ankle, px) is tracked for speed normalisation.
5. **Contact detection.** Shank-normalised speed + hysteresis (§4.3) yields contact episodes.
6. **Square assignment.** Each episode is assigned to a square (0 = outside) with the line band.
7. **Start/stop.** `t_start` = first contact in square 2 after GO; `t_stop` = the moment **both feet**
   are back in square 1 at the end of the lap, detected from the actual path (robust to imperfect
   intermediate steps). Manual stop and timeout always yield a recorded time where one can be derived.
8. **Stage reconstruction.** A **lead-foot** state machine registers each of the 8 stages as the
   first foot reaches the next expected square (the trailing foot is captured if present but not
   required), tolerant to occlusion. Wrong-square contacts are counted as sequence errors for
   reporting but never stall the sequence.
9. **Metrics, trunk, QC, classification** (§6, §9) are computed and written to the schema.

**Leniency by design.** Protocol violations (wrong square, line touch, imperfect order, not facing
forward) are **recorded as metrics/flags but never block a time**. Only genuine measurement failures
(very low frame rate, severe tracking loss, foot occlusion, or no derivable start/stop) prevent a
result. The operator verdict is the final arbiter of clinical validity.

---

## 6. Metrics: definitions and derivation

Times are seconds from GO. Floor distances are in **arm lengths** internally and converted to metres
only when a scale is available (§6.4). Symbols: `D_k` = stage duration; `first[k]` / `second[k]` =
first/second foot contact times of stage *k*.

### 6.1 Primary timing
| Metric | Definition |
|---|---|
| `time_to_complete_s` | `t_stop − t_start` (first contact in square 2 to last-foot return to square 1). |
| `t_start_s`, `t_stop_s` | The start/stop instants above (seconds from GO). |
| `live_time_s`, `time_difference_s` | Causal on-screen time and its difference from the offline value (audit of live display). |
| **BEST (all)** | Minimum `time_to_complete_s` over all **valid** attempts (headline, operator's choice). |
| **Protocol score** | Minimum over valid **timed** trials only (SRA Lab protocol); shown alongside BEST. |

### 6.2 Stepping (temporal)
| Metric | Definition |
|---|---|
| `avg_step_duration_s` | Mean of stage durations `D_k` (robust fallback: inter-contact intervals when stages are sparse). |
| `step_variability_s` | Sample SD (n−1) of stage durations. |
| `step_duration_cv_pct` | 100 × SD / mean (pacing consistency). |
| `double_support_time_ratio_pct` | Share of `[t_start, t_stop]` with both feet grounded. |
| `interlimb_coordination_s` | Mean per-stage lag between first and second foot contact. **[assumed]** |
| `hesitation_count` | Intervals of double support longer than `hesitationS` (0.6 s). **[TUNE]** |
| `sequence_error_count` | Contacts in a square that is neither target nor previous. |
| `extra_contact_count` | Extra adjustment contacts within the target/previous square. |

### 6.3 Directional timing **[assumed split point]**
| Metric | Definition |
|---|---|
| `clockwise_time_s` | `t_start` to the mid-lap return to square 1 (after squares 2→3→4). |
| `anticlockwise_time_s` | Mid-lap return to `t_stop`. |
| `phase_time_ratio` | `anticlockwise_time_s / clockwise_time_s` (directional asymmetry). |

### 6.4 Spatial (scale-dependent)
Distances are computed in arm lengths; conversion to metres uses `arm_length_cm` from one of three
tiers (brief §7.3):
1. **`OPERATOR_ENTERED`** — the operator measured one tape arm.
2. **`BODY_ESTIMATED`** — estimated from the participant's standing height and shank length in
   pixels (shank ≈ 0.246 × height; Winter, 2009), using the floor geometry during the start hold.
   Flag `SCALE_ESTIMATED`; metre values are approximate.
3. **`NONE`** — no usable estimate; all `*_m` values are null (flag `SCALE_UNAVAILABLE`). **Times,
   counts, ratios and the symmetry index are never affected by scale.**

| Metric | Definition |
|---|---|
| `step_length_mean_m` / `_left_m` / `_right_m` | Mean per-foot distance between consecutive contacts (overall / left / right). |
| `step_symmetry_index_pct` | 100 × |L − R| / (0.5 × (L + R)) (Robinson index; scale-free). |
| `step_width_mean_m` | Mean inter-foot distance at double support per stage. **[assumed]** |
| `line_touch_count` | Contacts on a tape line. **Low confidence from a 2-D camera** (a foot above a line looks the same); flagged when visibility is low. |

### 6.5 Trunk & stability (frontal plane, 2-D)
| Metric | Definition |
|---|---|
| `peak_trunk_angle_deg` | Peak absolute lateral trunk deviation from the pre-roll baseline (angle of the mid-shoulder-to-mid-hip vector). **[assumed]** |
| `mean_trunk_angular_velocity_deg_s` | Mean absolute trunk angular velocity over the timed window. **[assumed]** |
| `near_fall_event` | **Experimental, unvalidated**: a large trunk deviation coincident with an extra contact or sequence error. |
| `agility_score`, `stability_score`, `instability_score` | **Reserved, always null.** The original backend that produced them was never available and no published formula exists, so the app does not invent values. |

Forward/sagittal trunk lean is **not** measured — a frontal camera cannot resolve it reliably.

---

## 7. Data dictionary and data model

The schema in `js/schema.js` is the **single source of truth**. CSV/ZIP/Sheets columns and
`DATA_DICTIONARY.md` are all generated from it, so documentation cannot drift from the code. The
analysis refuses to emit an undocumented field, and dictionary generation fails if any field lacks a
description. Each field carries a **status**: `defined` (operationally specified here), `assumed`
(inferred because the original backend was unavailable), or `reserved` (null pending a formula).

**Four tables, keyed by `session_id` (one UUID per trial):**

- **Sessions** — one row per trial (104 fields): participant and device metadata; protocol and
  consent flags; grid handles and scale tier; status; primary timing; stepping, symmetry, directional
  and trunk metrics; QC fields; operator verdict.
- **Stages** — eight rows per trial: per-stage target square, lead foot, first/second contact times,
  duration, dwell, inter-limb lag, lead/trail floor positions, step lengths, line touch, sequence
  error, hesitation.
- **Contacts** — one row per detected foot-contact episode: foot, stage, square, on/off times,
  duration, floor (u, v), on-line, extra, error, mean visibility.
- **Frames** *(optional, off by default)* — the analysed 30 Hz series: per-foot (u, v), shank-speed
  and grounded flags, trunk deviation and angular velocity. Uploaded only if `uploadFrames` is true.

**ZIP export** (one click, local): `*_summary.csv`, `*_stages.csv`, `*_contacts.csv`,
`*_frames_analysis.csv`, `*_frames_raw.csv` (raw landmark frames: normalised x/y/z/visibility and
world x/y/z per marker), and a `*_session.json` with the full parameter snapshot.

The complete field-by-field dictionary — with units, status, calculation, the 17 landmarks, every QC
flag, all parameters, and the clinical cut-off table — is in **`DATA_DICTIONARY.md`**, regenerated by
`node tools/build-dictionary.js` or `tools/dictionary.html`.

---

## 8. Software architecture

Plain `<script>` tags, one global namespace per module, no build step, no dependencies beyond the
MediaPipe CDN, Google Fonts, YouTube embeds and the configured Apps Script webhook. Core modules are
also `module.exports`-compatible so they can be unit-tested outside the browser.

```
index.html              app shell + script order
css/styles.css          TRON theme + FSST components (fluid, portrait-first, 100dvh, safe-area)
js/config.js            all tunables, protocol, cut-offs, tracked landmarks, webhook  (CONFIG)
js/schema.js            single source of truth for every output field                 (SCHEMA)
js/geometry.js          grid preset, 4-point homography, square membership, mapping    (FSSTGeometry)
js/analysis.js          authoritative offline analysis                                (FSSTAnalysis)
js/live.js              causal live tracking for the HUD                              (FSSTLive)
js/pose-engine.js       MediaPipe camera + skeleton + grid overlay (never mirrors)     (PoseEngine)
js/export.js            CSV / ZIP (store) / Sheets / history / outbox                 (FSSTExport)
js/charts.js            floor-path map, foot timeline, trunk-deviation chart           (FSSTCharts)
js/app.js               screen flow, trial orchestration, results UI
tests/synth.js          synthetic ground-truth generator
tests/run.js            cases A–U (Node + browser)
tests/index.html        browser test runner
tools/build-dictionary.js   DATA_DICTIONARY.md generator (Node + browser)
tools/dictionary.html   browser dictionary generator
apps-script/Code.gs     Google Sheets receiver (service: fsst-lab)
DATA_DICTIONARY.md      generated; do not hand-edit
docs/                   clinical reference, code assessment, original brief (read-only)
reference/              STS//LAB and Flutter sources (read-only)
```

Screen flow: `entry → align → countdown → test → analysing → results → (rest) → next trial … →
history`.

---

## 9. Quality control, validity and validation

### 9.1 QC flags
Each trial is screened; **blocking** flags set `qc_pass = false`. Blocking flags are limited to
genuine measurement failures: `LOW_FPS` (< 15 fps), `LOW_VALID_FRAMES` (< 90 % of frames with the
lower-body landmarks all valid), `TRACKING_GAPS` (> 10 % imputed or a gap > 0.5 s), `FOOT_OCCLUSION`
(a foot hidden > 20 % of the trial), and `NO_TIME_CAPTURED` (no derivable start/stop). Non-blocking,
informational flags include `PROTOCOL_ADAPTATION_TAPE` (always, the tape caveat), `SEQUENCE_ERROR`,
`INCOMPLETE_SEQUENCE`, `MOVED_BEFORE_GO`, `NOT_IN_START_SQUARE`, `SCALE_ESTIMATED` /
`SCALE_UNAVAILABLE`, `LINE_TOUCH_LOW_CONFIDENCE`, `HIGH_TRUNK_DEVIATION`, `PARTIAL_BODY_IN_FRAME`,
`PRACTICE_TRIAL`.

### 9.2 Validity
A trial is **valid** (counts toward BEST) when `test_status = COMPLETED`, `qc_pass` is true, and the
operator verdict does not mark it invalid (balance lost / support used / not facing forward). A line
touch alone does **not** invalidate a tape trial — the published criterion concerns **cane** contact.

### 9.3 Validation status and plan
Camera timing agreement with manual timing in this implementation is **unproven**. A pilot should:
collect ≥ 10 trials across ≥ 3 phone models (healthy volunteers first, with a spotter); film each
trial from the side in slow motion as a reference; step through frame by frame to log the first-foot
touch in square 2 and the last-foot touch in square 1; compute **bias** (mean app − manual),
**SD of differences**, and the **largest absolute difference**; set a clinically acceptable agreement
limit; and tune only `[TUNE]` values (e.g. `contacts.onsetBiasS`, `vOnShankS`, `vOffShankS`,
`minContactS`) with that evidence. After tuning, re-run the unit tests and ≥ 5 trials, bump
`analysisVersion`, and regenerate the dictionary.

**Agreement limit (set by the author before the pilot):** _TBD._
**Pilot results:** _TBD — paste the summary table here after the pilot._

---

## 10. Operator manual

**The tape cross.** On a flat, non-slip floor, lay two crossing tape lines forming four equal arms.
Each square must hold both feet. Use the **same size for every participant**; if you measure one arm
(centre to tip), enter it in the form for metre values. A smaller cross is harder.

**Phone placement.** Upright (portrait) on a stable support, rear camera, **in front of** the cross,
centred on it. Move it back until the tape matches the on-screen grid, then adjust height. Do not
hand-hold. Use the default 1× rear lens (no ultra-wide, no zoom).

**Running a session.**
1. On the entry screen, complete the participant form, pick a language and watch the demo, tick the
   two required safety/setup boxes (and the consent box to allow upload), then **PROCEED**.
2. On the **align** screen, drag the four handles onto the tape arm-tips and tap **Grid matches
   tape**. Wait for **READY** (whole body visible, both feet in square 1).
3. **Start trial** → 3-2-1-GO. The participant steps 2→3→4→1→4→3→2→1. The timer starts on the first
   step into square 2 and **auto-stops** when both feet return to square 1. **Stop (safety)** ends it
   at any time and still records the elapsed time.
4. Review results, set the **operator verdict**, download the ZIP and/or let it upload.
5. **Rest** (skippable), then the next trial. Run practice + two timed trials.

**Scores.** The headline is **BEST** (fastest valid of all three). The **protocol score** (fastest of
the two timed trials) is shown alongside — this is the published clinical score.

**Safety.** FSST is a fall-risk test. Keep a spotter within arm's reach for anyone at risk. Use
**Unable to perform test** to record a `CANNOT_DO` entry with no time.

---

## 11. Deployment and Google Sheets

### 11.1 What is already configured
- `js/config.js → CONFIG.sheets.webhookUrl` is set to the deployed FSST-LAB web app:
  `https://script.google.com/macros/s/AKfycbwTcWdpPD1oywKDS7nnBFBhmXePFxm7RMK89KhVLjikDQhj4VOfivRlDv3lxVaD1vRS3g/exec`
- Because a webhook is configured, the **consent checkbox** appears on the entry screen and uploads
  run only for consented trials.

### 11.2 Update the repo and deploy to GitHub Pages
1. Commit the changed files:
   ```
   git add js/config.js README.md DATA_DICTIONARY.md
   git commit -m "Configure FSST-LAB Google Sheets webhook; manual-grade README"
   git push
   ```
   (If you also changed analysis/UI since the last push, add `js/analysis.js js/app.js css/styles.css`
   and `tests/` as needed.)
2. In GitHub: **Settings → Pages → Deploy from a branch → `main` / root**. Wait ~1 minute.
3. Open the app on a phone: **https://aaron-chen-angus.github.io/icare-fsst/** and **hard-refresh**
   (or clear site data) so the new `config.js` loads.

### 11.3 Verify the webhook
- Open the `/exec` URL in a browser tab — it must return JSON containing `"status":"active"` and
  `"service":"fsst-lab"`.
- Run one trial with the **consent box ticked**. The tabs **Sessions**, **Stages** and **Contacts**
  appear automatically in the Sheet. Press upload again → **duplicate**, no new rows (de-duplicated
  by `session_id`). Turn on airplane mode, finish a trial, turn it off → the local **outbox** sends it.
- **Live results:** https://docs.google.com/spreadsheets/d/1J82ZEGGSQVQdTEJL_uldu6few7CDFZLvov8DNwEZ7z4/

### 11.4 Group scores in the Sheet (derived, not stored)
```
BEST (all valid):   =MINIFS(Sessions!<time>, Sessions!<attempt_group_id>, X, Sessions!<valid_trial>, TRUE)
Protocol score:     add  , Sessions!<is_practice>, FALSE
```

### 11.5 If you change `Code.gs`
Re-deploy: **Deploy → Manage deployments → Edit → New version**, so the live `/exec` URL serves the
new code. Never put the webhook URL in a public screenshot — anyone with it can write to the Sheet;
keep identifiable data out of `participant_id`.

---

## 12. Privacy, consent and data governance

- **No video or audio is ever recorded or transmitted.** Pose estimation runs on-device; frames are
  held in memory only for the trial and discarded.
- **Raw landmark frames** stay in the local ZIP; they are uploaded to the Sheet only if `uploadFrames`
  is explicitly enabled.
- **Upload requires consent.** With no consent, nothing leaves the device.
- `participant_id` must be **pseudonymous** — never enter real names or other identifiers; the Apps
  Script also guards against spreadsheet formula injection.
- Local history and the retry outbox hold **summaries only** in `localStorage`.
- If you collect data from participants, use consent wording approved by your ethics/IRB process.

---

## 13. Testing

- **Browser:** open `tests/index.html` — all cases **A–U** must show PASS.
- **Node (optional):** `node tests/run.js`.

The suite builds synthetic sessions from scripted stepping (minimum-jerk swings projected through the
inverse homography) and asserts timing accuracy, sequence-error and incomplete handling, hesitation,
occlusion/low-fps/tracking-gap QC, the three scale tiers, trunk/near-fall, every fall-risk boundary,
best-of logic, exact schema conformance, dictionary completeness, and the lenient
completion/manual-stop behaviour.

> This project was developed on a workstation **without a standalone Node install** (institutional
> restriction). The suite was executed with the Node runtime embedded in the Kiro/VS Code application
> (`ELECTRON_RUN_AS_NODE=1 "<Kiro>\Kiro.exe" tests/run.js`), which reported **51/51 assertions
> passing**. `node tests/run.js` is equivalent where Node is available.

Regenerate `DATA_DICTIONARY.md` after any schema/config change.

---

## 14. Limitations

- **Tape, not canes.** The flat cross removes the obstacle of the classical test and may shorten times
  relative to the validation cohorts; `PROTOCOL_ADAPTATION_TAPE` is raised on every trial and the
  caveat is printed on the results screen. Interpret tiers as screening only.
- **Practice in best-of-3.** The headline BEST may include the practice trial; the published protocol
  scores the best of two timed trials, which the app also shows.
- **Frontal 2-D camera.** Floor positions come from the homography; forward trunk lean, line contact
  and cane contact cannot be confirmed reliably from the front. The far foot is often occluded by the
  near foot — hence visibility gating and QC flags.
- **Assumed/experimental metrics.** Items marked `[assumed]` (directional split, step width,
  inter-limb coordination, trunk measures) are inferred, not validated; `line_touch_count` and
  `near_fall_event` are experimental. `agility_score`, `stability_score`, `instability_score` are
  reserved (null) — no published definition.
- **Unvalidated thresholds.** All `[TUNE]` values are engineering defaults pending the Phase 8 pilot.
- **Camera timing resolution.** At ~30 fps, foot-contact timing has ~33 ms resolution plus detector
  latency; agreement with manual timing is unproven until the pilot.

**This is a screening and research tool, not a medical device.**

---

## 15. Glossary

- **Arm tip** — the end of one tape line (one of the four grid handles).
- **Unit grid** — floor coordinate system where one unit = one arm length; squares are sign regions
  of (u, v).
- **Contact episode** — a continuous interval during which a foot is detected as grounded.
- **Stage** — one of the eight target-square moves in the sequence.
- **Trial slot** — PRACTICE, TIMED_1 or TIMED_2.
- **Attempt group** — the practice + two timed trials of one participant session (shared
  `attempt_group_id`).
- **Valid trial** — a completed trial that passed QC and was not invalidated by the operator.
- **BEST (all)** — fastest valid time across all attempts (headline).
- **Protocol score** — fastest valid time of the two timed trials (SRA Lab clinical score).

---

## 16. References

### Peer-reviewed and clinical sources (APA 7)

Blennerhassett, J. M., & Jayalath, V. M. (2008). The Four Square Step Test is a feasible and valid
clinical test of dynamic standing balance for use in ambulant people poststroke. *Archives of
Physical Medicine and Rehabilitation, 89*(11), 2156–2161. https://doi.org/10.1016/j.apmr.2008.05.012

Cleary, K., & Skornyakov, E. (2017). Predicting falls in community dwelling older adults using the
Four Square Step Test. *Physiotherapy Theory and Practice, 33*(10), 766–771.
https://doi.org/10.1080/09593985.2017.1354951

Dite, W., & Temple, V. A. (2002). A clinical test of stepping and change of direction to identify
multiple falling older adults. *Archives of Physical Medicine and Rehabilitation, 83*(11),
1566–1571. https://doi.org/10.1053/apmr.2002.35469

Dite, W., Connor, H. J., & Curtis, H. C. (2007). Clinical identification of multiple fall risk early
after unilateral transtibial amputation. *Archives of Physical Medicine and Rehabilitation, 88*(1),
109–114. https://doi.org/10.1016/j.apmr.2006.10.015

Duncan, R. P., & Earhart, G. M. (2013). Four Square Step Test performance in people with Parkinson
disease. *Journal of Neurologic Physical Therapy, 37*(1), 2–8.
https://doi.org/10.1097/NPT.0b013e31827f0d7a

Goh, E.-Y., Chua, S.-Y., Hong, S.-J., & Ng, S.-S. (2013). Reliability and concurrent validity of the
Four Square Step Test in chronic stroke. (As summarised by Moore & Barker, 2017.)

Mathurapongsakul, P., & Siriphorn, A. (2018). Four Square Step Test with foam is more accurate than
those without foam for discriminating faller from non-faller older adults. *Topics in Geriatric
Rehabilitation, 34*(4), 231–237. https://doi.org/10.1097/TGR.0000000000000199

Moore, M., & Barker, K. (2017). The validity and reliability of the Four Square Step Test in
different adult populations: A systematic review. *Systematic Reviews, 6*, 187.
https://doi.org/10.1186/s13643-017-0577-5

Whitney, S. L., Marchetti, G. F., Morris, L. O., & Sparto, P. J. (2007). The reliability and validity
of the Four Square Step Test for people with balance deficits secondary to a vestibular disorder.
*Archives of Physical Medicine and Rehabilitation, 88*(1), 99–104.
https://doi.org/10.1016/j.apmr.2006.10.027

Winter, D. A. (2009). *Biomechanics and motor control of human movement* (4th ed.). John Wiley &
Sons. https://doi.org/10.1002/9780470549148

### Clinical summaries and protocol documents

Physiopedia. (n.d.). *Four Square Step Test.* Retrieved 2026-10-15 from
https://www.physio-pedia.com/Four_Square_Step_Test

Shirley Ryan AbilityLab. (n.d.). *Four Square Step Test — Rehabilitation Measures Database.*
Retrieved 2026-10-15 from https://www.sralab.org/rehabilitation-measures/four-square-step-test

Shirley Ryan AbilityLab. (2017). *Four Step Square Test — instructions* [PDF].
https://www.sralab.org/sites/default/files/2017-06/Four%20Step%20Square%20Test%20Instructions.pdf

### Technical references

Google. (2024). *MediaPipe Pose Landmarker.* Google AI Edge.
https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

Hartley, R., & Zisserman, A. (2004). *Multiple view geometry in computer vision* (2nd ed.).
Cambridge University Press. (Planar homography / Direct Linear Transform.)
https://doi.org/10.1017/CBO9780511811685

Lugaresi, C., Tang, J., Nash, H., McClanahan, C., Uboweja, E., Hays, M., Zhang, F., Chang, C.-L.,
Yong, M. G., Lee, J., Chang, W.-T., Hua, W., Georg, M., & Grundmann, M. (2019). *MediaPipe: A
framework for building perception pipelines.* arXiv. https://arxiv.org/abs/1906.08172

Bazarevsky, V., Grishchenko, I., Raveendran, K., Zhu, T., Zhang, F., & Grundmann, M. (2020).
*BlazePose: On-device real-time body pose tracking.* arXiv. https://arxiv.org/abs/2006.10204

> **Attribution & compliance.** Clinical cut-offs and reliability figures in §3 and §1 are drawn from
> the SRA Lab and Physiopedia summaries, the Moore and Barker (2017) systematic review, and the
> original-paper abstracts/records cited above; several primary papers were paywalled at compilation
> time and were not read in full. *Content was rephrased and summarised for compliance with licensing
> restrictions.* Verify every value against the primary source before clinical or publication use.
