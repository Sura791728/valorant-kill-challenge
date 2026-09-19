/* Pure transaction reducer; also used by the offline verification suite. */
(function (root) {
  const zero = () => ({bc:0,kills:0,converted:0,panels:Array(8).fill(0)});
  const counts = s => ({bc:Number(s?.bc)||0,kills:Number(s?.kills)||0,converted:Number(s?.converted)||0,panels:Array.from({length:8},(_,i)=>Number(s?.panels?.[i])||0)});
  const diff = (a,b) => ({bc:a.bc-b.bc,kills:a.kills-b.kills,converted:a.converted-b.converted,panels:a.panels.map((n,i)=>n-b.panels[i])});
  const nonzero = d => d.bc || d.kills || d.converted || d.panels.some(Boolean);
  function add(s,d) {
    const c=counts(s);
    for(const k of ['bc','kills','converted']) c[k]+=d[k]||0;
    c.panels=c.panels.map((n,i)=>n+(d.panels?.[i]||0));
    if([c.bc,c.kills,c.converted,...c.panels].some(n=>!Number.isSafeInteger(n)||n<0)) throw Error('数値が不足しているため取り消せません。最新の合計を確認してください。');
    return {...s,...c,quota:Math.floor(c.bc/500),remaining:Math.max(0,Math.floor(c.bc/500)-c.converted)};
  }
  function migrate(s,initial) {
    return add({...counts(s||initial),schema:3,revision:0,enabled:false,pairedUid:'',ops:{},...(s||{})},zero());
  }
  function reduce(value,op) {
    if(!value || value.schema!==3) throw Error('先にiPhoneで新しい同期を開始してください。');
    if(value.ops?.[op.id]) return value;
    let s=structuredClone(value), record={kind:op.kind,at:op.at};
    switch(op.kind) {
      case 'manual': s=add(s,op.delta); break;
      case 'gift':
      case 'test': {
        if(op.kind==='gift' && !s.enabled) throw Error('自動加算は停止中です。');
        if(op.gift!=='small' || !Number.isSafeInteger(op.qty) || op.qty<1 || op.qty>1000) throw Error('未対応のギフトまたは個数です。');
        const d=zero();d.bc=170*op.qty;d.panels[2]=op.qty;
        s=add(s,d);record={...record,qty:op.qty,bc:d.bc,panel:2,cancelled:false};break;
      }
      case 'cancel': {
        const previous=s.ops?.[op.target];
        if(!previous || !['gift','test'].includes(previous.kind)) throw Error('取り消す受信記録がありません。');
        if(!previous.cancelled) {
          const d=zero();d.bc=-previous.bc;d.panels[previous.panel]=-previous.qty;
          s=add(s,d);s.ops[op.target].cancelled=true;
        }
        break;
      }
      case 'enable': s.enabled=!!op.enabled;break;
      case 'pair': s.pairedUid=op.uid;s.enabled=false;break;
      default: throw Error('不明な操作です。');
    }
    s.ops={...s.ops,[op.id]:record};s.updatedAt=op.at;s.revision=(value.revision||0)+1;
    return s;
  }
  root.KillSyncCore={zero,counts,diff,nonzero,add,migrate,reduce};
})(typeof window==='undefined'?globalThis:window);
