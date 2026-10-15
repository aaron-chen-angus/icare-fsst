# FSST//LAB — Kiro Runbook

Everything you do, in order, from unzipping to a validated app. Copy-paste prompts are in code blocks. Kiro's menu labels can differ slightly between versions; the intent of each step stays the same.

---

## 1. What is in this package

```
icare-fsst/
  KIRO_RUNBOOK.md                      this file (for you, not for Kiro)
  .kiro/steering/
    product.md      (always loaded)    what the product is, protocol, must-nots
    tech.md         (always loaded)    no build step, no npm, MediaPipe pins, conventions
    structure.md    (always loaded)    file tree, naming, copy-from-reference rule
    fsst-brief.md   (fileMatch)        pulls the brief and clinical reference into context
                                       whenever Kiro touches index.html, css/, js/, tests/, tools/, apps-script/ or README.md
  docs/
    FSST_LAB_Kiro_Brief.md             THE SPECIFICATION (v2)
    FSST_Clinical_Reference.md         protocol rules and cut-offs with sources
    FSST_Code_Assessment.md            analysis of the original Flutter code
  reference/                           READ-ONLY inputs
    flutter-fsst/*.dart                the four original Flutter files
    sts-lab/                           full copy of the STS//LAB repo (code, CSS, tests, Apps Script)
```

Why the STS repo is inside the package: Kiro works on local files and cannot be relied on to browse GitHub. Having `reference/sts-lab/` locally means Kiro copies real, working code instead of guessing.

---

## 2. Before you start (30 minutes, once)

1. **Watch the English instructional video** (https://youtube.com/shorts/X9Syvrmr90Q). Confirm: the participant starts in square 1 facing square 2; order 2, 3, 4, 1, 4, 3, 2, 1; both feet in every square; facing forward; where the phone is placed. If anything differs from `docs/FSST_LAB_Kiro_Brief.md` sections 4.1 and 9.4, edit the brief now (the sequence is `protocol.sequence` in config).
2. **Decide and note** (the brief has defaults; change them in the brief if you disagree):
   - Rest between trials: 60 s, skippable.
   - Headline = best of all three attempts; protocol score (best of 2 timed) shown alongside.
   - `agility_score`, `stability_score`, `instability_score` stay empty unless you supply formulas.
   - Consent checkbox wording (use your ethics-approved text if you have one).
3. **Make the tape cross** you will test with: two crossing tape lines, four equal arms, each square big enough for both feet. Measure one arm (centre to tip) and write it down. Use the same cross for every participant.
4. **Accounts:** a GitHub account (new empty repo, suggested name `icare-fsst`), a Google account for the data Sheet.
5. **Devices:** at least one Android phone (Chrome) and one iPhone (Safari) for testing; a way to prop a phone upright (tripod, stand, stack of books).
6. You do **not** need to install anything beyond Kiro. Node is optional (the browser test runner covers you).

---

## 3. Create the project in Kiro

1. Unzip the package. You get a folder `icare-fsst` that contains a hidden `.kiro` folder (turn on "show hidden files" if you cannot see it).
2. In Kiro: **File > Open Folder** and choose `icare-fsst`.
3. Open the **Steering** section of the Kiro panel. You must see four files: `product.md`, `tech.md`, `structure.md` (inclusion: always) and `fsst-brief.md` (inclusion: fileMatch). If they are missing, the `.kiro` folder did not unzip correctly; unzip again.
4. Source control: use Kiro's Git panel to **initialise a repository**, create the first commit "Package: brief, steering, references", and publish to your new GitHub repo. If Git is not available: on GitHub use **Add file > Upload files** and drag the folder contents in (include the `.kiro` folder; GitHub's uploader accepts folders by drag and drop).
5. Rule for the rest of the project: **commit after every accepted phase** with the message `Phase N accepted`. That is your rollback point.

---

## 4. Create the spec (three prompts, with approval gates)

In the Kiro chat panel choose **Spec**, then **Feature**, then **Requirements-First**. In each prompt, type `#` and pick the file from the list to reference it (the picker inserts the correct reference).

### Prompt A — requirements

