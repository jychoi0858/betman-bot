const { chromium } = require('playwright');

/**
 * betman에 로그인하고 선택한 경기에 배팅
 *
 * @param {Array} selections - [{ matchSeq: '1812', pick: 'win'|'draw'|'lose' }, ...]
 * @param {number} amount - 배팅 금액
 * @param {string} userId - betman 아이디
 * @param {string} userPw - betman 비밀번호
 */
async function placeBet(selections, amount, userId, userPw) {
  if (!userId || !userPw) {
    throw new Error('아이디와 비밀번호를 입력해주세요');
  }

  let browser = null;
  const logs = [];

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

    // ===== 1단계: 메인 페이지 로딩 & 로그인 =====
    await page.goto('https://www.betman.co.kr/main/mainPage/main.do', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    logs.push('betman 메인 페이지 로딩 완료');

    // 로그인 폼 찾기 (iframe 포함)
    let loginFrame = page;
    const frames = page.frames();
    for (const frame of frames) {
      const idInput = await frame.$('input[name="userId"], input[id="userId"]');
      if (idInput) {
        loginFrame = frame;
        break;
      }
    }

    // 아이디/비밀번호 입력
    const idInput = await loginFrame.$('input[name="userId"], input[id="userId"]');
    const pwInput = await loginFrame.$('input[name="userPw"], input[id="userPw"], input[type="password"]');

    if (idInput && pwInput) {
      await idInput.fill(userId);
      await pwInput.fill(userPw);
      logs.push('로그인 정보 입력 완료');
    } else {
      // 로그인 버튼/링크를 클릭해서 로그인 폼으로 이동
      const loginLink = await page.$('a[href*="login"], .login-btn, [class*="login"] a');
      if (loginLink) {
        await loginLink.click();
        await page.waitForTimeout(2000);
      }
      await page.fill('input[name="userId"], input[id="userId"]', userId);
      await page.fill('input[type="password"]', userPw);
      logs.push('로그인 정보 입력 완료 (대체 방법)');
    }

    // 로그인 제출
    const submitBtn = await loginFrame.$('button[type="submit"], input[type="submit"], .btn-login');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await loginFrame.press('input[type="password"]', 'Enter');
    }
    await page.waitForTimeout(3000);
    logs.push('로그인 시도');

    // ===== 2단계: 프로토 승부식 구매 페이지로 이동 =====
    await page.goto('https://www.betman.co.kr/main/mainPage/gamebuy/gameSlipIFR.do?gmId=G101&gmTs=01', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // "발매중" 탭 클릭
    const sellingTab = await page.$('#buyPsb1StTab_2');
    if (sellingTab) {
      await sellingTab.click();
      await page.waitForTimeout(2000);
    }
    logs.push('프로토 승부식 구매 페이지 이동');

    // ===== 3단계: 경기 선택 =====
    const pickToSelKey = { win: '1', draw: '2', lose: '3' };

    for (const sel of selections) {
      const { matchSeq, pick } = sel;
      const selKey = pickToSelKey[pick];

      if (!selKey) {
        logs.push(`경기 ${matchSeq}: 잘못된 선택값 "${pick}"`);
        continue;
      }

      try {
        // matchSeq로 해당 경기 li 찾기
        const gameItem = await page.$(`li[data-matchseq="${matchSeq}"]`);

        if (gameItem) {
          // 해당 경기의 승/무/패 버튼 찾기 (data-selkey 기반)
          const btn = await gameItem.$(`button.btnChk[data-selkey="${selKey}"]`);

          if (btn) {
            await btn.click();
            await page.waitForTimeout(500);
            const pickName = { win: '승', draw: '무', lose: '패' }[pick];
            logs.push(`경기 ${matchSeq}: ${pickName} 선택 완료`);
          } else {
            logs.push(`경기 ${matchSeq}: 해당 선택 버튼을 찾을 수 없음`);
          }
        } else {
          logs.push(`경기 ${matchSeq}: 해당 경기를 찾을 수 없음`);
        }
      } catch (e) {
        logs.push(`경기 ${matchSeq}: 선택 실패 - ${e.message}`);
      }
    }

    // ===== 4단계: 금액 입력 및 구매 =====
    // betman의 금액 입력 필드 찾기
    const amountInput = await page.$('input[name="buyAmt"], input[id="buyAmt"], input.buy-amount');
    if (amountInput) {
      await amountInput.fill(String(amount));
      logs.push(`배팅 금액 ${amount}원 입력`);
    } else {
      logs.push('금액 입력 필드를 찾을 수 없음 - 수동으로 금액 입력 필요');
    }

    // 구매하기 버튼 클릭
    const buyBtn = await page.$('button.btn.btnM.blue, button:has-text("구매하기"), .btn-buy');
    if (buyBtn) {
      await buyBtn.click();
      await page.waitForTimeout(2000);
      logs.push('구매 버튼 클릭');

      // 확인 팝업
      const confirmBtn = await page.$('.popup-confirm button, .layerPop button.btn.blue, button:has-text("확인")');
      if (confirmBtn) {
        await confirmBtn.click();
        logs.push('구매 확인 완료');
      }
    } else {
      logs.push('구매 버튼을 찾을 수 없음');
    }

    await page.waitForTimeout(3000);
    logs.push('배팅 프로세스 완료');

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
