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
- **Safety block.** A high-precision check runs before any model call and pauses the session on real-symptom
  or self-harm wording; the judge model's semantic flag covers the rest. Blocked turns never reach the patient model and never enter later history.
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

## Status

Plan 1 (the offline core engine) is complete. Next: Nemotron judge and patient clients on Nebius Token Factory
and a case pipeline from open transcripts (Plan 2), an evaluation harness (Plan 3), and a web app (Plan 4).

## Licence

MIT. See `LICENSE`.
