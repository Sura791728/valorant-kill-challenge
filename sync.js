(() => {
  const $ = id => document.getElementById(id);
  const status = text => { $('syncStatus').textContent = text; };
  let db, api, target, connected = false, active = false, starting = false;
  let pending = null, sending = false, sequence = 0;
  const TOKEN_KEY = 'killObsReadToken_v1';
  function snapshot() {
    const s = getState();
    return {
      bc: s.totalBC, kills: s.totalKills, converted: s.totalConverted,
      quota: Math.floor(s.totalBC / 500),
      remaining: Math.max(0, Math.floor(s.totalBC / 500) - s.totalConverted),
      panels: s.panelTotals.slice(0, 8),
      updatedAt: api.serverTimestamp()
    };
  }
  function queue() {
    if (!active) return;
    pending = { value: snapshot(), sequence: ++sequence };
    status(connected ? 'OBSへ送信中…' : '未送信：接続が戻ると最新の数値を送ります');
    void flush();
  }
  async function flush() {
    if (!connected || sending || !pending) return;
    sending = true;
    const job = pending;
    pending = null;
    let failed = false;
    try {
      await api.set(target, job.value);
      if (!pending && connected) status('同期済み ' + new Date().toLocaleTimeString('ja-JP'));
    } catch (e) {
      failed = true;
      if (!pending) pending = job;
      status('未送信：' + (e.code || e.message) + ' ／「再送信」を押してください');
    } finally {
      sending = false;
      if (pending && !failed) void flush();
    }
  }
  window.addEventListener('kill-state-saved', queue);
  $('syncStart').addEventListener('click', async () => {
    if (active) { queue(); return; }
    if (starting) return;
    starting = true;
    $('syncStart').disabled = true;
    try {
      const config = window.FIREBASE_CONFIG;
      if (!config?.apiKey || !config.databaseURL || !config.projectId) {
        throw new Error('Firebaseの接続設定がまだありません。設定手順を確認してください。');
      }
      status('接続中…');
      const [appAPI, authAPI, databaseAPI] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js')
      ]);
      api = databaseAPI;
      const app = appAPI.getApps().length ? appAPI.getApp() : appAPI.initializeApp(config);
      const auth = authAPI.getAuth(app);
      await authAPI.setPersistence(auth, authAPI.browserLocalPersistence);
      await auth.authStateReady();
      const user = auth.currentUser || (await authAPI.signInAnonymously(auth)).user;
      let token = localStorage.getItem(TOKEN_KEY);
      if (!/^[a-f0-9]{64}$/.test(token || '')) {
        token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(TOKEN_KEY, token);
      }
      db = api.getDatabase(app);
      target = api.ref(db, 'overlays/' + user.uid + '/' + token);
      const link = new URL('overlay.html', location.href);
      link.hash = new URLSearchParams({ uid: user.uid, key: token }).toString();
      $('obsUrl').value = link.href;
      $('obsLinkArea').hidden = false;
      active = true;
      $('syncStart').textContent = '最新の数値を再送信';
      api.onValue(api.ref(db, '.info/connected'), snap => {
        connected = snap.val() === true;
        if (!connected) status('接続待ち：OBSは最後に受信した数値を表示します');
        else if (pending) void flush();
        else status('接続済み');
      });
      queue();
    } catch (e) {
      status('同期を開始できません：' + (e.code || e.message));
    } finally {
      starting = false;
      $('syncStart').disabled = false;
    }
  });
  $('obsView').addEventListener('change', () => {
    if (!$('obsUrl').value) return;
    const link = new URL($('obsUrl').value);
    link.searchParams.set('view', $('obsView').value);
    $('obsUrl').value = link.href;
    $('copyObsUrl').textContent = 'OBS用URLをコピー';
  });
  $('copyObsUrl').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('obsUrl').value); $('copyObsUrl').textContent = 'コピーしました'; }
    catch { $('obsUrl').focus(); $('obsUrl').select(); status('URL欄を長押ししてコピーしてください'); }
  });
})();
