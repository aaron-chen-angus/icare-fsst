# FSST//LAB — Kiro Development Brief (v2)

**Product:** FSST//LAB — TRON Four Square Step Test Biomechanics Lab
**Replaces:** the IntelliCARE Flutter "Four Square Step Test" CV assessment
**Reference implementation:** STS//LAB (`reference/sts-lab/`, read-only)
**Companion files:** `docs/FSST_Clinical_Reference.md` (protocol and cut-off evidence), `docs/FSST_Code_Assessment.md` (analysis of the Flutter code), `reference/flutter-fsst/*.dart` (original Flutter source, read-only)

Tags used throughout:
- **[TUNE]** engineering default pending pilot validation; lives in `js/config.js`.
- **[ASSUMED]** definition inferred because the original backend (Python) was never available; this brief IS the specification of the replacement analysis.
- **[CLINICAL]** value or rule taken from the published literature; source in `docs/FSST_Clinical_Reference.md`.

---

## 0. Changes from v1 (decisions applied)

| # | Decision from the author | Effect |
|---|---|---|
| 1 | No backend source exists; generate the logic | Section 9 is now a complete, implementable specification with pseudocode and a synthetic-data test plan |
| 2 | Cross dimensions do not matter, provided each square fits both feet | **Geometry is scale-free.** The floor is a unit grid. Times, counts and ratios need no dimension. Metre values use an operator-entered arm length if given, else a body-based estimate, else are null (section 7) |
| 3 | No translation strings; estimate camera placement from logic | Section 5 derives placement rules from the overlay geometry, with stated assumptions |
| 4 | Practice plus two timed trials; use the fastest of the 3 | Trial orchestration in section 4.7; headline score is the best valid time of all three; the SRA-protocol score (best of the two timed trials) is shown alongside |
| 5 | Use peer-reviewed cut-offs, as clinically accurate as possible | Population-specific cut-offs with sources (section 9.9); classification only when a validated cut-off applies; tape-adaptation caveat recorded on every trial |
| 6 | (not answered) agility / stability / instability scores | Still reserved (null). See section 16 |

---

## 1. Scope

**In scope:** entry with language video, portrait camera with always-visible pose markers and floor grid, live timing and stage tracking, offline analysis, practice + two timed trials with best-of-3, results with charts, ZIP export, Google Sheets upload with outbox, generated data dictionary.
**Out of scope (v1):** video recording or upload, accounts, other tests, `agility_score` / `stability_score` / `instability_score` formulas (columns reserved, null), forward trunk lean (frontal camera), dual-task or foam-specific scoring beyond recording the surface.

The product description, technical constraints and file structure are in the always-loaded steering files `.kiro/steering/product.md`, `tech.md` and `structure.md`. They are normative.

---

## 2. Requirements (EARS)

1. WHEN the app loads, THE SYSTEM SHALL show the entry screen with the setup panel, three language buttons (English, Mandarin, Cantonese) and no PROCEED button.
2. WHEN the user selects a language, THE SYSTEM SHALL embed the matching YouTube Short in a 9:16 player with a fallback link and a language switch.
3. WHEN a video has been opened, THE SYSTEM SHALL reveal a PROCEED button below the video; it SHALL be enabled only while the participant form and both required checkboxes are valid.
4. WHEN the user presses PROCEED, THE SYSTEM SHALL load the pose model, start the camera in portrait and show the camera screen with the floor grid and pose skeleton drawn on every frame.
5. THE SYSTEM SHALL fit every screen to the viewport from 320 px width and 568 px height upward without horizontal scrolling.
6. WHILE the device is in landscape during a live session, THE SYSTEM SHALL show a rotate-to-portrait blocker and pause analysis.
7. THE SYSTEM SHALL let the operator align the on-screen grid to the taped cross by dragging four arm-tip handles, and SHALL record the alignment.
8. WHEN both feet are stationary inside square 1 AND the full body is visible, THE SYSTEM SHALL show READY and enable START.
9. WHEN START is pressed, THE SYSTEM SHALL run a 3-2-1-GO countdown and then wait for the participant to move.
10. WHEN the first foot makes contact in square 2, THE SYSTEM SHALL start the timer; WHEN the last foot makes contact in square 1 at stage 8, THE SYSTEM SHALL stop it and end the trial after a short tail.
11. WHILE a trial is running, THE SYSTEM SHALL display elapsed time, current stage (n/8), target square and per-foot grounded indicators.
12. WHEN a foot makes contact in a square that is neither the expected target nor the previous target, THE SYSTEM SHALL record a sequence error and mark the trial `INVALID_SEQUENCE`.
13. WHEN the operator presses STOP, OR the trial exceeds the maximum duration, THE SYSTEM SHALL end the trial as `INCOMPLETE` and record the stage reached.
14. WHEN a trial ends, THE SYSTEM SHALL recompute every metric offline from the buffered landmarks; the offline result is authoritative and the live value is stored for comparison.
15. THE SYSTEM SHALL show results grouped as in the Flutter app (headline time, stepping, step symmetry, directional timing, stability and trunk, risk indicators) plus QC flags and charts.
16. THE SYSTEM SHALL record every attempt and SHALL compute (never ask the user to choose) the best valid time.
17. WHEN the participant cannot perform the test, THE SYSTEM SHALL record `test_status = CANNOT_DO` with a null time.
18. WHERE the participant gave consent and a webhook is configured, THE SYSTEM SHALL upload each trial once (de-duplicated by `session_id`) and, on failure, queue it in a local outbox and retry when online.
19. THE SYSTEM SHALL offer a ZIP download of summary, stages, contacts, analysed frames and raw landmark frames for each trial.
20. THE SYSTEM SHALL generate `DATA_DICTIONARY.md` from `js/schema.js` so the dictionary cannot drift from the code.
21. THE SYSTEM SHALL run one practice trial followed by two timed trials per participant, and SHALL label each attempt (`PRACTICE`, `TIMED_1`, `TIMED_2`).
22. WHEN an attempt is unsuccessful (sequence error, incomplete sequence, tracking failure, or the operator marks it invalid), THE SYSTEM SHALL offer to repeat that trial slot, up to `protocol.maxRepeatsPerSlot` times.
23. WHEN at least one valid trial exists, THE SYSTEM SHALL show BEST (fastest valid of all attempts) as the headline and SHALL also show the SRA-protocol score (fastest valid of the two timed trials).
24. THE SYSTEM SHALL classify fall risk only when a validated cut-off applies to the selected population and age; otherwise it SHALL show `NOT_CLASSIFIED` with the reason.
25. THE SYSTEM SHALL work without any floor dimension; WHERE the operator enters the cross arm length it SHALL use it for metric values, ELSE it SHALL estimate it from the participant's height, ELSE it SHALL leave metric values empty.
26. THE SYSTEM SHALL capture an operator verdict per trial (valid, balance lost, support used, not facing forward, line or cane contact).
27. WHEN a trial ends, THE SYSTEM SHALL offer an optional rest period (`protocol.restS`) before the next trial, which the operator can skip.

