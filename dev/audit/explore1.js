const H = require('../harness');
(async () => {
  const h = await H.open({
    seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', latency: 300,
    afterSeed(g, me) {
      // 10월: 대부분 냈다고 체크, 몇 개는 깜빡
      g.setNow('2026-10-28');
      const m = {}; ['청년 적금', '넷플릭스', '유튜브 프리미엄', '실손보험', '쿠팡 와우 멤버십', '통신비', '휴대폰 요금', '인터넷', '월세'].forEach((n) => { m[n] = true; });
      g.call(me, 'api_setChecks', [m]);
      // 11월 초: 앱 열어서 새 달 정리 + 몇 개 체크
      g.setNow('2026-11-12');
      g.call(me, 'api_load', [false]);
      g.call(me, 'api_setChecks', [{ '청년 적금': true, '넷플릭스': true, '유튜브 프리미엄': true, '실손보험': true }]);
      g.call(me, 'api_sync', []);
    }
  });
  const p = h.page;
  console.log('errors', h.errors, 'toast:', await h.toast());
  await h.shot('01-home');
  await h.full('01-home-full');
  // 날짜 누르기
  await p.click('.cd[data-day="2026-11-15"]'); await p.waitForTimeout(300);
  await h.shot('02-day15');
  await p.click('#selClear');
  // 다음 달
  await p.click('#calNext'); await p.waitForTimeout(300);
  await h.full('03-dec-full');
  await p.click('#calToday');
  // 항목 상세
  await p.click('#home .row[data-name="월세"] .rb'); await p.waitForTimeout(450);
  await h.shot('04-item');
  await p.click('#sheetClose'); await p.waitForTimeout(350);
  // 목록 탭
  await p.click('.tabbar [data-tab="list"]'); await p.waitForTimeout(400);
  await h.shot('05-list');
  await h.full('05-list-full');
  // 줄 펼치기
  await p.click('#list .row[data-name="월세"] .nmc'); await p.waitForTimeout(300);
  await h.shot('06-list-open');
  // + 양식
  await p.click('#addBtn'); await p.waitForTimeout(450);
  await h.shot('07-add');
  await p.evaluate(() => { document.getElementById('sheetBody').scrollTop = 9999; }); await p.waitForTimeout(200);
  await h.shot('07-add-bottom');
  await p.click('#sheetClose'); await p.waitForTimeout(350);
  // 메뉴
  await p.click('#menuBtn'); await p.waitForTimeout(450);
  await h.shot('08-menu');
  await p.evaluate(() => { document.getElementById('sheetBody').scrollTop = 9999; }); await p.waitForTimeout(200);
  await h.shot('08-menu-bottom');
  // 결제 수단
  await p.evaluate(() => { document.getElementById('sheetBody').scrollTop = 0; });
  await p.click('#mAcc'); await p.waitForTimeout(450);
  await h.shot('09-acc');
  await p.click('#accNew'); await p.waitForTimeout(450);
  await h.shot('10-acc-new');
  await p.click('#sheetClose'); await p.waitForTimeout(350);
  console.log('calls', h.calls.map((c) => c.fn).join(','));
  console.log('errors', h.errors);
  await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
