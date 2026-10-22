// The page holds no case data and no key: it sends a line and shows what comes back.
import {
  fromSampleTranscript,
  linkableTurn,
  openingEntry,
  orderStatements,
  recordTurn,
  STATEMENT_WORDING,
  summarise,
} from './reportModel.js';

const $ = (id) => document.getElementById(id);
const gate = $('gate');
const station = $('station');
const reportView = $('reportView');

let endsAt = 0;
let ticking = null;
// The conversation as this page saw it. The server keeps only the turns that earned a mark, without
// the replies, so this copy is what lets a mark open the line it came from. Memory only.
let log = [];

function show(section) {
  for (const s of [gate, station, reportView]) s.hidden = s !== section;
}

function say(who, text, className) {
  const li = document.createElement('li');
  li.className = className;
  const name = document.createElement('span');
  name.className = 'who';
  name.textContent = who;
  li.append(name, document.createTextNode(text));
  $('log').append(li);
  $('log').scrollTop = $('log').scrollHeight;
  return li;
}

function clock(secondsLeft) {
  const left = Math.max(0, secondsLeft);
  $('clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  $('clock').parentElement.classList.toggle('low', left <= 60);
  if (left === 0) finish();
}

function startClock(secondsLeft) {
  endsAt = Date.now() + secondsLeft * 1000;
  clock(secondsLeft);
  clearInterval(ticking);
  ticking = setInterval(() => clock(Math.round((endsAt - Date.now()) / 1000)), 1000);
}

async function api(path, payload) {
  const response = await fetch(path, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: payload === undefined ? {} : { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({ error: 'The server sent something unreadable.' }));
  return { ok: response.ok, data };
}

function error(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

/** The stations on offer. Chosen before the code, so a visitor can see what is there. */
async function loadCases() {
  const { ok, data } = await api('/api/cases');
  const box = $('caseChoice');
  if (!ok || !data.cases?.length) {
    $('casesLoading').textContent = 'No stations are available right now.';
    return;
  }
  box.replaceChildren(Object.assign(document.createElement('legend'), { textContent: 'Choose a station' }));
  for (const [index, station] of data.cases.entries()) {
    const label = document.createElement('label');
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'caseId', value: station.id, checked: index === 0 });
    const body = document.createElement('span');
    body.append(Object.assign(document.createElement('span'), { className: 'title', textContent: `${station.title} (${station.minutes} min)` }));
    body.append(Object.assign(document.createElement('span'), { className: 'brief', textContent: station.brief }));
    body.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: station.packLabel }));
    if (station.note) body.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: station.note }));
    if (station.reviewStatus !== 'reviewed') {
      body.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: 'not reviewed by an expert' }));
    }
    label.append(radio, body);
    box.append(label);
  }
}

const chosenCase = () => document.querySelector('input[name="caseId"]:checked')?.value;

$('startForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  error($('gateError'), '');
  $('startButton').disabled = true;
  const { ok, data } = await api('/api/start', { code: $('code').value, caseId: chosenCase() });
  $('startButton').disabled = false;
  if (!ok) {
    error($('gateError'), data.error ?? 'Could not start.');
    return;
  }
  $('brief').textContent = data.brief;
  $('brief').dataset.patient = data.patientName;
  $('turns').textContent = `up to ${data.maxTurns} questions`;
  // What to call the person comes from the case's domain pack, not from this page.
  $('input').placeholder = `Ask the ${data.personNoun} a question`;
  // The server decides how long a question may be; hard-coding it here meant raising the limit did
  // nothing and the page cut the candidate off without saying why.
  if (data.maxInputChars) $('input').maxLength = data.maxInputChars;
  $('log').replaceChildren();
  log = [openingEntry(data.openingLine)];
  say(data.patientName, data.openingLine, 'patient');
  show(station);
  startClock(data.secondsLeft);
  $('input').focus();
});

