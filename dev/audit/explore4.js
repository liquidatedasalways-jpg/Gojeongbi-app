const H = require('../harness');
const VP = { width: 360, height: 780 };
(async () => {
  // A. 로그인 화면 (처음 온 사람)
  let h = await H.open({ now: '2026-11-23T21:30', viewport: VP, loggedOut: true });
  await h.page.waitForTimeout(500);
  await h.shot('40-login');
  await h.page.click('#instBtn'); await h.page.waitForTimeout(200);
  await h.shot('40-login-install');
  await h.close();
  // B. 새 사용자 빈 화면
  h = await H.open({ now: '2026-11-23T21:30', viewport: VP, latency: 1500, noGo: true });
  await h.page.goto(h.base); await h.ctx.clock.resume(); await h.page.waitForTimeout(700);
  await h.shot('41-first-loading');
  await h.idle(1500);
  await h.shot('41-empty-home');
  console.log('empty toast:', await h.toast(), '| calOn:', await h.page.evaluate(() => document.getElementById('syncTxt').textContent));
  await h.page.click('.tabbar [data-tab="list"]'); await h.page.waitForTimeout(350);
  await h.shot('41-empty-list');
  // 첫 항목: 지난 날짜(3일)로 추가
  await h.page.fill('#nName', '넷플릭스'); await h.page.fill('#nAmt', '17000'); await h.page.fill('#nDay', '3'); await h.page.press('#nDay', 'Enter');
  await h.idle(2000);
  await h.shot('41-first-item-list');
  await h.page.click('.tabbar [data-tab="cal"]'); await h.page.waitForTimeout(350);
  await h.shot('41-first-item-home');
  console.log('events after first item:', h.gas.events(h.email).length, 'slept(ms):', h.gas.state.slept);
  await h.close();
  // C. 다크 모드
  h = await H.open({ seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', viewport: VP, dark: true, afterSeed: require('../seedlife') });
  await h.shot('42-dark-home');
  await h.page.click('.tabbar [data-tab="list"]'); await h.page.waitForTimeout(350);
  await h.shot('42-dark-list');
  await h.page.click('#addBtn'); await h.page.waitForTimeout(450);
  await h.shot('42-dark-add');
  await h.page.click('#sheetClose'); await h.page.waitForTimeout(300);
  await h.page.click('#menuBtn'); await h.page.waitForTimeout(450);
  await h.shot('42-dark-menu');
  await h.close();
  // D. 연결 끊김
  h = await H.open({ seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', viewport: VP, latency: 300, afterSeed: require('../seedlife') });
  h.failNext(1);
  await h.page.click('#home .row[data-name="월세"] .chk'); await h.idle(1500);
  await h.shot('43-offline-check');
  console.log('offline toast:', await h.toast());
  await h.close();
  // E. 처음 여는데 연결 안 됨
  h = await H.open({ now: '2026-11-23T21:30', viewport: VP, latency: 300, noGo: true });
  h.failNext(1);
  await h.page.goto(h.base); await h.ctx.clock.resume(); await h.idle(1500);
  await h.shot('44-first-offline');
  await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
