(() => {
 const $=id=>document.getElementById(id);let client,env;
 const status=t=>{$('status').textContent=t;};
 function submit(op){try{if(!client?.value)throw Error('先に接続してください。');client.submit(op);}catch(e){status(e.message);}}
 $('connect').onclick=async()=>{
   if(client){client.retry();return;}$('connect').disabled=true;
   try{
     env=await killFirebase();$('uid').value=env.user.uid;
     const p=new URLSearchParams(location.hash.slice(1)),uid=p.get('uid'),key=p.get('key');
     if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid||'')||!/^[a-f0-9]{64}$/.test(key||''))throw Error('iPhoneでコピーしたPC用URLから開いてください。');
     client=new KillSyncClient(env,uid,key,(preview,s)=>{
       const authorized=s?.pairedUid===env.user.uid||uid===env.user.uid;
       $('actions').hidden=!authorized;
       if(!authorized)status('iPhoneでこのPCの接続IDを登録してください。');
       $('counts').textContent=s?`${s.bc.toLocaleString()}BC ／ 小 ${s.panels?.[2]||0}個`:'';
       $('mode').textContent=(s?.enabled?'受付ON':'受付OFF')+' ／ 自動検出は未接続';
       renderGiftHistory($('history'),s,id=>submit({kind:'cancel',target:id}));
     },t=>status(client?.value && client.value.pairedUid!==env.user.uid && uid!==env.user.uid?'iPhoneでPCの接続IDを登録してください。':t));
     await client.start();
     // Future detector integration must supply a stable, verified event ID.
     // No DOM scraper or cross-origin message listener is installed in this version.
     window.receiveConfirmedGift=(eventId,gift,qty)=>{
       if(!/^[A-Za-z0-9_-]{1,100}$/.test(eventId))throw Error('受信イベントIDが必要です。');
       client.submit({kind:'gift',id:'gift_'+eventId,gift,qty});
     };
   }catch(e){status(e.message);client=null;}
   finally{$('connect').disabled=false;}
 };
 $('start').onclick=()=>submit({kind:'enable',enabled:true});$('stop').onclick=()=>submit({kind:'enable',enabled:false});
 $('test').onclick=()=>{if(confirm('170BCと小パネル1個を加算しますか？'))submit({kind:'test',gift:'small',qty:1});};
 $('retry').onclick=()=>client?.retry();
 $('discard').onclick=()=>{if(confirm('このPCの未送信操作を取り消しますか？'))try{client?.discard();}catch(e){status(e.message);}};
})();