```
Create a new feature spec named fsst-lab (Requirements-First).

Sources of truth, in this priority order:
1. #docs/FSST_LAB_Kiro_Brief.md
2. #docs/FSST_Clinical_Reference.md
3. #docs/FSST_Code_Assessment.md
The steering files in .kiro/steering also apply. Never edit reference/ or docs/.

The requirements document must:
- Contain all 27 numbered requirements from section 2 of the brief, keeping their numbers as R1 to R27, each as EARS acceptance criteria. Do not merge, drop or renumber any.
- Add non-functional requirements for: portrait fluid layout (brief section 12), privacy and consent, no build step or dependencies, offline-authoritative analysis, schema-driven data dictionary.
- Add a glossary: arm tip, unit grid, contact episode, stage, trial slot, attempt group, valid trial, BEST (all), protocol score.
- List every item tagged [ASSUMED] and [TUNE] in the brief as an explicit assumption, not as a fact.
- Not introduce any requirement that is not in the brief. If you think something is missing, list it under "Questions for the author" instead.
```

When Kiro finishes, click **Analyze Requirements** (if offered) and read the result. Then use the checklist below before approving.

**Requirements review checklist (tick all before you approve)**
- [ ] R1 to R27 are all present with the same numbering and meaning.
- [ ] Nothing mentions React, Vite, npm, bundlers, TypeScript or a backend server.
- [ ] Practice + two timed trials, repeat rule, BEST (all) and protocol score are all present (R16, R21, R22, R23).
- [ ] Classification only when a validated cut-off applies (R24); scale tiers (R25).
- [ ] No requirement computes agility, stability or instability scores.
- [ ] "Questions for the author" does not contain anything you can answer from the brief. If it does, reply with the answer and ask Kiro to update.

Fix prompt if Kiro changed or dropped requirements:

```
Requirements R<numbers> differ from section 2 of #docs/FSST_LAB_Kiro_Brief.md. Restore them exactly as written there (as EARS), keep numbering R1 to R27, and do not add or remove requirements. Show me a table comparing each of R1 to R27 with the brief.
```

### Prompt B — design (after you approve requirements)

```
Create the design for fsst-lab. Constraints:
- Architecture exactly as in .kiro/steering/structure.md: plain script tags, one global namespace per module (FSSTAnalysis, FSSTLive, FSSTGeometry, FSSTExport, FSSTCharts), Node-exportable via module.exports where listed.
- Reuse by copying from reference/sts-lab/ (pose-engine, filtfilt/biquad/resampleOnGrid, export/ZIP/outbox, charts, Code.gs, build-dictionary, CSS). Name each reused function and state what changes.
- Implement the analysis exactly as specified in brief section 9 (contact detection with hysteresis on shank-normalised speed, square matching with the line band, the stage state machine, metrics, trunk deviation, QC flags, classification table). Include the data flow from landmark frames to schema fields.
- Floor geometry as in brief section 7 (four arm-tip handles, unit grid, homography, three scale tiers).
- Screen flow and trial orchestration as in brief sections 4.1 to 4.7.
- Data model: Sessions, Stages, Contacts, Frames exactly as in brief section 10; schema.js drives everything.
- Test strategy: tests/synth.js generator and cases A to S from brief section 13, runnable in Node and in tests/index.html.
- Include sequence diagrams for: entry to first trial; one trial from READY to results; trial repeat and best-of; offline upload with outbox.
- Include an error-handling table: camera denied, model load failure, landscape, tracking failure, upload failure, localStorage unavailable.
Do not choose any library or framework. Do not change any threshold value in the brief.
```

**Design review checklist**
- [ ] Every module in structure.md appears; no extra modules, no frameworks.
- [ ] Section 9.2 uses speed divided by `shank_px` (not floor-unit speed) with hysteresis.
- [ ] Section 9.3 uses the line band so a foot on tape does not cause a sequence error.
- [ ] Scale has three tiers: operator entered, body estimated, none.
- [ ] Reused STS functions are named (for example `filtfilt`, `resampleOnGrid`, `makeZip`, `flushOutbox`).
- [ ] Reserved score fields are null.

### Prompt C — tasks (after you approve the design)

```
Create tasks for fsst-lab. Use exactly the nine phases in section 14 of #docs/FSST_LAB_Kiro_Brief.md (Phase 0 to Phase 8), in that order, each phase as a group of small tasks. For every task state: the files it changes, the requirement numbers it satisfies, and how it is verified. Put each phase's acceptance criteria from the brief as the final task of that phase, named "Phase N acceptance". Do not merge phases. Do not schedule phase N+1 tasks as parallel to phase N.
```

