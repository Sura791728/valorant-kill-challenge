(async () => {
  const notice = document.getElementById('notice');
  const view = new URLSearchParams(location.search).get('view');
  document.body.dataset.view = ['gauge', 'panels'].includes(view) ? view : 'all';
  const params = new URLSearchParams(location.hash.slice(1));
  const uid = params.get('uid'), key = params.get('key');
  let connected = false, received = false, error = '';
  const showStatus = () => { notice.textContent = error || (!connected ? '接続待ち・最後の受信値を表示' : received ? '' : 'iPhoneからの送信待ち'); };
  try {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid || '') || !/^[a-f0-9]{64}$/.test(key || '')) throw new Error('操作画面で発行されたOBS用URLを設定してください');
    if (!window.FIREBASE_CONFIG?.databaseURL) throw new Error('Firebaseの接続設定が必要です');
    const [appAPI, api] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js')
    ]);
    const db = api.getDatabase(appAPI.initializeApp(window.FIREBASE_CONFIG));
    api.onValue(api.ref(db, '.info/connected'), s => { connected = s.val() === true; showStatus(); });
    api.onValue(api.ref(db, 'overlays/' + uid + '/' + key), s => {
      const value = s.val();
      received = !!value; error = '';
      const number = n => Number.isFinite(n) && n >= 0 ? Math.floor(n).toLocaleString('ja-JP') : '—';
      for (const field of ['quota', 'converted']) document.getElementById(field).textContent = value ? number(value[field]) : '—';
      const goals = [100, 50, 500, 150, 500, 1, 1, 100];
      // 旧5項目の送信には新規項目を割り当てない。
      const isNine = value?.panels && Object.keys(value.panels).length === 8;
      const counts = goals.map((_,i) => !isNine && i >= 4 ? undefined : value?.panels?.[i]);
      document.getElementById('panelAll').style.display = counts.every((n,i)=>Number.isFinite(n) && n >= goals[i]) ? 'none' : '';
      for (let i = 0; i < 8; i++) {
        const count = counts[i];
        document.getElementById('p' + i).textContent = value ? number(count) : '—';
        // 未受信時は全て閉じる。取り消しで目標未満に戻れば再び覆う。
        document.getElementById('panel' + i).style.display = Number.isFinite(count) && count >= goals[i] ? 'none' : '';
      }
      const quota = Number.isFinite(value?.quota) ? Math.max(0, value.quota) : 0;
      const converted = Number.isFinite(value?.converted) ? Math.max(0, value.converted) : 0;
      const percent = quota > 0 ? Math.min(100, converted / quota * 100) : 0;
      document.getElementById('gaugeFill').style.width = percent + '%';
      const gauge = document.getElementById('killGauge');
      gauge.setAttribute('aria-valuemax', String(quota || 1));
      gauge.setAttribute('aria-valuenow', String(Math.min(converted, quota)));
      gauge.setAttribute('aria-valuetext', received ? converted + ' / ' + quota + ' キル' : '未受信');
      showStatus();
    }, e => { error = '受信できません：' + (e.code || e.message); showStatus(); });
  } catch (e) { notice.textContent = e.message; }
})();
