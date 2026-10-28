// Usage:  npm run meta:connect -- <any fresh Facebook token>
// Exchanges the token for the permanent Page token and stores it in the database.
// The running site and worker pick it up within ~30 seconds; nothing needs restarting.
import { container } from '../src/infrastructure/container';

(async () => {
  const token = process.argv[2] ?? process.env.META_CONNECT_TOKEN;
  if (!token) {
    console.error('Usage: npm run meta:connect -- <token>');
    process.exit(1);
  }
  try {
    const r = await container.metaTokens.connect(token);
    const problem = await container.socialHealth();
    console.log(`Connected Page "${r.pageName}" (${r.pageId}) via ${r.via}.`);
    console.log(problem ? `Health check FAILED: ${problem}` : 'Health check OK: Facebook Page and Instagram account reachable.');
    process.exitCode = problem ? 2 : 0;
  } catch (err) {
    console.error('Could not connect:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
  setTimeout(() => process.exit(), 100);
})();
