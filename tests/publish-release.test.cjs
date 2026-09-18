const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const mod=require(process.env.WASM_RELEASE_MODULE || '../.github/scripts/publish-release.cjs');
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wasm-release-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'app_wasm.js'),'// fixture');
 fs.writeFileSync(path.join(root,'app_wasm.wasm'),Buffer.from([0,97,115,109,1,0,0,0]));
 fs.writeFileSync(path.join(root,'app_proxy_win.exe'),'MZfixture');
 const state={releases:[],tags:[],assets:[],refs:{},fail:null,calls:[]};
 function api(name,fn){return async p=>{state.calls.push(name);if(state.fail===name){state.fail=null;throw Error('injected failure');}return {data:fn(p)};};}
 const repos={
  listReleases:api('list',()=>state.releases),listTags:api('tags',()=>state.tags),
  createRelease:api('create',p=>{const r={...p,id:state.releases.length+1,html_url:'https://example.test/'+p.tag_name};state.releases.push(r);return r;}),
  updateRelease:api('publish',p=>{const r=state.releases.find(r=>r.id===p.release_id);Object.assign(r,p);return r;}),
  listReleaseAssets:api('assets',p=>state.assets.filter(a=>a.release_id===p.release_id)),
  uploadReleaseAsset:api('upload',p=>{const a={...p,id:state.assets.length+1,state:'uploaded',data:Buffer.from(p.data)};state.assets.push(a);return a;}),
  getReleaseAsset:api('download',p=>state.assets.find(a=>a.id===p.asset_id).data),
  deleteReleaseAsset:api('delete',p=>{state.assets=state.assets.filter(a=>a.id!==p.asset_id);}),
 };
 const git={getRef:api('getRef',p=>{if(!state.refs[p.ref]){const e=Error('missing');e.status=404;throw e;}return state.refs[p.ref];}),createRef:api('createRef',p=>{const r={object:{type:'commit',sha:p.sha}};state.refs[p.ref.replace(/^refs\//,'')]=r;state.tags.push({name:p.ref.replace('refs/tags/','')});return r;})};
 const github={rest:{repos,git},paginate:async(fn,p)=>(await fn(p)).data};
 const run=(sha='a'.repeat(40),now=new Date('2026-09-18T01:00:00Z'))=>mod.publish({github,owner:'XpannerLab',repo:'WASM',sourceSha:sha,root,now});
 return {root,state,run};
}
test('new publication pins tag and verifies all five assets',async t=>{
 const {state,run}=setup(t);const r=await run();
 assert.equal(r.version,'wasm-2026.09.18.1');assert.equal(r.reused,'false');assert.equal(state.assets.length,5);assert.equal(state.releases[0].draft,false);
 assert.equal(state.refs['tags/'+r.version].object.sha,'a'.repeat(40));
 assert.equal(state.calls.filter(x=>x==='download').length,5);
 assert.equal(r.manifest.changes['app_wasm.js'],'initial');
});
test('same SHA retry and same content different SHA reuse version and canonical source',async t=>{
 const {state,run}=setup(t);const a=await run();await run();const b=await run('b'.repeat(40));
 assert.equal(b.version,a.version);assert.equal(b.sha,a.sha);assert.equal(state.releases.length,1);assert.equal(state.calls.filter(x=>x==='upload').length,5);
});
test('single EXE change creates next version and reports other files unchanged',async t=>{
 const {root,run}=setup(t);await run();fs.writeFileSync(path.join(root,'app_proxy_win.exe'),'MZnew');const r=await run('b'.repeat(40));
 assert.equal(r.version,'wasm-2026.09.18.2');assert.equal(r.manifest.changes['app_proxy_win.exe'],'changed');assert.equal(r.manifest.changes['app_wasm.js'],'unchanged');assert.equal(r.manifest.previousVersion,'wasm-2026.09.18.1');
});
test('failed upload resumes same draft even on a different date',async t=>{
 const {state,run}=setup(t);state.fail='upload';await assert.rejects(run(),/injected/);assert.equal(state.releases[0].draft,true);
 const r=await run('a'.repeat(40),new Date('2026-09-20T00:00:00Z'));assert.equal(r.version,'wasm-2026.09.18.1');assert.equal(state.releases.length,1);assert.equal(state.assets.length,5);
});
test('failure at publish resumes without reupload',async t=>{
 const {state,run}=setup(t);state.fail='publish';await assert.rejects(run());await run();assert.equal(state.releases.length,1);assert.equal(state.assets.length,5);
});
test('tag mismatch and corrupted published asset stop rather than overwrite',async t=>{
 const {state,run}=setup(t);const r=await run();const ref=state.refs['tags/'+r.version];ref.object.sha='b'.repeat(40);await assert.rejects(run(),/tag target/);ref.object.sha='a'.repeat(40);
 state.assets[0].data=Buffer.from('corrupt');await assert.rejects(run(),/asset mismatch/);assert.equal(state.calls.filter(x=>x==='upload').length,5);
});
test('invalid artifacts fail before any API calls',async t=>{
 const {root,state,run}=setup(t);fs.writeFileSync(path.join(root,'app_wasm.wasm'),'invalid');await assert.rejects(run(),/Invalid WASM/);assert.equal(state.calls.length,0);
});
test('Korean date rollover and reserved tag sequence',()=>{
 assert.equal(mod.nextVersion(new Date('2026-09-18T15:00:00Z'),['wasm-2026.09.19.2','wasm-2026.09.19.7']),'wasm-2026.09.19.8');
});
