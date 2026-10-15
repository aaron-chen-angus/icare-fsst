# FSST Flutter Code Assessment

Scope: `4SquareStepTestHome.dart`, `4SquareStepTestCamera.dart`, `4SquareStepTestResults.dart`, `models/4SquareStepTestMetrics.dart` (IntelliCARE Flutter app), assessed for porting to a standalone web app (FSST//LAB).

## 1. Bottom line

1. **The Dart code contains no computer vision.** The camera screen records a video, uploads it to a Python backend, and the backend returns the metrics JSON. All of the biomechanics (timing, foot-contact detection, square membership, step length, scores, fall-risk tier) lives server-side in code that was not supplied. The web app must re-implement the analysis in the browser with MediaPipe.
2. **What the Dart code does give us:** the metric list (31 fields), the on-screen grid geometry, the UX flow, the results layout and the failure handling. These are enough to define the web app's outputs and screens, but not its algorithms.
3. **Highest-value missing item:** the backend endpoint source (`Four_Square_Step_Test/` under `AppConfig.fitnessCVApiUrl`). If you can share it, most of the "assumed" definitions in section 6 become "copied" definitions.
4. **Several defects in the Dart code should not be ported** (section 5), notably a metric that is never parsed, a `-1.0` null sentinel, retries that lose participant demographics, and a "cannot do test" result stored as `0.0` seconds.
5. **I could not view the three instructional videos** (YouTube returns no readable content to me). The test sequence below is derived from the overlay numbering and the SRA Lab page. Please confirm it against the English video before development.

## 2. What each file does

| File | Role | Port to web? |
|---|---|---|
| `4SquareStepTestHome.dart` | Loads age/gender from the user profile; shows the shared `BFTHomePageWidget` (equipment = tape only; instructional video asset IDs English 9, Mandarin 8, Cantonese 137); **Ready** goes to the camera; **Cannot do test** submits a `0.0` s attempt | Flow only. Replace profile lookup with a participant form and the asset IDs with the three YouTube Shorts |
| `4SquareStepTestCamera.dart` | Back camera, portrait lock, yellow grid overlay, 3-2-1-GO countdown, record, stop, upload video, route to results | Overlay geometry, countdown, flip-camera, stop-confirm dialog. Not the upload |
| `4SquareStepTestResults.dart` | Success and failure screens; headline time; collapsible "detailed metrics" in five groups; retry, keep-previous / use-current, submit | Layout and metric grouping. Not the submission logic |
| `4SquareStepTestMetrics.dart` | JSON-to-model parser for the backend response | The field list becomes the web schema (section 6) |

## 3. Backend contract (what the Flutter app expects)

- Health check: `GET {fitnessCVApiUrl}ping/`
- Analysis: `POST {fitnessCVApiUrl}Four_Square_Step_Test/`, multipart with `video` (mp4) and `filename` = `{epochMs}_{gender}_{age}_FSST.csv`
- Success: HTTP 200 and `data` object present. Anything else is shown as a failed test with the error text.
- Only one number reaches the IntelliCARE program backend: `createTimedTestAttempt({test, session, date_attempted, time_completed})`. **In these files the detailed metrics are displayed but never persisted.** The web app's Google Sheets capture will be the first place the full dataset is stored.

## 4. Grid overlay, decoded

`getGridCoordinates(W, H)` works in camera-frame pixels (portrait, W < H). The overlay is a perspective trapezoid plus a cross, drawn in yellow with labels 1-4.

| Quantity | Formula |
|---|---|
| `gw` (bottom width) | `W / 1.5` |
| `gwf` (top width) | `0.9 * gw` |
| `gh` (height) | `gw / 1.5` (= `W / 2.25`) |
| Bottom edge y | `0.975 * H` |
| Top edge y | `0.975 * H - gh` |
| Bottom corners x | `W/2 ± gw/2` (0.167 W to 0.833 W) |
| Top corners x | `W/2 ± gwf/2` (0.200 W to 0.800 W) |
| Vertical cross | x = `W/2`, from top edge to bottom edge |
| Horizontal cross | y = `bottom - gh/2`, length `0.95 * gw` (equals the trapezoid width at mid-height) |

Worked example, 720 x 1280 frame: bottom edge y 1248, top edge y 928, bottom x 120-600, top x 144-576, cross centre (360, 1088). **The whole grid sits in the bottom quarter of a 9:16 frame** (bottom third for 3:4), so the camera is low and near the cross, and the body extends far above the grid. Controls must therefore not be overlaid on the bottom of the video in the web app.

Label positions give this layout (image view, camera side at the bottom):

```
 far   +-----+-----+
       |  4  |  1  |   1 = start square
       +-----+-----+
       |  3  |  2  |
 near  +-----+-----+   <- camera
```

Working through the numbering: the participant starts in 1 and faces 2, with 4 on their right, which matches the SRA description only if **the camera is in front of the participant and they face it for the whole test.** (Screen-left is the participant's right.) This is inferred, not stated in the code.

Implied sequence (8 stages, 16 foot contacts):

| Stage | Target square | Move relative to participant |
|---|---|---|
| 1 | 2 | forward |
| 2 | 3 | right |
| 3 | 4 | backward |
| 4 | 1 | left (clockwise lap complete) |
| 5 | 4 | right |
| 6 | 3 | forward |
| 7 | 2 | left |
| 8 | 1 | backward (anticlockwise lap complete) |

SRA protocol (fetched): timing starts when the first foot contacts square 2 and stops when the last foot contacts square 1; both feet must touch the floor in every square; the participant faces forward throughout; two timed trials, the faster time is the score; one practice trial may be allowed.

**Gap (resolved in brief v2):** the code never states the physical size of the cross. The author confirmed the dimension does not matter provided each square holds both feet, so v2 uses a scale-free unit grid (one unit = one arm length). Metre values use an operator-entered arm length if given, else a body-based estimate, else are left empty. (An earlier draft assumed 90 cm as a "standard cane length"; that claim could not be verified and was removed. A Physiopedia summary gives roughly 100 cm canes, and the literature varies.)

## 5. Defects and design risks in the Dart code

| # | Finding | Web action |
|---|---|---|
| 1 | `sequence_error_count` is declared and in the constructor but **never parsed** in `fromJson` and never displayed | Include it; it is core to a stepping test |
| 2 | `parseDouble` returns `-1.0` for null on required fields, so a missing value would display as `-1.00` | Use `null` and render a dash |
| 3 | `step_width_mean_m_raw` reads the same JSON key as `step_width_mean_m` (redundant) | Single field |
| 4 | Success is decided by HTTP 200 plus presence of `data`; the payload's `success` and `test_status` are ignored, so an incomplete sequence returned with 200 would show "Congratulations" | Decide status from the analysis result |
| 5 | Network and server errors are shown as "Test failed" with the raw exception text | Separate test outcome from upload outcome |
| 6 | **Cannot do test** submits `time_completed: 0.0`, indistinguishable from a real time | Record `test_status = CANNOT_DO`, time = null |
| 7 | Retry from the results screen passes `gender: ''` and `age: ''`, so retried uploads get a blank-demographic filename | Keep the participant record in app state |
| 8 | Keep-previous / use-current lets the user choose which time to submit; the protocol scores the faster of two trials | Store every trial; best-of-two is computed, not chosen |
| 9 | Recording is stopped by a manual tap; test time comes from offline video analysis | Auto-start on first foot contact, auto-stop on last contact in square 1, manual stop as a safety fallback |
| 10 | `enableAudio: true` on the recorder (unneeded mic permission) | No audio, and no video stored at all |
| 11 | No readiness check before START (feet and full body in frame, aligned with the floor cross) and no safety/consent checkboxes | Add, as in STS |
| 12 | `framesPerSentFrame` / `ratioOfFramesToSend`, `printJson` are dead or debug code | Drop |
| 13 | No pose markers are drawn anywhere, so the user cannot see what is being tracked | Always visible in the web app (requirement) |
| 14 | `fall_risk_tier` is an unconstrained string, and `stage_progress`, `current_stage`, `total_frames`, `success` are parsed but not shown | Define enums; show stage progress |

## 6. Metric inventory and web feasibility

"Defined" means the web brief gives an explicit operational definition. The Dart code names these fields but defines none of them, so every definition below marked **assumed** must be confirmed against the backend or by you.

| Dart field | Type | Shown in Flutter | Web status |
|---|---|---|---|
| `time_to_complete_s` | double | Headline | Defined (SRA start/stop rule) |
| `clockwise_time_s`, `anticlockwise_time_s`, `phase_time_ratio` | double? | Directional timing | Defined, **assumed** split point (end of stage 4) |
| `avg_step_duration_s`, `step_variability_s`, `step_duration_cv_pct` | double | Stepping | Defined, **assumed** (step = first-foot contact to next first-foot contact) |
| `step_length_mean_m`, `step_length_left_m`, `step_length_right_m`, `step_symmetry_index_pct` | double | Stepping / symmetry | Defined, **assumed**; computed on a unit grid, metres via entered or estimated arm length (symmetry index is scale-free) |
| `step_width_mean_m` (+ `_raw`) | double | Stepping | Defined as inter-foot distance at double support, **assumed** |
| `hesitation_count` | int | Stepping | Defined, **assumed** threshold |
| `line_touch_count` | int | Stepping | Defined; **low confidence** from a 2D camera (foot above the line looks like contact) |
| `sequence_error_count` | int? | Never shown | Defined |
| `double_support_time_ratio_pct` | double? | Stability | Defined |
| `interlimb_coordination_s` | double? | Stability | Defined, **assumed** (lead-to-trail foot contact lag) |
| `peak_trunk_angle_deg`, `mean_trunk_angular_velocity_deg_s` | double? | Stability | Defined, **assumed**; frontal-plane tilt primary because the camera sees the participant from the front |
| `near_fall_event` | bool | Risk | Defined, experimental, not validated |
| `fall_risk_tier` | string? | Risk | Defined as a configurable cut-off classification; **the Flutter tier names are unknown** |
| `agility_score`, `stability_score`, `instability_score` | num? | Stability / agility | **Not definable from the code.** Brief reserves the columns (null) until you supply the formulas |
| `success`, `test_status`, `failure_reason`, `current_stage`, `stage_progress`, `total_frames` | mixed | Failure screen / unused | Replaced by `test_status` enum, `failure_reason`, `stage_progress` ("n/8"), `frames_analysed` |

## 7. Feasibility risks for browser-side CV

- **Frontal view.** Depth along the camera axis is the weakest MediaPipe dimension, so floor positions must come from an image-to-floor homography (four grid corners to a known square), not from MediaPipe z. Forward trunk lean is not reliably measurable from the front.
- **Foot occlusion.** The far foot is often hidden by the near foot when stepping toward or away from the camera. Expect landmark gaps; QC flags and visibility gating are required.
- **Foot contact from a low oblique camera.** An airborne foot projects to the wrong floor location. Contact must be detected from foot-speed and lift, not from position alone.
- **Grid alignment.** A fixed fractional overlay only matches the tape cross at one camera distance and height. The web app needs an adjustable overlay (drag and pinch) and must record the adjustment, since it drives all metre-based outputs.
- **Frame rate.** Stepping is faster than sit-to-stand. Aim for 30 fps detection; flag below 15 fps (same rule as STS).
- **Safety.** FSST is a fall-risk test. Keep the operator-safety checkbox and require a spotter for at-risk participants.
- **Orientation.** Browsers cannot reliably lock portrait (iOS cannot). Use a rotate-to-portrait blocker during the live session.
- **Thresholds are not validated.** As in STS, every threshold is an engineering default tagged `[TUNE]` pending pilot data. This is a screening and research tool, not a medical device.

## 8. Questions that would change the build

1. Can you share the backend Python for `Four_Square_Step_Test/`? (Most valuable.)
2. What are the real tape-cross dimensions, and is the outer boundary virtual (overlay only)?
3. Can you paste the `fsst.*` translation strings (especially `fsst.align_instruction`)? They hold the camera-placement wording.
4. Which fall-risk cut-off should drive `fall_risk_tier`? SRA lists more than 15 s for adults 65 and over; 10.14 s (hard surface) and 11.21 s (foam) in one study; more than 12 s for vestibular disorders. The brief defaults to 15 s and makes it configurable.
5. Do you have formulas for `agility_score`, `stability_score` and `instability_score`, or should they be dropped?
6. Trials: practice plus two timed trials with best-of-two (SRA protocol, brief default), or a single trial?

## 9. Author's answers (2026-10-15) and where they landed

| Question | Answer | Applied in |
|---|---|---|
| Backend Python available? | No; generate the logic from the FSST protocol | Brief v2 section 9 (full specification with pseudocode) |
| Cross dimensions | Not important if each square fits both feet | Brief v2 sections 5 and 7 (scale-free) |
| Translation strings | Not available; estimate camera placement by logic | Brief v2 section 5 (derived, to be confirmed in the pilot) |
| Trials | Practice plus two timed; fastest of the three | Brief v2 section 4.7 (protocol score of the two timed trials shown alongside) |
| Fall-risk cut-off | Use peer-reviewed values, as clinically accurate as possible | Brief v2 section 9.9 and `FSST_Clinical_Reference.md` |
| Agility / stability / instability scores | Not answered | Still reserved (null) |

## Sources

- SRA Lab, Four Square Step Test: https://www.sralab.org/rehabilitation-measures/four-square-step-test
- STS reference app and repo: https://github.com/aaron-chen-angus/icare-sts
