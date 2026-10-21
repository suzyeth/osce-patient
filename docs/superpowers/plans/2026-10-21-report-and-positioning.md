# Report Redesign, Small Fixes and Honest Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the report's first screen show the result, link every earned mark to its line in the conversation, fix the small defects found on 2026-10-21, and make every public claim of difference true.

**Architecture:** The server is unchanged apart from station ordering and the sample's case choice. The page keeps its own copy of the conversation (the server keeps only credited turns, without replies) and renders the report from `SessionReport` plus that copy. The decisions the page makes (turn numbering, the summary lines, statement wording) live in one small pure ES module, `public/reportModel.js`, so Vitest can test them; `public/app.js` only builds DOM.

**Tech Stack:** TypeScript (Node, tsx), Vitest, plain HTML/CSS/ES-module JS in `public/`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-report-and-positioning-design.md`

## Global Constraints

- No change to judging, gating, the patient, safety, spend caps, the evaluation harness or the session cookie.
- No new dependency, no framework, nothing written to browser storage.
- No new cases; case *facts* are not edited (titles and briefs only, Task 3).
- Pure helpers return new values; never mutate an argument.
- Code comments in English, matching the surrounding density and voice.
- Every competitor figure written in README is opened at its source first; untraceable figures are left out and listed in the hand-back.
- Work on branch `feat/report-and-positioning` (already created; the spec is its first commit). Commit after each task.

## Review Focus

1. **Page reloaded mid-station, so a quoted turn is not in the page's copy:** the quote shows as plain text, never a dead link. Test in Task 1 (`linkableTurn`).
2. **A safety-paused turn, or a `session_too_large` reply, returns a `turnsUsed` no higher than the last numbered turn:** that line is recorded unnumbered and never takes another line's number. Test in Task 1 (`recordTurn`).
3. **A case with no critical item and no concern (3 of 4 real cases):** summary says "This case marks no item as critical" and has no concern line. Test in Task 1 (`summarise`).
4. **A covered item whose words were not kept (`quote: null`):** keeps today's "cannot be checked" wording and gets no link. Test in Task 1 (`linkableTurn`).
5. **375 px wide phone:** report, collapsed sections and the conversation fit with no horizontal scroll. Checked in Task 4's walk-through.

---

### Task 1: Report model helpers

**Files:**
- Create: `public/reportModel.js`
- Test: `tests/web/reportModel.test.ts`

**Interfaces:**
- Produces (all named exports, plain JS with JSDoc types):
  - `type LogEntry = { turn: number | null, candidate: string | null, reply: string, paused: boolean }` — `turn` 0 is the opening line (`candidate: null`).
  - `recordTurn(log: LogEntry[], entry: { turnsUsed: number, candidate: string, reply: string, paused: boolean }): LogEntry[]` — returns a new array. The entry is numbered `turnsUsed` only when `turnsUsed` is greater than the highest numbered turn in `log`; otherwise `turn: null`.
  - `openingEntry(reply: string): LogEntry` — `{ turn: 0, candidate: null, reply, paused: false }`.
  - `fromSampleTranscript(transcript: { student: string, patient: string }[]): LogEntry[]` — entry *i* gets `turn: i + 1`.
  - `linkableTurn(log: LogEntry[], item: { covered: boolean, turn: number | null, quote: string | null }): number | null` — the turn to link to, or null when not covered, no quote, or the turn is not in `log`.
  - `summarise(report): { covered: number, total: number, critical: { kind: 'none-defined' | 'none-missed' | 'missed', labels: string[] }, concern: 'elicited' | 'not-elicited' | null }` — `report` is a `SessionReport` (src/report.ts). Labels come from `report.items` that are critical and not covered, in item order.
  - `STATEMENT_WORDING: { concern: 'Needs attention', no_concern: 'No concern raised', not_assessed: 'Not assessed here' }`
  - `orderStatements(statements): statements` — new array, `concern` first, then `no_concern`, then `not_assessed`; stable within each group.

- [ ] **Step 1: Write the failing tests** in `tests/web/reportModel.test.ts` (import from `../../public/reportModel.js`):
  - `recordTurn numbers a counted turn`: log `[openingEntry('Hi')]`, entry `turnsUsed: 1` → last entry `turn === 1`; input array unchanged (`log.length === 1`).
  - `recordTurn leaves a paused or repeated turn unnumbered`: after turns 1 and 2, an entry with `turnsUsed: 2, paused: true` → `turn === null`; a following `turnsUsed: 3` → `turn === 3`.
  - `fromSampleTranscript numbers from 1`: two pairs → turns `[1, 2]`, `candidate` = `student`, `reply` = `patient`.
  - `linkableTurn`: covered with quote and turn 2 present → `2`; turn 5 absent → `null`; `quote: null` → `null`; `covered: false` → `null`.
  - `summarise with no critical items`: report whose items are all `critical: false` and `concernElicited: null` → `critical.kind === 'none-defined'`, `concern === null`.
  - `summarise with a missed critical item`: one critical item uncovered, label `'Asks about calf pain'`, `concernElicited: true` → `{ kind: 'missed', labels: ['Asks about calf pain'] }`, `concern === 'elicited'`.
  - `summarise with every critical item covered` → `kind === 'none-missed'`; `concernElicited: false` → `'not-elicited'`.
  - `orderStatements` puts outcomes in order `concern, no_concern, not_assessed`, stable.

- [ ] **Step 2: Run** `npx vitest run tests/web/reportModel.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `public/reportModel.js` with the signatures above. If `npm run typecheck` rejects the test's import of a `.js` file, add `public/reportModel.d.ts` declaring the same signatures rather than loosening `tsconfig.json`.

