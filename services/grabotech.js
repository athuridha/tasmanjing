const puppeteer = require('puppeteer-core');
const common = require('./common');

// Chrome executable path
const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const GRABOTECH_SYSTEM_CATEGORIES = {
  'bread': 137, 'bakery': 137, 'coffee': 131, 'tea': 131,
  'milk': 131, 'yogurt': 131, 'snacks': 138, 'snack': 138,
  'noodles': 137, 'mineral water': 131, 'drinks': 131, 'beverages': 131,
  'soft drink': 129, 'soda': 129, 'cola': 128, 'coke': 128,
  'carbon': 127, 'other': 85
};

// ─── PERSISTENT BROWSER SESSION MANAGER ─────────────────────────────
// Keeps a single browser instance alive across captcha → login → fetch
const sessions = {}; // { sessionId: { browser, page, createdAt } }

async function launchBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = require('@sparticuz/chromium');
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  return puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1400,900'
    ]
  });
}

// Cleanup stale sessions (older than 10 minutes)
function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of Object.entries(sessions)) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      console.log(`[Grabotech] Cleaning up stale session ${id}`);
      session.browser.close().catch(() => {});
      delete sessions[id];
    }
  }
}

// ─── CAPTCHA: Launch browser, navigate to login, screenshot captcha ─

async function getCaptcha() {
  cleanupSessions();

  const sessionId = `grab_${Date.now()}`;
  console.log(`[Grabotech] Launching Chrome for captcha (session: ${sessionId})...`);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  console.log('[Grabotech] Navigating to login page...');
  await page.goto('https://admin.grabotech.com/index/index/login.html', {
    waitUntil: 'networkidle2',
    timeout: 20000
  });

  await new Promise(r => setTimeout(r, 1000));

  // Find and screenshot the captcha image (class="verify")
  const captchaImg = await page.$('img.verify') || await page.$('img[src*="captcha"]');
  let captchaBase64 = '';

  if (captchaImg) {
    const imgBuffer = await captchaImg.screenshot({ encoding: 'base64' });
    captchaBase64 = `data:image/png;base64,${imgBuffer}`;
    console.log('[Grabotech] Captcha image captured.');
  } else {
    // Fallback: try to find any img near the verification input
    const allImgs = await page.$$('img');
    for (const img of allImgs) {
      const src = await page.evaluate(el => el.src, img);
      if (src && src.includes('captcha')) {
        const imgBuffer = await img.screenshot({ encoding: 'base64' });
        captchaBase64 = `data:image/png;base64,${imgBuffer}`;
        console.log('[Grabotech] Captcha found via fallback.');
        break;
      }
    }
  }

  if (!captchaBase64) {
    // Last resort: screenshot the captcha area by evaluating page
    console.log('[Grabotech] Trying to screenshot captcha by position...');
    const captchaEl = await page.evaluateHandle(() => {
      // Find the image next to the verification input
      const vifInput = document.querySelector('input[name="vifCode"]') || document.querySelector('input[placeholder*="验证"]') || document.querySelector('input[placeholder*="erification"]');
      if (vifInput) {
        const parent = vifInput.parentElement;
        const img = parent ? parent.querySelector('img') : null;
        return img;
      }
      return null;
    });

    if (captchaEl && captchaEl.asElement()) {
      const imgBuffer = await captchaEl.asElement().screenshot({ encoding: 'base64' });
      captchaBase64 = `data:image/png;base64,${imgBuffer}`;
      console.log('[Grabotech] Captcha captured from input sibling.');
    }
  }

  // Store the session (browser + page stay open!)
  sessions[sessionId] = {
    browser,
    page,
    createdAt: Date.now()
  };

  return {
    success: true,
    captchaUrl: captchaBase64,
    phpSessionId: sessionId // We use our sessionId as the token key
  };
}

// ─── 1. LOGIN ───────────────────────────────────────────────────────

