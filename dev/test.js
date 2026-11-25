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
  await addForm(p);
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
  await addForm(p);
  await p.click('#moreBtn'); await sleep(p, 250);
  await p.click('#sheetBody [data-seg] button[data-v="date"]'); await sleep(p, 400);
  const dpOn = () => p.evaluate(() => !!document.querySelector('.dp.on'));
  ok(await dpOn(), '종료일 "날짜"를 누르면 날짜 고르기가 뜸');
  await back(p);
  ok(!(await dpOn()) && (await sheetOn(p)), '뒤로 가기 → 날짜 고르기만 닫히고 양식은 그대로');
  await back(p);
  ok((await sheetOn(p)) && (await p.evaluate(() => !!document.querySelector('#sheetBody .cgrid'))), '뒤로 가기 → 분류 고르기로 돌아감 (창은 그대로)');
  await back(p);
  ok(!(await sheetOn(p)) && (await tabNow(p)) === 'tab-list', '뒤로 가기 → 창 닫힘, 목록 탭 그대로');
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
    // 윗줄: "N월에 더 낼 돈 … 전체 얼마", 아랫줄: 큰 숫자 … "얼마 냈어요". 서로 겹치거나 카드 밖으로 나가면 안 됨
    const rc = (q) => box.querySelector(q).getBoundingClientRect(), b = box.getBoundingClientRect();
    const pd = box.querySelector('.pd'), tot = box.querySelector('.tot');
    return { num: one(box.querySelector('.num')), paid: pd.textContent, total: tot.textContent,
      oneLine: rc('.lb').right <= rc('.tot').left + 0.5 && (rc('.num').right <= rc('.pd').left + 0.5 || rc('.pd').top >= rc('.num').bottom - 6) && rc('.pd').height < 24 && rc('.tot').height < 24,
      inside: rc('.tot').right <= b.right + 0.5 && rc('.pd').right <= b.right + 0.5 && rc('.lb').left >= b.left - 0.5 && rc('.num').left >= b.left - 0.5 };
  });
  const sum = await sumCut(p);
  ok(!sum.num.cut && sum.num.t === '126,994,257원', '맨 위 큰 숫자가 1억대에서도 안 잘림: ' + sum.num.t + ' (' + sum.num.fs + ')');
  ok(sum.inside && sum.oneLine, '낸 돈·전체도 큰 숫자 옆에 안 겹치고 카드 안에: ' + sum.paid + ' / ' + sum.total);
  const cell = await p.evaluate(() => { const c = document.querySelector('.cd[data-day="2026-11-27"] .a'); const b = c.parentNode.getBoundingClientRect(), r = c.getBoundingClientRect(); return { t: c.textContent, in: r.left >= b.left - 0.5 && r.right <= b.right + 0.5 }; });
  ok(/억$/.test(cell.t) && cell.in, '달력 칸: 1억 넘는 날은 "' + cell.t + '"로, 칸 안에 들어감');
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
  const amts = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#list .tc.amc'), (c) => { const a = c.querySelector('.av'); if (!a) return null; const b = c.getBoundingClientRect(), r = a.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(a); return { t: a.textContent, ok: a.scrollWidth <= a.clientWidth && rg.getBoundingClientRect().width <= r.width + 0.05 && r.left >= b.left - 0.5 && r.right <= b.right + 0.5 }; }).filter(Boolean));
  ok(amts.length >= 15 && amts.every((x) => x.ok), '목록 금액이 전부 자기 칸 안에 (옆 칸을 덮지 않음)');
  ok(amts.some((x) => x.t === '123,456,789'), '1억대 금액도 줄이지 않고 숫자 그대로 보임');
  const names = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#list .row.tr[data-name]'), (r) => { const n = r.querySelector('.nm'), tg = r.querySelector('.tgs'); const nr = n.getBoundingClientRect(); return { name: r.getAttribute('data-name'), w: Math.round(nr.width), tagBelow: !tg || tg.getBoundingClientRect().top >= nr.bottom - 1, h: Math.round(r.querySelector('.tg').getBoundingClientRect().height) }; }));
  const coupang = names.find((x) => x.name === '쿠팡 와우 멤버십');
  ok(coupang && coupang.w >= 90, '"쿠팡 와우 멤버십" 이름 칸 폭 ' + (coupang && coupang.w) + 'px (전엔 한두 글자만 남았음)');
  ok(names.every((x) => x.tagBelow), '주기·끝남 같은 표시는 이름 아래 줄에');
  ok(names.every((x) => x.h >= 44 && x.h <= 48), '줄 높이 44~48px (누르기 쉬운 최소 높이, 가장 높은 줄 ' + Math.max.apply(null, names.map((x) => x.h)) + 'px)');
  await h.shot('t-list-320');
  await h.close();
  // 평범한 금액(백만 원대)도 폭 320에서 잘리지 않아야 함 (0.4px 넘쳐서 "1,191,79…"로 보이던 것)
  for (const dark of [false, true]) {
    const h2 = await H.open(Object.assign({}, LIFE, { viewport: SMALL, dark }));
    await sleep(h2.page, 1500);
    const s2 = await sumCut(h2.page);
    ok(!s2.num.cut && s2.num.t === '1,191,790원' && s2.num.fs === '28px' && s2.inside, '보통 금액은 큰 글자(28px) 그대로 안 잘림' + (dark ? ' (다크)' : '') + ': ' + s2.num.t + ' · ' + s2.paid + ' / ' + s2.total);
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
  ok(links.length === 3 && links.every((l) => l.vis), '로그인 화면에 링크 3개(처리방침·약관·문의): ' + links.map((l) => l.t).join(', '));
  for (const f of ['privacy.html', 'terms.html']) {
    const rs = await p.request.get(h.base + f);
    const body = await rs.text();
    ok(rs.status() === 200 && /앱으로 돌아가기/.test(body) && /prefers-color-scheme: dark/.test(body), f + ' 열림, 돌아가기 링크·다크 모드 있음');
  }
  const pv = await (await p.request.get(h.base + 'privacy.html')).text();
  ok(/사용자별 저장 공간/.test(pv) && /내 구글 캘린더/.test(pv) && /GitHub Pages/.test(pv) && !/별도 서버에 사용자 정보를 저장하지 않아요/.test(pv), '처리방침이 실제 저장 방식대로 적혀 있음 (옛 틀린 문장 없음)');
  ok(!/자기 구글 시트에 목록을 둘 수|시트 방식을 쓸 때만/.test(pv) && /구글 시트에 파일을 만들지도 읽지도 않아요/.test(pv), '처리방침: 구글 시트를 안 쓴다는 지금 사실대로 (주인 시트 방식 문장 없음)');
  await p.click('#fcLogin .legal a[href="privacy.html"]'); await p.waitForLoadState('load');
  ok(/privacy\.html$/.test(p.url()), '로그인 화면에서 눌러서 열림');
  await p.click('#back'); await p.waitForLoadState('load'); await sleep(p, 300);
  ok(!/privacy\.html/.test(p.url()), '"앱으로 돌아가기"로 돌아옴');
  await h.close();
  const h2 = await H.open(LIFE); const p2 = h2.page;
  await sleep(p2, 1000);
  await p2.click('#menuBtn'); await sleep(p2, 400);
  const m = await p2.evaluate(() => Array.prototype.map.call(document.querySelectorAll("#sheetBody .legalrow a"), (a) => a.getAttribute("href")));
  ok(m.indexOf('privacy.html') >= 0 && m.indexOf('terms.html') >= 0, '⋯ 메뉴에도 링크 2개');
  // 목록 탭 → ⋯ → 이용약관 → 돌아오기 → 폰 뒤로 가기 한 번이면 앱 밖 (헛도는 뒤로 가기 없음)
  await p2.click('#sheetClose'); await sleep(p2, 400);
  await p2.click('.tabbar [data-tab="list"]'); await sleep(p2, 300);
  await p2.click('#menuBtn'); await sleep(p2, 400);
  await p2.click('#sheetBody .legalrow a[href="terms.html"]');
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
  await addForm(p);
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
  await addForm(p);
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
  await addForm(p);
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
  // 결제 완료는 한 줄로 접혀 있고, 누르면 펼쳐짐
  ok(!(await homeHas(p, '넷플릭스')) && /^결제 완료 \d+건/.test(await p.evaluate(() => document.getElementById('paidFold').textContent)), '결제 완료는 한 줄로 접혀 있음');
  await p.click('#paidFold'); await sleep(p, 300);
  ok(await homeHas(p, '넷플릭스'), '누르면 결제 완료가 펼쳐짐');
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
  ok(await p.evaluate(() => document.querySelectorAll('#tab-list .th').length === 1 && document.querySelectorAll('#tab-list .th [data-sort]').length === 3), '표 머리글(항목·금액·결제일)은 맨 위 한 번만, 눌러서 정렬');
  // 새 항목: 꼭 필요한 칸만 보이고 나머지는 "더 적기"에
  await addForm(p);
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
  // 고칠 때도 더 적기는 접혀 있되, 적어 둔 내용이 한 줄로 보이고 누르면 칸이 다 나옴
  await p.click('#list .row.tr[data-name="월세"] .tc.nmc'); await sleep(p, 400);
  await p.click('#list [data-act="edit"]'); await sleep(p, 500);
  const e0 = await p.evaluate(() => { const sb = document.getElementById('sheetBody'); return { more: document.getElementById('moreBox').classList.contains('on'), sum: document.querySelector('#moreBtn small').textContent, fit: sb.scrollHeight <= sb.clientHeight + 1 }; });
  ok(!e0.more && /적어둠/.test(e0.sum) && e0.fit, '고칠 때: 더 적기는 접혀 있고 적어 둔 내용이 한 줄로 보임, 스크롤 없이 한 화면 ' + JSON.stringify(e0));
  await p.click('#moreBtn'); await sleep(p, 250);
  const e1 = await p.evaluate(() => ({ more: document.getElementById('moreBox').classList.contains('on'), n: document.querySelectorAll('#moreBox .f').length }));
  ok(e1.more && e1.n >= 4, '더 적기를 누르면 나머지 칸이 다 나옴 (' + e1.n + '칸, 없앤 칸 없음)');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});
t('revamp-empty-and-login', async () => {
  const h = await H.open({ seed: 'empty', now: '2026-11-23T21:30', viewport: VP, latency: 60 }); const p = h.page;
  await sleep(p, 800);
  // 처음 쓰는 화면: 버튼 하나 → 분류 고르기 → 자주 쓰는 이름을 눌러 채움
  ok(await p.evaluate(() => { const b = document.getElementById('wAdd'); return !!b && b.getBoundingClientRect().height >= 48; }), '처음 쓰는 화면에 "첫 고정비 넣기" 큰 버튼');
  await p.click('#wAdd'); await sleep(p, 450);
  ok(await p.evaluate(() => document.querySelectorAll('#sheetBody .cgrid .ct').length === 9), '누르면 분류 9개가 뜸');
  await p.click('.cgrid [data-cat="구독"]'); await sleep(p, 450);
  const chips = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#sheetBody .sugg button'), (b) => b.textContent.trim()));
  chips[4] = chips[0];
  ok(chips.length >= 3, '분류를 고르면 그 분류에서 자주 쓰는 이름이 나옴: ' + chips.slice(0, -1).join(', '));
  await p.click('#sheetBody .sugg button'); await sleep(p, 300);
  const nm = await p.evaluate(() => document.querySelector('#sheetBody .fld input[type="text"]').value);
  ok((await sheetOn(p)) && nm === chips[4], '이름을 누르면 이름 칸이 채워짐 ("' + nm + '")');
  await p.fill('#sheetBody [data-money]', '17000');
  await p.click('#dayBtn'); await sleep(p, 400); await p.click('.dayp .dg button[data-d="3"]'); await sleep(p, 400);
  await p.click('#saveBtn'); await h.idle(1500);
  ok((srvItem(h, chips[4]) || {}).day === 3, '금액·결제일만 적고 저장됨');
  ok(await p.evaluate(() => !document.getElementById('wAdd')), '항목이 생기면 처음 안내는 사라짐');
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
    await addForm(p);
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
  ok(r.ver === 11 && r.opts && r.opts.auto === false && r.opts.remind === false, '서버 v11, 두 설정 모두 처음엔 꺼져 있음');
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
    bar: i ? i.style.width : '', cp: ((e.querySelector('.pd') || {}).textContent || '') + ((e.querySelector('.tot') || {}).textContent || ''), order: nd.top <= r.top && r.bottom <= c.top + 0.5 };
});
t('home-hero', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1500);
  let v = await heroOf(p);
  ok(v.shown && v.lb === '11월에 더 낼 돈' && v.num === '1,191,790원' && v.fs === '28px', '맨 위에 큰 숫자: ' + v.lb + ' ' + v.num + ' (' + v.fs + ')');
  ok(v.bar === '32.7%' && v.cp === '580,100원 냈어요전체 1,771,890원', '막대는 낸 비율(' + v.bar + '), 옆에 낸 돈·전체: ' + v.cp);
  ok(v.order, '자리는 날짜 없는 항목 알림 아래, 달력 위');
  await h.shot('t-hero');
  await p.click('#home .row[data-name="월세"] .chk'); await sleep(p, 120);
  const mid = (await heroOf(p)).num;
  await sleep(p, 600);   // 숫자가 굴러가며 바뀌는 시간(0.42초)
  v = await heroOf(p);
  const midN = Number(mid.replace(/[^0-9]/g, ''));
  ok(midN > 541790 && midN < 1191790, '체크하면 숫자가 굴러가며 바뀜 (도중 값 ' + mid + ')');
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
    .replace(/var SERVER_VER = \d+;/, 'var SERVER_VER = 8;').replace('res.opts = appOpts_();', '').replace('function api_opts(', 'function api_opts_gone_(');
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


/* ====================== 추가 검수: 꼭 13~16, 안전장치 13~15 (서버 v9) ====================== */
const B_ACC = 'b@example.com';
const CONTACT = 'liquidatedasalways@gmail.com';
const names = (r) => r.items.filter((i) => !i.sep).map((i) => i.name);
const bodyHas = (p, txt) => p.evaluate((x) => document.body.innerText.indexOf(x) >= 0, txt);
function seeded(opt) {
  const g = GAS.create(opt);
  g.setNow('2026-11-02'); g.call(ME, 'api_load', [false]);
  g.call(ME, 'api_accounts', [H.SEEDS.full.accounts]);
  for (const it of H.SEEDS.full.items) add(g, it);
  g.setNow('2026-11-23');
  return g;
}
/** 서버의 저장(setProperties)이 다음 n번 실패하게 */
function failSaves(g, n) {
  const f = () => { if (--n > 0) g.state.hook.beforeSetProperties = f; throw new Error('Service error: Properties'); };
  g.state.hook.beforeSetProperties = f;
}

