const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const FILES = ['app_wasm.js', 'app_wasm.wasm', 'app_proxy_win.exe'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const marker = 'wasm-release-manifest-v1';
function snapshot(root) {
  const files = {};
  for (const name of FILES) {
    const p = path.join(root, name);
    if (!fs.lstatSync(p).isFile()) throw Error(`Not a regular file: ${name}`);
    const bytes = fs.readFileSync(p);
    if (!bytes.length || bytes.toString('utf8', 0, 100).startsWith('version https://git-lfs')) throw Error(`Invalid artifact: ${name}`);
    if (name.endsWith('.wasm') && !bytes.subarray(0, 8).equals(Buffer.from([0,97,115,109,1,0,0,0]))) throw Error('Invalid WASM header');
    if (name.endsWith('.exe') && bytes.toString('ascii', 0, 2) !== 'MZ') throw Error('Invalid EXE header');
    files[name] = { sha256: hash(bytes), size: bytes.length };
  }
  return { files, bundleId: hash(Buffer.from(FILES.map(n => `${n}:${files[n].sha256}`).join('\n'))) };
}
function decode(release, repository) {
  const match = (release.body || '').match(/<!-- wasm-release-manifest-v1:([A-Za-z0-9+/=]+) -->/);
  if (!match) return null;
  const m = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  if (m.schemaVersion !== 1 || m.version !== release.tag_name || m.sourceRepository !== repository || !/^[a-f0-9]{40}$/.test(m.sourceCommit) || !/^[a-f0-9]{64}$/.test(m.bundleId)) throw Error('Invalid release manifest');
  for (const n of FILES) if (!m.files[n] || !/^[a-f0-9]{64}$/.test(m.files[n].sha256) || !Number.isSafeInteger(m.files[n].size) || m.files[n].size <= 0) throw Error('Invalid file manifest');
  if (hash(Buffer.from(FILES.map(n => `${n}:${m.files[n].sha256}`).join('\n'))) !== m.bundleId) throw Error('Invalid bundle ID');
  return m;
}
function nextVersion(now, names) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p => [p.type,p.value]));
  const prefix = `wasm-${parts.year}.${parts.month}.${parts.day}.`;
  const seq = names.filter(n => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length))).map(n => Number(n.slice(prefix.length)));
  return prefix + (Math.max(0, ...seq) + 1);
}
function report(m) {
  const lines = [`# ${m.version}`, '', `Source: https://github.com/${m.sourceRepository}/commit/${m.sourceCommit}`, `Bundle SHA-256: \`${m.bundleId}\``, `Previous release: ${m.previousVersion || 'initial baseline'}`, '', '| File | Change | Bytes | SHA-256 |','| --- | --- | --- | --- |'];
  for (const n of FILES) lines.push(`| ${n} | ${m.changes[n]} | ${m.files[n].size} | ${m.files[n].sha256} |`);
  lines.push('', 'File/header validation: passed. Runtime/interface tests: not run.', '기능 변경 설명: 제공되지 않음. Release 발행은 제품 배포·호환성 검증 완료를 의미하지 않습니다.', '', 'Consumer PRs (live state):');
  for (const repo of ['xpanner-connect-excavator-fe','xpanner-x1-excavator-desktop']) lines.push(`- [${repo}](https://github.com/XpannerDev/${repo}/pulls?q=${encodeURIComponent(`is:pr head:codex/sync-wasm-${m.sourceCommit}`)})`);
  return lines.join('\n') + '\n';
}
async function publish({github, owner, repo, sourceSha, root = '.', now = new Date()}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw Error('Full source SHA required');
  const repository = `${owner}/${repo}`;
  const current = snapshot(root); // No API writes before validation.
  const releases = await github.paginate(github.rest.repos.listReleases, {owner,repo,per_page:100});
  const records = releases.map(r => ({r,m:decode(r,repository)})).filter(x => x.m);
  const sameSource = records.find(x => x.m.sourceCommit === sourceSha);
  if (sameSource && sameSource.m.bundleId !== current.bundleId) throw Error('Source SHA already recorded with different bytes');
  let selected = sameSource || records.find(x => x.m.bundleId === current.bundleId && !x.r.draft) || records.find(x => x.m.bundleId === current.bundleId);
  let reused = Boolean(selected);
  if (!selected) {
    const tags = await github.paginate(github.rest.repos.listTags,{owner,repo,per_page:100});
    const version = nextVersion(now,[...releases.map(r => r.tag_name),...tags.map(t => t.name)]);
    const previous = records.filter(x => !x.r.draft).sort((a,b) => b.m.createdAt.localeCompare(a.m.createdAt))[0]?.m;
    const m = {schemaVersion:1,version,sourceRepository:repository,sourceCommit:sourceSha,createdAt:now.toISOString(),...current,previousVersion:previous?.version || null,changes:Object.fromEntries(FILES.map(n => [n, !previous ? 'initial' : previous.files[n].sha256 === current.files[n].sha256 ? 'unchanged' : 'changed']))};
    const body = report(m) + `\n<!-- ${marker}:${Buffer.from(JSON.stringify(m)).toString('base64')} -->\n`;
    const {data:r} = await github.rest.repos.createRelease({owner,repo,tag_name:version,target_commitish:sourceSha,name:version,body,draft:true,make_latest:'false'});
    selected = {r,m}; // Draft body is the durable reservation for interrupted runs.
  }
  const {m} = selected;
  let r = selected.r;
  // Ensure the tag is pinned. Never move an existing tag.
  let ref;
  try { ref = (await github.rest.git.getRef({owner,repo,ref:`tags/${m.version}`})).data; }
  catch(e) { if (e.status !== 404) throw e; }
  if (!ref) {
    if (!r.draft) throw Error('Published release tag is missing');
    ref = (await github.rest.git.createRef({owner,repo,ref:`refs/tags/${m.version}`,sha:m.sourceCommit})).data;
  }
  if (ref.object.type !== 'commit' || ref.object.sha !== m.sourceCommit) throw Error('Release tag target mismatch');
  const expected = Object.fromEntries(FILES.map(n => [n,fs.readFileSync(path.join(root,n))]));
  expected['wasm-manifest.json'] = Buffer.from(JSON.stringify(m,null,2)+'\n');
  expected['change-report.md'] = Buffer.from(report(m));
  const assets = await github.paginate(github.rest.repos.listReleaseAssets,{owner,repo,release_id:r.id,per_page:100});
  for (const [name,data] of Object.entries(expected)) {
    let asset = assets.find(a => a.name === name);
    if (asset && asset.state === 'starter' && r.draft) {
      await github.rest.repos.deleteReleaseAsset({owner,repo,asset_id:asset.id}); asset = null;
    }
    if (!asset) {
      if (!r.draft) throw Error(`Published release missing asset: ${name}`);
      asset = (await github.rest.repos.uploadReleaseAsset({owner,repo,release_id:r.id,name,data,headers:{'content-type':'application/octet-stream','content-length':data.length}})).data;
    }
    // Download and compare even on retries; never overwrite published bytes.
    const downloaded = await github.rest.repos.getReleaseAsset({owner,repo,asset_id:asset.id,headers:{accept:'application/octet-stream'}});
    if (hash(Buffer.from(downloaded.data)) !== hash(data)) throw Error(`Release asset mismatch: ${name}`);
  }
  if (r.draft) r = (await github.rest.repos.updateRelease({owner,repo,release_id:r.id,draft:false,make_latest:'false'})).data;
  return {sha:m.sourceCommit,version:m.version,url:r.html_url,reused:String(reused),bundle:m.bundleId,manifest:m};
}
module.exports = {publish,snapshot,nextVersion,decode,report};