---

## 3. Steering reference

Normative content (always loaded in Kiro): `.kiro/steering/product.md`, `tech.md`, `structure.md`. Brief and clinical reference are pulled in automatically when code files are touched via `.kiro/steering/fsst-brief.md`.

---

## 4. Screen flow (portrait)

`entry` -> `align` -> `countdown` -> `test` -> `analysing` -> `results` -> (`rest` -> `align` ...) and `history`. Render each screen into `#app` as STS does (`entry()`, `session()`, `setStep()`, `finish()`, `results()`, `history()` in `reference/sts-lab/js/app.js`).

### 4.1 Entry (`entry()`)

Order, top to bottom (same gating logic as STS `refreshProceed()`):
1. **Header:** `.logo` "FSST//LAB", `.subtitle` "Four Square Step Test Biomechanics Lab", one-line "Research and screening tool, not a medical device."
2. **Setup panel** (`ol.instructions` + inline SVG of the tape cross with squares 1-4 and the phone icon in front). Wording (final text may be refined after the pilot):
   1. Mark a cross on a flat, non-slip floor with tape: two lines crossing at the middle, four equal arms. Each of the four squares must be large enough for the participant to stand in with both feet; use the same size for every participant and enter it below if you measured it.
   2. Stand the phone upright (portrait) on a stable support, rear camera, in front of the cross, centred on it. Move it back until the cross fits the on-screen grid (section 5).
   3. Clear 1 m around the cross. Non-slip footwear. A spotter within arm's reach for anyone at risk of falling.
   4. The participant stands in square 1 (the far right square on screen) facing the phone.
   5. On GO: step into 2, 3, 4, 1, then 4, 3, 2, 1. Both feet must touch the floor in every square. Face the phone throughout. Do not touch the lines.
   6. The clock starts at the first step into square 2 and stops when both feet are back in square 1.
   7. One practice trial, then two timed trials. Rest between trials if needed.
3. **Language buttons** (`#langs`, `.lang-btn[data-lang]`): English, "普通话 Mandarin", "廣東話 Cantonese".
4. **Video host** (`#videoHost`), empty until a language is chosen. `openVideo(lang)` sets `S.videoOpened = true` and embeds `https://www.youtube.com/embed/{id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`, adds `.yt-fallback` linking to `https://www.youtube.com/shorts/{id}`, and a `.lang-switch` row.
5. **Participant form** (`#f`):
   - `#pid` pseudonymous ID (required)
   - `#age` years, 18-110 (required)
   - `#sex` female / male / other
   - `#h` standing height cm, 120-210 (required; used for the body-based scale estimate)
   - `#m` body mass kg (optional)
   - `#pop` **population** (required; drives the cut-off): `older_adult_community` (default, "Older adult, community-dwelling, 65+"), `vestibular`, `amputation_transtibial`, `parkinson`, `stroke_acute`, `other_none` ("Other / healthy / under 65: no validated cut-off")
   - `#aid` assistive device: none (default) / cane / walker / other (SRA requires recording)
   - `#surface` floor surface: hard (default) / foam / other
   - `#arm` cross arm length in cm (optional, recommended): the length of one tape arm from the centre to its tip
   - `#site`, `#cam` (`environment` default, `user`), `#model` (`full` default, `lite`, `heavy`), `#notes`
6. **Checkboxes:** `#c1` operator confirms the participant is fit to test and a spotter is present when needed (required); `#c2` participant has seen the instructions and the floor cross is set up (required); `#c3` consent to Google Sheets upload (only when `CONFIG.sheets.webhookUrl` is set).
7. **Buttons:** `#proceed` (hidden until a video is opened; enabled when form and `#c1`, `#c2` valid), `#cannot` "Unable to perform test" (records `CANNOT_DO`), history under a collapsed `details`.

Video IDs live in `CONFIG.videos`: english `X9Syvrmr90Q`, mandarin `eWkwCwIa-oQ`, cantonese `1GgyzJfwuXU`.

### 4.2 Align / camera screen

- Camera: `facingMode` from `#cam`, ideal 720x1280 at 30 fps, 9:16 hint with retry without it, audio off. **Never mirror** the preview (either camera): grid numbering and all geometry are defined in raw image space. Rear camera default.
- Layout: the video box keeps the camera aspect ratio and fits inside `100dvh` minus a control bar. **Controls sit in a bar below the video, never over it**, because the feet and grid occupy the bottom of the frame.
- Top of the video: status line `#ov` and HUD only.
- Overlays on a canvas above the video: floor grid (section 7), skeleton (section 8).
- Controls: Exit, Flip cam, Labels, All pts, ALIGN GRID (toggle), START (disabled until READY).
- READY requires: nose, shoulders, hips, knees, ankles, heels and toes visible (>= `signal.minVisibility`) and inside the frame; both feet stationary strictly inside square 1 for >= 1 s; grid alignment confirmed (a one-time "Grid matches the tape" tap per session, reset when the grid is moved). Otherwise show the specific correction ("Move phone back", "Step into square 1", "Feet not visible", "Confirm grid alignment").

### 4.3 Countdown and test

- Countdown 3-2-1-GO (`protocol.countdownS`), large orange number, beeps. ABORT returns to align.
- After GO the clock does not run. Prompt "STEP INTO SQUARE 2". The timer starts on first-foot contact in square 2 (causal detection), then:
  - HUD: time (blue, Orbitron), STAGE n/8 (orange), NEXT: square k, two foot LEDs (L, R) green when grounded.
  - Target square filled orange at ~18% alpha, completed squares blue, a wrong-square contact flashes red.
- Pre-roll buffer `protocol.preRollS` (1.0 s) to detect `MOVED_BEFORE_GO` and to baseline trunk tilt.
- End: automatic when stage 8 completes plus `protocol.tailS` (1.0 s) -> `analysing`. STOP (safety) ends immediately as `INCOMPLETE`. `protocol.maxTrialS` (60 s **[TUNE]**) ends as `INCOMPLETE`.
- Keep the screen awake (`navigator.wakeLock`); abort on `visibilitychange`.

### 4.4 Analysing

As STS `finish()`: "ANALYSING", run `FSSTAnalysis.analyzeSession()`, store history, show results, upload if consented. Unusable tracking -> "Not enough tracking" with Try again, `test_status = TRACKING_FAILED`.

### 4.5 Results (`results()`)

