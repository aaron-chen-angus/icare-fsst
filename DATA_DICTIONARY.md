# FSST//LAB — Data Dictionary

_Generated from `js/schema.js` and `js/config.js` by `tools/build-dictionary.js`. Do not hand-edit._

App version 1.0.0 · analysis 1.0.0 · schema 1.0.

This is a screening and research tool, not a medical device. Status: **defined** (operationally specified), **assumed** (inferred — the original backend was never available), **reserved** (column kept null until a formula is supplied).

## Sessions

| Field | Type | Unit | Status | Description | Calculation |
|---|---|---|---|---|---|
| **Session & participant** | | | | | |
| `session_id` | string | - | defined | Unique identifier (UUID v4) created in the browser, one per trial. Links Sessions, Stages, Contacts, Frames; used to de-duplicate re-sent uploads. | crypto.randomUUID() |
| `attempt_group_id` | string | - | defined | Shared by the practice and two timed trials of one participant session. Group scores are computed over rows with the same value. | crypto.randomUUID() per participant |
| `trial_slot` | categorical | PRACTICE \| TIMED_1 \| TIMED_2 | defined | Which protocol slot this attempt fills. |  |
| `attempt_in_slot` | integer | - | defined | Attempt number within the slot (1 = first; increases on repeat). |  |
| `is_practice` | boolean | - | defined | True when trial_slot = PRACTICE. The published protocol score excludes practice. |  |
| `repeat_reason` | string | - | defined | Why this slot was repeated (sequence error, incomplete, tracking failure, operator). Empty for the first attempt. |  |
| `timestamp_utc` | datetime | ISO 8601 (UTC) | defined | Moment the analysis completed. | new Date().toISOString() |
| `utc_offset_min` | integer | min | defined | Local time-zone offset from UTC (local = UTC + offset). | -new Date().getTimezoneOffset() |
| `app_version` | string | - | defined | Application version. | CONFIG.app.version |
| `analysis_version` | string | - | defined | Analysis algorithm version; changes when any metric definition or threshold logic changes. | CONFIG.app.analysisVersion |
| `schema_version` | string | - | defined | Version of this data schema. | CONFIG.app.schemaVersion |
| `participant_id` | string | - | defined | Pseudonymous participant code. Do not enter real names. | Operator input |
| `age_years` | integer | years | defined | Participant age at test (drives the age-gated cut-off). | Operator input |
| `sex` | categorical | female \| male \| other | defined | Participant sex (recorded; not used for classification). | Operator input |
| `height_cm` | number | cm | defined | Standing height. Used for the body-based arm-length estimate when none is entered. | Operator input |
| `body_mass_kg` | number | kg | defined | Body mass (optional; recorded only). | Operator input |
| `population` | categorical | older_adult_community \| vestibular \| amputation_transtibial \| parkinson \| stroke_acute \| other_none | defined | Clinical population; selects the fall-risk cut-off. | Operator input |
| `assistive_device` | categorical | none \| cane \| walker \| other | defined | Assistive device used (SRA requires recording). | Operator input |
| `surface` | categorical | hard \| foam \| other | defined | Floor surface (cut-offs assume a hard surface). | Operator input |
| `site` | string | - | defined | Free-text collection site / session label. | Operator input |
| `operator_notes` | string | - | defined | Free-text notes. Do not enter identifying information. | Operator input |
| **Device & pose model** | | | | | |
| `pose_model` | categorical | lite \| full \| heavy | defined | MediaPipe Pose Landmarker variant used. | Operator selection |
| `pose_delegate` | categorical | GPU \| CPU | defined | Inference delegate actually used (GPU falls back to CPU). | MediaPipe init |
| `camera_facing` | categorical | environment \| user | defined | Camera used: rear (environment, default) or front (user). | Operator selection |
| `video_width_px` | integer | px | defined | Width of the analysed video stream. | HTMLVideoElement.videoWidth |
| `video_height_px` | integer | px | defined | Height of the analysed video stream. | HTMLVideoElement.videoHeight |
| `user_agent` | string | - | defined | Browser user-agent (truncated to 200 characters). | navigator.userAgent |
| **Protocol** | | | | | |
| `instruction_language` | categorical | english \| mandarin \| cantonese | defined | Language of the instructional video opened on the entry screen. |  |
| `video_opened` | boolean | - | defined | A demo video was opened before proceeding. |  |
| `safety_confirmed` | boolean | - | defined | Operator confirmed the participant is fit and a spotter is present if needed. |  |
| `setup_confirmed` | boolean | - | defined | Operator confirmed the participant saw the instructions and the floor cross is set up. |  |
| `consent_upload` | boolean | - | defined | Participant consented to upload of the derived numeric results. |  |
| `headline_basis` | categorical | all \| timed | defined | Which score basis is used as the headline (config protocol.headlineBasis). | CONFIG.protocol.headlineBasis |
| `planned_max_duration_s` | number | s | defined [TUNE] | Maximum trial duration before auto-INCOMPLETE. | CONFIG.protocol.maxTrialS |
| `test_duration_s` | number | s | defined | Wall-clock duration of the trial from GO to end. |  |
| `manual_stop` | boolean | - | defined | The operator stopped the trial early (safety). |  |
| `filter_cutoff_feet_hz` | number | Hz | defined [TUNE] | Effective -3 dB cutoff of the zero-lag filter on foot coordinates. | CONFIG.signal.cutoffFeetHz |
| `filter_cutoff_trunk_hz` | number | Hz | defined | Effective -3 dB cutoff of the zero-lag filter on trunk coordinates. | CONFIG.signal.cutoffTrunkHz |
| `resample_hz` | number | Hz | defined | Uniform sampling rate of the analysed time series. | CONFIG.signal.resampleHz |
| **Grid & scale** | | | | | |
| `arm_length_cm` | number | cm | defined | Length of one tape arm (centre to tip). Entered, estimated, or null. |  |
| `arm_length_source` | categorical | OPERATOR_ENTERED \| BODY_ESTIMATED \| NONE | defined | Where arm_length_cm came from (brief 7.3). |  |
| `grid_user_adjusted` | boolean | - | defined | The operator moved the grid handles from the preset. |  |
| `grid_t_x` | number | 0-1 | defined | Far arm-tip handle, normalised image x. |  |
| `grid_t_y` | number | 0-1 | defined | Far arm-tip handle, normalised image y. |  |
| `grid_r_x` | number | 0-1 | defined | Right arm-tip handle, normalised image x. |  |
| `grid_r_y` | number | 0-1 | defined | Right arm-tip handle, normalised image y. |  |
| `grid_b_x` | number | 0-1 | defined | Near arm-tip handle, normalised image x. |  |
| `grid_b_y` | number | 0-1 | defined | Near arm-tip handle, normalised image y. |  |
| `grid_l_x` | number | 0-1 | defined | Left arm-tip handle, normalised image x. |  |
| `grid_l_y` | number | 0-1 | defined | Left arm-tip handle, normalised image y. |  |
| **Status** | | | | | |
| `test_status` | categorical | COMPLETED \| INCOMPLETE \| INVALID_SEQUENCE \| TRACKING_FAILED \| CANNOT_DO \| ABORTED | defined | Outcome of the trial. |  |
| `failure_reason` | string | - | defined | Human-readable reason when the trial did not complete. |  |
| `current_stage` | integer | - | defined | Stage index reached (0-8). |  |
| `stage_progress` | string | n/8 | defined | Stages completed out of 8. |  |
| `stages_completed` | integer | - | defined | Number of stages completed. |  |
| **Primary outcomes** | | | | | |
| `time_to_complete_s` | number | s | defined | First-foot contact in square 2 to last-foot contact in square 1 at stage 8 [CLINICAL]. |  |
| `live_time_s` | number | s | defined | Time shown live during the trial (causal). Recorded to audit the offline value. |  |
| `time_difference_s` | number | s | defined | time_to_complete_s minus live_time_s. |  |
| `t_start_s` | number | s | defined | First-foot contact in square 2 (timer start), seconds from GO. |  |
| `t_stop_s` | number | s | defined | Last-foot contact in square 1 at stage 8 (timer stop), seconds from GO. |  |
| `clockwise_time_s` | number | s | assumed | Stage 1-4 duration (second contact of stage 4 minus t_start). |  |
| `anticlockwise_time_s` | number | s | assumed | Stage 5-8 duration (t_stop minus second contact of stage 4). |  |
| `phase_time_ratio` | number | - | assumed | anticlockwise_time_s / clockwise_time_s. |  |
| `fall_risk_tier` | categorical | ELEVATED \| LOWER \| NOT_CLASSIFIED | defined | Fall-risk tier for this trial given the population cut-off. |  |
| `risk_note` | string | - | defined | Reason for NOT_CLASSIFIED (NO_VALIDATED_CUTOFF \| AGE_BELOW_COHORT \| INVALID_TRIAL) or caveat text. |  |
| `risk_population` | string | - | defined | Population used for the cut-off. |  |
| `risk_cutoff_s` | number | s | defined | Cut-off time applied (null when none). |  |
| `risk_rule` | string | - | defined | Comparison rule (time_gt \| fail_or_time_gt \| none). |  |
| `risk_cutoff_source` | string | - | defined | Literature source of the cut-off (see FSST_Clinical_Reference.md). |  |
| **Stepping** | | | | | |
| `avg_step_duration_s` | number | s | defined | Mean stage duration D_k. |  |
| `step_variability_s` | number | s | defined | Sample SD (n-1) of stage durations. |  |
| `step_duration_cv_pct` | number | % | defined | 100 x SD / mean of stage durations. |  |
| `step_length_mean_m` | number | m | defined | Mean of all 16 per-foot stage step lengths (null if no scale). |  |
| `step_length_left_m` | number | m | defined | Mean of the 8 left-foot step lengths. |  |
| `step_length_right_m` | number | m | defined | Mean of the 8 right-foot step lengths. |  |
| `step_symmetry_index_pct` | number | % | defined | 100 x \|L - R\| / (0.5 x (L + R)) (Robinson; scale-free). |  |
| `step_width_mean_m` | number | m | assumed | Mean inter-foot distance at double support per stage (null if no scale). |  |
| `hesitation_count` | integer | - | defined [TUNE] | Intervals where both feet were grounded longer than protocol.hesitationS. |  |
| `line_touch_count` | integer | - | defined | Contact episodes on a tape line (low confidence from 2D). |  |
| `sequence_error_count` | integer | - | defined | Contacts in a wrong square (brief 9.4). |  |
| `extra_contact_count` | integer | - | defined | Extra adjustments within the target/previous square. |  |
| `double_support_time_ratio_pct` | number | % | defined | Share of [t_start, t_stop] with both feet grounded. |  |
| `interlimb_coordination_s` | number | s | assumed | Mean per-stage lag between first and second foot contact. |  |
| **Trunk & stability** | | | | | |
| `peak_trunk_angle_deg` | number | deg | assumed | Peak absolute lateral trunk deviation from the pre-roll baseline (frontal plane, 2D). |  |
| `mean_trunk_angular_velocity_deg_s` | number | deg/s | assumed | Mean absolute trunk angular velocity over the timed window. |  |
| `peak_trunk_incl_3d_deg` | number | deg | assumed | Optional peak trunk inclination from world landmarks (null when unavailable). |  |
| `near_fall_event` | boolean | - | assumed | EXPERIMENTAL, unvalidated: large trunk deviation coincident with an extra contact or error. |  |
| `agility_score` | number | - | reserved | RESERVED. No published definition available; left null. |  |
| `stability_score` | number | - | reserved | RESERVED. No published definition available; left null. |  |
| `instability_score` | number | - | reserved | RESERVED. No published definition available; left null. |  |
| **Quality control** | | | | | |
| `effective_fs_hz` | number | Hz | defined | Frames analysed per second over the trial (detector throughput). |  |
| `frames_analysed` | integer | - | defined | Number of pose frames buffered for the trial. |  |
| `valid_frame_pct` | number | % | defined | Percent of frames with hips, knees, ankles, heels and toes all valid. |  |
| `imputed_sample_pct` | number | % | defined | Percent of resampled samples lying in a gap longer than maxGapS. |  |
| `longest_gap_s` | number | s | defined | Longest interval without a confident foot detection. |  |
| `median_foot_visibility` | number | 0-1 | defined | Median of per-foot mean visibility. |  |
| `qc_flags` | string | ; separated | defined | All QC conditions triggered (see Definitions). |  |
| `qc_pass` | boolean | - | defined | True if no BLOCKING QC flag was raised. |  |
| `valid_trial` | boolean | - | defined | COMPLETED, qc_pass, and the operator verdict does not invalidate it. |  |
| **Operator verdict** | | | | | |
| `operator_valid` | boolean | - | defined | Operator marks the trial valid overall. |  |
| `operator_balance_lost` | boolean | - | defined | Operator observed loss of balance. |  |
| `operator_support_used` | boolean | - | defined | Operator observed use of support / assistive device. |  |
| `operator_not_facing_forward` | boolean | - | defined | Operator observed the participant not facing forward. |  |
| `operator_line_or_cane_contact` | boolean | - | defined | Operator observed line or cane contact (does not alone invalidate a tape trial). |  |