$('turnForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('input').value.trim();
  if (!input) return;
  error($('turnError'), '');
  const asked = say('You', input, 'you');
  $('input').value = '';
  $('send').disabled = true;
  const { ok, data } = await api('/api/turn', { input });
  $('send').disabled = false;
  if (!ok) {
    // The server did not take the line, so it is not part of the conversation: take it back off the
    // page and give it back to the candidate to edit, rather than leave a question nobody answered.
    asked.remove();
    $('input').value = input;
    error($('turnError'), data.error ?? 'Something went wrong.');
    if (typeof data.secondsLeft === 'number') startClock(data.secondsLeft);
    $('input').focus();
    return;
  }
  log = recordTurn(log, { turnsUsed: data.turnsUsed, candidate: input, reply: data.reply, paused: Boolean(data.paused) });
  say(data.paused ? 'Practice paused' : $('brief').dataset.patient ?? 'Patient', data.reply, data.paused ? 'paused' : 'patient');
  $('turns').textContent = `${data.turnsUsed} of ${data.maxTurns} questions`;
  startClock(data.secondsLeft);
  $('input').focus();
});

function scoreCard(label, score) {
  const box = document.createElement('div');
  box.className = 'score';
  box.append(Object.assign(document.createElement('small'), { textContent: label }));
  box.append(Object.assign(document.createElement('b'), { textContent: `${score.covered}/${score.total}` }));
  return box;
}

function hint(text, kind = '') {
  return Object.assign(document.createElement('span'), { className: kind ? `hint ${kind}` : 'hint', textContent: text });
}

function itemRow(item, covered) {
  const li = document.createElement('li');
  if (item.critical) li.className = 'critical';
  const mark = document.createElement('span');
  mark.className = covered ? 'tick' : 'cross';
  mark.textContent = covered ? '✓' : '✗';
  li.append(mark, document.createTextNode(item.label + (item.critical ? ' (critical)' : '')));
  // The words that earned the mark, so a candidate can disagree with it. When this page still has
  // that line, the quote opens it in the conversation.
  if (covered && item.quote) {
    const text = `question ${item.turn}: “${item.quote}”`;
    const turn = linkableTurn(log, item);
    if (turn === null) {
      li.append(hint(text));
    } else {
      const link = Object.assign(document.createElement('a'), { href: `#turn-${turn}`, className: 'hint quote', textContent: text });
      link.addEventListener('click', (event) => {
        event.preventDefault();
        showTurn(turn);
      });
      li.append(link);
    }
  } else if (covered) {
    li.append(hint(`question ${item.turn} — the words that earned this were not kept, so this mark cannot be checked`));
  } else {
    li.append(hint(`Try: ${item.exampleQuestion}`, 'try'));
  }
  li.append(hint(item.source ? `Source: ${item.source}` : "Source: none published; this item is this case's own.", 'source'));
  return li;
}

function statementRow(s) {
  const li = document.createElement('li');
  if (s.outcome === 'concern') li.className = 'critical';
  if (s.outcome === 'not_assessed') li.className = 'unassessed';
  // The statements are written as faults, so an outcome is said in words: a tick beside "Shows poor
  // time management" reads as agreeing with it.
  const outcome = STATEMENT_WORDING[s.outcome] ?? STATEMENT_WORDING.not_assessed;
  li.append(Object.assign(document.createElement('b'), { className: `outcome ${s.outcome}`, textContent: outcome }));
  li.append(document.createTextNode(` · ${s.label}`));
  li.append(hint(s.text));
  li.append(hint(s.evidence));
  // Whose words these are matters: a regulator's statement and ours are not the same thing.
  li.append(hint(`${s.authority === 'regulator' ? 'Published wording' : 'Our wording'}, from: ${s.source}`));
  for (const q of s.quotes.slice(0, 3)) {
    li.append(
      hint(
        q.text === ''
          ? `Question ${q.turn}: the words were not kept, so this part cannot be checked`
          : `You wrote at question ${q.turn}: “${q.text}”`,
      ),
    );
  }
  return li;
}

function line(text, className) {
  return Object.assign(document.createElement('p'), { className, textContent: text });
}

/** Opens the conversation at a question and marks it, so a mark can be checked against its words. */
function showTurn(turn) {
  $('conversationBox').open = true;
  const target = document.getElementById(`turn-${turn}`);
  if (!target) return;
  for (const old of document.querySelectorAll('.transcript .hit')) old.classList.remove('hit');
  target.classList.add('hit');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** The first thing read: how much was covered, which critical item was missed, whether the concern came out. */
function renderSummary(report) {
  const summary = summarise(report);
  // The domains and their names come from the case's domain pack, not from this page.
  const domains = report.domains.filter((d) => d.total > 0).map((d) => scoreCard(d.label, d));
  const scores = Object.assign(document.createElement('div'), { className: 'scores' });
  scores.append(scoreCard('Items covered', summary), ...domains);
  const { kind, labels } = summary.critical;
  const critical =
    kind === 'missed'
      ? line(`Critical item missed: ${labels.join('; ')}`, 'flag bad')
      : kind === 'none-missed'
        ? line('No critical item missed.', 'flag good')
        : line('This case marks no item as critical.', 'flag');
  const concern =
    summary.concern === 'elicited'
      ? [line(`The ${report.personNoun}'s hidden concern came out.`, 'flag good')]
      : summary.concern === 'not-elicited'
        ? [line(`The ${report.personNoun}'s hidden concern did not come out.`, 'flag bad')]
        : [];
  $('summary').replaceChildren(scores, critical, ...concern);
}

/** The whole conversation, each question numbered as the report numbers it, with what it earned. */
function renderTranscript(report) {
  const earned = (turn) => report.items.filter((i) => i.covered && i.turn === turn).map((i) => i.label);
  const rows = log.flatMap((entry) => {
    const reply = Object.assign(document.createElement('li'), { className: entry.paused ? 'paused' : 'patient' });
    reply.append(Object.assign(document.createElement('span'), { className: 'who', textContent: entry.paused ? 'Practice paused' : report.personNoun }));
    reply.append(document.createTextNode(entry.reply));
    if (entry.candidate === null) return [reply];
    const asked = Object.assign(document.createElement('li'), { className: 'you' });
    if (entry.turn !== null) asked.id = `turn-${entry.turn}`;
    asked.append(Object.assign(document.createElement('span'), { className: 'who', textContent: entry.turn ? `Question ${entry.turn}` : 'You' }));
    asked.append(document.createTextNode(entry.candidate));
    const marks = entry.turn ? earned(entry.turn) : [];
    if (marks.length) asked.append(hint(`Earned: ${marks.join('; ')}`));
    return [asked, reply];
  });
  $('transcript').replaceChildren(...rows);
}

function renderReport(title, report) {
  $('reportTitle').textContent = title;
  $('caveat').textContent = report.caveat;
  $('reviewNote').hidden = report.reviewStatus === 'reviewed';
  $('reviewNote').textContent = 'This case has not been reviewed by anyone qualified in the field.';
  renderSummary(report);
  const criticalFirst = (a, b) => Number(b.critical) - Number(a.critical);
  const missed = report.items.filter((i) => !i.covered).sort(criticalFirst);
  const covered = report.items.filter((i) => i.covered);
  $('missed').replaceChildren(...(missed.length ? missed.map((i) => itemRow(i, false)) : [line('Nothing on the list.', 'muted')]));
  $('covered').replaceChildren(...(covered.length ? covered.map((i) => itemRow(i, true)) : [line('Nothing yet.', 'muted')]));
  const statements = orderStatements(report.statements);
  $('statementsSummary').textContent = `How a reviewer would comment (${statements.length} statements)`;
  $('statements').replaceChildren(...statements.map(statementRow));
  $('statementsBox').open = false;
  renderTranscript(report);
  $('conversationBox').open = false;
  show(reportView);
  reportView.scrollIntoView({ block: 'start' });
}

let finishing = false;

async function finish() {
  // The clock reaching zero and the Finish button both land here; one report is enough.
  if (finishing) return;
  finishing = true;
  clearInterval(ticking);
  const { ok, data } = await api('/api/report', {});
  if (!ok) {
    // Let them try again: the session is still there, so a failed fetch is not a lost station.
    finishing = false;
    error($('turnError'), data.error ?? 'Could not build the report. Press Finish to try again.');
    return;
  }
  renderReport(`Your report: ${data.caseTitle}`, data.report);
}

$('finish').addEventListener('click', finish);
$('again').addEventListener('click', () => {
  finishing = false;
  log = [];
  show(gate);
  $('code').focus();
});
void loadCases();

$('sampleButton').addEventListener('click', async () => {
  const { ok, data } = await api('/api/sample');
  if (!ok) {
    error($('gateError'), data.error ?? 'No sample available.');
    return;
  }
  log = fromSampleTranscript(data.transcript ?? []);
  renderReport(`Sample report: ${data.caseTitle}`, data.report);
});