async function login(userAccount, userPwd, sessionCookie, vifCode) {
  if (!vifCode) {
    const err = new Error('Verification code is required for Grabotech');
    err.status = 400;
    throw err;
  }

  // sessionCookie here is our sessionId key from getCaptcha()
  const session = sessions[sessionCookie];
  if (!session || !session.page) {
    const err = new Error('Browser session expired. Please reload captcha.');
    err.status = 400;
    throw err;
  }

  const { page } = session;

  try {
    console.log('[Grabotech] Filling login form in Puppeteer...');

    // Clear and fill username (#userName, type="tel")
    await page.evaluate(() => { document.querySelector('#userName').value = ''; });
    await page.type('#userName', userAccount.trim(), { delay: 50 });
    console.log('[Grabotech] Username filled.');

    // Clear and fill password (#password)
    await page.evaluate(() => { document.querySelector('#password').value = ''; });
    await page.type('#password', userPwd.trim(), { delay: 50 });
    console.log('[Grabotech] Password filled.');

    // Clear and fill captcha (#vifCode)
    await page.evaluate(() => { document.querySelector('#vifCode').value = ''; });
    await page.type('#vifCode', vifCode.trim(), { delay: 50 });
    console.log('[Grabotech] Captcha filled.');

    // Click login button (a.loginBtn with onclick="login()")
    console.log('[Grabotech] Clicking login button...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      page.evaluate(() => {
        // Call the login() function directly (defined in the page)
        if (typeof login === 'function') { login(); return; }
        // Fallback: click the anchor element
        const btn = document.querySelector('a.loginBtn') || document.querySelector('.loginBtn');
        if (btn) btn.click();
      })
    ]);

    await new Promise(r => setTimeout(r, 3000));

    const currentUrl = page.url();
    console.log('[Grabotech] Post-login URL:', currentUrl);

    // Check if login succeeded (not on login page anymore)
    if (currentUrl.includes('login')) {
      // Check for error messages on page
      const errorMsg = await page.evaluate(() => {
        const alert = document.querySelector('.layui-layer-content, .error-msg, .alert-danger');
        return alert ? alert.textContent.trim() : '';
      });
      const err = new Error(errorMsg || 'Login failed. Wrong captcha or credentials.');
      err.status = 400;
      throw err;
    }

    console.log('[Grabotech] Login successful! Browser session authenticated.');

    // Return the sessionId as token (browser stays open for fetchGoods)
    return {
      success: true,
      token: sessionCookie, // Our session key
      user: {
        userAccount: userAccount,
        contactMan: userAccount,
        email: '-',
        type: 'grabotech'
      }
    };
  } catch (err) {
    console.error('[Grabotech] Login error:', err.message);
    throw err;
  }
}

// ─── 2. FETCH GOODS ─────────────────────────────────────────────────