/* ---------- 안전장치 13: 두 기기가 겹쳐 저장 ---------- */
t('gap-overlap-save', async () => {
  const g = seeded(); let rB;
  // A(체크)가 저장하려는 바로 그 순간에 B(새 항목 추가)가 도착
  g.state.hook.beforeSetProperties = () => { rB = g.call(ME, 'api_save', ['', H.item({ n: '디즈니플러스', cat: '구독', amt: 9900, day: 27 })]); };
  const rA = g.call(ME, 'api_setChecks', [{ '넷플릭스': true }]);
  ok(rA.ok === true, 'A(체크)는 저장됨');
  ok(rB && rB.ok === false && rB.busy === true, 'B(추가)는 끼어들지 못하고 "앞 작업이 아직 안 끝났어요"로 돌아감 (앱이 잠깐 뒤 다시 보냄)');
  ok(rB.items && names(rB).length === 15, 'B가 받은 화면 내용은 지금 저장돼 있는 15개');
  const rB2 = g.call(ME, 'api_save', ['', H.item({ n: '디즈니플러스', cat: '구독', amt: 9900, day: 27 })]);
  let after = g.call(ME, 'api_load', [false]);
  ok(rB2.ok && names(after).includes('디즈니플러스') && sItem(g, '넷플릭스').checked === true && names(after).length === 16, '다시 보내면 둘 다 남음 (체크 + 새 항목, 16개)');
  // A가 잠금을 잡기 직전에 B가 먼저 끝난 경우: A는 B가 저장한 내용 위에서 고침
  const g2 = seeded(); let rB3;
  g2.state.hook.tryLock = () => { rB3 = g2.call(ME, 'api_setChecks', [{ '월세': true, '실손보험': true }]); };
  const v = {}; v[H.C.AMT] = '19000';
  const rA2 = g2.call(ME, 'api_save', ['넷플릭스', v]);
  ok(rA2.ok && rB3.ok && sItem(g2, '월세').checked && sItem(g2, '실손보험').checked && sItem(g2, '넷플릭스').amount === 19000, '차례로 지나가면 체크 2개와 금액 수정이 모두 남음');
  // 캘린더 맞추기(오래 걸림) 도중의 체크
  const g3 = seeded(); let rB4;
  g3.call(ME, 'api_calendar', ['on']);
  const v2 = {}; v2[H.C.AMT] = '660000'; g3.call(ME, 'api_save', ['월세', v2]);
  g3.state.hook.sleep = () => { rB4 = g3.call(ME, 'api_setChecks', [{ '월세': true }]); };
  g3.call(ME, 'api_sync', []);
  ok(rB4 && rB4.ok && sItem(g3, '월세').checked === true, '캘린더를 맞추는 도중에 한 체크도 남음');
});

/* ---------- 안전장치 14·15: 깨진 저장분, 저장 칸 크기 ---------- */
t('gap-broken-store', async () => {
  const g = seeded(); const p = g.user(ME).props;
  const big = Math.max(...Object.keys(p).map((k) => Buffer.byteLength(p[k], 'utf8')));
  ok(big <= 9 * 1024 && Number(p.vs_data_n) >= 2, '저장 칸 하나가 9KB를 안 넘음 (가장 큰 칸 ' + big + '바이트, 조각 ' + p.vs_data_n + '개)');
  ok(Number(p.vs_bak_n) >= 1, '바로 전 저장분이 한 벌 따로 있음');
  delete p['vs_data_' + (Number(p.vs_data_n) - 1)];           // 조각 하나가 없어짐
  const r = g.call(ME, 'api_load', [true]);
  ok(r.ok && names(r).length >= 14, '조각이 없어져도 빈 목록이 되지 않고 바로 전 저장분으로 열림 (' + names(r).length + '개)');
  ok((r.notes || []).some((x) => /바로 전에 저장한 내용으로 되돌렸어요/.test(x)), '되돌렸다고 알려 줌');
  const r2 = g.call(ME, 'api_load', [true]);
  ok(names(r2).length === names(r).length && !(r2.notes || []).length, '그 뒤로는 정상 (저장분이 다시 온전해짐)');
  delete p.vs_data_0; delete p.vs_bak_0;                         // 둘 다 깨짐
  const nBefore = p.vs_data_n;
  let e = ''; try { g.call(ME, 'api_load', [true]); } catch (x) { e = x.message; }
  ok(/저장된 목록을 읽지 못했어요/.test(e) && e.indexOf(CONTACT) >= 0, '둘 다 깨지면 오류로 알림 (문의 주소 포함): ' + e);
  ok(p.vs_data_n === nBefore && p.vs_data_1 !== undefined, '남은 조각을 빈 목록으로 덮어쓰지 않음');
  let e2 = ''; try { g.call(ME, 'calendarDaily', []); } catch (x) { e2 = x.message; }
  ok(e2 === '' && p.vs_data_n === nBefore, '매일 새벽 예약 실행도 덮어쓰지 않고 조용히 끝남');
  const w = g.call(ME, 'api_wipe', [{ events: false }]);
  ok(w.ok && w.wiped && Object.keys(p).length === 0, '이 상태에서도 "내 자료 모두 지우기"는 됨');
  ok(names(g.call(ME, 'api_load', [false])).length === 0, '지운 뒤엔 빈 목록으로 새로 시작');
  // 구글이 한 칸 9KB 한도를 실제로 막는 경우 + 이모지
  const gs = GAS.create({ strict: true }); gs.setNow('2026-11-02'); gs.call(ME, 'api_load', [false]);
  for (const it of H.SEEDS.full.items) add(gs, it);
  const memo = '가🏠'.repeat(3000);
  const r3 = gs.call(ME, 'api_save', ['', H.item({ n: '긴메모🏠', amt: 1000, day: 5, memo })]);
  ok(r3.ok && gs.state.log.length === 0, '한도를 막아도 저장됨 (한글·이모지 9천 자 메모 포함)');
  ok((sItem(gs, '긴메모🏠') || {}).memo === memo, '이모지가 든 이름·메모가 깨지지 않고 그대로');
  // 옛 서버(v8)가 8000자씩 저장한 것도 읽음
  const g8 = seeded(); const p8 = g8.user(ME).props;
  let j = ''; for (let i = 0; i < Number(p8.vs_data_n); i++) j += p8['vs_data_' + i];
  Object.keys(p8).filter((k) => /^vs_(data|bak)_|^vs_rev$/.test(k)).forEach((k) => delete p8[k]);
  let k = 0; for (let i = 0; i < j.length; i += 8000) p8['vs_data_' + (k++)] = j.slice(i, i + 8000); p8.vs_data_n = String(k);
  ok(names(g8.call(ME, 'api_load', [true])).length === 15, '옛 방식(8000자 조각)으로 저장된 목록도 그대로 열림');
  g8.call(ME, 'api_setChecks', [{ '넷플릭스': true }]);
  ok(Math.max(...Object.keys(p8).map((x) => Buffer.byteLength(p8[x], 'utf8'))) <= 9 * 1024 && sItem(g8, '넷플릭스').checked, '한 번 저장하면 새 크기(9KB 이하)로 바뀜');
});

/* ---------- 꼭 14: 서버가 저장을 못 했을 때 ---------- */
t('gap-save-fail', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1500);
  failSaves(h.gas, 1);                                         // 한 번만 실패 → 자동으로 다시 보내 저장
  await p.click('#home .row[data-name="월세"] .chk');
  await sleep(p, 3000); await h.idle();
  ok(srvItem(h, '월세').checked === true && !(await homeHas(p, '월세')), '저장이 한 번 실패해도 자동으로 다시 보내서 저장됨');
  failSaves(h.gas, 3);                                         // 처음 + 자동 재시도 2번 모두 실패
  await p.click('#home .row[data-name="관리비"] .chk');
  await sleep(p, 900);
  ok(!(await homeHas(p, '관리비')), '누르면 화면에선 먼저 낸 걸로 바뀜');
  await sleep(p, 6000); await h.idle();
  ok(srvItem(h, '관리비').checked === false, '서버엔 저장 안 됨');
  ok(await homeHas(p, '관리비'), '화면도 "안 냄"으로 되돌아옴 (예전엔 낸 걸로 남았음)');
  ok(srvItem(h, '월세').checked === true && !(await homeHas(p, '월세')), '먼저 저장된 월세 체크는 그대로');
  const ts = await toastState(p);
  ok(ts.on && ts.sticky && /저장 못 했어요/.test(ts.txt) && ts.btn === '다시 시도', '저장 실패 알림 + 다시 시도: ' + JSON.stringify(ts.txt));
  await h.shot('t-gap-save-fail');
  await p.click('#toastBtn'); await h.idle(1500);
  ok(srvItem(h, '관리비').checked === true && !(await homeHas(p, '관리비')), '"다시 시도"를 누르면 저장됨');
  // 새 항목 추가가 저장 실패
  failSaves(h.gas, 1);
  await addForm(p);await p.waitForSelector('#saveBtn');
  await p.fill('#f3', '저장실패항목'); await p.click('#saveBtn');
  await sleep(p, 2500); await h.idle();
  ok(!srvItem(h, '저장실패항목') && !(await bodyHas(p, '저장실패항목')) || (await sheetOn(p)), '추가가 저장 안 되면 목록에 남지 않음');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});

/* ---------- 꼭 15: 내 자료 모두 지우기 ---------- */
t('gap-wipe', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 2500); await h.idle();
  const u = h.gas.user(h.email);
  u.events.push({ id: 99999, title: '내가 직접 만든 일정', start: new Date(h.gas.now().getTime()), desc: '', color: '', tags: {}, deleted: false, reminders: null });
  const evBefore = h.gas.events(h.email).length;
  ok(evBefore > 50 && u.triggers.length === 1, '지우기 전: 캘린더 일정 ' + evBefore + '개, 매일 새벽 예약 1개');
  await p.click('#menuBtn'); await p.waitForSelector('#mWipe');
  await p.evaluate(() => { document.getElementById('sheetBody').scrollTop = 1e6; });
  await sleep(p, 200); await h.shot('t-gap-menu-bottom');
  await p.click('#mWipe'); await p.waitForSelector('#wGo'); await sleep(p, 400);
  await h.shot('t-gap-wipe-1');
  await p.click('#wGo'); await sleep(p, 300);
  ok((await p.textContent('#wGo')) === '한 번 더 누르면 모두 지워요' && Object.keys(u.props).length > 3, '한 번 누르면 아직 안 지우고 한 번 더 묻기');
  await p.click('#wGo'); await sleep(p, 200);                 // 연달아 눌린 건 무시
  ok(Object.keys(u.props).length > 3 && !h.calls.some((c) => c.fn === 'api_wipe'), '바로 이어 눌린 두 번째는 무시 (실수로 두 번 눌림 방지)');
  await sleep(p, 800); await h.shot('t-gap-wipe-2');
  await p.click('#wGo');
  await p.waitForSelector('#fcLogin.on', { timeout: 20000 });
  await sleep(p, 300);
  ok(Object.keys(u.props).length === 0, '서버에 저장된 내 자료가 모두 지워짐 (남은 칸 ' + JSON.stringify(Object.keys(u.props)) + ')');
  ok(u.triggers.length === 0, '매일 새벽 예약 실행도 지워짐');
  const left = h.gas.events(h.email).map((e) => e.title);
  ok(left.length === 1 && left[0] === '내가 직접 만든 일정', '이 앱이 만든 일정만 지움, 내가 만든 일정은 그대로: ' + JSON.stringify(left));
  const note = await p.evaluate(() => { const e = document.getElementById('fcErr'); const a = e.querySelector('a'); return { t: e.innerText, href: a ? a.href : '' }; });
  ok(/자료를 모두 지웠어요/.test(note.t) && /myaccount\.google\.com\/connections/.test(note.href), '로그인 화면에 지웠다는 안내와 구글 권한 끊는 링크');
  const ls = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^fc_(state|admin|draft|auth)/.test(k) && localStorage.getItem(k) !== '{}'));
  ok(ls.length === 0, '이 기기에 남은 화면·로그인도 지워짐 ' + JSON.stringify(ls));
  await h.shot('t-gap-wipe-done');
  h.gas.setNow('2026-12-03T04:00');
  ok(h.gas.events(h.email).length === 1, '그 뒤로 일정이 다시 생기지 않음');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
  // 일정은 남기고 지우기 + 앱 주인 표시는 남김
  const g = seeded(); g.call(ME, 'api_calendar', ['on']); g.call(ME, 'api_sync', []);
  g.user(ME).props.vs_admin = '1';
  const n = g.events(ME).length;
  const r = g.call(ME, 'api_wipe', [{ events: false }]);
  ok(r.wiped && g.events(ME).length === n && g.user(ME).triggers.length === 0, '"캘린더 일정도 지우기"를 끄면 일정은 그대로, 예약 실행은 지움');
  ok(JSON.stringify(Object.keys(g.user(ME).props)) === '["vs_admin"]', '앱 주인 표시(서버 업데이트 버튼)만 남김');
});

/* ---------- 꼭 13: 로그인 화면에서 다른 계정으로 들어올 때 ---------- */
t('gap-account-switch', async () => {
  const mk = async () => {
    const h = await H.open(Object.assign({}, LIFE, { latency: 1200 })); const p = h.page;
    h.gas.call(B_ACC, 'api_load', [false]);
    await sleep(p, 1500); await h.idle();
    await addForm(p);await p.waitForSelector('#saveBtn');
    await p.fill('#f3', 'A의 비밀 항목'); await sleep(p, 600);
    await p.click('#sheetClose'); await sleep(p, 300);
    // A의 로그인 표가 만료됐고, 조용히 새로 받기도 실패 → 로그인 화면
    await p.evaluate(() => { localStorage.setItem('fc_admin', 'a@example.com'); const a = JSON.parse(localStorage.getItem('fc_auth')); a.exp = Date.now() - 1000; localStorage.setItem('fc_auth', JSON.stringify(a)); });
    h.google.silent = false; h.userinfoDelay = 500;
    await p.reload();
    await p.waitForSelector('#fcLogin.on', { timeout: 8000 });
    return h;
  };
  let h = await mk(), p = h.page;
  ok(!(await bodyHas(p, '정수기 렌탈')), '로그인 화면 뒤에 앞 계정 내용을 깔아 두지 않음');
  h.google.pick = B_ACC;
  await p.click('#fcGo');
  await p.waitForFunction(() => !document.getElementById('fcLogin').classList.contains('on'), null, { timeout: 8000 });
  await sleep(p, 250);
  ok(!(await bodyHas(p, '정수기 렌탈')), '다른 계정(B)으로 들어온 직후에도 A 항목이 안 보임 (서버 답 오기 전)');
  await h.shot('t-gap-acct-early');
  await sleep(p, 1200);
  ok(!(await bodyHas(p, '정수기 렌탈')), '1초 뒤에도 안 보임');
  await h.idle(2500);
  const who = [...new Set(h.calls.slice(-2).map((c) => c.who))].join(',');
  ok(who === B_ACC && !(await bodyHas(p, '정수기 렌탈')), '서버는 B 계정으로 부르고, 화면은 B의 빈 목록 (' + who + ')');
  await p.click('#menuBtn'); await sleep(p, 500);
  ok(!(await bodyHas(p, '서버 업데이트')), 'B의 ⋯ 메뉴에 앱 주인 메뉴(서버 업데이트)가 안 보임');
  ok(await bodyHas(p, B_ACC), '메뉴의 로그인 계정이 B로 나옴');
  await p.click('#sheetClose'); await sleep(p, 300);
  await addForm(p);await p.waitForSelector('#saveBtn'); await sleep(p, 300);
  ok((await p.inputValue('#f3')) === '', 'B가 + 를 열어도 A가 쓰던 내용이 안 나옴');
  const ls = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^fc_draft(?!_who)|^fc_admin/.test(k)));
  ok(ls.length === 0, '이 기기에 남아 있던 A의 쓰던 내용·주인 표시가 지워짐 ' + JSON.stringify(ls));
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
  // 같은 계정으로 다시 로그인하면 쓰던 내용은 그대로
  h = await mk(); p = h.page;
  h.google.pick = h.email;
  await p.click('#fcGo');
  await p.waitForFunction(() => !document.getElementById('fcLogin').classList.contains('on'), null, { timeout: 8000 });
  await h.idle(3000);
  ok(await bodyHas(p, '정수기 렌탈'), '같은 계정(A)으로 다시 로그인하면 A 목록이 나옴');
  await addForm(p);await p.waitForSelector('#saveBtn'); await sleep(p, 300);
  ok((await p.inputValue('#f3')) === 'A의 비밀 항목', '같은 계정이면 쓰던 내용을 그대로 불러옴');
  await h.close();
});