**Tasks review checklist**
- [ ] Nine phases, in order, each ending with its acceptance task.
- [ ] Phase 4 includes `tests/synth.js`, `tests/run.js` and `tests/index.html`.
- [ ] Phase 6 includes the new Apps Script and the "do not reuse STS webhook" step.
- [ ] Phase 7 includes the dictionary generator and the schema-completeness check.

---

## 5. Run the work, one phase at a time

Rules:
- **Run tasks one at a time or one phase at a time. Do not use "Run all tasks".** Phases depend on each other and you need to test on a real phone between them.
- If Kiro offers a supervised mode, use it for Phases 2 to 4, where mistakes are expensive.
- After each phase: run its acceptance prompt, do the manual checks below, commit, then continue.

Use this generic prompt at the start of every phase (replace N):

```
Execute Phase N of the fsst-lab tasks only. Follow #docs/FSST_LAB_Kiro_Brief.md section 14 for Phase N and the sections it references. Copy from reference/sts-lab/ where the brief says so; never edit reference/ or docs/. Do not start Phase N+1. When finished, give me: (1) the list of files created or changed, (2) each acceptance criterion with PASS or FAIL and the evidence, (3) anything you were unsure about, (4) any value you changed or invented (there should be none).
```

### Phase 0 — scaffold and theme
Manual checks: open `index.html` through GitHub Pages (Settings > Pages > Deploy from a branch > `main` / root; wait about a minute) and on your phone. You should see the dark neon grid background with a placeholder FSST//LAB entry. Check there is no horizontal scroll at narrow widths: in desktop Chrome press F12, toggle device toolbar, test 320x568, 360x640, 390x844, 430x932. Search the project for `STS`, `sts-lab` and the STS webhook URL: none may remain outside `reference/`.

### Phase 1 — entry, language video, form, gating
Manual checks, on a phone:
1. PROCEED is not visible at first.
2. Tap English, Mandarin, Cantonese in turn: the right Short plays inline (compare with the three IDs in the brief); the fallback link opens YouTube; switching languages works.
3. After a video opens, PROCEED appears below it but is disabled. Fill every required field and both required checkboxes: it enables. Untick one: it disables.
4. Population dropdown has six options; arm length is optional; "Unable to perform test" records a CANNOT_DO entry in History with no time.
5. Rotate the phone and shrink the browser: nothing overflows.

### Phase 2 — camera, pose, grid, skeleton
Manual checks, on at least one Android and one iPhone, over HTTPS:
1. Camera permission prompt appears; the rear camera starts in portrait; the picture is not mirrored.
2. The skeleton is visible on you: bones blue, joints orange, heel and toe markers larger; yellow rings when something is hidden. Labels and All pts toggles work.
3. The four arm-tip handles and the cross appear at the preset position. Drag each handle onto your tape arm tips; drag inside to move all; Reset works. Rotate the phone to landscape: the rotate blocker shows and analysis pauses.
4. A debug readout shows frames per second; it should stay at or above 15.
5. Controls are in a bar below the video and never cover your feet or the grid.
Send back a screenshot from each phone if anything looks wrong.

### Phase 3 — live contact detection and stage tracking
Manual checks (needs a second person or a tripod and a spotter-safe area):
1. Stand in square 1 facing the phone: READY appears after about 1 second; START enables only after you tap the grid confirmation.
2. Run a trial: the timer starts at your first step into square 2 (not at GO) and stops when both feet are back in square 1 after stage 8.
3. HUD shows STAGE n/8, the target square highlighted, and L and R foot LEDs flicker green when each foot is down.
4. Deliberately step into the wrong square: it flashes red.
5. STOP ends the trial early as INCOMPLETE.

### Phase 4 — offline analysis and tests
Manual checks:
1. Open `tests/index.html` in a browser: all cases A to S show PASS. If Node is available, `node tests/run.js` must agree.
2. Run a real trial and compare the offline time with the live time on the results screen; they should be close (a difference of more than about 0.3 s means a bug or a threshold to tune; note it for Phase 8).

### Phase 5 — trials, results, charts, ZIP
Manual checks: complete practice, timed 1, timed 2 in a row. The strip shows progress; rest screen appears and can be skipped; an invalid trial offers Repeat; BEST (all) and the protocol score both show; tiers appear only for a population with a cut-off (try the "Other" option and an age under 65 with the older-adult option: both must show NOT_CLASSIFIED with the reason). Open every panel and chart at 320 px width. Download the ZIP and open the CSVs: the column list matches the brief.

