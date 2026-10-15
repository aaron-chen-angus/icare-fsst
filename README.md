# FSST//LAB — Four Square Step Test Biomechanics Lab

A browser-only, computer-vision Four Square Step Test (FSST). It runs entirely on the device
with MediaPipe Pose — **no build step, no npm, no backend**. Video never leaves the device and
is never stored; only numeric results are saved locally or (with consent) uploaded to a Google
Sheet.

> **Screening and research tool, not a medical device.** The published FSST cut-offs were
> derived with canes laid on the floor; this app uses a flat tape cross, which removes the
> obstacle and may shorten times. Treat every tier as a screening indicator, not a diagnosis.

---

## 1. What it does

- Entry screen with setup instructions, a tape-cross diagram, an instructional video in English /
  Mandarin / Cantonese, and a participant form.
- Portrait camera with an always-visible pose skeleton and a draggable floor grid aligned to your
  tape cross.
- Live timing and stage tracking (8 stages: squares 2, 3, 4, 1, 4, 3, 2, 1).
- Authoritative **offline** analysis of the buffered landmarks after each trial.
- One practice trial + two timed trials, with best-of logic and repeat handling.
- Results with charts, a stages table, QC flags, an operator verdict, and population-specific
  fall-risk classification.
- One-click ZIP export and optional Google Sheets upload with an offline outbox.
- A generated `DATA_DICTIONARY.md` driven by `js/schema.js`.

---

## 2. Run it

No installation is required. The app is plain HTML/CSS/JS.

**GitHub Pages (recommended, gives you HTTPS, which the camera needs):**
1. Push this folder to a repository.
2. Settings → Pages → Deploy from a branch → `main` / root.
3. Wait about a minute and open the Pages URL on your phone.

**Locally for development:** open `index.html` in a modern browser. The camera needs HTTPS or
`localhost`; from a plain `file://` path the pose/camera features will not start, but the entry
screen, the test runner and the dictionary generator work from `file://`.

First load downloads the MediaPipe model from the CDN; after that it is cached.

---

## 3. Operator manual

**The tape cross.** On a flat, non-slip floor, lay two tape lines crossing at the middle with four
equal arms. Each of the four squares must be big enough for the participant to stand in with both
feet. Use the **same size for every participant** and, if you measured one arm (centre to tip),
enter it in the form so the app can report metre values. A smaller cross is harder.

**Phone placement.** Stand the phone upright (portrait) on a stable support, rear camera, **in
front of** the cross and centred on it. Move it back until the tape cross matches the on-screen
grid; adjust height second. Do not hand-hold. Default 1x rear lens (no ultra-wide, no zoom).

**The protocol.** The participant starts in **square 1** (far right on screen) facing the phone.
On GO they step into **2, 3, 4, 1, then 4, 3, 2, 1**, both feet touching the floor in every square,
facing the phone throughout, without touching the lines. The clock starts at the first step into
square 2 and stops when both feet are back in square 1. Run **one practice** trial, then **two
timed** trials; rest between trials if needed.

**Scores.** The headline is **BEST** — the fastest valid time of all three attempts (the author's
chosen basis). The app also shows the **protocol score** (fastest of the two timed trials), which
is the more conservative comparison with the validation studies because including the practice
trial can only lower the time.

**Safety.** FSST is a fall-risk test. Keep a spotter within arm's reach for anyone at risk of
falling. Use the "Unable to perform test" button to record a `CANNOT_DO` entry with no time.

**Operator verdict.** On the results screen, confirm whether the trial was valid or whether balance
was lost, support was used, or the participant did not face forward. A flat-tape line touch alone
does not invalidate a trial.

---

## 4. Fall-risk classification

The app classifies only when a validated cut-off applies to the selected population and age
(strict greater-than). Sources and caveats are in `docs/FSST_Clinical_Reference.md` and the
generated `DATA_DICTIONARY.md`.

| Population | Cut-off |
|---|---|
| Older adult, community-dwelling (age 65+) | > 15 s |
| Vestibular disorder | > 12 s |
| Unilateral transtibial amputation | > 24 s |
| Parkinson's disease | > 9.68 s |
| Acute stroke | failed attempt or > 15 s |
| Other / healthy / under 65 | not classified |

---

## 5. Google Sheets upload (optional)

1. In Google Drive create a **new** Google Sheet named `FSST-LAB data` (do **not** reuse any other
   sheet).
2. Extensions → Apps Script. Delete the starter code and paste `apps-script/Code.gs`.
3. Deploy → New deployment → Web app. Execute as **Me**; Who has access **Anyone**. Deploy and
   authorise.
4. Open the `/exec` URL in a browser: it must show JSON containing `"status":"active"` and
   `"service":"fsst-lab"`.
5. Put the `/exec` URL into `CONFIG.sheets.webhookUrl` in `js/config.js`, commit, redeploy to
   Pages, and hard-refresh the phone.
6. With the consent box ticked, finish a trial. The tabs `Sessions`, `Stages`, `Contacts` are
   created automatically. Re-sending the same trial is de-duplicated by `session_id`. Nothing is
   uploaded without consent, and video and raw landmarks are never uploaded.