async function fetchGoods(token) {
  let session = sessions[token];

  if (!session || !session.page) {
    console.log('[Grabotech] No existing session found. Cannot fetch goods without login.');
    throw new Error('Session expired. Please login again.');
  }

  const { page, browser } = session;

  try {
    // Strategy: Navigate to the page, intercept the Layui table AJAX request,
    // then manually paginate through all pages by re-triggering the table load.

    let allGoods = [];
    let totalCount = 0;

    // Set up request interception to capture the getlist AJAX call
    const goodsUrl = 'https://admin.grabotech.com/goods/Goodsinfo/index?navigationId=24&operatorAppId=NTA=';
    console.log('[Grabotech] Navigating to Product Management:', goodsUrl);

    // Intercept XHR responses
    let capturedData = null;
    const responseHandler = async (response) => {
      const url = response.url();
      if (url.includes('getlist') || url.includes('Getlist') || url.includes('getList')) {
        try {
          const json = await response.json();
          capturedData = json;
        } catch (e) {
          // Not JSON, ignore
        }
      }
    };
    page.on('response', responseHandler);

    await page.goto(goodsUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 4000));

    const currentUrl = page.url();
    console.log('[Grabotech] Current URL:', currentUrl);

    if (currentUrl.includes('login')) {
      page.off('response', responseHandler);
      throw new Error('Session expired. Redirected to login page.');
    }

    // Check if we captured data from the initial page load
    if (capturedData) {
      console.log('[Grabotech] Intercepted AJAX data! Keys:', Object.keys(capturedData));
      const items = capturedData.data || capturedData.rows || capturedData.list || [];
      totalCount = capturedData.count || capturedData.total || capturedData.recordsTotal || items.length;
      console.log(`[Grabotech] Total count from API: ${totalCount}, Page 1 items: ${items.length}`);

      for (const item of items) {
        allGoods.push(parseGrabotechItem(item));
      }
    }

    // If no data was intercepted via AJAX, fall back to DOM scraping
    if (allGoods.length === 0) {
      console.log('[Grabotech] No AJAX data intercepted, falling back to DOM scraping...');
      const domGoods = await scrapeTableDOM(page);
      allGoods = domGoods;
    }

    // Read total pages / items from DOM if available (e.g., "Total 7 Pages 124 Items Data")
    const domTotalInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const match = bodyText.match(/Total\s+(\d+)\s+Pages\s+(\d+)\s+Items/i) || bodyText.match(/(\d+)\s+Pages/i);
      if (match) {
        return {
          totalPages: parseInt(match[1]) || 1,
          totalItems: match[2] ? parseInt(match[2]) : 0
        };
      }
      return null;
    });

    console.log('[Grabotech] DOM Total Info:', domTotalInfo);

    // Loop through pages
    let pageNum = 1;
    const maxPages = (domTotalInfo && domTotalInfo.totalPages > 1) ? domTotalInfo.totalPages : 20;

    console.log(`[Grabotech] Starting pagination (Max pages: ${maxPages})...`);

    while (pageNum < maxPages) {
      // Click next page button
      const clickedNext = await page.evaluate(() => {
        // 1. Try Ace Admin "Next page" title link
        let nextBtn = document.querySelector('a[title="Next page"]') || document.querySelector('a[title="Next Page"]');
        if (nextBtn && !nextBtn.classList.contains('disabled') && !nextBtn.parentElement.classList.contains('disabled')) {
          nextBtn.click();
          return 'title_next';
        }

        // 2. Try icon fa-angle-right inside anchor
        const icon = document.querySelector('i.fa-angle-right, i.ace-icon.fa-angle-right');
        if (icon) {
          const anchor = icon.closest('a');
          if (anchor && !anchor.classList.contains('disabled') && !anchor.parentElement.classList.contains('disabled')) {
            anchor.click();
            return 'icon_angle_right';
          }
        }

        // 3. Try Layui next page button
        const layuiNext = document.querySelector('.layui-laypage-next:not(.layui-disabled)');
        if (layuiNext) {
          layuiNext.click();
          return 'layui_next';
        }

        // 4. Try page number link directly
        const pageLinks = Array.from(document.querySelectorAll('.pagination a, .layui-laypage a'));
        for (const link of pageLinks) {
          if (link.textContent.trim() === String(pageNum + 1)) {
            if (!link.classList.contains('disabled') && !link.parentElement.classList.contains('active')) {
              link.click();
              return 'page_number';
            }
          }
        }

        return null;
      });

      if (!clickedNext) {
        console.log(`[Grabotech] Next page button not found at page ${pageNum}. Reached last page.`);
        break;
      }

      console.log(`[Grabotech] Clicked next page (${clickedNext}) for page ${pageNum + 1}...`);
      pageNum++;

      await new Promise(r => setTimeout(r, 2500));

      // Capture goods from DOM for this page
      const pageGoods = await scrapeTableDOM(page);
      console.log(`[Grabotech] Page ${pageNum}: found ${pageGoods.length} products`);

      if (pageGoods.length === 0) {
        console.log(`[Grabotech] Page ${pageNum} returned 0 products. Stopping.`);
        break;
      }

      // Add to list, avoiding duplicates
      for (const item of pageGoods) {
        if (!allGoods.some(g => g.uuid === item.uuid)) {
          allGoods.push(item);
        }
      }
    }

    page.off('response', responseHandler);
    console.log(`[Grabotech] Total unique goods scraped: ${allGoods.length}`);
    console.log(`[Grabotech] Total goods scraped: ${allGoods.length}`);

    return {
      success: true,
      total: allGoods.length,
      goods: allGoods
    };
  } catch (err) {
    console.error('[Grabotech] Fetch goods error:', err.message);
    throw err;
  }
}

