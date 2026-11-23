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
  await p.click('#moreBtn'); await sleep(p, 250);
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
  // 0.5px만 넘쳐도 말줄임(…)이 생기니 글자 실제 폭으로 잼
  const sumCut = (pg) => pg.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#sumline b'), (b) => { const r = document.createRange(); r.selectNodeContents(b); return { t: b.textContent, fs: getComputedStyle(b).fontSize, cut: b.scrollWidth > b.clientWidth || r.getBoundingClientRect().width > b.getBoundingClientRect().width + 0.05 }; }));
  const sum = await sumCut(p);
  ok(sum.length === 3 && sum.every((x) => !x.cut), '합계 세 칸이 말줄임(…) 없이 다 보임: ' + sum.map((x) => x.t).join(' / '));
  ok(sum.every((x) => x.fs === sum[0].fs), '합계 세 칸 글자 크기가 서로 같음 (' + sum[0].fs + ')');
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
  ok(names.every((x) => x.h >= 44 && x.h <= 48), '줄 높이 44~48px (누르기 쉬운 최소 높이, 가장 높은 줄 ' + Math.max.apply(null, names.map((x) => x.h)) + 'px)');
  await h.shot('t-list-320');
  await h.close();
  // 평범한 금액(백만 원대)도 폭 320에서 잘리지 않아야 함 (0.4px 넘쳐서 "1,191,79…"로 보이던 것)
  for (const dark of [false, true]) {
    const h2 = await H.open(Object.assign({}, LIFE, { viewport: SMALL, dark }));
    await sleep(h2.page, 1500);
    const s2 = await sumCut(h2.page);
    ok(s2.length === 3 && s2.every((x) => !x.cut) && s2[2].t === '1,191,790원' && s2.every((x) => x.fs === s2[0].fs), '보통 금액 합계도 안 잘리고 크기가 같음' + (dark ? ' (다크)' : '') + ': ' + s2.map((x) => x.t).join(' / ') + ' · ' + s2[0].fs);
    await h2.close();
  }
});

/* ---------- 꼭 6: 지난달 달력 (서버 v8: 시작일 채우기) ---------- */
t('last-month-calendar', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  const st = h.gas.call(h.email, 'api_load', [true]);
  ok(st.ver === 8, '서버 v8');
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
  await p.click('#dayBtn'); await sleep(p, 400);
  ok(await p.evaluate(() => !!document.querySelector('.dayp.on')), '결제일 칸을 누르면 숫자판이 뜸');
  await p.click('.dayp .dg button[data-d="28"]'); await sleep(p, 400);
  ok(await p.evaluate(() => !document.querySelector('.dayp.on') && /매월 28일/.test(document.getElementById('dayTxt').textContent)), '28을 누르면 숫자판이 닫히고 "매월 28일"로 보임');
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
  await p.click('#moreBtn'); await sleep(p, 250);
  await p.click('#sheetBody [data-seg] button[data-v="date"]'); await sleep(p, 400);
  await p.click('.dp.on .dpg button[data-d="20"]'); await sleep(p, 400);
  const d = await p.evaluate(() => { const b = document.querySelector('#sheetBody .wrapc .datebtn'); const r = b.getBoundingClientRect(); return { t: b.textContent, h: Math.round(r.height), cut: b.scrollWidth > b.clientWidth }; });
  ok(d.h <= 44 && !d.cut, '종료일 날짜가 한 줄로 다 보임: "' + d.t + '" (높이 ' + d.h + 'px)');
  await p.evaluate(() => document.querySelector('#sheetBody .wrapc').scrollIntoView({ block: 'center' }));
  await h.shot('t-form-320');
  await p.click('#sheetClose'); await sleep(p, 400);
  await p.click('#menuBtn'); await sleep(p, 400);
  await p.click('#mCalNow'); await h.idle(1500);
  const m = await p.evaluate(() => { const s = document.querySelector('#mCalNow .r'); return s ? { t: s.textContent, cut: s.scrollWidth > s.clientWidth } : null; });
  ok(m && /맞췄어요/.test(m.t) && !m.cut, '⋯ 메뉴의 캘린더 상태가 잘리지 않음: "' + (m && m.t) + '"');
  const mt = await toastState(p);
  ok(/총 \d+개 일정/.test(mt.txt), '"지금 다시 맞추기" 결과를 알림으로 알려줌: "' + mt.txt + '"');
  await h.shot('t-menu-320');
  await h.close();
});
/* ---------- 디자인 개편(1~20번) ---------- */
t('revamp-home', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  const secs = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#home .sec h2, #home .sec .t'), (e) => e.textContent));
  const txt = await p.evaluate(() => document.getElementById('home').textContent);
  ok(/지난 결제/.test(txt) && /다가오는 결제/.test(txt), '첫 화면이 "지난 결제"와 "다가오는 결제"로 나뉨 ' + JSON.stringify(secs));
  ok(await p.evaluate(() => !!document.querySelector('#ndBtn') && /결제일 없는 항목 2개/.test(document.getElementById('ndBtn').textContent)), '결제일 없는 항목 알림이 맨 위 한 줄로');
  const cal = await p.evaluate(() => ({ paid: document.querySelectorAll('#cal .a.paid').length, over: document.querySelectorAll('#cal .a.over').length, dot: document.querySelectorAll('#cal .dot').length }));
  ok(cal.paid >= 1 && cal.over >= 1 && cal.dot === 0, '달력: 다 낸 날은 초록 체크, 지난 날은 빨간 금액, 점 표시는 없음 ' + JSON.stringify(cal));
  // 낸 결제는 한 줄로 접혀 있고, 누르면 펼쳐짐
  ok(!(await homeHas(p, '넷플릭스')) && /낸 결제 \d+건/.test(await p.evaluate(() => document.getElementById('paidFold').textContent)), '낸 결제는 한 줄로 접혀 있음');
  await p.click('#paidFold'); await sleep(p, 300);
  ok(await homeHas(p, '넷플릭스'), '누르면 낸 결제가 펼쳐짐');
  await p.click('#paidFold'); await sleep(p, 300);
  // 모두 냈어요
  const lateNames = ['헬스장', '쿠팡 와우 멤버십', '통신비', '정수기 렌탈'];
  ok(lateNames.every((n) => srvItem(h, n).checked === false), '지난 결제 4개가 아직 안 낸 상태');
  await p.click('#payAll'); await h.idle(2500);
  const ts = await toastState(p);
  ok(/^\d+건 냈다고 체크했어요$/.test(ts.txt) && ts.btn === '되돌리기', '"모두 냈어요" → 알림 "' + ts.txt + '" + 되돌리기');
  ok(lateNames.every((n) => srvItem(h, n).checked === true), '지난 결제가 서버에도 전부 냈다고 저장됨');
  ok(srvItem(h, '월세').checked === false, '아직 안 지난 월세는 건드리지 않음');
  await p.click('#toastBtn'); await h.idle(2500);
  ok(lateNames.every((n) => srvItem(h, n).checked === false), '되돌리기 → 전부 다시 안 낸 상태로');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});
