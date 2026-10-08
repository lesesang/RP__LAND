# RP LAND

스레드로 이야기를 이어 쓰고, 위키로 설정을 정리하는 한국어 역할극 커뮤니티입니다.

- [사이트 열기](https://rp-land.rpland.workers.dev)
- [사이트 사용법](https://rp-land.rpland.workers.dev/?view=help)
- [운영·배포·백업 안내](docs/personal-cloudflare-d1.md)

## 주요 기능

- 스레드, 위키, 자유롭게 수정·삭제할 수 있는 연습장
- 색상·루비·접어보기·투명글 등 글 꾸미기와 미리보기
- 서버에서 굴리고 저장하는 주사위, 스레드별 임시 계산기
- 앵커·슈퍼 앵커, 수동 새로고침, 대표 이미지
- 비밀 스레드, 예약 게시와 시간표
- 공동 편집, 카테고리, 총관리자·부관리자 권한
- 캐릭터명 저장, 아이디·비밀번호 변경, 계정 탈퇴

스레드 본문은 5,000자, 위키 본문은 50,000자, 레스는 1,500자까지 작성할 수 있습니다. 스레드와 연습장에는 각각 레스 1,500개까지 들어갑니다. 세부 사용법과 실제 서식 예시는 사이트의 사용법 페이지를 참고하세요.

## 저장과 배포 구조

| 구분 | 역할 |
| --- | --- |
| GitHub | 코드와 변경 이력 보관 |
| Cloudflare Worker `rp-land` | 화면과 API 실행 |
| Cloudflare D1 `rp-land` / 바인딩 `DB` | 계정·게시글·레스·권한·주사위 결과 저장 |
| 외부 이미지 주소 | 이미지 원본 제공. 파일 업로드·자체 이미지 보관은 지원하지 않음 |

기본 빌드 대상은 개인 Cloudflare입니다. GitHub에 커밋한 뒤 운영 사이트에 반영하려면 별도로 배포해야 합니다. 기존 데이터는 D1에 남으며, 코드 저장소에는 게시글 백업이 포함되지 않습니다.

## 개발

Node.js 22.13 이상과 pnpm 11.25.0을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm exec wrangler d1 migrations apply DB --local --config dist/server/wrangler.json --persist-to .wrangler/state
pnpm dev
```

로컬 DB와 운영 DB는 별개입니다. 운영 배포는 [배포 안내](docs/personal-cloudflare-d1.md)를 따르세요.

## 코드 위치

| 경로 | 내용 |
| --- | --- |
| `app/page.tsx` | 목록·상세·계정 화면 |
| `app/api/[...path]/route.ts` | 인증·게시글·관리 API |
| `components/editor.tsx`, `components/rich-text.tsx` | 작성 도구와 서식 표시 |
| `components/help-page.tsx` | 사이트 사용법 |
| `lib/roleplay.ts`, `lib/calculator.ts` | 주사위와 계산기 |
| `lib/request-limits.ts` | 인증 요청 제한에 사용하는 접속 식별 |
| `db/schema.ts`, `drizzle/` | DB 구조와 마이그레이션 |
| `vite.config.ts` | 빌드와 개인 Cloudflare 연결 설정 |

## 검증

```sh
pnpm exec tsc --noEmit --incremental false
node tests/run-render.mjs
node tests/request-limits.mjs
pnpm run build
```

서식·주사위·계산기 검사와 분리된 메모리 DB를 사용하는 인증 API 검사입니다. 운영 DB를 변경하지 않습니다. `tests/`의 날짜별 보고서는 당시의 검증 기록이며 현재 버전 전체의 보안 인증을 뜻하지 않습니다. 과거 운영 테스트·초기화 스크립트를 실제 사이트에 실행하지 마세요.

## 운영 시 알아둘 점

- 비밀번호는 해시로, 로그인·열람 토큰은 해시와 만료 시각으로 저장합니다. 권한은 서버에서 검사합니다.
- 가입·로그인·비밀 스레드 인증에는 접속 주소별 제한이 있습니다. 같은 공유기 사용자는 제한을 공유할 수 있습니다.
- 일반 문서는 수정 이력을 보관하지 않습니다. 자동 비밀번호 복구는 지원하지 않습니다.
- 공개 초기화 API는 없습니다. DB 백업은 `pnpm db:backup`으로 직접 실행합니다.
- 운영 키와 DB 백업 파일은 저장소에 올리지 마세요.
