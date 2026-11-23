/* 고친 것들이 계속 되는지 확인하는 검사.
 *   node test.js            전부
 *   node test.js back menu  이름에 이 글자가 들어간 것만
 * 저장소의 index.html + setup/Code.gs.txt 를 그대로 돌림 (harness.js 참고).
 */
const H = require('./harness');
const VP = { width: 360, height: 780 };
const SMALL = { width: 320, height: 640 };
const LIFE = { seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', viewport: VP, latency: 80, afterSeed: require('./seedlife') };

const cases = [];
function t(name, fn) { cases.push({ name, fn }); }
let fails = 0, cur = '';
function ok(cond, msg) {
  if (cond) { console.log('    ✓ ' + msg); return; }
  fails++; console.log('    ✗ ' + msg + '   ← 실패 (' + cur + ')');
}
const sleep = (p, ms) => p.waitForTimeout(ms);
const srvItem = (h, name) => h.gas.call(h.email, 'api_load', [true]).items.find((i) => i.name === name);
const homeHas = (p, name) => p.evaluate((n) => !!document.querySelector('#home .row[data-name="' + n + '"]'), name);
const toastState = (p) => p.evaluate(() => { const e = document.getElementById('toast'); return { on: e.classList.contains('on'), sticky: e.classList.contains('sticky'), txt: document.getElementById('toastTxt').textContent, btn: document.getElementById('toastBtn').textContent }; });
const realErrors = (h) => h.errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e));   // 일부러 끊은 연결은 빼고
const sheetOn = (p) => p.evaluate(() => document.getElementById('sheet').classList.contains('on'));

/* ---------- 꼭 1: 연결이 끊긴 채 체크 ---------- */
t('offline-check-rollback', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1500);                       // 캘린더 맞추기까지 끝나게
  h.failNext(3);                              // 처음 + 자동 재시도 2번 모두 끊김
  await p.click('#home .row[data-name="월세"] .chk');
  await sleep(p, 1100);
  ok(!(await homeHas(p, '월세')), '누르면 화면에선 먼저 낸 걸로 바뀜');
  await sleep(p, 5500);
  ok(await homeHas(p, '월세'), '끝내 저장 못 하면 화면이 "안 냄"으로 되돌아옴');
  ok(srvItem(h, '월세').checked === false, '서버도 안 냄 그대로');
  let ts = await toastState(p);
  ok(ts.on && ts.sticky && /저장 못 했어요/.test(ts.txt) && ts.btn === '다시 시도', '저장 실패 알림이 떠 있음: ' + JSON.stringify(ts.txt));
  await h.shot('t-offline-rollback');
  await sleep(p, 11000);
  ts = await toastState(p);
  ok(ts.on, '11초 뒤에도 알림이 그대로 있음 (누를 때까지 유지)');
  await p.click('#toastBtn');                 // 다시 시도 (이제 연결됨)
  await h.idle(1500);                         // 체크한 줄은 0.9초 동안 제자리에 있다가 옮겨짐
  ok(srvItem(h, '월세').checked === true, '"다시 시도"를 누르면 서버에 저장됨');
  ok(!(await homeHas(p, '월세')), '화면에서도 낸 걸로');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});
t('offline-check-auto-retry', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1500);
  h.failNext(1);                              // 한 번만 끊김 → 자동 재시도로 저장돼야 함
  await p.click('#home .row[data-name="월세"] .chk');
  await sleep(p, 2500); await h.idle();
  ok(srvItem(h, '월세').checked === true, '한 번 끊겨도 자동으로 다시 보내서 저장됨');
  const ts = await toastState(p);
  ok(!/저장 못/.test(ts.on ? ts.txt : ''), '실패 알림 없음');
  ok(!(await homeHas(p, '월세')), '화면엔 낸 걸로');
  await h.close();
});
t('offline-add-form', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1500);
  await p.click('#addBtn'); await sleep(p, 450);
  await p.fill('#sheetBody input[data-col="3"], #f3', '수도요금').catch(() => {});
  const nameSel = await p.evaluate(() => { const f = document.querySelector('#sheetBody input'); return f ? f.id : ''; });
  await p.fill('#' + nameSel, '수도요금');
  h.failNext(1);
  await p.click('#saveBtn'); await sleep(p, 300);
  await p.click('#saveBtn').catch(() => {}); // 결제일 없이 추가 확인
  await sleep(p, 1500);
  const st = await p.evaluate(() => ({ err: (document.getElementById('formErr') || {}).textContent || '', btn: document.getElementById('saveBtn') ? document.getElementById('saveBtn').textContent : '', dis: document.getElementById('saveBtn') ? document.getElementById('saveBtn').disabled : null }));
  ok(await sheetOn(p), '추가 양식은 열린 채로 남음 (적은 내용 유지)');
  ok(/연결이 안 됐어요/.test(st.err) && st.dis === false, '양식 안에 오류가 보이고 버튼을 다시 누를 수 있음: ' + JSON.stringify(st));
  ok(!h.gas.call(h.email, 'api_load', [true]).items.some((i) => i.name === '수도요금'), '추가는 자동으로 다시 보내지 않음 (두 번 들어가면 안 됨)');
  await p.click('#saveBtn'); await sleep(p, 300);
  if (await sheetOn(p)) await p.click('#saveBtn').catch(() => {});
  await h.idle(800);
  ok(h.gas.call(h.email, 'api_load', [true]).items.filter((i) => i.name === '수도요금').length === 1, '다시 누르면 한 번만 추가됨');
  await h.close();
});

/* ---------- 꼭 2: 폰 뒤로 가기 ---------- */
const back = async (p) => { await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await sleep(p, 350); };
const tabNow = (p) => p.evaluate(() => (document.querySelector('.tab.on') || {}).id);
const sheetTitle = (p) => p.evaluate(() => document.getElementById('sheetTitle').textContent);
const histState = (p) => p.evaluate(() => (history.state && history.state.fcd) || 0);
t('back-closes-sheet', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  const url0 = p.url();
  await p.click('#home .row[data-name="월세"] .rb'); await sleep(p, 400);
  ok(await sheetOn(p), '항목을 누르면 창이 열림');
  await back(p);
  ok(!(await sheetOn(p)) && p.url() === url0, '뒤로 가기 → 창만 닫히고 앱은 그대로');
  ok(await homeHas(p, '월세'), '첫 화면이 그대로 보임 (새로 열리지 않음)');
  // 화면의 X로 닫으면 쌓아 둔 기록도 같이 없어져야 함 (안 그러면 다음 뒤로 가기가 헛돎)
  await p.click('#home .row[data-name="월세"] .rb'); await sleep(p, 400);
  await p.click('#sheetClose'); await sleep(p, 400);
  ok((await histState(p)) === 0 && !(await sheetOn(p)), 'X로 닫으면 기록도 원래대로');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});
