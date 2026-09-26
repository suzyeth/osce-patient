// The page holds no case data and no key: it sends a line and shows what comes back.
const $ = (id) => document.getElementById(id);
const gate = $('gate');
const station = $('station');
const reportView = $('reportView');

let endsAt = 0;
let ticking = null;

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
  say('You', input, 'you');
  $('input').value = '';
  $('send').disabled = true;
  const { ok, data } = await api('/api/turn', { input });
  $('send').disabled = false;
  if (!ok) {
    error($('turnError'), data.error ?? 'Something went wrong.');
    if (typeof data.secondsLeft === 'number') startClock(data.secondsLeft);
    $('input').focus();
    return;
  }
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

function hint(text) {
  return Object.assign(document.createElement('span'), { className: 'hint', textContent: text });
}

function itemRow(item, covered) {
  const li = document.createElement('li');
  if (item.critical) li.className = 'critical';
  const mark = document.createElement('span');
  mark.className = covered ? 'tick' : 'cross';
  mark.textContent = covered ? '✓' : '✗';
  li.append(mark, document.createTextNode(item.label + (item.critical ? ' (critical)' : '')));
  // The words that earned the mark, so a candidate can disagree with it.
  if (covered) {
    li.append(
      hint(
        item.quote
          ? `question ${item.turn}: “${item.quote}”`
          : `question ${item.turn} — the words that earned this were not kept, so this mark cannot be checked`,
      ),
    );
  } else {
    li.append(hint(`Try: ${item.exampleQuestion}`));
  }
  li.append(hint(item.source ? `Source: ${item.source}` : "Source: none published; this item is this case's own."));
  return li;
}

const STATEMENT_MARK = { concern: ['cross', '✗'], no_concern: ['tick', '✓'], not_assessed: ['muted', '–'] };

function statementRow(s) {
  const li = document.createElement('li');
  if (s.outcome === 'concern') li.className = 'critical';
  const [cls, glyph] = STATEMENT_MARK[s.outcome] ?? STATEMENT_MARK.not_assessed;
  const mark = Object.assign(document.createElement('span'), { className: cls, textContent: glyph });
  li.append(mark, Object.assign(document.createElement('b'), { textContent: s.label }));
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

function renderReport(title, report) {
  $('reportTitle').textContent = title;
  // The domains and their names come from the case's domain pack, not from this page.
  const domains = report.domains.filter((d) => d.total > 0).map((d) => scoreCard(d.label, d));
  $('scores').replaceChildren(
    scoreCard('Items covered', { covered: report.items.filter((i) => i.covered).length, total: report.items.length }),
    ...domains,
  );
  $('caveat').textContent = report.caveat;
  $('reviewNote').textContent =
    report.reviewStatus === 'reviewed' ? '' : 'This case has not been reviewed by anyone qualified in the field.';
  $('statements').replaceChildren(...report.statements.map(statementRow));
  $('covered').replaceChildren(...report.items.filter((i) => i.covered).map((i) => itemRow(i, true)));
  $('missed').replaceChildren(...report.items.filter((i) => !i.covered).map((i) => itemRow(i, false)));
  show(reportView);
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
  renderReport(`Sample report: ${data.caseTitle}`, data.report);
});
