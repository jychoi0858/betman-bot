const { chromium } = require('playwright');

/**
 * betman.co.kr에서 프로토 승부식 경기 목록을 스크래핑
 *
 * 반환 형식:
 * [{
 *   matchSeq: '1812',
 *   league: 'NPB',
 *   home: '요미우리자이언츠',
 *   away: '히로시마도요카프',
 *   date: '04.28 (화) 18:00',
 *   gameType: '야구 승패',
 *   gameCombKey: 'BS1777366800000요미우리자이언츠히로시마도요카프',
 *   odds: { win: 1.59, draw: 0, lose: 1.92 }
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
    await page.waitForTimeout(5000);

    // "발매중" 탭 클릭 (data-val="2")
    const sellingTab = await page.$('#buyPsb1StTab_2');
    if (sellingTab) {
      await sellingTab.click();
      await page.waitForTimeout(2000);
    }

    // 경기 데이터 추출
    const games = await page.evaluate(() => {
      const gameList = [];

      // 각 경기의 상세 항목 (accordion-content 안의 li)
      const items = document.querySelectorAll('#tbd_gmBuySlipList .accordion-content li[data-matchseq]');

      items.forEach((item) => {
        try {
          const matchSeq = item.getAttribute('data-matchseq') || '';

          // 경기 시간/마감
          const dateEl = item.querySelector('.box-data span.db');
          const date = dateEl ? dateEl.textContent.trim().replace(' 마감', '') : '';

          // 게임 유형 (야구 승패, 축구 승무패 등)
          const gameTypeEl = item.querySelector('b.game');
          const gameType = gameTypeEl ? gameTypeEl.textContent.trim() : '';

          // 상위 row에서 팀명, 리그 정보 가져오기
          const accordion = item.closest('.accordion-content');
          const parentGroup = accordion ? accordion.previousElementSibling : null;

          let home = '', away = '', league = '';

          if (parentGroup) {
            const teams = parentGroup.querySelectorAll('.team');
            if (teams.length >= 2) {
              home = teams[0].textContent.trim();
              away = teams[1].textContent.trim();
            }
            const leagueEl = parentGroup.querySelector('.competition');
            league = leagueEl ? leagueEl.textContent.trim() : '';
          }

          // 배당률 버튼에서 정보 추출
          const btnBox = item.querySelector('.btnChkBox');
          const gameCombKey = btnBox ? btnBox.getAttribute('data-gamecombkey') || '' : '';
          const buttons = item.querySelectorAll('.btnChk');

          const odds = { win: 0, draw: 0, lose: 0 };
          const hasButtons = buttons.length;

          buttons.forEach((btn) => {
            const selKey = btn.getAttribute('data-selkey');
            const spans = btn.querySelectorAll('span');
            // 배당률은 보통 마지막에서 두번째 span에 있음
            let oddsValue = 0;
            spans.forEach((s) => {
              const val = parseFloat(s.textContent.trim());
              if (val > 0 && val < 100) oddsValue = val;
            });

            if (selKey === '1') odds.win = oddsValue;
            else if (selKey === '2') odds.draw = oddsValue;
            else if (selKey === '3') odds.lose = oddsValue;
          });

          if (matchSeq && home && away) {
            gameList.push({
              matchSeq,
              league,
              home,
              away,
              date,
              gameType,
              gameCombKey,
              buttonCount: hasButtons, // 2=승패, 3=승무패
              odds,
            });
          }
        } catch (e) {
          // 파싱 실패한 항목은 무시
        }
      });

      return gameList;
    });

    console.log(`스크래핑 완료: ${games.length}경기 발견`);

    // 디버깅: 경기가 없으면 페이지 상태 로그
    if (games.length === 0) {
      const bodyText = await page.evaluate(() => {
        const el = document.querySelector('#tbd_gmBuySlipList');
        return el ? el.innerHTML.substring(0, 1000) : 'tbd_gmBuySlipList 없음';
      });
      console.log('경기 목록 HTML:', bodyText);
    }

    return games;

  } catch (error) {
    console.error('스크래핑 실패:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrapeGames };
