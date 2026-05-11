// Fix asset paths in static HTML for GitHub Pages subdirectory deployment
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const BASE_PATH = '/wowwoo';
const DIST_DIR = join(process.cwd(), 'dist');

function getAllHtmlFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...getAllHtmlFiles(fullPath));
    } else if (entry.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function patchFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let count = 0;
  // Patch attr="/path" -> attr="/wowwoo/path", but not if already patched or external
  content = content.replace(
    /(\b(?:src|href|content)=["'])\/(?!wowwoo\/)(?!\/)([^"']*)/g,
    (match, prefix, path) => {
      count++;
      return `${prefix}${BASE_PATH}/${path}`;
    }
  );
  writeFileSync(filePath, content, 'utf-8');
  console.log(`  Patched (${count}): ${filePath.replace(DIST_DIR, '')}`);
}

const htmlFiles = getAllHtmlFiles(DIST_DIR);
console.log(`Found ${htmlFiles.length} HTML files to patch`);
for (const file of htmlFiles) {
  patchFile(file);
}
console.log('Done patching paths for GitHub Pages deployment.');
