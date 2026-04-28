require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { scrapeGames } = require('./scraper');
const { placeBet } = require('./betbot');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정 - GitHub Pages에서 요청 허용
app.use(cors({
  origin: '*', // 배포 후 GitHub Pages URL로 제한 권장
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// 헬스체크
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Betman Bot Backend Running' });
});

// 1) 경기 목록 가져오기
app.get('/api/games', async (req, res) => {
  try {
    const games = await scrapeGames();
    res.json({ success: true, games });
  } catch (error) {
    console.error('스크래핑 에러:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 디버그: betman 페이지 HTML 확인
app.get('/api/debug', async (req, res) => {
  const { chromium } = require('playwright');
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    await page.goto('https://www.betman.co.kr/main/mainPage/gamebuy/gameSlipIFR.do?gmId=G101&gmTs=01', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const debug = await page.evaluate(() => {
      return {
        title: document.title,
        url: location.href,
        bodyLength: document.body.innerHTML.length,
        gameListHTML: document.querySelector('#tbd_gmBuySlipList')?.innerHTML?.substring(0, 2000) || 'NOT FOUND',
        accordionCount: document.querySelectorAll('.accordion-content').length,
        matchItems: document.querySelectorAll('li[data-matchseq]').length,
        allButtons: document.querySelectorAll('.btnChk').length,
        tabMenuDiv: document.querySelector('#tabMenuDiv')?.innerHTML?.substring(0, 500) || 'NOT FOUND',
      };
    });

    res.json({ success: true, debug });
  } catch (error) {
    res.json({ success: false, error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// 2) 배팅 실행
app.post('/api/bet', async (req, res) => {
  try {
    const { selections, amount, userId, userPw } = req.body;

    if (!userId || !userPw) {
      return res.status(400).json({ success: false, error: '아이디와 비밀번호를 입력해주세요' });
    }
    if (!selections || !selections.length) {
      return res.status(400).json({ success: false, error: '선택된 경기가 없습니다' });
    }
    if (!amount || amount < 100) {
      return res.status(400).json({ success: false, error: '최소 배팅 금액은 100원입니다' });
    }

    const result = await placeBet(selections, amount, userId, userPw);
    res.json({ success: true, result });
  } catch (error) {
    console.error('배팅 에러:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
