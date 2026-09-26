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
    if (station.reviewStatus !== 'reviewed') {
      body.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: 'not clinically reviewed' }));
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

function itemRow(item, covered) {
  const li = document.createElement('li');
  if (item.critical) li.className = 'critical';
  const mark = document.createElement('span');
  mark.className = covered ? 'tick' : 'cross';
  mark.textContent = covered ? '✓' : '✗';
  li.append(mark, document.createTextNode(item.label + (item.critical ? ' (red flag)' : '')));
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = covered ? `first covered at question ${item.turn}` : `Try: ${item.exampleQuestion}`;
  li.append(hint);
  return li;
}

const DOMAIN_LABELS = { data_gathering: 'Information gathering', interpersonal: 'Communication', management: 'Clinical management' };

function renderReport(title, report) {
  $('reportTitle').textContent = title;
  const domains = Object.entries(report.domains)
    .filter(([, score]) => score.total > 0)
    .map(([domain, score]) => scoreCard(DOMAIN_LABELS[domain] ?? domain, score));
  $('scores').replaceChildren(
    scoreCard('Items covered', { covered: report.items.filter((i) => i.covered).length, total: report.items.length }),
    ...domains,
  );
  const judgement = document.createElement('div');
  judgement.className = 'score';
  judgement.append(Object.assign(document.createElement('small'), { textContent: 'Overall' }));
  judgement.append(Object.assign(document.createElement('b'), { textContent: report.global }));
  $('scores').append(judgement);
  if (report.managementIncomplete) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Clinical management is only partly scored in this version.';
    $('scores').after(note);
  }
  $('covered').replaceChildren(...report.items.filter((i) => i.covered).map((i) => itemRow(i, true)));
  $('missed').replaceChildren(...report.items.filter((i) => !i.covered).map((i) => itemRow(i, false)));
  show(reportView);
}

async function finish() {
  clearInterval(ticking);
  const { ok, data } = await api('/api/report', {});
  if (!ok) {
    error($('turnError'), data.error ?? 'Could not build the report.');
    return;
  }
  renderReport(`Your report: ${data.caseTitle}`, data.report);
}

$('finish').addEventListener('click', finish);
$('again').addEventListener('click', () => {
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