## Stages

| Field | Type | Unit | Status | Description | Calculation |
|---|---|---|---|---|---|
| **Stage** | | | | | |
| `session_id` | string | - | defined | Links to the Sessions sheet. |  |
| `stage` | integer | 1-8 | defined | Stage index in the sequence. |  |
| `target_square` | integer | 1-4 | defined | Target square for this stage. |  |
| `lead_foot` | categorical | L \| R | defined | Foot that contacted the target square first. |  |
| `t_first_contact_s` | number | s | defined | First foot contact time in the target square. |  |
| `t_second_contact_s` | number | s | defined | Second (trailing) foot contact time in the target square. |  |
| `t_liftoff_s` | number | s | defined | Time the lead foot left to begin the next stage (null for stage 8). |  |
| `stage_duration_s` | number | s | defined | first[k+1] - first[k]; stage 8 = t_stop - first[8]. |  |
| `dwell_s` | number | s | defined | Time both feet were in the target square before the next step. |  |
| `interlimb_lag_s` | number | s | defined | second - first contact lag. |  |
| `lead_u` | number | arm | defined | Lead-foot u (unit grid). |  |
| `lead_v` | number | arm | defined | Lead-foot v (unit grid). |  |
| `trail_u` | number | arm | defined | Trail-foot u (unit grid). |  |
| `trail_v` | number | arm | defined | Trail-foot v (unit grid). |  |
| `step_length_lead_rel` | number | arm | defined | Lead-foot step length from its previous contact (arm lengths). |  |
| `step_length_trail_rel` | number | arm | defined | Trail-foot step length from its previous contact (arm lengths). |  |
| `step_width_rel` | number | arm | defined | Distance between the two feet in this stage (arm lengths). |  |
| `line_touch` | boolean | - | defined | A contact in this stage fell on a tape line. |  |
| `sequence_error` | boolean | - | defined | A wrong-square contact occurred during this stage. |  |
| `hesitation` | boolean | - | defined | A hesitation (long double support) occurred during this stage. |  |

