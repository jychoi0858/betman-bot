require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { scrapeGames } = require('./scraper');
const { placeBet } = require('./betbot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// 프론트엔드 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));

// 메인 페이지 → 프론트엔드
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 헬스체크
app.get('/api/health', (req, res) => {
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
