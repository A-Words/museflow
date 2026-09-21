/* Pure local simulator. No network calls; API credits remain integer strings. */
(function (root) {
  'use strict';
  const uuid = () => globalThis.crypto.randomUUID();
  const now = () => new Date().toISOString();
  const tools = {
    'lyrics.generate': {label:'歌词生成',currency:'creation',amount:'8'},
    'music.generate': {label:'音乐生成',currency:'creation',amount:'24'},
    'speech.synthesize': {label:'语音合成',currency:'voice',amount:'6'}
  };
  const statuses = {
    queued:['排队中','held',['cancel']], running:['运行中','held',['cancel']],
    reconciling:['正在核对','held',[]], cancel_requested:['取消请求处理中','held',[]],
    succeeded:['已交付','captured',['view_result']], failed:['明确失败','released',['requote']],
    canceled:['已取消','released',['requote']]
  };
  const transitions = {
    queued:['running','failed','canceled'],
    running:['succeeded','failed','reconciling','cancel_requested'],
    cancel_requested:['canceled','succeeded','failed','reconciling'],
    reconciling:['running','succeeded','failed','canceled']
  };
  const lyrics = '晚风把街灯轻轻点亮\n我把今天折进了行囊\n沿着雨后微光的方向\n让每个明天慢慢生长';
  const accessible = a => a && a.status !== 'deletion_pending';
  function fresh() {
    return {
      schema:1,logged:false,page:'workspace',active:null,
      conversations:[],tasks:[],assets:[],entries:[],
      wallets:{creation:{available:'0',held:'0'},voice:{available:'0',held:'0'}},
      preferences:{enabled:true,tags:[],saved:[],hidden:[]},
      admin:{userEnabled:true,toolEnabled:true,priceVersion:1,planVersion:1,audit:[]},
      scenario:'normal'
    };
  }
  function entry(s,currency,kind,a,h,taskId,reason) {
    const w=s.wallets[currency];
    const available=BigInt(w.available)+BigInt(a),held=BigInt(w.held)+BigInt(h);
    if(available<0n||held<0n)throw Error('余额不能为负');
    w.available=String(available);w.held=String(held);
    s.entries.push({id:uuid(),currency,kind,availableDelta:String(a),heldDelta:String(h),taskId,reason,createdAt:now()});
  }
  function createConversation(s) {
    const c={id:uuid(),title:'新的创作',messages:[],proposal:null,quote:null,taskIds:[]};
    s.conversations.unshift(c);s.active=c.id;return c;
  }
  function proposal(c,tool,input,retryOfTaskId) {
    if(!tools[tool])throw Error('UNSUPPORTED_CAPABILITY');
    c.proposal={id:uuid(),tool,input:structuredClone(input),version:1,retryOfTaskId};
    c.quote=null;return c.proposal;
  }
  function editProposal(c,input) {
    if(!c.proposal)throw Error('请先完成参数提议');
    // Keep tool-call identity and retry lineage; only unconfirmed input is editable.
    c.proposal={...c.proposal,input:structuredClone(input),version:c.proposal.version+1};
    c.quote=null;return c.proposal;
  }
  function validateInput(s,input) {
    if(input.lyricsAssetId && !s.assets.some(a=>a.id===input.lyricsAssetId&&a.kind==='lyrics'&&accessible(a))) {
      throw Error('RESOURCE_NOT_FOUND');
    }
  }
  function quote(s,c) {
    const p=c.proposal,t=tools[p?.tool];
    if(!t)throw Error('UNSUPPORTED_CAPABILITY');
    validateInput(s,p.input);
    c.quote={id:uuid(),toolCallId:p.id,inputHash:JSON.stringify(p.input),currency:t.currency,amount:t.amount,
      priceVersion:'demo-price-'+s.admin.priceVersion,expiresAt:new Date(Date.now()+600000).toISOString()};
    return c.quote;
  }
  function confirm(s,c) {
    const q=c.quote;
    if(!q)throw Error('请先获取报价');
    const existing=s.tasks.find(t=>t.quoteId===q.id);
    if(existing)return existing;
    if(!Number.isFinite(Date.parse(q.expiresAt))||Date.parse(q.expiresAt)<=Date.now())throw Error('QUOTE_EXPIRED');
    if(!s.admin.userEnabled)throw Error('FORBIDDEN');
    if(!s.admin.toolEnabled)throw Error('PROVIDER_UNAVAILABLE');
    if(q.inputHash!==JSON.stringify(c.proposal.input))throw Error('INPUT_CHANGED');
    validateInput(s,c.proposal.input);
    if(BigInt(s.wallets[q.currency].available)<BigInt(q.amount))throw Error('INSUFFICIENT_CREDITS');
    if(s.tasks.some(t=>t.reservation.state==='held'))throw Error('CONCURRENCY_LIMIT');
    const task={
      id:uuid(),quoteId:q.id,toolCallId:q.toolCallId,conversationId:c.id,tool:c.proposal.tool,
      input:structuredClone(c.proposal.input),retryOfTaskId:c.proposal.retryOfTaskId,
      priceVersion:q.priceVersion,status:'queued',sourceMode:'mock',assetIds:[],
      reservation:{currency:q.currency,amount:q.amount,state:'held'},cancelSupported:true,
      allowedActions:['cancel'],createdAt:now(),updatedAt:now()
    };
    entry(s,q.currency,'reserve','-'+q.amount,q.amount,task.id,'确认报价后冻结，不是扣除');
    s.tasks.push(task);c.taskIds.push(task.id);return task;
  }
  function transition(s,t,target) {
    if(t.status===target)return t;
    if(!transitions[t.status]?.includes(target))throw Error('非法状态转换');
    if(target==='cancel_requested'&&t.cancelSupported===false)throw Error('CANCEL_NOT_SUPPORTED');
    if(t.status==='queued'&&target==='running') {
      // The simulator rechecks at dispatch, just as the planned Worker must.
      try {
        if(!s.admin.userEnabled)throw Error('FORBIDDEN');
        if(!s.admin.toolEnabled)throw Error('PROVIDER_UNAVAILABLE');
        validateInput(s,t.input);
      } catch(error) {
        t.error={code:error.message,message:'执行前检查未通过，未派发生成。'};
        return transition(s,t,'failed');
      }
    }
    if(target==='succeeded') {
      const a={id:uuid(),taskId:t.id,conversationId:t.conversationId,
        kind:t.tool==='lyrics.generate'?'lyrics':'audio',
        title:t.tool==='lyrics.generate'?'晚风来信 · 歌词':t.tool==='music.generate'?'晚风来信 · 音乐':'晚风来信 · TTS 占位样例',
        ...(t.tool==='lyrics.generate'?{textContent:lyrics}:{}),
        sourceMode:'mock',tags:[t.input.style||'轻音乐'],createdAt:now(),version:1,lyricsAssetId:t.input.lyricsAssetId};
      s.assets.unshift(a);t.assetIds=[a.id];
    }
    const reservationState=statuses[target][1];
    if(t.reservation.state==='held'&&reservationState!=='held') {
      const q=t.reservation.amount,captured=reservationState==='captured';
      entry(s,t.reservation.currency,captured?'capture':'release',captured?'0':q,'-'+q,t.id,
        captured?'样例归档后结算':'确认失败或取消后释放');
    }
    t.status=target;t.reservation.state=reservationState;
    t.allowedActions=statuses[target][2].filter(action=>action!=='cancel'||target==='queued'||t.cancelSupported!==false);
    t.updatedAt=now();return t;
  }
  function deleteAsset(s,id) {
    const a=s.assets.find(a=>a.id===id&&accessible(a));
    if(!a)throw Error('RESOURCE_NOT_FOUND');
    // Keep only a local deletion receipt. Content and new access disappear immediately.
    s.assets=s.assets.map(item=>item.id!==id?item:{id,kind:a.kind,title:'已删除作品',tags:[],
      sourceMode:a.sourceMode,version:a.version,createdAt:a.createdAt,status:'deletion_pending'});
  }
  function manualVersion(s,id,text) {
    const a=s.assets.find(a=>a.id===id&&a.kind==='lyrics'&&accessible(a));
    if(!a)throw Error('RESOURCE_NOT_FOUND');
    if(!text.trim())throw Error('歌词不能为空');
    const n={...a,id:uuid(),sourceMode:'manual',parentAssetId:a.id,version:a.version+1,textContent:text,createdAt:now()};
    s.assets.unshift(n);return n;
  }
  function seed(s) {
    if(!s.entries.length) {
      entry(s,'creation','grant','120','0',null,'演示初始发放');
      entry(s,'voice','grant','60','0',null,'演示初始发放');
    }
    if(!s.assets.length)s.assets.push({id:uuid(),kind:'cover',title:'微光 · 原创封面',sourceMode:'manual',tags:['轻音乐'],createdAt:now(),version:1});
    if(!s.active)createConversation(s);return s;
  }
  root.MF={uuid,now,tools,statuses,lyrics,fresh,seed,entry,createConversation,proposal,editProposal,quote,confirm,
    transition,accessible,deleteAsset,manualVersion};
  if(typeof module!=='undefined')module.exports=root.MF;
})(globalThis);
