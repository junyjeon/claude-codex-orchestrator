# CLAUDE.md

## 프로젝트 개요

- 저장소: claude-codex-orchestrator
- Claude Code에서 Codex CLI로 작업을 위임하는 MCP 서버

현재 상태: Node.js 20 + TypeScript 5.8 + MCP SDK 1.26 + Vite 6.3

Claude와 Codex의 강점이 다르다. 이 서버는 4개 MCP 도구를 통해 코드 생성, 자율 실행, 코드 리뷰, 모델 추천을 제공한다. 4계층 보안 방어(스키마/경로/프로세스/출력)가 적용되어 있다. 모델 비교는 [docs/모델비교.md](docs/모델비교.md) 참조.


## 빌드 및 실행

```bash
npm install
npm run dev          # vite build --watch
npm run build        # vite production build
npm test             # vitest (118 tests, 10 files)
npm run test:watch   # vitest --watch
npm run typecheck    # tsc --noEmit (strict mode)
npm run lint         # biome check .
npm run lint:fix     # biome check --write .
npm run format       # biome format --write .
```

### 환경변수

`.env.example` 참조. `.env`에 복사해서 사용한다.

```env
LOG_LEVEL=info                        # debug|info|warn|error
CODEX_TIMEOUT=30000                   # generate/review 타임아웃 (ms)
CODEX_EXECUTE_TIMEOUT=120000          # execute 타임아웃 (ms)
CODEX_ALLOWED_DIRS=/home/user/projects:/tmp  # 허용 디렉토리 (필수)
CODEX_ALLOW_DANGER_SANDBOX=false      # danger-full-access 허용 여부
CODEX_ALLOW_FULL_AUTO=false           # --full-auto 허용 여부
CODEX_MAX_CONCURRENT=3                # 동시 프로세스 제한 (1-10)
```


## 아키텍처

```
Claude Code → MCP(stdio) → server.ts → tools/* → codex/client.ts → spawn('codex') → Codex CLI
                                ↓
                          router/suggest.ts (규칙 기반, API 호출 없음)
```

server.ts가 McpServer 인스턴스를 생성하고 4개 도구를 registerTool()로 등록한다. 각 도구 핸들러는 security.ts로 경로를 검증한 뒤 codex/client.ts를 통해 Codex CLI를 spawn한다. 프롬프트는 stdin pipe로 전달되어 command injection을 차단한다.

```
src/
├── index.ts          # CLI 진입점, env 파싱 + Zod 검증
├── server.ts         # McpServer + 4개 도구 등록
├── security.ts       # 경로 검증, 에러 sanitize, ProcessSemaphore
├── codex/
│   ├── client.ts     # spawn 래퍼, 세마포어, 타임아웃 cascade
│   ├── parser.ts     # JSONL 스트림 파서 (codex --json 출력)
│   └── prompts.ts    # 도구별 프롬프트 템플릿
├── router/
│   └── suggest.ts    # 규칙 기반 모델 추천 (키워드 + 가중치 합산)
├── tools/
│   ├── generate.ts   # codex_generate 핸들러
│   ├── execute.ts    # codex_execute 핸들러
│   └── review.ts     # codex_review 핸들러 + JSON 파싱 전략
└── types/
    └── index.ts      # 타입, enum, 입출력 인터페이스
```

### MCP 도구

| 도구 | 역할 | API 호출 |
|------|------|----------|
| codex_generate | 코드 생성 (first-attempt) | Codex CLI |
| codex_execute | 자율 실행 (do-run-inspect) | Codex CLI |
| codex_review | 코드 리뷰 (다른 AI 관점) | Codex CLI |
| suggest_model | 모델 추천 (규칙 기반) | 없음 |


## 컨벤션

커밋: `.gitmessage.txt` 참조. `<type>(<scope>): <summary>` 형식, 50자 이내 한글 간결체.

타입: feat, fix, refactor, docs, test, chore, perf, style, ci

ESM only. `import/export` 사용, `require` 금지. 파일 확장자 `.js` 포함 (import 경로).

TypeScript strict 모드 전체 활성. `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` 포함.

Biome가 포맷과 린트를 처리한다. `biome.json` 참조. 싱글 쿼트, 세미콜론, trailing comma.


## 주의사항

수정 금지:
- `src/types/index.ts`의 enum 값: MCP 클라이언트와의 인터페이스. 변경하면 기존 사용자가 깨진다
- `.env.example`: 사용자 문서와 동기화 필요. README.md와 함께 변경해야 한다

보안:
- `security.ts`의 SENSITIVE_PATTERNS: 시크릿 redaction 패턴. 패턴 제거 시 시크릿이 MCP 응답에 노출된다
- `validateWorkingDir()`의 realpathSync: 심볼릭 링크 공격 방어. resolve()만으로 교체 금지
- `codex/client.ts`의 stdin pipe: command injection 방어. shell: true 옵션 절대 추가 금지
- danger-full-access sandbox는 Zod 스키마에서 조건부 제외된다. `server.ts`의 sandboxOptions 로직 확인

함정:
- `buildArgs()`에서 approvalMode와 fullAuto가 동시에 설정되면 approvalMode가 우선. 의도된 동작이다
- `parseReviewOutput()`은 3단계 파싱 전략을 사용한다 (직접 JSON → 추출 → fallback). 순서를 바꾸면 안 된다
- Codex CLI가 설치되지 않으면 ENOENT 에러. 테스트는 spawn을 mock한다


## 문서 관리

| 상황 | 업데이트할 문서 |
|------|----------------|
| MCP 도구 추가/변경 | README.md (Tools 섹션), CLAUDE.md (아키텍처) |
| 환경변수 추가 | .env.example, README.md (Environment Variables), CLAUDE.md (환경변수) |
| 디렉토리 구조 변경 | CLAUDE.md (아키텍처), README.md (Architecture) |
| 보안 로직 변경 | README.md (Security), CLAUDE.md (주의사항) |


## 맥락 관리

세션 간 맥락을 context/MMDD.md에 축적한다.

세션 시작:
1. 최근 context/ 파일 확인
2. 이전 세션의 "할 것" 항목 파악

세션 종료:
1. context/MMDD.md 작성 (한 것/근거/할 것)
2. CLAUDE.md 업데이트 (구조 변경 시)
