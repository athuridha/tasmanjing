const axios = require('axios');
const common = require('./common');

const GRABOTECH_SYSTEM_CATEGORIES = {
  'bread': 137, // Food
  'bakery': 137, // Food
  'coffee': 131, // Drinks
  'tea': 131, // Drinks
  'milk': 131, // Drinks
  'yogurt': 131, // Drinks
  'snacks': 138, // Snack
  'snack': 138,
  'noodles': 137, // Food
  'mineral water': 131, // Drinks
  'drinks': 131, // Drinks
  'beverages': 131, // Drinks
  'soft drink': 129, // SODA
  'soda': 129, // SODA
  'cola': 128, // Coca Cola
  'coke': 128,
  'carbon': 127, // Carbonated Drinks
  'other': 85
};

// Helper: Parse Grabotech goods HTML table response
function parseGrabotechGoodsHtml(html) {
  const trRegex = /<tr[^>]*id="goods_(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const imgRegex = /<img[^>]*src="([^"]+)"/i;
  const goods = [];
  
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const goodsId = trMatch[1];
    const tdsHtml = trMatch[2];
    
    const tds = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(tdsHtml)) !== null) {
      tds.push(tdMatch[1].trim());
    }
    
    if (tds.length >= 11) {
      const name = tds[2] || tds[3] || '';
      const imgMatch = tds[4].match(imgRegex);
      const imageUrl = imgMatch ? imgMatch[1] : '';
      const unit = tds[5] || '';
      const price = parseFloat(tds[6]) || 0;
      const cost = parseFloat(tds[7]) || 0;
      const barcode = tds[10] || '';
      
      goods.push({
        uuid: goodsId,
        goodsName: name,
        goodsCode: barcode,
        goodsPrice: price,
        costPrice: cost,
        membersPrice: 0,
        customName: 'General',
        goodsUrl: imageUrl,
        brand: '',
        specsDesc: unit,
        type: 'grabotech'
      });
    }
  }
  return goods;
}

// Helper: Upload product image to Grabotech
async function uploadGrabotechImage(token, imageUrl) {
  if (!imageUrl) return '';
  try {
    console.log(`Downloading image for Grabotech upload: ${imageUrl}`);
    const imgResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    let filename = 'image.png';
    const contentType = imgResponse.headers['content-type'] || 'image/png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) filename = 'image.jpg';
    else if (contentType.includes('gif')) filename = 'image.gif';
    else if (contentType.includes('webp')) filename = 'image.webp';

    const blob = new Blob([imgResponse.data], { type: contentType });
    const form = new FormData();
    form.append('pic1', blob, filename);

    const uploadUrl = 'https://admin.grabotech.com/goods/goodsinfo/uploadImage';
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Cookie': `PHPSESSID=${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: form
    });

    const resData = await response.json();
    console.log('Grabotech upload image response:', resData);
    if (resData) {
      return resData.url || (resData.data && resData.data.src) || (resData.data && resData.data.url) || '';
    }
  } catch (err) {
    console.error('Failed to upload image to Grabotech:', err.message);
  }
  return '';
}

// Helper: Check if product exists in target
async function findProductInTarget(token, barcode, name) {
  const cleanName = name ? name.trim().toLowerCase() : '';
  const cleanBarcode = barcode ? barcode.trim() : '';

  const url = 'https://admin.grabotech.com/goods/goodsinfo/getlist.html';
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': `PHPSESSID=${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  const querystring = require('querystring');
  
  if (cleanBarcode) {
    try {
      const payload = querystring.stringify({
        page: 1,
        pageSize: 100,
        navigationId: 24,
        name: cleanBarcode
      });
      const response = await axios.post(url, payload, { headers });
      if (response.data) {
        const list = parseGrabotechGoodsHtml(response.data);
        const matched = list.find(g => g.goodsCode && g.goodsCode.trim() === cleanBarcode);
        if (matched) return { ...matched, type: 'grabotech' };
      }
    } catch (err) {
      console.error('Error querying Grabotech target goods by barcode:', err.message);
    }
  }

  if (cleanName) {
    try {
      const payload = querystring.stringify({
        page: 1,
        pageSize: 100,
        navigationId: 24,
        name: name.trim()
      });
      const response = await axios.post(url, payload, { headers });
      if (response.data) {
        const list = parseGrabotechGoodsHtml(response.data);
        const matched = list.find(g => g.goodsName && common.normalizeName(g.goodsName) === common.normalizeName(name));
        if (matched) return { ...matched, type: 'grabotech' };
      }
    } catch (err) {
      console.error('Error querying Grabotech target goods by name:', err.message);
    }
  }

  return null;
}