t('revamp-list-and-form', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 400);
  const avg = h.gas.call(h.email, 'api_load', [true]).sum.monthlyAvg;
  const ct = await p.evaluate(() => document.getElementById('countTxt').textContent);
  ok(ct.indexOf('한 달 평균 ' + avg.toLocaleString('en-US') + '원') >= 0, '목록 맨 위 한 달 평균이 서버 값과 같음: "' + ct + '"');
  ok(await p.evaluate(() => document.querySelectorAll('#list .th').length === 1), '표 머리글(항목·금액·결제일)은 맨 위 한 번만');
  // 새 항목: 꼭 필요한 칸만 보이고 나머지는 "더 적기"에
  await p.click('#addBtn'); await sleep(p, 450);
  const f0 = await p.evaluate(() => ({ more: document.getElementById('moreBox').classList.contains('on'), seg: document.querySelectorAll('[data-cyc] button').length, foot: !!document.querySelector('#sheetFoot #saveBtn'), h: Math.round(document.getElementById('saveBtn').getBoundingClientRect().height) }));
  ok(!f0.more && f0.seg === 5 && f0.foot && f0.h >= 48, '새 항목: 더 적기는 접혀 있고, 주기 버튼 5개, 추가 버튼은 아래에 고정 ' + JSON.stringify(f0));
  await p.fill('#sheetBody [data-money]', '1234567'); await sleep(p, 150);
  ok((await p.inputValue('#sheetBody [data-money]')) === '1,234,567', '금액은 쉼표를 찍어서 크게 보여줌');
  // 결제일 숫자판 → 뒤로 가기는 숫자판만 닫음
  await p.click('#dayBtn'); await sleep(p, 400);
  ok(await p.evaluate(() => !!document.querySelector('.dayp.on')), '결제일 숫자판이 뜸');
  await back(p);
  ok(!(await p.evaluate(() => !!document.querySelector('.dayp.on'))) && (await sheetOn(p)), '뒤로 가기 → 숫자판만 닫히고 양식은 그대로');
  await p.click('#dayBtn'); await sleep(p, 400);
  await p.click('.dayp .eom'); await sleep(p, 400);
  ok(/말일/.test(await p.evaluate(() => document.getElementById('dayTxt').textContent)), '"말일"을 고를 수 있음');
  // 매년으로 바꾸면 날짜를 고르게 됨
  await p.click('[data-cyc] button[data-v="매년"]'); await sleep(p, 300);
  ok((await p.evaluate(() => document.getElementById('dayLbl').textContent)) === '다음 결제일', '매년으로 바꾸면 칸 이름이 "다음 결제일"로');
  await p.click('#dayBtn'); await sleep(p, 400);
  ok(await p.evaluate(() => !!document.querySelector('.dp.on:not(.dayp)')), '이때는 달력으로 날짜를 고름');
  await back(p);
  await p.evaluate(() => { try { localStorage.removeItem('fc_draft'); } catch (e) {} });
  await p.click('#sheetClose'); await sleep(p, 400);
  await p.evaluate(() => { try { localStorage.removeItem('fc_draft'); } catch (e) {} });
  // 고칠 때는 더 적기가 펼쳐져 있음
  await p.click('#list .row.tr .tc.nmc'); await sleep(p, 400);
  await p.click('#list [data-act="edit"]'); await sleep(p, 500);
  ok(await p.evaluate(() => document.getElementById('moreBox').classList.contains('on')), '고칠 때는 더 적기가 펼쳐져 있음 (칸이 숨지 않음)');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});