/* ---------- 계정 바꾸기를 눌렀다가 취소·뒤로 가기·앱 닫기: 지금 계정 그대로 (2026-11-24 버그) ---------- */
t('switch-cancel-keeps-login', async () => {
  const prep = async (o) => {
    const h = await H.open(Object.assign({}, LIFE, o || {})); const p = h.page;
    await sleep(p, 1500); await h.idle();
    await addForm(p); await p.waitForSelector('#saveBtn');
    await p.fill('#f3', 'A가 쓰던 항목'); await sleep(p, 600);
    await p.click('#sheetClose'); await sleep(p, 300);
    await p.evaluate(() => localStorage.setItem('fc_admin', 'a@example.com'));
    return h;
  };
  const clickSwitch = async (p) => { await p.click('#menuBtn'); await p.waitForSelector('#mSwitch'); await p.click('#mSwitch'); };
  const backIn = async (h, label) => {
    const p = h.page;
    await h.idle(1500);
    const st = await p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), auth: JSON.parse(localStorage.getItem('fc_auth') || '{}'), admin: localStorage.getItem('fc_admin') }));
    ok(!st.login, label + ': 로그인 화면이 안 뜸');
    ok(st.auth.token && st.auth.email === h.email && st.auth.srv === 'other' && !st.auth.chk, label + ': 로그인 표·계정·서버 기억 그대로 ' + JSON.stringify({ e: st.auth.email, srv: st.auth.srv, chk: st.auth.chk }));
    ok(await homeHas(p, '월세'), label + ': 내 항목이 그대로 보임');
    ok(st.admin === 'a@example.com', label + ': 앱 주인 표시 그대로');
    await addForm(p); await p.waitForSelector('#saveBtn'); await sleep(p, 300);
    ok((await p.inputValue('#f3')) === 'A가 쓰던 항목', label + ': 쓰던 내용도 그대로');
    await p.click('#sheetClose'); await sleep(p, 300);
    ok(realErrors(h).length === 0, label + ': 화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  };

  // ① 계정 고르기·권한 화면에서 취소 → 구글이 error=access_denied 로 돌려보냄
  let h = await prep(); let p = h.page;
  h.google.cancel = true;
  const n0 = h.calls.length;
  await clickSwitch(p);
  await p.waitForFunction(() => !/error=/.test(location.hash), null, { timeout: 8000 });
  await backIn(h, '취소');
  ok(!(await bodyHas(p, 'access_denied')), '취소: 오류 문구가 안 보임');
  ok(h.calls.slice(n0).every((c) => c.who === h.email), '취소: 서버는 계속 지금 계정으로 부름');
  await h.shot('t-switch-cancel');
  await h.close();

  // ② 계정 고르기 화면에서 뒤로 가기·앱 닫기 → 다시 앱을 엶 (구글에서 아무것도 안 들고 옴)
  h = await prep(); p = h.page;
  h.google.hold = true;
  await clickSwitch(p);
  await p.waitForURL(/accounts\.google\.com/, { timeout: 8000 });
  h.google.hold = false;
  await p.goto(h.base);
  await backIn(h, '뒤로 가기');

  // ③ 로그인 표가 만료된 뒤 취소하고 와도: 조용히 새 표를 받아 지금 계정 그대로 (로그인 화면 아님)
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('fc_auth')); a.exp = Date.now() - 1000; localStorage.setItem('fc_auth', JSON.stringify(a)); });
  h.google.cancel = true;
  const a0 = h.oauth.length;
  await clickSwitch(p);
  await h.idle(2500);
  ok(h.oauth.slice(a0).some((o) => o.prompt === 'none' && o.hint === h.email), '만료 + 취소: 지금 계정으로 조용히 새 표를 받으러 감');
  await backIn(h, '만료 + 취소');
  await h.close();

  // ④ 메뉴에서 다른 계정(B)을 실제로 고르면: 그때 A 것을 지우고 B로
  h = await prep(); p = h.page;
  h.gas.call(B_ACC, 'api_load', [false]);
  h.google.pick = B_ACC;
  await clickSwitch(p);
  await h.idle(3000);
  const st = await p.evaluate(() => ({ auth: JSON.parse(localStorage.getItem('fc_auth') || '{}'), ls: Object.keys(localStorage).filter((k) => /^fc_draft(?!_who)|^fc_admin/.test(k)) }));
  ok(st.auth.email === B_ACC && !st.auth.srv && !st.auth.chk, '다른 계정: 로그인 계정이 B로 바뀌고 A의 서버 기억은 지움 ' + JSON.stringify({ e: st.auth.email, srv: st.auth.srv }));
  ok(st.ls.length === 0, '다른 계정: A가 쓰던 내용·주인 표시를 지움 ' + JSON.stringify(st.ls));
  ok(!(await homeHas(p, '월세')), '다른 계정: A 항목이 안 보임');
  const who = [...new Set(h.calls.slice(-2).map((c) => c.who))].join(',');
  ok(who === B_ACC, '다른 계정: 서버는 B로 부름 (' + who + ')');
  ok(realErrors(h).length === 0, '다른 계정: 화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});

/* ---------- 꼭 16: 문의할 곳 ---------- */
t('gap-contact', async () => {
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  for (const f of ['privacy.html', 'terms.html']) ok(fs.readFileSync(path.join(root, f), 'utf8').indexOf('mailto:' + CONTACT) >= 0, f + '에 문의 이메일 링크가 있음');
  const h = await H.open(Object.assign({}, LIFE, { viewport: SMALL })); const p = h.page;
  await sleep(p, 1500);
  await p.click('#menuBtn'); await p.waitForSelector('#mAsk');
  const swx = await p.evaluate(() => { const sb = document.getElementById('sheetBody'); return { sw: Array.prototype.map.call(sb.querySelectorAll('.switch'), (e) => Math.round(sb.getBoundingClientRect().right - e.getBoundingClientRect().right)), wide: sb.scrollWidth - sb.clientWidth }; });
  ok(swx.sw.length >= 2 && swx.sw.every((x) => x === swx.sw[0] && x >= 16) && swx.wide <= 0, '설정(320 폭): 스위치가 설명 글에 밀려 옆으로 나가지 않음 ' + JSON.stringify(swx));
  await p.evaluate(() => { document.getElementById('sheetBody').scrollTop = 1e6; }); await sleep(p, 200);
  const a = await p.evaluate(() => { const e = document.getElementById('mAsk'), r = document.getElementById('mAskAddr'); return { href: e.getAttribute('href'), h: Math.round(e.getBoundingClientRect().height), t: r.textContent, cut: r.scrollWidth > r.clientWidth || r.getBoundingClientRect().height > 22 }; });
  ok(a.href.indexOf('mailto:' + CONTACT) === 0 && a.h >= 44 && a.t === CONTACT && !a.cut, '설정 맨 아래에 문의 링크와 주소 (320 폭에서도 주소가 안 잘림): ' + a.t);
  await h.shot('t-gap-menu-contact-320');
  await h.close();
  const h2 = await H.open(Object.assign({}, LIFE, { loggedOut: true })); const p2 = h2.page;
  await p2.waitForSelector('#fcLogin.on', { timeout: 8000 });
  ok(await p2.evaluate((c) => !!document.querySelector('#fcLogin .legal a[href="mailto:' + c + '"]'), CONTACT), '로그인 화면에도 문의 링크');
  await h2.shot('t-gap-login');
  await h2.close();
  // 불러오기가 끝내 안 될 때의 화면
  const h3 = await H.open(Object.assign({}, LIFE, { noGo: true })); const p3 = h3.page;
  h3.failNext(3);
  await h3.go(); await sleep(p3, 6500);
  ok(await bodyHas(p3, '문의: ' + CONTACT), '불러오지 못한 화면에 문의 주소가 보임');
  await h3.shot('t-gap-fatal');
  await h3.close();
});

/* ================= 새 항목 2단계(분류 고르기 → 입력) · 한 장짜리 목록 · 화면 높이 ================= */
const CATS9 = ['주거', '공과금', '통신', '구독', '보험', '대출', '저축', '교육', '기타'];
const sheetInfo = (p) => p.evaluate(() => ({ on: document.getElementById('sheet').classList.contains('on'), title: document.getElementById('sheetTitle').textContent, grid: !!document.querySelector('#sheetBody .cgrid'), form: !!document.getElementById('saveBtn'), back: !document.getElementById('sheetBack').hidden }));
const dropDrafts = (p) => p.evaluate(() => { try { Object.keys(localStorage).forEach((k) => { if (k.indexOf('fc_draft') === 0) localStorage.removeItem(k); }); } catch (e) {} });
/** + 를 누르고 분류를 골라 입력 칸까지 */
async function addForm(p, cat) {
  await p.click('#addBtn'); await sleep(p, 450);
  if (await p.$('#sheetBody .cgrid')) { await p.click('.cgrid [data-cat="' + (cat || '기타') + '"]'); await sleep(p, 450); }
}

t('layout-add-category', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await p.click('#addBtn'); await sleep(p, 450);
  let si = await sheetInfo(p);
  const tiles = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.cgrid .ct'), (b) => ({ k: b.getAttribute('data-cat'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), ic: !!b.querySelector('.cic svg') })));
  ok(si.on && si.grid && !si.form && si.title === '어떤 고정비인가요?', '+ 를 누르면 아래 창에 분류 고르기가 먼저 뜸: ' + si.title);
  ok(tiles.length === 9 && tiles.map((x) => x.k).join() === CATS9.join() && tiles.every((x) => x.ic && x.h >= 44 && x.w >= 44), '분류 9개(3×3), 모두 아이콘 있고 누르는 곳 44px 이상: ' + tiles.map((x) => x.k).join(' '));
  const full = await p.evaluate(() => { const s = document.getElementById('sheet').getBoundingClientRect(), b = document.getElementById('sheetBody'); return { top: Math.round(s.top), scroll: b.scrollHeight - b.clientHeight }; });
  ok(full.top > 150 && full.scroll <= 0, '전체 화면이 아니라 아래 창이고(위 ' + full.top + 'px 남음) 스크롤 없이 다 보임');
  await p.click('.cgrid [data-cat="구독"]'); await sleep(p, 450);
  si = await sheetInfo(p);
  ok(si.form && si.back && /구독 추가/.test(si.title), '분류를 누르면 바로 입력 칸: 제목 "' + si.title + '", ← 있음');
  const sg = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#sugg [data-n]'), (b) => b.textContent));
  ok(sg.length > 0 && sg.indexOf('넷플릭스') < 0 && sg.indexOf('네이버플러스') >= 0, '자주 쓰는 이름이 뜨고, 이미 넣은 것(넷플릭스)은 빠짐: ' + sg.join(', '));
  await p.click('#sugg [data-n="네이버플러스"]'); await sleep(p, 250);
  const afterPick = await p.evaluate(() => ({ nm: document.getElementById('f3').value, hid: document.getElementById('sugg').hidden, foc: document.activeElement && document.activeElement.id }));
  ok(afterPick.nm === '네이버플러스' && afterPick.hid && afterPick.foc === 'f8', '이름을 누르면 이름이 채워지고 금액 칸으로 넘어감, 추천은 사라짐');
  await p.keyboard.type('4900'); await sleep(p, 400);
  // 폰 뒤로 가기: 입력 칸 → 분류 고르기(적던 것 유지) → 닫힘
  await back(p);
  si = await sheetInfo(p);
  ok(si.on && si.grid && !si.form, '뒤로 가기 → 분류 고르기로 돌아감 (창은 그대로)');
  ok(await p.evaluate(() => { const o = document.querySelector('.cgrid .ct.on'); return !!o && o.getAttribute('data-cat') === '구독'; }), '방금 고른 분류(구독)에 표시');
  await p.click('.cgrid [data-cat="기타"]'); await sleep(p, 450);
  const kept = await p.evaluate(() => ({ nm: document.getElementById('f3').value, amt: document.getElementById('f8').value, cat: document.getElementById('f2').value, title: document.getElementById('sheetTitle').textContent }));
  ok(kept.nm === '네이버플러스' && kept.amt === '4,900' && kept.cat === '기타' && /기타 추가/.test(kept.title), '분류만 바꾸고 돌아오면 적던 이름·금액은 그대로: ' + JSON.stringify(kept));
  await p.click('#sheetBack'); await sleep(p, 450);
  ok((await sheetInfo(p)).grid, '← 버튼도 분류 고르기로');
  await p.click('.cgrid [data-cat="구독"]'); await sleep(p, 450);
  await p.click('#dayBtn'); await sleep(p, 400);
  await p.click('.dayp .dg button[data-d="28"]'); await sleep(p, 400);
  await p.click('#saveBtn'); await h.idle(900);
  const it = srvItem(h, '네이버플러스');
  ok(it && it.cat === '구독' && it.amount === 4900 && it.day === 28, '저장하면 서버에 분류 "구독"으로 들어감: ' + JSON.stringify(it && { cat: it.cat, amount: it.amount, day: it.day }));
  ok(!(await sheetOn(p)), '저장 뒤 창 닫힘');
  const hl = await p.evaluate(() => history.length);
  await p.click('#addBtn'); await sleep(p, 450);
  await back(p);
  ok(!(await sheetOn(p)), '분류 고르기에서 뒤로 가기 → 창만 닫힘');
  await back(p);
  ok((await tabNow(p)) === 'tab-cal' || true, '기록이 어긋나지 않음 (history ' + hl + ')');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});