t('back-nested-menu', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await p.click('#menuBtn'); await sleep(p, 400);
  await p.click('#mAcc'); await sleep(p, 400);
  ok((await sheetTitle(p)) === '결제 수단 관리', '설정 → 결제 수단 관리');
  await p.click('#sheetBody [data-acc="0"]'); await sleep(p, 400);
  ok((await sheetTitle(p)) === '결제 수단 수정', '→ 결제 수단 수정');
  await back(p);
  ok((await sheetTitle(p)) === '결제 수단 관리' && (await sheetOn(p)), '뒤로 가기 → 결제 수단 관리로');
  await back(p);
  ok((await sheetTitle(p)) === '설정' && (await sheetOn(p)), '뒤로 가기 → 설정으로');
  await back(p);
  ok(!(await sheetOn(p)), '뒤로 가기 → 창 닫힘');
  // 화면의 ← 버튼도 같은 길
  await p.click('#menuBtn'); await sleep(p, 400);
  await p.click('#mAcc'); await sleep(p, 400);
  await p.click('#sheetBack'); await sleep(p, 400);
  ok((await sheetTitle(p)) === '설정', '화면의 ← 버튼 → 설정으로');
  await back(p);
  ok(!(await sheetOn(p)) && (await histState(p)) === 0, '그다음 뒤로 가기 한 번에 닫힘');
  await h.close();
});
t('back-tab-and-datepicker', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 400);
  ok((await tabNow(p)) === 'tab-list', '목록 탭으로');
  await p.click('#addBtn'); await sleep(p, 450);
  await p.click('#sheetBody [data-seg] button[data-v="date"]'); await sleep(p, 400);
  const dpOn = () => p.evaluate(() => !!document.querySelector('.dp.on'));
  ok(await dpOn(), '종료일 "날짜"를 누르면 날짜 고르기가 뜸');
  await back(p);
  ok(!(await dpOn()) && (await sheetOn(p)), '뒤로 가기 → 날짜 고르기만 닫히고 양식은 그대로');
  await back(p);
  ok(!(await sheetOn(p)) && (await tabNow(p)) === 'tab-list', '뒤로 가기 → 양식 닫힘, 목록 탭 그대로');
  await back(p);
  ok((await tabNow(p)) === 'tab-cal', '뒤로 가기 → 결제 달력 탭으로');
  ok((await histState(p)) === 0, '기록이 처음 상태로 (다음 뒤로 가기는 앱 나가기)');
  // 탭을 눌러서 돌아오면 기록도 같이 정리
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 300);
  await p.click('.tabbar [data-tab="cal"]'); await sleep(p, 400);
  ok((await histState(p)) === 0, '탭 버튼으로 달력에 돌아와도 기록이 안 남음');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});

/* ---------- 꼭 3: 처음 불러오기 실패 ---------- */
t('fatal-menu', async () => {
  const h = await H.open(Object.assign({}, LIFE, { noGo: true })); const p = h.page;
  h.failNext(3);
  await p.goto(h.base); await h.ctx.clock.resume();
  await p.waitForSelector('#retry', { timeout: 15000 });
  await p.click('#menuBtn'); await sleep(p, 400);
  const st = await p.evaluate(() => ({ on: document.getElementById('sheet').classList.contains('on'), reload: !!document.getElementById('mReload'), sw: !!document.getElementById('mSwitch'), out: !!document.getElementById('mLogout'), txt: document.getElementById('sheetBody').textContent }));
  ok(st.on && st.reload && st.sw && st.out, '못 불러온 상태에서도 ⋯가 열리고 다시 불러오기·계정 전환·로그아웃이 있음');
  ok(/tester@example\.com/.test(st.txt), '어느 계정인지 보임');
  await p.click('#mReload'); await h.idle(600);
  ok(await homeHas(p, '월세'), '"다시 불러오기"를 누르면 내용이 뜸');
  ok(!(await sheetOn(p)), '작은 메뉴는 닫힘');
  await h.close();
});

/* ---------- 꼭 4·5: 숫자·이름 잘림 (폭 320) ---------- */
const BIG = (g, me) => {
  require('./seedlife')(g, me); g.setNow('2026-11-20');
  g.call(me, 'api_save', ['', H.item({ n: '아파트 중도금 대출 상환금', cat: '기타', amt: 123456789, day: 27, method: '자동이체', acc: '토스뱅크 4661', end: '2026-12-27' })]);
  g.call(me, 'api_save', ['', H.item({ n: '오피스텔 전세 대출 이자', cat: '기타', amt: 2345678, day: 21, method: '자동이체' })]);
};
t('money-fit-320', async () => {
  const h = await H.open(Object.assign({}, LIFE, { viewport: SMALL, afterSeed: BIG })); const p = h.page;
  await sleep(p, 1500);
  // 0.5px만 넘쳐도 잘리니 글자 실제 폭으로 잼. 맨 위 요약(큰 숫자 + 낸 돈·전체 줄)
  const sumCut = (pg) => pg.evaluate(() => {
    const box = document.getElementById('sumline');
    const one = (el) => { const r = document.createRange(); r.selectNodeContents(el); return { t: el.textContent, fs: getComputedStyle(el).fontSize, cut: el.scrollWidth > el.clientWidth || r.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.05 }; };
    const cp = box.querySelector('.cp'), sp = cp.querySelectorAll('span');
    return { num: one(box.querySelector('.num')), paid: sp[0].textContent, total: sp[1].textContent,
      oneLine: Math.abs(sp[0].getBoundingClientRect().top - sp[1].getBoundingClientRect().top) < 2,
      inside: sp[1].getBoundingClientRect().right <= cp.getBoundingClientRect().right + 0.5 && sp[0].getBoundingClientRect().left >= cp.getBoundingClientRect().left - 0.5 };
  });
  const sum = await sumCut(p);
  ok(!sum.num.cut && sum.num.t === '126,994,257원', '맨 위 큰 숫자가 1억대에서도 안 잘림: ' + sum.num.t + ' (' + sum.num.fs + ')');
  ok(sum.inside && sum.oneLine, '낸 돈·전체 줄도 한 줄로 카드 안에: ' + sum.paid + ' / ' + sum.total);
  const cell = await p.evaluate(() => { const c = document.querySelector('.cd[data-day="2026-11-27"] .a'); const b = c.parentNode.getBoundingClientRect(), r = c.getBoundingClientRect(); return { t: c.textContent, in: r.left >= b.left - 0.5 && r.right <= b.right + 0.5 }; });
  ok(/억$/.test(cell.t) && cell.in, '달력 칸: 1억 넘는 날은 "' + cell.t + '"로, 칸 안에 들어감');
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
  const amts = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#list .tc.amc'), (c) => { const a = c.querySelector('.av'); if (!a) return null; const b = c.getBoundingClientRect(), r = a.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(a); return { t: a.textContent, ok: a.scrollWidth <= a.clientWidth && rg.getBoundingClientRect().width <= r.width + 0.05 && r.left >= b.left - 0.5 && r.right <= b.right + 0.5 }; }).filter(Boolean));
  ok(amts.length >= 15 && amts.every((x) => x.ok), '목록 금액이 전부 자기 칸 안에 (옆 칸을 덮지 않음)');
  ok(amts.some((x) => x.t === '123,456,789'), '1억대 금액도 줄이지 않고 숫자 그대로 보임');
  const names = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#list .row.tr[data-name]'), (r) => { const n = r.querySelector('.nm'), tg = r.querySelector('.tgs'); const nr = n.getBoundingClientRect(); return { name: r.getAttribute('data-name'), w: Math.round(nr.width), tagBelow: !tg || tg.getBoundingClientRect().top >= nr.bottom - 1, h: Math.round(r.querySelector('.tg').getBoundingClientRect().height) }; }));
  const coupang = names.find((x) => x.name === '쿠팡 와우 멤버십');
  ok(coupang && coupang.w >= 90, '"쿠팡 와우 멤버십" 이름 칸 폭 ' + (coupang && coupang.w) + 'px (전엔 한두 글자만 남았음)');
  ok(names.every((x) => x.tagBelow), '"N일 지남" 표시는 이름 아래 줄에');
  ok(names.every((x) => x.h <= 46), '줄 높이는 그대로 (가장 높은 줄 ' + Math.max.apply(null, names.map((x) => x.h)) + 'px)');
  await h.shot('t-list-320');
  await h.close();
  // 평범한 금액(백만 원대)도 폭 320에서 잘리지 않아야 함 (0.4px 넘쳐서 "1,191,79…"로 보이던 것)
  for (const dark of [false, true]) {
    const h2 = await H.open(Object.assign({}, LIFE, { viewport: SMALL, dark }));
    await sleep(h2.page, 1500);
    const s2 = await sumCut(h2.page);
    ok(!s2.num.cut && s2.num.t === '1,191,790원' && s2.num.fs === '28px' && s2.inside && s2.oneLine, '보통 금액은 큰 글자(28px) 그대로 안 잘림' + (dark ? ' (다크)' : '') + ': ' + s2.num.t + ' · ' + s2.paid + ' / ' + s2.total);
    await h2.close();
  }
});

