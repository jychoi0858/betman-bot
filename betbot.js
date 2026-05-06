const puppeteer = require('puppeteer-core');

/**
 * betman에 로그인하고 선택한 경기에 배팅
 */
async function placeBet(selections, amount, userId, userPw) {
  if (!userId || !userPw) {
    throw new Error('아이디와 비밀번호를 입력해주세요');
  }

  let browser = null;
  const logs = [];

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
    logs.push('브라우저 시작');

    // ===== 1단계: 로그인 =====
    await page.goto('https://www.betman.co.kr/main/mainPage/main.do', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    logs.push('betman 메인 페이지 로딩 완료');

    // 로그인 폼 찾기
    const frames = page.frames();
    let loginFrame = page;
    for (const frame of frames) {
      const idInput = await frame.$('input[name="userId"], input[id="userId"]');
      if (idInput) {
        loginFrame = frame;
        break;
      }
    }

    const idInput = await loginFrame.$('input[name="userId"], input[id="userId"]');
    const pwInput = await loginFrame.$('input[name="userPw"], input[id="userPw"], input[type="password"]');

    if (idInput && pwInput) {
      await idInput.type(userId);
      await pwInput.type(userPw);
      logs.push('로그인 정보 입력 완료');
    } else {
      const loginLink = await page.$('a[href*="login"], .login-btn, [class*="login"] a');
      if (loginLink) {
        await loginLink.click();
        await new Promise(r => setTimeout(r, 2000));
      }
      await page.type('input[name="userId"], input[id="userId"]', userId);
      await page.type('input[type="password"]', userPw);
      logs.push('로그인 정보 입력 완료 (대체 방법)');
    }

    const submitBtn = await loginFrame.$('button[type="submit"], input[type="submit"], .btn-login');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await new Promise(r => setTimeout(r, 3000));
    logs.push('로그인 시도');

    // ===== 2단계: 프로토 승부식 구매 페이지 =====
    await page.goto('https://www.betman.co.kr/main/mainPage/gamebuy/gameSlipIFR.do?gmId=G101&gmTs=01', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 3000));

    const sellingTab = await page.$('#buyPsb1StTab_2');
    if (sellingTab) {
      await sellingTab.click();
      await new Promise(r => setTimeout(r, 2000));
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
        const btn = await page.$(`li[data-matchseq="${matchSeq}"] button.btnChk[data-selkey="${selKey}"]`);
        if (btn) {
          await btn.click();
          await new Promise(r => setTimeout(r, 500));
          const pickName = { win: '승', draw: '무', lose: '패' }[pick];
          logs.push(`경기 ${matchSeq}: ${pickName} 선택 완료`);
        } else {
          logs.push(`경기 ${matchSeq}: 버튼을 찾을 수 없음`);
        }
      } catch (e) {
        logs.push(`경기 ${matchSeq}: 선택 실패 - ${e.message}`);
      }
    }

    // ===== 4단계: 금액 입력 및 구매 =====
    const amountInput = await page.$('input[name="buyAmt"], input[id="buyAmt"], input.buy-amount');
    if (amountInput) {
      await amountInput.click({ clickCount: 3 });
      await amountInput.type(String(amount));
      logs.push(`배팅 금액 ${amount}원 입력`);
    } else {
      logs.push('금액 입력 필드를 찾을 수 없음');
    }

    const buyBtn = await page.$('button.btn.btnM.blue, button:has-text("구매하기"), .btn-buy');
    if (buyBtn) {
      await buyBtn.click();
      await new Promise(r => setTimeout(r, 2000));
      logs.push('구매 버튼 클릭');
    } else {
      logs.push('구매 버튼을 찾을 수 없음');
    }

    await new Promise(r => setTimeout(r, 3000));
    logs.push('배팅 프로세스 완료');

    return { status: 'completed', selections, amount, logs };

  } catch (error) {
    logs.push(`에러 발생: ${error.message}`);
    return { status: 'error', error: error.message, logs };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { placeBet };
