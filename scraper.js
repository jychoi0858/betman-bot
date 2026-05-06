const puppeteer = require('puppeteer-core');

/**
 * betman.co.kr에서 프로토 승부식 경기 목록을 스크래핑
 */
async function scrapeGames() {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--js-flags=--max-old-space-size=256',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // betman 프로토 승부식 페이지로 이동
    await page.goto('https://www.betman.co.kr/main/mainPage/gamebuy/gameSlipIFR.do?gmId=G101&gmTs=01', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // 페이지 로딩 대기
    await new Promise(r => setTimeout(r, 5000));

    // "발매중" 탭 클릭 (data-val="2")
    const sellingTab = await page.$('#buyPsb1StTab_2');
    if (sellingTab) {
      await sellingTab.click();
      await new Promise(r => setTimeout(r, 2000));
    }

    // 경기 데이터 추출
    const games = await page.evaluate(() => {
      const gameList = [];

      const items = document.querySelectorAll('#tbd_gmBuySlipList .accordion-content li[data-matchseq]');

      items.forEach((item) => {
        try {
          const matchSeq = item.getAttribute('data-matchseq') || '';

          const dateEl = item.querySelector('.box-data span.db');
          const date = dateEl ? dateEl.textContent.trim().replace(' 마감', '') : '';

          const gameTypeEl = item.querySelector('b.game');
          const gameType = gameTypeEl ? gameTypeEl.textContent.trim() : '';

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

          const btnBox = item.querySelector('.btnChkBox');
          const gameCombKey = btnBox ? btnBox.getAttribute('data-gamecombkey') || '' : '';
          const buttons = item.querySelectorAll('.btnChk');

          const odds = { win: 0, draw: 0, lose: 0 };
          const hasButtons = buttons.length;

          buttons.forEach((btn) => {
            const selKey = btn.getAttribute('data-selkey');
            const spans = btn.querySelectorAll('span');
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
              buttonCount: hasButtons,
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
