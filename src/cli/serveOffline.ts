/**
 * The station with no models and no cost: offline doubles answer as the simulated person and as the
 * judge. For trying the page out and for checking a new domain pack end to end.
 *
 * Usage: npm run serve:offline [port]
 *
 * The access code and session secret are local throwaways. Nothing here can spend anything, and no
 * real key is read, so there is no secret worth keeping: the secret is random for each start, which
 * also means a restart invalidates any station left open.
 */
import { randomBytes } from 'node:crypto';

process.env.OSCE_WEB_OFFLINE = 'on';
process.env.PORT = process.argv[2] ?? '3101';
process.env.OSCE_ACCESS_CODE ??= 'offline';
process.env.OSCE_SESSION_SECRET = randomBytes(24).toString('hex');

console.log(`Offline station on http://localhost:${process.env.PORT} - access code "${process.env.OSCE_ACCESS_CODE}"`);
await import('./serve.js');
