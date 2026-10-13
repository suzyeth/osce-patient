# osce-patient

Practice for the kind of conversation where the other person only tells you what you ask for properly,
and every mark you are given can be traced back to their words.

The reference field is UK clinical history taking (PLAB 2 / UKMLA CPSA and UK finals): a candidate
interviews a fictional patient against a timer and gets a report on what they covered. But nothing in the
engine is medical. A **domain pack** holds a field's scoring domains, its content list, its feedback
statements and how each one is judged; the engine only knows that facts unlock when they are asked for and
that a mark must carry the sentence that earned it. Two packs ship: `uk-clinical-history` and
`user-research-interview`.

**Educational use only.** These are fictional people. This is not a medical device, it gives no medical
advice, and it is not a symptom checker (software that assesses a user's own symptoms can fall under UK
MHRA medical-device rules). If a user seems to describe their own real health problem, the session pauses
and points them to NHS 111, their GP, 999 or Samaritans (116 123).

**No case has been reviewed by an expert.** Every case is marked `unreviewed`, and the report says so.

## What is actually different, and what is not

Being honest about this mattered enough to change the product, so it belongs at the top. Every figure here
was checked against its primary source, and where the source says less than the first draft of this README
claimed, the weaker version is what stands.

**Not different.** An AI patient that withholds information is not an empty space. Quesmed's OSCE Practice
plan (£39.99/year, £14.99 monthly) states its patient is given "rules about what to volunteer versus what
to disclose only when properly probed". Geeky Medics advertises "800+ virtual patients", charges 4 credits
for a real-time voice consultation against 100 credits for £6.99 — about 24–28p depending on the bundle,
with text consultations free — and its virtual patients have been compared head to head with human
standardised patients in a cluster-randomised trial (Dang et al., *BMC Medical Education* 2026, n = 67),
which found **no significant difference** in OSCE scores (6.5 vs 6.3, p = 0.543). Other platforms have
randomised evidence too, so this is uncommon rather than unique. Several smaller PLAB 2 products gate their
patients for £10–30.

**Different.** Of the three dozen products checked in September 2026, **none publishes its mark scheme or
its gating rules, and none anchors a mark to a line of the transcript.** One vendor called its rubric
"commercially sensitive". And what students say they do not want is to be marked by it. In an interim UCLA
student-poster evaluation of Geeky Medics' AI OSCE in an obstetrics and gynaecology clerkship (n = 27, data
collection still ongoing), 96% agreed the cases were "reflective of what they had learned on their rotation
and appropriate for their level of training", but only **41%** agreed it was "a comparable learning
experience to an OSCE with a standardized patient", and only **7% "believed the OSCE should be a graded
part of the clerkship"**. The same abstract lists "inaccuracies of the AI grading feature" among the
difficulties encountered. That is a poster abstract with 27 students and unfinished data collection, not a
trial: read it as the shape of a worry, not a rate. A mark you cannot inspect is a mark you cannot argue
with.

So this repository publishes all of it: the case file with every fact's trigger, the content list with a
source per item, the gating rules as code with tests, and a report that quotes the question that earned each
mark.

There is also a regulator's sentence behind this. GMC, *Promoting excellence* (2015, in effect from 2016),
R5.8, under the heading "Undergraduate assessment":

> Assessments must be carried out by someone with appropriate expertise in the area being assessed, and who
> has been appropriately selected, supported and appraised. They are responsible for honestly and
> effectively assessing the medical student's performance and **being able to justify their decision**.

Its postgraduate twin, R5.11, repeats that and adds "Educators must be trained and calibrated in the
assessments they are required to conduct" — a calibration duty the undergraduate standard does not impose.

A GMC-published psychometric analysis by Matt Homer (Leeds), *Influences on scoring and grading in PLAB2:
PLAB2 Annual Report 2022*, published December 2023 and covering 189,862 station-level rows from March to
October 2022, finds the examiner explaining 15–17% of the variance in station **scores** (Tables 5–7)
against the candidate's own 10.3%: "we see that Examiner is the strongest predictor of total domain scores
in stations followed by Candidate…".