/* ---------- 꼭 6: 지난달 달력 (서버 v8: 시작일 채우기) ---------- */
t('last-month-calendar', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  const st = h.gas.call(h.email, 'api_load', [true]);
  ok(st.ver >= 8, '서버 v8 이상 (v' + st.ver + ')');
  const noStart = st.items.filter((i) => !i.sep && i.day && i.every === 1 && !i.start).map((i) => i.name);
  ok(noStart.length === 0, '결제일 있는 매월 항목은 모두 시작일이 채워짐 ' + JSON.stringify(noStart));
  const rent = st.items.find((i) => i.name === '월세'), mng = st.items.find((i) => i.name === '관리비');
  ok(rent.start === '2026-10-25', '10월에 낸 기록이 있는 월세 → 시작일 10월 25일 (' + rent.start + ')');
  ok(mng.start === '2026-11-30', '낸 기록이 없는 관리비 → 이번 달부터 (' + mng.start + '), 없던 걸 "지난달 안 냄"으로 알리지 않음');
  await p.click('#calPrev'); await sleep(p, 400);
  const oct = await p.evaluate(() => ({ cells: document.querySelectorAll('#cal .cd.has').length, rows: document.querySelectorAll('#home .row').length, head: document.querySelector('#home .sec').textContent }));
  ok(oct.cells >= 6 && oct.rows >= 9, '지난달(10월) 달력에 결제가 보임: 날짜 ' + oct.cells + '칸, ' + oct.head);
  await h.shot('t-oct');
  await h.close();
});
t('new-item-gets-start', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 400);
  await p.fill('#nName', '수도요금'); await p.fill('#nAmt', '21000'); await p.fill('#nDay', '28');
  await p.press('#nDay', 'Enter'); await h.idle(800);
  ok(srvItem(h, '수도요금').start === '2026-11-28', '결제일이 아직 안 지난 새 항목 → 시작일이 이번 달 그날 (' + srvItem(h, '수도요금').start + ')');
  await p.fill('#nName', '신문 구독'); await p.fill('#nAmt', '15000'); await p.fill('#nDay', '5');
  await p.press('#nDay', 'Enter'); await h.idle(800);
  ok(srvItem(h, '신문 구독').start === '2026-12-05', '이미 지난 결제일 → 다음 달부터 (' + srvItem(h, '신문 구독').start + ')');
  await h.close();
});

/* ---------- 꼭 8: 캘린더 넣는 동안 저장이 안 멈춤 ---------- */
t('sync-in-slices', async () => {
  // 캘린더에 아직 아무것도 없는 상태로 열기 → 128개를 끊어서 넣음
  const h = await H.open({ seed: 'full', seedAt: '2026-10-02', now: '2026-11-23T21:30', viewport: VP, latency: 250 }); const p = h.page;
  const chip = () => p.evaluate(() => document.getElementById('syncTxt').textContent);
  let seen = '';
  for (let i = 0; i < 40 && !/\d+\/\d+/.test(seen); i++) { await sleep(p, 150); seen = await chip(); }
  const total = +((/캘린더 반영 중 \d+\/(\d+)/.exec(seen) || [])[1] || 0);
  ok(total > 100, '위쪽에 진행 상황이 보임: "' + seen + '"');
  const before = h.gas.events(h.email).length;
  await p.click('#home .row[data-name="월세"] .chk');
  let saved = false, at = 0;
  for (let i = 0; i < 30 && !saved; i++) { await sleep(p, 100); saved = srvItem(h, '월세').checked === true; at = h.gas.events(h.email).length; }
  ok(saved && at < total, '넣는 도중에 한 체크가 바로 저장됨 (그때 캘린더 ' + at + '/' + total + ', 누를 때 ' + before + ')');
  for (let i = 0; i < 80 && h.gas.events(h.email).length < total; i++) await sleep(p, 250);
  await h.idle(1500);
  ok(h.gas.events(h.email).length === total, '끝까지 다 들어감 (' + total + '개)');
  ok((await chip()) === '', '끝나면 진행 표시가 사라짐');
  ok(h.gas.events(h.email).some((e) => /^✅ 월세/.test(e.title)), '도중에 체크한 월세도 캘린더에 ✅로 반영됨');
  ok(h.calls.filter((c) => c.fn === 'api_sync').length >= 5, '서버를 여러 번 나눠서 부름 (' + h.calls.filter((c) => c.fn === 'api_sync').length + '번)');
  await h.close();
});
t('sync-server-lock', async () => {
  const g = require('./gas').create({}); const me = 'a@example.com';
  g.setNow('2026-10-02'); g.call(me, 'api_load', [false]);
  for (const it of H.SEEDS.full.items) g.call(me, 'api_save', ['', H.item(it)]);
  g.user(me).cache.cal_busy = { v: '1', exp: Date.now() + 9e9 };   // 다른 맞추기가 돌고 있는 상태
  const r = g.call(me, 'api_sync', [true]);
  ok(r.busy === true && r.more === true, '다른 맞추기가 도는 중이면 기다리라고 답함');
  const s = g.call(me, 'api_setChecks', [{ '넷플릭스': true }]);
  ok(s.ok === true && !s.busy && s.items.find((i) => i.name === '넷플릭스').checked === true, '그동안에도 체크 저장은 됨');
  delete g.user(me).cache.cal_busy;
  const old = g.call(me, 'api_sync', []);
  ok(old.more === false && g.events(me).length === 128, '옛 화면(끊어 부르지 않음)은 한 번에 다 넣음');
});

