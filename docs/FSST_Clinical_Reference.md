# FSST Clinical Reference

Purpose: the protocol rules and published cut-offs that FSST//LAB encodes, with the evidence behind each and the limits of that evidence. Compiled 2026-10-15 from the sources listed at the end. This is a screening and research tool, not a medical device.

**Evidence access note.** PubMed and PMC pages were blocked by reCAPTCHA and Europe PMC rate-limited the request, so most primary papers were **not read directly**. Cut-offs below are as reported by the SRA Lab summary, the Physiopedia summary, the Moore and Barker (2017) systematic review, and a Springer review's reference annotations. Before publishing or using the tier clinically, verify each value against the primary paper.

## 1. Protocol (as published)

| Item | Rule | Source |
|---|---|---|
| Equipment | Four canes or rods about 100 cm long and 2.5 cm in diameter laid in a cross, plus a stopwatch. Square size is not specified | Physiopedia; SRA instructions PDF gives no dimensions |
| Original obstacle | The participant steps over low (2.5 cm) objects, moving in four directions | Dite and Temple 2002 abstract record |
| Start position | Square 1, facing square 2 | SRA, Moore and Barker 2017 |
| Sequence | 2, 3, 4, 1, 4, 3, 2, 1 (clockwise then counter-clockwise) | SRA instructions PDF |
| Instruction | As fast as possible without touching the canes; both feet touch the floor in every square; face forward if possible | SRA |
| Start of timing | First foot contacts the floor in square 2 | SRA, Physiopedia |
| End of timing | Last foot returns to touch the floor in square 1 | SRA, Physiopedia |
| Practice | One practice trial | SRA, Physiopedia |
| Timed trials | Two; the fastest is the score | SRA, Physiopedia |
| Repeat a trial if | the participant fails to complete the sequence, loses balance, or touches a cane | SRA instructions PDF, Physiopedia |
| Cannot face forward | May turn before stepping into the next square; timed accordingly | Physiopedia |
| Record | Any assistive device used | Physiopedia |
| Surface | Hard or foam; cut-offs differ | SRA; Mathurapongsakul and Siriphorn 2018 |

## 2. Fall-risk cut-offs

| Population | Cut-off | Evidence | Used for classification in FSST//LAB |
|---|---|---|---|
| Community-dwelling older adults, 65 and over | **more than 15 s** identifies multiple fallers | Dite and Temple 2002 (n = 81; reported sensitivity 85%, specificity 88-100%, positive predictive value 86%; the accessed abstract record does not state the cut-off itself). The 15 s value is stated by SRA and Physiopedia, and a Springer review annotates Cleary and Skornyakov 2017 as finding "the previously established cutoff of 15 s" distinguished multiple from non-multiple fallers | Yes: `older_adult_community`, age 65 or over |
| Vestibular disorders | more than 12 s | Whitney et al. 2007 (per SRA, Physiopedia) | Yes: `vestibular` |
| Unilateral transtibial amputation | more than 24 s | Dite et al. 2007 (per SRA; Moore and Barker report 24 s as the highest cut-off) | Yes: `amputation_transtibial` |
| Parkinson's disease | more than 9.68 s | Duncan and Earhart 2013 (per Moore and Barker 2017, lowest reported cut-off) | Yes: `parkinson` |
| Acute stroke | a failed attempt, or more than 15 s | Blennerhassett and Jayalath 2008 (per SRA, Physiopedia) | Yes: `stroke_acute` |
| Older adults, hard surface | 10.14 s | Mathurapongsakul and Siriphorn 2018 (per SRA; SRA notes inconsistent sensitivity and specificity values in that paper) | No: research alternative |
| Older adults, foam | 11.21 s | Same | No: research alternative |
| Chronic stroke vs healthy controls | 11 s | Goh et al. 2013 (discrimination threshold, not a fall-risk cut-off) | No |
| Knee pain | more than 10 s classed as slow | Schumacher et al., cited by Moore and Barker 2017 | No |

Rules encoded: strict "greater than" comparison; classification only for the selected population; the older-adult cut-off is applied only at age 65 or over; any other selection is `NOT_CLASSIFIED`.

## 3. Reliability (for context)

Older adults: test-retest ICC 0.98 and inter-rater ICC 0.99 (Dite and Temple 2002 record). Vestibular: test-retest ICC 0.93 (Physiopedia). Parkinson's: inter-rater 0.99 (Physiopedia). Across studies, Moore and Barker report inter-rater ICC 0.86-0.99 and test-retest ICC 0.73-0.98. No minimal detectable change was reported by the sources read. These values describe the manual stopwatch test; the camera-based version needs its own validation (phase 8).

## 4. Limitations specific to FSST//LAB

1. **Tape instead of canes.** The original test and its cut-offs involve low obstacles. A flat tape cross is easier to step across and may shorten times compared with the validation cohorts. Raise the flag `PROTOCOL_ADAPTATION_TAPE` on every trial; interpret the tier as screening only.
2. **Best-of-3 including the practice trial.** The published score is the fastest of two timed trials after one practice. Including the practice trial can only lower the reported best time, so the app also reports the protocol score (best of the two timed trials).
3. **Square size is not standardised in the literature**, and the size of the squares changes difficulty. Use one size per study and record it.
4. **Camera timing.** Foot-contact times from a phone camera at about 30 fps have a resolution of about 33 ms plus detector latency; agreement with manual timing is unproven until the pilot.
5. **Frontal view.** Foot positions come from the floor homography; trunk lean is frontal-plane only; line and obstacle contact cannot be confirmed reliably from 2D video.
6. **Unsuccessful-trial decisions** (loss of balance, support used, not facing forward) require the operator; the app records an operator verdict rather than deciding.
7. **The agility, stability and instability scores** shown in the original Flutter results have no published definition available here and are not computed.

## 5. Sources

- SRA Lab, Four Square Step Test: https://www.sralab.org/rehabilitation-measures/four-square-step-test
- SRA Lab, Four Step Square Test Instructions: https://www.sralab.org/sites/default/files/2017-06/Four%20Step%20Square%20Test%20Instructions.pdf
- Physiopedia, Four Square Step Test: https://www.physio-pedia.com/Four_Square_Step_Test
- Dite W, Temple VA. A clinical test of stepping and change of direction to identify multiple falling older adults. Arch Phys Med Rehabil. 2002;83(11):1566-71. Record: https://ahro.austin.org.au/austinjspui/handle/1/9445
- Moore M, Barker K. The validity and reliability of the four square step test in different adult populations: a systematic review. Syst Rev. 2017. https://pmc.ncbi.nlm.nih.gov/articles/PMC5594590
- Springer review (Curr Geriatr Rep 2020), The Four Square Step Test and its use clinically in different populations: https://link.springer.com/article/10.1007/s13670-020-00348-0 (reference annotations only; full text paywalled)
- Primary papers cited but not read directly: Whitney et al. 2007; Dite et al. 2007; Duncan and Earhart 2013; Blennerhassett and Jayalath 2008; Cleary and Skornyakov 2017; Mathurapongsakul and Siriphorn 2018; Goh et al. 2013; Schumacher et al.