Group scores are derived in the Sheet, not stored:
`=MINIFS(Sessions!<time>, Sessions!<attempt_group_id>, X, Sessions!<valid_trial>, TRUE)`; add
`, Sessions!<is_practice>, FALSE` for the protocol score.

---

## 6. Tests

- **Browser:** open `tests/index.html`. All cases A–S must show PASS.
- **Node (optional):** `node tests/run.js`.

> This project was developed on a machine without a standalone Node install. The suite was run with
> the Node runtime bundled inside the Kiro/VS Code application
> (`ELECTRON_RUN_AS_NODE=1 "<Kiro>\Kiro.exe" tests/run.js`), which reported **44/44 assertions
> passing** for cases A–S. If you have Node installed, `node tests/run.js` is equivalent.

Regenerate the data dictionary after any schema or config change: open `tools/dictionary.html` and
download, or run `node tools/build-dictionary.js`.

---

## 7. Tuning guide (Phase 8 pilot)

Every tunable value lives in `js/config.js` with a `[TUNE]` comment. To tune after a pilot:

1. Collect at least 10 trials across at least 3 phone models (healthy volunteers first, with a
   spotter). Film each trial from the side with a second phone in slow motion for reference timing.
2. Step through each reference video frame by frame and note the first foot touching square 2 and
   the last foot touching square 1.
3. Log `app_time_s`, `manual_time_s` and the start/stop times per trial, then compute the bias and
   the standard deviation of the differences, and the largest absolute difference.
4. Decide your acceptable agreement limit and record it here.
5. Adjust only `[TUNE]` values (for example `contacts.onsetBiasS`, `contacts.vOnShankS`,
   `contacts.vOffShankS`, `contacts.minContactS`), rerun the tests and at least five trials, bump
   `analysisVersion`, and regenerate the dictionary.

**Agreement limit (set by the author before the pilot):** _TBD — fill in after the pilot._

**Pilot results:** _TBD — paste the summary table here after the pilot._

---

## 7a. Lenient completion (how a time is captured)

The app is deliberately **lenient** so a trial can always be completed and timed:

- The timer **starts** the moment the first foot lands in square 2 and **stops** when both feet
  return to square 1 at the end of the lap — detected from the actual path, not from perfect
  step-by-step matching.
- A **wrong-square step, line touch, or imperfect order is recorded as a metric/flag but does NOT
  block the time** and does not fail the trial. Only genuine measurement failures (very low frame
  rate, severe tracking loss, foot occlusion, or no usable start/stop at all) block a result.
- The operator can **Stop (safety)** at any time; the elapsed time up to the stop is recorded.
- A trial counts toward BEST when a time was captured, QC passed, and the operator did not mark it
  invalid. The operator verdict (balance lost / support used / not facing forward) is the final
  word on validity — the software does not reject a trial for crossing a line.

If a trial truly cannot be timed (the participant never reached square 2 and back to square 1), it
is marked `INCOMPLETE` with the `NO_TIME_CAPTURED` flag so you know to re-run it.

## 8. Limitations

- **Tape, not canes.** The original test steps over low obstacles; a flat tape cross is easier and
  may shorten times relative to the validation cohorts. `PROTOCOL_ADAPTATION_TAPE` is raised on
  every trial.
- **Practice in best-of-3.** The headline BEST may include the practice trial; the published
  protocol scores the best of two timed trials, also shown.
- **2D frontal camera.** Floor positions come from the grid homography; forward trunk lean is not
  measurable from the front and is out of scope. Line and cane contact cannot be confirmed reliably
  from 2D video (`line_touch_count` is experimental).
- **Assumed metrics.** Several metrics are inferred because the original backend was never
  available; they are labelled `assumed` in the dictionary and experimental in the UI. The agility,
  stability and instability scores have no published definition and are left null.
- **Thresholds are unvalidated** until the pilot. This is a screening and research tool, not a
  medical device.

---

## 9. Project layout

```
index.html              app shell + script order
css/styles.css          TRON theme + FSST components
js/config.js            all tunables, protocol, cut-offs, tracked landmarks
js/schema.js            single source of truth for every output field
js/geometry.js          grid preset, homography, square membership, responsive mapping
js/analysis.js          FSSTAnalysis — authoritative offline analysis (Node-exportable)
js/live.js              FSSTLive — causal live tracking for the HUD
js/pose-engine.js       MediaPipe camera + skeleton + grid overlay (never mirrors)
js/export.js            CSV / ZIP / Sheets / history / outbox
js/charts.js            floor map, foot timeline, trunk deviation
tests/synth.js          synthetic ground-truth generator
tests/run.js            cases A–S (Node + browser)
tests/index.html        browser test runner
tools/build-dictionary.js   DATA_DICTIONARY.md generator (Node + browser)
tools/dictionary.html   browser dictionary generator
apps-script/Code.gs     Google Sheets receiver (service: fsst-lab)
DATA_DICTIONARY.md      generated; do not hand-edit
```

`reference/` and `docs/` are read-only inputs and are never modified by the app.
