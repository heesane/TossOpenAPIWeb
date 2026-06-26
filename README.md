# Toss OpenAPI Trading Console

토스증권 OpenAPI를 기반으로 계좌 손익, RSI 자동매매 조건, 포트폴리오 리밸런싱 판단 흐름을 한 화면에서 다루는 Next.js 웹 콘솔입니다.

## 핵심 흐름

- 사용자별 Toss OpenAPI API Key와 Secret Key 입력
- Next.js Route Handler를 통한 실제 Toss API 호출
- 보유 종목 평가금액, 손익률, RSI 신호 조회
- RSI 기준과 종목별 최대 주문 비중 설정
- 목표 비중 대비 리밸런싱 후보 검토
- 로컬 `toss_open_api.json` 기반 API 작업 목록 표시

## 기술 스택

- TypeScript
- Next.js App Router
- Tailwind CSS
- shadcn/ui

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 검증

```bash
npm run lint
npm run build
```

## API Spec

루트의 `toss_open_api.json`을 읽어 API 버전, 서버 URL, 엔드포인트 그룹, 계좌·시세·주문 작업 수를 화면에 반영합니다.

실제 조회는 `POST /api/toss/snapshot`에서 처리합니다. 이 Route Handler는 `/oauth2/token`으로 access token을 발급한 뒤 `/api/v1/accounts`, `/api/v1/holdings`, `/api/v1/orders`, `/api/v1/buying-power`, `/api/v1/commissions`, `/api/v1/candles`를 호출합니다.

Secret Key는 조회 요청 때만 서버로 전달되며, 저장소에 기록하지 않습니다.
