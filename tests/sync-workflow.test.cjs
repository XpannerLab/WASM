const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const workflowPath = process.env.WASM_TEST_WORKFLOW || path.join(__dirname, '../.github/workflows/sync-consumers.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const copy = workflow.match(/        shell: python[\s\S]*?        run: \|\r?\n([\s\S]*?)\r?\n      - name: Create or update/)[1].replace(/^          /gm, '');
test('event SHA, bounded queue and guarded writes are wired', () => {
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.doesNotMatch(workflow, /ref: main/);
  assert.match(workflow, /cancel-in-progress: false\r?\n  queue: max/);
  assert.match(workflow, /branch: \$\{\{ steps.existing.outputs.branch \}\}/);
  assert.equal((workflow.match(/if: steps.existing.outputs.skip != 'true'/g) || []).length, 2);
  assert.match(workflow, /fail-fast: false/);
});
test('Python copies the snapshot exactly and rejects invalid artifacts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-sync-test-'));
  try {
    const src = path.join(tmp, 'source'); fs.mkdirSync(src);
    const files = {'app_wasm.js': Buffer.from('// fixture'), 'app_wasm.wasm': Buffer.from([0,97,115,109,1,0,0,0]), 'app_proxy_win.exe': Buffer.from('MZfixture')};
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(src, name), bytes);
    function run(names, directory) {
      const result = spawnSync(process.env.PYTHON || 'python', ['-c', copy], {cwd: tmp, encoding: 'utf8', env: {...process.env, ARTIFACT_FILES: names, TARGET_DIRECTORY: directory, SOURCE_SHA:'fixed-source',RELEASE_VERSION:'wasm-test',RELEASE_URL:'https://example.test/release', GITHUB_SERVER_URL:'https://github.com', GITHUB_REPOSITORY:'XpannerLab/WASM', GITHUB_RUN_ID:'local-test'}});
      if (result.error) throw result.error;
      return result;
    }
    for (const [names, directory] of [['app_wasm.js app_wasm.wasm','public/wasm'], ['app_proxy_win.exe','electron/resources/wasm-proxy']]) {
      const r = run(names, directory); assert.equal(r.status, 0, r.stderr);
      for (const name of names.split(' ')) assert.deepEqual(fs.readFileSync(path.join(tmp,'consumer',directory,name)), files[name]);
      assert.match(fs.readFileSync(path.join(tmp, 'pr-body.md'), 'utf8'), /commit\/fixed-source/);
      const metadata=JSON.parse(fs.readFileSync(path.join(tmp,'consumer/wasm-version.json'),'utf8'));
      assert.equal(metadata.sourceCommit,'fixed-source');
      assert.equal(metadata.version,'wasm-test');
      assert.deepEqual(Object.keys(metadata.files), names.split(' ').map(n=>directory+'/'+n));
      for(const name of names.split(' ')) assert.equal(metadata.files[directory+'/'+name].size,files[name].length);
    }
    fs.writeFileSync(path.join(src,'app_wasm.wasm'), 'invalid');
    assert.notEqual(run('app_wasm.js app_wasm.wasm','public/wasm').status, 0);
  } finally { fs.rmSync(tmp, {recursive:true, force:true}); }
});