- **Score panel:** `.big-number` = this trial's time (1 decimal). Badges: trial label (PRACTICE / TIMED 1 / TIMED 2), `QC PASS | REVIEW`, fall-risk tier for this trial.
- **Attempt-group banner:** BEST (all valid attempts, headline) and, smaller, "Protocol score (best of 2 timed): x.x s" with its tier. Tiers per section 9.9.
- **Failure state** (`INCOMPLETE`, `INVALID_SEQUENCE`, `TRACKING_FAILED`): reason, `stage_progress`, Repeat this trial, data download.
- **Metric panels** (collapsible, Flutter grouping): Stepping; Step symmetry; Directional timing; Stability and trunk; Risk indicators. Missing values show a dash, never a number.
- **QC flags** with plain-language explanations; blocking flags styled `flag block`.
- **Operator verdict** panel: valid (yes/no), balance lost, support used, not facing forward, line or cane contact. Saved with the trial; editing it before upload re-evaluates `valid_trial`.
- **Charts** (`js/charts.js`, dependency-free canvas, 210 px tall, resize-aware): (1) floor path map: top-down squares and cross, numbered footprints, left blue / right orange, per-foot paths; (2) foot timeline: L and R grounded intervals with stage bands; (3) trunk deviation over time with the near-fall threshold.
- **Stages table:** 8 rows (stage, target, first contact, second contact, duration, dwell, line touch, error).
- **Data quality:** collapsed `details` (detection rate, valid frame %, gaps, grid adjustment, scale source and value).
- **Buttons:** Download all data (ZIP); Upload to Sheets (when configured); Next trial / Repeat trial; New participant; Home.

### 4.6 History

As STS `history()`: local summaries, outbox count, Retry now, Clear local history (keeps unsent outbox).

### 4.7 Trial orchestration