Three caveats belong with that figure and are not optional. It holds for scores, not grades: for grades the
examiner's 8.5% sits **below** the candidate's 9.3%. The same report adds that "when station-level effects
are aggregated up to the exam level, the apparent concern that examiners have a strong relative impact on
scores is largely ameliorated. In this report we have not explicitly measured the extent of this", and
Homer's own 2022 paper puts exam-level reliability at 0.75 for domain scores. And R5.8's "someone" has never
been said by the GMC to permit software. **Per-mark auditability is not a fix for unfair exams.** It is what
makes a practice tool's feedback checkable, which is the thing students say is missing.

## What the engine does

- **Fact gates.** Each case has facts (presenting complaint, history, critical facts, the person's hidden
  concern). A fact unlocks only when the learner covers its rubric item; the concern can also come out once
  enough rapport (trust) has been built.
- **The simulated person's prompt never contains a locked fact.** It is built from the persona and unlocked
  facts only. An output guard then checks every reply for the guarded terms of locked facts, retries once and
  redacts if needed. The honest boundary: a model can still guess, which is why the guard exists; a case
  author can leak a fact through a paraphrase, which `check-case` cannot catch; and a judge talked into
  crediting a rubric item unlocks a fact for real, which happened on 2 of 24 attack lines in
  `eval/results/demo-cough/attack.md`.
- **Safety pause.** A high-precision rule list runs before any model call and pauses the session on
  real-symptom or self-harm wording. Beside it, a separate check (`src/nebius/safetyClient.ts`) asks a model
  whether the line is a request for real help, for the user or for someone they name; it runs at the same time
  as the judge, so it costs no extra waiting, and the wording of the pause follows what was said (a pharmacist
  for a medicines question, Samaritans for self-harm, the domestic abuse helpline for someone being hurt).
  The judge's own flag stands in only when that check has no answer. Paused turns never reach the patient model
  and never enter later history. How well it works, and what that number is worth, is in
  `eval/results/demo-cough/safety.md` and in the caveats below.
  **In offline mode there is no model check at all**: only the rule list runs, which pauses on 23 of the 57
  held-out disclosures. `npm run play` is offline unless you pass `--online`, and it says so when it starts.
- **A report that shows its working.** Every covered item carries the question that earned it and the
  published source of the item itself; every missed item carries an example question. Above that, the field's
  own feedback statements, each with what the judgement rests on and whether the wording is a regulator's or
  ours. See "What the report says" below.
- **Offline mode.** A keyword judge and a person who repeats the relevant facts let everything run with no
  model and no cost. Evaluation numbers are never reported from offline mode.

## What the report says, and what it refuses to say

The old report gave a coverage ratio and turned it into Good / Satisfactory / Borderline / Unsatisfactory.
Those are the GMC's own words, and the GMC says plainly that this judgement "does not determine whether you
pass the station and is not included in the results you will receive" — it exists only to calculate the
station cut score. The GMC also publishes no item-level mark scheme. So the old report used the exam's
vocabulary for something the exam does not do. **There is no verdict in the report any more.**

What the clinical pack reports instead is the GMC's three marking domains and its **ten examiner feedback
statements, quoted verbatim** from the PLAB 2 guide, each with what this station can honestly say about it:

- **Six of the ten cannot be judged from typed history taking** — Findings, Examination, Diagnosis and
  Management outright, and half of Rapport, Listening and Language. They say so, because silence on a
  statement reads as a pass. Rapport notes that warmth of voice and manner is invisible here; Listening that
  non-verbal cues are; Language that speaking too quickly is; Time that typing is not timed.
- **The content list is ours, and the report says so**, with a source per item in `RUBRIC_SOURCES`
  (`src/cases/rubric.ts`). Of the fourteen standard items, eleven have verbatim support from the GMC
  (*Outcomes for graduates* 11a, 11b, 18a; the PLAB 2 feedback statements; the one published sample station)
  or from NICE. Three rest on the Calgary-Cambridge guide alone and are marked `framework`. On safety netting
  specifically: the term was first described by Roger Neighbour in *The Inner Consultation* (1987), the GMC's
  own Management feedback statement says "including follow up and safety netting", and NICE NG12
  recommendation 1.14.6 (as numbered since the April 2026 update) says to explain "which symptoms to look out
  for and when they should return for re-evaluation" - but NG12 is a suspected-cancer guideline and that
  recommendation applies to a defined group who have symptoms associated with increased risk and do **not**
  meet the threshold for referral, not to every consultation.