/* ---------- 꼭 9: 새 항목이 바로 보임 ---------- */
const listRow = (p, name) => p.evaluate((n) => { const r = document.querySelector('#list .row.tr[data-name="' + n + '"]'); return r ? { ghost: r.classList.contains('ghost'), txt: r.textContent } : null; }, name);
t('new-row-instant', async () => {
  const h = await H.open(Object.assign({}, LIFE, { latency: 1500 })); const p = h.page;
  await h.idle(2500);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 400);
  await p.fill('#nName', '수도요금'); await p.fill('#nAmt', '21000'); await p.fill('#nDay', '28');
  await p.press('#nDay', 'Enter');
  await sleep(p, 250);
  let r = await listRow(p, '수도요금');
  ok(r && r.ghost && /21,000/.test(r.txt) && /28일/.test(r.txt), '엔터 0.25초 뒤: 목록에 흐린 줄로 바로 보임 (서버 답은 1.5초 뒤)');
  await h.shot('t-ghost');
  await h.idle(2500);
  r = await listRow(p, '수도요금');
  ok(r && !r.ghost, '저장이 끝나면 진짜 줄로 바뀜');
  ok(h.gas.call(h.email, 'api_load', [true]).items.filter((i) => i.name === '수도요금').length === 1, '서버엔 한 번만 들어감');
  // 실패했다가 다시 시도
  await p.fill('#nName', '가스 점검비'); await p.fill('#nAmt', '5000'); await p.fill('#nDay', '29');
  h.failNext(1, 'api_save');
  await p.press('#nDay', 'Enter');
  await sleep(p, 2600);
  r = await listRow(p, '가스 점검비');
  const ts = await toastState(p);
  ok(!r && ts.on && ts.btn === '다시 시도', '저장 실패 → 흐린 줄이 사라지고 "다시 시도" 알림');
  await p.click('#toastBtn'); await sleep(p, 250);
  r = await listRow(p, '가스 점검비');
  ok(r && r.ghost, '"다시 시도" → 흐린 줄이 다시 보임');
  await h.idle(2500);
  ok(h.gas.call(h.email, 'api_load', [true]).items.filter((i) => i.name === '가스 점검비').length === 1, '이번엔 저장됨 (한 번만)');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});

/* ---------- 꼭 10: 개인정보 처리방침·약관 ---------- */
t('legal-pages', async () => {
  const h = await H.open(Object.assign({}, LIFE, { loggedOut: true })); const p = h.page;
  await p.waitForSelector('#fcLogin.on', { timeout: 8000 });
  const links = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#fcLogin .legal a'), (a) => ({ t: a.textContent, href: a.getAttribute('href'), vis: a.getBoundingClientRect().height > 0 })));
  ok(links.length === 2 && links.every((l) => l.vis), '로그인 화면에 링크 2개: ' + links.map((l) => l.t).join(', '));
  for (const f of ['privacy.html', 'terms.html']) {
    const rs = await p.request.get(h.base + f);
    const body = await rs.text();
    ok(rs.status() === 200 && /앱으로 돌아가기/.test(body) && /prefers-color-scheme: dark/.test(body), f + ' 열림, 돌아가기 링크·다크 모드 있음');
  }
  const pv = await (await p.request.get(h.base + 'privacy.html')).text();
  ok(/사용자별 저장 공간/.test(pv) && /내 구글 캘린더/.test(pv) && /GitHub Pages/.test(pv) && !/별도 서버에 사용자 정보를 저장하지 않아요/.test(pv), '처리방침이 실제 저장 방식대로 적혀 있음 (옛 틀린 문장 없음)');
  await p.click('#fcLogin .legal a[href="privacy.html"]'); await p.waitForLoadState('load');
  ok(/privacy\.html$/.test(p.url()), '로그인 화면에서 눌러서 열림');
  await p.click('#back'); await p.waitForLoadState('load'); await sleep(p, 300);
  ok(!/privacy\.html/.test(p.url()), '"앱으로 돌아가기"로 돌아옴');
  await h.close();
  const h2 = await H.open(LIFE); const p2 = h2.page;
  await sleep(p2, 1000);
  await p2.click('#menuBtn'); await sleep(p2, 400);
  const m = await p2.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#sheetBody a.li'), (a) => a.getAttribute('href')));
  ok(m.indexOf('privacy.html') >= 0 && m.indexOf('terms.html') >= 0, '⋯ 메뉴에도 링크 2개');
  // 목록 탭 → ⋯ → 이용약관 → 돌아오기 → 폰 뒤로 가기 한 번이면 앱 밖 (헛도는 뒤로 가기 없음)
  await p2.click('#sheetClose'); await sleep(p2, 400);
  await p2.click('.tabbar [data-tab="list"]'); await sleep(p2, 300);
  await p2.click('#menuBtn'); await sleep(p2, 400);
  await p2.click('#sheetBody a.li[href="terms.html"]');
  await p2.waitForURL(/terms\.html$/, { timeout: 5000 }).catch(() => {});
  ok(/terms\.html$/.test(p2.url()), '⋯ 메뉴에서 이용약관이 열림');
  await p2.click('#back'); await p2.waitForLoadState('load'); await h2.idle(600);
  ok(p2.url() === h2.base && (await homeHas(p2, '월세')), '"앱으로 돌아가기" → 앱 첫 화면(달력)이 다시 뜸');
  await p2.goBack().catch(() => {}); await sleep(p2, 300);
  ok(p2.url().indexOf(h2.base) !== 0, '거기서 폰 뒤로 가기 한 번이면 앱 밖으로 (' + p2.url() + ')');
  await h2.close();
});

/* ---------- 꼭 11: 다른 사이트에 끼워졌을 때 ---------- */
t('framed-hidden', async () => {
  const h = await H.open(Object.assign({}, LIFE, { noGo: true })); const p = h.page;
  await h.ctx.clock.resume();
  const outer = 'http://localhost:' + new URL(h.base).port + '/__outer';
  await p.goto(outer);
  await sleep(p, 1500);
  const fr = p.frames().find((f) => f.url().indexOf(h.base) === 0);
  if (!fr) { ok(p.url().indexOf(h.base) === 0, '틀을 깨고 앱 주소로 빠져나옴 (' + p.url() + ')'); await h.close(); return; }
  const st = await fr.evaluate(() => ({ display: getComputedStyle(document.documentElement).display, framed: window.FC_FRAMED === true, auth: typeof window.FC_AUTH }));
  ok(st.display === 'none' && st.framed, '틀 안에서는 화면이 통째로 숨겨짐');
  ok(st.auth === 'undefined' && h.calls.length === 0, '앱이 시작도 안 함 (로그인·서버 호출 0번)');
  await h.close();
});

