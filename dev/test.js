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
