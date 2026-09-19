(() => {
 const $=id=>document.getElementById(id), C=KillSyncCore;
 const status=text=>{$('syncStatus').textContent=text;};
 let client=null,starting=false,last=C.counts({bc:totalBC,kills:totalKills,converted:totalConverted,panels:panelReceived});
 const fromForm=()=>C.counts({bc:totalBC,kills:totalKills,converted:totalConverted,panels:panelReceived});
 function rebase(next){
   const delta=C.diff(C.counts(next),fromForm());
   if(C.nonzero(delta)){
     // Preserve external additions when undoing an earlier local action.
     const shift=s=>{
       s.totalBC=Math.max(0,(s.totalBC||0)+delta.bc);
       s.totalKills=Math.max(0,(s.totalKills||0)+delta.kills);
       s.totalConverted=Math.max(0,(s.totalConverted||0)+delta.converted);
       s.panelTotals=Array.from({length:8},(_,i)=>Math.max(0,(s.panelTotals?.[i]||0)+delta.panels[i]));
     };
     undoStack.forEach(shift);redoStack.forEach(shift);if(pendingEditSnapshot)shift(pendingEditSnapshot);
     const form=getState();shift(form);applyState(form);saveHistory();updateHistoryButtons();
   }
   last=fromForm();localStorage.setItem(SAVE_KEY,JSON.stringify(getState()));
 }
 function render(preview,committed){
   if(!preview)return;
   rebase(preview);
   $('autoState').textContent=(committed?.enabled?'受付ON':'受付OFF')+' ／ 17LIVEの自動検出は未接続';
   $('autoStart').disabled=!!committed?.enabled;$('autoStop').disabled=!committed?.enabled;
   $('pairedState').textContent=committed?.pairedUid?'PC登録済み':'PC未登録（後日設定できます）';
   renderGiftHistory($('giftHistory'),committed,id=>act({kind:'cancel',target:id}));
 }
 function act(op){try{if(!client?.value)throw Error('先にOBSとの同期を開始してください。');client.submit(op);}catch(e){status(e.message);}}
 window.addEventListener('kill-state-saved',()=>{
   const now=fromForm(),d=C.diff(now,last);last=now;
   if(!client){return;}
   if(C.nonzero(d))try{client.submit({kind:'manual',delta:d});}catch(e){status(e.message);if(client.value)rebase(client.preview());}
 });
 $('syncStart').onclick=async()=>{
   if(client){client.retry();return;}
   if(starting)return;starting=true;$('syncStart').disabled=true;
   const controls=[...document.querySelectorAll('input,select,button')].filter(el=>!el.closest('#syncSection'));
   const disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
   try{
     status('接続中…');const env=await killFirebase();
     let token=localStorage.getItem('killObsReadToken_v1');
     if(!/^[a-f0-9]{64}$/.test(token||'')) {token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('killObsReadToken_v1',token);}
     const uid=env.user.uid;
     localStorage.setItem('killBeforeSharedSync3',JSON.stringify(getState()));
     const next=new KillSyncClient(env,uid,token,render,status);
     // Existing cloud totals are authoritative; never send a stale device snapshot.
     await next.start(fromForm());
     client=next;
     const link=new URL('overlay.html',location.href);link.hash=new URLSearchParams({uid,key:token});link.searchParams.set('view',$('obsView').value);
     $('obsUrl').value=link.href;$('obsLinkArea').hidden=false;
     const pc=new URL('receiver.html',location.href);pc.hash=link.hash;$('receiverUrl').value=pc.href;
     $('autoSection').hidden=false;$('syncStart').textContent='未送信の操作を再試行';
     // Clear historical snapshots on initial cloud adoption to avoid replaying old sessions.
     undoStack=[];redoStack=[];pendingEditSnapshot=null;saveHistory();updateHistoryButtons();
   }catch(e){status('同期を開始できません：'+e.message);}
   finally{controls.forEach((el,i)=>el.disabled=disabled[i]);updateHistoryButtons();starting=false;$('syncStart').disabled=false;if(client?.value)render(client.preview(),client.value);}
 };
 $('autoStart').onclick=()=>act({kind:'enable',enabled:true});
 $('autoStop').onclick=()=>act({kind:'enable',enabled:false});
 $('giftTest').onclick=()=>{if(confirm('動作確認として170BCと小パネル1個を実際に加算します。履歴から取り消せます。'))act({kind:'test',gift:'small',qty:1});};
 $('pairPC').onclick=()=>{
   const uid=$('pcUid').value.trim();if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)){status('PC画面に表示された接続IDを入力してください。');return;}
   if(confirm('このPCに数値の編集権限を付与します。自分のPCの接続IDであることを確認してください。'))act({kind:'pair',uid});
 };
 $('unpairPC').onclick=()=>{if(confirm('PCの接続を解除して自動加算を停止しますか？'))act({kind:'pair',uid:''});};
 $('discardPending').onclick=()=>{if(!client)return;if(confirm('この端末の未送信操作を取り消して、サーバーの値に戻しますか？'))try{client.discard();}catch(e){status(e.message);}};
 $('obsView').onchange=()=>{if(!$('obsUrl').value)return;const u=new URL($('obsUrl').value);u.searchParams.set('view',$('obsView').value);$('obsUrl').value=u.href;};
 for(const [button,input]of [['copyObsUrl','obsUrl'],['copyReceiverUrl','receiverUrl']])$(button).onclick=async()=>{try{await navigator.clipboard.writeText($(input).value);status('URLをコピーしました');}catch{$(input).focus();$(input).select();status('URL欄を長押ししてコピーしてください');}};
})();