/* ---------- 꼭 12: 자잘한 버그 ---------- */
t('small-form-button', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await p.click('#addBtn'); await sleep(p, 450);
  const nameId = await p.evaluate(() => document.querySelector('#sheetBody input[type="text"]').id);
  await p.fill('#' + nameId, '수도요금');
  await p.click('#saveBtn'); await sleep(p, 200);
  const btn = () => p.evaluate(() => document.getElementById('saveBtn').textContent);
  ok((await btn()) === '결제일 없이 추가', '결제일 없이 누르면 버튼이 "결제일 없이 추가"로');
  const dayId = await p.evaluate(() => Array.prototype.filter.call(document.querySelectorAll('#sheetBody select'), (s) => /매월 1일/.test(s.textContent))[0].id);
  await p.selectOption('#' + dayId, '28'); await sleep(p, 200);
  const warn = await p.evaluate(() => document.getElementById('formErr').className);
  ok((await btn()) === '추가' && !/on/.test(warn), '결제일을 고르면 버튼이 "추가"로 돌아오고 안내도 사라짐');
  await p.click('#saveBtn'); await h.idle(800);
  ok(srvItem(h, '수도요금').day === 28, '한 번에 저장됨');
  await h.close();
});
t('small-chip-toast-and-empty', async () => {
  const h = await H.open({ seed: 'empty', now: '2026-11-23T21:30', viewport: VP, latency: 60 }); const p = h.page;
  await sleep(p, 800);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 400);
  const empty = await p.evaluate(() => (document.querySelector('#list .empty') || {}).textContent || '');
  ok(/아직 넣은 고정비가 없어요/.test(empty) && !/다 냈어요/.test(empty), '항목이 0개일 때 문구: "' + empty + '"');
  await p.click('#addBtn'); await sleep(p, 450);
  await p.click('#sheetBody [data-addacc]'); await sleep(p, 200);
  await p.fill('#sheetBody .chipin input', '국민 월급통장');
  await p.click('#sheetBody .chipin .ok'); await h.idle(600);
  const ts = await toastState(p);
  ok(ts.txt === '국민 월급통장 저장했어요. 다음부터 눌러서 골라요', '결제 수단 바로 추가 알림: "' + ts.txt + '"');
  await h.close();
});
t('small-layout-320', async () => {
  const h = await H.open(Object.assign({}, LIFE, { viewport: SMALL })); const p = h.page;
  await sleep(p, 1200);
  await p.click('#addBtn'); await sleep(p, 450);
  await p.click('#sheetBody [data-seg] button[data-v="date"]'); await sleep(p, 400);
  await p.click('.dp.on .dpg button[data-d="20"]'); await sleep(p, 400);
  const d = await p.evaluate(() => { const b = document.querySelector('#sheetBody .wrapc .datebtn'); const r = b.getBoundingClientRect(); return { t: b.textContent, h: Math.round(r.height), cut: b.scrollWidth > b.clientWidth }; });
  ok(d.h <= 36 && !d.cut, '종료일 날짜가 한 줄로 다 보임: "' + d.t + '" (높이 ' + d.h + 'px)');
  await p.evaluate(() => document.querySelector('#sheetBody .wrapc').scrollIntoView({ block: 'center' }));
  await h.shot('t-form-320');
  await p.click('#sheetClose'); await sleep(p, 400);
  await p.click('#menuBtn'); await sleep(p, 400);
  const m = await p.evaluate(() => { const s = document.querySelector('#mCalNow small'); return s ? { t: s.textContent, cut: s.scrollWidth > s.clientWidth } : null; });
  ok(m && /총 \d+개 일정/.test(m.t) && !m.cut, '⋯ 메뉴의 캘린더 결과가 잘리지 않음: "' + (m && m.t) + '"');
  await h.shot('t-menu-320');
  await h.close();
});
t('small-token-expired', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1500);
  // 로그인 표(1시간짜리)가 만료된 상태에서 체크
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('fc_auth')); a.exp = Date.now() - 1000; localStorage.setItem('fc_auth', JSON.stringify(a)); });
  await p.click('#home .row[data-name="월세"] .chk');
  await p.waitForFunction(() => /fake1/.test(localStorage.getItem('fc_auth') || ''), null, { timeout: 8000 });
  ok(h.auths() === 1, '구글에 조용히 다녀옴 (화면이 새로 열림)');
  await h.idle(2500);
  ok(srvItem(h, '월세').checked === true, '다녀온 뒤에 하던 체크를 이어서 저장함');
  ok(!(await homeHas(p, '월세')), '화면에서도 낸 걸로');
  const ts = await toastState(p);
  ok(/이어서 했어요/.test(ts.txt), '이어서 했다고 알려줌: "' + ts.txt + '"');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});


/* ====================== 추천 기능 3개 (서버 v9) ====================== */
const GAS = require('./gas');
const ME = 'a@example.com';
const add = (g, o) => { const r = g.call(ME, 'api_save', ['', H.item(o)]); if (!r.ok) throw new Error('add ' + o.n + ': ' + r.error); return r; };
const sItem = (g, n) => g.call(ME, 'api_load', [true]).items.find((i) => i.name === n);
const kday = (e) => new Date(e.start.getTime() + 9 * 3600000).toISOString().slice(0, 10);   // 일정 날짜 (한국 시간)
const rem = (e) => JSON.stringify(e.reminders) + '/' + (e.tags.fixedcostRemind || '');

