const H = require('../harness');
const VP = { width: 360, height: 780 };
(async () => {
  // A. 불러오기 실패 상태에서 ⋯ 메뉴
  let h = await H.open({ now: '2026-11-23T21:30', viewport: VP, latency: 200, noGo: true });
  h.failNext(1);
  await h.page.goto(h.base); await h.ctx.clock.resume(); await h.idle(1200);
  await h.page.click('#menuBtn'); await h.page.waitForTimeout(500);
  console.log('A 실패 화면에서 ⋯ 누름 → 메뉴 열림:', await h.page.evaluate(() => document.getElementById('sheet').classList.contains('on')));
  await h.page.click('#addBtn'); await h.page.waitForTimeout(300);
  console.log('A 실패 화면에서 + 누름 → 창 열림:', await h.page.evaluate(() => document.getElementById('sheet').classList.contains('on')), '| 안내:', JSON.stringify(await h.toast()));
  await h.close();
  // B. 결제 수단 바로 추가 알림 문구
  h = await H.open({ seed: 'full', now: '2026-11-23T21:30', viewport: VP, latency: 200 });
  const p = h.page;
  await p.click('#addBtn'); await p.waitForTimeout(450);
  await p.click('[data-addacc]'); await p.fill('.chipin input', '우리은행 월급통장'); await p.click('.chipin .ok'); await h.idle(900);
  console.log('B 결제 수단 바로 추가 후 알림:', JSON.stringify(await h.toast()));
  await p.click('#sheetClose'); await p.waitForTimeout(300);
  // C. 긴 이름·큰 금액
  await p.click('.tabbar [data-tab="list"]'); await p.waitForTimeout(300);
  await p.fill('#nName', '아주아주 긴 이름의 정기 결제 항목 테스트용 서비스'); await p.fill('#nAmt', '123456789'); await p.fill('#nDay', '27'); await p.press('#nDay', 'Enter'); await h.idle(900);
  await h.shot('60-long-list');
  await p.click('.tabbar [data-tab="cal"]'); await p.waitForTimeout(300);
  await h.shot('60-long-home');
  await p.click('.cd[data-day="2026-11-27"]'); await p.waitForTimeout(300); await p.evaluate(() => window.scrollTo(0, 400)); await p.waitForTimeout(200);
  await h.shot('60-long-day');
  // D. 다른 사이트가 이 앱을 틀 안에 넣을 수 있는지
  const framed = await p.evaluate(async (u) => new Promise((res) => {
    const f = document.createElement('iframe'); f.src = u; f.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:200px';
    f.onload = () => setTimeout(() => { try { res('틀 안에서 열림: ' + !!f.contentDocument.getElementById('menuBtn')); } catch (e) { res('막힘'); } }, 500);
    document.body.appendChild(f);
  }), h.base);
  console.log('D', framed);
  // E. 그리는 속도
  const t = await p.evaluate(() => { const t0 = performance.now(); for (let i = 0; i < 20; i++) document.querySelector('.tabbar [data-tab="list"]').click(), document.querySelector('.tabbar [data-tab="cal"]').click(); return (performance.now() - t0) / 40; });
  console.log('E 탭 전환 평균 ms', t.toFixed(2));
  console.log('errors', h.errors);
  await h.close();
  // F. 작은 폰(320)·큰 글자
  h = await H.open({ seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', viewport: { width: 320, height: 640 }, afterSeed: require('../seedlife') });
  await h.page.evaluate(() => window.scrollTo(0, 330)); await h.page.waitForTimeout(200);
  await h.shot('61-320-home');
  await h.page.click('.tabbar [data-tab="list"]'); await h.page.waitForTimeout(300);
  await h.shot('61-320-list');
  await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
