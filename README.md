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
- **The patient never sees a locked fact.** The patient model's prompt is built from the persona and unlocked
  facts only. An output guard then checks every reply for the guarded terms of locked facts, retries once and
  redacts if needed. The honest boundary: a model can still guess, which is why the guard exists, and a case
  author can still leak a fact through a paraphrase, which `check-case` cannot catch.
- **Safety pause.** A high-precision rule list runs before any model call and pauses the session on
  real-symptom or self-harm wording. Beside it, a separate check (`src/nebius/safetyClient.ts`) asks a model
  whether the line is a request for real help, for the user or for someone they name; it runs at the same time
  as the judge, so it costs no extra waiting. On the held-out set of 225 lines the two together pause on 100%
  of real disclosures and on 1% of ordinary candidate lines (`eval/results/demo-cough/safety.md`). The judge's
  own flag stands in only when that check has no answer. Paused turns never reach the patient model and never
  enter later history.
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
`eval/results/demo-cough/judge.md`: Nemotron 3.5 Lightning is faster and cheaper but credited a rubric item
on a third of the off-topic and injection lines, which unlocks facts nobody asked for, while Super credited
none of them. `OSCE_JUDGE_MODEL` and `OSCE_JUDGE_THINKING=on` change that (see `.env.example`). Every call is checked
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

Every run must say `--online` or `--offline`, so nothing spends by default (keep the `--` after `npm run eval`: without it npm keeps the flag). Each online run has its own cap (`--cap`, default $0.40, at most $2) on top of the daily cap. Leaks are
counted by each case's guarded terms, so a paraphrased leak is missed in both versions; the labels in the
judge and off-case sets are the author's, not a clinician's. The safety check's prompt was written against
`eval/fixtures/safety-dev.json`; the held-out set was measured before that prompt was revised and once after,
so it is no longer untouched, and the misses from the first run shaped the development set.

## Status

Plan 1 (the offline core engine), Plan 2 (Nemotron clients with spend caps) and Plan 3 (the evaluation
harness) are complete. Next: a case pipeline from open transcripts, and a web app (Plan 4).

## Licence

MIT. See `LICENSE`.
