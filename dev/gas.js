/* 가짜 구글 환경: setup/Code.gs.txt(서버 코드)를 Node에서 그대로 돌림.
 * 실제 Apps Script처럼 호출 한 번마다 전역 변수를 새로 만들고, 저장은 사용자별 속성(UserProperties)에 함.
 *   const gas = require('./gas').create();
 *   gas.call('me@example.com', 'api_load', [false])
 * 끼어들기 훅(한 번 쓰면 사라짐): gas.state.hook.tryLock / releaseLock / sleep / beforeSetProperties / afterSetProperties
 *   → 그 순간에 다른 호출(gas.call)을 끼워 넣어 '두 기기가 겹쳐 저장'하는 상황을 만듦.
 * 사람별 잠금은 실제처럼 한 실행만 쥘 수 있음(다른 실행은 tryLock이 false). 실행이 끝나면 저절로 풀림.
 * create({ strict: true }): 값 하나가 9KB를 넘으면 구글처럼 오류. gas.state.writes: 속성 쓰기 횟수.
 * 권한(scope)도 실제처럼 따짐:
 *   - 서버 설정(setup/appsscript.json.txt)의 oauthScopes에 없는 권한이 필요한 구글 기능을 부르면 구글처럼 오류
 *     ("You do not have permission to call …"). 구글 시트(SpreadsheetApp)는 무엇을 건드리든 시트 권한이 필요한 것으로 침.
 *   - gas.grant(email, 'scope scope …'): 그 사람이 구글 권한 화면에서 허용한 것만 (일부만 체크한 상황). null이면 전부 허용.
 */
const fs = require('fs');
const path = require('path');

const RealDate = Date;

