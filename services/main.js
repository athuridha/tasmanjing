const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://www.hnzczy.cn/ms1';

const SYSTEM_CATEGORIES = {
  'bread': 36777,
  'energy drink': 35432,
  'noodles': 35431,
  'isotonic water': 35430,
  'health drink': 35429,
  'milk': 35428,
  'tea': 35427,
  'mineral water': 35426,
  'carbon drink': 35425,
  'coffee': 35424,
  'snacks': 35260
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

// 1. Login endpoint with multi-domain fallback (hk.hnzczy.cn & www.hnzczy.cn)
async function login(userAccount, userPwd, type) {
  const baseUrls = ['https://hk.hnzczy.cn/ms1', 'https://www.hnzczy.cn/ms1'];
  let lastError = null;

  for (const baseUrl of baseUrls) {
    const url = `${baseUrl}/sys/login`;
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
      const response = await axios.post(url, payload, { headers, timeout: 10000 });
      if (response.data && (response.data.result === 'true' || response.data.statusCode === 0)) {
        const token = response.headers['authorization'];
        return {
          success: true,
          token: token,
          user: response.data.data
        };
      } else if (response.data && response.data.resultDesc) {
        lastError = new Error(response.data.resultDesc);
      }
    } catch (err) {
      console.warn(`[Login] Failed on ${baseUrl}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('Login failed');
}

// 2. Fetch all goods endpoint (with automatic pagination)
async function fetchGoods(token, type) {
  let allGoods = [];
  let pageNo = 1;
  const pageSize = 100;
  let totalCount = 0;

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
      const rawData = response.data.data;
      let goodsPage = [];
      if (Array.isArray(rawData)) {
        goodsPage = rawData;
      } else if (rawData && Array.isArray(rawData.data)) {
        goodsPage = rawData.data;
      } else if (rawData && Array.isArray(rawData.list)) {
        goodsPage = rawData.list;
      } else if (rawData && Array.isArray(rawData.records)) {
        goodsPage = rawData.records;
      }
      allGoods = allGoods.concat(goodsPage);
      
      totalCount = response.data.pageBean ? (response.data.pageBean.pageDataCount || response.data.pageBean.totalCount || 0) : allGoods.length;
      console.log(`Page ${pageNo} returned ${goodsPage.length} items. Total count reported: ${totalCount}`);
      
      if (goodsPage.length === 0 || (totalCount > 0 && allGoods.length >= totalCount)) {
        break;
      }
      pageNo++;
    } else {
      throw new Error(response.data ? response.data.resultDesc : 'Failed to query goods');
    }
  } while (allGoods.length < totalCount);

  return {
    success: true,
    total: allGoods.length,
    goods: allGoods
  };
}

// Helper: Extract list of goods safely from various SANY POS response structures
function extractGoodsList(rawData) {
  if (!rawData) return [];
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData.data)) return rawData.data;
  if (Array.isArray(rawData.list)) return rawData.list;
  if (Array.isArray(rawData.records)) return rawData.records;
  if (rawData.data && Array.isArray(rawData.data.data)) return rawData.data.data;
  if (rawData.data && Array.isArray(rawData.data.list)) return rawData.data.list;
  return [];
}

// Helper: Query custom categories of an account
async function getCategories(token) {
  try {
    const url = `${BASE_URL}/commcustomcategory/querycommcustomcategory?customType=2`;
    const qauth = getQAuthorization();
    const headers = {
      'authorization': token,
      'qauthorization': qauth,
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const response = await axios.get(url, { headers });
    if (response.data && (response.data.statusCode === '0' || response.data.statusCode === 0 || response.data.result === 'true')) {
      return response.data.data || [];
    }
  } catch (err) {
    console.error('Failed to query categories:', err.message);
  }
  return [];
}

// Helper: Create custom category
async function createCategory(token, typeName) {
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
    machineUuid: '155',
    typeName: typeName,
    typeRemark: ''
  };

  const response = await axios.post(url, payload, { headers });
  if (response.data && response.data.result === 'true') {
    return response.data.data;
  } else {
    throw new Error(response.data ? response.data.resultDesc : 'Failed to create category');
  }
}

// Helper: Check if product exists in target account by barcode or name (robust check to avoid duplicates)
async function findProductInTarget(token, barcode, name) {
  const cleanName = name ? common.normalizeName(name) : '';
  const cleanBarcode = barcode ? String(barcode).trim() : '';

  const qauth = getQAuthorization();
  const headers = {
    'authorization': token,
    'qauthorization': qauth,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  // 1. Search by barcode first (most reliable unique key)
  if (cleanBarcode) {
    const urlByBarcode = `${BASE_URL}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=200&pageNo=1&cateUuid=&likeCode=${encodeURIComponent(cleanBarcode)}&accout=&goodsStat=&feeStart=&feeEnd=`;
    try {
      const response = await axios.get(urlByBarcode, { headers });
      if (response.data && response.data.result === 'true') {
        const list = extractGoodsList(response.data.data);
        const matched = list.find(g => 
          (g.goodsCode && String(g.goodsCode).trim() === cleanBarcode) ||
          (g.goodsName && common.normalizeName(g.goodsName) === cleanName)
        );
        if (matched) return matched;
      }
    } catch (err) {
      console.error('Error querying target goods by barcode:', err.message);
    }
  }

  // 2. Search by full name
  if (name && name.trim()) {
    const urlByName = `${BASE_URL}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=200&pageNo=1&cateUuid=&likeCode=${encodeURIComponent(name.trim())}&accout=&goodsStat=&feeStart=&feeEnd=`;
    try {
      const response = await axios.get(urlByName, { headers });
      if (response.data && response.data.result === 'true') {
        const list = extractGoodsList(response.data.data);
        const matched = list.find(g => 
          (g.goodsName && common.normalizeName(g.goodsName) === cleanName) ||
          (cleanBarcode && g.goodsCode && String(g.goodsCode).trim() === cleanBarcode)
        );
        if (matched) return matched;
      }
    } catch (err) {
      console.error('Error querying target goods by name:', err.message);
    }

    // 3. Search by first word of product name as fallback
    const firstWord = name.trim().split(/\s+/)[0];
    if (firstWord && firstWord.length >= 2 && firstWord !== name.trim()) {
      const urlByFirstWord = `${BASE_URL}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=200&pageNo=1&cateUuid=${encodeURIComponent(firstWord)}&accout=&goodsStat=&feeStart=&feeEnd=`;
      try {
        const response = await axios.get(urlByFirstWord, { headers });
        if (response.data && response.data.result === 'true') {
          const list = extractGoodsList(response.data.data);
          const matched = list.find(g => 
            (g.goodsName && common.normalizeName(g.goodsName) === cleanName) ||
            (cleanBarcode && g.goodsCode && String(g.goodsCode).trim() === cleanBarcode)
          );
          if (matched) return matched;
        }
      } catch (err) {
        console.error('Error querying target goods by first word:', err.message);
      }
    }
  }

  return null;
}

// Helper to update product with POST / PUT fallback
async function sendUpdateCommCustomGoods(url, payload, headers) {
  try {
    return await axios.post(url, payload, { headers });
  } catch (err) {
    console.warn(`[VM Putih] POST to ${url} failed (${err.message}). Retrying with PUT...`);
    return await axios.put(url, payload, { headers });
  }
}

// 3. Sync single item endpoint
async function syncItem(targetToken, good, mode) {
  try {
    // Check if product already exists in target
    console.log(`Checking if "${good.goodsName}" exists in target...`);
    const existingProduct = await findProductInTarget(targetToken, good.goodsCode, good.goodsName);

    // If product exists in target
    if (existingProduct) {
      if (mode === 'copy') {
        console.log(`Product "${good.goodsName}" (Barcode: ${good.goodsCode || 'none'}) already exists in target. Skipping (mode: copy).`);
        return {
          success: true,
          status: 'skipped',
          message: 'Product already exists in target'
        };
      }

      if (mode === 'image') {
        const sourceUrl = (good.goodsUrl || '').trim();
        if (!sourceUrl) {
          return {
            success: true,
            status: 'skipped',
            message: 'Source product has no image URL'
          };
        }
        if (existingProduct.goodsUrl === sourceUrl) {
          return {
            success: true,
            status: 'skipped',
            message: 'Image already matches'
          };
        }

        console.log(`Updating image for "${good.goodsName}" in target...`);
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
          goodsUrl: sourceUrl,
          introduceUrl: sourceUrl
        };

        const response = await sendUpdateCommCustomGoods(url, payload, headers);
        if (response.data && response.data.result === 'true') {
          return {
            success: true,
            status: 'synced',
            message: 'Successfully updated product image'
          };
        } else {
          throw new Error(response.data ? response.data.resultDesc : 'Failed to update product image');
        }
      }

      // Check if price matches
      const isPriceMatch = 
        existingProduct.goodsPrice === good.goodsPrice &&
        existingProduct.costPrice === good.costPrice &&
        existingProduct.membersPrice === good.membersPrice;

      if (isPriceMatch) {
        console.log(`Prices already match for "${good.goodsName}" (${good.goodsPrice} / ${good.costPrice}).`);
        return {
          success: true,
          status: 'skipped',
          message: 'Prices already match'
        };
      }

      // We need to update the price in the target account
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
        goodsPrice: good.goodsPrice,
        costPrice: good.costPrice,
        membersPrice: good.membersPrice || 0
      };

      const response = await sendUpdateCommCustomGoods(url, payload, headers);

      if (response.data && response.data.result === 'true') {
        console.log(`Successfully updated prices for "${good.goodsName}"`);
        return {
          success: true,
          status: 'synced',
          message: `Updated price to ${good.goodsPrice}`
        };
      } else {
        throw new Error(response.data ? response.data.resultDesc : 'Failed to update product prices');
      }
    }

    // If product does NOT exist in target and we only want to sync prices or images
    if (mode === 'price' || mode === 'image') {
      console.log(`Product "${good.goodsName}" does not exist in target. Skipping (mode: ${mode}).`);
      return {
        success: true,
        status: 'skipped',
        message: 'Product does not exist in target'
      };
    }

    // Step 1: Match or Create Category in Main Portal
    console.log(`Syncing "${good.goodsName}" - Checking categories...`);
    const categoryName = (good.customName || 'General').trim();
    const categoryKey = categoryName.toLowerCase();
    let targetCateUuid = "";

    // Check if it's a global system category first
    if (SYSTEM_CATEGORIES[categoryKey]) {
      targetCateUuid = SYSTEM_CATEGORIES[categoryKey];
      console.log(`Using global system category match for "${categoryName}" -> UUID: ${targetCateUuid}`);
    } else {
      console.log(`Checking custom categories for "${categoryName}" on target...`);
      const categories = await getCategories(targetToken);
      console.log(`Target categories retrieved:`, JSON.stringify(categories));
      
      let matchedCategory = categories.find(c => 
        c.typeName && c.typeName.trim().toLowerCase() === categoryKey
      );

      if (matchedCategory) {
        targetCateUuid = matchedCategory.cateUuid || matchedCategory.uuid;
        console.log(`Found category match: "${categoryName}" -> UUID: ${targetCateUuid}`);
      } else {
        console.log(`Category "${categoryName}" not found in target categories. Creating it...`);
        try {
          await createCategory(targetToken, categoryName);
          // Refetch categories to get the newly created uuid
          const updatedCategories = await getCategories(targetToken);
          matchedCategory = updatedCategories.find(c => 
            c.typeName && c.typeName.trim().toLowerCase() === categoryKey
          );
          if (matchedCategory) {
            targetCateUuid = matchedCategory.cateUuid || matchedCategory.uuid;
            console.log(`Created category: "${categoryName}" -> UUID: ${targetCateUuid}`);
          } else {
            console.log(`Category created but not found in refetched list. Proceeding with empty category.`);
          }
        } catch (catErr) {
          console.error(`Failed to create category "${categoryName}":`, catErr.message);
          console.log(`Proceeding to sync product "${good.goodsName}" with empty category.`);
        }
      }
    }

    // Step 3: Insert Product in Main Portal
    console.log(`Inserting product "${good.goodsName}" into target...`);
    const url = `${BASE_URL}/commcustomgoods/addcommcustomgoods`;
    const qauth = getQAuthorization();
    const headers = {
      'Content-Type': 'application/json',
      'authorization': targetToken,
      'qauthorization': qauth,
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const payload = {
      goodsTypeStr: 2,
      machineUuid: '155',
      cateUuid: targetCateUuid,
      goodsName: good.goodsName,
      goodsCode: good.goodsCode || '',
      goodsPrice: good.goodsPrice,
      membersPrice: good.membersPrice || 0,
      costPrice: good.costPrice,
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

    const response = await axios.post(url, payload, { headers });
    
    if (response.data && response.data.result === 'true') {
      console.log(`Successfully synced "${good.goodsName}"`);
      return {
        success: true,
        status: 'synced',
        message: 'Successfully synchronized product'
      };
    } else {
      throw new Error(response.data ? response.data.resultDesc : 'Failed to add product');
    }

  } catch (err) {
    console.error(`Error syncing "${good.goodsName}":`, err.message);
    throw err;
  }
}

// 4. Export CSV
async function exportCsv(token) {
  let allGoods = [];
  let pageNo = 1;
  const pageSize = 100;
  let totalCount = 0;

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

  return allGoods;
}

// 5. VM Putih Sales Report endpoint (supporting hk.hnzczy.cn peopleOrder list)
async function fetchSalesReport(token, dateStr) {
  try {
    const qauth = getQAuthorization();
    const headers = {
      'authorization': token,
      'qauthorization': qauth,
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const today = dateStr || new Date().toISOString().split('T')[0];
    const startTime = `${today} 00:00:00`;
    const endTime = `${today} 23:59:59`;

    const baseUrls = ['https://hk.hnzczy.cn/ms1', 'https://www.hnzczy.cn/ms1'];
    let salesData = [];
    let machines = [];

    for (const baseUrl of baseUrls) {
      // 1. Try peopleOrder query order list
      try {
        const orderUrl = `${baseUrl}/sysorder/querysysorderlist?pageNo=1&pageSize=1000&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&startDate=${today}&endDate=${today}`;
        const response = await axios.get(orderUrl, { headers, timeout: 10000 });
        if (response.data && (response.data.result === 'true' || response.data.statusCode === 0)) {
          const raw = response.data.data;
          const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.records) ? raw.records : (raw && Array.isArray(raw.list) ? raw.list : []));
          if (list.length > 0) {
            salesData = list;
            break;
          }
        }
      } catch (e) {
        console.warn(`[peopleOrder] Could not query ${baseUrl}/sysorder/querysysorderlist:`, e.message);
      }

      // 2. Try sysorderstat endpoint
      if (salesData.length === 0) {
        try {
          const orderStatUrl = `${baseUrl}/sysorder/querysysorderstat?startDate=${today}&endDate=${today}`;
          const response = await axios.get(orderStatUrl, { headers, timeout: 10000 });
          if (response.data && (response.data.result === 'true' || response.data.statusCode === 0)) {
            const raw = response.data.data;
            const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.records) ? raw.records : []);
            if (list.length > 0) {
              salesData = list;
              break;
            }
          }
        } catch (e) {
          console.warn(`[peopleOrder] Could not query ${baseUrl}/sysorder/querysysorderstat:`, e.message);
        }
      }
    }

    // Also fetch machine list status
    for (const baseUrl of baseUrls) {
      try {
        const machineUrl = `${baseUrl}/machine/querymachinelist?pageNo=1&pageSize=500`;
        const response = await axios.get(machineUrl, { headers, timeout: 10000 });
        if (response.data && (response.data.result === 'true' || response.data.statusCode === 0)) {
          const raw = response.data.data;
          machines = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.records) ? raw.records : []);
          if (machines.length > 0) break;
        }
      } catch (e) {
        console.warn(`Could not query machine list from ${baseUrl}:`, e.message);
      }
    }

    return {
      success: true,
      date: today,
      machines,
      salesData
    };
  } catch (err) {
    console.error('Error fetching sales report:', err.message);
    throw err;
  }
}

module.exports = {
  login,
  fetchGoods,
  syncItem,
  exportCsv,
  getCategories,
  createCategory,
  fetchSalesReport
};
