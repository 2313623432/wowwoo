import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is required.');
  console.error('Usage: GITHUB_TOKEN=your_token node deploy-github-pages.mjs');
  process.exit(1);
}
const OWNER = '2313623432';
const REPO = 'wowwoo';
const DIST_DIR = join(process.cwd(), 'dist');
const BRANCH = 'gh-pages';

const headers = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'deploy-script',
};

function getAllFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function createBlob(content, encoding) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, encoding }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create blob: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.sha;
}

async function createTree(entries) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: null,
      tree: entries,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create tree: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.sha;
}

async function createCommit(treeSha, message) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create commit: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.sha;
}

async function setRef(ref, sha) {
  const fullRef = `refs/heads/${ref}`;
  // Check if ref exists
  const checkRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${ref}`,
    { headers }
  );
  if (checkRes.ok) {
    // Update
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${ref}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha, force: true }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to update ref: ${res.status} ${err}`);
    }
  } else {
    // Create
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: fullRef, sha }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create ref: ${res.status} ${err}`);
    }
  }
  console.log(`Ref ${ref} set to ${sha}`);
}

async function enablePages() {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      build_type: 'workflow',
      source: {
        branch: BRANCH,
        path: '/',
      },
    }),
  });
  if (res.ok) {
    console.log('GitHub Pages enabled!');
  } else {
    // Might already be enabled - try PUT to update
    const updateRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pages`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        source: {
          branch: BRANCH,
          path: '/',
        },
      }),
    });
    if (updateRes.ok) {
      console.log('GitHub Pages updated!');
    } else {
      const err = await updateRes.text();
      console.log('Note: Pages config may already be set:', res.status, err);
    }
  }
}

function isBinary(filePath) {
  const ext = filePath.toLowerCase();
  const binaryExts = ['.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.mp4', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.map'];
  return binaryExts.some(e => ext.endsWith(e));
}

async function main() {
  console.log('Scanning dist directory...');
  const files = getAllFiles(DIST_DIR);
  console.log(`Found ${files.length} files`);

  const treeEntries = [];
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const relativePath = relative(DIST_DIR, filePath).replace(/\\/g, '/');
    const content = readFileSync(filePath);
    const encoding = isBinary(filePath) ? 'base64' : 'utf-8';
    const contentStr = encoding === 'base64' ? content.toString('base64') : content.toString('utf-8');

    console.log(`[${i + 1}/${files.length}] Creating blob: ${relativePath}`);
    const sha = await createBlob(contentStr, encoding);
    treeEntries.push({
      path: relativePath,
      mode: '100644',
      type: 'blob',
      sha,
    });

    // Avoid rate limiting
    if ((i + 1) % 10 === 0) {
      console.log('  ... brief pause for rate limit ...');
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log('Creating tree...');
  const treeSha = await createTree(treeEntries);

  console.log('Creating commit...');
  const commitSha = await createCommit(treeSha, 'Deploy to GitHub Pages');

  console.log(`Setting ${BRANCH} branch...`);
  await setRef(BRANCH, commitSha);

  console.log('Configuring GitHub Pages...');
  await enablePages();

  console.log('\nDeployment complete!');
  console.log(`Site will be available at: https://${OWNER}.github.io/${REPO}/`);
  console.log('It may take a few minutes for the site to become live.');
}

main().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