- Slots in order: `PRACTICE`, `TIMED_1`, `TIMED_2`. All three share one `attempt_group_id` (new participant or "New participant" creates a new one).
- A slot is **filled** by its first valid trial. An unsuccessful trial offers "Repeat" (same slot, `attempt_in_slot` + 1) up to `protocol.maxRepeatsPerSlot` (2 **[TUNE]**), after which the operator may continue without a valid trial in that slot. This follows the published rule to repeat a trial when the sequence is not completed, balance is lost or a cane is contacted [CLINICAL].
- After each trial, offer a rest of `protocol.restS` (60 s **[TUNE]**; the SRA page notes rest breaks may be needed to limit fatigue), skippable.
- The operator may stop after any slot (fatigue, safety); BEST is computed from what exists.
- **Scores:** `best_time_all_s` = min `time_to_complete_s` over valid trials of all slots (the author's chosen headline). `best_time_timed_s` = min over valid `TIMED_*` trials (the SRA protocol score). Config `protocol.headlineBasis = 'all'` (default) or `'timed'`. Both are always shown when they differ.
- A trial is **valid** (`valid_trial`) when `test_status = COMPLETED`, `qc_pass` is true and the operator verdict does not say invalid, balance lost, support used or not facing forward. A flat-tape line touch alone does not invalidate (section 9.8).

---

## 5. Floor setup and camera placement (derived from the overlay geometry)

These are starting points derived from the Flutter overlay (near arm tip at 97.5% of frame height; left and right tips at about 18% and 82% of frame width; far tip at 72.5% of frame height for a 9:16 frame). The live alignment step is the final authority; the pilot (phase 8) must confirm or correct every number below. **[ASSUMED]**

**Floor**
- Tape cross on a flat, non-slip, uncluttered floor; four equal arms, perpendicular. Tape colour must contrast with the floor.
- Arm length = side of each square. Each square must hold both feet side by side comfortably. Recommended 60-100 cm; choose one size and keep it for every participant (a smaller cross is harder). The published test uses canes of roughly 100 cm (Physiopedia summary), but the literature varies, so the dimension is not fixed by this brief. Enter the length in `#arm` if measured.
- The outer edge of the squares is virtual (arm length from the centre) and is drawn by the app. The participant should not be asked to avoid anything beyond the tape.

**Phone**
- Phone upright (portrait), default 1x rear camera (not ultra-wide, no zoom, no portrait or beauty mode), on a tripod, stack or stand; do not hand-hold.
- Centred on the cross's centre line, in front of the near squares (2 and 3). The participant starts in square 1 (far right on screen) and faces the phone throughout.
- **Distance** from the phone to the near arm tip: about **2.4 to 3.5 times the arm length** (about 1.5-2 m for a 60 cm arm, 2.4-3.5 m for 100 cm). Derivation: the left and right tips span about 63% of the frame width at a depth one arm length beyond the near tip; a portrait 9:16 video has a horizontal field of view of about 39-50 degrees on typical phones.
- **Height:** about 1.4 to 2 times the arm length above the floor (roughly waist to shoulder height for most setups), phone level (no tilt). If the grid cannot be matched, change distance first, then height.
- **Whole body:** with the participant standing in square 1 (the farthest square), head to toes must be visible. At these distances the frame height is much larger than a standing adult, so this normally holds; READY checks it.
- **Scene:** plain background, front-lit (no window behind the participant), trousers or fitted clothing so knees and ankles are visible, footwear that contrasts with the floor, nothing else moving in view.

**Alignment**
- On the align screen, four handles at the arm tips and a centre cross are drawn. The operator drags each handle onto the matching tape arm tip (far, right, near, left as seen on screen). The preset position is the Flutter overlay geometry (section 7.1).

---

## 6. Pose markers

Track the same 17 MediaPipe landmarks as STS (keys used in raw CSV column names):

| Key | Index | | Key | Index |
|---|---|---|---|---|
| `nose` | 0 | | `l_hip` / `r_hip` | 23 / 24 |
| `l_sh` / `r_sh` | 11 / 12 | | `l_kn` / `r_kn` | 25 / 26 |
| `l_el` / `r_el` | 13 / 14 | | `l_an` / `r_an` | 27 / 28 |
| `l_wr` / `r_wr` | 15 / 16 | | `l_heel` / `r_heel` | 29 / 30 |
| | | | `l_toe` / `r_toe` | 31 / 32 |

Frame passed to analysis, as in STS: `{ tMs, img: Float32Array(68), world: Float32Array(51) | null }` (17 landmarks x x,y,z,visibility; and x,y,z world), `tMs` strictly increasing from `requestVideoFrameCallback`. Pose engine config pinned as in STS `js/config.js`: `@mediapipe/tasks-vision@0.10.18`, models lite/full/heavy float16 v1, GPU delegate with CPU fallback, `numPoses = 1`, confidences 0.5.

---

## 7. Floor grid, homography and scale

### 7.1 Grid definition
- Four arm-tip handles in normalised image coordinates (x/W, y/H): **T** (far), **R** (right), **B** (near), **L** (left). The centre C is the intersection of line T-B and line L-R.
- **Default preset** (port of the Flutter `getGridCoordinates`), with frame width W, height H and `rho = W/H`: `T = (0.5, 0.975 - rho/2.25)`, `B = (0.5, 0.975)`, `L = (0.5 - 0.95/3, 0.975 - rho/4.5)`, `R = (0.5 + 0.95/3, 0.975 - rho/4.5)`. For 720 x 1280 this gives T (0.5, 0.725), B (0.5, 0.975), L (0.183, 0.85), R (0.817, 0.85), i.e. in pixels T (360, 928), B (360, 1248), L (132, 1088), R (588, 1088). The Flutter outer trapezoid corners were (120, 1248), (600, 1248), (144, 928), (576, 928); the new preset uses the arm tips, which are the physical markers.
- Dragging a handle moves that tip; dragging inside the grid moves all four; Reset restores the preset. Persist the last grid in `localStorage` (try/catch). Record `grid_user_adjusted` and the eight normalised coordinates per trial.

### 7.2 Floor coordinates
Homography `Hm` (4-point direct linear transform, in pixel space with aspect correction) maps image to floor unit coordinates `(u, v)` such that T -> (0, +1), R -> (+1, 0), B -> (0, -1), L -> (-1, 0). `u` points to screen-right, `v` away from the camera; **one unit equals one arm length**. The virtual outer corners are (+/-1, +/-1). Squares: 1 = (u>0, v>0), 2 = (u>0, v<0), 3 = (u<0, v<0), 4 = (u<0, v>0), matching the Flutter labels (1 top-right, 2 bottom-right, 3 bottom-left, 4 top-left). A point with max(|u|, |v|) > 1 + `geometry.outsideMarginRel` (0.15) is outside (square 0).

### 7.3 Scale (metres) — three tiers
1. **`OPERATOR_ENTERED`:** `arm_length_cm = #arm`.
2. **`BODY_ESTIMATED`** **[ASSUMED]**: during the READY hold (both feet stationary in square 1, upright), take `shank_px` = median knee-to-ankle distance in pixels over both legs. Local scale `s = 0.246 * height_cm / shank_px` (cm per pixel, shank = 0.246 x height, Winter 2009, the same constant STS uses). Let `v_p` be the median floor `v` of the two feet. The image points of floor (-1, v_p) and (+1, v_p) are `Hm^-1` of those points; `d_px` is their pixel distance. Then `arm_length_cm = d_px * s / 2`. Accuracy is limited (anthropometric proportions and camera pitch); flag `SCALE_ESTIMATED`.
3. **`NONE`:** if no estimate is possible (`shank_px` < 20, low visibility) all `*_m` values are null and flag `SCALE_UNAVAILABLE`.

Metre values are `relative_value * arm_length_cm / 100`. Store `arm_length_cm` and `arm_length_source` on every row so relative values (`metres / (arm_length_cm / 100)`) can always be recovered, which cancels any estimation error. Times, counts, symmetry index, CV and ratios never depend on scale.

---

## 8. Skeleton and marker display (must be visible)

Drawn every frame, canvas cleared each time, using the STS pose-engine drawing structure with the TRON palette:
- **Bones** (the 18 STS connections): `--blue` lines on both sides; width scales with canvas size; opacity drops when visibility <= 0.5.
- **Joints:** `--orange` filled circles with white outline; heel and toe markers larger and joined to the ankle (ankle-heel-toe triangle) because the feet are the measurement.
- **Foot state ring:** green when grounded, orange in swing.
- **Low visibility** (< `signal.minVisibility`): yellow hollow ring.
- **Toggles:** Labels (joint name and visibility %), All pts (all 33 landmarks as small translucent dots).
- A debug toggle shows each foot's floor position `(u, v)` and speed.

**Responsive mapping (critical):** one shared `geometry.videoToCanvas(nx, ny)` maps normalised video coordinates to canvas pixels, accounting for the displayed video box (`object-fit`), CSS size and `devicePixelRatio`. Grid and skeleton both use it. Recompute on `resize`, `orientationchange` and `ResizeObserver`.

---

## 9. Analysis specification (replacement for the missing backend)

All analysis is offline on the buffered frames, as in STS; `js/live.js` repeats a causal version for feedback only. Times are seconds from GO unless stated. Module global `FSSTAnalysis`, exported to Node with the same `module.exports` pattern as `STSAnalysis`.

### 9.1 Preprocessing
1. Resample each marker to a uniform `signal.resampleHz` = 30 grid; gaps longer than `maxGapS` (0.25 s) are flagged and interpolated (`resampleOnGrid`, as STS).
2. Zero-phase 2nd-order Butterworth low-pass, reflection padded, reusing STS `filtfilt`/`biquadLP`. Cutoffs: **feet 8 Hz [TUNE]** (stepping is faster than sit-to-stand; STS used 6 Hz) and **trunk 6 Hz**.
3. Foot point per foot: mean of heel and toe image points (pixels). If only one is visible use it; if neither, mark a gap.
4. Floor position `(u, v) = Hm(foot point)`.
5. Per-leg shank length in pixels `shank_px(t)`: median of knee-ankle distance over a 0.5 s window.

### 9.2 Contact detection (per foot)
Speed is measured in the image and normalised by the local body scale so it does not depend on depth: `speed(t) = |d(foot_px)/dt| / shank_px(t)` in shanks per second.

```
CONTACT_ON  = speed < contacts.vOnShankS    (0.40 shank/s  [TUNE])
CONTACT_OFF = speed > contacts.vOffShankS   (0.80 shank/s  [TUNE])   // hysteresis
state = SWING
for each sample t (30 Hz):
    if state == SWING  and speed(t) < vOn  and visible: state = GROUNDED; tOn = t
    if state == GROUNDED and speed(t) > vOff:          state = SWING;    tOff = t; close episode
merge episodes of the same foot separated by < contacts.mergeGapS (0.06 s)
drop episodes shorter than contacts.minContactS (0.10 s)
episode = { foot, tOn, tOff, u, v (median over episode), vis (mean), onLine, square }
```
Rationale: a lifted foot projects to a wrong floor point, so contact is decided by stillness, not by position. `contacts.onsetBiasS` (default 0 **[TUNE]**) shifts `tOn` after pilot calibration against manual timing.

### 9.3 Square membership
```
matches(ep, S):  // S = target square number, quadrant signs (su, sv)
    return ep.u*su >= -lineBandRel and ep.v*sv >= -lineBandRel and max(|ep.u|,|ep.v|) <= 1 + outsideMarginRel
onLine(ep):  min(|ep.u|, |ep.v|) < lineBandRel          // geometry.lineBandRel = 0.06 arm length [TUNE]
```
A foot on the line between two squares matches both neighbouring squares, so tape contact cannot create a false sequence error.

### 9.4 Stage state machine
Sequence `protocol.sequence = [2,3,4,1,4,3,2,1]`; stages 1-4 are the clockwise lap, 5-8 the anticlockwise lap. Start condition: at GO both feet are grounded strictly inside square 1 (`NOT_IN_START_SQUARE` otherwise); their episode medians are `P0_L`, `P0_R`.

```
k = 1; stageFoot = {L: null, R: null}; extra = 0; errors = 0
for ep in all episodes sorted by tOn, with ep.tOn after the start episodes:
    target = SEQ[k]; prev = (k == 1 ? 1 : SEQ[k-1])
    if matches(ep, target):
        if stageFoot[ep.foot] == null: stageFoot[ep.foot] = ep
        else: extra += 1                               // adjustment inside the target square
        if stageFoot.L and stageFoot.R:                // stage complete
            record stage k: first = earlier tOn, second = later tOn, lead = foot of first
            k += 1; stageFoot = {L: null, R: null}
            if k > 8: break                            // trial complete
    elif matches(ep, prev):
        if stageFoot[ep.foot] == null: extra += 1      // trail foot repositioning in the previous square
        else: errors += 1                              // stepped back after reaching the target
    else:
        errors += 1                                    // wrong square or outside the grid
tStart = stage[1].firstContact ; tStop = stage[8].secondContact
```
Stage completes only when both feet have a contact in the target square (both feet must touch the floor in every square [CLINICAL]).

### 9.5 Timing metrics
| Field | Definition |
|---|---|
| `time_to_complete_s` | `tStop - tStart` (start = first foot contact in square 2, stop = last foot contact in square 1 [CLINICAL]) |
| stage duration `D_k` | `first[k+1] - first[k]`; `D_8 = tStop - first[8]` (they sum to `time_to_complete_s`) |
| `avg_step_duration_s` | mean of `D_k` |
| `step_variability_s` | sample SD of `D_k` |
| `step_duration_cv_pct` | `100 * SD / mean` |
| `clockwise_time_s` | `second[4] - tStart` **[ASSUMED]** |
| `anticlockwise_time_s` | `tStop - second[4]` **[ASSUMED]** |
| `phase_time_ratio` | `anticlockwise_time_s / clockwise_time_s` **[ASSUMED]** |
| `interlimb_coordination_s` | mean over stages of `second[k] - first[k]` **[ASSUMED]** |
| `double_support_time_ratio_pct` | duration where both feet are grounded within `[tStart, tStop]` / `time_to_complete_s` * 100 |
| `hesitation_count` | number of intervals where both feet are grounded together for longer than `protocol.hesitationS` (0.6 s **[TUNE]**) within `[tStart, tStop]` |

### 9.6 Spatial metrics (relative to arm length, then converted by section 7.3)
| Field | Definition |
|---|---|
| step length | for each foot and stage: distance between consecutive contact positions of that foot (stage 0 = `P0`); `step_length_left_m`, `step_length_right_m`, `step_length_mean_m` = means over the 8 left, 8 right and all 16 |
| `step_symmetry_index_pct` | `100 * abs(L - R) / (0.5 * (L + R))` (Robinson) |
| `step_width_mean_m` | mean over stages of the distance between the left and right contact positions within the stage **[ASSUMED]** (inter-foot distance at double support; not a gait step width) |
| `line_touch_count` | contact episodes with `onLine` true, excluding the start position. **Low confidence from a 2D camera** (a foot held just above the line looks the same); flag `LINE_TOUCH_LOW_CONFIDENCE` when visibility is low |
| `sequence_error_count` | `errors` from 9.4 |
| `extra_contact_count` | `extra` from 9.4 |

### 9.7 Trunk metrics (frontal camera, 2D)
```
tilt(t) = atan2(ms.x - mh.x,  mh.y - ms.y)   // ms = mid-shoulder px, mh = mid-hip px; deg; + = leaning toward screen-right
baseline = median(tilt over the pre-roll window)
dev(t) = tilt(t) - baseline
peak_trunk_angle_deg = max |dev| over [tStart, tStop]
mean_trunk_angular_velocity_deg_s = mean |d(dev)/dt| over [tStart, tStop]
near_fall_event = peak_trunk_angle_deg > trunk.nearFallDevDeg (20 [TUNE]) AND an extra contact or sequence error occurs within 1.0 s   // experimental, unvalidated
```
Optional `peak_trunk_incl_3d_deg` from world landmarks (mid-hip to mid-shoulder vector from vertical). Forward lean is not reliably measurable from the front and is out of scope.

### 9.8 Status, validity and QC
`test_status`: `COMPLETED`, `INCOMPLETE`, `INVALID_SEQUENCE`, `TRACKING_FAILED`, `CANNOT_DO`, `ABORTED`. Also `failure_reason`, `current_stage`, `stage_progress` ("n/8" where n = stages completed), `stages_completed`.

| Flag | Blocking | Trigger |
|---|---|---|
| `LOW_FPS` | yes | detection rate < 15 fps |
| `LOW_VALID_FRAMES` | yes | < 90% of frames with hips, knees, ankles, heels and toes valid |
| `TRACKING_GAPS` | yes | imputed samples > 10% or longest gap > 0.5 s |
| `FOOT_OCCLUSION` | yes | either foot visibility < 0.5 for > 20% of the trial **[TUNE]** |
| `NOT_IN_START_SQUARE` | yes | feet not both in square 1 at GO |
| `MOVED_BEFORE_GO` | yes | a foot left square 1 before GO |
| `SEQUENCE_ERROR` | yes | `sequence_error_count > 0` |
| `INCOMPLETE_SEQUENCE` | yes | fewer than 8 stages completed |
| `MANUAL_STOP`, `TIMEOUT` | yes | stopped early / exceeded `maxTrialS` |
| `GRID_NOT_CONFIRMED` | yes | START pressed without confirming the grid match |
| `PROTOCOL_ADAPTATION_TAPE` | no | always raised: tape cross instead of canes (see 9.9) |
| `GRID_USER_ADJUSTED` | no | handles moved from the preset |
| `SCALE_ESTIMATED` / `SCALE_UNAVAILABLE` | no | scale tier 2 / 3 |
| `LINE_TOUCH_LOW_CONFIDENCE` | no | a flagged contact had visibility < 0.5 |
| `HIGH_TRUNK_DEVIATION` | no | peak deviation over threshold |
| `PARTIAL_BODY_IN_FRAME` | no | nose or toes left the frame |
| `PRACTICE_TRIAL` | no | slot is PRACTICE |

`qc_pass` = no blocking flag. `valid_trial` = `test_status == COMPLETED` AND `qc_pass` AND operator verdict not invalid / balance lost / support used / not facing forward. A line touch alone does not invalidate: the published criterion concerns cane contact, and tape on the floor is not an obstacle; the operator verdict decides.

### 9.9 Fall-risk classification [CLINICAL]
Config `protocol.riskCutoffs` (full evidence and caveats in `docs/FSST_Clinical_Reference.md`):

| `#pop` value | Cut-off rule | Source (as summarised by SRA Lab, Physiopedia, Moore and Barker 2017) |
|---|---|---|
| `older_adult_community` (age >= 65) | time **> 15 s** -> `ELEVATED` | Dite and Temple 2002; the 15 s cut-off reaffirmed by Cleary and Skornyakov 2017 |
| `vestibular` | time **> 12 s** | Whitney et al. 2007 |
| `amputation_transtibial` | time **> 24 s** | Dite et al. 2007 |
| `parkinson` | time **> 9.68 s** | Duncan and Earhart 2013 |
| `stroke_acute` | **failed attempt or time > 15 s** | Blennerhassett and Jayalath 2008 |
| `other_none` | no validated cut-off | `NOT_CLASSIFIED` |

Rules:
- `fall_risk_tier` is `ELEVATED` (time greater than the cut-off, strict), `LOWER` (time at or below the cut-off) or `NOT_CLASSIFIED`. Reasons for `NOT_CLASSIFIED`: `NO_VALIDATED_CUTOFF`, `AGE_BELOW_COHORT` (older-adult cut-off but age < 65), `INVALID_TRIAL`.
- Write `risk_population`, `risk_cutoff_s`, `risk_rule`, `risk_cutoff_source` into every row.
- Attempt-group tiers use the group scores of section 4.7: show a tier for BEST (all) and for the SRA-protocol score. **Including the practice trial can only lower the score**, so the published protocol (best of two timed trials) is the more conservative comparison with the validation studies; the app shows both and the author's chosen headline basis is `protocol.headlineBasis` (default `'all'`).
- **Tape caveat [CLINICAL]:** the cut-offs were derived with canes laid on the floor (the original test involved stepping over low 2.5 cm objects). A flat tape cross removes the obstacle, which may shorten times relative to the validation cohorts. Treat the tier as a screening indicator, not a diagnosis. Raise `PROTOCOL_ADAPTATION_TAPE` on every trial and print the caveat on the results screen.
- Alternative published values (not used for classification; shown in the dictionary): 10.14 s on a hard surface and 11.21 s on foam for older adults (Mathurapongsakul and Siriphorn 2018; the SRA page notes its sensitivity and specificity figures are inconsistent); 11 s distinguishes chronic stroke from healthy controls (Goh et al. 2013), which is discrimination, not fall risk.
- Record `surface` and `assistive_device`; the cut-offs apply to a hard surface without a device unless the clinician judges otherwise.

---

## 10. Data capture

### 10.1 `js/schema.js`
Single source of truth, same structure as STS (`F(key, type, unit, desc, calc)` and `G(group, fields)`), plus `status` (`defined | assumed | reserved`), `dart_name` and `tune` where applicable. CSV, ZIP, Sheets columns and the dictionary are generated from it; analysis refuses to emit an undocumented field (STS behaviour).

### 10.2 Tables

**Sessions** (one row per trial; `session_id` unique per trial)
- Session and participant: `session_id`, `attempt_group_id`, `trial_slot`, `attempt_in_slot`, `is_practice`, `repeat_reason`, `timestamp_utc`, `utc_offset_min`, `app_version`, `analysis_version`, `schema_version`, `participant_id`, `age_years`, `sex`, `height_cm`, `body_mass_kg`, `population`, `assistive_device`, `surface`, `site`, `operator_notes`
- Device and pose model: `pose_model`, `pose_delegate`, `camera_facing`, `video_width_px`, `video_height_px`, `user_agent` (truncated to 200)
- Protocol: `instruction_language`, `video_opened`, `safety_confirmed`, `setup_confirmed`, `consent_upload`, `headline_basis`, `planned_max_duration_s`, `test_duration_s`, `manual_stop`, `filter_cutoff_feet_hz`, `filter_cutoff_trunk_hz`, `resample_hz`
- Grid and scale: `arm_length_cm`, `arm_length_source`, `grid_user_adjusted`, `grid_t_x`, `grid_t_y`, `grid_r_x`, `grid_r_y`, `grid_b_x`, `grid_b_y`, `grid_l_x`, `grid_l_y`
- Status: `test_status`, `failure_reason`, `current_stage`, `stage_progress`, `stages_completed`
- Primary outcomes: `time_to_complete_s`, `live_time_s`, `time_difference_s`, `t_start_s`, `t_stop_s`, `clockwise_time_s`, `anticlockwise_time_s`, `phase_time_ratio`, `fall_risk_tier`, `risk_note`, `risk_population`, `risk_cutoff_s`, `risk_rule`, `risk_cutoff_source`
- Stepping: `avg_step_duration_s`, `step_variability_s`, `step_duration_cv_pct`, `step_length_mean_m`, `step_length_left_m`, `step_length_right_m`, `step_symmetry_index_pct`, `step_width_mean_m`, `hesitation_count`, `line_touch_count`, `sequence_error_count`, `extra_contact_count`, `double_support_time_ratio_pct`, `interlimb_coordination_s`
- Trunk and stability: `peak_trunk_angle_deg`, `mean_trunk_angular_velocity_deg_s`, `peak_trunk_incl_3d_deg`, `near_fall_event`, `agility_score`, `stability_score`, `instability_score` (last three reserved, null)
- QC: `effective_fs_hz`, `frames_analysed`, `valid_frame_pct`, `imputed_sample_pct`, `longest_gap_s`, `median_foot_visibility`, `qc_flags`, `qc_pass`, `valid_trial`
- Operator verdict: `operator_valid`, `operator_balance_lost`, `operator_support_used`, `operator_not_facing_forward`, `operator_line_or_cane_contact`

**Stages** (8 rows per trial): `session_id`, `stage`, `target_square`, `lead_foot`, `t_first_contact_s`, `t_second_contact_s`, `t_liftoff_s`, `stage_duration_s`, `dwell_s`, `interlimb_lag_s`, `lead_u`, `lead_v`, `trail_u`, `trail_v`, `step_length_lead_rel`, `step_length_trail_rel`, `step_width_rel`, `line_touch`, `sequence_error`, `hesitation`.

**Contacts** (one row per foot contact episode): `session_id`, `contact_index`, `foot`, `stage`, `square`, `t_on_s`, `t_off_s`, `duration_s`, `u`, `v`, `on_line`, `is_extra`, `is_error`, `mean_visibility`. Positions are stored in unit-grid coordinates (scale-free); centimetres are `u * arm_length_cm`.

**Frames** (optional, `uploadFrames`, default false): analysed 30 Hz series (`t_s`, `phase`, `tracking_gap`, per-foot `u`, `v`, `speed_shank_s`, `grounded`, `trunk_dev_deg`, `trunk_angvel_deg_s`) and raw landmark frames (`t_ms` + 7 columns per marker: `_x`, `_y`, `_z`, `_v`, `_wx`, `_wy`, `_wz`; 120 columns, as STS).

**ZIP** per trial: `*_summary.csv`, `*_stages.csv`, `*_contacts.csv`, `*_frames_analysis.csv`, `*_frames_raw.csv`.

### 10.3 Google Sheets
- Copy `reference/sts-lab/apps-script/Code.gs` and extend the tab list to Sessions, Stages, Contacts, Frames; change the `doGet` service name to `fsst-lab`. Keep: JSON posted as `text/plain` (no CORS preflight), header-name column matching with appended new columns, formula-injection guard, script lock, de-duplication by `session_id`.
- **Create a new Sheet and a new Apps Script deployment. Do not reuse the STS `webhookUrl`** (it is in `reference/sts-lab/js/config.js`); it would mix datasets. Put the new `/exec` URL in `CONFIG.sheets.webhookUrl`.
- Upload only with the consent checkbox. Never upload video or raw landmarks. Failures go to the local outbox and retry on the `online` event.
- Group-level scores are derived in Sheets, not stored: BEST (all) `=MINIFS(time_to_complete_s, attempt_group_id, X, valid_trial, TRUE)`; protocol score `=MINIFS(time_to_complete_s, attempt_group_id, X, valid_trial, TRUE, is_practice, FALSE)`.

---

## 11. Styling (TRON, from STS)

Reuse `reference/sts-lab/css/styles.css` as the base. Product name "FSST//LAB". Fonts via Google Fonts `<link>` in `index.html` (the STS CSS has no `@import`): Orbitron 500/700/900 for headings, numbers, buttons, table headers; Rajdhani 400-700 for body.

| Token | Value |
|---|---|
| `--bg0` / `--bg1` | `#05070d` / `#0a1020` |
| `--panel` / `--panel-solid` | `rgba(10,18,36,0.72)` / `#0b1326` |
| `--blue` (data, primary) | `#00d4ff` |
| `--orange` (CTA, alerts) | `#ff6a00`, soft `#ff8c3a` |
| Status | green `#4cdf7c`, gold `#ffd700`, amber `#ffa500`, red `#ff3b30` |
| Text | `#dfe9ff`, dim `#8fa6c8` |
| Shape | `--radius` 2px, chamfered 14px `--clip` corners |

Keep: `.tron-bg` (hidden when `body.live`), `.panel` with `.brackets`, `.btn`, `.btn-primary` (pulse), `.btn-danger`, `.btn-small`, `.btn-large`, `.metric` 2-column grid, `.flag`, `details`, `prefers-reduced-motion` handling, white `:focus-visible` outline.

New FSST components: `.stage-chip`, `.foot-led`, `.grid-hint`, `.grid-handle`, `.rotate-blocker`, `.path-map`, `.timeline`, `.operator-verdict`, `.trial-strip` (PRACTICE / TIMED 1 / TIMED 2 progress), `.rest-panel`.

---

## 12. Portrait and fluid-layout acceptance checklist

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `theme-color #05070d`.
- Heights use `100dvh`, never `100vh`; honour `env(safe-area-inset-*)` on the live screen and control bar.
- Fluid type and spacing with `clamp()`; no fixed pixel widths on containers; `#app` max-width 600 px (STS), tighter padding at <= 380 px.
- Tap targets >= 48 px; the control bar wraps without clipping at 320 px; the primary action keeps its own full-width row.
- Video box and canvases sized by `ResizeObserver` from the displayed video; backing store scaled by `devicePixelRatio`; redraw on `resize` and `orientationchange`.
- Landscape during a live session: blocker overlay, analysis paused. Attempt `screen.orientation.lock('portrait')` best-effort; ignore failure (iOS).
- `playsinline`; camera denied / not found states with Back; `wakeLock`; `visibilitychange` handling.
- Grid handles are at least 44 px touch targets and remain inside the video box.
- YouTube frame 9:16, `max-height: 70vh` (STS), never overflowing.
- Viewports (CSS px): 320x568, 360x640, 375x667, 390x844, 412x915, 430x932, short 360x520, tablet 768x1024.
- Results tables scroll inside their own container; the page never scrolls horizontally.

---

## 13. Test plan (synthetic ground truth, as STS `tests/synth.js` + `tests/run.js`)

Write `tests/synth.js`: a generator that builds a full session from a script of stages: foot floor trajectories in unit-grid coordinates (stance at given positions, minimum-jerk swing of 0.25-0.40 s), converted to image pixels with the inverse homography of the preset grid; heel and toe offset by a foot length of 0.35 arm length; ankle, knee, hip, shoulder, nose from a standing body model scaled to a known height; configurable noise (sigma 0.002 normalised), dropouts and frame rate. `tests/run.js` (Node, as STS) and `tests/index.html` (browser, same assertions) must cover:

| Case | Setup | Expected |
|---|---|---|
| A clean | 8 stages, known contact times, 30 fps | `time_to_complete_s` within 0.06 s; `D_k` within 0.08 s; clockwise/anticlockwise split within 0.06 s; `sequence_error_count = 0`; status COMPLETED; `qc_pass` |
| B wrong square | stage 3 foot lands in square 2 | `sequence_error_count = 1`; status `INVALID_SEQUENCE`; `SEQUENCE_ERROR` flag |
| C incomplete | trial stops after stage 5 | status `INCOMPLETE`; `stage_progress = "5/8"`; `INCOMPLETE_SEQUENCE` |
| D hesitation | 1.0 s pause at stage 4 with both feet down | `hesitation_count = 1` |
| E adjustment | one extra shuffle inside square 3 | `extra_contact_count = 1`, no error |
| F line contact | one foot centred on a tape line | `line_touch_count = 1`, no sequence error (line matches both squares) |
| G tracking dropout | 0.6 s dropout | `TRACKING_GAPS` |
| H low frame rate | 12 fps | `LOW_FPS` |
| I foot occlusion | far foot visibility 0.3 for 30% of frames | `FOOT_OCCLUSION` |
| J moved before GO | foot leaves square 1 pre-GO | `MOVED_BEFORE_GO` |
| K start square | feet outside square 1 at GO | `NOT_IN_START_SQUARE` |
| L scale | arm length entered as 60 | step lengths scale correctly; `arm_length_source = OPERATOR_ENTERED` |
| M body scale | no arm length; synthetic 170 cm body | estimated arm length within 10% of truth; `SCALE_ESTIMATED` |
| N no scale | shank too short / invisible | `*_m` null, `SCALE_UNAVAILABLE`; all time metrics unaffected |
| O trunk | injected 25 deg lateral lean + extra contact | `near_fall_event = true` |
| P cut-offs | times 14.99, 15.00, 15.01 for `older_adult_community`, age 70 | LOWER, LOWER, ELEVATED; age 60 -> NOT_CLASSIFIED `AGE_BELOW_COHORT`; `other_none` -> NOT_CLASSIFIED; each other population boundary |
| Q best-of | three attempts incl. one invalid | BEST (all) and protocol score computed over valid trials only |
| R schema | every emitted column equals the schema column list for Sessions, Stages, Contacts, Frames | exact match, no extras, no missing |
| S dictionary | generated `DATA_DICTIONARY.md` mentions every schema key | pass |

Tolerances are initial proposals; the author sets final agreement limits before the pilot.

---

## 14. Phased plan with acceptance criteria

**Phase 0 — Scaffold and theme.** Copy needed files from `reference/sts-lab/` into the project root and rename STS to FSST (config, schema headers, `window.FSST*` namespaces, titles, `service: 'fsst-lab'`). Fluid layout shell.
*Accept:* opens locally and on GitHub Pages; styled entry placeholder; no console errors; section 12 checks pass on the listed viewports. `reference/` untouched.

**Phase 1 — Entry, language video, form, gating.**
*Accept:* requirements 1-3, 17, 24, 25 (form fields `#pop`, `#aid`, `#surface`, `#arm`); three Shorts play inline; PROCEED hidden until a video opens, disabled until the form and required checkboxes are valid; unable-to-perform records `CANNOT_DO`.

**Phase 2 — Camera, pose, grid, skeleton (responsive).**
*Accept:* requirements 4-8; skeleton with all 17 tracked markers visible on a real phone at >= 15 fps; preset handles match section 7.1 for a 720x1280 frame; handles draggable; grid and skeleton stay registered through resize and rotation; controls never cover the bottom of the frame.

**Phase 3 — Live contact detection and stage tracking (`live.js`).**
*Accept:* requirements 9-13; timer starts on first contact in square 2 and stops on last contact in square 1; stage counter, target highlight, foot LEDs and wrong-square flash work on a phone.

**Phase 4 — Offline analysis and tests.** Implement section 9 in `analysis.js`; implement `tests/synth.js`, `tests/run.js`, `tests/index.html` per section 13.
*Accept:* all cases A-S pass in Node and in the browser.

**Phase 5 — Trials, results, charts, ZIP.**
*Accept:* requirements 14-16, 19, 21-23, 26, 27; all panels, charts and tables render at 320 px; missing values show dashes; best-of logic correct; ZIP contents match the schema.

**Phase 6 — Google Sheets and outbox.**
*Accept:* requirement 18; the new Sheet receives Sessions, Stages and Contacts rows; resend is de-duplicated; offline then online delivers the queued trial; no upload without consent.

**Phase 7 — Data dictionary.**
*Accept:* requirement 20; `DATA_DICTIONARY.md` generated from `schema.js` and `config.js` (as STS `tools/build-dictionary.js`) covering every field, the 17 landmarks, QC flags, all parameters, the clinical cut-off table with sources, and status (`defined | assumed | reserved`); generation fails if a field lacks a description.

**Phase 8 — Field validation and tuning.**
*Accept:* pilot run on at least 10 trials across at least 3 phone models; app timing compared with manual frame-by-frame timing from a separate screen recording (the app stores no video); every **[TUNE]** value reviewed; limitations written into `README.md`. The agreement tolerance is set by the author before the pilot.

---

## 15. Working rules for Kiro

- Do not add dependencies, build tools or frameworks. Call no service other than the MediaPipe CDN, Google Fonts, YouTube embeds and the configured Apps Script webhook.
- Never edit anything under `reference/`. Copy from it.
- Every tunable number lives in `js/config.js` with a **[TUNE]** comment; every output field is declared in `js/schema.js` first.
- Never present `line_touch_count`, `near_fall_event` or any **[ASSUMED]** metric as clinically validated; label them experimental in the UI and dictionary.
- The offline result is authoritative; live values are feedback only.
- Do not invent formulas for `agility_score`, `stability_score` or `instability_score`; leave them null.
- Do not store or upload video, audio or raw frames without explicit consent and the `uploadFrames` flag.
- Update `README.md` in the same phase as the feature it describes.
- When the brief is ambiguous or contradicts itself, stop and ask; do not guess.

## 16. Open items and defaults used

| Item | Default in this brief | Needed from the author |
|---|---|---|
| Original backend source | Re-specified in section 9 | none (not available) |
| Agility / stability / instability scores | Reserved, null | Formulas, or confirm permanent drop |
| Sequence and move directions | From overlay numbering and the SRA page | Confirm against the English video |
| Camera height and distance | Derived (section 5) | Confirm in the pilot |
| Rest between trials | 60 s, skippable | Confirm |
| Headline basis | Best of all three attempts (author's choice); protocol score shown alongside | Confirm; note the published protocol scores the best of two timed trials |
| Unsuccessful-trial rules | Sequence error, incomplete, tracking failure, operator verdict | Confirm against the clinical protocol you follow |
| Consent text and ethics wording | Short generic checkbox | Approved wording from your IRB or ethics process |

## References

- SRA Lab, Four Square Step Test: https://www.sralab.org/rehabilitation-measures/four-square-step-test
- SRA Lab instructions PDF: https://www.sralab.org/sites/default/files/2017-06/Four%20Step%20Square%20Test%20Instructions.pdf
- Physiopedia, Four Square Step Test: https://www.physio-pedia.com/Four_Square_Step_Test
- Dite W, Temple VA. A clinical test of stepping and change of direction to identify multiple falling older adults. Arch Phys Med Rehabil 2002;83(11):1566-71 (record: https://ahro.austin.org.au/austinjspui/handle/1/9445)
- Moore M, Barker K. The validity and reliability of the four square step test in different adult populations: a systematic review. Syst Rev 2017 (https://pmc.ncbi.nlm.nih.gov/articles/PMC5594590)
- Cleary K, Skornyakov E. Predicting falls in older adults using the four square step test. Physiother Theory Pract 2017 (cited via https://link.springer.com/article/10.1007/s13670-020-00348-0)
- STS//LAB: https://github.com/aaron-chen-angus/icare-sts
- MediaPipe Pose Landmarker, `@mediapipe/tasks-vision` 0.10.18
