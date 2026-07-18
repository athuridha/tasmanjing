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

// 1. Login endpoint
async function login(userAccount, userPwd, type) {
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

  const response = await axios.post(url, payload, { headers });
  
  if (response.data && response.data.result === 'true') {
    const token = response.headers['authorization'];
    return {
      success: true,
      token: token,
      user: response.data.data
    };
  } else {
    throw new Error(response.data ? response.data.resultDesc : 'Login failed');
  }
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
      const goodsPage = response.data.data ? response.data.data.data : [];
      allGoods = allGoods.concat(goodsPage);
      
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

  return {
    success: true,
    total: allGoods.length,
    goods: allGoods
  };
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
  const cleanName = name ? name.trim().toLowerCase() : '';
  const cleanBarcode = barcode ? barcode.trim() : '';

  const qauth = getQAuthorization();
  const headers = {
    'authorization': token,
    'qauthorization': qauth,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  // 1. Try to search by name first
  if (cleanName) {
    const urlByName = `${BASE_URL}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=100&pageNo=1&cateUuid=&likeCode=${encodeURIComponent(name.trim())}&accout=&goodsStat=&feeStart=&feeEnd=`;
    try {
      const response = await axios.get(urlByName, { headers });
      if (response.data && response.data.result === 'true') {
        const list = response.data.data ? response.data.data.data : [];
        const matched = list.find(g => 
          (g.goodsName && g.goodsName.trim().toLowerCase() === cleanName) ||
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
          (g.goodsName && g.goodsName.trim().toLowerCase() === cleanName)
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

      const response = await axios.put(url, payload, { headers });

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

    // If product does NOT exist in target and we only want to sync prices
    if (mode === 'price') {
      console.log(`Product "${good.goodsName}" does not exist in target. Skipping (mode: price).`);
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

module.exports = {
  login,
  fetchGoods,
  syncItem,
  exportCsv,
  getCategories,
  createCategory
};