function create(opt) {
  opt = opt || {};
  const codePath = opt.code || path.join(__dirname, '..', 'setup', 'Code.gs.txt');
  const code = fs.readFileSync(codePath, 'utf8');
  const manifest = opt.scopes || JSON.parse(fs.readFileSync(opt.manifest || path.join(__dirname, '..', 'setup', 'appsscript.json.txt'), 'utf8')).oauthScopes || [];
  const SC = { sheet: 'https://www.googleapis.com/auth/spreadsheets', cal: 'https://www.googleapis.com/auth/calendar', trig: 'https://www.googleapis.com/auth/script.scriptapp' };
  const st = { users: {}, script: { props: {}, cache: {} }, offset: 0, slept: 0, failTrigger: 0, log: [], holidays: opt.holidays || {}, hook: {}, writes: 0, strict: !!opt.strict };
  function fire(n, a) { const h = st.hook[n]; if (h) { st.hook[n] = null; h(a); } }
  let execSeq = 0;

  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + st.offset); else super(...a); }
    static now() { return RealDate.now() + st.offset; }
  }

  function user(email) {
    if (!st.users[email]) st.users[email] = { props: {}, cache: {}, triggers: [], events: [], evSeq: 0, lock: 0, scopes: null };
    return st.users[email];
  }
  function propStore(o) {
    return {
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null),
      setProperty(k, v) {
        v = String(v);
        if (Buffer.byteLength(v, 'utf8') > 9 * 1024) { st.log.push('PROP_TOO_BIG ' + k + ' ' + Buffer.byteLength(v, 'utf8')); if (st.strict) throw new Error('Argument too large: value'); }
        st.writes++;
        o[k] = v; return this;
      },
      setProperties(m) {
        fire('beforeSetProperties', m);
        if (st.strict) for (const k in m) if (Buffer.byteLength(String(m[k]), 'utf8') > 9 * 1024) { st.log.push('PROP_TOO_BIG ' + k + ' ' + Buffer.byteLength(String(m[k]), 'utf8')); throw new Error('Argument too large: value'); }
        for (const k in m) this.setProperty(k, m[k]);
        fire('afterSetProperties', m);
        return this;
      },
      deleteProperty(k) { delete o[k]; return this; },
      deleteAllProperties() { for (const k of Object.keys(o)) delete o[k]; return this; },
      getProperties: () => Object.assign({}, o),
      getKeys: () => Object.keys(o)
    };
  }
  function cacheStore(o) {
    return {
      get: (k) => (o[k] && o[k].exp > FakeDate.now() ? o[k].v : null),
      put: (k, v, ttl) => { o[k] = { v: String(v), exp: FakeDate.now() + (ttl || 600) * 1000 }; },
      remove: (k) => { delete o[k]; },
      removeAll: (ks) => { ks.forEach((k) => { delete o[k]; }); }
    };
  }
  const TZ = { 'Asia/Seoul': 9, UTC: 0, GMT: 0, 'Etc/GMT': 0 };
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  const Utilities = {
    formatDate(d, tz, fmt) {
      const off = TZ[tz] === undefined ? 9 : TZ[tz];
      const x = new RealDate(d.getTime() + off * 3600000);
      return fmt.replace(/yyyy|MM|dd|HH|mm|ss|M|d/g, (t) => ({
        yyyy: x.getUTCFullYear(), MM: pad(x.getUTCMonth() + 1, 2), dd: pad(x.getUTCDate(), 2), HH: pad(x.getUTCHours(), 2),
        mm: pad(x.getUTCMinutes(), 2), ss: pad(x.getUTCSeconds(), 2), M: x.getUTCMonth() + 1, d: x.getUTCDate()
      })[t]);
    },
    parseDate(s, tz, fmt) {
      const off = TZ[tz] === undefined ? 9 : TZ[tz];
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) throw new Error('parseDate: ' + s);
      return new FakeDate(RealDate.UTC(+m[1], +m[2] - 1, +m[3]) - off * 3600000);
    },
    sleep(ms) { st.slept += ms; st.offset += ms; fire('sleep', ms); },   // 실제로 쉬지는 않고 가짜 시계만 앞으로 (시간 제한 코드가 돌도록)
    formatString(f, ...a) { let i = 0; return f.replace(/%s/g, () => String(a[i++])); }
  };

  function bind(email, exec) {
    const u = user(email);
    // 사람별 잠금: 다른 실행이 쥐고 있으면 못 잡음(가짜라서 기다리지 않고 바로 false). 같은 실행이 또 잡으면 true, 한 번 풀면 다 풀림
    const userLock = {
      tryLock() { fire('tryLock'); if (u.lock && u.lock !== exec) return false; u.lock = exec; return true; },
      waitLock() { if (!this.tryLock()) throw new Error('Lock timeout'); },
      hasLock: () => u.lock === exec,
      releaseLock() { if (u.lock === exec) u.lock = 0; fire('releaseLock'); }
    };
    const cal = {
      getName: () => email,
      getEvents(a, b) { return u.events.filter((e) => !e.deleted && e.start.getTime() >= a.getTime() && e.start.getTime() < b.getTime()).map(evApi); },
      createAllDayEvent(title, date, o) {
        // reminders: null = 캘린더 기본 알림을 따름, 배열 = 이 일정에 따로 정한 알림(분)
        const e = { id: ++u.evSeq, title, start: new FakeDate(date.getTime()), desc: (o && o.description) || '', color: '', tags: {}, deleted: false, reminders: null };
        u.events.push(e);
        return evApi(e);
      }
    };
    function evApi(e) {
      return {
        getTag: (k) => (k in e.tags ? e.tags[k] : null), setTag(k, v) { e.tags[k] = String(v); return this; },
        deleteTag(k) { delete e.tags[k]; return this; },
        addPopupReminder(m) {
          if (!(Number.isInteger(m) && m >= 5 && m <= 40320)) throw new Error('addPopupReminder: 5~40320분만 됨 (' + m + ')');
          e.reminders = (e.reminders || []).concat(m); return this;
        },
        getPopupReminders: () => (e.reminders || []).slice(),
        removeAllReminders() { e.reminders = []; return this; },
        resetRemindersToDefault() { e.reminders = null; return this; },
        getColor: () => e.color, setColor(c) { e.color = String(c); return this; },
        getTitle: () => e.title, setTitle(t) { e.title = t; return this; },
        getDescription: () => e.desc, setDescription(t) { e.desc = t; return this; },
        deleteEvent() { e.deleted = true; },
        isAllDayEvent: () => true, getAllDayStartDate: () => e.start, getAllDayEndDate: () => new FakeDate(e.start.getTime() + 86400000),
        getStartTime: () => e.start, getId: () => String(e.id)
      };
    }
    const holCal = {
      getEvents(a, b) {
        return Object.keys(st.holidays).map((ds) => ({ ds, t: Utilities.parseDate(ds, 'Asia/Seoul', 'yyyy-MM-dd') }))
          .filter((h) => h.t.getTime() >= a.getTime() && h.t.getTime() < b.getTime())
          .map((h) => ({ getDescription: () => '공휴일', isAllDayEvent: () => true, getAllDayStartDate: () => h.t,
            getAllDayEndDate: () => new FakeDate(h.t.getTime() + 86400000), getTitle: () => st.holidays[h.ds] }));
      }
    };
    /** 이 기능에 필요한 권한이 서버 설정에 있고, 이 사람이 허용했는지 */
    const need = (scope, what) => {
      const granted = u.scopes ? String(u.scopes).split(/\s+/) : null;
      if (manifest.indexOf(scope) < 0 || (granted && granted.indexOf(scope) < 0)) {
        st.log.push('NO_SCOPE ' + what);
        throw new Error('You do not have permission to call ' + what + '. Required permissions: ' + scope);
      }
    };
    const sheetApp = new Proxy({}, { get(_, k) { if (typeof k === 'symbol') return undefined; need(SC.sheet, 'SpreadsheetApp.' + String(k)); return SHEET_API[k]; } });
    const trig = (fn) => {
      const t = { fn, getHandlerFunction: () => fn };
      const b = { forSpreadsheet: () => b, onEdit: () => b, timeBased: () => b, everyDays: () => b, atHour: () => b, after: () => b, create() { u.triggers.push(t); return t; } };
      return b;
    };
    return {
      Date: FakeDate,
      Utilities,
      console: { log() {}, warn() {}, error() {} },
      PropertiesService: { getUserProperties: () => propStore(u.props), getScriptProperties: () => propStore(st.script.props) },
      CacheService: { getUserCache: () => cacheStore(u.cache), getScriptCache: () => cacheStore(st.script.cache) },
      LockService: { getUserLock: () => userLock, getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
      Session: { getEffectiveUser: () => ({ getEmail: () => email }), getActiveUser: () => ({ getEmail: () => email }), getScriptTimeZone: () => 'Asia/Seoul' },
      ScriptApp: {
        getProjectTriggers: () => { need(SC.trig, 'ScriptApp.getProjectTriggers'); return u.triggers.slice(); },
        newTrigger: (fn) => { need(SC.trig, 'ScriptApp.newTrigger'); if (st.failTrigger > 0) { st.failTrigger--; throw new Error('Service error: Script'); } return trig(fn); },
        deleteTrigger(t) { need(SC.trig, 'ScriptApp.deleteTrigger'); u.triggers = u.triggers.filter((x) => x !== t); },
        getService: () => ({ getUrl: () => '' })
      },
      SpreadsheetApp: sheetApp,
      CalendarApp: {
        getDefaultCalendar: () => { need(SC.cal, 'CalendarApp.getDefaultCalendar'); return cal; },
        getCalendarById: (id) => { need(SC.cal, 'CalendarApp.getCalendarById'); return /holiday/.test(id) ? holCal : null; }
      },
      HtmlService: { createHtmlOutput: () => ({}), XFrameOptionsMode: { ALLOWALL: 1 } }
    };
  }

  // 시트 권한이 있을 때의 구글 시트 흉내 (독립 스크립트라 열린 시트는 없음)
  const SHEET_API = {
    getActive: () => null, openById() { throw new Error('You do not have permission to access the requested document.'); },
    flush() {}, getUi() { throw new Error('no ui'); },
    DataValidationCriteria: { VALUE_IN_RANGE: 'VALUE_IN_RANGE', VALUE_IN_LIST: 'VALUE_IN_LIST', NUMBER_BETWEEN: 'NUMBER_BETWEEN',
      NUMBER_GREATER_THAN_OR_EQUAL_TO: 'NUMBER_GREATER_THAN_OR_EQUAL_TO', DATE_IS_VALID_DATE: 'DATE_IS_VALID_DATE', CUSTOM_FORMULA: 'CUSTOM_FORMULA', CHECKBOX: 'CHECKBOX' },
    CopyPasteType: { PASTE_VALUES: 'PASTE_VALUES' }
  };
  const NAMES = ['Date', 'Utilities', 'console', 'PropertiesService', 'CacheService', 'LockService', 'Session', 'ScriptApp', 'SpreadsheetApp', 'CalendarApp', 'HtmlService'];
  const factory = new Function(...NAMES, code + '\n;return function (__n) { return eval(__n); };');

  return {
    state: st,
    /** 서버 함수 한 번 호출 (실제처럼 전역 새로 만듦). 결과는 JSON으로 한 번 거쳐서 돌려줌. */
    call(email, fn, args) {
      const exec = ++execSeq;
      const g = bind(email, exec);
      const get = factory(...NAMES.map((n) => g[n]));
      const f = get(fn);
      if (typeof f !== 'function') throw new Error('Script function not found: ' + fn);
      let r;
      try { r = f.apply(null, args || []); }
      finally { const u = user(email); if (u.lock === exec) u.lock = 0; }   // 실행이 끝나면 잠금은 저절로 풀림
      return r === undefined ? undefined : JSON.parse(JSON.stringify(r));
    },
    /** 지금 시각을 바꿈 (한국 시간 'yyyy-MM-dd' 또는 'yyyy-MM-ddTHH:mm') */
    setNow(s) {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
      const t = RealDate.UTC(+m[1], +m[2] - 1, +m[3], (m[4] ? +m[4] : 12) - 9, m[5] ? +m[5] : 0);
      st.offset = t - RealDate.now();
    },
    now: () => new RealDate(RealDate.now() + st.offset),
    events(email) { return user(email).events.filter((e) => !e.deleted); },
    /** 그 사람이 구글 권한 화면에서 허용한 권한 ('scope scope …'). null이면 전부 허용한 것으로 */
    grant(email, scopes) { user(email).scopes = scopes == null ? null : String(scopes); },
    manifest,
    user
  };
}

module.exports = { create };