t('revamp-empty-and-login', async () => {
  const h = await H.open({ seed: 'empty', now: '2026-11-23T21:30', viewport: VP, latency: 60 }); const p = h.page;
  await sleep(p, 800);
  const chips = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#welcome [data-preset]'), (b) => b.textContent.trim()));
  ok(chips.length >= 6 && chips.indexOf('월세') >= 0, '처음 쓰는 화면에 자주 쓰는 항목 버튼: ' + chips.join(', '));
  await p.click('#welcome [data-preset="4"]'); await sleep(p, 600);
  const nm = await p.evaluate(() => document.querySelector('#sheetBody .fld input[type="text"]').value);
  ok((await sheetOn(p)) && nm === chips[4], '버튼을 누르면 이름이 채워진 새 항목 창이 뜸 ("' + nm + '")');
  await p.fill('#sheetBody [data-money]', '17000');
  await p.click('#dayBtn'); await sleep(p, 400); await p.click('.dayp .dg button[data-d="3"]'); await sleep(p, 400);
  await p.click('#saveBtn'); await h.idle(1500);
  ok((srvItem(h, chips[4]) || {}).day === 3, '금액·결제일만 적고 저장됨');
  ok(await p.evaluate(() => !document.querySelector('#welcome [data-preset]')), '항목이 생기면 처음 안내는 사라짐');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
  const h2 = await H.open(Object.assign({}, LIFE, { loggedOut: true })); const p2 = h2.page;
  await sleep(p2, 600);
  const lg = await p2.evaluate(() => { const b = document.getElementById('fcGo'); return { t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), h1: document.querySelector('#fcLogin h1').textContent, li: document.querySelectorAll('#fcLogin li').length }; });
  ok(lg.t === '구글 계정으로 시작하기' && lg.h >= 48 && lg.li === 3, '로그인 화면: 한 줄 소개 + 할 수 있는 일 3가지 + 큰 시작 버튼 ' + JSON.stringify(lg));
  await h2.close();
});
t('revamp-tap-size', async () => {
  // 누르는 곳은 높이 44px 이상 (작으면 폰에서 잘못 눌림)
  for (const vp of [VP, SMALL]) {
    const h = await H.open(Object.assign({}, LIFE, { viewport: vp })); const p = h.page;
    await sleep(p, 1200);
    const small = (pg) => pg.evaluate(() => Array.prototype.filter.call(document.querySelectorAll('button, a, [role="button"], select, input'), (e) => { const r = (e.closest('.inp') || e).getBoundingClientRect();   /* 큰 입력 칸은 감싼 상자 전체가 눌림 */ if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') return false; if (e.type === 'hidden') return false; return r.height < 43.5; }).map((e) => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height)));
    const a = await small(p);
    ok(a.length === 0, '폭 ' + vp.width + ' 첫 화면: 44px보다 낮은 버튼 0개 ' + JSON.stringify(a.slice(0, 6)));
    await p.click('.tabbar [data-tab="list"]'); await sleep(p, 400);
    const b = await small(p);
    ok(b.length === 0, '폭 ' + vp.width + ' 목록: 44px보다 낮은 버튼 0개 ' + JSON.stringify(b.slice(0, 6)));
    await p.click('#addBtn'); await sleep(p, 500);
    const c = await small(p);
    ok(c.length === 0, '폭 ' + vp.width + ' 새 항목 창: 44px보다 낮은 버튼 0개 ' + JSON.stringify(c.slice(0, 6)));
    await p.evaluate(() => { try { localStorage.removeItem('fc_draft'); } catch (e) {} });
    await h.close();
  }
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