// Parse a single item from Grabotech AJAX JSON response
function parseGrabotechItem(item) {
  const brandName = (item.brand || item.brandName || '').trim();
  return {
    uuid: String(item.id || item.goods_id || item.goodsId || ''),
    goodsName: (item.name || item.goods_name || item.goodsName || '').trim(),
    goodsCode: (item.shapeCode || item.shape_code || item.barcode || item.thirdGoodsCode || '').trim(),
    goodsPrice: parseFloat(item.salePrice || item.sale_price || item.price || 0),
    costPrice: parseFloat(item.costPrice || item.cost_price || item.cost || 0),
    membersPrice: 0,
    customName: brandName || 'General',
    goodsUrl: (item.picURL || item.pic_url || item.imageUrl || item.image || '').trim(),
    brand: brandName,
    specsDesc: (item.unit || item.specification || item.packagingType || '').trim(),
    type: 'grabotech'
  };
}

// Scrape products from the visible DOM table
async function scrapeTableDOM(page) {
  return page.evaluate(() => {
    const goods = [];
    const rows = document.querySelectorAll('table tbody tr');

    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll('td'));
      if (tds.length < 6) continue;

      const texts = tds.map(td => (td.textContent || '').trim());

      const idText = texts[2] || '';
      if (!/^\d+$/.test(idText)) continue;

      const nameEl = tds[3];
      let name = '';
      if (nameEl) {
        const titleEl = nameEl.querySelector('[title]');
        name = titleEl ? titleEl.getAttribute('title') : nameEl.textContent.trim();
      }
      if (!name) continue;

      const imgEl = tr.querySelector('img');
      const imageUrl = imgEl ? (imgEl.getAttribute('data-src') || imgEl.src || '') : '';
      const productId = texts[7] || '';
      const barcode = texts[8] || productId;
      const unit = texts[9] || '';
      const price = parseFloat(texts[10]) || 0;
      const cost = parseFloat(texts[11]) || 0;
      const brand = (texts[14] || '').trim();

      goods.push({
        uuid: idText,
        goodsName: name.trim(),
        goodsCode: barcode.trim(),
        goodsPrice: price,
        costPrice: cost,
        membersPrice: 0,
        customName: brand || 'General',
        goodsUrl: imageUrl,
        brand: brand,
        specsDesc: unit.trim(),
        type: 'grabotech'
      });
    }

    return goods;
  });
}

// ─── 3. UPLOAD IMAGE ────────────────────────────────────────────────

