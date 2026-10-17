# 모여봄

가능한 시간을 모으고 함께할 활동을 골라 약속을 확정하는 모임 앱입니다.

- 운영 주소: https://personal-calendar-pied-three.vercel.app/
- 저장소: https://github.com/yeaun12/personal-calendar
- 구성: 빌드 없는 HTML/CSS/JavaScript + Supabase Auth/Postgres

## 사용 흐름

1. 이메일 아이디·비밀번호·닉네임으로 회원가입하고 메일을 확인합니다. 기존 매직 링크 사용자는 ‘비밀번호 찾기 / 처음 설정’에서 비밀번호를 설정합니다.
2. 모임을 만들면 12자리 초대 코드가 자동 생성됩니다. 모임장은 코드나 링크를 복사해 전달할 수 있습니다.
3. 참여자는 로그인 후 코드로 모임 이름을 확인하고 가입합니다. 이후에는 ‘내 모임’에 계속 표시됩니다.
4. 모임장은 후보 날짜(최대 14개), 시간 범위, 소요 시간, 응답 마감, 활동 후보를 입력합니다.
5. 각자 가능한 30분 구간과 활동을 선택합니다. 날짜/전체 모두 가능, 참여 어려움, 응답 수정, 활동 후보 추가를 지원합니다.
6. 연속된 소요 시간 전체가 가능한 사람 수로 시간을 추천합니다. 전원 가능 여부와 미응답을 분리해 표시합니다. 동점 활동은 보조 룰렛으로 선택할 수 있습니다.
7. 모임장이 날짜·활동·장소를 확정하면 약속 카드가 공유됩니다. 문구 복사와 ICS 캘린더 다운로드를 지원합니다.

모든 시간은 한국 시간(KST) 기준입니다. PC에서는 시간 버튼 드래그, 모바일에서는 날짜 탭과 큰 시간 버튼, 하단 저장 버튼을 사용합니다. 알림은 앱 내 미응답 현황·마감 표시와 독촉 문구 복사 방식입니다. 자동 이메일/푸시 알림은 제공하지 않습니다. 다른 사람의 최신 응답은 ‘새로고침’으로 불러옵니다.

## 파일

- `index.html`, `app.css`, `app.js`: 실제 모임 앱
- `group-core.js`: 연속 시간과 활동 추천 계산
- `supabase-config.js`: 공개 가능한 URL/publishable key만 포함
- `vendor/`: 버전을 고정한 Supabase SDK 2.118.0과 라이선스
- `database/groups.sql`, `database/groups-deny-direct.sql`: 순서대로 적용하는 모임 스키마
- `tests/groups-rollback.sql`: 실제 DB 3계정 권한 검증, 전체 롤백
- `tests/groups-ui.cjs`: 가짜 전송 계층을 사용하는 UI/추천 로직 테스트
- `cloud-polls.html`, `cloud-polls.js`, `supabase-schema.sql`: 이전 개인 투표 기능, 데이터 유지
- `demo.html`, `workspace.html`, `personal-calendar.html`: 이전 체험용 화면. 실제 모임 기능은 루트 앱을 사용합니다.

## 접근 제어

모임 테이블 4개는 RLS와 직접 접근 거부 정책을 활성화하고 클라이언트 테이블 권한을 제거했습니다. `public.moyeobom`은 SECURITY INVOKER 진입점이며, 비공개 스키마의 제한된 함수만 호출합니다. 이 함수는 SECURITY DEFINER이므로 모든 요청에서 `auth.uid()`와 실제 모임 가입 정보를 검사합니다. search_path는 빈 값으로 고정합니다. anon/PUBLIC 실행 권한은 없습니다.

- 모임장: 모임 생성, 코드 재발급, 투표 생성·마감·재개·확정
- 모임원: 가입한 모임 조회, 활동 후보 추가, 자기 응답만 저장·수정
- 모임 밖 사용자: 모임/투표/응답 조회 불가. 유효한 초대 코드를 가진 로그인 사용자는 가입 전 모임 이름만 확인 가능
- 초대 코드는 모임장에게만 반환됩니다. 재발급해도 기존 가입 상태는 유지됩니다.
- 마감 시각·상태·선택 범위는 서버에서 검증합니다. 투표 행 잠금으로 마감과 응답 변경이 충돌하지 않게 합니다.
- 닉네임은 사용자 메타데이터를 표시할 뿐 권한 판단에 사용하지 않습니다. 이메일은 다른 모임원에게 반환하지 않습니다.
- 기존 개인 투표의 소유자 전용 정책은 유지합니다.

## Auth 운영 설정

Supabase Authentication → URL Configuration에서 다음 주소가 허용되어야 합니다.

- Site URL: `https://personal-calendar-pied-three.vercel.app/`
- Redirect URL: `https://personal-calendar-pied-three.vercel.app/`
- Redirect URL: `https://personal-calendar-pied-three.vercel.app/?recovery=1`
- 이전 개인 페이지: `https://personal-calendar-pied-three.vercel.app/cloud-polls.html`

이메일 인증은 끄지 않았습니다. 메일 확인/재설정 링크는 요청했던 브라우저에서 열어야 합니다(PKCE). 실제 메일 발송·수신과 URL 허용 설정은 이번 자동 테스트에 포함되지 않습니다. 기본 메일 서비스 제한으로 외부 사용자의 가입 메일이 거부된다면 사용자 소유 SMTP 설정이 필요합니다. 비밀번호나 SMTP 비밀키를 소스에 넣지 않습니다.

## 검증 (2026-10-17)

```sh
npm ci --prefix tests
npm test --prefix tests
```

- 모임 UI/로직 9개: 응답 대기 목록, 닉네임 이스케이프, 실패 시 입력 유지, 응답 집계, 약속 확정·잠금, 로그아웃 데이터 제거, 회원가입 필드, 비연속 시간 제외, 활동 동점
- 실제 DB 롤백 검증: 세 계정의 외부 접근 차단, 코드 확인·가입·중복 가입, 모임원 관리권한 차단, 자기 응답만 저장, 시간 검증, 코드 재발급, 마감/확정 뒤 응답 차단, 확정 내용 공유, 익명 호출 차단
- 이전 개인 투표 테스트는 별도 유지
- 가짜 전송 계층 UI 테스트와 DB 권한 테스트를 구분합니다. 실제 이메일 로그인부터 두 기기에서 가입·응답하는 종단간 테스트는 아직 사용자 확인이 필요합니다.

정적 파일을 같은 출처에서 제공하면 됩니다. Vercel은 GitHub main 변경으로 배포됩니다. `.vercelignore`가 테스트와 SQL 문서를 배포에서 제외합니다.
