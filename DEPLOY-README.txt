피캠스 출조체크 v2 - 휴대폰 설치용 PWA 배포본

[가장 간단한 배포 방법: GitHub Pages]
1. GitHub에 새 저장소(repository)를 만듭니다. 예: ficamx-tide
2. 이 폴더 안 파일들을 저장소 최상단(root)에 모두 업로드합니다.
   중요: index.html이 저장소 최상단에 있어야 합니다.
3. 저장소 Settings > Pages로 이동합니다.
4. Build and deployment > Source를 'Deploy from a branch'로 선택합니다.
5. Branch를 main / (root)로 선택하고 Save 합니다.
6. GitHub가 제공한 https://...github.io/... 주소를 휴대폰에서 엽니다.

[휴대폰 설치]
- 안드로이드 Chrome: 화면의 '홈화면 설치' 또는 Chrome 메뉴 > 앱 설치/홈 화면에 추가
- 아이폰 Safari: 공유 버튼 > 홈 화면에 추가

[공식 조석 API]
- 앱 오른쪽 위 톱니바퀴(설정)에서 공공데이터포털 '일반 인증키'를 1회 저장합니다.
- 인증키는 소스코드에 포함되지 않고 해당 기기의 브라우저 저장공간(localStorage)에 저장됩니다.

[주의]
- PWA 설치와 서비스워커는 HTTPS 주소에서 정상 작동합니다.
- GitHub Pages 주소는 HTTPS이므로 설치 조건을 만족합니다.