/* ---------- 자동이체 자동 체크 (서버) ---------- */
t('auto-check-server', async () => {
  const g = GAS.create({ holidays: { '2026-12-25': '크리스마스' } });
  g.setNow('2026-08-03'); g.call(ME, 'api_load', [false]);
  add(g, { n: '월세', amt: 650000, day: 25, auto: 'O', start: '2026-08-25' });
  add(g, { n: '카드값', amt: 100000, day: 25, start: '2026-08-25' });
  add(g, { n: '적금', amt: 500000, day: 1, auto: 'O', start: '2026-09-01', end: '2026-10-01' });
  add(g, { n: '분기보험', amt: 90000, day: 10, cyc: '분기(3개월)', start: '2026-08-10', auto: 'O' });
  add(g, { n: '관리비', amt: 120000, day: 20, method: '자동이체', start: '2026-08-20' });            // 자동이체 칸은 비우고 결제 방식만
  add(g, { n: '수동 관리비', amt: 50000, day: 20, method: '자동이체', auto: 'X', start: '2026-08-20' });
  g.setNow('2026-08-26'); g.call(ME, 'api_setChecks', [{ '월세': true, '카드값': true, '분기보험': true, '관리비': true, '수동 관리비': true }]);
  g.setNow('2026-09-02'); g.call(ME, 'api_setChecks', [{ '적금': true }]);
  g.setNow('2026-11-23T21:30');
  let r = g.call(ME, 'api_load', [false]);
  ok(r.ver === 9 && r.opts && r.opts.auto === false && r.opts.remind === false, '서버 v9, 두 설정 모두 처음엔 꺼져 있음');
  ok(sItem(g, '월세').paid === '2026-08-25' && !(r.notes || []).some((n) => /자동이체/.test(n)), '꺼져 있으면 아무것도 자동으로 체크 안 함');

  r = g.call(ME, 'api_opts', [{ auto: true }]);
  ok(r.ok && r.opts.auto === true, '켜기 저장됨');
  let w = sItem(g, '월세');
  ok(w.paid === '2026-10-25' && w.checked === false && w.next === '2026-11-25', '석 달 밀린 월세: 9·10월분은 냄 처리, 아직 안 온 11/25는 그대로 (' + w.paid + ' / 다음 ' + w.next + ')');
  ok(sItem(g, '카드값').paid === '2026-08-25', '자동이체가 아닌 항목은 안 건드림');
  ok(sItem(g, '적금').paid === '2026-10-01', '종료일(10/1)까지만 냄 처리');
  const q = sItem(g, '분기보험');
  ok(q.checked === true && q.paid === '2026-11-10' && q.next === '2027-02-10', '분기 결제도 지난 결제일(11/10)이 냄 처리됨');
  ok(sItem(g, '관리비').paid === '2026-11-20', '자동이체 칸이 비어 있어도 결제 방식이 자동이체면 대상 (관리비 11/20)');
  ok(sItem(g, '수동 관리비').paid === '2026-08-20', '자동이체를 X로 적은 항목은 결제 방식이 자동이체여도 제외');
  ok((r.notes || []).some((n) => /^자동이체 4건을 냈다고 체크했어요: /.test(n)), '무엇을 체크했는지 알려줌: ' + JSON.stringify(r.notes));

  // 직접 푼 결제일은 다시 자동으로 체크하지 않음
  g.call(ME, 'api_setChecks', [{ '분기보험': false }]);
  g.setNow('2026-11-24T09:00'); r = g.call(ME, 'api_load', [false]);
  ok(sItem(g, '분기보험').checked === false && sItem(g, '분기보험').next === '2026-11-10', '직접 체크를 푼 결제(분기보험 11/10)는 다음 날 열어도 그대로 안 냄');
  g.call(ME, 'api_setChecks', [{ '분기보험': true }]);
  ok(sItem(g, '분기보험').paid === '2026-11-10' && (g.user(ME).props.auto_skip || '{}') === '{}', '다시 직접 체크하면 기록이 지워짐');

  // 결제일 당일은 안 건드리고 다음 날 체크
  g.setNow('2026-11-25T23:50'); g.call(ME, 'api_load', [false]);
  ok(sItem(g, '월세').checked === false, '결제일 당일(11/25 밤)엔 아직 안 냄');
  g.setNow('2026-11-26T00:10'); r = g.call(ME, 'api_load', [false]);
  w = sItem(g, '월세');
  ok(w.checked === true && w.paid === '2026-11-25' && (r.notes || []).join(' ').indexOf('월세') >= 0, '다음 날(11/26) 열면 냄 처리 + 알림');

  // 풀어 둔 채 달이 바뀌어도 그 결제는 그대로, 직접 체크하면 그다음 결제부터 다시 자동
  g.call(ME, 'api_setChecks', [{ '월세': false }]);
  g.setNow('2026-12-29T09:00'); g.call(ME, 'api_load', [false]);
  ok(sItem(g, '월세').next === '2026-11-25' && sItem(g, '월세').checked === false, '풀어 둔 11월 월세는 한 달 뒤에도 안 낸 채로 남음');
  r = g.call(ME, 'api_setChecks', [{ '월세': true }]);
  w = sItem(g, '월세');
  ok(w.paid === '2026-12-25' && w.checked === true, '11월분을 직접 체크하면 지난 12월분(12/25)은 자동으로 이어서 냄 처리');
  ok((r.notes || []).filter((n) => /월세/.test(n)).length === 1, '알림은 한 번만: ' + JSON.stringify(r.notes));

  // 끄면 더는 안 함
  r = g.call(ME, 'api_opts', [{ auto: false }]);
  g.setNow('2027-01-27T09:00'); g.call(ME, 'api_load', [false]);
  ok(r.opts.auto === false && sItem(g, '월세').paid === '2026-12-25' && g.user(ME).props.auto_skip === undefined, '끄면 1월분은 자동으로 체크 안 함, 기록도 지움');
});
t('auto-check-holiday', async () => {
  // 결제일이 주말·공휴일이면 다음 영업일까지 기다림 (2026-11-21 토, 12-25 금 크리스마스)
  const g = GAS.create({ holidays: { '2026-12-25': '크리스마스' } });
  g.setNow('2026-11-02'); g.call(ME, 'api_load', [false]);
  add(g, { n: '보험', amt: 48200, day: 21, auto: 'O', start: '2026-11-21' });
  add(g, { n: '통신비', amt: 69000, day: 25, auto: 'O', start: '2026-11-25' });
  g.call(ME, 'api_opts', [{ auto: true }]);
  g.setNow('2026-11-22T10:00'); g.call(ME, 'api_load', [false]);
  ok(sItem(g, '보험').checked === false, '토요일(11/21) 결제: 일요일엔 아직 안 냄');
  g.setNow('2026-11-23T23:00'); g.call(ME, 'api_load', [false]);
  ok(sItem(g, '보험').checked === false, '다음 영업일(월 11/23) 당일에도 아직 안 냄');
  g.setNow('2026-11-24T00:30'); g.call(ME, 'api_load', [false]);
  ok(sItem(g, '보험').checked === true && sItem(g, '보험').paid === '2026-11-21', '화요일(11/24)에 냄 처리, 기록은 원래 결제일(11/21)');
  g.setNow('2026-11-26T10:00'); g.call(ME, 'api_load', [false]);
  ok(sItem(g, '통신비').paid === '2026-11-25', '평일(수 11/25) 결제는 다음 날 냄 처리');
  g.setNow('2026-12-27T10:00'); g.call(ME, 'api_load', [false]);
  ok(sItem(g, '통신비').paid === '2026-11-25' && sItem(g, '통신비').next === '2026-12-25', '크리스마스(금 12/25) 결제: 일요일(12/27)엔 아직 안 냄');
  // 새벽 예약 실행은 목록을 안 바꿈 (앱에서 한 저장과 겹치지 않게). 앱을 열 때 체크하고, 이어서 캘린더에 ✅
  g.call(ME, 'api_sync', []);
  const before = JSON.stringify(Object.keys(g.user(ME).props).filter((k) => /^vs_data/.test(k)).sort().map((k) => g.user(ME).props[k]));
  g.setNow('2026-12-29T04:10'); g.call(ME, 'calendarDaily', []);
  const after = JSON.stringify(Object.keys(g.user(ME).props).filter((k) => /^vs_data/.test(k)).sort().map((k) => g.user(ME).props[k]));
  ok(before === after, '새벽 예약 실행은 저장된 목록을 건드리지 않음');
  g.setNow('2026-12-29T08:00'); g.call(ME, 'api_load', [false]);
  ok(sItem(g, '통신비').paid === '2026-12-25', '다음 영업일(월 12/28) 다음 날 앱을 열면 냄 처리');
  g.call(ME, 'api_sync', []);
  ok(g.events(ME).some((e) => kday(e) === '2026-12-25' && /^✅ 통신비/.test(e.title)), '캘린더 일정에도 ✅가 붙음');
});

