const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawnSync}=require('node:child_process');
const {inspect,cleanup,relation}=require(process.env.WASM_CONSUMER_MODULE || '../.github/scripts/consumer-pr.cjs');
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const compare=(_,a,b)=>a===b?'same':a<b?'older':'newer';
function pr(n,sha,state='open',merged=false){return {number:n,state,merged_at:merged?'date':null,html_url:'https://example.test/'+n,body:`<!-- wasm-consumer-source:${sha} -->`,head:{ref:'codex/sync-wasm-'+sha,repo:{full_name:'XpannerDev/fe'}},base:{ref:'develop'}};}
function setup(t,pulls=[]){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'consumer-pr-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const closed=[];
 const api={list:async()=>({data:pulls}),get:async p=>({data:pulls.find(x=>x.number===p.pull_number)}),listFiles:async()=>({data:[{filename:'wasm-version.json'}]}),update:async p=>{closed.push(p.pull_number);pulls.find(x=>x.number===p.pull_number).state='closed';}};
 const github={rest:{pulls:api},paginate:async(fn,p)=>(await fn(p)).data};
 return {args:{github,owner:'XpannerDev',repo:'fe',base:'develop',sha:B,consumerRoot:root,compare},root,closed,api};
}
test('new source proceeds; open and closed retries are stable',async t=>{
 let s=setup(t,[]);assert.equal((await inspect(s.args)).skip,'false');
 for(const [state,merged,reason] of [['open',false,'already-open'],['closed',true,'already-merged'],['closed',false,'previously-closed']]){
  s=setup(t,[pr(1,B,state,merged)]);assert.equal((await inspect(s.args)).reason,reason);
 }
});
test('newer open PR or merged base prevents late old source PR',async t=>{
 const s=setup(t,[pr(1,C)]);assert.equal((await inspect(s.args)).reason,'superseded-source');
 const b=setup(t,[]);fs.writeFileSync(path.join(b.root,'wasm-version.json'),JSON.stringify({sourceRepository:'XpannerLab/WASM',sourceCommit:C}));assert.equal((await inspect(b.args)).reason,'superseded-source');
});
test('diverged history and malformed metadata fail closed',async t=>{
 const s=setup(t,[pr(1,A)]);await assert.rejects(inspect({...s.args,compare:()=> 'diverged'}),/Diverged/);
 fs.writeFileSync(path.join(s.root,'wasm-version.json'),'{}');await assert.rejects(inspect(s.args),/Invalid consumer/);
});
test('cleanup closes only older owned artifact PR after replacement exists',async t=>{
 const manual=pr(4,A);manual.body='manual';const fork=pr(5,A);fork.head.repo.full_name='outsider/fe';
 const s=setup(t,[pr(1,A),pr(2,B),pr(3,C),manual,fork]);
 assert.deepEqual(await cleanup({...s.args,currentNumber:2,allowedPaths:['wasm-version.json']}),[1]);assert.deepEqual(s.closed,[1]);
});
test('no replacement or manually rejected replacement preserves old PR',async t=>{
 const s=setup(t,[pr(1,A),pr(2,B,'closed')]);await cleanup({...s.args,currentNumber:'',allowedPaths:[]});await cleanup({...s.args,currentNumber:2,allowedPaths:[]});assert.deepEqual(s.closed,[]);
});
test('unrelated file edits preserve old PR; cleanup retry is idempotent',async t=>{
 const s=setup(t,[pr(1,A),pr(2,B)]);s.api.listFiles=async()=>({data:[{filename:'src/manual.ts'}]});await cleanup({...s.args,currentNumber:2,allowedPaths:['wasm-version.json']});assert.deepEqual(s.closed,[]);
 s.api.listFiles=async()=>({data:[{filename:'wasm-version.json'}]});await cleanup({...s.args,currentNumber:2,allowedPaths:['wasm-version.json']});await cleanup({...s.args,currentNumber:2,allowedPaths:['wasm-version.json']});assert.deepEqual(s.closed,[1]);
});
test('real git ancestry handles older/newer and refuses missing commits',t=>{
 const s=setup(t,[]);const git=(...args)=>{const r=spawnSync('git',args,{cwd:s.root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('commit','--allow-empty','-m','A');const a=git('rev-parse','HEAD');git('commit','--allow-empty','-m','B');const b=git('rev-parse','HEAD');assert.equal(relation(s.root,a,b),'older');assert.equal(relation(s.root,b,a),'newer');assert.throws(()=>relation(s.root,A,b),/Cannot compare/);
});
