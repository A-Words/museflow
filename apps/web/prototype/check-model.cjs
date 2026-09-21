'use strict';
const assert=require('node:assert/strict');
const M=require('./model.js');
let count=0;
function setup(tool='music.generate'){const s=M.seed(M.fresh()),c=s.conversations[0];M.proposal(c,tool,{tool,prompt:'fixture'});M.quote(s,c);return {s,c};}
function check(name,fn){fn();count++;console.log('PASS '+name);}
check('proposal and quote create no task or hold',()=>{const {s}=setup();assert.equal(s.tasks.length,0);assert.equal(s.wallets.creation.held,'0');});
check('ten confirmations reuse one task and one reserve',()=>{const {s,c}=setup();const ids=Array.from({length:10},()=>M.confirm(s,c).id);assert.equal(new Set(ids).size,1);assert.equal(s.tasks.length,1);assert.equal(s.entries.filter(e=>e.kind==='reserve').length,1);assert.deepEqual(s.wallets.creation,{available:'96',held:'24'});});
check('delivery captures exactly once and preserves terminal state',()=>{const {s,c}=setup();const t=M.confirm(s,c);M.transition(s,t,'running');M.transition(s,t,'succeeded');M.transition(s,t,'succeeded');assert.equal(s.entries.filter(e=>e.kind==='capture').length,1);assert.equal(s.assets.filter(a=>a.taskId===t.id).length,1);assert.deepEqual(s.wallets.creation,{available:'96',held:'0'});assert.throws(()=>M.transition(s,t,'failed'));});
check('failure releases once',()=>{const {s,c}=setup();const t=M.confirm(s,c);M.transition(s,t,'running');M.transition(s,t,'failed');M.transition(s,t,'failed');assert.deepEqual(s.wallets.creation,{available:'120',held:'0'});assert.equal(s.entries.filter(e=>e.kind==='release').length,1);assert.deepEqual(t.allowedActions,['requote']);});
check('unknown preserves hold and has no paid retry',()=>{const {s,c}=setup();const t=M.confirm(s,c);M.transition(s,t,'running');M.transition(s,t,'reconciling');assert.deepEqual(s.wallets.creation,{available:'96',held:'24'});assert.deepEqual(t.allowedActions,[]);assert.equal(s.entries.filter(e=>['release','capture'].includes(e.kind)).length,0);});
check('queued cancel releases; running cancel request retains hold',()=>{for(const run of [false,true]){const {s,c}=setup();const t=M.confirm(s,c);if(run){M.transition(s,t,'running');M.transition(s,t,'cancel_requested');assert.equal(s.wallets.creation.held,'24');}M.transition(s,t,'canceled');assert.deepEqual(s.wallets.creation,{available:'120',held:'0'});}});
check('expired and insufficient quote create no task',()=>{for(const mode of ['expired','poor']){const {s,c}=setup();if(mode==='expired')c.quote.expiresAt='2000-01-01T00:00:00Z';else s.wallets.creation.available='1';assert.throws(()=>M.confirm(s,c),new RegExp(mode==='expired'?'QUOTE_EXPIRED':'INSUFFICIENT_CREDITS'));assert.equal(s.tasks.length,0);assert.equal(s.wallets.creation.held,'0');}});
check('TTS only holds voice credits',()=>{const {s,c}=setup('speech.synthesize');M.confirm(s,c);assert.deepEqual(s.wallets.voice,{available:'54',held:'6'});assert.deepEqual(s.wallets.creation,{available:'120',held:'0'});});
check('JSON restore and duplicate quote preserve original task',()=>{const {s,c}=setup();const t=M.confirm(s,c),restored=JSON.parse(JSON.stringify(s));assert.equal(M.confirm(restored,restored.conversations[0]).id,t.id);assert.equal(restored.tasks.length,1);});
check('task snapshots the plan version used at creation',()=>{const {s,c}=setup();const t=M.confirm(s,c);assert.equal(t.planVersion,'demo-plan-1');s.admin.planVersion++;assert.equal(t.planVersion,'demo-plan-1');});
check('new attempt references original and needs a new quote',()=>{const {s,c}=setup();const t=M.confirm(s,c);M.transition(s,t,'failed');M.proposal(c,t.tool,t.input,t.id);M.quote(s,c);const next=M.confirm(s,c);assert.notEqual(next.id,t.id);assert.equal(next.retryOfTaskId,t.id);});
check('exact large integers and negative adjustment guard',()=>{const {s}=setup();s.wallets.creation.available='9007199254740993';M.entry(s,'creation','adjustment','1','0',null,'test');assert.equal(s.wallets.creation.available,'9007199254740994');assert.throws(()=>M.entry(s,'creation','adjustment','-9007199254740995','0',null,'test'));});
check('input change, disabled tool and concurrency reject before reserve',()=>{const {s,c}=setup();c.proposal.input.prompt='changed';assert.throws(()=>M.confirm(s,c),/INPUT_CHANGED/);M.quote(s,c);s.admin.toolEnabled=false;assert.throws(()=>M.confirm(s,c),/PROVIDER_UNAVAILABLE/);s.admin.toolEnabled=true;M.confirm(s,c);const other=M.createConversation(s);M.proposal(other,'music.generate',{prompt:'other'});M.quote(s,other);assert.throws(()=>M.confirm(s,other),/CONCURRENCY_LIMIT/);assert.equal(s.tasks.length,1);});
check('editing a retry preserves task lineage and invalidates the quote',()=>{
 const {s,c}=setup();const first=M.confirm(s,c);M.transition(s,first,'failed');
 M.proposal(c,first.tool,first.input,first.id);M.quote(s,c);
 const id=c.proposal.id;M.editProposal(c,{...c.proposal.input,prompt:'edited retry'});
 assert.equal(c.quote,null);assert.equal(c.proposal.id,id);assert.equal(c.proposal.version,2);
 assert.equal(c.proposal.retryOfTaskId,first.id);M.quote(s,c);
 assert.equal(M.confirm(s,c).retryOfTaskId,first.id);
});
check('deleted lyrics cannot be quoted or confirmed; no new charge',()=>{
 const {s,c}=setup();const lyric={id:M.uuid(),kind:'lyrics',title:'sample',tags:[],textContent:'sample',version:1,createdAt:M.now(),sourceMode:'mock'};
 s.assets.push(lyric);M.proposal(c,'music.generate',{tool:'music.generate',prompt:'sample',lyricsAssetId:lyric.id});M.quote(s,c);
 M.deleteAsset(s,lyric.id);
 assert.throws(()=>M.confirm(s,c),/RESOURCE_NOT_FOUND/);assert.throws(()=>M.quote(s,c),/RESOURCE_NOT_FOUND/);
 assert.equal(s.tasks.length,0);assert.equal(s.wallets.creation.held,'0');
 const receipt=s.assets.find(a=>a.id===lyric.id);assert.equal(receipt.status,'deletion_pending');assert.equal(receipt.textContent,undefined);assert.equal(M.accessible(receipt),false);
});
check('lyrics deleted while queued fail before dispatch and release once',()=>{
 const {s,c}=setup();const lyric={id:M.uuid(),kind:'lyrics',title:'sample',tags:[],version:1,createdAt:M.now()};s.assets.push(lyric);
 M.proposal(c,'music.generate',{lyricsAssetId:lyric.id});M.quote(s,c);const t=M.confirm(s,c);
 M.deleteAsset(s,lyric.id);M.transition(s,t,'running');
 assert.equal(t.status,'failed');assert.equal(t.error.code,'RESOURCE_NOT_FOUND');assert.deepEqual(s.wallets.creation,{available:'120',held:'0'});
});
check('reconciliation does not invent cancellation capability',()=>{
 const {s,c}=setup();const t=M.confirm(s,c);t.cancelSupported=false;
 M.transition(s,t,'running');assert.deepEqual(t.allowedActions,[]);
 assert.throws(()=>M.transition(s,t,'cancel_requested'),/CANCEL_NOT_SUPPORTED/);
 M.transition(s,t,'reconciling');M.transition(s,t,'running');assert.deepEqual(t.allowedActions,[]);
});
check('manual version leaves original lyrics, audio reference and credits unchanged',()=>{
 const {s,c}=setup('lyrics.generate');const t=M.confirm(s,c);M.transition(s,t,'running');M.transition(s,t,'succeeded');
 const original=s.assets.find(a=>a.id===t.assetIds[0]),wallet=JSON.stringify(s.wallets),entries=s.entries.length;
 const audio={id:M.uuid(),kind:'audio',lyricsAssetId:original.id};s.assets.push(audio);
 const edited=M.manualVersion(s,original.id,'new text');assert.equal(edited.parentAssetId,original.id);
 assert.equal(edited.sourceMode,'manual');assert.equal(original.textContent,M.lyrics);assert.equal(audio.lyricsAssetId,original.id);
 assert.equal(JSON.stringify(s.wallets),wallet);assert.equal(s.entries.length,entries);
 M.deleteAsset(s,edited.id);assert.throws(()=>M.manualVersion(s,edited.id,'again'),/RESOURCE_NOT_FOUND/);
});
check('proposal input is a snapshot and unsupported tools fail explicitly',()=>{
 const {s,c}=setup();const input={prompt:'original'};M.proposal(c,'music.generate',input);input.prompt='mutated';
 assert.equal(c.proposal.input.prompt,'original');assert.throws(()=>M.proposal(c,'voice.clone',{}),/UNSUPPORTED_CAPABILITY/);
});
check('both wallets can be reconstructed from their ledger deltas',()=>{
 const {s,c}=setup();const t=M.confirm(s,c);M.transition(s,t,'running');M.transition(s,t,'failed');
 M.entry(s,'voice','adjustment','-10','0',null,'fixture');
 for(const currency of ['creation','voice']){const entries=s.entries.filter(e=>e.currency===currency);
 assert.equal(entries.reduce((n,e)=>n+BigInt(e.availableDelta),0n).toString(),s.wallets[currency].available);
 assert.equal(entries.reduce((n,e)=>n+BigInt(e.heldDelta),0n).toString(),s.wallets[currency].held);}
});
check('music form preserves selected language and style through delivery and filtering',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
 const callbacks={},elements={};
 const element=id=>elements[id]||=( {value:'',textContent:'',innerHTML:'',dataset:{},addEventListener(){},focus(){},scrollTo(){}} );
 const context=vm.createContext({MF:M,structuredClone,console,
  sessionStorage:{getItem(){return null;},setItem(){}},
  document:{activeElement:null,querySelector:s=>s.startsWith('#')?element(s):null,
   getElementById(){return null;},querySelectorAll(){return [];},addEventListener(type,callback){callbacks[type]=callback;}},
  window:{addEventListener(){}},history:{replaceState(){}},location:{hash:''},
  setTimeout(){},clearTimeout(){},setInterval(){}
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),context);
 const run=code=>vm.runInContext(code,context);
 for(const style of ['氛围','流行']){
  run("state=M.seed(M.fresh());state.logged=true;setIntent('创作音乐','music.generate');");
  element('#parameter-text').value='创作音乐';element('#language').value='英文';element('#style').value=style;
  callbacks.submit({target:{id:'clarify'},preventDefault(){}});
  assert.equal(run('current().proposal.input.language'),'英文');
  assert.equal(run('current().proposal.input.style'),style);
  assert.match(run('proposalCard(current())'),/>英文<\/span>/);
  assert.ok(run('proposalCard(current())').includes('>'+style+'</span>'));
  run("M.quote(state,current());M.confirm(state,current());M.transition(state,activeTask(),'running');M.transition(state,activeTask(),'succeeded');");
  assert.equal(run("state.assets.find(a=>a.kind==='audio').tags[0]"),style);
  run('filters.tag='+JSON.stringify(style));
  assert.ok(run('library()').includes('晚风来信 · 音乐'));
 }
});
console.log(`${count} simulator checks passed; not production billing or concurrency tests.`);