### Phase 6 — Google Sheets and outbox
Do the setup in section 6 of this runbook first. Manual checks: consent ticked, finish a trial, see "saved"; the Sheet has Sessions, Stages and Contacts rows. Press upload again: "duplicate", no new rows. Turn on airplane mode, finish a trial, turn it off: the outbox sends it. Without consent nothing is sent.

### Phase 7 — data dictionary
Manual checks: run the generator (`node tools/build-dictionary.js`, or open `tools/dictionary.html`). Open `DATA_DICTIONARY.md`: every Sessions, Stages, Contacts and Frames column is present with unit, definition, calculation and status; the 17 landmarks, QC flags, parameters and clinical cut-off table are present. Pick five random fields and check each against the brief.

### Phase 8 — field validation and tuning
Follow section 7 of this runbook.

---

## 6. Google Sheets setup (Phase 6, step by step)

1. In Google Drive create a **new** Google Sheet named `FSST-LAB data`. Do not reuse the STS sheet.
2. In the Sheet: **Extensions > Apps Script**. Delete the starter code and paste the contents of the project's `apps-script/Code.gs` (the FSST version Kiro created).
3. **Deploy > New deployment > Web app**. Execute as: **Me**. Who has access: **Anyone**. Click Deploy, authorise when prompted (Advanced > Go to project, if Google warns that the app is unverified: it is your own script), and copy the **Web app URL** that ends in `/exec`.
4. Open that URL in a browser tab: it must show JSON containing `"status":"active"` and `"service":"fsst-lab"`.
5. Put the URL into `CONFIG.sheets.webhookUrl` in `js/config.js` (ask Kiro: "Set webhookUrl to <paste URL>"). Commit, redeploy to GitHub Pages, hard-refresh the phone.
6. Run one test trial with the consent box ticked. Sheet tabs `Sessions`, `Stages`, `Contacts` appear automatically.
7. If you later change `Code.gs`, **Deploy > Manage deployments > Edit > New version** so the live URL uses the new code.
8. Never put the webhook URL in a public screenshot. Anyone with it can write to your Sheet; keep identifiable data out of `participant_id`.

BEST (all) per participant, in a new tab, with participant group id `X`:
`=MINIFS(Sessions!<time column>, Sessions!<group column>, X, Sessions!<valid_trial column>, TRUE)`
Protocol score: add `, Sessions!<is_practice column>, FALSE`. Replace the bracketed names with the real column letters.

---

## 7. Validation pilot (Phase 8)

Goal: measure how close the app's times are to manual timing, and tune the `[TUNE]` values with evidence.

1. **Sample:** at least 10 trials from at least 3 phone models, healthy volunteers first (no one at risk of falling), with a spotter.
2. **Reference timing:** a second phone films the participant's feet from the side or front in slow-motion (120 or 240 fps if available). Afterwards, step through the video frame by frame and note the time of the first foot touching square 2 and the last foot touching square 1. The app stores no video, so this recording is only for the pilot, with consent.
3. **Log** each trial in a table:

| trial_id | phone | app_time_s | manual_time_s | diff_s | app_start_s | manual_start_s | app_stop_s | manual_stop_s | flags | notes |
|---|---|---|---|---|---|---|---|---|---|---|

4. **Analyse:** mean difference (bias), standard deviation of differences, and the largest absolute difference. Decide your acceptable limit (a clinically sensible limit is yours to set; the brief leaves it open on purpose) and write it into `README.md`.
5. **Tune:** paste the table to Kiro with this prompt:

```
Pilot results are below (CSV). Compute bias and the standard deviation of differences for start time, stop time and total time per phone model. Recommend adjustments only to values tagged [TUNE] in js/config.js (for example contacts.onsetBiasS, vOnShankS, vOffShankS, minContactS), explain each with the evidence, and wait for my approval before changing anything. Do not change any non-[TUNE] value.
<paste CSV>
```

6. After approved changes: rerun the unit tests, rerun at least 5 trials, update the analysis version in `config.js`, regenerate the dictionary, commit "Phase 8 accepted".

---

## 8. Guardrails and fix prompts