// 1. Login
async function login(userAccount, userPwd, sessionCookie, vifCode) {
  if (!vifCode) {
    const err = new Error('Verification code is required for Grabotech');
    err.status = 400;
    throw err;
  }
  if (!sessionCookie) {
    const err = new Error('Session cookie is missing. Please reload captcha.');
    err.status = 400;
    throw err;
  }

  const url = 'https://admin.grabotech.com/index/index/login.html';
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': `PHPSESSID=${sessionCookie}`,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  const querystring = require('querystring');
  const payload = querystring.stringify({
    userName: userAccount.trim(),
    password: userPwd.trim(),
    vifCode: vifCode.trim(),
    remember: ''
  });

  const response = await axios.post(url, payload, { headers });
  console.log('Grabotech login response:', response.data);
  
  const resData = response.data || {};
  const isSuccess = resData.status === 1 || resData.status === 1001 || resData.code === 200 || resData.success === true || (typeof resData === 'string' && resData.includes('成功'));

  if (isSuccess || resData.status === 1 || resData.status === 1001) {
    return {
      success: true,
      token: sessionCookie,
      user: {
        userAccount: userAccount,
        contactMan: userAccount,
        email: '-',
        type: 'grabotech'
      }
    };
  } else {
    const err = new Error(resData.info || resData.msg || 'Login failed. Please check credentials/captcha.');
    err.status = 400;
    throw err;
  }
}

