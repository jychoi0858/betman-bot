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

// 2) 배팅 실행
app.post('/api/bet', async (req, res) => {
  try {
    const { selections, amount } = req.body;
    // selections: [{ gameId: '...', pick: 'win' | 'draw' | 'lose' }, ...]
    // amount: 배팅 금액

    if (!selections || !selections.length) {
      return res.status(400).json({ success: false, error: '선택된 경기가 없습니다' });
    }
    if (!amount || amount < 100) {
      return res.status(400).json({ success: false, error: '최소 배팅 금액은 100원입니다' });
    }

    const result = await placeBet(selections, amount);
    res.json({ success: true, result });
  } catch (error) {
    console.error('배팅 에러:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
