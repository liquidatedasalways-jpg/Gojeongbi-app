/* 가짜 구글 환경: setup/Code.gs.txt(서버 코드)를 Node에서 그대로 돌림.
 * 실제 Apps Script처럼 호출 한 번마다 전역 변수를 새로 만들고, 저장은 사용자별 속성(UserProperties)에 함.
 *   const gas = require('./gas').create();
 *   gas.call('me@example.com', 'api_load', [false])
 */
const fs = require('fs');
const path = require('path');

const RealDate = Date;

function create(opt) {
  opt = opt || {};
  const codePath = opt.code || path.join(__dirname, '..', 'setup', 'Code.gs.txt');
  const code = fs.readFileSync(codePath, 'utf8');
  const st = { users: {}, script: { props: {}, cache: {} }, offset: 0, slept: 0, log: [], holidays: opt.holidays || {} };

  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + st.offset); else super(...a); }
    static now() { return RealDate.now() + st.offset; }
  }

  function user(email) {
    if (!st.users[email]) st.users[email] = { props: {}, cache: {}, triggers: [], events: [], evSeq: 0 };
    return st.users[email];
  }
  function propStore(o) {
    return {
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null),
      setProperty(k, v) {
        v = String(v);
        if (Buffer.byteLength(v, 'utf8') > 9 * 1024) st.log.push('PROP_TOO_BIG ' + k + ' ' + Buffer.byteLength(v, 'utf8'));
        o[k] = v; return this;
      },
      setProperties(m) { for (const k in m) this.setProperty(k, m[k]); return this; },
      deleteProperty(k) { delete o[k]; return this; },
      getProperties: () => Object.assign({}, o),
      getKeys: () => Object.keys(o)
    };
  }
  function cacheStore(o) {
    return {
      get: (k) => (o[k] && o[k].exp > FakeDate.now() ? o[k].v : null),
      put: (k, v, ttl) => { o[k] = { v: String(v), exp: FakeDate.now() + (ttl || 600) * 1000 }; },
      remove: (k) => { delete o[k]; }
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
    sleep(ms) { st.slept += ms; st.offset += ms; },   // 실제로 쉬지는 않고 가짜 시계만 앞으로 (시간 제한 코드가 돌도록)
    formatString(f, ...a) { let i = 0; return f.replace(/%s/g, () => String(a[i++])); }
  };

  function bind(email) {
    const u = user(email);
    const cal = {
      getName: () => email,
      getEvents(a, b) { return u.events.filter((e) => !e.deleted && e.start.getTime() >= a.getTime() && e.start.getTime() < b.getTime()).map(evApi); },
      createAllDayEvent(title, date, o) {
        const e = { id: ++u.evSeq, title, start: new FakeDate(date.getTime()), desc: (o && o.description) || '', color: '', tags: {}, deleted: false };
        u.events.push(e);
        return evApi(e);
      }
    };
    function evApi(e) {
      return {
        getTag: (k) => (k in e.tags ? e.tags[k] : null), setTag(k, v) { e.tags[k] = String(v); return this; },
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
      LockService: { getUserLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }), getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
      Session: { getEffectiveUser: () => ({ getEmail: () => email }), getActiveUser: () => ({ getEmail: () => email }), getScriptTimeZone: () => 'Asia/Seoul' },
      ScriptApp: {
        getProjectTriggers: () => u.triggers.slice(), newTrigger: trig,
        deleteTrigger(t) { u.triggers = u.triggers.filter((x) => x !== t); },
        getService: () => ({ getUrl: () => '' })
      },
      SpreadsheetApp: {
        getActive: () => null, openById() { throw new Error('You do not have permission to access the requested document.'); },
        flush() {}, getUi() { throw new Error('no ui'); },
        DataValidationCriteria: { VALUE_IN_RANGE: 'VALUE_IN_RANGE', VALUE_IN_LIST: 'VALUE_IN_LIST', NUMBER_BETWEEN: 'NUMBER_BETWEEN',
          NUMBER_GREATER_THAN_OR_EQUAL_TO: 'NUMBER_GREATER_THAN_OR_EQUAL_TO', DATE_IS_VALID_DATE: 'DATE_IS_VALID_DATE', CUSTOM_FORMULA: 'CUSTOM_FORMULA', CHECKBOX: 'CHECKBOX' },
        CopyPasteType: { PASTE_VALUES: 'PASTE_VALUES' }
      },
      CalendarApp: { getDefaultCalendar: () => cal, getCalendarById: (id) => (/holiday/.test(id) ? holCal : null) },
      HtmlService: { createHtmlOutput: () => ({}), XFrameOptionsMode: { ALLOWALL: 1 } }
    };
  }

  const NAMES = ['Date', 'Utilities', 'console', 'PropertiesService', 'CacheService', 'LockService', 'Session', 'ScriptApp', 'SpreadsheetApp', 'CalendarApp', 'HtmlService'];
  const factory = new Function(...NAMES, code + '\n;return function (__n) { return eval(__n); };');

  return {
    state: st,
    /** 서버 함수 한 번 호출 (실제처럼 전역 새로 만듦). 결과는 JSON으로 한 번 거쳐서 돌려줌. */
    call(email, fn, args) {
      const g = bind(email);
      const get = factory(...NAMES.map((n) => g[n]));
      const f = get(fn);
      if (typeof f !== 'function') throw new Error('Script function not found: ' + fn);
      const r = f.apply(null, args || []);
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
    user
  };
}

module.exports = { create };
