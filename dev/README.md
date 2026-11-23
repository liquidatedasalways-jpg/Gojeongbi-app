# dev: 화면 테스트 도구

배포되는 앱과는 상관없는 개발용 폴더야. 저장소의 `index.html`(화면)과 `setup/Code.gs.txt`(서버 코드)를 **그대로** 돌려서 폰 크기 크롬으로 써볼 수 있게 해 줘. 구글 로그인, 구글 저장소, 캘린더만 가짜야.

## 준비

```
cd dev && npm install     # Pretendard 글꼴만 받음. playwright는 따로 깔려 있어야 함
```

## 쓰는 법

```js
const H = require('./harness');
const h = await H.open({ seed: 'full', now: '2026-11-23', viewport: { width: 360, height: 780 } });
await h.page.click('.tabbar [data-tab="list"]');
await h.shot('list');            // dev/shots/list.png
console.log(h.errors, h.calls);  // 화면 오류, 서버 호출 기록
await h.close();
```

- `seed`: `'full'`(항목 15개 + 결제 수단 4개), `'empty'`, 또는 직접 만든 객체
- `seedAt` / `now`: 자료를 넣은 날 / 화면을 여는 날 (한국 시간)
- `afterSeed`: 자료를 넣은 뒤 서버에 할 일 (`seedlife.js`는 한 달쯤 쓴 상태를 만듦)
- `latency`: 서버 응답 지연(ms), `h.failNext(n)`: 다음 서버 호출 n번을 끊김으로
- `dark`, `loggedOut`, `viewport`, `device`

## 파일

- `gas.js`: 가짜 구글 환경. 실제처럼 호출마다 전역을 새로 만들고 사용자별 저장 공간에 저장
- `harness.js`: 화면을 여는 공통 틀
- `test.js`: 고친 것들이 계속 되는지 확인하는 검사 (`node test.js`, 이름 일부만 주면 그것만)
- `audit/`: 2026-11-23 출시 전 검수 때 문제를 재현한 스크립트
