const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;
const BASE_URL = 'https://www.hnzczy.cn/ms3';

const activeDownloads = {};

// Helper: Normalize name by converting to lowercase and stripping all whitespace
function normalizeName(str) {
  return str ? str.trim().toLowerCase().replace(/\s+/g, '') : '';
}

const SYSTEM_CATEGORIES = {
  'bread': 36777,
  'breads': 36777,
  'energy drink': 35432,
  'energy drinks': 35432,
  'noodles': 35431,
  'noodle': 35431,
  'isotonic water': 35430,
  'health drink': 35429,
  'health drinks': 35429,
  'milk': 35428,
  'milks': 35428,
  'tea': 35427,
  'teas': 35427,
  'mineral water': 35426,
  'carbon drink': 35425,
  'carbon drinks': 35425,
  'coffee': 35424,
  'coffees': 35424,
  'snacks': 35260,
  'snack': 35260
};

const ITSPC_SYSTEM_CATEGORIES = {
  'bread': 5535,
  'bakery': 5535,
  'coffee': 5529,
  'tea': 5529,
  'milk': 5531,
  'yogurt': 5531,
  'snacks': 5534,
  'noodles': 5543,
  'mineral water': 5524,
  'drinks': 5525,
  'beverages': 5525,
  'soft drink': 5527,
  'soda': 5527,
  'energy drink': 5541,
  'health drink': 5525,
  'other': 5537
};

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

// Signature calculator for qauthorization header
function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function getQAuthorization() {
  const t = Date.now();
  const sign = md5(t + 'zczyadmin' + t + 'zczytokenAuth');
  return `${t}@@@${sign}`;
}

