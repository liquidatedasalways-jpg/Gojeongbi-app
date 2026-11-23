const H = require('../harness');
const VP = { width: 360, height: 780 };
(async () => {
  const h = await H.open({ seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', latency: 800, viewport: VP, afterSeed: require('../seedlife') });
  const p = h.page;
  // + 양식 전체 흐름
  await p.click('#addBtn'); await p.waitForTimeout(450);
  await h.shot('30-add');
  await p.click('#saveBtn'); await p.waitForTimeout(200);   // 빈 채로 저장
  await h.shot('30-add-empty-submit');
  await p.fill('#f3', '디즈니플러스'); await p.fill('#f8', '9900');
  await p.click('#saveBtn'); await p.waitForTimeout(200);   // 결제일 없이
  await h.shot('30-add-noday-warn');
  await p.selectOption('#f11', '31');
  await p.click('.chip[data-v="현대 신용카드 5678"]');
  // 종료일 → 날짜
  await p.evaluate(() => { document.getElementById('sheetBody').scrollTop = 9999; }); await p.waitForTimeout(150);
  await p.click('[data-seg="f16"] [data-v="date"]'); await p.waitForTimeout(400);
  await h.shot('31-datepicker');
  await p.click('#dp .nav[data-m="1"]'); await p.waitForTimeout(100);
  await p.click('#dp .dpg button[data-d="31"]').catch(() => p.click('#dp .dpg button[data-d="30"]')); await p.waitForTimeout(350);
  await h.shot('31-date-picked');
  await p.click('#saveBtn'); await p.waitForTimeout(250);
  await h.shot('32-saving');
  await h.idle(1200); await h.shot('32-saved');
  console.log('add toast:', await h.toast());
  // 닫았다 열면 쓰던 내용
  await p.click('#addBtn'); await p.waitForTimeout(450);
  await p.fill('#f3', '쓰다 만 항목'); await p.waitForTimeout(350);
  await p.click('#sheetClose'); await p.waitForTimeout(350);
  await p.click('#addBtn'); await p.waitForTimeout(450);
  await h.shot('33-draft');
  console.log('draft toast:', await h.toast());
  await p.click('#sheetClose'); await p.waitForTimeout(350);
  // 날짜 미정
  await p.click('.tabbar [data-tab="cal"]'); await p.waitForTimeout(300);
  await p.click('#ndBtn'); await p.waitForTimeout(500);
  await h.shot('34-nodate');
  await p.fill('[data-q="0"]', '18'); await p.click('#qdSave'); await h.idle(1200);
  await h.shot('34-nodate-saved');
  console.log('nodate toast:', await h.toast());
  // 수정 양식
  await p.click('#home .row[data-name="월세"] .rb'); await p.waitForTimeout(450);
  await p.click('#dEdit'); await p.waitForTimeout(450);
  await h.shot('35-edit');
  await p.click('#sheetClose'); await p.waitForTimeout(350);
  // 지난 달 달력
  await p.click('#calPrev'); await p.waitForTimeout(300);
  await h.shot('36-oct');
  await p.evaluate(() => window.scrollTo(0, 99999)); await p.waitForTimeout(200);
  await h.shot('36-oct-bottom');
  console.log('errors', h.errors);
  await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