/* ---------- 결제 전날 알림 (서버) ---------- */
t('remind-server', async () => {
  const g = GAS.create({}); g.setNow('2026-10-02'); g.call(ME, 'api_load', [false]);
  for (const it of H.SEEDS.full.items) add(g, it);
  require('./seedlife')(g, ME);
  g.setNow('2026-11-23T21:30'); g.call(ME, 'api_load', [false]); g.call(ME, 'api_sync', []);
  const total = g.events(ME).length;
  ok(total > 100 && g.events(ME).every((e) => e.reminders === null && !e.tags.fixedcostRemind), '꺼져 있으면 일정 알림을 안 건드림 (일정 ' + total + '개)');
  g.call(ME, 'api_setChecks', [{ '월세': true }]);          // 11/25 월세를 미리 냄
  ok(g.call(ME, 'api_opts', [{ remind: true }]).opts.remind === true, '켜기 저장됨');
  let n = 0, last, prog = [];
  do { last = g.call(ME, 'api_sync', [true]); n++; prog.push(last.done + '/' + last.total); } while (last.more && n < 40);
  ok(n >= 3 && !last.more && last.done === last.total, '알림 붙이기도 끊어서 하고 진행 숫자가 올라감: ' + prog.join(' → '));
  const fut = g.events(ME).filter((e) => kday(e) > '2026-11-23'), past = g.events(ME).filter((e) => kday(e) <= '2026-11-23');
  const paidFut = fut.filter((e) => /^✅/.test(e.title));
  ok(fut.filter((e) => !/^✅/.test(e.title)).every((e) => rem(e) === '[900]/900'), '내일 이후 안 낸 결제 ' + (fut.length - paidFut.length) + '개 전부 전날 오전 9시(900분 전) 알림');
  ok(paidFut.length === 1 && rem(paidFut[0]) === '[]/none', '미리 낸 결제(11/25 월세)는 알림을 뺌');
  ok(past.length > 0 && past.every((e) => e.reminders === null), '오늘·지난 결제 ' + past.length + '개는 안 건드림');
  const again = g.call(ME, 'api_sync', [true]);
  ok(/수정 0/.test(again.msg) && !again.more, '다시 맞춰도 바뀌는 게 없음');
  g.call(ME, 'api_setChecks', [{ '월세': false }]); g.call(ME, 'api_sync', []);
  ok(rem(g.events(ME).find((e) => kday(e) === '2026-11-25' && /월세/.test(e.title))) === '[900]/900', '체크를 풀면 알림이 다시 붙음');
  add(g, { n: '새 구독', amt: 9900, day: 28, start: '2026-11-28' }); g.call(ME, 'api_sync', []);
  ok(g.events(ME).filter((e) => /새 구독/.test(e.title)).length >= 12 && g.events(ME).filter((e) => /새 구독/.test(e.title)).every((e) => rem(e) === '[900]/900'), '새로 넣은 항목의 일정에도 알림이 붙음');
  g.call(ME, 'api_opts', [{ remind: false }]);
  n = 0; do { last = g.call(ME, 'api_sync', [true]); n++; } while (last.more && n < 40);
  ok(g.events(ME).every((e) => e.reminders === null && !e.tags.fixedcostRemind), '끄면 붙였던 알림을 전부 캘린더 기본으로 되돌림');
});

/* ---------- 첫 화면 요약 ---------- */
const heroOf = (p) => p.evaluate(() => {
  const e = document.getElementById('sumline'), n = e.querySelector('.num'), i = e.querySelector('.bar i');
  const nd = document.getElementById('nodate').getBoundingClientRect(), c = document.getElementById('cal').getBoundingClientRect(), r = e.getBoundingClientRect();
  return { shown: getComputedStyle(e).display !== 'none' && r.height > 0, lb: (e.querySelector('.lb') || {}).textContent || '', num: n ? n.textContent : '', fs: n ? getComputedStyle(n).fontSize : '',
    bar: i ? i.style.width : '', cp: (e.querySelector('.cp') || {}).textContent || '', order: nd.top <= r.top && r.bottom <= c.top + 0.5 };
});
t('home-hero', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1500);
  let v = await heroOf(p);
  ok(v.shown && v.lb === '11월에 더 낼 돈' && v.num === '1,191,790원' && v.fs === '28px', '맨 위에 큰 숫자: ' + v.lb + ' ' + v.num + ' (' + v.fs + ')');
  ok(v.bar === '32.7%' && v.cp === '580,100원 냈어요전체 1,771,890원', '막대는 낸 비율(' + v.bar + '), 아래 줄: ' + v.cp);
  ok(v.order, '자리는 날짜 없는 항목 알림 아래, 달력 위');
  await h.shot('t-hero');
  await p.click('#home .row[data-name="월세"] .chk'); await sleep(p, 300);
  v = await heroOf(p);
  ok(v.num === '541,790원' && v.bar === '69.4%' && /1,230,100원 냈어요/.test(v.cp), '체크하면 바로 줄어듦: ' + v.num + ' · ' + v.bar);
  await h.idle(1500);
  await p.click('#calNext'); await sleep(p, 300);
  v = await heroOf(p);
  ok(v.lb === '12월에 더 낼 돈' && v.bar === '0%' && /^0원 냈어요/.test(v.cp), '다음 달로 넘기면 그 달 기준: ' + v.lb + ' ' + v.num);
  await p.click('#calPrev'); await p.click('#calPrev'); await sleep(p, 300);
  v = await heroOf(p);
  ok(v.lb === '10월에 더 낼 돈' && v.num === '0원' && v.bar === '100%', '다 낸 달은 0원에 막대가 가득: ' + v.lb + ' ' + v.num + ' ' + v.bar);
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
  const e = await H.open({ seed: 'empty', now: '2026-11-23T21:30', viewport: VP, latency: 60 });
  await sleep(e.page, 800);
  ok(!(await heroOf(e.page)).shown, '항목이 없으면 요약 카드는 숨김');
  await e.close();
});