// Grabotech Captcha endpoint
app.get('/api/grabotech-captcha', async (req, res) => {
  try {
    const response = await axios.get('https://admin.grabotech.com/captcha.html', {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    let phpSessionId = '';
    const cookies = response.headers['set-cookie'] || [];
    for (const cookie of cookies) {
      if (cookie.includes('PHPSESSID=')) {
        phpSessionId = cookie.split('PHPSESSID=')[1].split(';')[0];
        break;
      }
    }

    const base64Image = Buffer.from(response.data, 'binary').toString('base64');
    const mimeType = response.headers['content-type'] || 'image/png';

    return res.json({
      success: true,
      captchaUrl: `data:${mimeType};base64,${base64Image}`,
      phpSessionId: phpSessionId
    });
  } catch (err) {
    console.error('Failed to fetch Grabotech captcha:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Login endpoint
app.post('/api/login', async (req, res) => {
  const { userAccount, userPwd, type = 'main' } = req.body;
  if (!userAccount || !userPwd) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (type === 'grabotech') {
    const { sessionCookie, vifCode } = req.body;
    if (!vifCode) {
      return res.status(400).json({ error: 'Verification code is required for Grabotech' });
    }
    if (!sessionCookie) {
      return res.status(400).json({ error: 'Session cookie is missing. Please reload captcha.' });
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

    try {
      const response = await axios.post(url, payload, { headers });
      console.log('Grabotech login response:', response.data);
      
      const resData = response.data || {};
      const isSuccess = resData.status === 1 || resData.status === 1001 || resData.code === 200 || resData.success === true || (typeof resData === 'string' && resData.includes('成功'));

      if (isSuccess || resData.status === 1 || resData.status === 1001) {
        return res.json({
          success: true,
          token: sessionCookie,
          user: {
            userAccount: userAccount,
            contactMan: userAccount,
            email: '-',
            type: 'grabotech'
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          error: resData.info || resData.msg || 'Login failed. Please check credentials/captcha.'
        });
      }
    } catch (err) {
      console.error('Grabotech login error:', err.message);
      return res.status(500).json({
        success: false,
        error: err.response ? JSON.stringify(err.response.data) : err.message
      });
    }
  }

  if (type === 'itspc') {
    const url = 'https://sv.hnzczy.cn/login';
    const payload = {
      username: userAccount.trim(),
      password: userPwd.trim(),
      code: '',
      uuid: ''
    };

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    try {
      const response = await axios.post(url, payload, { headers });
      if (response.data && response.data.code === 200) {
        const token = response.data.data.token;
        return res.json({
          success: true,
          token: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          user: {
            userAccount: userAccount,
            contactMan: userAccount,
            email: '-',
            type: 'itspc'
          }
        });
      } else {
        return res.status(401).json({
          success: false,
          error: response.data ? response.data.msg : 'Login failed'
        });
      }
    } catch (err) {
      console.error('ITSPC Login error:', err.message);
      return res.status(500).json({
        success: false,
        error: err.response ? err.response.data : err.message
      });
    }
  }

  const url = `${BASE_URL}/sys/login`;
  const qauth = getQAuthorization();
  
  const payload = {
    userAccount: userAccount.trim(),
    userPwd: userPwd.trim(),
    version: '1.1.70'
  };

  const headers = {
    'Content-Type': 'application/json',
    'qauthorization': qauth,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    const response = await axios.post(url, payload, { headers });
    
    if (response.data && response.data.result === 'true') {
      const token = response.headers['authorization'];
      return res.json({
        success: true,
        token: token,
        user: response.data.data
      });
    } else {
      return res.status(401).json({
        success: false,
        error: response.data ? response.data.resultDesc : 'Login failed'
      });
    }
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.response ? err.response.data : err.message
    });
  }
});

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

// 2. Fetch all goods endpoint (with automatic pagination)
app.post('/api/goods', async (req, res) => {
  const { token, type = 'main' } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Authentication token is required' });
  }

  let allGoods = [];
  let pageNo = 1;
  const pageSize = 100;
  let totalCount = 0;

  if (type === 'grabotech') {
    try {
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

          console.log(`Grabotech Page ${pageNo} returned ${pageGoods.length} items. Total: ${totalCount}, Pages: ${totalPages}`);

          if (pageGoods.length === 0 || pageNo >= totalPages || allGoods.length >= totalCount) {
            break;
          }
          pageNo++;
        } else {
          throw new Error('Failed to query Grabotech goods (empty response)');
        }
      } while (allGoods.length < totalCount);

      return res.json({
        success: true,
        total: allGoods.length,
        goods: allGoods
      });
    } catch (err) {
      console.error('Fetch Grabotech goods error:', err.message);
      return res.status(500).json({
        success: false,
        error: err.response ? err.response.data : err.message
      });
    }
  }

  if (type === 'itspc') {
    try {
      do {
        const url = 'https://sv.hnzczy.cn/goods/info/list';
        const headers = {
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        const params = {
          pageNum: pageNo,
          pageSize: pageSize
        };

        console.log(`Fetching ITSPC goods page ${pageNo} (pageSize: ${pageSize})...`);
        const response = await axios.get(url, { headers, params });

        if (response.data && response.data.code === 200) {
          const rows = response.data.rows || [];
          const mappedPage = rows.map(row => {
            const info = row.goodsInfoVo || {};
            const sub = row.goodsSubInfoVo || {};
            
            const rawCost = sub.costFee ? parseFloat(sub.costFee) : 0;
            const rawPrice = sub.salePrice ? parseFloat(sub.salePrice) : 0;
            const rawMember = sub.memberPrice ? parseFloat(sub.memberPrice) : 0;

            return {
              uuid: sub.id || info.id,
              goodsName: sub.goodsName || info.goodsName || '',
              goodsCode: info.goodsCode || '',
              goodsPrice: rawPrice,
              costPrice: rawCost,
              membersPrice: rawMember,
              customName: sub.categoryName || 'General',
              goodsUrl: sub.goodsPic || info.goodsPic || '',
              brand: info.factory || '',
              specsDesc: info.specs || '',
              type: 'itspc'
            };
          });

          allGoods = allGoods.concat(mappedPage);
          totalCount = response.data.total || 0;
          console.log(`ITSPC Page ${pageNo} returned ${rows.length} items. Total count reported: ${totalCount}`);

          if (rows.length === 0 || allGoods.length >= totalCount) {
            break;
          }
          pageNo++;
        } else {
          throw new Error(response.data ? response.data.msg : 'Failed to query ITSPC goods');
        }
      } while (allGoods.length < totalCount);

      return res.json({
        success: true,
        total: allGoods.length,
        goods: allGoods
      });
    } catch (err) {
      console.error('Fetch ITSPC goods error:', err.message);
      return res.status(500).json({
        success: false,
        error: err.response ? err.response.data : err.message
      });
    }
  }

  try {
    // Fetch custom categories to map cateUuid to its typeName
    let categoryMap = {};
    try {
      const cats = await getCategories(token);
      if (Array.isArray(cats)) {
        cats.forEach(c => {
          const uuid = c.cateUuid || c.uuid;
          if (uuid) {
            categoryMap[uuid] = c.typeName;
          }
        });
      }
    } catch (catErr) {
      console.error('Failed to fetch categories for mapping:', catErr.message);
    }

    do {
      const url = `${BASE_URL}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=${pageSize}&pageNo=${pageNo}&cateUuid=&likeCode=&accout=&goodsStat=&feeStart=&feeEnd=`;
      const qauth = getQAuthorization();
      const headers = {
        'authorization': token,
        'qauthorization': qauth,
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      console.log(`Fetching goods page ${pageNo} (pageSize: ${pageSize})...`);
      const response = await axios.get(url, { headers });
      
      if (response.data && response.data.result === 'true') {
        const goodsPage = response.data.data ? response.data.data.data : [];
        if (goodsPage.length > 0) {
          try {
            fs.writeFileSync(path.join(__dirname, 'debug_goods.json'), JSON.stringify(goodsPage.slice(0, 5), null, 2));
            console.log('Saved debug_goods.json successfully');
          } catch (writeErr) {
            console.error('Failed to write debug_goods.json:', writeErr.message);
          }
        }

        // Map products to include customName and other normalized properties
        const mappedPage = goodsPage.map(g => {
          const catName = categoryMap[g.cateUuid] || g.customTypeName || g.cateName || g.typeName || g.customName || 'General';
          return {
            ...g,
            uuid: g.uuid || g.goodsUuid,
            goodsName: g.goodsName || '',
            goodsCode: g.goodsCode || '',
            goodsPrice: parseFloat(g.goodsPrice || 0),
            costPrice: parseFloat(g.costPrice || 0),
            membersPrice: parseFloat(g.membersPrice || 0),
            customName: catName,
            brand: g.brand || '',
            specsDesc: g.specsDesc || '',
            type: 'main'
          };
        });

        allGoods = allGoods.concat(mappedPage);
        
        totalCount = response.data.pageBean ? response.data.pageBean.pageDataCount : 0;
        console.log(`Page ${pageNo} returned ${goodsPage.length} items. Total count reported: ${totalCount}`);
        
        if (goodsPage.length === 0 || allGoods.length >= totalCount) {
          break;
        }
        pageNo++;
      } else {
        throw new Error(response.data ? response.data.resultDesc : 'Failed to query goods');
      }
    } while (allGoods.length < totalCount);

    return res.json({
      success: true,
      total: allGoods.length,
      goods: allGoods
    });
  } catch (err) {
    console.error('Fetch goods error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.response ? err.response.data : err.message
    });
  }
});

// Helper: Get target account machine UUID dynamically
async function getTargetMachineUuid(token) {
  try {
    const url = `${BASE_URL}/machineinfo/querymachineinfo?pageNum=1&pageSize=10`;
    const qauth = getQAuthorization();
    const headers = {
      'authorization': token,
      'qauthorization': qauth,
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    const response = await axios.get(url, { headers });
    if (response.data && response.data.result === 'true' && response.data.data && response.data.data.length > 0) {
      return response.data.data[0].uuid || '155';
    }
  } catch (err) {
    console.error('Error fetching target machine info:', err.message);
  }
  return '155'; // Fallback
}

// Helper: Query custom categories of an account
async function getCategories(token) {
  const url = `${BASE_URL}/commcustomcategory/querycommcustomcategory?customType=2`;
  const qauth = getQAuthorization();
  const headers = {
    'authorization': token,
    'qauthorization': qauth,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  const response = await axios.get(url, { headers });
  if (response.data && response.data.statusCode === '0') {
    return response.data.data || [];
  } else {
    throw new Error('Failed to query categories');
  }
}

// Helper: Create custom category
async function createCategory(token, typeName, machineUuid = '155') {
  const url = `${BASE_URL}/commcustomcategory/addcommcustomcategory`;
  const qauth = getQAuthorization();
  const headers = {
    'Content-Type': 'application/json',
    'authorization': token,
    'qauthorization': qauth,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  const payload = {
    customType: 2,
    machineUuid: machineUuid,
    typeName: typeName,
    typeRemark: ''
  };

  const response = await axios.post(url, payload, { headers });
  if (response.data && response.data.result === 'true') {
    return response.data.data; // usually returns statusCode or new uuid
  } else {
    throw new Error(response.data ? response.data.resultDesc : 'Failed to create category');
  }
}

// Helper: Query ITSPC custom categories
async function getItspcCategories(token, userId) {
  try {
    const url = 'https://sv.hnzczy.cn/goods/categoryPlantf/userCategorylist';
    const headers = {
      'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0'
    };
    const params = {
      pageNum: 1,
      pageSize: 250,
      ownerType: 1
    };
    if (userId) {
      params.userId = userId;
    }
    const response = await axios.get(url, { headers, params });
    if (response.data && response.data.code === 200) {
      return response.data.rows || [];
    }
  } catch (err) {
    console.error('Failed to fetch ITSPC custom categories:', err.message);
  }
  return [];
}

// Helper: Create ITSPC custom category
async function createItspcCategory(token, categoryName, userId) {
  try {
    const url = 'https://sv.hnzczy.cn/goods/categoryPlantf';
    const headers = {
      'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0'
    };
    const payload = {
      categoryName: categoryName,
      parentId: 1,
      ownerType: 1,
      userId: userId || null
    };
    const response = await axios.post(url, payload, { headers });
    if (response.data && response.data.code === 200) {
      return response.data.data;
    }
  } catch (err) {
    console.error(`Failed to create ITSPC custom category "${categoryName}":`, err.message);
  }
  return null;
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

// Helper: Check if product exists in target account by barcode or name (robust check to avoid duplicates)
async function findProductInTarget(token, barcode, name, targetType = 'main') {
  const cleanName = name ? name.trim().toLowerCase() : '';
  const cleanBarcode = barcode ? barcode.trim() : '';

  if (targetType === 'grabotech') {
    const url = 'https://admin.grabotech.com/goods/goodsinfo/getlist.html';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `PHPSESSID=${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const querystring = require('querystring');
    
    // 1. Try to search by barcode first
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

    // 2. Try to search by name (lenient whitespace-insensitive match)
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
          const matched = list.find(g => g.goodsName && normalizeName(g.goodsName) === normalizeName(name));
          if (matched) return { ...matched, type: 'grabotech' };
        }
      } catch (err) {
        console.error('Error querying Grabotech target goods by name:', err.message);
      }
    }
    return null;
  }

  if (targetType === 'itspc') {
    const url = 'https://sv.hnzczy.cn/goods/info/list';
    const headers = {
      'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const searchVal = cleanBarcode || name;
    if (searchVal) {
      try {
        const response = await axios.get(url, {
          headers,
          params: { pageNum: 1, pageSize: 100, searchValue: searchVal.trim() }
        });
        if (response.data && response.data.code === 200) {
          const rows = response.data.rows || [];
          const matched = rows.find(row => {
            const info = row.goodsInfoVo || {};
            const sub = row.goodsSubInfoVo || {};
            return (
              (info.goodsCode && info.goodsCode.trim() === cleanBarcode) ||
              (sub.goodsName && normalizeName(sub.goodsName) === normalizeName(name)) ||
              (info.goodsName && normalizeName(info.goodsName) === normalizeName(name))
            );
          });

          if (matched) {
            const info = matched.goodsInfoVo || {};
            const sub = matched.goodsSubInfoVo || {};
            return {
              goodsInfoId: info.id,
              goodsSubInfoId: sub.id,
              goodsName: sub.goodsName || info.goodsName,
              goodsCode: info.goodsCode || '',
              goodsPrice: parseFloat(sub.salePrice || 0),
              costPrice: parseFloat(sub.costFee || 0),
              membersPrice: sub.memberPrice ? parseFloat(sub.memberPrice) : 0,
              goodsInfoVo: info,
              goodsSubInfoVo: sub,
              type: 'itspc'
            };
          }
        }
      } catch (err) {
        console.error('Error querying ITSPC target goods:', err.message);
      }
    }
    return null;
  }

  const qauth = getQAuthorization();
  const headers = {
    'authorization': token,
    'qauthorization': qauth,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  // 1. Try to search by name first (lenient match)
  if (cleanName) {
    const urlByName = `${BASE_URL}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=100&pageNo=1&cateUuid=&likeCode=${encodeURIComponent(name.trim())}&accout=&goodsStat=&feeStart=&feeEnd=`;
    try {
      const response = await axios.get(urlByName, { headers });
      if (response.data && response.data.result === 'true') {
        const list = response.data.data ? response.data.data.data : [];
        const matched = list.find(g => 
          (g.goodsName && normalizeName(g.goodsName) === normalizeName(name)) ||
          (cleanBarcode && g.goodsCode && g.goodsCode.trim() === cleanBarcode)
        );
        if (matched) return matched;
      }
    } catch (err) {
      console.error('Error querying target goods by name:', err.message);
    }
  }

  // 2. If not found by name, and barcode exists, search by barcode specifically
  if (cleanBarcode) {
    const urlByBarcode = `${BASE_URL}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=100&pageNo=1&cateUuid=&likeCode=${encodeURIComponent(cleanBarcode)}&accout=&goodsStat=&feeStart=&feeEnd=`;
    try {
      const response = await axios.get(urlByBarcode, { headers });
      if (response.data && response.data.result === 'true') {
        const list = response.data.data ? response.data.data.data : [];
        const matched = list.find(g => 
          (g.goodsCode && g.goodsCode.trim() === cleanBarcode) ||
          (g.goodsName && normalizeName(g.goodsName) === normalizeName(name))
        );
        if (matched) return matched;
      }
    } catch (err) {
      console.error('Error querying target goods by barcode:', err.message);
    }
  }

  return null;
}

// 3. Sync single item endpoint
app.post('/api/sync-item', async (req, res) => {
  const { targetToken, targetUserUuid, good, mode = 'copy', targetType = 'main' } = req.body;
  if (!targetToken || !good) {
    return res.status(400).json({ error: 'targetToken and good object are required' });
  }

  try {
    // Resolve target category details beforehand
    let targetCateUuid = "";
    let targetCategoryId = 85; // Default for Grabotech/General
    let targetCategoryName = "";
    let targetMachineUuid = "";
    let customCategoryId = null;
    let customCategoryName = "";

    if (targetType === 'main') {
      const categoryName = (good.customName || 'General').trim();
      const categoryKey = categoryName.toLowerCase();
      targetMachineUuid = await getTargetMachineUuid(targetToken);
      
      console.log(`Checking custom categories for "${categoryName}" on target...`);
      let categories = [];
      try {
        const fetchedCats = await getCategories(targetToken);
        categories = Array.isArray(fetchedCats) ? fetchedCats : [];
      } catch (err) {
        console.error('Failed to fetch categories:', err.message);
      }
      
      let matchedCategory = categories.find(c => 
        c.typeName && c.typeName.trim().toLowerCase() === categoryKey
      );

      if (matchedCategory) {
        targetCateUuid = matchedCategory.cateUuid || matchedCategory.uuid;
      } else {
        console.log(`Category "${categoryName}" not found in target custom categories. Creating it...`);
        try {
          await createCategory(targetToken, categoryName, targetMachineUuid);
          const updatedCategories = await getCategories(targetToken);
          const refetchedList = Array.isArray(updatedCategories) ? updatedCategories : [];
          matchedCategory = refetchedList.find(c => 
            c.typeName && c.typeName.trim().toLowerCase() === categoryKey
          );
          if (matchedCategory) {
            targetCateUuid = matchedCategory.cateUuid || matchedCategory.uuid;
          }
        } catch (catErr) {
          console.error(`Failed to create category "${categoryName}":`, catErr.message);
        }

        if (!targetCateUuid) {
          if (SYSTEM_CATEGORIES[categoryKey]) {
            targetCateUuid = SYSTEM_CATEGORIES[categoryKey];
          }
        }
      }
    } else if (targetType === 'itspc') {
      const categoryName = (good.customName || 'General').trim();
      const categoryKey = categoryName.toLowerCase();
      targetCategoryId = 5537;
      targetCategoryName = "อื่นๆ L (Non-Food & Drink)";

      for (const [k, id] of Object.entries(ITSPC_SYSTEM_CATEGORIES)) {
        if (categoryKey.includes(k)) {
          targetCategoryId = id;
          if (id === 5535) targetCategoryName = "Cake & Bakery";
          else if (id === 5529) targetCategoryName = "Coffee&Tea L";
          else if (id === 5531) targetCategoryName = "นม L (Milk/Soy Milk)";
          else if (id === 5534) targetCategoryName = "ขนมขบเคี้ยว (Snacks)";
          else if (id === 5543) targetCategoryName = "บ.สำเร็จรูป L (Ins.Noodle)";
          else if (id === 5524) targetCategoryName = "น้ำแร่ OutS H (Mineral water)";
          else if (id === 5525) targetCategoryName = "เครื่องดื่ม L (Beverages)";
          else if (id === 5527) targetCategoryName = "น้ำอัดลม L (Soft Drink)";
          else if (id === 5541) targetCategoryName = "เครื่องดื่มกำลัง L (EnergyD)";
          break;
        }
      }

      // Resolve Custom Category name and ID
      customCategoryName = categoryName;
      console.log(`Resolving ITSPC Custom Category for "${customCategoryName}"...`);
      try {
        const cats = await getItspcCategories(targetToken, targetUserUuid);
        let matched = cats.find(c => c.categoryName && c.categoryName.trim().toLowerCase() === categoryKey);
        if (matched) {
          customCategoryId = matched.id;
          console.log(`Found existing ITSPC custom category: "${customCategoryName}" -> ID: ${customCategoryId}`);
        } else {
          customCategoryId = null;
          console.log(`ITSPC custom category "${customCategoryName}" not found. Setting categoryId to null for manual insertion.`);
        }
      } catch (err) {
        console.error('Error resolving ITSPC custom category:', err.message);
        customCategoryId = null;
      }
    } else if (targetType === 'grabotech') {
      const categoryName = (good.customName || 'General').trim();
      const categoryKey = categoryName.toLowerCase();
      targetCategoryId = 85; // Default categories
      for (const [k, id] of Object.entries(GRABOTECH_SYSTEM_CATEGORIES)) {
        if (categoryKey.includes(k)) {
          targetCategoryId = id;
          break;
        }
      }
    }

    // Check if product already exists in target
    console.log(`Checking if "${good.goodsName}" exists in target...`);
    const existingProduct = await findProductInTarget(targetToken, good.goodsCode, good.goodsName, targetType);

    // If product exists in target
    if (existingProduct) {
      // Check if price matches
      const isPriceMatch = 
        existingProduct.goodsPrice === good.goodsPrice &&
        existingProduct.costPrice === good.costPrice &&
        existingProduct.membersPrice === good.membersPrice;

      // Check if category matches (both customCategory ID and system category ID must match for ITSPC)
      const isCategoryMatch = targetType === 'main'
        ? (String(existingProduct.cateUuid) === String(targetCateUuid))
        : (targetType === 'itspc'
          ? (existingProduct.goodsSubInfoVo && 
             String(existingProduct.goodsSubInfoVo.categoryId) === String(customCategoryId) &&
             existingProduct.goodsInfoVo && 
             String(existingProduct.goodsInfoVo.goodsCategoryId) === String(targetCategoryId))
          : true);

      // Check if other details match (for copy mode check)
      const isDetailsMatch = 
        (existingProduct.goodsName || '').trim() === (good.goodsName || '').trim() &&
        (existingProduct.goodsCode || '').trim() === (good.goodsCode || '').trim() &&
        (existingProduct.brand || '').trim() === (good.brand || '').trim() &&
        (existingProduct.specsDesc || '').trim() === (good.specsDesc || '').trim() &&
        (existingProduct.goodsUrl || '').trim() === (good.goodsUrl || '').trim() &&
        isCategoryMatch;

      // Skip condition depending on mode:
      if (mode === 'copy' && isDetailsMatch) {
        console.log(`Details already match for "${good.goodsName}". Skipping (mode: copy).`);
        return res.json({
          success: true,
          status: 'skipped',
          message: 'Details already match'
        });
      }

      if (mode === 'price' && isPriceMatch) {
        console.log(`Prices already match for "${good.goodsName}". Skipping (mode: price).`);
        return res.json({
          success: true,
          status: 'skipped',
          message: 'Prices already match'
        });
      }

      if (mode === 'both' && isPriceMatch && isCategoryMatch) {
        console.log(`Prices and category already match for "${good.goodsName}". Skipping (mode: both).`);
        return res.json({
          success: true,
          status: 'skipped',
          message: 'Prices and category already match'
        });
      }

      // Determine prices to apply based on mode
      const applyCostPrice = mode === 'copy' ? existingProduct.costPrice : good.costPrice;
      const applySalePrice = mode === 'copy' ? existingProduct.goodsPrice : good.goodsPrice;
      const applyMemberPrice = mode === 'copy' ? existingProduct.membersPrice : (good.membersPrice || 0);

      // We need to update the price in the target account
      if (targetType === 'grabotech') {
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
        console.log('Grabotech update response:', response.data);
        if (response.data && (response.data.code === 200 || response.data.status === 1 || (typeof response.data === 'string' && response.data.includes('成功')))) {
          console.log(`Successfully updated Grabotech prices for "${good.goodsName}"`);
          return res.json({
            success: true,
            status: 'synced',
            message: `Updated price to ${good.goodsPrice}`
          });
        } else {
          const errMsg = response.data ? (response.data.msg || response.data.info) : 'Failed to update Grabotech product';
          throw new Error(errMsg);
        }
      } else if (targetType === 'itspc') {
        console.log(`Updating ITSPC prices for "${good.goodsName}"...`);
        const url = 'https://sv.hnzczy.cn/goods/info';
        const headers = {
          'Authorization': targetToken.startsWith('Bearer ') ? targetToken : `Bearer ${targetToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0'
        };

        const payload = {
          goodsInfoBo: {
            id: existingProduct.goodsInfoId,
            goodsName: good.goodsName,
            goodsCode: good.goodsCode || existingProduct.goodsInfoVo.goodsCode || '',
            factory: good.brand || existingProduct.goodsInfoVo.factory || '',
            goodsCategoryId: targetCategoryId,
            specs: good.specsDesc || existingProduct.goodsInfoVo.specs || '',
            unit: existingProduct.goodsInfoVo.unit || '瓶装',
            actualWeight: existingProduct.goodsInfoVo.actualWeight || null
          },
          goodsSubInfoBo: {
            id: existingProduct.goodsSubInfoId,
            mainGoodsId: existingProduct.goodsInfoId,
            goodsPic: good.goodsUrl || existingProduct.goodsSubInfoVo.goodsPic || '',
            qualityPeriod: existingProduct.goodsSubInfoVo.qualityPeriod || null,
            qualityPeriodUnit: existingProduct.goodsSubInfoVo.qualityPeriodUnit || null,
            costFee: applyCostPrice,
            salePrice: applySalePrice,
            openServices: existingProduct.goodsSubInfoVo.openServices || 0,
            boxSpecs: existingProduct.goodsSubInfoVo.boxSpecs || null,
            goodsDescription: existingProduct.goodsSubInfoVo.goodsDescription || '',
            goodsAttrVal: existingProduct.goodsSubInfoVo.goodsAttrVal || '',
            memberPrice: applyMemberPrice || null,
            goodsName: good.goodsName,
            categoryId: customCategoryId,
            categoryName: customCategoryName,
            sortIndex: existingProduct.goodsSubInfoVo.sortIndex || 99999999
          }
        };

        const response = await axios.put(url, payload, { headers });
        if (response.data && response.data.code === 200) {
          console.log(`Successfully updated ITSPC prices for "${good.goodsName}"`);
          return res.json({
            success: true,
            status: 'synced',
            message: `Updated price to ${good.goodsPrice}`
          });
        } else {
          throw new Error(response.data ? response.data.msg : 'Failed to update ITSPC product prices');
        }
      } else {
        console.log(`Updating prices for "${good.goodsName}" in target to match source...`);
        const url = `${BASE_URL}/commcustomgoods/updatecommcustomgoods`;
        const qauth = getQAuthorization();
        const headers = {
          'Content-Type': 'application/json',
          'authorization': targetToken,
          'qauthorization': qauth,
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        const payload = {
          ...existingProduct,
          cateUuid: targetCateUuid || existingProduct.cateUuid,
          goodsName: (good.goodsName || '').trim(),
          goodsCode: good.goodsCode || '',
          brand: good.brand || '',
          specsDesc: good.specsDesc || '',
          goodsUrl: good.goodsUrl || '',
          introduceUrl: good.introduceUrl || '',
          goodsPrice: applySalePrice,
          costPrice: applyCostPrice,
          membersPrice: applyMemberPrice
        };

        const response = await axios.put(url, payload, { headers });

        if (response.data && response.data.result === 'true') {
          console.log(`Successfully updated prices for "${good.goodsName}"`);
          return res.json({
            success: true,
            status: 'synced',
            message: `Updated price to ${good.goodsPrice}`
          });
        } else {
          throw new Error(response.data ? response.data.resultDesc : 'Failed to update product prices');
        }
      }
    }

    // If product does NOT exist in target and we only want to sync prices
    if (mode === 'price') {
      console.log(`Product "${good.goodsName}" does not exist in target. Skipping (mode: price).`);
      return res.json({
        success: true,
        status: 'skipped',
        message: 'Product does not exist in target'
      });
    }

    // If product does NOT exist in target and we want to copy it (modes: 'copy' or 'both')
    if (targetType === 'grabotech') {
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
      console.log('Grabotech creation response:', response.data);
      if (response.data && (response.data.code === 200 || response.data.status === 1 || (typeof response.data === 'string' && response.data.includes('成功')))) {
        console.log(`Successfully created Grabotech product "${good.goodsName}"`);
        return res.json({
          success: true,
          status: 'synced',
          message: 'Created new product in Grabotech'
        });
      } else {
        const errMsg = response.data ? (response.data.msg || response.data.info) : 'Failed to create Grabotech product';
        throw new Error(errMsg);
      }
    } else if (targetType === 'itspc') {
      console.log(`Product "${good.goodsName}" does not exist in target merchant library. Searching in Platform Goods Library...`);
      
      const searchUrl = 'https://sv.hnzczy.cn/machine/baseInfo/queryPtGoods';
      const copyHeaders = {
        'Authorization': targetToken.startsWith('Bearer ') ? targetToken : `Bearer ${targetToken}`,
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0'
      };

      let platformProduct = null;
      const searchVal = good.goodsCode || good.goodsName;
      if (searchVal) {
        try {
          const ptResponse = await axios.get(searchUrl, {
            headers: copyHeaders,
            params: { pageNum: 1, pageSize: 50, searchValue: searchVal.trim() }
          });
          
          if (ptResponse.data && ptResponse.data.code === 200) {
            const rows = ptResponse.data.rows || [];
            const cleanBarcode = good.goodsCode ? good.goodsCode.trim() : '';
            
            platformProduct = rows.find(r => 
              (cleanBarcode && r.goodsCode && r.goodsCode.trim() === cleanBarcode) ||
              (r.goodsName && normalizeName(r.goodsName) === normalizeName(good.goodsName))
            );
          }
        } catch (ptErr) {
          console.error('Error querying Platform Goods Library:', ptErr.message);
        }
      }

      if (platformProduct) {
        console.log(`Product "${good.goodsName}" found in Platform Goods Library (ID: ${platformProduct.id}). Copying to merchant library...`);
        const copyUrl = `https://sv.hnzczy.cn/machine/baseInfo/copyBql/${platformProduct.id}`;
        
        try {
          const copyResponse = await axios.get(copyUrl, { headers: copyHeaders });
          if (copyResponse.data && copyResponse.data.code === 200) {
            console.log(`Successfully copied platform product ${platformProduct.id} to merchant library.`);
            
            // Wait 2 seconds for server to process the copy and index it
            await new Promise(r => setTimeout(r, 2000));

            // Now we must find the newly copied product in the merchant library to get its new goodsInfoId and goodsSubInfoId
            console.log('Querying target merchant library to retrieve copied product IDs...');
            const copiedMerchantProduct = await findProductInTarget(targetToken, good.goodsCode, good.goodsName, targetType);
            
            if (copiedMerchantProduct) {
              console.log(`Retrieved IDs for copied product: InfoId=${copiedMerchantProduct.goodsInfoId}, SubId=${copiedMerchantProduct.goodsSubInfoId}. Updating details...`);
              
              const updateUrl = 'https://sv.hnzczy.cn/goods/info';
              const updatePayload = {
                goodsInfoBo: {
                  id: copiedMerchantProduct.goodsInfoId,
                  goodsName: good.goodsName,
                  goodsCode: good.goodsCode || '',
                  factory: good.brand || copiedMerchantProduct.goodsInfoVo.factory || '',
                  goodsCategoryId: targetCategoryId,
                  specs: good.specsDesc || copiedMerchantProduct.goodsInfoVo.specs || '',
                  unit: copiedMerchantProduct.goodsInfoVo.unit || '瓶装',
                  actualWeight: copiedMerchantProduct.goodsInfoVo.actualWeight || null
                },
                goodsSubInfoBo: {
                  id: copiedMerchantProduct.goodsSubInfoId,
                  mainGoodsId: copiedMerchantProduct.goodsInfoId,
                  goodsPic: good.goodsUrl || copiedMerchantProduct.goodsSubInfoVo.goodsPic || '',
                  qualityPeriod: copiedMerchantProduct.goodsSubInfoVo.qualityPeriod || null,
                  qualityPeriodUnit: copiedMerchantProduct.goodsSubInfoVo.qualityPeriodUnit || null,
                  costFee: good.costPrice,
                  salePrice: good.goodsPrice,
                  openServices: copiedMerchantProduct.goodsSubInfoVo.openServices || 0,
                  boxSpecs: copiedMerchantProduct.goodsSubInfoVo.boxSpecs || null,
                  goodsDescription: copiedMerchantProduct.goodsSubInfoVo.goodsDescription || '',
                  goodsAttrVal: copiedMerchantProduct.goodsSubInfoVo.goodsAttrVal || '',
                  memberPrice: good.membersPrice || null,
                  goodsName: good.goodsName,
                  categoryId: customCategoryId,
                  categoryName: customCategoryName,
                  sortIndex: copiedMerchantProduct.goodsSubInfoVo.sortIndex || 99999999
                }
              };

              const updateResponse = await axios.put(updateUrl, updatePayload, { headers: copyHeaders });
              if (updateResponse.data && updateResponse.data.code === 200) {
                console.log(`Successfully customized copied product "${good.goodsName}"`);
                return res.json({
                  success: true,
                  status: 'synced',
                  message: 'Copied and customized platform product'
                });
              } else {
                throw new Error(updateResponse.data ? updateResponse.data.msg : 'Failed to update copied product details');
              }
            } else {
              throw new Error('Copied product successfully but could not retrieve its IDs in merchant catalog');
            }
          } else {
            throw new Error(copyResponse.data ? copyResponse.data.msg : 'Failed to copy platform product');
          }
        } catch (copyErr) {
          console.error(`Failed during platform copy/customize for "${good.goodsName}":`, copyErr.message);
          return res.status(500).json({ success: false, error: copyErr.message });
        }
      }

      console.log(`Product "${good.goodsName}" not found in Platform Goods Library. Creating from scratch...`);
      const insertUrl = 'https://sv.hnzczy.cn/goods/info';
      
      const payload = [
        {
          goodsInfoBo: {
            goodsName: good.goodsName,
            goodsPic: good.goodsUrl || "",
            goodsCode: good.goodsCode || "",
            factory: good.brand || "",
            goodsCategoryId: targetCategoryId,
            specs: good.specsDesc || "",
            unit: "瓶装",
            actualWeight: null
          },
          goodsSubInfoBo: {
            goodsPic: good.goodsUrl || "",
            qualityPeriod: null,
            qualityPeriodUnit: null,
            costFee: good.costPrice,
            salePrice: good.goodsPrice,
            openServices: 0,
            boxSpecs: null,
            goodsDescription: "",
            goodsAttrVal: "",
            memberPrice: good.membersPrice || null,
            goodsName: good.goodsName,
            categoryId: customCategoryId,
            categoryName: customCategoryName,
            sortIndex: 99999999
          }
        }
      ];

      const response = await axios.post(insertUrl, payload, { headers: copyHeaders });
      if (response.data && response.data.code === 200) {
        console.log(`Successfully synced "${good.goodsName}" from scratch to ITSPC target`);
        return res.json({
          success: true,
          status: 'synced',
          message: 'Created new product in ITSPC from scratch'
        });
      } else {
        throw new Error(response.data ? response.data.msg : 'Failed to create product in ITSPC from scratch');
      }
    }

    // Step 3: Insert Product in Main Portal (with retry logic)
    console.log(`Inserting product "${good.goodsName}" into target...`);
    const addUrl = `${BASE_URL}/commcustomgoods/addcommcustomgoods`;

    const payload = {
      goodsTypeStr: 2,
      machineUuid: targetMachineUuid,
      cateUuid: targetCateUuid,
      goodsName: (good.goodsName || '').trim(),
      goodsCode: good.goodsCode || '',
      goodsPrice: parseFloat(good.goodsPrice) || 0,
      membersPrice: parseFloat(good.membersPrice) || 0,
      costPrice: parseFloat(good.costPrice) || 0,
      specsDesc: good.specsDesc || '',
      brand: good.brand || '',
      goodsStat: typeof good.goodsStat !== 'undefined' ? good.goodsStat : 1,
      goodsExp: good.goodsExp || '',
      goodsRemark: good.goodsRemark || '',
      goodsUrl: good.goodsUrl || '',
      introduceUrl: good.introduceUrl || '',
      goodsDesc: good.goodsDesc || '',
      goodsServiceOpen: good.goodsServiceOpen || 0,
      goodsService: good.goodsService || '',
      goodsAttribute: good.goodsAttribute || ''
    };

    const MAX_INSERT_RETRIES = 3;
    let lastInsertError = 'Failed to add product';

    for (let attempt = 1; attempt <= MAX_INSERT_RETRIES; attempt++) {
      try {
        // Fresh qauthorization per attempt (time-based signature)
        const freshQauth = getQAuthorization();
        const insertHeaders = {
          'Content-Type': 'application/json',
          'authorization': targetToken,
          'qauthorization': freshQauth,
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        const addResponse = await axios.post(addUrl, payload, { headers: insertHeaders });

        if (addResponse.data && addResponse.data.result === 'true') {
          console.log(`Successfully synced "${good.goodsName}"${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
          return res.json({
            success: true,
            status: 'synced',
            message: 'Successfully synchronized product'
          });
        }

        lastInsertError = addResponse.data ? addResponse.data.resultDesc : 'Failed to add product';
        console.error(`Insert attempt ${attempt}/${MAX_INSERT_RETRIES} failed for "${good.goodsName}": ${lastInsertError}`);
        console.error(`Full API response: ${JSON.stringify(addResponse.data)}`);
      } catch (axiosErr) {
        lastInsertError = axiosErr.message || 'Network error during insert';
        console.error(`Insert attempt ${attempt}/${MAX_INSERT_RETRIES} error for "${good.goodsName}": ${lastInsertError}`);
      }

      if (attempt < MAX_INSERT_RETRIES) {
        const backoffMs = 2000 * attempt;
        console.log(`Waiting ${backoffMs}ms before retry...`);
        await new Promise(r => setTimeout(r, backoffMs));

        // Re-check: product might have been created despite error response
        const recheck = await findProductInTarget(targetToken, good.goodsCode, good.goodsName, targetType);
        if (recheck) {
          console.log(`Product "${good.goodsName}" found on re-check after failed insert. Treating as success.`);
          return res.json({
            success: true,
            status: 'synced',
            message: 'Product verified as synced after re-check'
          });
        }
        console.log(`Retrying insert for "${good.goodsName}" (attempt ${attempt + 1}/${MAX_INSERT_RETRIES})...`);
      }
    }

    throw new Error(lastInsertError);

  } catch (err) {
    console.error(`Error syncing "${good.goodsName}":`, err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// 4. Download all product images endpoint
app.post('/api/download-images', async (req, res) => {
  const { username, goods } = req.body;
  if (!username || !goods || !Array.isArray(goods)) {
    return res.status(400).json({ error: 'username and goods array are required' });
  }

  // --- Vercel serverless path: single-request, stream ZIP directly ---
  if (process.env.VERCEL) {
    const tmpDir = path.join(os.tmpdir(), `dl_${Date.now()}_${username.trim().replace(/\s+/g, '_')}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const isValidImageUrl = (urlStr) => {
      try {
        const parsed = new URL(urlStr);
        if (parsed.pathname === '/' || parsed.pathname === '') return false;
        return true;
      } catch (e) {
        return false;
      }
    };

    const downloadFile = async (url, destPath, retries = 3, delay = 1000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': 'https://hk.hnzczy.cn/'
            }
          });

          const writer = fs.createWriteStream(destPath);
          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          return;
        } catch (err) {
          if (attempt === retries) {
            throw err;
          }
          console.warn(`[Retry ${attempt}/${retries}] Failed download for ${url}: ${err.message}. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };

    try {
      let downloadedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < goods.length; i++) {
        const good = goods[i];
        const safeName = (good.goodsName || `product_${good.uuid}`).replace(/[\\/:*?"<>|]/g, '_').trim();
        const prefix = `${String(i + 1).padStart(3, '0')}_${safeName}`;

        if (good.goodsUrl && good.goodsUrl.startsWith('http') && isValidImageUrl(good.goodsUrl)) {
          const dest = path.join(tmpDir, `${prefix}_main.png`);
          try {
            await downloadFile(good.goodsUrl, dest);
            downloadedCount++;
          } catch (e) {
            console.error(`Failed main image for ${good.goodsName}:`, e.message);
            failedCount++;
          }
        }

        if (good.introduceUrl && good.introduceUrl.startsWith('http') && isValidImageUrl(good.introduceUrl)) {
          if (good.introduceUrl === good.goodsUrl) {
            const src = path.join(tmpDir, `${prefix}_main.png`);
            const dest = path.join(tmpDir, `${prefix}_intro.png`);
            try {
              if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                downloadedCount++;
              }
            } catch (e) {
              console.error(`Failed to copy duplicate image:`, e.message);
            }
          } else {
            const dest = path.join(tmpDir, `${prefix}_intro.png`);
            try {
              await downloadFile(good.introduceUrl, dest);
              downloadedCount++;
            } catch (e) {
              console.error(`Failed intro image for ${good.goodsName}:`, e.message);
              failedCount++;
            }
          }
        }
      }

      const files = fs.readdirSync(tmpDir);
      if (files.length === 0) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        return res.status(500).json({ error: 'No images could be downloaded. Check product image URLs.' });
      }

      console.log(`Vercel: Downloaded ${downloadedCount} images, ${failedCount} failed. Streaming ZIP...`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${username.trim()}_images.zip"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to create ZIP: ' + err.message });
        }
      });

      archive.pipe(res);
      archive.directory(tmpDir, false);
      await archive.finalize();

      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    } catch (err) {
      console.error('Vercel download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed: ' + err.message });
      }
    }
    return;
  }

  const userKey = username.trim();
  const downloadsDir = path.join(__dirname, 'downloads', userKey);
  const zipPath = path.join(path.dirname(downloadsDir), `${userKey}_images.zip`);

  activeDownloads[userKey] = {
    status: 'downloading',
    current: 0,
    total: goods.length,
    downloaded: 0,
    failed: 0
  };

  // Clean up any old files from previous downloads
  try {
    if (fs.existsSync(downloadsDir)) {
      fs.rmSync(downloadsDir, { recursive: true, force: true });
    }
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
  } catch (err) {
    console.error('Failed to clean up old downloads directory:', err);
  }

  try {
    fs.mkdirSync(downloadsDir, { recursive: true });
  } catch (err) {
    activeDownloads[userKey] = { status: 'failed', error: 'Failed to create downloads directory: ' + err.message };
    return res.status(500).json({ error: 'Failed to create downloads directory: ' + err.message });
  }

  console.log(`Downloading images for user ${username}...`);
  
  res.json({
    success: true,
    message: 'Image download task started. Progress will be shown on the panel.',
    path: downloadsDir
  });

  // Background download task
  (async () => {
    let downloadedCount = 0;
    let failedCount = 0;

    const downloadFile = async (url, destPath, retries = 3, delay = 1000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': 'https://hk.hnzczy.cn/'
            }
          });
          
          const writer = fs.createWriteStream(destPath);
          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
          
          return; // Success, exit retry loop
        } catch (err) {
          if (attempt === retries) {
            throw err; // Reached max retries, throw the error
          }
          console.warn(`[Retry ${attempt}/${retries}] Failed download for ${url}: ${err.message}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };

    for (let i = 0; i < goods.length; i++) {
      const good = goods[i];
      const safeName = (good.goodsName || `product_${good.uuid}`).replace(/[\\/:*?"<>|]/g, '_').trim();
      const prefix = `${String(i + 1).padStart(3, '0')}_${safeName}`;

      const isValidImageUrl = (urlStr) => {
        try {
          const parsed = new URL(urlStr);
          if (parsed.pathname === '/' || parsed.pathname === '') return false;
          return true;
        } catch (e) {
          return false;
        }
      };

      // 1. Download main image
      if (good.goodsUrl && good.goodsUrl.startsWith('http') && isValidImageUrl(good.goodsUrl)) {
        const dest = path.join(downloadsDir, `${prefix}_main.png`);
        try {
          await downloadFile(good.goodsUrl, dest);
          downloadedCount++;
        } catch (e) {
          console.error(`Failed main image for ${good.goodsName} (URL: ${good.goodsUrl}):`, e.message);
          failedCount++;
        }
        // Small delay between downloads to prevent ECONNRESET / rate limiting
        await new Promise(r => setTimeout(r, 200));
      }

      // 2. Download intro image
      if (good.introduceUrl && good.introduceUrl.startsWith('http') && isValidImageUrl(good.introduceUrl)) {
        if (good.introduceUrl === good.goodsUrl) {
          const src = path.join(downloadsDir, `${prefix}_main.png`);
          const dest = path.join(downloadsDir, `${prefix}_intro.png`);
          try {
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dest);
              downloadedCount++;
            }
          } catch (e) {
            console.error(`Failed to copy duplicate image for ${good.goodsName}:`, e.message);
          }
        } else {
          const dest = path.join(downloadsDir, `${prefix}_intro.png`);
          try {
            await downloadFile(good.introduceUrl, dest);
            downloadedCount++;
          } catch (e) {
            console.error(`Failed intro image for ${good.goodsName} (URL: ${good.introduceUrl}):`, e.message);
            failedCount++;
          }
          // Small delay between downloads to prevent ECONNRESET / rate limiting
          await new Promise(r => setTimeout(r, 200));
        }
      }

      activeDownloads[userKey].current = i + 1;
      activeDownloads[userKey].downloaded = downloadedCount;
      activeDownloads[userKey].failed = failedCount;
    }

    console.log(`Image download complete. Creating ZIP archive...`);
    activeDownloads[userKey].status = 'zipping';

    if (fs.existsSync(zipPath)) {
      try { fs.unlinkSync(zipPath); } catch (e) {}
    }

    const { exec } = require('child_process');
    const cmd = `powershell -Command "Compress-Archive -Path '${downloadsDir}\\*' -DestinationPath '${zipPath}' -Force"`;

    exec(cmd, (zipErr) => {
      if (zipErr) {
        console.error('Failed to create ZIP archive:', zipErr);
        activeDownloads[userKey].status = 'failed';
        activeDownloads[userKey].error = 'Failed to create ZIP archive: ' + zipErr.message;
      } else {
        console.log(`ZIP created successfully at: ${zipPath}`);
        activeDownloads[userKey].status = 'completed';

        // Clean up unpacked folder
        try {
          fs.rmSync(downloadsDir, { recursive: true, force: true });
        } catch (rmErr) {
          console.error('Failed to remove unpacked directory:', rmErr);
        }

        // Open folder in Windows Explorer and select the ZIP file
        exec(`explorer.exe /select,"${zipPath}"`, (explorerErr) => {
          if (explorerErr && explorerErr.code !== 1) {
            console.error('Failed to open folder:', explorerErr);
          }
        });
      }
    });
  })().catch(err => {
    console.error('Background download failed:', err);
    activeDownloads[userKey].status = 'failed';
    activeDownloads[userKey].error = err.message;
  });
});

// 4b. Polling download task status endpoint
app.get('/api/download-status', (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'username parameter is required' });
  }
  const status = activeDownloads[username.trim()];
  if (!status) {
    return res.json({ status: 'idle' });
  }
  res.json(status);
});

// 4c. Download zip file endpoint
app.get('/api/download-zip', (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).send('username parameter is required');
  }
  const zipPath = path.join(__dirname, 'downloads', `${username.trim()}_images.zip`);
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, `${username.trim()}_images.zip`);
  } else {
    res.status(404).send('ZIP file not found or not yet created.');
  }
});

// 5. Export CSV endpoint
app.get('/api/export-csv', async (req, res) => {
  const { token, username } = req.query;
  if (!token) {
    return res.status(400).send('Authentication token is required');
  }

  const userLabel = username ? username.trim() : 'export';

  let allGoods = [];
  let pageNo = 1;
  const pageSize = 100;
  let totalCount = 0;

  try {
    do {
      const url = `${BASE_URL}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=${pageSize}&pageNo=${pageNo}&cateUuid=&likeCode=&accout=&goodsStat=&feeStart=&feeEnd=`;
      const qauth = getQAuthorization();
      const headers = {
        'authorization': token,
        'qauthorization': qauth,
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      const response = await axios.get(url, { headers });
      
      if (response.data && response.data.result === 'true') {
        const goodsPage = response.data.data ? response.data.data.data : [];
        allGoods = allGoods.concat(goodsPage);
        totalCount = response.data.pageBean ? response.data.pageBean.pageDataCount : 0;
        if (goodsPage.length === 0 || allGoods.length >= totalCount) {
          break;
        }
        pageNo++;
      } else {
        throw new Error(response.data ? response.data.resultDesc : 'Failed to query goods');
      }
    } while (allGoods.length < totalCount);

    const headersList = [
      'Product ID',
      'Name',
      'Barcode',
      'Category',
      'Retail Price',
      'Cost Price',
      'Brand',
      'Specs',
      'Main Image URL',
      'Intro Image URL',
      'Enabled'
    ];

    const rows = allGoods.map(g => [
      g.uuid || '',
      `"${(g.goodsName || '').replace(/"/g, '""')}"`,
      `"${(g.goodsCode || '').replace(/"/g, '""')}"`,
      `"${(g.customName || 'General').replace(/"/g, '""')}"`,
      g.goodsPrice || 0,
      g.costPrice || 0,
      `"${(g.brand || '').replace(/"/g, '""')}"`,
      `"${(g.specsDesc || '').replace(/"/g, '""')}"`,
      g.goodsUrl || '',
      g.introduceUrl || '',
      g.goodsStat || 1
    ]);

    const csvContent = [
      headersList.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const bom = Buffer.from('\uFEFF', 'utf-8');
    const csvBuffer = Buffer.concat([bom, Buffer.from(csvContent, 'utf-8')]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="goods_export_${userLabel}_${Date.now()}.csv"`);
    return res.send(csvBuffer);

  } catch (err) {
    console.error('CSV Export error:', err.message);
    return res.status(500).send('Failed to export goods to CSV: ' + err.message);
  }
});

module.exports = app;

