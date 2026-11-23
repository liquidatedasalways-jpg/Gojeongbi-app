/* 화면 테스트 공통 틀: 저장소의 index.html을 폰 크기 크롬으로 열고,
 * 구글 로그인은 가짜 표(토큰)로, 서버 호출(script.googleapis.com … :run)은 gas.js의 진짜 서버 코드로 연결.
 *   const h = await require('./harness').open({ now: '2026-11-23', seed: 'full' });
 *   await h.shot('home');  await h.close();
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium, devices } = require('playwright');
const gasLib = require('./gas');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = process.env.FC_FONT_DIR || path.join(__dirname, 'node_modules', 'pretendard', 'dist', 'web', 'variable');
const OUT = process.env.FC_SHOT_DIR || path.join(__dirname, 'shots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/Gojeongbi-app/, '');
      // 남의 사이트가 앱을 틀(iframe)에 끼워 넣은 상황 흉내 (http://localhost:포트/__outer 로 열면 주소가 달라 다른 사이트로 침)
      if (p === '/__outer') {
        rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        rsp.end('<h1>남의 사이트</h1><iframe id="f" src="http://127.0.0.1:' + req.socket.localPort + '/Gojeongbi-app/" style="width:360px;height:600px"></iframe>');
        return;
      }
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('nf'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

/* 한국 30대 직장인 1인 가구쯤의 고정비. 열 번호는 서버 가상 시트(VSC) 기준. */
const C = { CAT: 2, NM: 3, PAR: 4, VENDOR: 7, AMT: 8, KIND: 9, CYC: 10, DAY: 11, METHOD: 12, ACC: 13, AUTO: 14, START: 15, END: 16, MEMO: 21 };
function item(o) {
  const v = {};
  v[C.NM] = o.n; v[C.CAT] = o.cat || ''; v[C.PAR] = o.par || ''; v[C.VENDOR] = o.vendor || ''; v[C.AMT] = o.amt == null ? '' : String(o.amt);
  v[C.KIND] = o.kind || '고정'; v[C.CYC] = o.cyc || '매월'; v[C.DAY] = o.day == null ? '' : String(o.day); v[C.METHOD] = o.method || '';
  v[C.ACC] = o.acc || ''; v[C.AUTO] = o.auto || ''; v[C.START] = o.start || ''; v[C.END] = o.end || '무기한'; v[C.MEMO] = o.memo || '';
  return v;
}
const SEEDS = {
  empty: { accounts: [], items: [] },
  full: {
    accounts: [
      { name: '신한 체크카드 1234', memo: '[카드·신한·체크·1234] 생활비', from: '' },
      { name: '현대 신용카드 5678', memo: '[카드·현대·신용·5678]', from: '' },
      { name: '토스뱅크 4661', memo: '[계좌·토스뱅크·4661] 월급 통장', from: '' },
      { name: '카카오페이', memo: '[간편결제·카카오페이·신한 체크카드]', from: '' }
    ],
    items: [
      { n: '월세', cat: '월세', amt: 650000, day: 25, method: '자동이체', acc: '토스뱅크 4661', auto: 'O', vendor: '집주인 김○○', memo: '계약 만료 2027-08-24' },
      { n: '관리비', cat: '관리비', amt: 120000, kind: '변동', day: 31, method: '자동이체', acc: '토스뱅크 4661', auto: 'O' },
      { n: '통신비', cat: '통신비', amt: 102000, day: 15, method: '신용카드', acc: '현대 신용카드 5678' },
      { n: '휴대폰 요금', par: '통신비', cat: '통신비', amt: 69000, day: 15, method: '신용카드', acc: '현대 신용카드 5678', vendor: 'SK텔레콤' },
      { n: '인터넷', par: '통신비', cat: '통신비', amt: 33000, day: 15, method: '신용카드', acc: '현대 신용카드 5678', vendor: 'KT' },
      { n: '넷플릭스', cat: '구독', amt: 17000, day: 3, method: '신용카드', acc: '현대 신용카드 5678' },
      { n: '유튜브 프리미엄', cat: '구독', amt: 14900, day: 8, method: '체크카드', acc: '신한 체크카드 1234' },
      { n: '쿠팡 와우 멤버십', cat: '구독', amt: 7890, day: 12, method: '간편결제', acc: '카카오페이' },
      { n: '실손보험', cat: '보험', amt: 48200, day: 10, method: '자동이체', acc: '토스뱅크 4661', auto: 'O', vendor: '삼성화재' },
      { n: '자동차보험', cat: '보험', amt: 780000, cyc: '매년', day: 20, start: '2026-03-20', method: '신용카드', acc: '현대 신용카드 5678' },
      { n: '청년 적금', cat: '기타', amt: 500000, day: 1, method: '자동이체', acc: '토스뱅크 4661', auto: 'O', end: '2028-06-01' },
      { n: '헬스장', cat: '서비스', amt: 180000, cyc: '분기(3개월)', day: 5, start: '2026-08-05', method: '체크카드', acc: '신한 체크카드 1234' },
      { n: '정수기 렌탈', cat: '서비스', amt: 29900, day: 20, method: '자동이체', acc: '토스뱅크 4661', auto: 'O', end: '2026-12-20', vendor: '코웨이' },
      { n: '전기요금', cat: '관리비', amt: null, kind: '변동', day: null, method: '지로·고지서' },
      { n: '도시가스', cat: '관리비', amt: 38000, kind: '변동', day: null }
    ]
  }
};

