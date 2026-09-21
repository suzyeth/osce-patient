export const EVALS = ['judge', 'safety', 'attack', 'honesty', 'agreement'] as const;
export type EvalName = (typeof EVALS)[number];

/** A full `all` run is estimated at about $0.30; the cap leaves room without inviting surprises. */
export const DEFAULT_CAP_USD = 0.4;
/** A typo such as --cap 40 is refused rather than trusted. */
export const MAX_CAP_USD = 2;

export interface EvalArgs {
  evals: EvalName[];
  casePath: string;
  offline: boolean;
  capUsd: number;
  repeat: number;
  labelsPath: string | null;
}

export const USAGE = [
  'Usage: npm run eval -- <judge|safety|attack|honesty|agreement|all> [options]',
  '  --offline          free run with the offline doubles, to check the plumbing (nothing is saved)',
  '  --case <path>      case file (default cases/demo-cough.json)',
  `  --cap <usd>        spending cap for this run (default ${DEFAULT_CAP_USD}, at most ${MAX_CAP_USD})`,
  '  --repeat <n>       how many times each honesty question is asked (default 2, at most 5)',
  '  --labels <path>    labelled conversations, required for agreement',
  '"all" runs judge, safety, attack and honesty; agreement needs a person\'s labels and runs on its own.',
].join('\n');

const VALUE_FLAGS: readonly string[] = ['--case', '--cap', '--repeat', '--labels'];

type Parsed = { ok: true; args: EvalArgs } | { ok: false; message: string };

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Parses the eval command line; every problem comes back as a message, never a throw. */
export function parseEvalArgs(argv: readonly string[]): Parsed {
  const name = argv[0];
  if (name === undefined) return { ok: false, message: USAGE };
  const evals: EvalName[] =
    name === 'all' ? ['judge', 'safety', 'attack', 'honesty'] : (EVALS as readonly string[]).includes(name) ? [name as EvalName] : [];
  if (evals.length === 0) return { ok: false, message: `Unknown evaluation "${name}".\n${USAGE}` };

  // Anything unrecognised is refused: a typo such as --ofline must not turn into a paid online run.
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--offline') continue;
    if (!VALUE_FLAGS.includes(arg)) return { ok: false, message: `Unknown argument "${arg}".
${USAGE}` };
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return { ok: false, message: `${arg} needs a value.` };
    i += 1;
  }
  const capText = valueAfter(argv, '--cap');
  const capUsd = capText === undefined ? DEFAULT_CAP_USD : Number(capText);
  if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > MAX_CAP_USD) {
    return { ok: false, message: `--cap must be a dollar amount above 0 and at most ${MAX_CAP_USD}.` };
  }
  const repeatText = valueAfter(argv, '--repeat');
  const repeat = repeatText === undefined ? 2 : Number(repeatText);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) return { ok: false, message: '--repeat must be a whole number from 1 to 5.' };

  const labelsPath = valueAfter(argv, '--labels') ?? null;
  if (evals.includes('agreement') && labelsPath === null) return { ok: false, message: 'agreement needs --labels <path>.' };

  return {
    ok: true,
    args: {
      evals,
      casePath: valueAfter(argv, '--case') ?? 'cases/demo-cough.json',
      offline: argv.includes('--offline'),
      capUsd,
      repeat,
      labelsPath,
    },
  };
}