## Contacts

| Field | Type | Unit | Status | Description | Calculation |
|---|---|---|---|---|---|
| **Contact** | | | | | |
| `session_id` | string | - | defined | Links to the Sessions sheet. |  |
| `contact_index` | integer | - | defined | Order of the contact episode within the trial (1-based). |  |
| `foot` | categorical | L \| R | defined | Which foot. |  |
| `stage` | integer | 0-8 | defined | Stage this contact was attributed to (0 = start square). |  |
| `square` | integer | 0-4 | defined | Square the foot landed in (0 = outside). |  |
| `t_on_s` | number | s | defined | Contact onset (grounded). |  |
| `t_off_s` | number | s | defined | Contact end (lift-off). |  |
| `duration_s` | number | s | defined | t_off - t_on. |  |
| `u` | number | arm | defined | Median floor u over the episode (unit grid). |  |
| `v` | number | arm | defined | Median floor v over the episode (unit grid). |  |
| `on_line` | boolean | - | defined | Foot was on a tape line. |  |
| `is_extra` | boolean | - | defined | An extra adjustment contact (not a stage completion). |  |
| `is_error` | boolean | - | defined | A wrong-square contact. |  |
| `mean_visibility` | number | 0-1 | defined | Mean foot visibility over the episode. |  |

