/**
 * FSST//LAB — Data schema (single source of truth)
 *
 * Every exported field is declared here. The analysis code refuses to emit an
 * undocumented summary field; the CSV/ZIP/Sheets exporters take their column order
 * from here; tools/build-dictionary.js renders DATA_DICTIONARY.md from it.
 *
 * Conventions: times in seconds relative to GO (t = 0); floor positions in unit-grid
 * coordinates where one unit = one arm length; angles in degrees; null = not computable.
 * status: defined (operationally specified in the brief) | assumed (inferred, no backend) |
 *         reserved (column kept null until a formula is supplied).
 */
const SCHEMA = (function () {
    // F(key, type, unit, desc, {calc, status, dart, tune})
    const F = (key, type, unit, desc, opt) => Object.assign(
        { key, type, unit, desc, calc: '', status: 'defined', dart_name: '', tune: false },
        opt || {}
    );
    const G = (group, fields) => fields.map(f => Object.assign({ group }, f));

    const sessions = [].concat(
        G('Session & participant', [
            F('session_id', 'string', '-', 'Unique identifier (UUID v4) created in the browser, one per trial. Links Sessions, Stages, Contacts, Frames; used to de-duplicate re-sent uploads.', { calc: 'crypto.randomUUID()' }),
            F('attempt_group_id', 'string', '-', 'Shared by the practice and two timed trials of one participant session. Group scores are computed over rows with the same value.', { calc: 'crypto.randomUUID() per participant' }),
            F('trial_slot', 'categorical', 'PRACTICE | TIMED_1 | TIMED_2', 'Which protocol slot this attempt fills.'),
            F('attempt_in_slot', 'integer', '-', 'Attempt number within the slot (1 = first; increases on repeat).'),
            F('is_practice', 'boolean', '-', 'True when trial_slot = PRACTICE. The published protocol score excludes practice.'),
            F('repeat_reason', 'string', '-', 'Why this slot was repeated (sequence error, incomplete, tracking failure, operator). Empty for the first attempt.'),
            F('timestamp_utc', 'datetime', 'ISO 8601 (UTC)', 'Moment the analysis completed.', { calc: 'new Date().toISOString()' }),
            F('utc_offset_min', 'integer', 'min', 'Local time-zone offset from UTC (local = UTC + offset).', { calc: '-new Date().getTimezoneOffset()' }),
            F('app_version', 'string', '-', 'Application version.', { calc: 'CONFIG.app.version' }),
            F('analysis_version', 'string', '-', 'Analysis algorithm version; changes when any metric definition or threshold logic changes.', { calc: 'CONFIG.app.analysisVersion' }),
            F('schema_version', 'string', '-', 'Version of this data schema.', { calc: 'CONFIG.app.schemaVersion' }),
            F('participant_id', 'string', '-', 'Pseudonymous participant code. Do not enter real names.', { calc: 'Operator input' }),
            F('age_years', 'integer', 'years', 'Participant age at test (drives the age-gated cut-off).', { calc: 'Operator input' }),
            F('sex', 'categorical', 'female | male | other', 'Participant sex (recorded; not used for classification).', { calc: 'Operator input' }),
            F('height_cm', 'number', 'cm', 'Standing height. Used for the body-based arm-length estimate when none is entered.', { calc: 'Operator input' }),
            F('body_mass_kg', 'number', 'kg', 'Body mass (optional; recorded only).', { calc: 'Operator input' }),
            F('population', 'categorical', 'older_adult_community | vestibular | amputation_transtibial | parkinson | stroke_acute | other_none', 'Clinical population; selects the fall-risk cut-off.', { calc: 'Operator input' }),
            F('assistive_device', 'categorical', 'none | cane | walker | other', 'Assistive device used (SRA requires recording).', { calc: 'Operator input' }),
            F('surface', 'categorical', 'hard | foam | other', 'Floor surface (cut-offs assume a hard surface).', { calc: 'Operator input' }),
            F('site', 'string', '-', 'Free-text collection site / session label.', { calc: 'Operator input' }),
            F('operator_notes', 'string', '-', 'Free-text notes. Do not enter identifying information.', { calc: 'Operator input' })
        ]),
        G('Device & pose model', [
            F('pose_model', 'categorical', 'lite | full | heavy', 'MediaPipe Pose Landmarker variant used.', { calc: 'Operator selection' }),
            F('pose_delegate', 'categorical', 'GPU | CPU', 'Inference delegate actually used (GPU falls back to CPU).', { calc: 'MediaPipe init' }),
            F('camera_facing', 'categorical', 'environment | user', 'Camera used: rear (environment, default) or front (user).', { calc: 'Operator selection' }),
            F('video_width_px', 'integer', 'px', 'Width of the analysed video stream.', { calc: 'HTMLVideoElement.videoWidth' }),
            F('video_height_px', 'integer', 'px', 'Height of the analysed video stream.', { calc: 'HTMLVideoElement.videoHeight' }),
            F('user_agent', 'string', '-', 'Browser user-agent (truncated to 200 characters).', { calc: 'navigator.userAgent' })
        ]),
        G('Protocol', [
            F('instruction_language', 'categorical', 'english | mandarin | cantonese', 'Language of the instructional video opened on the entry screen.'),
            F('video_opened', 'boolean', '-', 'A demo video was opened before proceeding.'),
            F('safety_confirmed', 'boolean', '-', 'Operator confirmed the participant is fit and a spotter is present if needed.'),
            F('setup_confirmed', 'boolean', '-', 'Operator confirmed the participant saw the instructions and the floor cross is set up.'),
            F('consent_upload', 'boolean', '-', 'Participant consented to upload of the derived numeric results.'),
            F('headline_basis', 'categorical', 'all | timed', 'Which score basis is used as the headline (config protocol.headlineBasis).', { calc: 'CONFIG.protocol.headlineBasis' }),
            F('planned_max_duration_s', 'number', 's', 'Maximum trial duration before auto-INCOMPLETE.', { calc: 'CONFIG.protocol.maxTrialS', tune: true }),
            F('test_duration_s', 'number', 's', 'Wall-clock duration of the trial from GO to end.'),
            F('manual_stop', 'boolean', '-', 'The operator stopped the trial early (safety).'),
            F('filter_cutoff_feet_hz', 'number', 'Hz', 'Effective -3 dB cutoff of the zero-lag filter on foot coordinates.', { calc: 'CONFIG.signal.cutoffFeetHz', tune: true }),
            F('filter_cutoff_trunk_hz', 'number', 'Hz', 'Effective -3 dB cutoff of the zero-lag filter on trunk coordinates.', { calc: 'CONFIG.signal.cutoffTrunkHz' }),
            F('resample_hz', 'number', 'Hz', 'Uniform sampling rate of the analysed time series.', { calc: 'CONFIG.signal.resampleHz' })
        ]),
        G('Grid & scale', [
            F('arm_length_cm', 'number', 'cm', 'Length of one tape arm (centre to tip). Entered, estimated, or null.'),
            F('arm_length_source', 'categorical', 'OPERATOR_ENTERED | BODY_ESTIMATED | NONE', 'Where arm_length_cm came from (brief 7.3).'),
            F('grid_user_adjusted', 'boolean', '-', 'The operator moved the grid handles from the preset.'),
            F('grid_t_x', 'number', '0-1', 'Far arm-tip handle, normalised image x.'),
            F('grid_t_y', 'number', '0-1', 'Far arm-tip handle, normalised image y.'),
            F('grid_r_x', 'number', '0-1', 'Right arm-tip handle, normalised image x.'),
            F('grid_r_y', 'number', '0-1', 'Right arm-tip handle, normalised image y.'),
            F('grid_b_x', 'number', '0-1', 'Near arm-tip handle, normalised image x.'),
            F('grid_b_y', 'number', '0-1', 'Near arm-tip handle, normalised image y.'),
            F('grid_l_x', 'number', '0-1', 'Left arm-tip handle, normalised image x.'),
            F('grid_l_y', 'number', '0-1', 'Left arm-tip handle, normalised image y.')
        ]),
        G('Status', [
            F('test_status', 'categorical', 'COMPLETED | INCOMPLETE | INVALID_SEQUENCE | TRACKING_FAILED | CANNOT_DO | ABORTED', 'Outcome of the trial.'),
            F('failure_reason', 'string', '-', 'Human-readable reason when the trial did not complete.'),
            F('current_stage', 'integer', '-', 'Stage index reached (0-8).'),
            F('stage_progress', 'string', 'n/8', 'Stages completed out of 8.'),
            F('stages_completed', 'integer', '-', 'Number of stages completed.')
        ]),
        G('Primary outcomes', [
            F('time_to_complete_s', 'number', 's', 'First-foot contact in square 2 to last-foot contact in square 1 at stage 8 [CLINICAL].', { dart: 'time_to_complete_s' }),
            F('live_time_s', 'number', 's', 'Time shown live during the trial (causal). Recorded to audit the offline value.'),
            F('time_difference_s', 'number', 's', 'time_to_complete_s minus live_time_s.'),
            F('t_start_s', 'number', 's', 'First-foot contact in square 2 (timer start), seconds from GO.'),
            F('t_stop_s', 'number', 's', 'Last-foot contact in square 1 at stage 8 (timer stop), seconds from GO.'),
            F('clockwise_time_s', 'number', 's', 'Stage 1-4 duration (second contact of stage 4 minus t_start).', { status: 'assumed', dart: 'clockwise_time_s' }),
            F('anticlockwise_time_s', 'number', 's', 'Stage 5-8 duration (t_stop minus second contact of stage 4).', { status: 'assumed', dart: 'anticlockwise_time_s' }),
            F('phase_time_ratio', 'number', '-', 'anticlockwise_time_s / clockwise_time_s.', { status: 'assumed', dart: 'phase_time_ratio' }),
            F('fall_risk_tier', 'categorical', 'ELEVATED | LOWER | NOT_CLASSIFIED', 'Fall-risk tier for this trial given the population cut-off.', { dart: 'fall_risk_tier' }),
            F('risk_note', 'string', '-', 'Reason for NOT_CLASSIFIED (NO_VALIDATED_CUTOFF | AGE_BELOW_COHORT | INVALID_TRIAL) or caveat text.'),
            F('risk_population', 'string', '-', 'Population used for the cut-off.'),
            F('risk_cutoff_s', 'number', 's', 'Cut-off time applied (null when none).'),
            F('risk_rule', 'string', '-', 'Comparison rule (time_gt | fail_or_time_gt | none).'),
            F('risk_cutoff_source', 'string', '-', 'Literature source of the cut-off (see FSST_Clinical_Reference.md).')
        ]),
        G('Stepping', [
            F('avg_step_duration_s', 'number', 's', 'Mean stage duration D_k.', { dart: 'avg_step_duration_s' }),
            F('step_variability_s', 'number', 's', 'Sample SD (n-1) of stage durations.', { dart: 'step_variability_s' }),
            F('step_duration_cv_pct', 'number', '%', '100 x SD / mean of stage durations.', { dart: 'step_duration_cv_pct' }),
            F('step_length_mean_m', 'number', 'm', 'Mean of all 16 per-foot stage step lengths (null if no scale).', { dart: 'step_length_mean_m' }),
            F('step_length_left_m', 'number', 'm', 'Mean of the 8 left-foot step lengths.', { dart: 'step_length_left_m' }),
            F('step_length_right_m', 'number', 'm', 'Mean of the 8 right-foot step lengths.', { dart: 'step_length_right_m' }),
            F('step_symmetry_index_pct', 'number', '%', '100 x |L - R| / (0.5 x (L + R)) (Robinson; scale-free).', { dart: 'step_symmetry_index_pct' }),
            F('step_width_mean_m', 'number', 'm', 'Mean inter-foot distance at double support per stage (null if no scale).', { status: 'assumed', dart: 'step_width_mean_m' }),
            F('hesitation_count', 'integer', '-', 'Intervals where both feet were grounded longer than protocol.hesitationS.', { dart: 'hesitation_count', tune: true }),
            F('line_touch_count', 'integer', '-', 'Contact episodes on a tape line (low confidence from 2D).', { dart: 'line_touch_count' }),
            F('sequence_error_count', 'integer', '-', 'Contacts in a wrong square (brief 9.4).', { dart: 'sequence_error_count' }),
            F('extra_contact_count', 'integer', '-', 'Extra adjustments within the target/previous square.'),
            F('double_support_time_ratio_pct', 'number', '%', 'Share of [t_start, t_stop] with both feet grounded.', { dart: 'double_support_time_ratio_pct' }),
            F('interlimb_coordination_s', 'number', 's', 'Mean per-stage lag between first and second foot contact.', { status: 'assumed', dart: 'interlimb_coordination_s' })
        ]),
        G('Trunk & stability', [
            F('peak_trunk_angle_deg', 'number', 'deg', 'Peak absolute lateral trunk deviation from the pre-roll baseline (frontal plane, 2D).', { status: 'assumed', dart: 'peak_trunk_angle_deg' }),
            F('mean_trunk_angular_velocity_deg_s', 'number', 'deg/s', 'Mean absolute trunk angular velocity over the timed window.', { status: 'assumed', dart: 'mean_trunk_angular_velocity_deg_s' }),
            F('peak_trunk_incl_3d_deg', 'number', 'deg', 'Optional peak trunk inclination from world landmarks (null when unavailable).', { status: 'assumed' }),
            F('near_fall_event', 'boolean', '-', 'EXPERIMENTAL, unvalidated: large trunk deviation coincident with an extra contact or error.', { status: 'assumed', dart: 'near_fall_event' }),
            F('agility_score', 'number', '-', 'RESERVED. No published definition available; left null.', { status: 'reserved', dart: 'agility_score' }),
            F('stability_score', 'number', '-', 'RESERVED. No published definition available; left null.', { status: 'reserved', dart: 'stability_score' }),
            F('instability_score', 'number', '-', 'RESERVED. No published definition available; left null.', { status: 'reserved', dart: 'instability_score' })
        ]),
        G('Quality control', [
            F('effective_fs_hz', 'number', 'Hz', 'Frames analysed per second over the trial (detector throughput).'),
            F('frames_analysed', 'integer', '-', 'Number of pose frames buffered for the trial.'),
            F('valid_frame_pct', 'number', '%', 'Percent of frames with hips, knees, ankles, heels and toes all valid.'),
            F('imputed_sample_pct', 'number', '%', 'Percent of resampled samples lying in a gap longer than maxGapS.'),
            F('longest_gap_s', 'number', 's', 'Longest interval without a confident foot detection.'),
            F('median_foot_visibility', 'number', '0-1', 'Median of per-foot mean visibility.'),
            F('qc_flags', 'string', '; separated', 'All QC conditions triggered (see Definitions).'),
            F('qc_pass', 'boolean', '-', 'True if no BLOCKING QC flag was raised.'),
            F('valid_trial', 'boolean', '-', 'COMPLETED, qc_pass, and the operator verdict does not invalidate it.')
        ]),
        G('Operator verdict', [
            F('operator_valid', 'boolean', '-', 'Operator marks the trial valid overall.'),
            F('operator_balance_lost', 'boolean', '-', 'Operator observed loss of balance.'),
            F('operator_support_used', 'boolean', '-', 'Operator observed use of support / assistive device.'),
            F('operator_not_facing_forward', 'boolean', '-', 'Operator observed the participant not facing forward.'),
            F('operator_line_or_cane_contact', 'boolean', '-', 'Operator observed line or cane contact (does not alone invalidate a tape trial).')
        ])
    );

    const stages = [].concat(
        G('Stage', [
            F('session_id', 'string', '-', 'Links to the Sessions sheet.'),
            F('stage', 'integer', '1-8', 'Stage index in the sequence.'),
            F('target_square', 'integer', '1-4', 'Target square for this stage.'),
            F('lead_foot', 'categorical', 'L | R', 'Foot that contacted the target square first.'),
            F('t_first_contact_s', 'number', 's', 'First foot contact time in the target square.'),
            F('t_second_contact_s', 'number', 's', 'Second (trailing) foot contact time in the target square.'),
            F('t_liftoff_s', 'number', 's', 'Time the lead foot left to begin the next stage (null for stage 8).'),
            F('stage_duration_s', 'number', 's', 'first[k+1] - first[k]; stage 8 = t_stop - first[8].'),
            F('dwell_s', 'number', 's', 'Time both feet were in the target square before the next step.'),
            F('interlimb_lag_s', 'number', 's', 'second - first contact lag.'),
            F('lead_u', 'number', 'arm', 'Lead-foot u (unit grid).'),
            F('lead_v', 'number', 'arm', 'Lead-foot v (unit grid).'),
            F('trail_u', 'number', 'arm', 'Trail-foot u (unit grid).'),
            F('trail_v', 'number', 'arm', 'Trail-foot v (unit grid).'),
            F('step_length_lead_rel', 'number', 'arm', 'Lead-foot step length from its previous contact (arm lengths).'),
            F('step_length_trail_rel', 'number', 'arm', 'Trail-foot step length from its previous contact (arm lengths).'),
            F('step_width_rel', 'number', 'arm', 'Distance between the two feet in this stage (arm lengths).'),
            F('line_touch', 'boolean', '-', 'A contact in this stage fell on a tape line.'),
            F('sequence_error', 'boolean', '-', 'A wrong-square contact occurred during this stage.'),
            F('hesitation', 'boolean', '-', 'A hesitation (long double support) occurred during this stage.')
        ])
    );

    const contacts = [].concat(
        G('Contact', [
            F('session_id', 'string', '-', 'Links to the Sessions sheet.'),
            F('contact_index', 'integer', '-', 'Order of the contact episode within the trial (1-based).'),
            F('foot', 'categorical', 'L | R', 'Which foot.'),
            F('stage', 'integer', '0-8', 'Stage this contact was attributed to (0 = start square).'),
            F('square', 'integer', '0-4', 'Square the foot landed in (0 = outside).'),
            F('t_on_s', 'number', 's', 'Contact onset (grounded).'),
            F('t_off_s', 'number', 's', 'Contact end (lift-off).'),
            F('duration_s', 'number', 's', 't_off - t_on.'),
            F('u', 'number', 'arm', 'Median floor u over the episode (unit grid).'),
            F('v', 'number', 'arm', 'Median floor v over the episode (unit grid).'),
            F('on_line', 'boolean', '-', 'Foot was on a tape line.'),
            F('is_extra', 'boolean', '-', 'An extra adjustment contact (not a stage completion).'),
            F('is_error', 'boolean', '-', 'A wrong-square contact.'),
            F('mean_visibility', 'number', '0-1', 'Mean foot visibility over the episode.')
        ])
    );

    const frames = [].concat(
        G('Analysed time series (uniform 30 Hz grid)', [
            F('session_id', 'string', '-', 'Links to the Sessions sheet.'),
            F('t_s', 'number', 's', 'Time relative to GO (negative = pre-roll).'),
            F('phase', 'categorical', 'PREROLL | RUNNING | DONE', 'Trial phase.'),
            F('tracking_gap', 'integer', '0/1', '1 if the sample lies in a tracking gap longer than maxGapS.'),
            F('l_u', 'number', 'arm', 'Left foot floor u.'),
            F('l_v', 'number', 'arm', 'Left foot floor v.'),
            F('l_speed_shank_s', 'number', 'shank/s', 'Left foot shank-normalised speed.'),
            F('l_grounded', 'integer', '0/1', 'Left foot grounded.'),
            F('r_u', 'number', 'arm', 'Right foot floor u.'),
            F('r_v', 'number', 'arm', 'Right foot floor v.'),
            F('r_speed_shank_s', 'number', 'shank/s', 'Right foot shank-normalised speed.'),
            F('r_grounded', 'integer', '0/1', 'Right foot grounded.'),
            F('trunk_dev_deg', 'number', 'deg', 'Lateral trunk deviation from baseline.'),
            F('trunk_angvel_deg_s', 'number', 'deg/s', 'Trunk angular velocity.')
        ])
    );

    return { sessions, stages, contacts, frames };
})();

if (typeof module !== 'undefined') module.exports = SCHEMA;