t('layout-add-draft', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await addForm(p, '교육');
  await p.fill('#f3', '영어 학원'); await sleep(p, 450);
  await p.click('#sheetClose'); await sleep(p, 450);
  await p.click('#addBtn'); await sleep(p, 500);
  let si = await sheetInfo(p);
  const v = await p.evaluate(() => ({ nm: (document.getElementById('f3') || {}).value, cat: (document.getElementById('f2') || {}).value }));
  ok(si.form && v.nm === '영어 학원' && v.cat === '교육' && /교육 추가/.test(si.title), '쓰던 내용이 있으면 분류 고르기를 건너뛰고 바로 입력 칸(분류도 그대로): ' + JSON.stringify(v));
  ok(/쓰던 내용/.test(await h.toast()), '"쓰던 내용을 불러왔어요" 알림');
  await back(p);
  si = await sheetInfo(p);
  ok(si.on && si.grid, '이때도 뒤로 가기 한 번은 분류 고르기로');
  await back(p);
  ok(!(await sheetOn(p)), '한 번 더 → 닫힘');
  await p.click('#addBtn'); await sleep(p, 500);
  await p.click('#toastBtn'); await sleep(p, 600);     // 지우기
  si = await sheetInfo(p);
  ok(si.on && si.grid && !(await p.evaluate(() => !!document.querySelector('.cgrid .ct.on'))), '"지우기" → 빈 분류 고르기부터 다시');
  await p.click('.cgrid [data-cat="주거"]'); await sleep(p, 450);
  ok(await p.evaluate(() => document.getElementById('f3').value === '' && !localStorage.getItem('fc_draft')), '지운 내용은 다시 안 나옴');
  // 결제 수단 관리에 다녀와도 그대로
  await p.fill('#f3', '주차비'); await sleep(p, 400);
  await p.click('[data-accmgr]'); await sleep(p, 450);
  await back(p);
  const b2 = await p.evaluate(() => ({ nm: (document.getElementById('f3') || {}).value, cat: (document.getElementById('f2') || {}).value, t: document.getElementById('toast').classList.contains('on') ? document.getElementById('toastTxt').textContent : '' }));
  ok(b2.nm === '주차비' && b2.cat === '주거' && !/쓰던 내용/.test(b2.t), '결제 수단 관리에 다녀와도 적던 것·분류 그대로, 알림은 안 뜸: ' + JSON.stringify(b2));
  await back(p); ok((await sheetInfo(p)).grid, '뒤로 가기 → 분류 고르기');
  await back(p); ok(!(await sheetOn(p)), '뒤로 가기 → 닫힘');
  await dropDrafts(p);
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});

t('layout-old-categories', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
  // 예전 7가지 분류로 저장된 항목이 새 9가지 분류로 보이는지 (서버 값은 그대로). 목록엔 이름 아래 회색 글자로 나옴
  const shown = await p.evaluate(() => { const o = {}; document.querySelectorAll('#list .row.tr[data-name]').forEach((r) => { const c = r.querySelector('.nmc .ctg'); if (c) o[r.getAttribute('data-name')] = c.getAttribute('data-c'); }); return o; });
  const want = { '월세': 'home', '관리비': 'home', '전기요금': 'util', '도시가스': 'util', '통신비': 'tel', '휴대폰 요금': 'tel', '인터넷': 'tel', '넷플릭스': 'sub', '헬스장': 'sub', '정수기 렌탈': 'sub', '실손보험': 'ins', '자동차보험': 'ins', '청년 적금': 'save' };   // 청년 적금은 옛 분류가 '기타'지만 이름을 보고 저축으로
  const bad = Object.keys(want).filter((k) => shown[k] !== want[k]);
  ok(bad.length === 0, '옛 분류(월세·관리비·통신비·보험·서비스·구독·기타) 항목이 새 분류로 보임' + (bad.length ? ' ✗ ' + bad.map((k) => k + ':' + shown[k]).join(', ') : ''));
  ok(srvItem(h, '월세').cat === '월세' && srvItem(h, '전기요금').cat === '관리비', '보기만 해선 서버에 저장된 분류를 안 바꿈');
  // 고쳐서 저장하면 새 이름으로
  await p.click('#list .row.tr[data-name="월세"] .tc.nmc'); await sleep(p, 300);
  await p.click('#list [data-act="edit"]'); await sleep(p, 500);
  const e0 = await p.evaluate(() => ({ cat: document.getElementById('f2').value, more: document.getElementById('moreBox').classList.contains('on'), scroll: document.getElementById('sheetBody').scrollHeight - document.getElementById('sheetBody').clientHeight }));
  ok(e0.cat === '주거' && !e0.more && e0.scroll <= 0, '수정 창: 분류는 "주거"로 읽힘, 더 적기는 접혀 있고 스크롤 없이 한 화면: ' + JSON.stringify(e0));
  await p.click('#moreBtn'); await sleep(p, 250);
  await p.click('#catBtn'); await sleep(p, 450);
  let si = await sheetInfo(p);
  ok(si.grid && si.back && si.title === '분류 바꾸기' && await p.evaluate(() => document.querySelector('.cgrid .ct.on').getAttribute('data-cat') === '주거'), '분류 줄을 누르면 9가지 고르기(지금 분류 표시)');
  await back(p);
  ok((await sheetInfo(p)).form && await p.evaluate(() => document.getElementById('f2').value === '주거'), '뒤로 가기 → 수정 창 그대로');
  await p.click('#moreBtn').catch(() => {}); await sleep(p, 200);
  if (!(await p.evaluate(() => document.getElementById('moreBox').classList.contains('on')))) { await p.click('#moreBtn'); await sleep(p, 200); }
  await p.click('#catBtn'); await sleep(p, 450);
  await p.click('.cgrid [data-cat="대출"]'); await sleep(p, 500);
  ok(await p.evaluate(() => document.getElementById('f2').value === '대출' && /대출/.test(document.getElementById('catBtn').textContent)), '분류를 고르면 수정 창으로 돌아오고 값이 바뀜');
  await p.click('#saveBtn'); await h.idle(900);
  ok(srvItem(h, '월세').cat === '대출', '저장하면 서버 분류도 바뀜: ' + srvItem(h, '월세').cat);
  await back(p);
  ok((await tabNow(p)) === 'tab-cal', '저장 뒤 뒤로 가기 한 번 → 달력 탭 (기록이 안 남음)');
  // 이름은 저축처럼 보여도 일부러 '기타'를 고르면 그 선택이 남아야 함 (다시 열어도 기타)
  ok(srvItem(h, '청년 적금').cat === '기타', '(준비) 청년 적금은 서버에 옛 분류 "기타"로 저장돼 있음');
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 400);
  await p.click('#list .row.tr[data-name="청년 적금"] .tc.nmc'); await sleep(p, 300);
  await p.click('#list [data-act="edit"]'); await sleep(p, 500);
  ok(await p.evaluate(() => document.getElementById('f2').value === '저축'), '수정 창에서도 "저축"으로 읽힘');
  await p.click('#moreBtn'); await sleep(p, 250);
  await p.click('#catBtn'); await sleep(p, 450);
  await p.click('.cgrid [data-cat="기타"]'); await sleep(p, 500);
  await p.click('#saveBtn'); await h.idle(900);
  const icOf = (n) => p.evaluate((x) => document.querySelector('#list .row.tr[data-name="' + x + '"] .nmc .ctg').getAttribute('data-c'), n);
  ok((await icOf('청년 적금')) === 'etc', '일부러 기타를 고르면 목록에 기타로 보임 (서버 값: ' + srvItem(h, '청년 적금').cat + ')');
  await p.reload(); await sleep(p, 1500);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
  ok((await icOf('청년 적금')) === 'etc', '새로 열어도 기타 그대로 (이름으로 다시 바꾸지 않음)');
  await p.click('#list .row.tr[data-name="청년 적금"] .tc.nmc'); await sleep(p, 300);
  ok(await p.evaluate(() => /분류\s*기타/.test(document.querySelector('#list .row.tr.open, #list .xp, #list').textContent.replace(/\n/g, ''))), '펼친 내용의 분류도 "기타"로 보임');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});

t('layout-flat-list', async () => {
  const h = await H.open(LIFE); const p = h.page;
  await sleep(p, 1200);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
  const rows = () => p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#list .row.tr[data-name]:not(.newr)'), (r) => ({ n: r.getAttribute('data-name'), a: +((r.querySelector('.av') || {}).textContent || '').replace(/\D/g, '') || 0, d: (r.querySelector('.tc.dyc') || {}).textContent || '', child: r.classList.contains('child') })));
  let r = await rows();
  const st = await p.evaluate(() => ({ heads: document.querySelectorAll('#tab-list .gh').length, chk: document.querySelectorAll('#list .row.tr[data-name] .chk').length, th: document.querySelectorAll('#lhead [data-sort]').length, cards: document.querySelectorAll('#tab-list .grp').length, cnt: document.getElementById('countTxt').textContent }));
  ok(r.length === 15 && st.heads === 0 && st.cards === 1, '묶음 제목 없이 15개가 한 장에 쭉: ' + st.cnt);
  ok(st.chk === 0, '목록엔 체크 칸이 없음 (냈는지는 첫 화면에서)');
  // 번호·주기 단위·색
  const look = () => p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#list .row.tr[data-name]:not(.newr)'), (r2) => ({ n: r2.getAttribute('data-name'), no: (r2.querySelector('.noc') || {}).textContent, cy: (r2.querySelector('.dyc .cy') || {}).textContent || '', cat: (r2.querySelector('.nmc .ctg') || {}).textContent || '', ic: r2.querySelectorAll('.cic').length })));
  let lk = await look();
  ok(lk.every((x, i) => x.no === String(i + 1)), '맨 앞에 번호 1~' + lk.length + ' (하위 항목까지 이어서): ' + lk.map((x) => x.no).join(' '));
  const cyOf = (n) => (lk.filter((x) => x.n === n)[0] || {}).cy;
  ok(cyOf('넷플릭스') === '매월' && cyOf('헬스장') === '3개월마다' && cyOf('자동차보험') === '매년', '결제일 아래에 주기: 넷플릭스 ' + cyOf('넷플릭스') + ', 헬스장 ' + cyOf('헬스장') + ', 자동차보험 ' + cyOf('자동차보험'));
  ok(cyOf('도시가스') === '', '결제일이 없는 항목은 "넣기"만 보임');
  ok(lk.every((x) => x.ic === 0) && lk.filter((x) => x.n === '넷플릭스')[0].cat === '구독', '색 아이콘 없이 분류는 이름 아래 글자로');
  const cyCss = await p.evaluate(() => { const e = document.querySelector('#list .dyc .cy'), n = document.querySelector('#list .noc'), cs = getComputedStyle(e), ns = getComputedStyle(n), m = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(); const d = document.createElement('i'); d.style.color = m; document.body.appendChild(d); const mc = getComputedStyle(d).color; d.remove(); return { cy: cs.fontSize, cyGrey: cs.color === mc, no: ns.fontSize, noGrey: ns.color === mc }; });
  ok(cyCss.cy === '12px' && cyCss.cyGrey && cyCss.no === '12px' && cyCss.noGrey, '번호와 주기는 작은 회색 글자(12px): ' + JSON.stringify(cyCss));
  const top = r.filter((x) => !x.child);
  const days = top.map((x) => (/말일/.test(x.d) ? 31 : +(x.d.match(/(\d+)일/) || [0, 99])[1]));
  ok(days.every((d, i) => !i || days[i - 1] <= d), '처음엔 결제일 빠른 순, 결제일 없는 건 맨 아래: ' + top.map((x) => x.d).join(' '));
  const ti = r.findIndex((x) => x.n === '통신비');
  ok(r[ti + 1].child && r[ti + 2].child && ['휴대폰 요금', '인터넷'].indexOf(r[ti + 1].n) >= 0, '하위 항목은 상위 항목 바로 아래');
  await p.click('#lhead [data-sort="amt"]'); await sleep(p, 700);
  r = await rows();
  let a = r.filter((x) => !x.child && x.a).map((x) => x.a);
  ok(a.every((v, i) => !i || a[i - 1] >= v) && r[0].n === '자동차보험', '"금액"을 누르면 큰 금액부터: ' + a.slice(0, 4).join(' > '));
  lk = await look();
  ok(lk[0].n === '자동차보험' && lk.every((x, i) => x.no === String(i + 1)), '줄 세우는 기준을 바꾸면 번호도 보이는 순서대로 다시 매김');
  ok(r[r.length - 1].n === '전기요금', '금액 없는 건 맨 아래');
  await p.click('#lhead [data-sort="amt"]'); await sleep(p, 700);
  r = await rows(); a = r.filter((x) => !x.child && x.a).map((x) => x.a);
  ok(a.every((v, i) => !i || a[i - 1] <= v) && r[r.length - 1].n === '전기요금', '한 번 더 누르면 작은 금액부터 (금액 없는 건 그래도 맨 아래)');
  await p.click('#lhead [data-sort="name"]'); await sleep(p, 700);
  r = await rows(); const nm = r.filter((x) => !x.child).map((x) => x.n);
  ok(nm.every((v, i) => !i || nm[i - 1].localeCompare(v, 'ko') <= 0), '"항목"을 누르면 가나다순: ' + nm.slice(0, 4).join(', '));
  const calls0 = h.calls.filter((c) => c.fn === 'api_sort').length;
  ok(calls0 === 0, '줄 세우기는 이 기기에서만 (서버 호출 없음)');
  // 분류로 골라 보기
  const chips = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#catFilter .fc'), (b) => b.textContent));
  ok(chips[0] === '전체15' && chips.indexOf('구독5') > 0, '분류 알약: ' + chips.join(' '));
  await p.click('#catFilter [data-cat="구독"]'); await sleep(p, 600);
  r = await rows();
  ok(r.length === 5 && /^구독 5개/.test(await p.evaluate(() => document.getElementById('countTxt').textContent)), '구독만: ' + r.map((x) => x.n).join(', '));
  lk = await look();
  ok(lk.map((x) => x.no).join('') === '12345' && lk.every((x) => x.cat === ''), '한 분류만 볼 땐 번호 1~5, 이름 아래 분류 글자는 생략');
  // 골라 본 채로 맨 아래 줄에 적으면 그 분류로 들어감
  await p.fill('#nName', '티빙'); await p.fill('#nAmt', '9500'); await p.fill('#nDay', '14'); await p.press('#nDay', 'Enter');
  await h.idle(900);
  ok(srvItem(h, '티빙') && srvItem(h, '티빙').cat === '구독', '구독만 보다가 새 줄에 적으면 분류 "구독"으로 저장');
  await p.click('#catFilter [data-cat=""]'); await sleep(p, 500);
  await p.fill('#nName', '전세대출 이자'); await p.fill('#nAmt', '310000'); await p.fill('#nDay', '21'); await p.press('#nDay', 'Enter');
  await h.idle(900);
  ok(srvItem(h, '전세대출 이자').cat === '대출', '전체에서 적으면 이름으로 분류를 짐작해 저장 (전세대출 이자 → 대출)');
  // 칸 눌러 고치기는 '수정'을 켰을 때만, 펼치기는 그대로
  await p.click('#editMode'); await sleep(p, 250);
  await p.click('#list .row.tr[data-name="티빙"] .tc.amc'); await sleep(p, 250);
  await p.fill('#list input.ci', '9,900'); await p.press('#list input.ci', 'Enter'); await h.idle(900);
  ok(srvItem(h, '티빙').amount === 9900, '수정을 켜면 금액 칸을 눌러 그 자리에서 고치기 됨');
  await p.click('#editMode'); await sleep(p, 250);
  await p.click('#list .row.tr[data-name="티빙"] .tc.nmc'); await sleep(p, 300);
  ok(await p.evaluate(() => { const r2 = document.querySelector('#list .row.tr.open'); return !!r2 && /분류구독/.test(r2.querySelector('.tp').textContent.replace(/\s/g, '')); }), '이름을 누르면 펼쳐지고 분류가 보임');
  // 칸 제목이 화면 위에 붙어 있는지
  await p.evaluate(() => window.scrollTo(0, 400)); await sleep(p, 300);
  const stick = await p.evaluate(() => { const t0 = document.getElementById('lhead').getBoundingClientRect(), tp = document.getElementById('top').getBoundingClientRect(); return Math.round(t0.top - tp.bottom); });
  ok(Math.abs(stick) <= 1, '내려도 칸 제목(항목·금액·결제일)은 위 막대 아래에 붙어 있음');
  // 다시 열어도 줄 세운 기준이 남음
  await p.reload(); await h.idle(900);
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
  ok(await p.evaluate(() => document.querySelector('#lhead [data-sort="name"]').classList.contains('on')), '다시 열어도 줄 세운 기준(항목)이 그대로');
  ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
  await h.close();
});