- [ ] **Step 4: Run** `npx vitest run tests/web/reportModel.test.ts` then `npm test` and `npm run typecheck` — Expected: all PASS (965 + new).

- [ ] **Step 5: Commit** — `feat: a small tested model for the report page's decisions`

### Task 2: Station order, the engine-example tag, and a fixed sample case

**Files:**
- Modify: `src/web/router.ts` (`cases()` around lines 238-256)
- Modify: `src/cli/serve.ts` (`sampleReport()` around line 77)
- Test: `tests/web/router.test.ts`

**Interfaces:**
- Produces: each `/api/cases` entry gains `note: string | null`. It is `'Example: the engine is not tied to medicine'` for a case whose pack is not `uk-clinical-history`, else null.
- Produces: `/api/cases` order: `uk-clinical-history` cases whose id does not start with `demo-` (by id), then `demo-` cases (by id), then every other pack (by id).

- [ ] **Step 1: Write the failing tests** in `tests/web/router.test.ts`, using the file's existing deps fixture with a clinical case, a `demo-` case and a `user-research-interview` case: the returned ids are in the order above; only the research case has `note === 'Example: the engine is not tied to medicine'`.
- [ ] **Step 2: Run** `npx vitest run tests/web/router.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the ordering and `note` in `cases()`. In `sampleReport()`, prefer `all['case-res0001']`, then fall back to the existing "first with a critical item" rule; one comment saying why (directory order is not guaranteed on Linux, and it is the only real case with a critical item and a concern).
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: real stations first, the research station labelled as an engine example, and a fixed sample case`

### Task 3: Titles and briefs that give nothing away

**Files:**
- Modify: `cases/case-gas0001.json`, `cases/case-msk0001.json`, `cases/case-primock-01.json`, `cases/case-res0001.json` (`title`, `candidateBrief` only)
- Modify: the same `title` (and brief, if present) in `docs/case-reviews/<id>.draft.json`

- [ ] **Step 1: Check each title and brief against the case's facts.** Anything a candidate should have to ask for comes out. Known: "Post-Hysterectomy", "with Radiation", "for three days" (duration is a rubric item), "with associated shortness of breath" (check whether it is a gated fact; keep it only if it is the presenting complaint fact). Titles in sentence case by presenting complaint: `Nausea and vomiting`, `Low back pain`, `Diarrhoea`, `Chest pain` (add "and breathlessness" only if the presenting fact includes it). Lower-case the complaint inside briefs ("about persistent nausea", "about low back pain").
- [ ] **Step 2: Run** `npm run check-case -- cases/<id>.json` for each of the four, and `npm test` — Expected: all pass. If a test pins an old title, update the test's expected title only.
- [ ] **Step 3: Commit** — `fix: station titles and briefs stop giving away the history`

### Task 4: The report page

**Files:**
- Modify: `public/index.html`, `public/app.js`, `public/styles.css`

**Interfaces:**
- Consumes: everything Task 1 produces; `note` from Task 2.

