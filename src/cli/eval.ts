/**
 * Runs the evaluations behind the results table. See `npm run eval` with no arguments for usage.
 * Online runs call Token Factory under one spending cap per run (plus the daily cap) and save
 * results to eval/results/<case id>/; --offline checks the plumbing for free and saves nothing.
 */
import { validateCase } from '../validateCase.js';
import { BudgetError } from '../nebius/budget.js';
import { describeConfigError, loadConfig, loadDotEnv, type NebiusConfig } from '../nebius/config.js';
import { parseEvalArgs } from '../eval/args.js';
import { createEvalClients, offlineEvalClients } from '../eval/clients.js';
import { EvalSetupError, runEvals } from '../eval/runner.js';
import { loadCaseFile } from './loadCaseFile.js';

const parsed = parseEvalArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.message);
  process.exit(2);
}
const { args } = parsed;

const loaded = loadCaseFile(args.casePath);
if (!loaded.ok) {
  console.error(loaded.message);
  process.exit(2);
}
const patientCase = loaded.patientCase;
const { errors } = validateCase(patientCase);
if (errors.length) {
  console.error(`Case ${patientCase.id} failed validation (run npm run check-case for details).`);
  process.exit(1);
}

function onlineConfig(): NebiusConfig {
  loadDotEnv();
  try {
    return loadConfig();
  } catch (e) {
    console.error(`Online evaluation needs a valid .env (see .env.example), or use --offline: ${describeConfigError(e)}`);
    process.exit(2);
  }
}

const config = args.offline ? null : onlineConfig();
const clients = config ? createEvalClients(config, args.capUsd) : offlineEvalClients();
if (config) console.log(`Online run on ${patientCase.id}: cap $${args.capUsd} for this run, daily cap $${config.dailyBudgetUsd}.\n`);

try {
  const saved = await runEvals(args, patientCase, clients, {
    fixturesDir: 'eval/fixtures',
    outDir: 'eval/results',
    now: () => new Date(),
    log: (text) => console.log(text),
    models: { judge: config?.judgeModel ?? 'offline', patient: config?.patientModel ?? 'offline' },
  });
  if (saved.length) console.log(`Saved:\n  ${saved.join('\n  ')}`);
} catch (e) {
  if (e instanceof BudgetError) {
    console.error(`\nSpending cap reached (${e.message}). The run stopped; the evaluation in progress was not saved.`);
    console.error('Raise --cap (at most $2) or OSCE_DAILY_BUDGET_USD in .env only if you mean to spend more.');
    process.exitCode = 1;
  } else if (e instanceof EvalSetupError) {
    console.error(e.message);
    process.exitCode = 2;
  } else {
    throw e;
  }
} finally {
  if (clients.online) {
    console.log(`\nThis run: ${clients.usage().length} model calls, $${clients.spentUsd().toFixed(4)} charged to the cap (failed attempts included).`);
  }
}