async function open(opt) {
  opt = opt || {};
  const email = opt.email || 'tester@example.com';
  const gas = opt.gas || gasLib.create({ holidays: opt.holidays || { '2026-12-25': '크리스마스', '2027-01-01': '신정', '2026-10-09': '한글날', '2026-10-03': '개천절' } });
  if (opt.now) gas.setNow(opt.now);
  if (opt.seedAt) gas.setNow(opt.seedAt);
  const seed = typeof opt.seed === 'string' ? SEEDS[opt.seed] : opt.seed;
  if (seed) {
    gas.call(email, 'api_load', [false]);
    if (seed.accounts && seed.accounts.length) gas.call(email, 'api_accounts', [seed.accounts]);
    for (const it of seed.items || []) {
      const r = gas.call(email, 'api_save', ['', item(it)]);
      if (!r.ok) throw new Error('seed ' + it.n + ': ' + r.error);
    }
    if (opt.afterSeed) opt.afterSeed(gas, email);
  }
  if (opt.now) gas.setNow(opt.now);

  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/Gojeongbi-app/';
  const browser = await chromium.launch();
  const dev = devices[opt.device || 'Galaxy S9+'];
  const ctx = await browser.newContext(Object.assign({}, dev, {
    locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block', colorScheme: opt.dark ? 'dark' : 'light',
    deviceScaleFactor: opt.dsf || 2
  }, opt.viewport ? { viewport: opt.viewport } : {}));
  const calls = [];
  const lat = opt.latency == null ? 150 : opt.latency;
  await ctx.route('https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/**', (route) => {
    const f = path.join(FONT_DIR, route.request().url().split('/variable/')[1].split('?')[0]);
    if (!fs.existsSync(f)) return route.abort();
    route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  let failNext = 0, failFn = '';
  await ctx.route('https://script.googleapis.com/v1/scripts/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const t0 = Date.now();
    if (lat) await new Promise((r) => setTimeout(r, typeof lat === 'function' ? lat(body.function) : lat));
    if (failNext > 0 && (!failFn || failFn === body.function)) { failNext--; return route.abort('internetdisconnected'); }
    let out;
    try { out = { done: true, response: { result: gas.call(email, body.function, body.parameters) } }; }
    catch (e) { out = { error: { code: 500, message: String(e && e.message || e), status: 'INTERNAL', details: [{ errorMessage: String(e && e.message || e) }] } }; }
    calls.push({ fn: body.function, ms: Date.now() - t0, args: body.parameters });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  await ctx.route('https://www.googleapis.com/oauth2/v3/userinfo', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email }) }));
  // 구글 로그인 화면 흉내: 바로 새 로그인 표를 들고 앱으로 돌려보냄 (로그인 표가 만료돼 조용히 다녀오는 길을 검사할 때)
  let auths = 0;
  await ctx.route('https://accounts.google.com/o/oauth2/v2/auth**', (route) => {
    const u = new URL(route.request().url());
    auths++;
    const q = opt.authFail ? 'error=interaction_required' : 'access_token=fake' + auths + '&token_type=Bearer&expires_in=3600&scope=' + encodeURIComponent(u.searchParams.get('scope') || '');
    route.fulfill({ status: 302, headers: { location: u.searchParams.get('redirect_uri') + '#' + q + '&state=' + encodeURIComponent(u.searchParams.get('state') || '') } });
  });
  // 브라우저 시계도 서버와 같은 날로
  await ctx.clock.install({ time: gas.now() });
  if (!opt.loggedOut) {
    await ctx.addInitScript((em) => {
      try {
        if (!localStorage.getItem('fc_auth')) localStorage.setItem('fc_auth', JSON.stringify({ token: 'fake', exp: Date.now() + 3600e3, email: em, srv: 'other', scope: '' }));
        sessionStorage.setItem('fc_ext', '1');
      } catch (e) {}
    }, email);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  fs.mkdirSync(OUT, { recursive: true });
  const h = {
    page, ctx, browser, gas, email, calls, errors, base,
    /** 다음 서버 호출 n번을 연결 끊김으로. fn을 주면 그 기능을 부를 때만 */
    failNext(n, fn) { failNext = n; failFn = fn || ''; },
    auths: () => auths,
    async go() { await page.goto(base); await ctx.clock.resume(); await h.idle(); },
    /** 서버 작업이 다 끝날 때까지 */
    async idle(ms) {
      await page.waitForTimeout(ms || 250);
      await page.waitForFunction(() => !document.getElementById('loadbar').classList.contains('on'), null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(200);
    },
    async shot(name, o) { const f = path.join(OUT, name + '.png'); await page.screenshot(Object.assign({ path: f }, o || {})); return f; },
    async full(name) { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f, fullPage: true }); return f; },
    toast: () => page.evaluate(() => (document.getElementById('toast').classList.contains('on') ? document.getElementById('toastTxt').textContent : '')),
    async close() { await browser.close(); srv.close(); }
  };
  if (!opt.noGo) await h.go();
  return h;
}

module.exports = { open, SEEDS, item, C, OUT };