## Frames

| Field | Type | Unit | Status | Description | Calculation |
|---|---|---|---|---|---|
| **Analysed time series (uniform 30 Hz grid)** | | | | | |
| `session_id` | string | - | defined | Links to the Sessions sheet. |  |
| `t_s` | number | s | defined | Time relative to GO (negative = pre-roll). |  |
| `phase` | categorical | PREROLL \| RUNNING \| DONE | defined | Trial phase. |  |
| `tracking_gap` | integer | 0/1 | defined | 1 if the sample lies in a tracking gap longer than maxGapS. |  |
| `l_u` | number | arm | defined | Left foot floor u. |  |
| `l_v` | number | arm | defined | Left foot floor v. |  |
| `l_speed_shank_s` | number | shank/s | defined | Left foot shank-normalised speed. |  |
| `l_grounded` | integer | 0/1 | defined | Left foot grounded. |  |
| `r_u` | number | arm | defined | Right foot floor u. |  |
| `r_v` | number | arm | defined | Right foot floor v. |  |
| `r_speed_shank_s` | number | shank/s | defined | Right foot shank-normalised speed. |  |
| `r_grounded` | integer | 0/1 | defined | Right foot grounded. |  |
| `trunk_dev_deg` | number | deg | defined | Lateral trunk deviation from baseline. |  |
| `trunk_angvel_deg_s` | number | deg/s | defined | Trunk angular velocity. |  |