- **SOCRATES is not cited.** It is widely taught for pain, but the origin usually given for it could not be
  verified in any primary source, so it is not used here as an authority. The example question no longer asks
  for a severity score out of ten either: no published UK source asks for one.
- **Not every item applies to every station.** The stated pass requirements of the GMC's one published sample
  station (an 8-minute headache telephone consultation) do not mention family history, a systems review,
  smoking or safety netting; they do ask for "appropriate lifestyle history (eg alcohol, diet, sex, sleep)"
  and to "Recommend appropriate management", either of which a marker could read as covering them. The cleaner
  evidence is a word search: "safety netting", "family history" and "systems review" appear nowhere in
  *Outcomes for graduates 2020* or the MLA content map, while "smoking" appears in both. The report counts
  coverage and never converts it into a pass.

## Domain packs

A pack (`src/domains/pack.ts`) is everything the tool knows about one kind of conversation:

| In the pack | In the engine |
|---|---|
| Scoring domains and their names | How a turn runs, what unlocks a fact, what the guard redacts |
| The content list, with a source per item | Which items were covered, and at which question |
| The feedback statements, their wording and whose words they are | The flags a judge returns: jargon, interruption, empathy, question style |
| A small `assess` function per statement | Whether the order held, and whether the hidden concern came out |
| The four sentences of the simulated person's prompt that are about the field | The rules that stop the model inventing things |

The engine hands a pack a field-neutral `Observations` bundle and nothing else, which is what keeps it free
of any one field's assumptions. `registerPack` refuses a pack whose items sit in undeclared domains, whose
statement claims to be assessable without a way to judge itself, or which fails to say why a statement cannot
be assessed.

**`user-research-interview`** is the second pack, and it is deliberately a field with no regulator:

- Every statement is marked `authority: 'ours'` and the report prints "Nobody publishes a feedback list for
  this kind of conversation, so these statements are ours." Checked against the MRS Code of Conduct 2023, the
  AQR, the GDS Service Manual and survey-methodology behaviour coding: none of them is a feedback rubric for
  open discovery interviews. The clinical pack is the only one that may say `regulator`.
- Each item and statement is derived from one citable line — the UK Government Digital Service Service
  Manual, *The Mom Test* (Fitzpatrick 2013, ch. 1), the MRS Code of Conduct rule 30, or a named Nielsen
  Norman Group article. Nothing verbatim is attributed to Portigal's *Interviewing Users*, because no public
  excerpt of it could be reached.