| If Kiro does this | Say this |
|---|---|
| Adds React, Vite, npm, a package.json or any framework | `Remove it. tech.md forbids build steps, npm and frameworks. Rewrite with plain script tags and the namespaces in structure.md.` |
| Edits something in reference/ or docs/ | `Revert all changes under reference/ and docs/. Those folders are read-only. Copy files into the project root instead.` |
| Changes a threshold or invents a number | `You changed or invented <value>. Restore it to the brief's value. Any new tunable must be added to js/config.js with a [TUNE] comment and listed for my approval.` |
| Computes agility, stability or instability scores | `Those three fields are reserved and must stay null. Remove the calculation. Do not invent formulas.` |
| Mirrors the preview or flips the grid labels | `Never mirror. Geometry is defined in raw image space (brief sections 4.2 and 7). Remove the mirroring.` |
| Puts controls over the bottom of the video | `Controls must sit in a bar below the video (brief 4.2). Move them.` |
| Uses 100vh | `Use 100dvh with safe-area insets (brief section 12).` |
| Reuses the STS webhook URL, or leaves STS names | `Search the project outside reference/ for STS, sts-lab and the STS webhook URL and remove them. The webhook must be empty until I provide the new URL.` |
| Adds a field not in schema.js, or hand-edits DATA_DICTIONARY.md | `Declare the field in js/schema.js first and regenerate the dictionary. Never hand-edit DATA_DICTIONARY.md.` |
| Says a phase "should work" without evidence | `Run the acceptance criteria and show PASS or FAIL for each with evidence. If it needs a phone, tell me exactly what to test.` |
| Uploads or stores video or raw landmarks by default | `Remove it. Video is never recorded. Raw landmarks are exported only to the local ZIP unless uploadFrames is true and the participant consented.` |
| Skips ahead to the next phase | `Stop. Revert work outside Phase N and finish Phase N acceptance first.` |
| Hits something the brief does not cover | `Do not guess. List the options with their consequences and ask me.` |

Stop conditions: if a phase fails acceptance twice for the same reason, stop and paste the failing criterion, the console error and a screenshot into a new chat message; do not let Kiro keep patching.

---

## 9. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Camera does not start | Page not on HTTPS or localhost (use GitHub Pages); permission denied (iPhone: Settings > Safari > Camera > Allow; Android: site settings); another app is using the camera |
| Stuck on "LOADING POSE MODEL" | First load downloads the model from the CDN; check the connection; try the `lite` model |
| Skeleton jumps or has gaps | Poor light, dark or baggy clothing, feet hidden, ultra-wide lens; use the default 1x rear camera and front lighting |
| Frame rate under 15 fps | Older phone; select `lite`; close other apps; flag `LOW_FPS` will appear |
| Grid will not match the tape | Move the phone back or forward first, then adjust height; drag the four handles to the tape arm tips |
| Timer never starts | Both feet must have been still in square 1 first; the first foot must come to rest inside square 2 (not on the line); check handle alignment |
| Wrong-square errors on a clean trial | Handles misaligned, or a foot hidden; realign; check `lineBandRel` in the pilot |
| Old version after deploy | Hard-refresh the phone; clear site data for the Pages domain |
| Sheets shows "sent, unconfirmed" | Normal when the browser cannot read the Apps Script reply; check the Sheet; resending is safe (de-duplicated) |
| Nothing appears in the Sheet | Webhook URL empty or wrong; deployment not set to "Anyone"; consent box not ticked |

---

## 10. Release checklist

- [ ] All nine phases accepted and committed.
- [ ] `tests/index.html` all PASS; `node tests/run.js` PASS if Node is available.
- [ ] `DATA_DICTIONARY.md` regenerated from the final schema and config.
- [ ] `README.md` has: setup, operator manual (cross, phone placement, protocol), Sheets deployment, tuning guide, limitations (tape vs canes, practice in best-of-3, 2D camera, frontal view, assumed metrics), pilot results and the agreement limit you set.
- [ ] Layout checked on 320x568, 360x640, 375x667, 390x844, 412x915, 430x932, 360x520 and a tablet, on real devices where possible.
- [ ] Consent wording approved by your ethics process if you collect data from participants.
- [ ] No STS names, URLs or webhook left; no secrets in the repo.
- [ ] Results screen and entry screen both show "screening and research tool, not a medical device" and the tape-adaptation caveat.
- [ ] A person other than you has run the full flow once from the README alone.

---

## 11. Prompt quick reference

1. Spec: Prompt A (requirements) -> review -> Prompt B (design) -> review -> Prompt C (tasks) -> review.
2. Each phase: generic phase prompt (section 5), manual checks, commit "Phase N accepted".
3. Phase 6 manual setup: section 6. Phase 8 pilot: section 7.
4. Anything wrong: section 8 fix prompts, then section 9.
