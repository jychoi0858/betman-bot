const { chromium } = require('playwright');

/**
 * betman.co.kr에서 프로토 승부식 경기 목록을 스크래핑
 *
 * 반환 형식:
 * [{
 *   gameId: '001',
 *   round: '132회차',
 *   league: 'EPL',
 *   home: '맨시티',
 *   away: '리버풀',
 *   date: '2026-04-30 20:00',
 *   odds: { win: 1.85, draw: 3.40, lose: 4.20 }
 * }, ...]
 */
async function scrapeGames() {
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // betman 프로토 승부식 페이지로 이동
    await page.goto('https://www.betman.co.kr/main/mainPage/gamebuy/gameSlipIFR.do?gmId=G101&gmTs=01', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 페이지 로딩 대기
    await page.waitForTimeout(3000);

    // 경기 데이터 추출
    // NOTE: betman 사이트의 실제 HTML 구조에 맞게 셀렉터를 조정해야 합니다
    const games = await page.evaluate(() => {
      const gameList = [];

      // 프로토 승부식 경기 테이블에서 데이터 추출
      // 실제 셀렉터는 betman 사이트 구조에 따라 달라질 수 있음
      const rows = document.querySelectorAll('table.gameTable tbody tr, .game-list .game-item, [class*="game"] tr');

      rows.forEach((row, index) => {
        try {
          // 방법 1: 테이블 구조인 경우
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) {
            const gameId = String(index + 1).padStart(3, '0');
            const homeTeam = cells[1]?.textContent?.trim() || '';
            const awayTeam = cells[3]?.textContent?.trim() || '';
            const league = cells[0]?.textContent?.trim() || '';

            if (homeTeam && awayTeam) {
              gameList.push({
                gameId,
                league,
                home: homeTeam,
                away: awayTeam,
                date: cells[4]?.textContent?.trim() || '',
                odds: {
                  win: parseFloat(cells[5]?.textContent?.trim()) || 0,
                  draw: parseFloat(cells[6]?.textContent?.trim()) || 0,
                  lose: parseFloat(cells[7]?.textContent?.trim()) || 0,
                },
              });
            }
          }
        } catch (e) {
          // 파싱 실패한 행은 무시
        }
      });

      return gameList;
    });

    // 스크래핑 결과가 비어있으면 대체 방법 시도
    if (games.length === 0) {
      console.log('기본 셀렉터로 데이터를 찾지 못함. 페이지 HTML 구조 확인 필요.');

      // 디버깅용: 페이지의 주요 구조 출력
      const pageContent = await page.content();
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
      console.log('페이지 내용 미리보기:', bodyText);

      // 대체 방법: betman API 직접 호출 시도
      const apiGames = await tryApiApproach(page);
      if (apiGames.length > 0) return apiGames;
    }

    return games;

  } catch (error) {
    console.error('스크래핑 실패:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * betman이 내부적으로 사용하는 API를 직접 호출하는 대체 방법
 */
async function tryApiApproach(page) {
  try {
    // betman의 내부 API 엔드포인트 호출 시도
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/main/mainPage/gamebuy/closedGameSlip.do', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'gmId=G101&gmTs=01',
        });
        return await res.text();
      } catch {
        return null;
      }
    });

    if (response) {
      console.log('API 응답 수신됨, 파싱 시도...');
      // API 응답 파싱 로직 (실제 응답 형식에 맞게 수정 필요)
    }
  } catch (e) {
    console.log('API 접근도 실패:', e.message);
  }

  return [];
}

module.exports = { scrapeGames };