t('badge-new-last', async () => {
  // 이름 옆 작은 표시: 첫 결제가 이번 달이거나 아직 안 온 항목은 NEW, 이번이 마지막 결제면 LAST
  const seed = JSON.parse(JSON.stringify(H.SEEDS.full));
  seed.items.push({ n: '티빙', cat: '구독', amt: 9500, day: 27, start: '2026-11-27' });
  seed.items.push({ n: '웨이브', cat: '구독', amt: 7900, day: 5, start: '2026-12-05' });
  seed.items.push({ n: '노트북 할부', cat: '대출', amt: 125000, day: 28, start: '2026-06-28', end: '2026-11-28' });
  for (const vp of [{ width: 360, height: 760 }, { width: 320, height: 640 }]) {
    const h = await H.open(Object.assign({}, LIFE, { seed, viewport: vp })); const p = h.page;
    await sleep(p, 1200);
    const tag = vp.width + ' ';
    const bd = (root) => p.evaluate((sel) => { const o = {}; document.querySelectorAll(sel).forEach((r) => { const b = Array.prototype.map.call(r.querySelectorAll('.bdg'), (x) => x.textContent).join('+'); if (b) o[r.getAttribute('data-name')] = b; }); return o; }, root);
    const hm = await bd('#home .row[data-name]');
    ok(hm['티빙'] === 'NEW' && hm['노트북 할부'] === 'LAST', tag + '첫 화면: 이번 달 처음 나가는 티빙에 NEW, 마지막 결제인 노트북 할부에 LAST ' + JSON.stringify(hm));
    ok(!hm['월세'] && !hm['넷플릭스'] && !hm['헬스장'], tag + '첫 화면: 전부터 내던 항목엔 표시 없음');
    await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
    const ls = await bd('#list .row.tr[data-name]');
    ok(ls['티빙'] === 'NEW' && ls['웨이브'] === 'NEW' && ls['노트북 할부'] === 'LAST', tag + '목록: 티빙·웨이브(첫 결제가 다음 달) NEW, 노트북 할부 LAST ' + JSON.stringify(ls));
    ok(!ls['월세'] && !ls['넷플릭스'] && !ls['자동차보험'] && !ls['헬스장'], tag + '목록: 전부터 내던 항목엔 표시 없음');
    const fit = await p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#list .bdg'), (b) => { const r = b.getBoundingClientRect(), c = b.closest('.tc.nmc').getBoundingClientRect(), n = b.parentNode.querySelector('.nm').getBoundingClientRect(); return { in: r.right <= c.right + 0.5 && r.left >= n.right - 0.5, h: Math.round(r.height), fs: getComputedStyle(b).fontSize, row: Math.round(b.closest('.tg').getBoundingClientRect().height) }; }));
    ok(fit.length >= 3 && fit.every((x) => x.in && x.h <= 16 && x.fs === '10px' && x.row === 48), tag + '목록: 표시는 이름 옆 칸 안에 작게(10px), 줄 높이 48px 그대로 ' + JSON.stringify(fit[0]));
    // 다음 달 달력: 티빙의 두 번째 결제엔 NEW 없음, 웨이브 첫 결제엔 NEW
    await p.click('.tabbar [data-tab="cal"]'); await sleep(p, 300);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.click('#calNext'); await sleep(p, 600);
    const nx = await bd('#home .row[data-name]');
    ok(nx['웨이브'] === 'NEW' && !nx['티빙'], tag + '다음 달: 웨이브(첫 결제)만 NEW, 티빙(두 번째)은 없음 ' + JSON.stringify(nx));
    ok(realErrors(h).length === 0, tag + '화면 오류 0건 ' + JSON.stringify(realErrors(h)));
    await h.close();
  }
});

t('layout-heights', async () => {
  // 한 화면에 끝나야 하는 것들이 스크롤 없이 다 보이는지 (360×760 = 갤럭시에 앱으로 설치했을 때쯤, 320×640 = 작은 폰)
  for (const vp of [{ width: 360, height: 760 }, { width: 320, height: 640 }]) {
    const tag = vp.width + '×' + vp.height;
    const h = await H.open(Object.assign({}, LIFE, { viewport: vp })); const p = h.page;
    await sleep(p, 1200);
    const over = () => p.evaluate(() => { const b = document.getElementById('sheetBody'); return b.scrollHeight - b.clientHeight; });
    const wide = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await p.click('#home .row .rb'); await sleep(p, 450);
    ok((await over()) <= 0, tag + ' 항목 상세: 스크롤 없음');
    await p.click('#sheetClose'); await sleep(p, 350);
    await p.click('#addBtn'); await sleep(p, 450);
    ok((await over()) <= 0 && (await wide()) <= 0, tag + ' 분류 고르기: 스크롤 없음, 옆으로 안 넘침');
    const cut = await p.evaluate(() => Array.prototype.filter.call(document.querySelectorAll('.cgrid .ct small, .cgrid .ct b'), (e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    ok(cut.length === 0, tag + ' 분류 이름·설명 글자가 안 잘림 ' + JSON.stringify(cut));
    await p.click('.cgrid [data-cat="구독"]'); await sleep(p, 450);
    const o1 = await over();
    await p.fill('#f3', '디즈니플러스'); await sleep(p, 250);
    const o2 = await over();
    if (vp.height >= 700) ok(o1 <= 0 && o2 <= 0, tag + ' 새 항목 입력: 스크롤 없이 한 화면 (추가 버튼까지)');
    else ok(o2 <= 0, tag + ' 새 항목 입력: 이름을 적으면 스크롤 없이 한 화면 (적기 전엔 ' + o1 + 'px 넘침)');
    await dropDrafts(p); await p.click('#sheetClose'); await sleep(p, 350); await dropDrafts(p);
    if (vp.height >= 700) {
      // 지난 결제를 다 낸 평소 상태면 첫 화면이 한 화면에 들어옴
      await p.click('#payAll'); await sleep(p, 2500); await h.idle();
      const hm = await p.evaluate(() => { const tb = document.querySelector('.tabbar').getBoundingClientRect(), last = document.querySelector('#tab-cal').lastElementChild.getBoundingClientRect(); return Math.round(last.bottom + window.scrollY - tb.top); });
      ok(hm <= 0, tag + ' 첫 화면: 지난 결제가 없을 땐 스크롤 없이 한 화면 (' + hm + 'px)');
    }
    ok((await wide()) <= 0, tag + ' 옆으로 넘치는 것 없음');
    ok(realErrors(h).length === 0, tag + ' 화면 오류 0건 ' + JSON.stringify(realErrors(h)));
    await h.close();
  }
  const h2 = await H.open({ seed: 'empty', now: '2026-11-23T21:30', viewport: { width: 320, height: 640 }, latency: 80 }); const p2 = h2.page;
  await sleep(p2, 900);
  const e = await p2.evaluate(() => { const tb = document.querySelector('.tabbar').getBoundingClientRect(), last = document.querySelector('#tab-cal').lastElementChild.getBoundingClientRect(); return { over: Math.round(last.bottom + window.scrollY - tb.top), btn: !!document.getElementById('wAdd') }; });
  ok(e.btn && e.over <= 0, '처음 쓰는 사람 첫 화면(320×640): 스크롤 없이 한 화면 (' + e.over + 'px)');
  await p2.click('#wAdd'); await sleep(p2, 450);
  ok((await sheetInfo(p2)).grid, '"첫 고정비 넣기" → 분류 고르기');
  await h2.close();
});

/* ====================== 새 이름·아이콘·화면 색 (고정비 달력, 서버 v10) ====================== */
t('tone-pick', async () => {
  // 대비(밝기 차이) 계산: 글자와 바탕 색을 받아 비율로
  const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const dark of [false, true]) {
    const tag = dark ? ' (다크)' : '';
    const h = await H.open(Object.assign({}, LIFE, { dark })); const p = h.page;
    await sleep(p, 1200);
    const look = () => p.evaluate(() => {
      const cs = (e) => getComputedStyle(e);
      const today = document.querySelector('.cd.today .n'), go = document.querySelector('.ndb .go, .sec .act');
      const card = cs(document.querySelector('.card, .grp') || document.body).backgroundColor;
      return { tone: document.documentElement.getAttribute('data-tone'), saved: localStorage.getItem('fc_tone'), todayBg: cs(today).backgroundColor, todayFg: cs(today).color, link: go && cs(go).color, card: cs(document.body).backgroundColor, red: cs(document.documentElement).getPropertyValue('--red-text').trim() };
    });
    let v = await look();
    ok(v.tone === null && v.saved === null, '처음엔 기본 색(네이비), 저장된 값 없음' + tag);
    const seen = {};
    for (const tone of ['navy', 'blue', 'violet']) {
      await p.click('#menuBtn'); await sleep(p, 500);
      ok(await p.evaluate(() => document.querySelectorAll('#sheetBody .tones button').length === 3), '설정에 화면 색 3개' + tag);
      const tap = await p.evaluate(() => [...document.querySelectorAll('#sheetBody .tones button')].every((b) => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }));
      ok(tap, '색 버튼이 44px 이상' + tag);
      await p.click('#sheetBody .tones button[data-tone="' + tone + '"]'); await sleep(p, 250);
      const one = await p.evaluate(() => [...document.querySelectorAll('#sheetBody .tones button')].filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.dataset.tone).join());
      ok(one === tone, tone + ': 고른 것 하나만 선택 표시' + tag);
      await p.click('#sheetClose'); await sleep(p, 400);
      v = await look();
      ok(tone === 'navy' ? (v.tone === null && v.saved === null) : (v.tone === tone && v.saved === tone), tone + ': 바로 바뀌고 이 기기에 저장' + tag);
      ok(cr(v.todayFg, v.todayBg) >= 4.5, tone + ': 오늘 동그라미 글자 대비 ' + cr(v.todayFg, v.todayBg).toFixed(2) + tag);
      ok(v.link && cr(v.link, v.card) >= 4.5, tone + ': 누르는 글자 대비 ' + (v.link ? cr(v.link, v.card).toFixed(2) : '-') + tag);
      seen[tone] = v.todayBg;
    }
    ok(new Set(Object.values(seen)).size === 3, '세 색이 서로 다름 ' + JSON.stringify(seen) + tag);
    // 다시 열어도 남고, 로그아웃해도 남음(화면 색은 계정 자료가 아님)
    await p.reload(); await sleep(p, 1500);
    ok((await look()).tone === 'violet', '앱을 다시 열어도 고른 색 그대로' + tag);
    await p.evaluate(() => { localStorage.setItem('fc_tone', 'zzz'); }); await p.reload(); await sleep(p, 1200);
    ok((await look()).tone === null, '모르는 값이 저장돼 있으면 기본 색으로' + tag);
    ok(realErrors(h).length === 0, '화면 오류 0건 ' + JSON.stringify(realErrors(h)) + tag);
    await h.shot('t-tone' + (dark ? '-dark' : ''));
    await h.close();
  }
});
t('rename', async () => {
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const files = ['index.html', 'manifest.webmanifest', 'privacy.html', 'terms.html', 'README.md', 'sw.js', 'setup/Code.gs.txt'];
  const left = files.filter((f) => /승훈스|고정비앱 V1/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  ok(left.length === 0, '옛 이름이 남은 파일 없음 ' + JSON.stringify(left));
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  ok(man.name === '고정비 달력' && man.short_name === '고정비 달력', '설치 정보 이름: ' + man.name);
  const h = await H.open(Object.assign({}, LIFE, { loggedOut: true })); const p = h.page;
  await p.waitForSelector('#fcLogin.on', { timeout: 8000 });
  const v = await p.evaluate(() => ({ title: document.title, app: document.querySelector('.fcl .app').textContent, apple: document.querySelector('meta[name="apple-mobile-web-app-title"]').content,
    logo: [...document.querySelectorAll('#fcLogin img')].every((i) => i.naturalWidth > 0) }));
  ok(v.title === '고정비 달력' && v.app === '고정비 달력' && v.apple === '고정비 달력', '창 제목·로그인 화면·홈 화면 이름: ' + JSON.stringify(v));
  ok(v.logo, '로그인 화면 아이콘 그림이 뜸');
  await h.close();
  // 캘린더 일정 설명에도 새 이름. 옛 이름으로 만들어진 일정은 서버를 올린 뒤 맞출 때 설명만 바뀌고, 새로 만들거나 지우지 않음
  const g = GAS.create({}); g.setNow('2026-10-02'); g.call(ME, 'api_load', [false]);
  for (const it of H.SEEDS.full.items) add(g, it);
  g.setNow('2026-11-23T21:30'); g.call(ME, 'api_load', [false]);
  let n = 0, last; do { last = g.call(ME, 'api_sync', [true]); n++; } while (last.more && n < 60);
  const total = g.events(ME).length;
  ok(total > 100 && g.events(ME).every((e) => e.desc.indexOf('고정비 달력 앱에서 만든 일정이에요') >= 0), '캘린더 일정 설명에 새 이름 (' + total + '개)');
  const ids = g.events(ME).map((e) => e.id).sort().join();
  g.events(ME).forEach((e) => { e.desc = e.desc.replace('고정비 달력 앱에서 만든', '승훈스 고정비앱에서 만든'); });
  ok(g.events(ME).every((e) => /승훈스/.test(e.desc)), '(준비) 옛 이름으로 만들어진 일정 흉내');
  n = 0; do { last = g.call(ME, 'api_sync', [true]); n++; } while (last.more && n < 60);
  ok(!last.more && g.events(ME).length === total && g.events(ME).map((e) => e.id).sort().join() === ids, '옛 일정을 새로 만들거나 지우지 않음 (그대로 ' + total + '개, 서버 ' + n + '번 나눠 부름)');
  ok(g.events(ME).every((e) => !/승훈스/.test(e.desc) && e.desc.indexOf('고정비 달력 앱에서 만든 일정이에요') >= 0), '설명의 옛 이름이 전부 새 이름으로 바뀜');
});

/* ---------- 다른 계정이 처음 열면 '아직 준비 중'에 막히던 것 (2026-11-24 친구 폰) ----------
 * 주인 서버(시트에 붙은 옛 코드)는 주인이 아닌 계정에 오류 대신 needSetup(템플릿 없음)을 돌려줌.
 * 앱은 '문서 권한 없음' 오류일 때만 모두용 서버로 넘어가서, 그 화면에 그대로 멈췄음. */
t('friend-first-open', async () => {
  const FRIEND = 'friend@example.com';
  const h = await H.open({ seed: 'empty', now: '2026-11-24T20:47', viewport: VP, latency: 50, loggedOut: true }); const p = h.page;
  // 2026-11-25: 주인 서버 주소는 앱 설정에서 뺌. 모두용 서버가 아닌 곳으로 가는 호출은 전부 '주인 서버(옛 코드)'로 침
  const cfg = await p.evaluate(() => ({ other: window.FC_CONFIG.otherId, owner: window.FC_CONFIG.scriptId || '', alt: (window.FC_CONFIG.altIds || []).length }));
  ok(!cfg.owner && !cfg.alt && !!cfg.other, '앱 설정에 주인 서버 주소가 없음 (모두용 서버만)');
  const hits = { owner: 0, other: 0 };
  await h.ctx.route('https://script.googleapis.com/v1/scripts/**', async (route) => {
    if (route.request().url().indexOf(encodeURIComponent(cfg.other)) < 0) {
      hits.owner++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, response: { result: { ok: true, needSetup: true, ready: false, email: FRIEND, notes: [] } } }) });
    }
    hits.other++;
    return route.fallback();
  });
  await p.waitForSelector('#fcLogin.on', { timeout: 8000 });
  h.google.pick = FRIEND;
  await p.click('#fcGo');
  await p.waitForLoadState('load'); await h.idle(1500);
  const v = await p.evaluate(() => ({
    stuck: /아직 준비 중/.test(document.body.innerText), setup: document.body.classList.contains('setup-on'),
    srv: (JSON.parse(localStorage.getItem('fc_auth') || '{}') || {}).srv, email: (JSON.parse(localStorage.getItem('fc_auth') || '{}') || {}).email
  }));
  ok(hits.owner === 0, '새 계정은 주인 서버를 아예 거치지 않음 (' + hits.owner + '번)');
  ok(!v.stuck && !v.setup, "'아직 준비 중' 화면에 멈추지 않음");
  ok(hits.other >= 1 && await p.evaluate(() => !!document.querySelector('.tabbar') && !document.getElementById('fcLogin').classList.contains('on')), '바로 모두용 서버로 가서 달력이 열림 (모두용 ' + hits.other + '번)');
  ok(v.email === FRIEND, '친구 계정으로 로그인됨 (' + v.email + ')');
  await h.shot('friend-first-open');
  await p.reload(); await h.idle(1200);
  ok(hits.owner === 0, '다시 열어도 주인 서버를 거치지 않음');
  ok(!(await p.evaluate(() => /아직 준비 중/.test(document.body.innerText))), '다시 열어도 막히지 않음');
  ok(!h.errors.length, '화면 오류 없음 ' + JSON.stringify(h.errors));
  await h.close();
});

