// Read-only local audit. Never prints credentials, matching text or raw history.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const env = { ...(existsSync('apps/api/.env') ? parseEnv(readFileSync('apps/api/.env', 'utf8')) : {}), ...process.env };
const names = ['OPENAI_API_KEY', 'EXA_API_KEY', 'AMBIGUOUS_API_KEY', 'COPILOTKIT_API_KEY', 'SLACK_BOT_TOKEN', 'AGENTLAYER_TOKEN'];
const secrets = names.filter(name => env[name]?.trim()).map(name => ({ name, value: env[name].trim() }));
if (existsSync('apps/api/.pairing-token')) secrets.push({ name: 'GENERATED_PAIRING_TOKEN', value: readFileSync('apps/api/.pairing-token', 'utf8').trim() });
const files = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))];
const matches = [];
let scanned = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const data = readFileSync(file);
  scanned++;
  for (const { name, value } of secrets) if (value && data.includes(Buffer.from(value))) matches.push({ file, credential: name });
}
// Git log covers additions/removals in reachable commits, not dangling objects.
const history = git('log', '--all', '-p', '--format=commit:%H', '--no-ext-diff');
const historyMatches = secrets.filter(({ value }) => value && history.includes(value)).map(({ name }) => name);
const envTracked = git('ls-files', '--', 'apps/api/.env', '.env', 'apps/api/.pairing-token').trim().length > 0;
let envIgnored = false;
try { envIgnored = Boolean(git('check-ignore', '--', 'apps/api/.env').trim()); } catch { /* reported as false */ }
const report = {
  capturedAt: new Date().toISOString(), head: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim(),
  reachableCommits: Number(git('rev-list', '--all', '--count').trim()), scannedCandidateFiles: scanned,
  configuredCredentialCount: secrets.length, matches, historyMatches, envTracked, envIgnored,
  dirty: Boolean(git('status', '--porcelain').trim()),
  limitations: ['Exact currently configured credential values only; not a general secret/private-data certification.', 'Reachable commit diffs only; final uncommitted files have not been published or clean-clone tested.', 'No git mutations, network requests or publication performed.'],
};
mkdirSync('.agentlayer', { recursive: true });
writeFileSync('.agentlayer/release-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (matches.length || historyMatches.length || envTracked || !envIgnored) process.exitCode = 1;
