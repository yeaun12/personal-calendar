# 모여봄

모임에 가능한 날짜·시간을 고르고 약속 종류에 맞는 활동 아이디어를 찾는 앱입니다.

- 배포: https://personal-calendar-pied-three.vercel.app/
- 서버 저장 화면: https://personal-calendar-pied-three.vercel.app/cloud-polls.html
- 저장소: https://github.com/yeaun12/personal-calendar

## 현재 단계 (2026-10-17)

| 화면 | 기능 | 저장 방식 |
|---|---|---|
| `index.html` | 날짜·시간 투표, 결과, 아이디어 룰렛 체험 | 페이지 메모리. 새로고침하면 초기화 |
| `cloud-polls.html` | 이메일 로그인, 내 투표 생성·목록·다시 열기, 응답 저장·수정, 마감·재열기 | Supabase. 로그인한 소유자만 접근 |
| `workspace.html` | 모임·초대 코드 데모 | 같은 브라우저의 localStorage |
| `personal-calendar.html` | 개인 일정·약속 신청 데모 | 같은 브라우저의 localStorage |

서버 저장은 **본인이 직접 기록한 투표와 응답을 보관하는 단계**입니다. 다른 계정 초대·공유 투표와 개인 캘린더 서버 연동은 아직 구현하지 않았습니다. 결과의 시간 후보 선택은 화면 내 표시이며 확정 일정으로 저장되지 않습니다.

## 연결 정보와 인증

`supabase-config.js`에는 personal-calendar 프로젝트의 공개 URL과 publishable key만 들어갑니다. 비밀 키는 필요하지 않습니다. 접근 제어는 DB RLS에서 수행합니다.

Supabase Authentication → URL Configuration에서 다음을 확인합니다.

- Site URL: `https://personal-calendar-pied-three.vercel.app/cloud-polls.html`
- Redirect URLs: `https://personal-calendar-pied-three.vercel.app/cloud-polls.html`

이메일 인증은 활성화된 것을 확인했습니다. URL 설정과 실제 메일 도착·로그인 완료 여부는 별도 사용자 확인이 필요합니다. PKCE 흐름이므로 로그인 링크는 요청했던 브라우저에서 여세요. 기본 메일 발송 서비스가 수신자를 제한하면 실제 모임 공유 전 별도 SMTP 설정이 필요합니다.

## 데이터베이스

연결 프로젝트에 `polls`, `poll_responses`가 이미 있으며, 본인 전용 RLS가 활성화되어 있습니다. 2026-10-17 `restrict_closed_poll_writes`, `validate_personal_poll_slots` 마이그레이션으로 다음을 적용했습니다.

- 미로그인 테이블 접근 차단 및 과도한 테이블 권한 제거
- 마감된 투표의 응답 생성·수정·삭제 차단
- 저장하는 시간 칸이 해당 투표 날짜·시간 범위에 속하는지 검증
- 소유자 조회용 인덱스

`supabase-schema.sql`은 새 프로젝트 재현 또는 전체 구조 확인용입니다. 현재 연결 프로젝트에는 위 변경이 이미 적용돼 있으므로 다시 실행할 필요가 없습니다. 개인 캘린더 데모는 화면에만 일정 상세를 숨기므로 민감한 실제 일정은 넣지 않습니다.

## 확인한 것 / 아직 확인할 것

- `tests/cloud-ui.cjs`: JSDOM + 모의 API로 화면 로직 8건 통과. 생성, 응답 저장과 이스케이프, 재로딩, 중복 이름 수정, 저장 실패 시 입력 유지, 마감, 재열기, 로그아웃 시 화면 정리.
- `tests/rls-rollback.sql`: 실제 DB에서 트랜잭션 한정 시험 사용자로 본인 저장·조회·수정, 타인 접근 차단, 미로그인 차단, 잘못된 시간 차단, 마감/재열기 검증 통과. 끝에 ROLLBACK하여 사용자·시험 데이터는 남기지 않음.
- Supabase 보안 advisor: 경고 0건.
- 실제 이메일 수신 → 로그인 → 브라우저 저장 → 새로고침 유지: 사용자 로그인 후 확인 필요. 위 검사 결과를 이 전체 흐름의 통과로 해석하지 않습니다.

화면 로직 검사를 재현하려면 Node.js 22+에서 `npm ci --prefix tests` 후 `npm test --prefix tests`를 실행합니다. 앱 자체는 빌드가 필요 없는 정적 HTML입니다.

## 의존성

Supabase JS 2.118.0 UMD 파일을 `vendor/supabase-2.118.0.js`에 포함했습니다. npm 배포본에서 가져왔으며 라이선스는 `vendor/supabase-LICENSE`에 있습니다. 외부 CDN 없이 로드됩니다.

## 다음 목표

실제 로그인 흐름 확인 → 초대받은 다른 계정의 투표 참여 → 모임 사용 피드백 → 최종 제출. ‘하나 이상의 모임이 앱을 사용’했다는 완성 기준은 아직 충족한 것으로 기록하지 않습니다.