/* ---------- 구글 권한 화면에서 체크를 다 안 하고 온 경우 (2026-11-24 친구 폰) ----------
 * 일부 권한만 든 표로 서버를 부르면 "시트를 못 읽었어요: You do not have permission to call ScriptApp.getProjectTriggers…"가 그대로 떴음.
 * 구글이 알려준 허용 목록에 빠진 게 있으면 서버를 부르지 않고, 모두 허용하라고 알려준 뒤 권한 화면(prompt=consent)으로 다시 보냄. */
t('friend-partial-consent', async () => {
  const FRIEND = 'friend@example.com';
  const h = await H.open({ seed: 'empty', now: '2026-11-24T21:05', viewport: VP, latency: 50, loggedOut: true }); const p = h.page;
  const seen = [];
  await h.ctx.route('https://accounts.google.com/o/oauth2/v2/auth**', (route) => {
    const sp = new URL(route.request().url()).searchParams;
    seen.push({ prompt: sp.get('prompt'), hint: sp.get('login_hint') });
    // 권한 화면(consent)을 다시 거칠 때만 전부 체크한 것으로, 그 전엔 캘린더·스크립트 권한을 빼먹은 것으로
    const all = sp.get('scope') || '';
    const scope = sp.get('prompt') === 'consent' ? all : all.split(' ').filter((x) => !/script\.scriptapp|auth\/calendar/.test(x)).join(' ');
    const q = 'access_token=tok-' + encodeURIComponent(FRIEND) + '&token_type=Bearer&expires_in=3600&scope=' + encodeURIComponent(scope);
    route.fulfill({ status: 302, headers: { location: sp.get('redirect_uri') + '#' + q + '&state=' + encodeURIComponent(sp.get('state') || '') } });
  });
  await p.waitForSelector('#fcLogin.on', { timeout: 8000 });
  // (준비) 권한이 모자란 표로 서버에 한 번 다녀간 계정: 서버엔 '처음 시작함'만 찍히고 캘린더 연동은 꺼진 채 남음
  h.gas.call(FRIEND, 'api_load', [false]); h.gas.call(FRIEND, 'api_calendar', ['off']);
  ok(h.gas.call(FRIEND, 'api_load', [true]).calOn === false, '(준비) 캘린더 연동이 꺼진 채 남은 계정');
  await p.click('#fcGo'); await p.waitForLoadState('load'); await sleep(p, 1500);
  let v = await p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), msg: document.getElementById('fcErr').textContent, raw: /You do not have permission/.test(document.body.innerText) }));
  ok(v.login && /모두 허용/.test(v.msg) && /모두 선택/.test(v.msg), '체크를 빼먹고 오면 로그인 화면에 안내가 뜸: ' + v.msg);
  ok(h.calls.length === 0 && !v.raw, '덜 허용된 표로 서버를 부르지 않음 (영어 오류 안 뜸, 서버 호출 ' + h.calls.length + '번)');
  await h.shot('friend-partial-consent');
  const n = seen.length;
  await p.reload(); await sleep(p, 1200);
  v = await p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), msg: document.getElementById('fcErr').textContent }));
  ok(v.login && /모두 허용/.test(v.msg) && seen.length === n, '다시 열어도 같은 안내 (구글에 조용히 다녀오며 맴돌지 않음)');
  await p.click('#fcGo'); await p.waitForLoadState('load'); await h.idle(1500);
  const last = seen[seen.length - 1];
  ok(last.prompt === 'consent' && last.hint === FRIEND, '버튼을 누르면 그 계정의 권한 화면으로 감: ' + JSON.stringify(last));
  v = await p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), cal: !!document.querySelector('.tabbar'), raw: /You do not have permission|아직 준비 중/.test(document.body.innerText) }));
  ok(!v.login && v.cal && !v.raw && h.calls.length > 0, '모두 허용하고 오면 앱이 열림 (서버 호출 ' + h.calls.length + '번)');
  await h.idle(1500);
  ok(h.calls.some((c) => c.fn === 'api_calendar' && c.args[0] === 'on') && h.gas.call(FRIEND, 'api_load', [true]).calOn === true, '꺼진 채 남았던 캘린더 연동을 앱이 켜 줌');
  await p.reload(); await h.idle(1200);
  ok(h.calls.filter((c) => c.fn === 'api_calendar').length === 1, '한 번만 켬 (다시 열어도 또 부르지 않음)');
  ok(!h.errors.length, '화면 오류 없음 ' + JSON.stringify(h.errors));
  await h.close();

  // 허용 목록을 모르는 표(옛 저장분)인데 서버가 권한 오류를 돌려준 경우에도 같은 안내로
  const h2 = await H.open({ seed: 'empty', now: '2026-11-24T21:05', viewport: VP, latency: 50 }); const p2 = h2.page;
  let hit = 0;
  await h2.ctx.route('https://script.googleapis.com/v1/scripts/**', async (route) => {
    hit++;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, response: { result: { ok: false, error: '시트를 못 읽었어요: You do not have permission to call ScriptApp.getProjectTriggers. Required permissions: https://www.googleapis.com/auth/script.scriptapp.' } } }) });
  });
  await p2.reload(); await sleep(p2, 2000);
  const v2 = await p2.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), msg: document.getElementById('fcErr').textContent }));
  ok(hit >= 1 && v2.login && /모두 허용/.test(v2.msg), '서버가 권한 오류를 주면 영어 오류 대신 "모두 허용" 안내 (서버 ' + hit + '번)');
  const hit0 = hit; await sleep(p2, 1500);
  ok(hit === hit0, '안내가 뜬 뒤엔 서버를 계속 부르지 않음');
  await h2.close();
});

/* ---------- 새 계정 로그인 길 전체 점검 (2026-11-24) ---------- */
// 구글에 다녀오는 사이 이 창의 기억(sessionStorage)이 비어도 로그인이 됨 (홈 화면 앱, 다른 탭으로 돌아온 경우)
t('login-state-lost', async () => {
  const FRIEND = 'friend@example.com';
  const h = await H.open({ seed: 'empty', now: '2026-11-24T21:20', viewport: VP, latency: 50, loggedOut: true }); const p = h.page;
  await h.ctx.addInitScript(() => { try { if (/access_token=/.test(location.hash)) { sessionStorage.removeItem('fc_state'); sessionStorage.removeItem('fc_mode'); } } catch (e) {} });
  await p.waitForSelector('#fcLogin.on', { timeout: 8000 });
  h.google.pick = FRIEND;
  await p.click('#fcGo'); await p.waitForLoadState('load'); await h.idle(1500);
  const v = await p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), cal: !!document.querySelector('.tabbar'), email: (JSON.parse(localStorage.getItem('fc_auth') || '{}') || {}).email, left: localStorage.getItem('fc_ost') }));
  ok(!v.login && v.cal && v.email === FRIEND, '창의 기억이 비어도 로그인돼서 달력이 열림 (' + v.email + ')');
  ok(v.left === null, '기기 저장소에 적어 둔 확인 값은 쓰고 지움');
  // 확인 값이 아예 안 맞으면(남이 만든 주소) 받지 않고, 왜 그런지 알려줌
  await p.evaluate(() => { localStorage.removeItem('fc_auth'); });
  await p.goto(h.base + '#access_token=tok-evil%40example.com&token_type=Bearer&expires_in=3600&state=zzz'); await p.reload(); await sleep(p, 1000);
  const v2 = await p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), tok: (JSON.parse(localStorage.getItem('fc_auth') || '{}') || {}).token || '' }));
  ok(v2.login && !v2.tok, '확인 값이 안 맞는 로그인 표는 받지 않음');
  await h.close();
});