async function uploadGrabotechImage(token, imageUrl) {
  if (!imageUrl) return '';
  const axios = require('axios');
  const FormDataNode = require('form-data');

  const session = sessions[token];
  if (!session || !session.page) return '';

  try {
    console.log(`[Grabotech] Downloading image for upload: ${imageUrl}`);
    const imgResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    let filename = 'image.png';
    const ct = imgResponse.headers['content-type'] || 'image/png';
    if (ct.includes('jpeg') || ct.includes('jpg')) filename = 'image.jpg';
    else if (ct.includes('webp')) filename = 'image.webp';
    else if (ct.includes('gif')) filename = 'image.gif';

    const cookies = await session.page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const form = new FormDataNode();
    form.append('file', Buffer.from(imgResponse.data), {
      filename: filename,
      contentType: ct
    });
    form.append('pic1', Buffer.from(imgResponse.data), {
      filename: filename,
      contentType: ct
    });

    const response = await axios.post('https://admin.grabotech.com/goods/Goodsinfo/uploadImage', form, {
      headers: {
        ...form.getHeaders(),
        'Cookie': cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://admin.grabotech.com/goods/Goodsinfo/index?navigationId=24&operatorAppId=NTA=',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      validateStatus: () => true
    });

    console.log('[Grabotech] Image upload response:', response.data);
    const resData = response.data || {};
    return resData.path || resData.name || resData.url || (resData.data && resData.data.src) || (resData.data && resData.data.url) || '';
  } catch (err) {
    console.error('[Grabotech] Upload image error:', err.message);
  }
  return '';
}

// ─── 4. SYNC ITEM ───────────────────────────────────────────────────

async function syncItem(targetToken, good, mode) {
  let session = sessions[targetToken];
  let ownsBrowser = false;
  let browser, page;

  if (session && session.page) {
    page = session.page;
    browser = session.browser;
  } else {
    console.log('[Grabotech] Launching new Chrome browser for syncItem...');
    browser = await launchBrowser();
    ownsBrowser = true;
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await setSessionCookie(page, targetToken);
  }

  const categoryName = (good.customName || 'General').trim().toLowerCase();
  let targetCategoryId = 85;
  for (const [k, id] of Object.entries(GRABOTECH_SYSTEM_CATEGORIES)) {
    if (categoryName.includes(k)) { targetCategoryId = id; break; }
  }

  try {
    // Navigate to product management if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes('Goodsinfo')) {
      console.log('[Grabotech] Navigating to Product Management page...');
      await page.goto('https://admin.grabotech.com/goods/Goodsinfo/index?navigationId=24&operatorAppId=NTA=', {
        waitUntil: 'networkidle2', timeout: 25000
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Check if product already exists on target Grabotech page (duplicate prevention)
    const alreadyExists = await page.evaluate((targetName, targetCode) => {
      const rows = document.querySelectorAll('table tbody tr');
      for (const tr of rows) {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length >= 4) {
          const nameEl = tds[3];
          const titleEl = nameEl ? nameEl.querySelector('[title]') : null;
          const rowName = titleEl ? titleEl.getAttribute('title') : (tds[3] ? tds[3].textContent.trim() : '');
          const rowBarcode = tds[8] ? tds[8].textContent.trim() : '';

          if (rowName && rowName.trim().toLowerCase() === targetName.trim().toLowerCase()) {
            return { exists: true, matchedBy: 'name', name: rowName };
          }
          if (targetCode && rowBarcode && rowBarcode.trim() === targetCode.trim()) {
            return { exists: true, matchedBy: 'barcode', name: rowName };
          }
        }
      }
      return { exists: false };
    }, good.goodsName, good.goodsCode);

    if (alreadyExists && alreadyExists.exists) {
      console.log(`[Grabotech] Product "${good.goodsName}" already exists in Grabotech (matched by ${alreadyExists.matchedBy}). Skipping duplicate.`);
      return {
        success: true,
        status: 'skipped',
        message: `Product "${good.goodsName}" already exists in Grabotech (duplicate skipped)`
      };
    }

    // Click Add button to open modal
    console.log(`[Grabotech] Opening Add form modal for "${good.goodsName}"...`);
    const openedModal = await page.evaluate(() => {
      if (typeof addNewOwnGoods === 'function') {
        addNewOwnGoods();
        return 'addNewOwnGoods()';
      }
      const addBtn = document.querySelector('a[onclick*="addNewOwnGoods"]') || document.querySelector('a.btn-info');
      if (addBtn) {
        addBtn.click();
        return 'click_addBtn';
      }
      return false;
    });

    console.log('[Grabotech] Add modal triggered via:', openedModal);
    await new Promise(r => setTimeout(r, 2500));

    // Upload image directly inside Chromium browser context & fill form
    console.log(`[Grabotech] Filling form inputs & uploading image for "${good.goodsName}"...`);
    const fillResult = await page.evaluate(async (item, imgUrl, catId) => {
      function setVal(selectors, val) {
        if (val === undefined || val === null) return;
        const selList = Array.isArray(selectors) ? selectors : [selectors];
        for (const s of selList) {
          const el = document.querySelector(s);
          if (el) {
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }

      // Fill basic inputs
      const filledName = setVal(['#name', 'input[name="name"]'], item.goodsName || '');
      setVal(['#enName', 'input[name="enName"]'], item.goodsName || '');
      setVal(['#unit', 'input[name="unit"]'], 'Kemasan');
      setVal(['#salePrice', 'input[name="salePrice"]'], item.goodsPrice || 0);
      setVal(['#costPrice', 'input[name="costPrice"]'], item.costPrice || 0);
      setVal(['#shapeCode', 'input[name="shapeCode"]', 'input[name="goodsCode"]'], item.goodsCode || '');
      setVal(['#thirdGoodsCode', 'input[name="thirdGoodsCode"]'], item.goodsCode || '');
      setVal(['#specification', 'input[name="specification"]'], item.specsDesc || '');
      setVal(['#qualityDay', 'input[name="qualityDay"]'], '365');

      // Set category select dropdown
      const catSelect = document.querySelector('select[name="goodsTypeId"], #goodsTypeId, select[name="addgoodsTypeId"]');
      if (catSelect) {
        catSelect.value = String(catId);
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Upload image inside Chromium context
      let uploadedPicUrl = '';
      if (imgUrl) {
        try {
          console.log('Fetching image in browser:', imgUrl);
          const imgRes = await fetch(imgUrl);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const file = new File([blob], 'product_image.jpg', { type: blob.type || 'image/jpeg' });
            
            const form = new FormData();
            form.append('file', file);
            form.append('pic1', file);

            const uploadRes = await fetch('/goods/Goodsinfo/uploadImage', {
              method: 'POST',
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              body: form
            });

            if (uploadRes.ok) {
              const uploadJson = await uploadRes.json();
              console.log('In-browser upload JSON:', uploadJson);
              uploadedPicUrl = uploadJson.path || uploadJson.name || uploadJson.url || (uploadJson.data && uploadJson.data.src) || (uploadJson.data && uploadJson.data.url) || '';
              if (uploadedPicUrl) {
                setVal(['#picURL', 'input[name="picURL"]', 'input[name="pic"]'], uploadedPicUrl);
                // Also try setting image preview src if available
                const previewImgs = document.querySelectorAll('img[src*="Format"], .preview-img, #picURLPreview');
                for (const img of previewImgs) {
                  img.src = uploadedPicUrl;
                }
              }
            }
          }
        } catch (e) {
          console.error('In-browser image upload failed:', e);
        }
      }

      return { filledName, uploadedPicUrl };
    }, good, good.goodsUrl, targetCategoryId);

    console.log('[Grabotech] Form filled & image uploaded result:', fillResult);

    // Submit form by calling save() or clicking modal Save button
    console.log('[Grabotech] Submitting form (calling save())...');
    const submitResult = await page.evaluate(() => {
      // 1. Try calling save() directly
      if (typeof save === 'function') {
        save();
        return 'save_func';
      }
      // 2. Try clicking modal primary / save button
      const btns = Array.from(document.querySelectorAll('.modal-footer button, .modal-footer a, button, a.btn'));
      for (const btn of btns) {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt === 'save' || txt === 'submit' || txt === 'confirm' || (btn.getAttribute('onclick') || '').includes('save')) {
          btn.click();
          return 'btn_click_' + txt;
        }
      }
      return 'none';
    });

    console.log('[Grabotech] Submit result:', submitResult);
    await new Promise(r => setTimeout(r, 3000));

    // Check for success notification dialog and click "Confirm"
    await page.evaluate(() => {
      const confirmBtns = Array.from(document.querySelectorAll('.modal button, .bootbox button, .layui-layer-btn a, button'));
      for (const btn of confirmBtns) {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt === 'confirm' || txt === 'ok' || txt === '确定') {
          btn.click();
          break;
        }
      }
    });

    await new Promise(r => setTimeout(r, 1500));

    console.log(`[Grabotech] Product "${good.goodsName}" synced successfully.`);
    return {
      success: true,
      status: 'synced',
      message: `Created "${good.goodsName}" in Grabotech`
    };
  } catch (err) {
    console.error(`[Grabotech] Sync error for "${good.goodsName}":`, err.message);
    throw new Error(`Failed to sync "${good.goodsName}": ${err.message}`);
  } finally {
    if (ownsBrowser && browser) {
      await browser.close().catch(() => {});
    }
  }
}

// ─── CLEANUP ────────────────────────────────────────────────────────

function closeSession(token) {
  const session = sessions[token];
  if (session) {
    session.browser.close().catch(() => {});
    delete sessions[token];
  }
}

module.exports = {
  getCaptcha,
  login,
  fetchGoods,
  syncItem,
  uploadGrabotechImage,
  closeSession
};
