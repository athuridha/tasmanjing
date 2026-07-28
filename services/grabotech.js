const puppeteer = require('puppeteer-core');
const axios = require('axios');
const common = require('./common');

// Chrome executable path
const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

// Helper to fetch image on server side as base64 to avoid CORS / Mixed Content issues in browser
async function fetchImageAsBase64(imageUrl) {
  if (!imageUrl) return '';
  try {
    if (imageUrl.startsWith('data:image/')) return imageUrl;

    console.log('[Grabotech] Downloading product image on server:', imageUrl);
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error('[Grabotech] Failed to download image on server:', imageUrl, err.message);
    return '';
  }
}

const GRABOTECH_SYSTEM_CATEGORIES = {
  'bread': 137, 'bakery': 137, 'coffee': 131, 'tea': 131,
  'milk': 131, 'yogurt': 131, 'snacks': 138, 'snack': 138,
  'noodles': 137, 'mineral water': 131, 'drinks': 131, 'beverages': 131,
  'soft drink': 129, 'soda': 129, 'cola': 128, 'coke': 128,
  'carbon': 127, 'other': 85
};

// Helper to set cookie string on Puppeteer page
async function setSessionCookie(page, token) {
  if (!token) return;
  const cookiePairs = token.split(';').map(p => p.trim()).filter(Boolean);
  const cookies = [];
  for (const pair of cookiePairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      cookies.push({
        name,
        value,
        domain: 'admin.grabotech.com',
        path: '/'
      });
    }
  }
  if (cookies.length > 0) {
    await page.setCookie(...cookies);
  }
}

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
    headless: false, // Visible Chrome browser window for live debugging
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
    await new Promise(r => setTimeout(r, 3000));

    // Change page size from 20 to 100 for faster scraping
    const hasPageSizeSelect = await page.$('#selectPageSize');
    if (hasPageSizeSelect) {
      console.log('[Grabotech] Found #selectPageSize, changing to 100...');
      
      // Get current row count before change
      const rowsBefore = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      console.log(`[Grabotech] Rows before page size change: ${rowsBefore}`);

      // Method 1: Use Puppeteer's native select (sets value + dispatches change event)
      await page.select('#selectPageSize', '100');
      
      // Method 2: Also manually set value + dispatch multiple event types
      await page.evaluate(() => {
        const select = document.querySelector('#selectPageSize');
        if (!select) return;
        
        // Force set value via DOM property
        select.value = '100';
        
        // Dispatch all event types that might trigger a reload
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Trigger jQuery events
        if (typeof jQuery !== 'undefined') {
          try { jQuery(select).val('100').trigger('change'); } catch(e) {}
        } else if (typeof $ !== 'undefined' && $.fn) {
          try { $(select).val('100').trigger('change'); } catch(e) {}
        }
        
        // Call the onchange handler directly if exists
        if (select.onchange) {
          try { select.onchange(); } catch(e) {}
        }
        
        // Try calling known reload/search functions (Grabotech admin page patterns)
        const funcNames = ['reloadTable', 'loadData', 'search', 'init', 'loadGrid', 'doSearch', 'refreshData', 'getList'];
        for (const fn of funcNames) {
          if (typeof window[fn] === 'function') {
            try { console.log('[Grabotech] Calling ' + fn + '()...'); window[fn](); } catch(e) {}
          }
        }
      });
      
      capturedData = null; // Reset captured data to get fresh 100-item response
      console.log('[Grabotech] Page size set to 100. Waiting for table reload...');
      await new Promise(r => setTimeout(r, 5000));
      
      // Check if page size actually changed
      const rowsAfter = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      const currentSelectVal = await page.evaluate(() => document.querySelector('#selectPageSize')?.value);
      console.log(`[Grabotech] After page size change: ${rowsAfter} rows visible (select value: ${currentSelectVal})`);
      
      // If rows didn't increase, try clicking the pagination "search" or reloading the whole page
      if (rowsAfter <= rowsBefore && rowsBefore <= 20) {
        console.log('[Grabotech] Rows did not increase! Trying page reload with 100 items...');
        
        // Try clicking any visible search/refresh button on the page
        const clickedRefresh = await page.evaluate(() => {
          const btns = document.querySelectorAll('a.btn, button.btn, a[onclick*="search"], button[onclick*="search"], .btn-refresh, a[title="search"], a[title="Search"]');
          for (const btn of btns) {
            const txt = (btn.textContent || '').trim().toLowerCase();
            const onclick = btn.getAttribute('onclick') || '';
            if (txt.includes('search') || txt.includes('查询') || onclick.includes('search') || onclick.includes('load')) {
              btn.click();
              return 'clicked: ' + (txt || onclick).substring(0, 30);
            }
          }
          return null;
        });
        
        if (clickedRefresh) {
          console.log(`[Grabotech] Clicked search/refresh: ${clickedRefresh}`);
          await new Promise(r => setTimeout(r, 4000));
        } else {
          // Last resort: reload the page entirely (select value should persist in session or we re-set it)
          console.log('[Grabotech] No search button found. Reloading page...');
          await page.reload({ waitUntil: 'networkidle2', timeout: 25000 });
          await new Promise(r => setTimeout(r, 2000));
          // Re-set the page size after reload
          await page.select('#selectPageSize', '100').catch(() => {});
          await page.evaluate(() => {
            const select = document.querySelector('#selectPageSize');
            if (select) {
              select.value = '100';
              select.dispatchEvent(new Event('change', { bubbles: true }));
              if (select.onchange) select.onchange();
            }
          });
          await new Promise(r => setTimeout(r, 4000));
        }
        
        const rowsFinal = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
        console.log(`[Grabotech] Final row count after retry: ${rowsFinal}`);
      }
    } else {
      console.log('[Grabotech] #selectPageSize not found, using default page size');
      await new Promise(r => setTimeout(r, 1000));
    }

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