- [ ] **Step 1: Implement the page** to the spec's section 4.1 order:
  - `index.html`: one combined notice block (`#notice`) replacing the two banners, `#caveat` and `#reviewNote`; a `#summary` block after the title; sections "What you missed" (`#missed`) then "What you covered" (`#covered`); `<details id="statementsBox">` with summary "How a reviewer would comment (N statements)" holding `#statements`; `<details id="conversationBox">` with summary "Show the whole conversation" holding `<ol id="transcript">`; the issue-tracker notice and "Start another station" last. Under the station's input: `<p class="muted dictation">On a phone, your keyboard's microphone lets you speak instead of typing.</p>`.
  - `app.js`: keep a module-level `log` (LogEntry[]); set it to `[openingEntry(...)]` on start, extend with `recordTurn` after each successful or paused `/api/turn` (use `data.turnsUsed`; a non-ok response is not recorded unless it carries a `reply`), reset on "Start another station". Sample: `fromSampleTranscript(data.transcript)`. Render the summary from `summarise`; statements via `orderStatements` and `STATEMENT_WORDING` (outcome word in bold in place of the glyph). A covered item's quote is an `<a href="#turn-k">` only when `linkableTurn` returns k; clicking opens `#conversationBox`, scrolls the line into view and adds class `hit` (flash + outline). Each transcript candidate line shows "Question k" (or nothing when unnumbered) and the labels of items whose `turn === k`. Station list: render `station.note` as a tag when present.
  - `styles.css`: spacing between `.cases .tag` spans (`margin-right`, or render each on its own line); `.summary` styles reusing `.score`; `.hit` highlight; `.dictation` small and muted; nothing wider than the viewport at 375 px.
- [ ] **Step 2: Focus check.** In a real browser, start a station and type immediately without clicking. If the first characters are lost, fix it (for example focus after the section is shown, on the next frame). If not, note "did not reproduce" in the commit message.
- [ ] **Step 3: Walk-through, offline.** `npm run serve:offline`, code `offline`. On `case-res0001`: ask the presenting complaint, one critical item, and the concern question, skip at least one critical item, then Finish. Check: summary names the missed critical item and says the concern came out; clicking a covered quote opens the conversation at the highlighted line; statements collapsed and worded, none with a tick beside a fault. Then the same on `case-gas0001` (expect "This case marks no item as critical", no concern line). Then "See a finished report". Then repeat the res0001 report at 375 px width. Screenshot each.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: the report leads with the result and every mark opens the line that earned it`

### Task 5: Positioning in README and page copy

**Files:**
- Modify: `README.md` (the "What is actually different, and what is not" section, the Status section, any other sentence claiming no one anchors a mark to the transcript)
- Modify: `public/index.html` (header subtitle if it implies uniqueness; footer)

- [ ] **Step 1: Open each source** and note exactly what it says: Quesmed's marking PDF `https://quesmed.com/osce-ai/quesmed-osce-ai-marking.pdf`; Oscelyra's post `https://www.reddit.com/r/PLABprep/comments/1we7th4/` (read with `opencli reddit read 1we7th4`) and App Store page `https://apps.apple.com/gb/app/oscelyra/id6800436154`; PatientsWithPersonality `https://github.com/mo374z/PatientsWithPersonality`.
- [ ] **Step 2: Rewrite** per the spec's section 6: "Not different" gains Oscelyra and Quesmed's marking pilot (only what the sources say) and PatientsWithPersonality; "Different" is the published mark scheme, content-list sources and unlock rules as tested code, open source with no login, locked facts never in the patient's prompt, and the published leak / fabrication / safety figures. `git grep -n -i "anchors a mark\|none anchors"` returns nothing. Status gains "Competitors re-checked 2026-10-21". Footer text exactly: "Open source (MIT). The mark scheme and the unlock rules are published in the repository. Judge and patient run on Nemotron via Nebius Token Factory; facts you have not asked about are never in the patient's prompt."
- [ ] **Step 3: Re-check every number in the edited sections** against its source; list any that cannot be traced.
- [ ] **Step 4: Commit** — `docs: say what others already do, and what is still only here`

### Task 6: Online check, merge and push

- [ ] **Step 1:** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 2: One online station.** With `.env` holding `NEBIUS_API_KEY`, start `npm run serve` with a throwaway `OSCE_SESSION_SECRET` (≥16 chars) and `OSCE_ACCESS_CODE` set in that shell only, play 4–6 turns on `case-res0001`, Finish. Expected: quote links land on the right lines; spend under the $0.05 station cap.
- [ ] **Step 3:** Merge `feat/report-and-positioning` into `main` (fast-forward), `git push origin main`, delete the branch locally.
