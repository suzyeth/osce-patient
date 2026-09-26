# osce-patient

A simulated patient for practising the history-taking station of medical OSCEs (PLAB 2 and UK finals).
The candidate interviews a fictional patient against a timer and gets a deterministic report on what they
covered, what they missed, and whether they found out what the patient was worried about.

**Educational use only.** This is a practice tool with fictional patients. It is not intended as a medical
device, it does not give medical advice, and it is not a symptom checker (software that assesses a user's own
symptoms can fall under UK MHRA medical-device rules). If a user seems to describe their own real
health problem, the session pauses and points them to NHS 111, their GP, 999 or Samaritans (116 123).

**Cases are not clinically reviewed.** Every case so far is marked `unreviewed`, and the report says so. The demo
case (`cases/demo-cough.json`) is synthetic.

## What the engine does

- **Fact gates.** Each case has facts (presenting complaint, history, red flags, the patient's concern). A fact
  unlocks only when the candidate covers its rubric item; the concern can also come out once the candidate has
  built enough rapport (trust).
- **The patient's prompt never contains a locked fact.** It is built from the persona and unlocked facts only.
  An output guard then checks every reply for the guarded terms of locked facts, retries once and redacts if
  needed. The honest boundary: a model can still guess, which is why the guard exists; a case author can leak a
  fact through a paraphrase, which `check-case` cannot catch; and a judge talked into crediting a rubric item
  unlocks a fact for real, which happened on 2 of 24 attack lines in `eval/results/demo-cough/attack.md`.
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
- **Deterministic report.** Covered items with the turn they were first covered, missed critical items (which cap
  the global judgement at Borderline), an example question for every miss, and scores for data gathering and
  interpersonal skills. Clinical management is only partly scored in this version.
- **Offline mode.** A keyword judge and a patient that repeats the relevant facts let everything run with no
  model and no cost. Evaluation numbers are never reported from offline mode.

## Run it

Requires Node 24.

```bash
npm install
npm test                                   # the full test suite
npm run typecheck
npm run play                               # offline practice session with the demo case; type /end to finish
npm run play -- path/to/case.json          # another case (it must pass check-case)
npm run check-case -- cases/demo-cough.json # authoring checks: errors block use, warnings are advice
```

### Online mode (Nemotron on Nebius Token Factory)

Copy `.env.example` to `.env` and put your Token Factory key in `NEBIUS_API_KEY`. Then:

```bash
npm run smoke                               # three scripted turns against the real models, capped at $0.02
npm run play -- --online                    # a timed session with the Nemotron judge and patient
```

By default both the judge and the patient are Nemotron 3 Super 120B with reasoning off, so a turn takes
about two seconds and a station costs well under a cent. The judge was chosen on the evaluation in
`eval/results/demo-cough/judge.md`: on 15 lines that should score nothing (10 off-topic, 5 injection attempts)
Nemotron 3.5 Lightning credited a rubric item on 5 of them, which unlocks facts nobody asked for, while Super
credited none. One run, one synthetic case, so read it as a direction, not a rate. `OSCE_JUDGE_MODEL` and `OSCE_JUDGE_THINKING=on` change that (see `.env.example`). Every call is checked
against a per-session cap ($0.05) and a daily cap ($0.50) before it is sent; the daily total is kept in
`.osce-budget.json` so it holds across runs. Token Factory has no hard spending limit of its own, so these caps
are the safeguard. Reasoning text returned by the models is discarded and never shown or logged.

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

Every run must say `--online` or `--offline`, so nothing spends by default (keep the `--` after `npm run eval`: without it npm keeps the flag). Each online run has its own cap (`--cap`, default $0.40, at most $2) on top of the daily cap. Leaks are
counted by each case's guarded terms, so a paraphrased leak is missed in both versions; the labels in the
judge and off-case sets are the author's, not a clinician's. The safety check's prompt was written against
`eval/fixtures/safety-dev.json`; the held-out set was measured before that prompt was revised and once after,
so it is no longer untouched, and the misses from the first run shaped the development set.

## Status

Plan 1 (the offline core engine), Plan 2 (Nemotron clients with spend caps) and Plan 3 (the evaluation
harness) are complete. Next: a case pipeline from open transcripts, and a web app (Plan 4).

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
- **`cases/demo-cough.json`:** written for this repository as synthetic test content. It is not clinical
  material and has not been reviewed by a clinician.
- **`cases/case-res0001.json`, `case-msk0001.json`, `case-gas0001.json`:** derived from Fareez et al. 2022,
  *A dataset of simulated patient-physician medical interviews* (figshare article 16550013), released under
  **CC0 1.0**. Every fact carries the transcript file, line and the patient's exact words.
- **`cases/case-primock-01.json`:** derived from **PriMock57** (Papadopoulos Korfiatis et al., Babylon Health,
  github.com/babylonhealth/primock57), released under **CC BY 4.0**. Facts derived from it are covered by that
  licence and carry the attribution in their `source` field; the repository's MIT licence covers the code.
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