- **The two habits that matter most are marked unassessable**: using silence ("typing has no pauses to sit
  in") and not pitching. A tool that cannot teach its field's most important skill should say so.

`cases/research-checkout.json` is a worked example. `tests/domains/pack.test.ts` runs a whole turn of it
through the same gating and guard and asserts that no clinical wording reaches the interviewee.

## Why this is typed, not spoken

Candidates are clear that the exam is spoken: nine independent accounts say practice has to be out loud, some
of them practising on a pillow or a soft toy rather than typing. So the limit is real and stated here rather
than hidden. Three reasons it is typed anyway:

1. **Nebius Token Factory, which the hackathon credits are for, has no speech model.** All 25 models in the
   catalogue are text, embedding or vision.
2. **Speech recognition is the wrong thing to be bad at, and it is worst for exactly these users.** Most
   people sitting PLAB 2 are not native English speakers, and a 2026 *npj Digital Medicine* study of clinical
   speech transcription reports that "in testing Whisper and WhisperX on native and non-native English
   clinical speech, error rates were significantly higher for non-native speakers". In a pilot of a voice
   virtual patient in pharmacy education, "voice recognition accuracy was the most frequently identified
   improvement priority (38/62, 61.3%)". A transcription error dressed up as a judged mark is worse than no
   mark. In fairness to that same pilot: 37 of its 62 students judged human standardised-patient training more
   effective than the voice system, and its authors position such a tool as "a complement to rather than a
   replacement for" it, which is this tool's position too.
3. **The evidence puts the weight on the feedback, not the realism.** In the Cochrane review of interventions
   for medical students' interpersonal communication (2021, 76 studies in 91 publications, 10,124 students),
   the one intervention *ingredient* with a defensible advantage over its alternative is feedback:
   "personalised/specific feedback probably improves overall communication skills to a small degree in
   comparison to generic or no feedback (SMD 0.58, 95% CI 0.29 to 0.87; 6 studies, 502 participants;
   moderate-quality evidence)", and the review's own practice implication is that "with the exception of
   providing tailored feedback, the differential effectiveness of particular approaches remains unclear".

Three things that review does **not** say, and that an earlier draft of this README got wrong. It does not
rank feedback against "relationship building" as though both were ingredients: the rapport figure (SMD 0.18,
95% CI -0.15 to 0.51, low-quality) is a different kind of comparison, any communication intervention against
usual curriculum measured on a rapport outcome, and its interval crosses zero, so it is absence of evidence of
an effect rather than a small one. Electronic versus face-to-face delivery is not flatly null: it "may make
little to no difference" to rapport (SMD 0.02, moderate-quality, n = 176), empathy is too imprecise to call
(SMD -0.13, 95% CI -0.68 to 0.43), and information giving may be slightly **worse** electronically. And
feedback is not the largest effect in the review; information gathering (SMD 1.07) is larger.

Two claims about transfer that this tool does not make, both corrected after reading the sources:

- McCarrick et al. 2025 (*J Surg Educ*) is often read as showing that typed practice transfers to a spoken
  OSCE. Its headline result as reported is a within-arm pre-post comparison, "significantly increased in the
  intervention group alone (p < 0.001, 0.37v0.19 Cohen D)", with no between-group test in the abstract, and
  the full text is paywalled. It **did** randomise 45 students to each arm with an assessor blinded to group,
  so this is a caveat about what was reported, not a claim that the trial had no control.
- One exploratory pilot RCT (Lee et al., *BMC Med Educ* 2025, n = 19 Korean-medicine students, no power
  calculation) found a non-significant trend favouring peer role-play on history taking in one of its two
  scenarios (Hedges' g = -0.68, adjusted p = 0.27), while its AI arm trended better on patient education (up
  to g = 0.99). Its AI arm was a **text** chatbot, so it does not isolate speaking, and its authors conclude
  the two approaches have "complementary strengths". An earlier draft of this README quoted only the figure
  that told against its own product, which is the same error as quoting only the flattering one.

So: typed practice is defensible for content coverage, structure and familiarisation. It is not a substitute
for speaking, and nothing here claims it is.

### The sharpest objections to this design

A reviewer raises these immediately, so they belong here rather than waiting to be found.

- **An AI that plays the patient and also marks is marking its own conversation.** The Cochrane review found
  the empathy effect of communication training "when assessed by experts, but not by simulated patients": the
  effect disappears when whoever played the patient does the scoring. This tool separates the roles in code
  (the judge is a different call from the patient, and the honesty grader is a different model again), but
  that is a mitigation, not an answer.
- **AI markers are systematically generous, and worst at exactly what a consultation is.** A 2025 *BMC
  Medical Education* comparison found "AI models consistently assigned higher scores than human evaluators
  across all skills" and that "inter-rater consistency was higher for visually observable steps, while
  auditory tasks led to greater discrepancies".
- **The evidence base for AI simulated patients is thin.** A 2025 scoping review of 28 studies found "only 13%
  (3/23) of studies used validated tools" and "only 21.7% (5/23) objectively measured learning outcomes", and
  concludes they "cannot replace real-world interactions".


## Run it

Requires Node 24.

```bash
npm install
npm test                                    # the full test suite
npm run typecheck
npm run play                                # offline session with the demo case; type /end to finish
npm run play -- path/to/case.json           # another case (it must pass check-case)
npm run check-case -- cases/demo-cough.json # authoring checks: errors block use, warnings are advice
npm run serve:offline                       # the web station with no models and no cost, on port 3101
```

`serve:offline` is the quickest way to see a pack end to end: it uses the keyword doubles, spends nothing,
and prints its own throwaway access code.

### Online mode (Nemotron on Nebius Token Factory)

Copy `.env.example` to `.env` and put your Token Factory key in `NEBIUS_API_KEY`. Then:

```bash
npm run smoke                               # three scripted turns against the real models, capped at $0.02
npm run play -- --online                    # a timed session with the Nemotron judge and patient
npm run serve                               # the web station with the real models (needs OSCE_ACCESS_CODE too)
```

By default both the judge and the patient are Nemotron 3 Super 120B with reasoning off, so a turn takes
about two seconds and a station costs well under a cent. The judge was chosen on the evaluation in
`eval/results/demo-cough/judge.md`: on 15 lines that should score nothing (10 off-topic, 5 injection attempts)
Nemotron 3.5 Lightning credited a rubric item on 5 of them, which unlocks facts nobody asked for, while Super
credited none. One run, one synthetic case, so read it as a direction, not a rate. `OSCE_JUDGE_MODEL` and
`OSCE_JUDGE_THINKING=on` change that (see `.env.example`). Every call is checked against a per-session cap
($0.05) and a daily cap ($0.50) before it is sent; the daily total is kept in `.osce-budget.json` so it holds
across runs. Token Factory has no hard spending limit of its own, so these caps are the safeguard. Reasoning
text returned by the models is discarded and never shown or logged.

The web station keeps its whole state in encrypted cookies (AES-256-GCM, scrypt-derived key), so the server
stores nothing between requests. A station's evidence does not fit in one cookie — a worst case sealed to
7,494 bytes against a 4 KB browser limit — so the sealed value is split across numbered cookies rather than
dropping the quotes that make a mark checkable.

## Deploying it

`render.yaml` is a Render blueprint for the free plan. Nothing secret is in it: the three secrets are
marked `sync: false`, so Render asks for them once and they stay out of the repository.

```
NEBIUS_API_KEY        the Token Factory key
OSCE_SESSION_SECRET   at least 16 characters; seals each station in its cookie
OSCE_ACCESS_CODE      at least 4 characters; without it a visitor only sees the sample report
```

The service refuses to start if the secret is too short or the code is missing, so it fails closed
rather than serving an open station.

Two things about a free plan worth knowing before trusting it:

- **It sleeps after 15 minutes without traffic**, and takes about a minute to wake while showing a
  loading page. `/healthz` exists for an external cron to knock on: it spends nothing and needs no
  access code. Pinging it every 10 minutes between 07:00 and 01:00 UK keeps it awake for the hours
  anyone is likely to visit and uses about 558 of the 750 free instance hours a month. Do not use
  GitHub Actions for this - a scheduled workflow in a public repository is disabled automatically
  after 60 days without repository activity.
- **The daily spend total is a file on an ephemeral disk**, so it resets on a deploy or when the
  instance is replaced. The per-station cap is enforced from the sealed cookie and does survive. What
  actually bounds the spending on a public URL is the access code: without it a visitor only ever
  reaches the sample report, which is played once at startup against the offline doubles and makes no
  model call at all.

## Evaluation

`npm run eval` measures the engine against fixed, committed test sets and writes a Markdown table and the
full JSON (every line, reply and label) to `eval/results/<case id>/`:

| Evaluation | What it measures | Test set |
|---|---|---|
| `judge` | Rubric accuracy, paraphrase unlock rate per fact, and false unlocks, for five judge settings (Nano, Lightning, Super with and without reasoning, Ultra) with cost and latency | `eval/fixtures/judge-lines.<case>.json`: five phrasings per rubric item (some in non-native English), off-topic lines and injection attempts |
| `safety` | How often each signal pauses practice on a real disclosure, and how often on an ordinary candidate line: the rule list, each candidate model for the check, the judge's flag, and what a session would do | `eval/fixtures/safety-blind-heldout.json`, the held-out set from Plan 1 (57 disclosures, 152 candidate lines, 16 borderline); `--set eval/fixtures/safety-dev.json` is the development set used to write the prompt |
| `attack` | Locked facts leaked per attack line, for this engine and for a control version that keeps every fact in the prompt and only asks the model not to volunteer them | `eval/fixtures/attacks.json`: 24 case-independent attacks |
| `honesty` | Invented answers to questions the case never mentions, and whether unlocked facts are stated without contradiction, graded by Nemotron 3 Ultra, a different model from the patient | `eval/fixtures/off-case.<case>.json` and each fact's example question |
| `agreement` | Cohen's kappa between the judge and a person's rubric labels on whole conversations | `--labels <file>`; `eval/labels/example.demo-cough.json` shows the format |

```bash
npm run eval -- all --offline               # free plumbing check with the keyword doubles; nothing is saved
npm run eval -- all --online                # judge, safety, attack and honesty on Token Factory, about $0.30
npm run eval -- agreement --online --labels eval/labels/<file>.json
npm run eval -- safety --online --set eval/fixtures/safety-dev.json   # the development set, about $0.03
```

### What these numbers are worth

- **One synthetic case, one run per line, temperature 0.** No repeat runs, no second case, and no clinician
  has reviewed any of it. Small denominators are given as counts in the tables; percentages over 15 or 20
  lines are a direction, not a rate.
- **The safety set is no longer blind.** It was measured, three kinds of miss were found, development lines in
  those styles were written, the prompt was revised, and it was measured again. Treat the recall figure as an
  upper bound. `eval/fixtures/safety-dev.json` is the development set and includes the bypass shapes an
  adversarial review found (indirection, self-quoting, non-English, role-play framing); those are measured
  there, not on the held-out set.
- **The judge changed underneath the comparison.** The "before" figure for the safety pause is the rule list
  plus the judge's own flag, measured with the same judge the tool ships today; an older note that says 46%
  was measured with a different judge model and is not a like-for-like baseline.
- **The honesty grader is a model.** Its labels were read by hand on the first run and matched, but a label
  like "invented" against "No known allergies" is a judgement call. Counts are in the JSON.
- **The prompt did not hold the honesty line; the engine does.** Asked about something the case never
  mentions, the simulated person answered with content the case cannot support 70% of the time. Three
  prompt versions moved that to 55% and then back to 65%, each change worth two or three answers out of
  twenty, and the third made the failure worse in kind: instead of a bare "No." the model began decorating
  the denial ("No chest pain. Just this stubborn cough."), a fabricated history a candidate would write
  down. What fixed it was not a better prompt. The judge now reports whether a line asked for information
  a case file would hold, which separates a question the case cannot answer from small talk, and on the
  first kind the engine asks the model again and then replaces the answer outright. That measures 0%
  unsupported, and 0% is what a deterministic guard should read: 13 of 20 replies were still caught and
  asked again, so the model asserts something on most of these questions and no longer reaches the
  candidate.
- **Two runs of the same judge measurement differ.** Same prompt, same 50 lines, temperature 0: 96% exact
  and 94% precision on one run, 94% and 92% two minutes later. A two-point move in any of these tables is
  noise, and `eval/results/demo-cough/judge.default.md` says so beside its own numbers.

Every run must say `--online` or `--offline`, so nothing spends by default (keep the `--` after `npm run eval`: without it npm keeps the flag). Each online run has its own cap (`--cap`, default $0.40, at most $2) on top of the daily cap. Leaks are
counted by each case's guarded terms, so a paraphrased leak is missed in both versions; the labels in the
judge and off-case sets are the author's, not a clinician's. The safety check's prompt was written against
`eval/fixtures/safety-dev.json`; the held-out set was measured before that prompt was revised and once after,
so it is no longer untouched, and the misses from the first run shaped the development set.

## Status

The offline core engine, the Nemotron clients with spend caps, the evaluation harness, the case pipeline and
the web station are complete, as is the split into domain packs. Not done: Cohen's kappa against a person's
labels, and no case reviewed by an expert in its field.

## Building a case from a transcript

`npm run build-case` turns one published consultation into a draft case and a review sheet:

```bash
npm run build-case -- data/raw/transcripts/RES0001.txt --id case-res0001
npm run build-case -- data/raw/primock57/transcripts/day1_consultation01_patient.TextGrid --id case-primock-01
npm run build-case -- <transcript> --id <id> --draft docs/case-reviews/<id>.draft.json   # rebuild, no model call
```

The model proposes facts; code decides what survives:

- **Every fact must quote the patient.** The quote has to be in the transcript, word for word, on
  the line the fact cites, said by the patient. A fact that fails is dropped and named in the
  sheet. In the four cases built so far this caught an invented symptom, a line taken from the
  doctor, and two quotes attributed to the wrong line.
- **Red flags are chosen by code, not by the model,** which filed a painful calf and coughing up
  blood as ordinary history every time. A short list of wording promotes such a fact to the
  standard critical item and says so.
- **Guarded terms are dropped** when the brief already gives them away or when they belong to more
  than one fact, because either way the output guard could not protect them.
- **The sheet is the human step.** Each fact sits beside the words it came from, with the line
  number, so checking needs no medical knowledge: read the transcript, tick or cross. Cases stay
  `reviewStatus: unreviewed` until a clinician says otherwise, which has not happened.

## Sources and licences

- **Code:** MIT. See `LICENSE`.
- **`cases/demo-cough.json`** and **`cases/research-checkout.json`:** written for this repository as synthetic
  content. Neither has been reviewed by anyone qualified in its field.
- **`cases/case-res0001.json`, `case-msk0001.json`, `case-gas0001.json`:** derived from Fareez et al. 2022,
  *A dataset of simulated patient-physician medical interviews* (figshare article 16550013), released under
  **CC0 1.0**. Every fact carries the transcript file, line and the patient's exact words.
- **`cases/case-primock-01.json`:** derived from **PriMock57** (Papadopoulos Korfiatis et al., Babylon Health,
  github.com/babylonhealth/primock57), released under **CC BY 4.0**. Facts derived from it are covered by that
  licence and carry the attribution in their `source` field; the repository's MIT licence covers the code.
- **The clinical content list** is attributed item by item in `RUBRIC_SOURCES` (`src/cases/rubric.ts`) to GMC
  *Outcomes for graduates 2018*, the GMC's PLAB 2 guide, the GMC's published sample station, NICE NG12 and the
  Calgary-Cambridge guide (Silverman, Kurtz & Draper, *Skills for Communicating with Patients*, 2nd ed, 2005).
  The ten feedback statements are quoted from the GMC's *Understanding your results* page (read 2026-09-26).
- **The research content list** is attributed item by item in `src/domains/userResearchInterview.ts` to the UK
  Government Digital Service Service Manual, *The Mom Test* (Fitzpatrick 2013, ch. 1), the Market Research
  Society Code of Conduct 2023 and named Nielsen Norman Group articles.
- **Not used:** MIMIC-III/IV and anything derived from them (credentialed access, and the data use agreement
  forbids sharing derivatives), PMC-Patients (CC BY-NC-SA, incompatible with an MIT tool), MedDialog (no licence
  granted, and the scraped sites' terms forbid redistribution), and the AgentClinic NEJM subset (NEJM copyright).
- **The raw datasets are not in this repository.** `data/raw/` is ignored by git; the commands above expect you
  to download them yourself from the links given here.
- **AgentClinic-MedQA** (MIT, 214 structured OSCE cases) is a possible third source; nothing from it is here yet.
- **Planned checking against NHS pages:** NHS website content is Crown copyright under the Open Government
  Licence v3.0, which requires attribution and does not imply NHS endorsement. Any case that quotes it will
  carry that attribution in its `source` field.
- **Every fact in a case file carries a `source`** (dataset, reference and quote). Nothing in this repository
  reproduces third-party clinical text today.
