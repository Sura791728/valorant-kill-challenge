/* Durable ordered outbox. The entire count update and receipt commit atomically. */
(() => {
 const C=window.KillSyncCore;
 window.killFirebase=async()=>{
   const [a,h,d]=await Promise.all(['app','auth','database'].map(n=>import(`https://www.gstatic.com/firebasejs/12.19.0/firebase-${n}.js`)));
   const app=a.getApps().length?a.getApp():a.initializeApp(window.FIREBASE_CONFIG);
   const auth=h.getAuth(app);await h.setPersistence(auth,h.browserLocalPersistence);await auth.authStateReady();
   const user=auth.currentUser||(await h.signInAnonymously(auth)).user;
   return {api:d,db:d.getDatabase(app),user};
 };
 window.KillSyncClient=class {
   constructor(env,uid,key,notify,status){
     this.env=env;this.target=env.api.ref(env.db,`overlays/${uid}/${key}`);this.notify=notify;this.status=status;
     this.storageKey=`killOutbox3:${env.user.uid}:${uid}:${key}`;
     this.queue=JSON.parse(localStorage.getItem(this.storageKey)||'[]');this.online=false;this.busy=false;this.error='';
   }
   async start(initial){
     const {api,db,user}=this.env;
     if(navigator.locks){
       await new Promise((resolve,reject)=>{
         navigator.locks.request(this.storageKey,{ifAvailable:true},async lock=>{
           if(!lock){reject(Error('同じブラウザの別タブで同期中です。そのタブを閉じてください。'));return;}
           await new Promise(release=>{this.release=release;resolve();});
         }).catch(reject);
       });
     }
     try {
     if(initial){
       await api.runTransaction(this.target,current=>{
         if(current?.schema===3)return current;
         return {...C.migrate(current,initial),updatedAt:Date.now()};
       },{applyLocally:false});
     }
     this.offConnection=api.onValue(api.ref(db,'.info/connected'),s=>{this.online=s.val()===true;this.report();if(this.online)this.flush();});
     await new Promise((resolve,reject)=>{
       let first=true;
       this.offData=api.onValue(this.target,s=>{
         const value=s.val();
         if(!value || value.schema!==3){const e=Error('先にiPhoneで新しい同期を開始してください。');this.status(e.message);if(first){first=false;reject(e);}return;}
         if((value.revision||0)>=(this.value?.revision||0))this.value=value;
         this.prune();this.render();this.flush();if(first){first=false;resolve();}
       },e=>{this.status('受信エラー：'+e.message);if(first){first=false;reject(e);}});
     });
     } catch(e){this.stop();throw e;}
   }
   stop(){this.offConnection?.();this.offData?.();this.release?.();}
   persist(){localStorage.setItem(this.storageKey,JSON.stringify(this.queue));}
   prune(){
     if(!this.value)return;
     const q=this.queue.filter(o=>!this.value.ops?.[o.id]);
     if(q.length!==this.queue.length){this.queue=q;this.persist();}
   }
   preview(){
     let s=this.value;
     if(!s)return null;
     for(const op of this.queue) {if(op.kind==='manual'&&!s.ops?.[op.id]) {try{s=C.reduce(s,op);}catch{}}}
     return s;
   }
   render(){this.notify(this.preview(),this.value);this.report();}
   report(){this.status(this.error || (!this.online?'接続待ち：未送信の操作はこの端末に保存されています':this.queue.length?`送信待ち ${this.queue.length}件`:'同期済み'));}
   submit(fields){
     const op={...fields,id:fields.id||crypto.randomUUID(),at:Date.now()};
     if(this.queue.some(x=>x.id===op.id)||this.value?.ops?.[op.id])return;
     C.reduce(this.preview(),op); // Reject invalid actions before saving to outbox.
     const old=this.queue;this.queue=[...old,op];
     try{this.persist();}catch(e){this.queue=old;throw Error('端末に操作を保存できません。空き容量を確認してください。');}
     this.error='';this.render();this.flush();
   }
   async flush(){
     if(this.busy||!this.online||!this.value||this.error||!this.queue.length)return;
     this.busy=true;const op=this.queue[0];
     try{
       let reason='';
       const result=await this.env.api.runTransaction(this.target,current=>{
         // The SDK may initially offer null from its cache. Return null to obtain server state.
         if(current===null)return null;
         try{reason='';return C.reduce(current,op);}catch(e){reason=e.message;return;}
       },{applyLocally:false});
       if(!result.committed || !result.snapshot.val()?.ops?.[op.id])throw Error(reason||'操作を確定できませんでした。');
       if((result.snapshot.val().revision||0)>=(this.value?.revision||0))this.value=result.snapshot.val();this.prune();this.render();
     }catch(e){if(!this.value?.ops?.[op.id])this.error='未送信：'+e.message+'（再試行、または未送信操作を取り消してください）';this.report();}
     finally{this.busy=false;if(!this.error)this.flush();}
   }
   retry(){this.error='';this.report();this.flush();}
   discard(){if(this.busy)throw Error('送信中です。完了後に操作してください。');this.queue=[];this.persist();this.error='';this.render();}
 };
 window.renderGiftHistory=(container,value,onCancel)=>{
   container.replaceChildren();
   const entries=Object.entries(value?.ops||{}).filter(([,r])=>['gift','test'].includes(r.kind)).sort((a,b)=>b[1].at-a[1].at).slice(0,50);
   if(!entries.length){container.textContent='受信履歴はまだありません。';return;}
   for(const [id,r]of entries){
     const row=document.createElement('div');row.className='receipt';
     const text=document.createElement('p');text.textContent=`${new Date(r.at).toLocaleString('ja-JP')} ｜ ${r.kind==='test'?'テスト':'受信'}：小 ${r.qty}個 / ${r.bc}BC${r.cancelled?'（取り消し済み）':''}`;row.append(text);
     if(!r.cancelled){const b=document.createElement('button');b.type='button';b.textContent='この1件を取り消す';b.onclick=()=>onCancel(id);row.append(b);}
     container.append(row);
   }
 };
})();
