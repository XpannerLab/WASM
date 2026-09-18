const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const PREFIX = 'codex/sync-wasm-';
function relation(root, older, newer) {
  for (const sha of [older, newer]) if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Invalid source SHA');
  if (older === newer) return 'same';
  const ancestor = (a,b) => {
    const r = spawnSync('git', ['merge-base','--is-ancestor',a,b], {cwd:root,encoding:'utf8'});
    if (r.error || ![0,1].includes(r.status)) throw Error('Cannot compare source history: ' + (r.stderr || r.error));
    return r.status === 0;
  };
  if (ancestor(older,newer)) return 'older';
  if (ancestor(newer,older)) return 'newer';
  return 'diverged';
}
function sourceOf(pr, owner, repo, base) {
  const match = (pr.body || '').match(/<!-- wasm-consumer-source:([a-f0-9]{40}) -->/);
  if (!match || pr.head?.ref !== PREFIX+match[1] || pr.head?.repo?.full_name !== `${owner}/${repo}` || pr.base?.ref !== base) return null;
  return match[1];
}
async function inspect({github,owner,repo,base,sha,sourceRoot='source',consumerRoot='consumer',compare=relation}) {
  const branch = PREFIX+sha;
  const all = await github.paginate(github.rest.pulls.list,{owner,repo,base,state:'all',per_page:100});
  const candidates = all.filter(pr => sourceOf(pr,owner,repo,base));
  const baseFile = path.join(consumerRoot,'wasm-version.json');
  const heads = candidates.filter(pr => pr.state === 'open' || pr.merged_at).map(pr => ({sha:sourceOf(pr,owner,repo,base),url:pr.html_url}));
  if (fs.existsSync(baseFile)) {
    const m = JSON.parse(fs.readFileSync(baseFile,'utf8'));
    if (m.sourceRepository !== 'XpannerLab/WASM' || !/^[a-f0-9]{40}$/.test(m.sourceCommit)) throw Error('Invalid consumer version metadata');
    heads.push({sha:m.sourceCommit,url:''});
  }
  for (const other of heads) {
    const order = compare(sourceRoot,sha,other.sha);
    if (order === 'diverged') throw Error('Diverged WASM history requires manual review');
    if (order === 'older') return {branch,skip:'true',reason:'superseded-source',url:other.url};
  }
  // Also recognize pre-metadata PRs for the exact source; never silently reopen.
  const exact = all.filter(pr => pr.head?.ref === branch && pr.head?.repo?.full_name === `${owner}/${repo}`);
  const open = exact.find(pr => pr.state === 'open');
  if (open) return {branch,skip:sourceOf(open,owner,repo,base) ? 'true':'false',reason:'already-open',url:open.html_url,number:String(open.number)};
  const closed = exact.find(pr => pr.state === 'closed');
  if (closed) return {branch,skip:'true',reason:closed.merged_at?'already-merged':'previously-closed',url:closed.html_url,number:String(closed.number)};
  return {branch,skip:'false'};
}
async function cleanup({github,owner,repo,base,sha,currentNumber,allowedPaths,sourceRoot='source',compare=relation}) {
  if (!currentNumber) return [];
  const current = (await github.rest.pulls.get({owner,repo,pull_number:Number(currentNumber)})).data;
  if (sourceOf(current,owner,repo,base) !== sha || (current.state !== 'open' && !current.merged_at)) return [];
  const list = await github.paginate(github.rest.pulls.list,{owner,repo,base,state:'open',per_page:100});
  const closed = [];
  for (const item of list) {
    const oldSha = sourceOf(item,owner,repo,base);
    if (!oldSha || oldSha === sha || compare(sourceRoot,oldSha,sha) !== 'older') continue;
    // Recheck the candidate and its file scope before changing external state.
    const pr = (await github.rest.pulls.get({owner,repo,pull_number:item.number})).data;
    if (pr.state !== 'open' || sourceOf(pr,owner,repo,base) !== oldSha) continue;
    const files = await github.paginate(github.rest.pulls.listFiles,{owner,repo,pull_number:pr.number,per_page:100});
    if (!files.length || files.some(f => !allowedPaths.includes(f.filename) || (f.previous_filename && !allowedPaths.includes(f.previous_filename)))) continue;
    await github.rest.pulls.update({owner,repo,pull_number:pr.number,state:'closed'});
    closed.push(pr.number);
  }
  return closed;
}
module.exports = {relation,sourceOf,inspect,cleanup};