## Tracked landmarks (MediaPipe Pose, 17 of 33)

| Key | MediaPipe index | Name | Role |
|---|---|---|---|
| `nose` | 0 | nose | Frame-fit / full-body check; trunk tilt uses shoulders & hips. |
| `l_sh` | 11 | left_shoulder | Mid-shoulder for trunk tilt. |
| `r_sh` | 12 | right_shoulder | Mid-shoulder for trunk tilt. |
| `l_el` | 13 | left_elbow | Recorded for reference (not used in metrics). |
| `r_el` | 14 | right_elbow | Recorded for reference (not used in metrics). |
| `l_wr` | 15 | left_wrist | Recorded for reference (not used in metrics). |
| `r_wr` | 16 | right_wrist | Recorded for reference (not used in metrics). |
| `l_hip` | 23 | left_hip | Mid-hip for trunk tilt; body-scale shank reference. |
| `r_hip` | 24 | right_hip | Mid-hip for trunk tilt. |
| `l_kn` | 25 | left_knee | Shank length (scale); leg geometry. |
| `r_kn` | 26 | right_knee | Shank length (scale); leg geometry. |
| `l_an` | 27 | left_ankle | Foot point (with heel/toe); shank length. |
| `r_an` | 28 | right_ankle | Foot point (with heel/toe); shank length. |
| `l_heel` | 29 | left_heel | Foot point; contact detection. |
| `r_heel` | 30 | right_heel | Foot point; contact detection. |
| `l_toe` | 31 | left_foot_index | Foot point; contact detection. |
| `r_toe` | 32 | right_foot_index | Foot point; contact detection. |

## Quality-control flags

Blocking flags set `qc_pass = false`.

