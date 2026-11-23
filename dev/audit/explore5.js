const H = require('../harness');
const VP = { width: 360, height: 780 };
(async () => {
  let h = await H.open({ seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', viewport: VP, latency: 300, afterSeed: require('../seedlife') });
  const p = h.page;
  await p.waitForTimeout(1500);   // 캘린더 맞추기까지 끝나게
  // 1) 연결 끊김 상태에서 체크
  h.failNext(1);
  await p.click('#home .row[data-name="월세"] .chk'); await p.waitForTimeout(1200);
  await h.shot('50-offline-check');
  console.log('1 offline toast:', JSON.stringify(await h.toast()), '| 화면엔 월세가', await p.evaluate(() => !!document.querySelector('#home .row[data-name="월세"]')) ? '아직 있음' : '사라짐(낸 걸로 보임)');
  const srv = h.gas.call(h.email, 'api_load', [true]).items.find((i) => i.name === '월세');
  console.log('  서버 실제 상태: checked =', srv.checked);
  await p.waitForTimeout(9000);
  console.log('  10초 뒤 화면엔 월세가', await p.evaluate(() => !!document.querySelector('#home .row[data-name="월세"]')) ? '다시 있음' : '여전히 사라져 있음', '| toast:', JSON.stringify(await h.toast()));
  await p.reload(); await h.idle(800);
  // 2) 뒤로 가기: 아래 창이 열린 상태
  await p.click('#addBtn'); await p.waitForTimeout(450);
  const before = p.url();
  await p.goBack().catch(() => {}); await p.waitForTimeout(600);
  console.log('2 뒤로 가기 후 주소:', p.url(), '(전:', before + ')', '| 창 열림:', await p.evaluate(() => { const s = document.getElementById('sheet'); return s ? s.classList.contains('on') : 'page-gone'; }).catch(() => 'page-gone'));
  await p.goto(h.base); await h.idle(800);
  // 3) 메뉴: 못 불러왔을 때
  // 4) 터치 영역 크기
  await p.click('.tabbar [data-tab="list"]'); await p.waitForTimeout(300);
  const small = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a, select, [data-act], .cd.has, input').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.width < 40 || r.height < 40) out.push((el.id || el.className || el.tagName).toString().slice(0, 28) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 10) + '"');
    });
    return Array.from(new Set(out));
  });
  console.log('4 작은 터치 영역(40px 미만):\n  ' + small.join('\n  '));
  // 5) 글자 크기 분포
  const fonts = await p.evaluate(() => {
    const m = {};
    document.querySelectorAll('body *').forEach((el) => {
      if (!el.childNodes.length || !Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) return;
      const r = el.getBoundingClientRect(); if (!r.width) return;
      const fs = parseFloat(getComputedStyle(el).fontSize); m[fs] = (m[fs] || 0) + 1;
    });
    return m;
  });
  console.log('5 목록 탭 글자 크기(px: 개수):', JSON.stringify(fonts));
  await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
