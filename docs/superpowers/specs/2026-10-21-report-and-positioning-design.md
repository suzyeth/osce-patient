# Report redesign, small fixes and honest positioning

- Date: 2026-10-21
- Status: approved 2026-10-21
- Scope: the web report, a handful of small defects, and every public claim about what makes this different.
  The engine, the judge, the cases' facts and the evaluation harness are not touched.

## 1. Why

Two things changed since the README was written on 2026-09-26.

1. **The claim at the top of the README is no longer true.** It says no product "anchors a mark to a line of
   the transcript". Oscelyra (iPhone, voice, on the App Store since 2026-08-17) says in its launch post on
   r/PLABprep that "every mark links to the exact line in your transcript"; Quesmed's OSCE-AI marking paper says
   it marks by "citing what you actually said", and publishes an agreement pilot (10 transcripts, 4 blinded
   examiners). Neither publishes its mark scheme openly, its disclosure rules, or any leak / fabrication / safety
   figure, and no open-source PLAB 2 practice tool was found on GitHub. The closest open code is
   PatientsWithPersonality (TUM / Google, MIT), a research framework with the same selective-disclosure idea.
2. **The report does not show the product's value on its first screen.** Walking through a station showed:
   - the ten GMC feedback statements are written as faults ("Shows poor time management"), and a statement that
     was *not* triggered gets a green tick, which reads as agreeing with the fault;
   - the part that matters (which question earned which mark, what was missed, how to ask it) is below two
     near-identical disclaimers and ten statements, four of which are "not assessed";
   - a covered mark quotes the question, but you cannot see it in the conversation it came from.

Judges may watch only the video, and the report is the screen the video is built around. Real candidates
(r/PLABprep testers, recruited after this ships) will judge the tool on the same screen.

## 2. Goals

1. The first screen of the report answers, without scrolling on a laptop: how much was covered, which critical
   item was missed, whether the hidden concern came out.
2. Every covered mark can be traced, in one click, to the highlighted line in the full conversation.
3. Feedback statements no longer put a tick next to a fault.
4. Every public claim about difference is true as of 2026-10-21, and each competitor figure is traced to its
   source before it is written.
5. Small defects found on 2026-10-21 are fixed (section 5).

## 3. Non-goals

- No change to judging, gating, the patient, safety, spend caps or the evaluation harness.
- No new cases, no practice-mode hints, no native app, no in-page speech recognition, no text-to-speech.
- No server-side storage of the conversation (the cookie budget is already tight; see `sessionCookie.ts`).
- No agreement (kappa) figure in this piece of work. It is planned separately and needs a person's labels.

Anti-goals (would count as failure even if it works): a report that looks more confident than the evidence
behind it; hiding the "not reviewed" and "not assessed" honesty that is already there; a claim of being first
or only at something that a competitor already claims.

## 4. The report

### 4.1 Order, top to bottom

1. **Title** and one combined notice: practice feedback, not an assessment; the case is not reviewed by an
   expert (when it is not); the pack's caveat. One block, not three.
2. **Summary strip** (the first thing read):
   - items covered `n / total`, then one figure per domain (as now);
   - critical items missed, each by name, in the existing critical style; "No critical item missed" only when
     the case has at least one critical item; when it has none, "This case marks no item as critical" (three of
     the four real cases have none, and "none missed" would imply a check that never happened);
   - the hidden concern: "came out" / "did not come out", with no question number, omitted when the case has
     none (`report.concernElicited` is null). *Decision (builder check):* the state records no per-fact unlock
     turn, and a concern can unlock on trust at a turn that credited nothing, so a number would need engine and
     cookie changes this work excludes, and an approximated one could be wrong.
3. **What you missed**, critical items first. Each row as now: label, "Try: ...", source.
4. **What you covered**. Each row as now, and the quote becomes a link: "question k: “...”". Clicking it
   scrolls to and highlights that line in the conversation (4.2).
5. **Reviewer comments**, collapsed by default (`<details>`), summary line "How a reviewer would comment (10
   statements)". Inside, each statement shows an outcome word instead of a glyph:
   - `concern` → "**Needs attention**" (critical style)
   - `no_concern` → "**No concern raised**"
   - `not_assessed` → "**Not assessed here**" (muted), and these sort last.
   The statement wording, evidence, authority and source lines stay as they are.
6. **The conversation**, collapsed by default ("Show the whole conversation"), opened automatically when a
   quote link is clicked. Each candidate line carries its question number; lines that earned a mark show the
   item labels they earned.
7. The existing "report it on the issue tracker" notice and "Start another station".

### 4.2 Where the conversation comes from

The server does not keep the conversation (only credited turns, without replies), and should not start to.
The page already has every line, so it keeps them:

- On start and on each successful `/api/turn`, the page appends `{ turn, candidate, reply, paused }` to an
  in-memory array. `turn` is `data.turnsUsed` from that response, so it matches the server's numbering,
  which is what `item.turn` refers to. A failed turn is not recorded (the server did not count it).