// 2. Fetch Goods
async function fetchGoods(token) {
  let allGoods = [];
  let pageNo = 1;
  const pageSize = 100;
  let totalCount = 0;

  do {
    const url = 'https://admin.grabotech.com/goods/goodsinfo/getlist.html';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `PHPSESSID=${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const querystring = require('querystring');
    const payload = querystring.stringify({
      page: pageNo,
      pageSize: pageSize,
      navigationId: 24,
      name: '',
      status: '',
      goodsTypeId: '',
      source: '',
      retailId: ''
    });

    console.log(`Fetching Grabotech goods page ${pageNo} (pageSize: ${pageSize})...`);
    const response = await axios.post(url, payload, { headers });

    if (response.data) {
      const html = response.data;
      const pageGoods = parseGrabotechGoodsHtml(html);
      allGoods = allGoods.concat(pageGoods);

      const totalMatch = html.match(/Total\s+(\d+)\s+Pages/i);
      const totalPages = totalMatch ? parseInt(totalMatch[1]) : 1;
      
      const itemsMatch = html.match(/Total\s+\d+\s+Pages\s+(\d+)\s+Items/i);
      totalCount = itemsMatch ? parseInt(itemsMatch[1]) : allGoods.length;

      if (pageGoods.length === 0 || pageNo >= totalPages || allGoods.length >= totalCount) {
        break;
      }
      pageNo++;
    } else {
      throw new Error('Failed to query Grabotech goods (empty response)');
    }
  } while (allGoods.length < totalCount);

  return {
    success: true,
    total: allGoods.length,
    goods: allGoods
  };
}

// 3. Sync Item
async function syncItem(targetToken, good, mode) {
  const categoryName = (good.customName || 'General').trim();
  const categoryKey = categoryName.toLowerCase();
  let targetCategoryId = 85; // Default categories
  for (const [k, id] of Object.entries(GRABOTECH_SYSTEM_CATEGORIES)) {
    if (categoryKey.includes(k)) {
      targetCategoryId = id;
      break;
    }
  }

  // Check if product already exists in target
  console.log(`Checking if "${good.goodsName}" exists in target...`);
  const existingProduct = await findProductInTarget(targetToken, good.goodsCode, good.goodsName);

  if (existingProduct) {
    const isPriceMatch = 
      existingProduct.goodsPrice === good.goodsPrice &&
      existingProduct.costPrice === good.costPrice &&
      existingProduct.membersPrice === good.membersPrice;

    const isDetailsMatch = 
      (existingProduct.goodsName || '').trim() === (good.goodsName || '').trim() &&
      (existingProduct.goodsCode || '').trim() === (good.goodsCode || '').trim() &&
      (existingProduct.brand || '').trim() === (good.brand || '').trim() &&
      (existingProduct.specsDesc || '').trim() === (good.specsDesc || '').trim() &&
      (existingProduct.goodsUrl || '').trim() === (good.goodsUrl || '').trim();

    if (mode === 'copy' && isDetailsMatch) {
      return { success: true, status: 'skipped', message: 'Details already match' };
    }
    if (mode === 'price' && isPriceMatch) {
      return { success: true, status: 'skipped', message: 'Prices already match' };
    }
    if (mode === 'both' && isPriceMatch) {
      return { success: true, status: 'skipped', message: 'Prices and category already match' };
    }

    const applyCostPrice = mode === 'copy' ? existingProduct.costPrice : good.costPrice;
    const applySalePrice = mode === 'copy' ? existingProduct.goodsPrice : good.goodsPrice;

    console.log(`Updating Grabotech product details for "${good.goodsName}"...`);
    
    let finalImageUrl = existingProduct.goodsUrl || '';
    if (good.goodsUrl && good.goodsUrl !== existingProduct.goodsUrl) {
      finalImageUrl = await uploadGrabotechImage(targetToken, good.goodsUrl);
    }

    const editUrl = 'https://admin.grabotech.com/goods/goodsinfo/edit.html';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `PHPSESSID=${targetToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const querystring = require('querystring');
    const payload = querystring.stringify({
      goodsId: existingProduct.uuid,
      goodsTypeId: targetCategoryId,
      addgoodsTypeId: targetCategoryId,
      name: good.goodsName,
      enName: good.goodsName,
      unit: good.specsDesc || existingProduct.specsDesc || 'Bag',
      salePrice: applySalePrice,
      costPrice: applyCostPrice,
      qualityDay: 365,
      isDefault: 1,
      shapeCode: good.goodsCode || existingProduct.goodsCode || '',
      heating: 0,
      goodsBrandId: 0,
      saleLimit: 0,
      lenth: 0,
      thirdGoodsCode: good.goodsCode || '',
      specification: good.specsDesc || '',
      picURL: finalImageUrl,
      picURLs: '',
      imageNamesAll: '',
      nameAllToUp: ''
    });

    const response = await axios.post(editUrl, payload, { headers });
    if (response.data && (response.data.code === 200 || response.data.status === 1 || (typeof response.data === 'string' && response.data.includes('成功')))) {
      return { success: true, status: 'synced', message: `Updated price to ${good.goodsPrice}` };
    } else {
      const errMsg = response.data ? (response.data.msg || response.data.info) : 'Failed to update Grabotech product';
      throw new Error(errMsg);
    }
  }

  if (mode === 'price') {
    return { success: true, status: 'skipped', message: 'Product does not exist in target' };
  }

  console.log(`Product "${good.goodsName}" does not exist in Grabotech target. Creating new product...`);
  
  let finalImageUrl = '';
  if (good.goodsUrl) {
    finalImageUrl = await uploadGrabotechImage(targetToken, good.goodsUrl);
  }

  const createUrl = 'https://admin.grabotech.com/goods/goodsinfo/edit.html';
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': `PHPSESSID=${targetToken}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  const querystring = require('querystring');
  const payload = querystring.stringify({
    goodsId: '', // Empty for new
    goodsTypeId: targetCategoryId,
    addgoodsTypeId: targetCategoryId,
    name: good.goodsName,
    enName: good.goodsName,
    unit: good.specsDesc || 'Bag',
    salePrice: good.goodsPrice,
    costPrice: good.costPrice,
    qualityDay: 365,
    isDefault: 1,
    shapeCode: good.goodsCode || '',
    heating: 0,
    goodsBrandId: 0,
    saleLimit: 0,
    lenth: 0,
    thirdGoodsCode: good.goodsCode || '',
    specification: good.specsDesc || '',
    picURL: finalImageUrl,
    picURLs: '',
    imageNamesAll: '',
    nameAllToUp: ''
  });

  const response = await axios.post(createUrl, payload, { headers });
  if (response.data && (response.data.code === 200 || response.data.status === 1 || (typeof response.data === 'string' && response.data.includes('成功')))) {
    return { success: true, status: 'synced', message: 'Created new product in Grabotech' };
  } else {
    const errMsg = response.data ? (response.data.msg || response.data.info) : 'Failed to create Grabotech product';
    throw new Error(errMsg);
  }
}

module.exports = {
  login,
  fetchGoods,
  syncItem,
  uploadGrabotechImage,
  parseGrabotechGoodsHtml
};