| Flag | Blocking |
|---|---|
| `LOW_FPS` | yes |
| `LOW_VALID_FRAMES` | yes |
| `TRACKING_GAPS` | yes |
| `FOOT_OCCLUSION` | yes |
| `NO_TIME_CAPTURED` | yes |
| `NOT_IN_START_SQUARE` | no |
| `MOVED_BEFORE_GO` | no |
| `SEQUENCE_ERROR` | no |
| `INCOMPLETE_SEQUENCE` | no |
| `MANUAL_STOP` | no |
| `TIMEOUT` | no |
| `GRID_NOT_CONFIRMED` | no |
| `PROTOCOL_ADAPTATION_TAPE` | no |
| `GRID_USER_ADJUSTED` | no |
| `SCALE_ESTIMATED` | no |
| `SCALE_UNAVAILABLE` | no |
| `LINE_TOUCH_LOW_CONFIDENCE` | no |
| `HIGH_TRUNK_DEVIATION` | no |
| `PARTIAL_BODY_IN_FRAME` | no |
| `PRACTICE_TRIAL` | no |

## Parameters (from `js/config.js`)

`[TUNE]` values are engineering defaults pending the Phase 8 validation pilot.

| Parameter | Value |
|---|---|
| `signal.resampleHz` | 30 |
| `signal.cutoffFeetHz` | 8 |
| `signal.cutoffTrunkHz` | 6 |
| `signal.maxGapS` | 0.25 |
| `signal.minVisibility` | 0.5 |
| `signal.padSamples` | 30 |
| `contacts.vOnShankS` | 0.4 |
| `contacts.vOffShankS` | 0.8 |
| `contacts.mergeGapS` | 0.06 |
| `contacts.minContactS` | 0.1 |
| `contacts.onsetBiasS` | 0 |
| `contacts.shankWindowS` | 0.5 |
| `geometry.lineBandRel` | 0.06 |
| `geometry.outsideMarginRel` | 0.15 |
| `geometry.footLengthRel` | 0.35 |
| `geometry.minShankPx` | 20 |
| `trunk.nearFallDevDeg` | 20 |
| `trunk.nearFallWindowS` | 1 |
| `qc.minEffectiveFps` | 15 |
| `qc.minValidFramePct` | 90 |
| `qc.maxImputedPct` | 10 |
| `qc.maxLongestGapS` | 0.5 |
| `qc.maxFootOcclusionPct` | 20 |
| `protocol.sequence` | [2,3,4,1,4,3,2,1] |
| `protocol.countdownS` | 3 |
| `protocol.preRollS` | 1 |
| `protocol.tailS` | 1 |
| `protocol.maxTrialS` | 60 |
| `protocol.restS` | 60 |
| `protocol.hesitationS` | 0.6 |
| `protocol.maxRepeatsPerSlot` | 2 |
| `protocol.headlineBasis` | "all" |
| `anthropometry.shankFractionOfHeight` | 0.246 |

## Fall-risk cut-offs [CLINICAL]

Strict greater-than; classification only when a validated cut-off applies to the selected population and age. Sources in `docs/FSST_Clinical_Reference.md`.

| Population | Cut-off (s) | Rule | Min age | Source |
|---|---|---|---|---|
| `older_adult_community` | 15 | time_gt | 65 | Dite & Temple 2002; reaffirmed Cleary & Skornyakov 2017 |
| `vestibular` | 12 | time_gt | 0 | Whitney et al. 2007 |
| `amputation_transtibial` | 24 | time_gt | 0 | Dite et al. 2007 |
| `parkinson` | 9.68 | time_gt | 0 | Duncan & Earhart 2013 |
| `stroke_acute` | 15 | fail_or_time_gt | 0 | Blennerhassett & Jayalath 2008 |
| `other_none` | — | none | 0 | No validated cut-off |

### Alternative published values (not used for classification)

| Label | Value (s) | Source |
|---|---|---|
| Older adults, hard surface | 10.14 | Mathurapongsakul & Siriphorn 2018 (SRA notes inconsistent sens/spec) |
| Older adults, foam | 11.21 | Mathurapongsakul & Siriphorn 2018 |
| Chronic stroke vs healthy | 11 | Goh et al. 2013 (discrimination, not fall risk) |

**Tape caveat.** The cut-offs were derived with canes laid on the floor. A flat tape cross removes the obstacle and may shorten times; `PROTOCOL_ADAPTATION_TAPE` is raised on every trial.