- The opening line is recorded as turn 0, patient only.
- The array lives only in page memory and is cleared on "Start another station". Nothing is written to
  storage.
- **Sample report**: `/api/sample` already returns `transcript`; the page renders that instead. The builder
  should check its shape against the page's array and adapt in one small function.
- If a quoted turn is not in the array (page reloaded mid-station), the quote stays plain text, as today.
- A safety-paused turn reuses the previous `turnsUsed`, and a `session_too_large` response returns the old
  count: record such lines as unnumbered so they never collide with a counted turn.

### 4.3 Look

Use the existing stylesheet and its tokens; no framework, no new dependency. Summary strip as a row of the
existing score boxes plus the critical / concern lines. Highlight: a brief background flash on the target line
and a persistent outline. Must work at 375 px wide.

## 5. Small fixes

| # | Defect | Fix |
|---|---|---|
| 1 | Station titles give away key history: "Chest Pain and Shortness of Breath Post-Hysterectomy" | Titles also live in `docs/case-reviews/*.draft.json`; change both so a rebuild does not undo it. Retitle the four real cases by presenting complaint only, in sentence case, e.g. "Chest pain and breathlessness", "Nausea and vomiting", "Low back pain", "Diarrhoea". Check every title and brief for any other fact a candidate should have to ask for. |
| 2 | Brief reads "has come in about Persistent nausea and vomiting" | Lower-case the complaint in the case briefs that have this. |
| 3 | Tags run together: "UK clinical history takingnot reviewed by an expert" | Spacing between the tag spans in CSS. |
| 4 | Demo case is too thin (7 items) to show the product | The list already sorts by id, so a real case opens first and the synthetic demo is near the end; keep that. The sample report already uses `case-res0001` (first case with a critical item in `readdirSync` order); make that choice explicit by id so it does not depend on directory order on Linux. `case-res0001` is the only real case with a critical item and a concern, so it is the one the video uses. |
| 5 | Typing straight after "Start" was lost once during the walk-through | `$('input').focus()` is already called. Reproduce in a real browser first; fix only if it reproduces, and say if it does not. |
| 6 | Many candidates do not know their keyboard can dictate | One muted line under the input: "On a phone, your keyboard's microphone lets you speak instead of typing." |
| 7 | The non-clinical `research-checkout` station sits among PLAB stations with nothing saying why | Keep it, last in the list (after the synthetic demo), with a tag reading "Example: the engine is not tied to medicine". *Decided by the user.* |

## 6. Positioning: README and page copy

- **Rewrite "What is actually different, and what is not"**:
  - *Not different*: add Oscelyra (marks linked to transcript lines, voice, iPhone) and Quesmed's marking
    pilot (it cites the candidate's words; agreement figures). Keep Geeky Medics and the existing Quesmed
    pricing paragraph. Mention PatientsWithPersonality as the open research framework with the same
    selective-disclosure idea, and say this is a practice tool, not a research framework.
  - *Different*: the mark scheme, the content list with a source per item, and the rules for which question
    unlocks which fact are published as code with tests, open source, no login; locked facts never enter the
    patient's prompt, by construction; and it measures and publishes leak, fabrication and safety figures that
    no competitor publishes. Remove "none anchors a mark to a line of the transcript" everywhere.
  - Keep the UCLA poster, GMC R5.8 and Homer paragraphs and all their caveats; they still stand.
- **Every competitor figure is opened at its source before it is written** (Quesmed's PDF:
  `https://quesmed.com/osce-ai/quesmed-osce-ai-marking.pdf`; Oscelyra's post and App Store page). Write only
  what the source says. If a source cannot be opened, describe the claim without the number and say so.
- **Page copy**: the header subtitle and the footer stop implying uniqueness. Proposed footer: "Open source
  (MIT). The mark scheme and the unlock rules are published in the repository. Judge and patient run on
  Nemotron via Nebius Token Factory; facts you have not asked about are never in the patient's prompt."
- **Status section**: say the kappa figure is not done yet (unchanged), and add the date of the competitor
  check.

## 7. Testing and verification

- Existing tests stay green (965 at the start).
- Any logic added outside `public/` (for example a helper that matches quotes to turns, if it is put in `src/`)
  gets unit tests. Logic kept inside `public/app.js` is checked by walking through it.
- Walk-through in a browser, offline mode (`npm run serve:offline`): one station on a real case with at least
  one covered critical item, one missed item and the concern elicited; then the sample report. Check the first
  screen, a quote link, the collapsed sections, and 375 px width. Screenshots of each go in the hand-back.
- One online station (Token Factory, capped at $0.05) to confirm turn numbers line up with real model replies.
- README: every number re-checked against its source after editing; any number that cannot be traced is
  listed.

## 8. Left to the builder

- Exact copy of headings and the summary lines, within the meaning above.
- Whether the quote-to-turn matching lives in `public/app.js` or a small tested module.
- CSS details.

## 9. Delivery

Work on a branch in `D:\projects\osce-patient`, commit as each part lands, merge to `main` and push to
`origin` once the walk-through passes. Render will deploy from `main` once it is connected (separate step).