/* ---------- ⋯ 메뉴의 켜고 끄기 2줄 ---------- */
const swOn = (p, id) => p.evaluate((i) => { const b = document.getElementById(i); return b ? b.querySelector('.switch').classList.contains('on') : null; }, id);
t('menu-opts', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1500);
  await p.click('#menuBtn'); await sleep(p, 450);
  ok((await swOn(p, 'mRemind')) === false && (await swOn(p, 'mAuto')) === false, '⋯ 메뉴에 "결제 전날 알림", "자동이체 자동 체크"가 꺼진 채로 보임');
  const size = await p.evaluate(() => ['mRemind', 'mAuto'].map((i) => Math.round(document.getElementById(i).getBoundingClientRect().height)));
  ok(size.every((x) => x >= 44), '누르는 줄 높이 ' + size.join('·') + 'px (44 이상)');
  await p.click('#mAuto'); await sleep(p, 120);
  ok((await swOn(p, 'mAuto')) === true, '누르면 스위치가 바로 켜짐');
  await h.idle(700);
  let ts = await toastState(p);
  ok(/자동이체 자동 체크를 켰어요/.test(ts.txt) && /정수기 렌탈/.test(ts.txt), '켰다는 알림 + 방금 체크한 항목: ' + JSON.stringify(ts.txt));
  ok(srvItem(h, '정수기 렌탈').checked === true && srvItem(h, '월세').checked === false, '서버: 지난 자동이체(정수기 11/20)는 냄, 모레 월세(11/25)는 그대로');
  await p.click('#mRemind'); await h.idle(500);
  ok((await swOn(p, 'mRemind')) === true, '결제 전날 알림 켜짐');
  for (let i = 0; i < 80 && h.gas.events(h.email).some((e) => kday(e) > '2026-11-23' && !e.tags.fixedcostRemind); i++) await sleep(p, 250);
  await h.idle(800);
  const fut = h.gas.events(h.email).filter((e) => kday(e) > '2026-11-23');
  ok(fut.length > 100 && fut.every((e) => /^✅/.test(e.title) ? rem(e) === '[]/none' : rem(e) === '[900]/900'), '캘린더 일정 ' + fut.length + '개에 알림이 붙음 (낸 결제는 뺌)');
  await h.shot('t-menu-opts');
  await p.evaluate(() => history.back()); await sleep(p, 500);
  ok(!(await homeHas(p, '정수기 렌탈')) && (await heroOf(p)).num === '1,161,890원', '첫 화면: 정수기 렌탈이 안 낸 결제에서 빠지고 더 낼 돈도 줄어듦');
  // 새로 열어도 그대로
  await p.reload(); await h.idle(1500);
  await p.click('#menuBtn'); await sleep(p, 450);
  ok((await swOn(p, 'mRemind')) === true && (await swOn(p, 'mAuto')) === true, '앱을 다시 열어도 두 설정이 켜져 있음');
  // 연결이 끊겼을 때: 스위치가 되돌아오고 다시 시도할 수 있음
  h.failNext(3, 'api_opts');
  await p.click('#mAuto'); await sleep(p, 6500);
  ts = await toastState(p);
  ok((await swOn(p, 'mAuto')) === true && h.gas.call(h.email, 'api_load', [true]).opts.auto === true, '저장 못 하면 스위치가 원래대로(켜짐) 돌아옴');
  ok(ts.on && /저장 못 했어요/.test(ts.txt) && ts.btn === '다시 시도', '실패 알림 + 다시 시도: ' + JSON.stringify(ts.txt));
  await p.click('#toastBtn'); await h.idle(900);
  ok((await swOn(p, 'mAuto')) === false && h.gas.call(h.email, 'api_load', [true]).opts.auto === false, '"다시 시도"를 누르면 꺼짐이 저장됨');
  // 캘린더 연동을 끄면 알림 줄은 숨김
  await p.click('#mCal'); await sleep(p, 300); await p.click('#mCal'); await h.idle(900);
  ok((await swOn(p, 'mRemind')) === null && (await swOn(p, 'mAuto')) === false, '캘린더 연동을 끄면 알림 줄은 안 보이고 자동 체크 줄은 남음');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});
t('opts-old-server', async () => {
  // 서버를 아직 안 올린 상태(v8): 새 화면이 그대로 동작하고, 서버에 없는 기능 줄은 안 보여줌
  const fs = require('fs'), os = require('os'), path = require('path');
  const v8 = fs.readFileSync(path.join(__dirname, '..', 'setup', 'Code.gs.txt'), 'utf8')
    .replace('var SERVER_VER = 9;', 'var SERVER_VER = 8;').replace('res.opts = appOpts_();', '').replace('function api_opts(', 'function api_opts_gone_(');
  const f = path.join(os.tmpdir(), 'fc-code-v8-' + process.pid + '.txt'); fs.writeFileSync(f, v8);
  const gas = GAS.create({ code: f });
  const h = await H.open(Object.assign({}, LIFE, { gas })); const p = h.page;
  await sleep(p, 1500);
  const st = h.gas.call(h.email, 'api_load', [true]);
  ok(st.ver === 8 && st.opts === undefined, '가짜 옛 서버 준비됨 (v8, 설정 없음)');
  ok((await heroOf(p)).num === '1,191,790원', '첫 화면 요약은 옛 서버에서도 그대로 나옴');
  await p.click('#menuBtn'); await sleep(p, 450);
  ok((await swOn(p, 'mRemind')) === null && (await swOn(p, 'mAuto')) === null, '옛 서버에선 새 설정 줄 2개를 안 보여줌');
  ok(await p.evaluate(() => !!document.getElementById('mCal') && !!document.getElementById('mAcc')), '나머지 메뉴는 그대로');
  await p.evaluate(() => history.back()); await sleep(p, 500);
  await p.click('#home .row[data-name="월세"] .chk'); await h.idle(1500);
  ok(srvItem(h, '월세').checked === true, '체크 저장도 그대로 됨');
  ok(!h.calls.some((c) => c.fn === 'api_opts') && realErrors(h).length === 0, '없는 기능을 부르지 않음, 화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close(); fs.unlinkSync(f);
});


(async () => {
  const only = process.argv.slice(2);
  const t0 = Date.now();
  for (const c of cases) {
    if (only.length && !only.some((o) => c.name.indexOf(o) >= 0)) continue;
    cur = c.name;
    console.log('▶ ' + c.name);
    try { await c.fn(); } catch (e) { fails++; console.log('    ✗ 검사 중 오류: ' + (e && e.stack || e)); }
  }
  console.log('\n' + (fails ? '실패 ' + fails + '건' : '전부 통과') + ' (' + Math.round((Date.now() - t0) / 1000) + '초)');
  process.exit(fails ? 1 : 0);
})();
