import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const rootChangelog = join(__dirname, '../../CHANGELOG.md');
const webChangelog = join(__dirname, '../CHANGELOG.md');

if (existsSync(rootChangelog)) {
  try {
    const rootContent = readFileSync(rootChangelog, 'utf-8');
    writeFileSync(webChangelog, rootContent, 'utf-8');
    console.log('[Changelog] ✓ Successfully synced CHANGELOG.md to web directory.');
  } catch (err) {
    console.warn('[Changelog] ⚠ Could not copy root CHANGELOG.md:', err);
  }
} else if (existsSync(webChangelog)) {
  console.log('[Changelog] Using existing web/CHANGELOG.md');
} else {
  console.warn('[Changelog] ⚠ No CHANGELOG.md found in root or web directory.');
}
