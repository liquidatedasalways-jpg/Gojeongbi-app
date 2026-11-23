const H = require('../harness');
const VP = { width: 360, height: 780 };
(async () => {
  const h = await H.open({ seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', latency: 1200, viewport: VP, afterSeed: require('../seedlife') });
  const p = h.page;
  await h.shot('20-home360');
  // 1) 체크: 누른 직후 / 정리 후
  await p.click('#home .row[data-name="정수기 렌탈"] .chk');
  await p.waitForTimeout(150); await h.shot('21-check-instant');
  await p.waitForTimeout(1200); await h.shot('21-check-1s');
  await h.idle(1500); await h.shot('21-check-done');
  console.log('after check toast:', await h.toast());
  // 2) 목록 탭
  await p.click('.tabbar [data-tab="list"]'); await p.waitForTimeout(400);
  await h.shot('22-list360');
  await p.evaluate(() => window.scrollTo(0, 99999)); await p.waitForTimeout(300);
  await h.shot('22-list360-bottom');
  await p.evaluate(() => window.scrollTo(0, 0));
  // 3) 칸 수정
  await p.click('#list .row[data-name="관리비"] .amc'); await p.waitForTimeout(200);
  await h.shot('23-cell-edit');
  await p.keyboard.type('135000'); await p.keyboard.press('Enter');
  await p.waitForTimeout(300); await h.shot('23-cell-saved-instant');
  await h.idle(1500);
  console.log('cell toast:', await h.toast());
  // 4) 새 줄
  await p.fill('#nName', '왓챠'); await p.fill('#nAmt', '7900'); await p.fill('#nDay', '28'); await p.waitForTimeout(100);
  await h.shot('24-newrow');
  await p.press('#nDay', 'Enter'); await p.waitForTimeout(300);
  await h.shot('24-newrow-instant');
  await h.idle(1500); await h.shot('24-newrow-done');
  console.log('newrow toast:', await h.toast());
  // 5) 밀어서 삭제
  const row = p.locator('#list .row[data-name="왓챠"] .nmc');
  const b = await row.boundingBox();
  await p.mouse.move(b.x + b.width - 10, b.y + b.height / 2); await p.mouse.down();
  await p.mouse.move(b.x + b.width - 60, b.y + b.height / 2, { steps: 5 }); await p.mouse.move(b.x + b.width - 110, b.y + b.height / 2, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(400); await h.shot('25-swipe');
  await p.click('#list .row[data-name="왓챠"] .swdel'); await p.waitForTimeout(400);
  await h.shot('25-deleted-instant');
  await h.idle(1500); await h.shot('25-deleted');
  console.log('delete toast:', await h.toast());
  console.log('calls', h.calls.map((c) => c.fn).join(','));
  console.log('errors', h.errors);
  await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