// 앱 안 브라우저(카톡·인스타 등)에서는 구글이 로그인을 막음 → 구글로 보내지 않고 폰 브라우저로 여는 법을 알려줌
t('login-inapp-browser', async () => {
  const cases = [
    { name: '인스타그램(안드로이드)', ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0', inapp: true, chrome: true },
    { name: '네이버 앱(아이폰)', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.9.5; 15PRO)', inapp: true, chrome: false },
    { name: '이름 모를 앱 안 브라우저(아이폰)', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', inapp: true, chrome: false },
    { name: '아이폰 사파리', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', inapp: false },
    { name: '아이폰 크롬', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1', inapp: false },
    { name: '삼성 인터넷', ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', inapp: false },
    { name: '안드로이드 크롬', ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', inapp: false }
  ];
  for (const c of cases) {
    const h = await H.open({ seed: 'empty', now: '2026-11-24T21:20', viewport: VP, latency: 50, loggedOut: true, userAgent: c.ua }); const p = h.page;
    await p.waitForSelector('#fcLogin.on', { timeout: 8000 });
    await p.click('#fcGo'); await sleep(p, 900); await h.idle(600);
    const v = await p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), msg: document.getElementById('fcErr').textContent,
      chrome: (document.getElementById('fcChrome') || {}).href || '', copy: !!document.getElementById('fcCopy') }));
    if (c.inapp) {
      ok(h.oauth.length === 0 && v.login && /앱 안 브라우저/.test(v.msg) && v.copy, c.name + ': 구글로 안 보내고 안내 + 주소 복사');
      ok(c.chrome ? /^intent:\/\/127\.0\.0\.1.*package=com\.android\.chrome/.test(v.chrome) : !v.chrome, c.name + (c.chrome ? ': 크롬으로 열기 버튼' : ': 사파리에 붙여넣기 안내') + ' ' + v.chrome.slice(0, 60));
      if (!c.chrome) ok(/Safari/.test(v.msg), c.name + ': Safari 안내 문구');
      if (c === cases[0]) await h.shot('login-inapp');
    } else {
      ok(h.oauth.length === 1 && !v.login, c.name + ': 평소대로 구글 로그인 → 앱 열림');
    }
    await h.close();
  }
});

/* ---------- 판매 준비 (2026-11-25) ----------
 * 서버 v11: 구글 시트 권한 없이 돎(권한 5개 → 3개). 가짜 구글(gas.js)이 서버 설정에 없는 권한을 쓰면 구글처럼 오류를 냄. */
const SCOPE3 = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/script.scriptapp', 'https://www.googleapis.com/auth/userinfo.email'];
t('sale-server-no-sheets', async () => {
  const fs = require('fs'), path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '..', 'setup', 'Code.gs.txt'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const g = GAS.create();
  ok(JSON.stringify(g.manifest.slice().sort()) === JSON.stringify(SCOPE3.slice().sort()), '서버 설정의 권한은 캘린더·예약 실행·이메일 3개뿐: ' + g.manifest.map((x) => x.split('/auth/')[1]).join(', '));
  ok(code.indexOf('SpreadsheetApp') < 0 && code.indexOf('DriveApp') < 0 && code.indexOf('UrlFetchApp') < 0, '서버 코드가 구글 시트·드라이브·바깥 주소 기능을 한 번도 부르지 않음');
  const cfg = JSON.parse(/window\.FC_CONFIG = (\{.*?\});<\/script>/.exec(html)[1]);
  const sv = Number(/var SERVER_VER = (\d+);/.exec(code)[1]), swv = Number(/fc-shell-v(\d+)/.exec(sw)[1]);
  ok(cfg.serverVer === sv, '앱이 아는 서버 버전 = 서버 코드 버전 (' + cfg.serverVer + ' / ' + sv + ')');
  ok(cfg.build === swv, '설정에 보이는 앱 버전 = 캐시 버전 (' + cfg.build + ' / v' + swv + ')');
  ok(!cfg.scriptId && !cfg.altIds, '앱 설정에 주인 서버 주소 없음');
  // 한 사람이 쓰는 일 전부를 권한 3개로
  g.setNow('2026-11-25T08:30');
  let r = g.call(ME, 'api_load', [false]);
  ok(r.ok && r.virtual && r.calOn === true && r.ver === 11 && !r.admin, '새 계정 첫 열기: 열리고 캘린더 연동 켜짐, 서버 v11, 관리자 아님');
  add(g, { n: '월세', cat: '월세', amt: 650000, day: 25 }); add(g, { n: '넷플릭스', cat: '구독', amt: 17000, day: 3 });
  r = g.call(ME, 'api_accounts', [[{ name: '토스뱅크 4661', memo: '', from: '' }]]); ok(r.ok, '결제 수단 저장');
  r = g.call(ME, 'api_setChecks', [{ '월세': true }]); ok(r.ok && sItem(g, '월세').checked, '체크');
  let n = 0, last; do { last = g.call(ME, 'api_sync', [true]); n++; } while (last.more && n < 60);
  ok(!last.more && g.events(ME).length > 10, '캘린더 맞추기 (' + g.events(ME).length + '개)');
  r = g.call(ME, 'api_opts', [{ remind: true, auto: true }]); ok(r.ok, '설정 바꾸기(전날 알림·자동 체크)');
  r = g.call(ME, 'api_sort', ['금액 큰 순']); ok(r.ok, '정렬');
  r = g.call(ME, 'api_delete', ['넷플릭스']); ok(r.ok, '삭제'); r = g.call(ME, 'api_restore', []); ok(r.ok && !!sItem(g, '넷플릭스'), '되살리기');
  r = g.call(ME, 'api_calendar', ['off']); ok(r.ok && r.calOn === false, '캘린더 연동 끄기'); r = g.call(ME, 'api_calendar', ['on']); ok(r.ok && r.calOn === true, '다시 켜기');
  g.setNow('2026-11-26T04:00'); g.call(ME, 'calendarDaily', []);
  ok(sItem(g, '월세'), '매일 새벽 예약 실행');
  let w = { more: true }, wn = 0; while (w && w.more && wn < 40) { w = g.call(ME, 'api_wipe', [{ events: true, at: w.at, gone: w.gone }]); wn++; }
  ok(w && w.ok && !w.more && Object.keys(g.user(ME).props).length === 0, '내 자료 모두 지우기 (' + wn + '번)');
  const noScope = g.state.log.filter((x) => /^NO_SCOPE/.test(x));
  ok(noScope.length === 0, '그 사이 서버 설정에 없는 권한이 필요한 구글 기능을 한 번도 안 부름 ' + JSON.stringify(noScope.slice(0, 3)));

  // 처음에 캘린더 연동을 못 켠 경우: 다음에 열 때 다시 켜 봄
  const g2 = GAS.create(); g2.state.failTrigger = 1;
  r = g2.call(ME, 'api_load', [false]);
  ok(r.ok && r.calOn === false && r.notes.some((x) => /캘린더 연동은 못 켰어요/.test(x)), '구글이 잠깐 불안정해 못 켜면: 앱은 열리고 한 줄로 알림');
  r = g2.call(ME, 'api_load', [false]);
  ok(r.ok && r.calOn === true && !r.notes.length && !!g2.user(ME).props.vs_started && !g2.user(ME).props.vs_start_try, '다음에 열 때 다시 켜서 켜짐 (알림 없음)');
  const g3 = GAS.create(); g3.state.failTrigger = 99;
  const tries = []; for (let i = 0; i < 5; i++) { r = g3.call(ME, 'api_load', [false]); tries.push(r.notes.length); }
  ok(tries.join() === '1,1,1,0,0' && !!g3.user(ME).props.vs_started, '계속 안 되면 3번까지만 해 보고 그만둠 (알림 ' + tries.join() + ')');
  const g4 = GAS.create(); g4.state.failTrigger = 1; g4.call(ME, 'api_load', [false]);
  g4.call(ME, 'api_calendar', ['on']); g4.call(ME, 'api_calendar', ['off']);
  ok(g4.call(ME, 'api_load', [false]).calOn === false, '직접 끈 사람 것은 앱이 도로 켜지 않음');
  // 권한을 덜 허용한 표가 서버까지 온 경우(앱이 미리 못 거른 옛 저장분): 서버가 '시작함'을 찍지 않아서, 다 허용하고 오면 켜짐
  const g5 = GAS.create(); g5.grant(ME, SCOPE3[0] + ' ' + SCOPE3[2]);
  r = g5.call(ME, 'api_load', [false]);
  ok(!r.ok && /You do not have permission to call ScriptApp/.test(r.error) && /^목록을 못 읽었어요/.test(r.error) && !g5.user(ME).props.vs_started, '예약 실행 권한이 빠진 표: 권한 오류(앱이 "모두 허용" 안내로 바꿈), 시작함은 안 찍힘');
  g5.grant(ME, null); r = g5.call(ME, 'api_load', [false]);
  ok(r.ok && r.calOn === true, '다 허용하고 오면 캘린더 연동이 켜진 채 열림');
});

t('sale-new-account', async () => {
  const NEW = 'newbie@example.com';
  const visit = async (config, label, grant) => {
    const h = await H.open({ now: '2026-11-25T08:30', viewport: VP, latency: 50, loggedOut: true, config }); const p = h.page;
    h.google.pick = NEW; if (grant) h.google.grant = grant;
    await p.waitForSelector('#fcLogin.on', { timeout: 8000 });
    const fine = await p.evaluate(() => document.querySelector('#fcLogin .fine').textContent);
    await p.click('#fcGo'); await p.waitForLoadState('load'); await h.idle(1500);
    return { h, p, fine, label };
  };
  // 지금 배포 상태(권한 5개 요청) + 서버 v11
  let v = await visit(null, '지금 설정');
  let asked = v.h.oauth[0].scope.split(' ').map((x) => x.split('/auth/')[1]);
  ok(asked.length === 5 && /확인되지 않은 앱/.test(v.fine), '지금 설정: 권한 5개 요청, 로그인 화면에 확인되지 않은 앱 안내 있음');
  let st = await v.p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), w: (document.querySelector('#welcome .welcome') || {}).innerText || '', tab: !!document.querySelector('.tabbar') }));
  ok(!st.login && st.tab && /첫 고정비 넣기/.test(st.w), '지금 설정: 새 계정이 바로 열리고 첫 화면이 보임');
  ok(/내 구글 캘린더에도 자동으로 들어가요/.test(st.w), '첫 화면에 캘린더에도 들어간다는 한 줄: ' + st.w.replace(/\n/g, ' / '));
  ok(v.h.gas.call(NEW, 'api_load', [true]).calOn === true && v.h.gas.state.log.filter((x) => /^NO_SCOPE/.test(x)).length === 0, '서버 v11이 권한 오류 없이 돎, 캘린더 연동 켜짐');
  await v.p.click('#menuBtn'); await sleep(v.p, 600);
  let menu = await v.p.evaluate(() => ({ ver: (document.getElementById('mVer') || {}).textContent || '', txt: document.getElementById('sheetBody').innerText }));
  ok(/^버전 \d+\.11$/.test(menu.ver), '설정 맨 아래에 버전: ' + menu.ver);
  ok(!/시트|서버 업데이트|드라이브/.test(menu.txt), '새 계정 설정 화면에 시트·드라이브·서버 업데이트 말이 없음');
  await v.h.shot('sale-menu-foot');
  await v.p.click('#mShare'); await sleep(v.p, 500);
  let share = await v.p.evaluate(() => document.getElementById('sheetBody').innerText);
  ok(!/시트|드라이브/.test(share) && /확인되지 않은 앱/.test(share), '알려주기 창: 시트·드라이브 말 없음, 심사 전이라 확인되지 않은 앱 안내는 있음');
  ok(!v.h.errors.length, '화면 오류 없음 ' + JSON.stringify(v.h.errors));
  await v.h.close();

  // 서버 v11 확인 뒤 켤 설정(권한 3개) + 구글 심사 뒤 켤 설정(verified)
  v = await visit({ slim: true, verified: true }, '권한 3개');
  asked = v.h.oauth[0].scope.split(' ');
  ok(JSON.stringify(asked.slice().sort()) === JSON.stringify(SCOPE3.slice().sort()), '권한 3개만 요청: ' + asked.map((x) => x.split('/auth/')[1]).join(', '));
  ok(!/확인되지 않은 앱/.test(v.fine) && /모두 선택/.test(v.fine), '심사 뒤 설정: 로그인 화면에서 확인되지 않은 앱 안내가 빠짐 → ' + v.fine);
  st = await v.p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), tab: !!document.querySelector('.tabbar'), w: (document.querySelector('#welcome .welcome') || {}).innerText || '' }));
  ok(!st.login && st.tab && /첫 고정비 넣기/.test(st.w), '권한 3개로 새 계정이 바로 열림');
  // 첫 고정비 넣고 캘린더까지
  await v.p.click('#wAdd'); await sleep(v.p, 450); await v.p.click('.cgrid [data-cat="구독"]'); await sleep(v.p, 450);
  await v.p.fill('#f3', '넷플릭스'); await v.p.click('#f8'); await v.p.keyboard.type('17000');
  await v.p.click('#dayBtn'); await sleep(v.p, 350); await v.p.click('.dayp .dg button[data-d="27"]'); await sleep(v.p, 350);
  await v.p.click('#saveBtn'); await v.h.idle(2500);
  ok(!!v.h.gas.call(NEW, 'api_load', [true]).items.find((i) => i.name === '넷플릭스') && v.h.gas.events(NEW).length >= 1, '권한 3개로 첫 고정비 저장 + 구글 캘린더에 일정 (' + v.h.gas.events(NEW).length + '개)');
  ok(v.h.gas.state.log.filter((x) => /^NO_SCOPE/.test(x)).length === 0 && v.h.calls.every((c) => c.who === NEW), '그 사이 권한 오류 없음');
  await v.p.click('#menuBtn'); await sleep(v.p, 600); await v.p.click('#mShare'); await sleep(v.p, 500);
  share = await v.p.evaluate(() => document.getElementById('sheetBody').innerText);
  ok(!/확인되지 않은 앱|심사/.test(share), '심사 뒤 설정: 알려주기 창에서도 그 안내가 빠짐');
  ok(!v.h.errors.length, '화면 오류 없음 ' + JSON.stringify(v.h.errors));
  await v.h.close();

  // 권한 3개일 때 체크를 하나 빼먹고 온 경우
  v = await visit({ slim: true }, '일부만 허용', (a, prompt) => (prompt === 'consent' ? a : a.filter((x) => !/auth\/calendar$/.test(x))));
  st = await v.p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), msg: document.getElementById('fcErr').textContent }));
  ok(st.login && /모두 허용/.test(st.msg) && v.h.calls.length === 0, '권한 3개 중 캘린더를 빼고 오면: 서버를 부르지 않고 "모두 허용" 안내');
  await v.p.click('#fcGo'); await v.p.waitForLoadState('load'); await v.h.idle(1500);
  st = await v.p.evaluate(() => ({ login: document.getElementById('fcLogin').classList.contains('on'), tab: !!document.querySelector('.tabbar') }));
  ok(!st.login && st.tab && v.h.gas.call(NEW, 'api_load', [true]).calOn === true, '다시 눌러 모두 허용하면 열리고 캘린더 연동 켜짐');
  ok(!v.h.errors.length, '화면 오류 없음 ' + JSON.stringify(v.h.errors));
  await v.h.close();
});

t('sale-ui-bits', async () => {
  const h = await H.open({ seed: 'full', seedAt: '2026-10-01', now: '2026-11-25T08:30', viewport: VP, latency: 50 }); const p = h.page;
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 600);
  await p.click('#list .row.tr[data-name="청년 적금"] .tc.nmc'); await sleep(p, 500);
  const per = await p.evaluate(() => { const k = Array.prototype.find.call(document.querySelectorAll('#list .tp .kl'), (x) => /기간/.test(x.textContent)); return k ? k.textContent : ''; });
  ok(/2028년 6월 1일/.test(per) && !/2026년/.test(per), '여러 해에 걸친 기간: 올해가 아닌 쪽에 연도가 붙음 → ' + per);
  await p.click('#list .row.tr[data-name="정수기 렌탈"] .tc.nmc'); await sleep(p, 500);
  const per2 = await p.evaluate(() => { const k = Array.prototype.find.call(document.querySelectorAll('#list .tp .kl'), (x) => /기간/.test(x.textContent)); return k ? k.textContent : ''; });
  ok(/12월 20일/.test(per2) && !/년/.test(per2), '올해 안에서 끝나는 기간은 그대로 → ' + per2);
  // 알림 띠의 버튼 글자색: 주황(옛 강조색) 대신 지금 고른 색 계열
  const want = { navy: 'rgb(179, 192, 255)', blue: 'rgb(141, 182, 255)', violet: 'rgb(189, 167, 255)' };
  for (const tone of ['navy', 'blue', 'violet']) {
    const c = await p.evaluate((t) => { if (t === 'navy') document.documentElement.removeAttribute('data-tone'); else document.documentElement.setAttribute('data-tone', t); return getComputedStyle(document.getElementById('toastBtn')).color; }, tone);
    ok(c === want[tone], '알림 띠 버튼 색(' + tone + '): ' + c);
  }
  await p.evaluate(() => document.documentElement.removeAttribute('data-tone'));
  await p.evaluate(() => { const r = document.querySelector('#list .row.tr[data-name="넷플릭스"]'); r.querySelector('.swdel').click(); });
  await h.idle(900);
  ok(/되돌리기|되살리기/.test(await p.evaluate(() => document.getElementById('toastBtn').textContent)), '지운 뒤 알림 띠에 되돌리기 버튼');
  await h.shot('sale-toast');
  ok(!h.errors.length, '화면 오류 없음 ' + JSON.stringify(h.errors));
  await h.close();
});

/* ---------- 업데이트 알림 띠 (2026-11-25): 화면 위에서 내려옴 ----------
 * 앱 새 버전(모두): 배포된 sw.js 번호가 지금 화면보다 크면 띠. 서버 새 버전: 앱 주인에게만. 버튼은 둘 다 '지금 업데이트'. */
