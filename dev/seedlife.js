/* 한 달쯤 써 본 상태: 10/2에 넣고, 10월에 대부분 체크, 11월 초 몇 개 체크 */
module.exports = function (g, me) {
  g.setNow('2026-10-28');
  const m = {}; ['청년 적금', '넷플릭스', '유튜브 프리미엄', '실손보험', '쿠팡 와우 멤버십', '통신비', '휴대폰 요금', '인터넷', '월세'].forEach((n) => { m[n] = true; });
  g.call(me, 'api_setChecks', [m]);
  g.setNow('2026-11-12');
  g.call(me, 'api_load', [false]);
  g.call(me, 'api_setChecks', [{ '청년 적금': true, '넷플릭스': true, '유튜브 프리미엄': true, '실손보험': true }]);
  g.call(me, 'api_sync', []);
};
