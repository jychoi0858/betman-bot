const { chromium } = require('playwright');

const BETMAN_ID = process.env.BETMAN_ID;
const BETMAN_PW = process.env.BETMAN_PW;

/**
 * betman에 로그인하고 선택한 경기에 배팅
 *
 * @param {Array} selections - [{ gameId: '001', pick: 'win'|'draw'|'lose' }, ...]
 * @param {number} amount - 배팅 금액
 */
async function placeBet(selections, amount) {
  if (!BETMAN_ID || !BETMAN_PW) {
    throw new Error('BETMAN_ID, BETMAN_PW 환경변수를 설정하세요');
  }

  let browser = null;
  const logs = []; // 진행 상황 로그

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    logs.push('브라우저 시작');

    // ===== 1단계: 로그인 =====
    await page.goto('https://www.betman.co.kr/main/mainPage/main.do', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    logs.push('betman 메인 페이지 로딩 완료');

    // 로그인 버튼 클릭 → 로그인 폼으로 이동
    // NOTE: 실제 셀렉터는 betman 사이트 구조에 맞게 수정 필요
    const loginBtn = await page.$('a[href*="login"], .login-btn, #loginBtn, [class*="login"]');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForTimeout(2000);
    }

    // 아이디/비밀번호 입력
    // betman은 보통 iframe 안에 로그인 폼이 있을 수 있음
    const frames = page.frames();
    let loginFrame = page;

    for (const frame of frames) {
      const idInput = await frame.$('input[name="userId"], input[id="userId"], input[name="id"]');
      if (idInput) {
        loginFrame = frame;
        break;
      }
    }

    await loginFrame.fill('input[name="userId"], input[id="userId"], input[name="id"]', BETMAN_ID);
    await loginFrame.fill('input[name="userPw"], input[id="userPw"], input[type="password"]', BETMAN_PW);
    logs.push('로그인 정보 입력 완료');

    // 로그인 제출
    await loginFrame.click('button[type="submit"], input[type="submit"], .btn-login, #loginSubmit');
    await page.waitForTimeout(3000);
    logs.push('로그인 시도 완료');

    // 로그인 성공 확인
    const loginError = await page.$('.error-msg, .login-error, [class*="error"]');
    if (loginError) {
      const errorText = await loginError.textContent();
      throw new Error(`로그인 실패: ${errorText}`);
    }
    logs.push('로그인 성공');

    // ===== 2단계: 프로토 승부식 구매 페이지로 이동 =====
    await page.goto('https://www.betman.co.kr/main/mainPage/gamebuy/gameSlipIFR.do?gmId=G101&gmTs=01', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    logs.push('프로토 승부식 구매 페이지 이동');

    // ===== 3단계: 경기 선택 =====
    for (const sel of selections) {
      const { gameId, pick } = sel;

      // pick에 따라 승/무/패 버튼 클릭
      // NOTE: 실제 셀렉터를 betman 사이트에 맞게 수정해야 합니다
      // 일반적으로 각 경기 행에서 승/무/패 라디오 버튼이나 셀을 클릭
      const pickMap = { win: 0, draw: 1, lose: 2 };
      const pickIndex = pickMap[pick];

      if (pickIndex === undefined) {
        logs.push(`경기 ${gameId}: 잘못된 선택값 "${pick}" (win/draw/lose만 가능)`);
        continue;
      }

      try {
        // 경기 행 찾기 (gameId 기반)
        const gameRow = await page.$(`tr[data-game-id="${gameId}"], tr:nth-child(${parseInt(gameId)})`);
        if (gameRow) {
          const pickButtons = await gameRow.$$('input[type="radio"], .pick-btn, td.pick');
          if (pickButtons[pickIndex]) {
            await pickButtons[pickIndex].click();
            logs.push(`경기 ${gameId}: ${pick} 선택 완료`);
          }
        } else {
          logs.push(`경기 ${gameId}: 해당 경기를 찾을 수 없음`);
        }
      } catch (e) {
        logs.push(`경기 ${gameId}: 선택 실패 - ${e.message}`);
      }
    }

    // ===== 4단계: 금액 입력 및 구매 =====
    const amountInput = await page.$('input[name="amount"], input[id="betAmount"], input[name="buyAmt"]');
    if (amountInput) {
      await amountInput.fill(String(amount));
      logs.push(`배팅 금액 ${amount}원 입력`);
    }

    // 구매 버튼 클릭
    const buyBtn = await page.$('button.buy-btn, #buyBtn, [class*="purchase"], [class*="buy"]');
    if (buyBtn) {
      await buyBtn.click();
      await page.waitForTimeout(2000);
      logs.push('구매 버튼 클릭');

      // 확인 팝업이 있으면 확인 클릭
      const confirmBtn = await page.$('.confirm-btn, button.ok, [class*="confirm"]');
      if (confirmBtn) {
        await confirmBtn.click();
        logs.push('구매 확인 완료');
      }
    }

    await page.waitForTimeout(3000);
    logs.push('배팅 프로세스 완료');

    // 최종 스크린샷 (디버깅용)
    await page.screenshot({ path: '/tmp/bet-result.png' });

    return {
      status: 'completed',
      selections,
      amount,
      logs,
    };

  } catch (error) {
    logs.push(`에러 발생: ${error.message}`);
    return {
      status: 'error',
      error: error.message,
      logs,
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { placeBet };