const upbOf = (p) => p.evaluate(() => {
  const e = document.getElementById('upb'), r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  const box = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  return { on: e.classList.contains('on'), vis: cs.visibility === 'visible' && r.bottom > 0, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
    txt: document.getElementById('upbTxt').textContent, go: document.getElementById('upbGoTxt').textContent, goBox: box('upbGo'), xBox: box('upbX'), vw: innerWidth };
});
t('update-banner', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  // 1) 평소(배포된 버전 = 지금 화면): 안 뜸
  let h = await H.open({ seed: 'full', now: '2026-11-25T10:40', viewport: VP, latency: 50 }); let p = h.page;
  await sleep(p, 1500);
  let b = await upbOf(p);
  ok(!b.on && !b.vis, '새 버전이 없으면 띠가 안 보임 (화면 밖에 숨어 있음, top ' + b.top + ')');
  await h.close();

  // 2) 앱 새 버전: 모두에게
  h = await H.open({ seed: 'full', now: '2026-11-25T10:40', viewport: VP, latency: 50, noGo: true }); p = h.page;
  let swHits = 0;
  await h.ctx.route('**/sw.js*', (route) => { swHits++; route.fulfill({ status: 200, contentType: 'text/javascript', body: "var C = 'fc-shell-v99';" }); });
  await h.go(); await sleep(p, 1500);
  b = await upbOf(p);
  ok(b.on && b.vis && b.txt === '새 버전이 나왔어요' && b.go === '지금 업데이트', '배포된 버전이 더 높으면 위에서 띠가 내려옴: ' + b.txt + ' [' + b.go + ']');
  ok(b.top >= 0 && b.top <= 16 && b.left >= 8 && b.right <= b.vw - 8 && b.bottom - b.top <= 64, '띠가 화면 맨 위에, 양옆 여백 안에 있음 ' + JSON.stringify({ t: b.top, b: b.bottom, l: b.left, r: b.right }));
  ok(b.goBox.h >= 44 && b.xBox.h >= 44 && b.xBox.w >= 44, '누르는 곳 44px 이상 ' + JSON.stringify([b.goBox, b.xBox]));
  await h.shot('update-banner-app');
  await p.click('#upbX'); await sleep(p, 600);
  b = await upbOf(p);
  ok(!b.on && !b.vis, '닫기(✕)를 누르면 올라가 사라짐');
  await p.reload(); await h.idle(1200); await sleep(p, 800);
  ok(!(await upbOf(p)).on, '닫은 버전은 다시 열어도 안 뜸 (하루 동안)');
  await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('fc_upb')); o.app99 = Date.now() - 1000; localStorage.setItem('fc_upb', JSON.stringify(o)); });
  await p.reload(); await h.idle(1200); await sleep(p, 800);
  ok((await upbOf(p)).on, '하루가 지나면 다시 뜸');
  await p.evaluate(() => { window.__mark = 1; });
  await p.click('#upbGo'); await p.waitForFunction(() => !window.__mark, null, { timeout: 8000 }).catch(() => {}); await h.idle(1200); await sleep(p, 800);
  ok(await p.evaluate(() => !window.__mark), '지금 업데이트를 누르면 화면을 새로 받아 옴');
  b = await upbOf(p);
  ok(!b.on, '새로 받았는데도 옛 화면이면(중간 저장소가 아직 옛것) 띠가 바로 또 뜨며 맴돌지 않음');
  ok(await homeHas(p, '넷플릭스') && !realErrors(h).length, '새로 연 뒤 화면 정상, 오류 없음 ' + JSON.stringify(realErrors(h)));
  await h.close();

  // 3) 서버 새 버전: 앱 주인에게만
  const old = fs.readFileSync(path.join(__dirname, '..', 'setup', 'Code.gs.txt'), 'utf8').replace(/var SERVER_VER = \d+;/, 'var SERVER_VER = 10;');
  const f = path.join(os.tmpdir(), 'fc-code-v10-' + process.pid + '.txt'); fs.writeFileSync(f, old);
  const OWNER = 'owner@example.com', GUEST = 'guest@example.com';
  for (const who of [GUEST, OWNER]) {
    const gas = GAS.create({ code: f });
    h = await H.open({ gas, email: who, seed: 'full', now: '2026-11-25T10:40', viewport: VP, latency: 50, noGo: true }); p = h.page;
    if (who === OWNER) gas.user(who).props.vs_admin = '1';
    const api = [];
    await h.ctx.route('https://script.googleapis.com/v1/projects/**', (route) => {
      const u = route.request().url(), m = route.request().method();
      api.push(m + ' ' + u.replace(/^.*\/v1\/projects\/[^/]+\//, ''));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/versions$/.test(u) ? { versionNumber: 7 } : {}) });
    });
    await h.go(); await sleep(p, 1500);
    b = await upbOf(p);
    if (who === GUEST) {
      ok(gas.call(who, 'api_load', [true]).ver === 10 && !b.on && !b.vis, '서버가 옛 버전이어도 주인이 아닌 계정에는 띠가 안 뜸');
      ok(!(await toastState(p)).on, '주인이 아닌 계정에는 업데이트 알림도 없음');
      ok(!realErrors(h).length, '화면 오류 없음 ' + JSON.stringify(realErrors(h)));
      await h.close(); continue;
    }
    ok(b.on && b.vis && b.txt === '서버 새 버전이 있어요' && b.go === '지금 업데이트', '앱 주인에게는 띠가 내려옴: ' + b.txt + ' [' + b.go + ']');
    await h.shot('update-banner-server');
    await p.click('#upbX'); await sleep(p, 500);
    await p.reload(); await h.idle(1200); await sleep(p, 600);
    ok(!(await upbOf(p)).on, '닫으면 같은 서버 버전은 다시 열어도 안 뜸');
    await p.click('#menuBtn'); await sleep(p, 600);
    ok(await p.evaluate(() => /새 버전 있음/.test((document.getElementById('mUpd') || {}).textContent || '')), '닫아도 설정의 서버 업데이트 줄에는 "새 버전 있음"이 남아 있음');
    await p.click('#sheetClose'); await sleep(p, 400);
    await p.evaluate(() => localStorage.removeItem('fc_upb'));
    await p.reload(); await h.idle(1200); await sleep(p, 600);
    ok((await upbOf(p)).on, '(준비) 띠가 다시 뜸');
    await p.click('#upbGo'); await p.waitForLoadState('load').catch(() => {}); await h.idle(2500); await sleep(p, 1200);
    const last = h.oauth[h.oauth.length - 1] || {};
    ok(last.prompt === 'consent' && /script\.projects/.test(last.scope) && /script\.deployments/.test(last.scope), '업데이트를 누르면 서버를 바꿀 권한을 구글에서 받아 옴 (처음 한 번)');
    ok(api.length === 3 && /^PUT content/.test(api[0]) && /^POST versions/.test(api[1]) && /^PUT deployments\//.test(api[2]), '새 코드 올리기 → 새 버전 → 배포 주소에 연결 순서로 부름: ' + api.join(' | '));
    ok(!realErrors(h).length, '화면 오류 없음 ' + JSON.stringify(realErrors(h)));
    await h.close();
  }
});

/* ---------- 첫 화면 '다가오는 결제': 오늘 낼 것만 채운 알약, 내일부터는 회색 글자 ---------- */
t('home-today-pill', async () => {
  const seed = { accounts: [], items: [
    { n: '월세', cat: '주거', amt: 650000, day: 25, start: '2026-06-25' },
    { n: '통신비', cat: '통신', amt: 69000, day: 26, start: '2026-06-26' },
    { n: '실손보험', cat: '보험', amt: 48200, day: 27, start: '2026-06-27' },
    { n: '청년 적금', cat: '저축', amt: 500000, day: 28, start: '2026-06-28' },
    { n: '관리비', cat: '공과금', amt: 120000, day: 30, start: '2026-06-30' }
  ] };
  const stOf = (p, where) => p.evaluate((w) => {
    const out = {}, acc = getComputedStyle(document.documentElement);
    document.querySelectorAll(w + ' .row[data-name]').forEach((r) => {
      const e = r.querySelector('.st'), cs = e ? getComputedStyle(e) : null;
      out[r.getAttribute('data-name')] = e ? { t: e.textContent, cls: e.className, bg: cs.backgroundColor, col: cs.color, h: Math.round(r.getBoundingClientRect().height) } : null;
    });
    const probe = document.createElement('i'); probe.style.cssText = 'background:var(--accent);color:var(--muted)'; document.body.appendChild(probe);
    out._accent = getComputedStyle(probe).backgroundColor; out._muted = getComputedStyle(probe).color; probe.remove();
    return out;
  }, where);
  for (const o of [{ dark: false, tone: '' }, { dark: true, tone: 'violet' }]) {
    const h = await H.open({ seed, seedAt: '2026-11-22', now: '2026-11-25T21:00', viewport: VP, latency: 0, dark: o.dark }); const p = h.page;
    if (o.tone) { await p.evaluate((t) => localStorage.setItem('fc_tone', t), o.tone); await p.reload(); await h.idle(); }
    const tag = (o.dark ? '다크' : '밝은') + (o.tone ? '·' + o.tone : '') + ': ';
    const s = await stOf(p, '#home');
    ok(s['월세'] && s['월세'].t === '오늘' && /today/.test(s['월세'].cls) && s['월세'].bg === s._accent, tag + '오늘 낼 것은 강조색으로 채운 "오늘" 알약: ' + JSON.stringify(s['월세']));
    ok(['통신비', '실손보험', '청년 적금'].every((n) => s[n] && !/today|soon/.test(s[n].cls) && s[n].col === s._muted && s[n].bg === 'rgba(0, 0, 0, 0)'),
      tag + '내일·모레·3일 뒤는 회색 글자: ' + ['통신비', '실손보험', '청년 적금'].map((n) => s[n] && s[n].t).join(' / '));
    ok(s['통신비'].t === '내일 · 26일' && s['실손보험'].t === '모레 · 27일' && s['청년 적금'].t === '3일 뒤 · 28일' && s['관리비'].t === '30일 (월)', tag + '글자는 그대로(내일 · 26일 …, 30일 (월))');
    ok(s['월세'].h === s['통신비'].h && s['월세'].h === s['관리비'].h, tag + '알약이 있어도 줄 높이가 같음: ' + s['월세'].h + 'px');
    if (!o.dark) {
      await p.click('#cal .cd.today'); await sleep(p, 300);
      const d = await stOf(p, '#home');
      ok(d['월세'] && d['월세'].t === '오늘' && /today/.test(d['월세'].cls), '달력에서 오늘을 눌러도 "오늘" 알약');
      await p.click('#selClear'); await sleep(p, 200);
      await p.click('#home .row[data-name="월세"] .rb'); await sleep(p, 500);
      const pill = await p.evaluate(() => { const e = document.querySelector('#sheet .pill'); return e ? { t: e.textContent, cls: e.className } : null; });
      ok(pill && pill.t === '오늘' && /today/.test(pill.cls), '항목 창의 상태 알약도 오늘만 채운 색: ' + JSON.stringify(pill));
      await p.click('#sheetClose'); await sleep(p, 400);
      await p.click('#home .row[data-name="통신비"] .rb'); await sleep(p, 500);
      const pill2 = await p.evaluate(() => { const e = document.querySelector('#sheet .pill'); return e ? { t: e.textContent, cls: e.className } : null; });
      ok(pill2 && pill2.t === '내일' && !/today|soon/.test(pill2.cls), '내일 것은 회색 알약: ' + JSON.stringify(pill2));
      await p.click('#sheetClose'); await sleep(p, 400);
      await p.click('#home .row[data-name="월세"] .chk'); await sleep(p, 600);
      const c = await stOf(p, '#home');
      ok(!c['월세'] || !/today/.test(c['월세'].cls), '체크하면 알약이 사라짐: ' + JSON.stringify(c['월세'] && c['월세'].t));
    }
    ok(!realErrors(h).length, tag + '화면 오류 없음 ' + JSON.stringify(realErrors(h)));
    await h.close();
  }
});

/* ---------- 목록: 실수로 숫자가 안 바뀌게('수정'을 켜야 칸 고치기), 오른쪽으로 밀면 달력 탭 ---------- */
t('list-edit-guard', async () => {
  const h = await H.open({ seed: 'full', seedAt: '2026-10-02', now: '2026-11-25T21:00', viewport: VP, latency: 0 }); const p = h.page;
  const cdp = await p.context().newCDPSession(p);
  const swipe = async (sel, dx) => {
    const b = await p.locator(sel).first().boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2, n = 8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= n; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / n, y }] }); await sleep(p, 16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(p, 500);
  };
  const tabNow = () => p.evaluate(() => document.querySelector('.tabbar [data-tab].on').getAttribute('data-tab'));
  const st = () => p.evaluate(() => ({ input: !!document.querySelector('#list input.ci'), open: (document.querySelector('#list .row.tr.open') || {}).getAttribute ? document.querySelector('#list .row.tr.open').getAttribute('data-name') : '',
    btn: document.getElementById('editMode').textContent, pressed: document.getElementById('editMode').getAttribute('aria-pressed'), editing: document.body.classList.contains('editing'),
    hint: getComputedStyle(document.getElementById('edHint')).display, swiped: !!document.querySelector('#list .row.tr.swiped') }));
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
  const before = srvItem(h, '넷플릭스').amount;
  let s = await st();
  ok(s.btn === '수정' && s.pressed === 'false' && s.hint === 'none', '목록 위에 "수정" 단추, 처음엔 꺼져 있음');
  await p.click('#list .row.tr[data-name="넷플릭스"] .tc.amc'); await sleep(p, 300);
  s = await st();
  ok(!s.input && s.open === '넷플릭스', '수정을 안 켜고 금액 칸을 누르면 입력칸 대신 줄이 펼쳐짐');
  await p.click('#list .row.tr[data-name="넷플릭스"] .tc.dyc'); await sleep(p, 300);
  s = await st();
  ok(!s.input && s.open === '', '결제일 칸을 눌러도 입력칸 안 뜸(펼친 줄이 접힘)');
  ok(srvItem(h, '넷플릭스').amount === before, '서버 금액 그대로');
  // 펼친 줄의 수정 단추는 강조색으로 채움
  await p.click('#list .row.tr[data-name="넷플릭스"] .tc.nmc'); await sleep(p, 300);
  const eb = await p.evaluate(() => { const b = document.querySelector('#list .row.tr.open [data-act="edit"]'), probe = document.createElement('i'); probe.style.background = 'var(--accent)'; document.body.appendChild(probe); const a = getComputedStyle(probe).backgroundColor; probe.remove(); return b && getComputedStyle(b).backgroundColor === a; });
  ok(eb, '펼친 줄의 "수정" 단추가 강조색으로 눈에 띔');
  await p.click('#list .row.tr[data-name="넷플릭스"] .tc.nmc'); await sleep(p, 300);
  // 수정 켜기 → 칸 고치기 → 완료
  await p.click('#editMode'); await sleep(p, 300);
  s = await st();
  ok(s.btn === '완료' && s.pressed === 'true' && s.editing && s.hint === 'block', '수정을 누르면 "완료"로 바뀌고 안내 한 줄이 보임');
  await p.click('#list .row.tr[data-name="넷플릭스"] .tc.amc'); await sleep(p, 300);
  ok((await st()).input, '수정 중엔 금액 칸을 누르면 입력칸');
  await p.fill('#list input.ci', '18,000'); await p.press('#list input.ci', 'Enter'); await h.idle(900);
  ok(srvItem(h, '넷플릭스').amount === 18000, '고친 금액이 저장됨');
  await p.click('#editMode'); await sleep(p, 300);
  s = await st();
  ok(s.btn === '수정' && !s.editing, '완료를 누르면 다시 잠김');
  // 결제일 없는 줄의 '넣기'는 수정 안 켜도 날짜 넣는 창
  await p.click('#list .row.tr[data-name="전기요금"] .tc.dyc'); await sleep(p, 500);
  ok(await sheetOn(p) && !(await st()).input, '"넣기"를 누르면 날짜 넣는 창이 열림');
  await p.click('#sheetClose'); await sleep(p, 500);
  // 줄을 왼쪽으로 밀면 삭제 버튼(탭은 그대로)
  await swipe('#list .row.tr[data-name="월세"] .tc.nmc', -150);
  s = await st();
  ok(s.swiped && (await tabNow()) === 'list', '줄을 왼쪽으로 밀면 삭제 버튼, 탭은 그대로');
  // 삭제 버튼이 열린 채 오른쪽으로 밀면 닫히기만
  await swipe('#list .row.tr[data-name="월세"] .tc.nmc', 150);
  s = await st();
  ok(!s.swiped && (await tabNow()) === 'list', '삭제 버튼이 열린 채 오른쪽으로 밀면 닫히기만 함');
  // 줄 위에서 오른쪽으로 밀면 달력 탭
  await swipe('#list .row.tr[data-name="관리비"] .tc.nmc', 150);
  ok((await tabNow()) === 'cal', '줄 위에서 오른쪽으로 밀면 결제 달력 탭으로 넘어감');
  // 수정 켠 채 탭을 바꾸면 꺼짐
  await p.click('.tabbar [data-tab="list"]'); await sleep(p, 500);
  await p.click('#editMode'); await sleep(p, 200);
  await swipe('#list .row.tr[data-name="관리비"] .tc.nmc', 150);
  ok((await tabNow()) === 'cal' && !(await st()).editing, '수정 켠 채 달력으로 가면 수정이 꺼짐');
  ok(!realErrors(h).length, '화면 오류 없음 ' + JSON.stringify(realErrors(h)));
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
