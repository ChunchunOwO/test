import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptsDir);
const baselinePath = join(scriptsDir, 'oversized-file-baseline.json');
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

const countLines = (content) => {
  if (content.length === 0) return 0;
  return content.split(/\r?\n/).length;
};

const failures = [];

for (const [relativePath, maximumLines] of Object.entries(baseline)) {
  let content;
  try {
    content = await readFile(join(projectRoot, relativePath), 'utf8');
  } catch (error) {
    failures.push(`${relativePath}: cannot read protected file (${error.message})`);
    continue;
  }

  const actualLines = countLines(content);
  const status = actualLines <= maximumLines ? 'PASS' : 'FAIL';
  console.log(`${status} ${relativePath}: ${actualLines} / ${maximumLines} lines`);

  if (actualLines > maximumLines) {
    failures.push(
      `${relativePath}: grew by ${actualLines - maximumLines} line(s); extract the new responsibility instead`,
    );
  }
}

if (failures.length > 0) {
  console.error('\nOversized protected files must not grow:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nOversized file growth check passed.');
}