// Helper: save debug screenshot
async function debugScreenshot(page, label) {
  try {
    const fs = require('fs');
    const path = require('path');
    const debugDir = path.join(__dirname, '..', 'downloads', 'debug');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
    const filename = `${Date.now()}_${label.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const filepath = path.join(debugDir, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`[Grabotech DEBUG] Screenshot saved: ${filepath}`);
  } catch (e) {
    console.error('[Grabotech DEBUG] Screenshot failed:', e.message);
  }
}

// Helper: aggressively kill all modals + backdrops
async function forceCloseAllModals(page) {
  await page.evaluate(() => {
    // Click all close/dismiss buttons
    document.querySelectorAll('.bootbox-close-button, [data-dismiss="modal"], .modal .close').forEach(b => {
      try { b.click(); } catch(e) {}
    });
    // Remove all backdrops
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    // Force-hide all modals
    document.querySelectorAll('.modal').forEach(m => {
      m.classList.remove('in', 'show');
      m.style.display = 'none';
    });
    // Remove modal-open from body (restores scrolling)
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });
  await new Promise(r => setTimeout(r, 500));
}

async function syncItem(targetToken, good, mode, targetCategory) {
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
    // ── STEP 1: Navigate to product management if needed ──
    const currentUrl = page.url();
    if (!currentUrl.includes('Goodsinfo') || currentUrl.includes('login')) {
      console.log('[Grabotech] Navigating to Product Management page...');
      await page.goto('https://admin.grabotech.com/goods/Goodsinfo/index?navigationId=24&operatorAppId=NTA=', {
        waitUntil: 'networkidle2', timeout: 25000
      });
      await new Promise(r => setTimeout(r, 2000));

      // Check if we got redirected to login
      if (page.url().includes('login')) {
        throw new Error('Session expired — redirected to login page. Please login again.');
      }
    }

    // ── STEP 2: Force-close ALL lingering modals/backdrops ──
    console.log('[Grabotech] Cleaning up any lingering modals...');
    await forceCloseAllModals(page);

    // ── STEP 3: Click category tree node ──
    const catToSelect = targetCategory || good.customName || 'Default Categories';
    console.log(`[Grabotech] Selecting category in tree: "${catToSelect}"`);
    
    const categoryTreeData = await page.evaluate((catName) => {
      const nodes = document.querySelectorAll('#tree .list-group-item.node-tree');
      const allNodeTexts = Array.from(nodes).map(n => n.textContent.trim());
      console.log('[Grabotech] Available tree nodes:', allNodeTexts);

      // Exact match first
      for (const node of nodes) {
        const nodeText = node.textContent.trim();
        if (nodeText === catName) {
          node.click();
          const treeId = document.querySelector('#treeId')?.value || node.getAttribute('data-nodeid') || '';
          return { clicked: true, text: nodeText, treeId, allNodes: allNodeTexts };
        }
      }
      // Partial match fallback
      for (const node of nodes) {
        const nodeText = node.textContent.trim();
        if (nodeText.toLowerCase().includes(catName.toLowerCase())) {
          node.click();
          const treeId = document.querySelector('#treeId')?.value || node.getAttribute('data-nodeid') || '';
          return { clicked: true, text: nodeText, partial: true, treeId, allNodes: allNodeTexts };
        }
      }
      // Click first available node as fallback
      if (nodes.length > 0) {
        nodes[0].click();
        const treeId = document.querySelector('#treeId')?.value || nodes[0].getAttribute('data-nodeid') || '';
        return { clicked: true, text: nodes[0].textContent.trim(), fallback: true, treeId, allNodes: allNodeTexts };
      }
      return { clicked: false, treeId: '', allNodes: allNodeTexts };
    }, catToSelect);

    console.log(`[Grabotech] Category result:`, JSON.stringify(categoryTreeData));
    if (categoryTreeData.clicked && categoryTreeData.treeId) {
      targetCategoryId = categoryTreeData.treeId;
    }
    await new Promise(r => setTimeout(r, 1500));

    // ── STEP 4: Open Add Product modal ──
    console.log(`[Grabotech] Opening Add form modal for "${good.goodsName}"...`);
    await debugScreenshot(page, 'before_add_modal');

    const openedModal = await page.evaluate(() => {
      // Check available functions and buttons
      const hasFunc = typeof addNewOwnGoods === 'function';
      const addBtn = document.querySelector('a[onclick*="addNewOwnGoods"]') || document.querySelector('a.btn-info');
      const addBtnText = addBtn ? addBtn.textContent.trim() : 'none';

      if (hasFunc) {
        addNewOwnGoods();
        return { method: 'addNewOwnGoods()', hasFunc, addBtnText };
      }
      if (addBtn) {
        addBtn.click();
        return { method: 'click_addBtn', hasFunc, addBtnText };
      }
      return { method: 'FAILED', hasFunc, addBtnText };
    });

    console.log('[Grabotech] Add modal trigger result:', JSON.stringify(openedModal));

    if (openedModal.method === 'FAILED') {
      await debugScreenshot(page, 'add_modal_FAILED');
      throw new Error('Could not find Add Product button or addNewOwnGoods() function on the page');
    }

    // Wait for modal to actually appear in DOM
    try {
      await page.waitForSelector('.modal.in, .modal.show', { visible: true, timeout: 8000 });
      console.log('[Grabotech] Modal is now visible');
    } catch (e) {
      console.warn('[Grabotech] WARNING: Modal selector not found after 8s, continuing anyway...');
      await debugScreenshot(page, 'modal_not_visible');
    }
    await new Promise(r => setTimeout(r, 1000));

    // ── STEP 5: Fetch images as Base64 (server-side, bypasses CORS) ──
    let base64Image = '';
    let base64DetailImage = '';

    if (good.goodsUrl) {
      console.log(`[Grabotech] Fetching main image for "${good.goodsName}" on server...`);
      base64Image = await fetchImageAsBase64(good.goodsUrl);
      console.log(`[Grabotech] Main image fetch result: ${base64Image ? `OK (${Math.round(base64Image.length / 1024)}KB)` : 'EMPTY'}`);
    }

    const detailUrlToFetch = good.introduceUrl || good.goodsUrl;
    if (detailUrlToFetch) {
      if (detailUrlToFetch === good.goodsUrl) {
        base64DetailImage = base64Image;
      } else {
        console.log(`[Grabotech] Fetching detail image for "${good.goodsName}" on server...`);
        base64DetailImage = await fetchImageAsBase64(detailUrlToFetch);
        console.log(`[Grabotech] Detail image fetch result: ${base64DetailImage ? `OK (${Math.round(base64DetailImage.length / 1024)}KB)` : 'EMPTY'}`);
      }
    }

    // ── STEP 6: Fill form inputs & upload images ──
    console.log(`[Grabotech] Filling form for "${good.goodsName}" (CategoryId: ${targetCategoryId})...`);
    const fillResult = await page.evaluate(async (item, b64Data, b64DetailData, catId) => {
      const results = {};

      function setVal(selectors, val, fieldName) {
        if (val === undefined || val === null || val === '') { results[fieldName] = 'skip_null'; return false; }
        const selList = Array.isArray(selectors) ? selectors : [selectors];
        for (const s of selList) {
          const el = document.querySelector(s);
          if (el) {
            el.value = String(val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            results[fieldName] = `OK(${s})=${String(val).substring(0, 30)}`;
            return true;
          }
        }
        results[fieldName] = `NOT_FOUND(${selList.join(',')})`;
        return false;
      }

      // Helper to upload a single base64 image to Grabotech upload endpoint
      async function uploadB64Image(b64, defaultFilename = 'product_image.jpg') {
        if (!b64) return '';
        const parts = b64.split(';base64,');
        const mimeType = parts[0].replace('data:', '') || 'image/jpeg';
        const b64Raw = parts[1];
        
        const byteCharacters = atob(b64Raw);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const file = new File([blob], defaultFilename, { type: mimeType });
        
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
          return uploadJson.path || uploadJson.name || uploadJson.url || (uploadJson.data && uploadJson.data.src) || (uploadJson.data && uploadJson.data.url) || '';
        }
        return '';
      }

      // Fill basic inputs
      setVal(['#name', 'input[name="name"]'], item.goodsName || '', 'name');
      setVal(['#enName', 'input[name="enName"]'], item.goodsName || '', 'enName');
      setVal(['#unit', 'input[name="unit"]'], 'Kemasan', 'unit');
      setVal(['#salePrice', 'input[name="salePrice"]'], item.goodsPrice || 0, 'salePrice');
      setVal(['#costPrice', 'input[name="costPrice"]'], item.costPrice || 0, 'costPrice');
      // NOTE: shapeCode/thirdGoodsCode (barcode) intentionally skipped — causes errors on Grabotech
      setVal(['#specification', 'input[name="specification"]'], item.specsDesc || '', 'specification');
      setVal(['#qualityDay', 'input[name="qualityDay"]'], '365', 'qualityDay');

      // Set category
      setVal(['#goodsTypeId', 'select[name="goodsTypeId"]', '#addgoodsTypeId', 'input[name="goodsTypeId"]'], catId, 'goodsTypeId');

      // Also try to find ALL visible input fields in the modal for debugging
      const modalInputs = document.querySelectorAll('.modal.in input, .modal.in select, .modal.in textarea, .modal.show input, .modal.show select, .modal.show textarea');
      results._allModalFields = Array.from(modalInputs).map(el => ({
        tag: el.tagName,
        id: el.id || '',
        name: el.name || '',
        type: el.type || '',
        value: (el.value || '').substring(0, 50),
        visible: el.offsetParent !== null
      }));

      // Upload Main Image
      results.uploadedPicUrl = '';
      if (b64Data) {
        try {
          const mainPicUrl = await uploadB64Image(b64Data, 'main_image.jpg');
          results.uploadedPicUrl = mainPicUrl;
          if (mainPicUrl) {
            setVal(['#picURL', 'input[name="picURL"]', 'input[name="pic"]', 'input[name="mainPic"]', 'input[name="goodsPic"]'], mainPicUrl, 'picURL');
            document.querySelectorAll('img[src*="Format"], .preview-img, #picURLPreview').forEach(img => { img.src = mainPicUrl; });
          }
        } catch (e) {
          results.uploadError = e.message || String(e);
        }
      }

      // Upload & Set Product Detail Image
      results.uploadedDetailPicUrl = '';
      if (b64DetailData) {
        try {
          let detailPicUrl = '';
          if (b64DetailData === b64Data && results.uploadedPicUrl) {
            detailPicUrl = results.uploadedPicUrl;
          } else {
            detailPicUrl = await uploadB64Image(b64DetailData, 'detail_image.jpg');
          }
          results.uploadedDetailPicUrl = detailPicUrl;

          if (detailPicUrl) {
            // Set all possible detail image input selectors
            setVal([
              '#detailPicURL', '#picURLDetail', '#introduceUrl', '#detailPic', '#goodsDetailPic', '#detailUrl',
              '#pic2', '#detailPicUrl', '#picDetail',
              'input[name="detailPicURL"]', 'input[name="picURLDetail"]', 'input[name="introduceUrl"]', 
              'input[name="detailPic"]', 'input[name="goodsDetailPic"]', 'input[name="detailUrl"]',
              'input[name="detail_pic"]', 'input[name="detailPicUrl"]', 'input[name="picDetail"]', 
              'input[name="pic2"]', 'input[name="introduce_url"]'
            ], detailPicUrl, 'detailPicURL');

            // Safely update detail image input & preview img without touching non-image form fields
            const detailLabels = document.querySelectorAll('.modal.in label, .modal.show label, .modal.in p, .modal.show p, .modal.in span, .modal.show span');
            const DANGEROUS_FIELDS = ['name', 'enname', 'unit', 'saleprice', 'costprice', 'shapecode', 'thirdgoodscode', 'specification', 'qualityday', 'goodstypeid'];
            
            for (const el of detailLabels) {
              const txt = (el.textContent || '').toLowerCase();
              if ((txt.includes('product detail') || txt.includes('detail image') || txt.includes('500*500')) && el.children.length === 0) {
                const formGroup = el.closest('.form-group') || el.closest('tr') || el.closest('td') || el.parentElement;
                if (formGroup) {
                  const inputs = formGroup.querySelectorAll('input');
                  inputs.forEach(inp => {
                    const inpName = (inp.name || inp.id || '').toLowerCase();
                    if (!DANGEROUS_FIELDS.includes(inpName)) {
                      inp.value = detailPicUrl;
                      inp.dispatchEvent(new Event('input', { bubbles: true }));
                      inp.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  });
                  const imgs = formGroup.querySelectorAll('img');
                  imgs.forEach(img => { img.src = detailPicUrl; });
                }
              }
            }
          }
        } catch (e) {
          results.uploadDetailError = e.message || String(e);
        }
      }

      return results;
    }, good, base64Image, base64DetailImage, targetCategoryId);

    console.log('[Grabotech] Form fill results:', JSON.stringify(fillResult, null, 2));
    await debugScreenshot(page, 'after_form_fill');

    // ── STEP 7: Submit the form ──
    let lastApiResponse = '';
    let saveApiStatus = null;
    const saveResponseHandler = async (res) => {
      const u = res.url();
      if (u.includes('Goodsinfo/add') || u.includes('Goodsinfo/save') || u.includes('Goodsinfo/insert') || u.includes('saveOwnGoods') || u.includes('addOwnGoods')) {
        try {
          const txt = await res.text();
          if (txt && txt.length < 5000) {
            lastApiResponse = txt;
            try { saveApiStatus = JSON.parse(txt); } catch(e) {}
            console.log(`[Grabotech] Save API Response (${res.status()}):`, txt);
          }
        } catch (e) {}
      }
    };
    page.on('response', saveResponseHandler);

    console.log('[Grabotech] Clicking save button...');
    const submitResult = await page.evaluate(() => {
      // Dump all buttons for debugging
      const allBtns = Array.from(document.querySelectorAll('.modal.in button, .modal.in a.btn, .modal.in .modal-footer *, .modal.show button, .modal.show a.btn'));
      const btnInfo = allBtns.map(b => ({
        tag: b.tagName,
        text: b.textContent.trim().substring(0, 30),
        classes: b.className,
        onclick: (b.getAttribute('onclick') || '').substring(0, 50),
        visible: b.offsetParent !== null
      }));

      // 1. Try clicking modal primary / save button in visible modal
      const modalSaveBtn = document.querySelector('.modal.in .modal-footer .btn-primary, .modal.show .modal-footer .btn-primary');
      if (modalSaveBtn) {
        modalSaveBtn.click();
        return { method: 'click_modalSaveBtn', text: modalSaveBtn.textContent.trim(), btnInfo };
      }

      // 2. Try a[onclick*="save"] or button[onclick*="save"]
      const saveFuncBtn = document.querySelector('.modal.in a[onclick*="save"], .modal.show a[onclick*="save"], .modal.in button[onclick*="save"], .modal.show button[onclick*="save"]');
      if (saveFuncBtn) {
        saveFuncBtn.click();
        return { method: 'click_saveFuncBtn', text: saveFuncBtn.textContent.trim(), onclick: saveFuncBtn.getAttribute('onclick'), btnInfo };
      }

      // 3. Try calling save() directly
      if (typeof save === 'function') {
        save();
        return { method: 'save_func', btnInfo };
      }

      // 4. Try clicking any button with save/submit text in modal-footer
      for (const btn of allBtns) {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt === 'save' || txt === 'submit' || txt === 'confirm' || txt.includes('save') || txt.includes('保存')) {
          btn.click();
          return { method: 'btn_text_match', text: txt, btnInfo };
        }
      }

      return { method: 'NONE_FOUND', btnInfo };
    });

    console.log('[Grabotech] Submit result:', JSON.stringify(submitResult, null, 2));

    if (submitResult.method === 'NONE_FOUND') {
      await debugScreenshot(page, 'save_button_NOT_FOUND');
      console.error('[Grabotech] ERROR: No save button found! Available buttons:', JSON.stringify(submitResult.btnInfo));
    }

    // Wait for save API response
    await new Promise(r => setTimeout(r, 4000));
    page.off('response', saveResponseHandler);

    await debugScreenshot(page, 'after_save');

    // ── STEP 8: Check for success/error dialogs ──
    const postSaveState = await page.evaluate(() => {
      // Check for any visible alert/dialog text
      const alertSelectors = [
        '.bootbox-body',
        '.layui-layer-content',
        '.alert-danger',
        '.alert-success',
        '.alert-warning',
        '.has-error .help-block',
        '.error-message',
        '.text-danger'
      ];
      
      let alertText = '';
      for (const sel of alertSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          alertText += `[${sel}]: ${el.textContent.trim().substring(0, 200)} | `;
        }
      }

      // Check for validation errors (red borders, .has-error)
      const validationErrors = [];
      document.querySelectorAll('.has-error, .is-invalid, .form-group.error').forEach(el => {
        const label = el.querySelector('label');
        const helpBlock = el.querySelector('.help-block, .invalid-feedback, .error');
        validationErrors.push({
          label: label ? label.textContent.trim() : '',
          error: helpBlock ? helpBlock.textContent.trim() : 'validation error'
        });
      });

      // Count visible modals
      const visibleModals = document.querySelectorAll('.modal.in, .modal.show, .bootbox');
      const backdropCount = document.querySelectorAll('.modal-backdrop').length;

      return {
        alertText: alertText || 'none',
        validationErrors,
        visibleModalCount: visibleModals.length,
        backdropCount,
        currentUrl: window.location.href
      };
    });

    console.log('[Grabotech] Post-save state:', JSON.stringify(postSaveState, null, 2));

    // Log save API result
    if (saveApiStatus) {
      console.log('[Grabotech] Save API JSON:', JSON.stringify(saveApiStatus));
      if (saveApiStatus.code && saveApiStatus.code !== 200 && saveApiStatus.code !== 0) {
        console.error(`[Grabotech] SAVE FAILED (API code: ${saveApiStatus.code}):`, saveApiStatus.msg || saveApiStatus.message || lastApiResponse);
      }
    }

    // ── STEP 9: Click confirm/OK on any success/error dialog, then force-close everything ──
    await page.evaluate(() => {
      // Click confirm/OK/close on bootbox or layui dialogs
      const confirmBtns = document.querySelectorAll('.bootbox .btn-primary, .bootbox .btn-default, .layui-layer-btn a, .bootbox-accept');
      for (const btn of confirmBtns) {
        try { btn.click(); } catch(e) {}
      }
    });
    await new Promise(r => setTimeout(r, 1000));

    // Force-close ALL modals to clean up for next product
    await forceCloseAllModals(page);
    console.log('[Grabotech] All modals force-closed, ready for next product.');

    // ── STEP 10: Return result ──
    const hasError = postSaveState.validationErrors.length > 0;
    const errorDetail = hasError ? postSaveState.validationErrors.map(e => `${e.label}: ${e.error}`).join('; ') : '';

    if (hasError) {
      console.error(`[Grabotech] Product "${good.goodsName}" had validation errors: ${errorDetail}`);
      return {
        success: false,
        status: 'error',
        message: `Validation errors: ${errorDetail}`
      };
    }

    console.log(`[Grabotech] Product "${good.goodsName}" synced successfully.`);
    return {
      success: true,
      status: 'synced',
      message: `Created "${good.goodsName}" in Grabotech`,
      apiResponse: saveApiStatus || lastApiResponse || 'no API response captured'
    };
  } catch (err) {
    console.error(`[Grabotech] Sync error for "${good.goodsName}":`, err.message);
    await debugScreenshot(page, 'sync_ERROR').catch(() => {});
    // Force-close modals even on error to prevent stale state
    await forceCloseAllModals(page).catch(() => {});
    throw new Error(`Failed to sync "${good.goodsName}": ${err.message}`);
  } finally {
    if (ownsBrowser && browser) {
      await browser.close().catch(() => {});
    }
  }
}

// ─── 5. FETCH & CREATE CATEGORIES ────────────────────────────────────

async function fetchCategories(token) {
  let session = sessions[token];
  let ownsBrowser = false;
  let browser, page;

  if (session && session.page) {
    page = session.page;
    browser = session.browser;
  } else {
    console.log('[Grabotech] Launching Chrome browser for fetchCategories...');
    browser = await launchBrowser();
    ownsBrowser = true;
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await setSessionCookie(page, token);
  }

  try {
    const categoryUrl = 'https://admin.grabotech.com/Goods/GoodsType/index?navigationId=25&operatorAppId=NTA=';
    console.log('[Grabotech] Navigating to Category Management page:', categoryUrl);

    let capturedCategories = [];
    const responseHandler = async (response) => {
      const url = response.url();
      if (url.includes('getlist') || url.includes('Getlist') || url.includes('getTypeList') || url.includes('getTree')) {
        try {
          const json = await response.json();
          const list = json.data || json.rows || json.list || [];
          if (Array.isArray(list) && list.length > 0) {
            capturedCategories = list;
          }
        } catch (e) {}
      }
    };

    page.on('response', responseHandler);
    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 3000));
    page.off('response', responseHandler);

    // Scrape DOM table or tree
    const domCategories = await page.evaluate(() => {
      const categories = [];
      // 1. Table rows
      const rows = document.querySelectorAll('table tbody tr');
      for (const tr of rows) {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length >= 2) {
          const name = (tds[1] ? tds[1].textContent : (tds[0] ? tds[0].textContent : '')).trim();
          const bizType = tds[2] ? tds[2].textContent.trim() : 'Finished Product';
          if (name && name !== 'No.' && !name.includes('Category') && !name.includes('Default')) {
            categories.push({ id: name, name: name, businessType: bizType });
          }
        }
      }

      // 2. Tree nodes (#tree .list-group-item.node-tree - Grabotech treeview)
      const treeNodes = document.querySelectorAll('#tree .list-group-item.node-tree');
      for (const node of treeNodes) {
        const text = node.textContent.trim();
        const nodeId = node.getAttribute('data-nodeid');
        if (text && text.length > 0 && text.length <= 30 && text !== 'Default Categories') {
          if (!categories.some(c => c.name === text)) {
            categories.push({ id: nodeId || text, name: text, businessType: 'Finished Product' });
          }
        }
      }

      // 3. Fallback: generic tree links
      if (categories.length === 0) {
        const treeLinks = document.querySelectorAll('.ztree a, ul.tree a, .layui-tree a, a[title]');
        for (const a of treeLinks) {
          const title = (a.getAttribute('title') || a.textContent || '').trim();
          if (title && title.length > 1 && title.length <= 30 && !['Home', 'Default Categories', 'Device Product Management', 'Product Management', 'Product Category'].includes(title)) {
            if (!categories.some(c => c.name === title)) {
              categories.push({ id: title, name: title, businessType: 'Finished Product' });
            }
          }
        }
      }

      return categories;
    });

    const parsedCategories = capturedCategories.length > 0
      ? capturedCategories.map(c => ({
          id: String(c.id || c.typeId || c.goodsTypeId || c.name || ''),
          name: (c.name || c.typeName || c.goodsTypeName || '').trim(),
          businessType: (c.businessType || c.bizType || 'Finished Product').trim()
        }))
      : domCategories;

    const fallbackList = [
      { id: 'Default Categories', name: 'Default Categories', businessType: 'Finished Product' }
    ];

    const finalCategories = parsedCategories.length > 0 ? parsedCategories : fallbackList;

    console.log(`[Grabotech] Total categories retrieved: ${finalCategories.length}`);
    return {
      success: true,
      categories: finalCategories
    };
  } catch (err) {
    console.error('[Grabotech] Fetch categories error:', err.message);
    throw err;
  } finally {
    if (ownsBrowser && browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function createCategory(token, categoryName, businessType = 'Finished Product') {
  let session = sessions[token];
  if (!session || !session.page) {
    throw new Error('Browser session expired. Please login again.');
  }

  const { page } = session;

  const cleanName = (categoryName || '').trim().substring(0, 30);
  const cleanBizType = (businessType || 'Finished Product').trim();

  if (!cleanName) {
    throw new Error('Category name is required (No more than 30 characters).');
  }

  try {
    const categoryUrl = 'https://admin.grabotech.com/Goods/GoodsType/index?navigationId=25&operatorAppId=NTA=';
    console.log(`[Grabotech] Navigating to Category Management to add "${cleanName}"...`);
    await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log(`[Grabotech] Clicking Add Category button...`);
    await page.evaluate(() => {
      const addBtn = document.querySelector('a[onclick*="add"], a.btn-info, button.btn-info, .btn-add');
      if (addBtn) addBtn.click();
    });

    await new Promise(r => setTimeout(r, 2000));

    console.log(`[Grabotech] Filling Category form ("${cleanName}", "${cleanBizType}")...`);
    await page.evaluate((name, bizType) => {
      function setVal(sel, val) {
        const el = document.querySelector(sel);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      setVal('#name, input[name="name"], input[name="typeName"]', name);

      const bizSel = document.querySelector('#businessType, select[name="businessType"]');
      if (bizSel) {
        bizSel.value = bizType;
        bizSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, cleanName, cleanBizType);

    await page.evaluate(() => {
      if (typeof save === 'function') { save(); return; }
      const saveBtn = document.querySelector('.modal-footer button, button[type="submit"], .btn-primary');
      if (saveBtn) saveBtn.click();
    });

    await new Promise(r => setTimeout(r, 2500));

    return {
      success: true,
      category: {
        id: cleanName,
        name: cleanName,
        businessType: cleanBizType
      },
      message: `Category "${cleanName}" created successfully`
    };
  } catch (err) {
    console.error(`[Grabotech] Create category error for "${cleanName}":`, err.message);
    throw err;
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
  fetchCategories,
  createCategory,
  closeSession
};
