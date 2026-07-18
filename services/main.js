const axios = require('axios');
const FormData = require('form-data');
const common = require('./common');

const PIC_BASE_URL = 'http://pic.hnzczy.cn/';

const BASE_URL_MS1 = 'https://www.hnzczy.cn/ms1';
const BASE_URL_MS3 = 'https://www.hnzczy.cn/ms3';

function getBaseUrl(type) {
  if (type === 'main_ms3') {
    return BASE_URL_MS3;
  }
  return BASE_URL_MS1;
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

// Helper: Get target account machine UUID dynamically
async function getTargetMachineUuid(token, type = 'main') {
  try {
    const baseUrl = getBaseUrl(type);
    const url = `${baseUrl}/machineinfo/querymachineinfo?pageNum=1&pageSize=10`;
    const qauth = common.getQAuthorization();
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
async function getCategories(token, type = 'main') {
  const baseUrl = getBaseUrl(type);
  const url = `${baseUrl}/commcustomcategory/querycommcustomcategory?customType=2`;
  const qauth = common.getQAuthorization();
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
async function createCategory(token, typeName, machineUuid = '155', type = 'main') {
  const baseUrl = getBaseUrl(type);
  const url = `${baseUrl}/commcustomcategory/addcommcustomcategory`;
  const qauth = common.getQAuthorization();
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
    return response.data.data;
  } else {
    const desc = response.data ? response.data.resultDesc : 'Failed to create category';
    const err = new Error(desc);
    err.isDuplicate = desc && desc.includes('重复');
    throw err;
  }
}

// Helper: Upload an image to the target account
// Downloads from sourceUrl, re-uploads via /goods/excelfsdf, returns new pic.hnzczy.cn URL
async function uploadImage(token, sourceUrl, type = 'main') {
  if (!sourceUrl || !sourceUrl.startsWith('http')) return '';
  
  try {
    // Download the source image
    const imgResp = await axios.get(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
        'Referer': 'https://hk.hnzczy.cn/'
      }
    });
    const imgBuffer = Buffer.from(imgResp.data);
    
    // Upload to target account
    const form = new FormData();
    form.append('files', imgBuffer, {
      filename: `upload_${Date.now()}.png`,
      contentType: 'image/png'
    });
    
    const baseUrl = getBaseUrl(type);
    const uploadResp = await axios.post(`${baseUrl}/goods/excelfsdf`, form, {
      headers: {
        ...form.getHeaders(),
        'Content-Type': 'image/*',
        'authorization': token,
        'qauthorization': common.getQAuthorization(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    if (uploadResp.data && uploadResp.data.result === 'true') {
      const newUrl = PIC_BASE_URL + uploadResp.data.data;
      console.log(`  Image re-uploaded: ${newUrl}`);
      return newUrl;
    } else {
      console.error('  Image upload failed:', uploadResp.data);
      return sourceUrl; // Fallback to original URL
    }
  } catch (err) {
    console.error(`  Image upload error for ${sourceUrl}:`, err.message);
    return sourceUrl; // Fallback to original URL
  }
}

// Helper: Check if product already exists in target
async function findProductInTarget(token, barcode, name, targetType = 'main') {
  const cleanName = name ? name.trim().toLowerCase() : '';
  const cleanBarcode = barcode ? barcode.trim() : '';

  const baseUrl = getBaseUrl(targetType);
  const qauth = common.getQAuthorization();
  const headers = {
    'authorization': token,
    'qauthorization': qauth,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  // 1. Try to search by name first (lenient match)
  if (cleanName) {
    const urlByName = `${baseUrl}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=100&pageNo=1&cateUuid=&likeCode=${encodeURIComponent(name.trim())}&accout=&goodsStat=&feeStart=&feeEnd=`;
    try {
      const response = await axios.get(urlByName, { headers });
      if (response.data && response.data.result === 'true') {
        const list = response.data.data ? response.data.data.data : [];
        const matched = list.find(g => 
          (g.goodsName && common.normalizeName(g.goodsName) === common.normalizeName(name)) ||
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
    const urlByBarcode = `${baseUrl}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=100&pageNo=1&cateUuid=&likeCode=${encodeURIComponent(cleanBarcode)}&accout=&goodsStat=&feeStart=&feeEnd=`;
    try {
      const response = await axios.get(urlByBarcode, { headers });
      if (response.data && response.data.result === 'true') {
        const list = response.data.data ? response.data.data.data : [];
        const matched = list.find(g => 
          (g.goodsCode && g.goodsCode.trim() === cleanBarcode) ||
          (g.goodsName && common.normalizeName(g.goodsName) === common.normalizeName(name))
        );
        if (matched) return matched;
      }
    } catch (err) {
      console.error('Error querying target goods by barcode:', err.message);
    }
  }

  return null;
}

// 1. Login
async function login(userAccount, userPwd, type) {
  const baseUrl = getBaseUrl(type);
  const url = `${baseUrl}/sys/login`;
  const qauth = common.getQAuthorization();
  
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

  let response;
  let lastError;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const freshQauth = common.getQAuthorization();
      const currentHeaders = {
        ...headers,
        'qauthorization': freshQauth
      };
      response = await axios.post(url, payload, { headers: currentHeaders });
      break; // Success, break the loop
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        console.warn(`[Login Retry ${attempt}/${MAX_RETRIES}] Failed: ${err.message}. Retrying in 2 seconds...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  if (!response) {
    const err = new Error(lastError.message || 'Login failed');
    err.status = lastError.response ? lastError.response.status : 500;
    throw err;
  }
  
  if (response.data && response.data.result === 'true') {
    const token = response.headers['authorization'];
    return {
      success: true,
      token: token,
      user: response.data.data
    };
  } else {
    const err = new Error(response.data ? response.data.resultDesc : 'Login failed');
    err.status = 401;
    throw err;
  }
}

// 2. Fetch Goods
async function fetchGoods(token, type) {
  let allGoods = [];
  let pageNo = 1;
  const pageSize = 100;
  let totalCount = 0;

  // Fetch custom categories to map cateUuid to its typeName
  let categoryMap = {};
  try {
    const cats = await getCategories(token, type);
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

  const baseUrl = getBaseUrl(type);
  do {
    const url = `${baseUrl}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=${pageSize}&pageNo=${pageNo}&cateUuid=&likeCode=&accout=&goodsStat=&feeStart=&feeEnd=`;
    const qauth = common.getQAuthorization();
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
          type: type
        };
      });

      allGoods = allGoods.concat(mappedPage);
      totalCount = response.data.pageBean ? response.data.pageBean.pageDataCount : 0;
      
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

// 3. Sync single item
async function syncItem(targetToken, good, mode, targetType) {
  let targetCateUuid = "";
  let targetMachineUuid = "";

  const categoryName = (good.customName || 'General').trim();
  const categoryKey = categoryName.toLowerCase();
  targetMachineUuid = await getTargetMachineUuid(targetToken, targetType);
  
  console.log(`Checking custom categories for "${categoryName}" on target...`);
  let categories = [];
  try {
    const fetchedCats = await getCategories(targetToken, targetType);
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
      await createCategory(targetToken, categoryName, targetMachineUuid, targetType);
      const updatedCategories = await getCategories(targetToken, targetType);
      const refetchedList = Array.isArray(updatedCategories) ? updatedCategories : [];
      matchedCategory = refetchedList.find(c => 
        c.typeName && c.typeName.trim().toLowerCase() === categoryKey
      );
      if (matchedCategory) {
        targetCateUuid = matchedCategory.cateUuid || matchedCategory.uuid;
      }
    } catch (catErr) {
      console.error(`Failed to create category "${categoryName}":`, catErr.message);
      
      // If duplicate error, try to find the cateUuid from existing goods that use this category
      if (catErr.isDuplicate) {
        console.log(`Category "${categoryName}" already exists (duplicate). Searching existing goods for cateUuid...`);
        try {
          const baseUrl = getBaseUrl(targetType);
          const searchResp = await axios.get(
            `${baseUrl}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=100&pageNo=1&cateUuid=&likeCode=&accout=&goodsStat=&feeStart=&feeEnd=`,
            {
              headers: {
                'authorization': targetToken,
                'qauthorization': common.getQAuthorization(),
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            }
          );
          if (searchResp.data && searchResp.data.result === 'true' && searchResp.data.data && searchResp.data.data.data) {
            const existingGood = searchResp.data.data.data.find(g =>
              g.customName && g.customName.trim().toLowerCase() === categoryKey
            );
            if (existingGood && existingGood.cateUuid) {
              targetCateUuid = existingGood.cateUuid;
              console.log(`Found cateUuid ${targetCateUuid} from existing goods with category "${categoryName}"`);
            }
          }
        } catch (searchErr) {
          console.error('Failed to search existing goods for cateUuid:', searchErr.message);
        }
      }
    }

    // Final fallback: use SYSTEM_CATEGORIES only if nothing else worked
    if (!targetCateUuid && SYSTEM_CATEGORIES[categoryKey]) {
      targetCateUuid = SYSTEM_CATEGORIES[categoryKey];
      console.log(`Using system category fallback UUID: ${targetCateUuid}`);
    }
  }

  // Check if product already exists in target
  console.log(`Checking if "${good.goodsName}" exists in target...`);
  const existingProduct = await findProductInTarget(targetToken, good.goodsCode, good.goodsName, targetType);

  if (existingProduct) {
    const isPriceMatch = 
      existingProduct.goodsPrice === good.goodsPrice &&
      existingProduct.costPrice === good.costPrice &&
      existingProduct.membersPrice === good.membersPrice;

    const isCategoryMatch = String(existingProduct.cateUuid) === String(targetCateUuid);

    const isDetailsMatch = 
      (existingProduct.goodsName || '').trim() === (good.goodsName || '').trim() &&
      (existingProduct.goodsCode || '').trim() === (good.goodsCode || '').trim() &&
      (existingProduct.brand || '').trim() === (good.brand || '').trim() &&
      (existingProduct.specsDesc || '').trim() === (good.specsDesc || '').trim() &&
      (existingProduct.goodsUrl || '').trim() === (good.goodsUrl || '').trim() &&
      isCategoryMatch;

    if (mode === 'copy' && isDetailsMatch) {
      return { success: true, status: 'skipped', message: 'Details already match' };
    }
    if (mode === 'price' && isPriceMatch) {
      return { success: true, status: 'skipped', message: 'Prices already match' };
    }
    if (mode === 'both' && isPriceMatch && isCategoryMatch) {
      return { success: true, status: 'skipped', message: 'Prices and category already match' };
    }

    const applyCostPrice = mode === 'copy' ? existingProduct.costPrice : good.costPrice;
    const applySalePrice = mode === 'copy' ? existingProduct.goodsPrice : good.goodsPrice;
    const applyMemberPrice = mode === 'copy' ? existingProduct.membersPrice : (good.membersPrice || 0);

    // Re-upload images for update if source has images
    let newGoodsUrl = good.goodsUrl || '';
    let newIntroduceUrl = good.introduceUrl || '';
    if (mode !== 'price') {
      if (newGoodsUrl && newGoodsUrl.startsWith('http')) {
        console.log(`Re-uploading main image for "${good.goodsName}"...`);
        newGoodsUrl = await uploadImage(targetToken, newGoodsUrl, targetType);
      }
      if (newIntroduceUrl && newIntroduceUrl.startsWith('http')) {
        if (newIntroduceUrl === good.goodsUrl && newGoodsUrl !== good.goodsUrl) {
          // Same image, reuse the already-uploaded URL
          newIntroduceUrl = newGoodsUrl;
        } else {
          console.log(`Re-uploading intro image for "${good.goodsName}"...`);
          newIntroduceUrl = await uploadImage(targetToken, newIntroduceUrl, targetType);
        }
      }
    }

    console.log(`Updating prices for "${good.goodsName}" in target to match source...`);
    const baseUrl = getBaseUrl(targetType);
    const url = `${baseUrl}/commcustomgoods/updatecommcustomgoods`;
    const qauth = common.getQAuthorization();
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
      goodsUrl: newGoodsUrl,
      introduceUrl: newIntroduceUrl,
      goodsPrice: applySalePrice,
      costPrice: applyCostPrice,
      membersPrice: applyMemberPrice
    };

    const response = await axios.put(url, payload, { headers });
    if (response.data && response.data.result === 'true') {
      return { success: true, status: 'synced', message: `Updated price to ${good.goodsPrice}` };
    } else {
      throw new Error(response.data ? response.data.resultDesc : 'Failed to update product prices');
    }
  }

  if (mode === 'price') {
    return { success: true, status: 'skipped', message: 'Product does not exist in target' };
  }

  // Re-upload images before inserting
  let insertGoodsUrl = good.goodsUrl || '';
  let insertIntroduceUrl = good.introduceUrl || '';
  if (insertGoodsUrl && insertGoodsUrl.startsWith('http')) {
    console.log(`Re-uploading main image for "${good.goodsName}"...`);
    insertGoodsUrl = await uploadImage(targetToken, insertGoodsUrl, targetType);
  }
  if (insertIntroduceUrl && insertIntroduceUrl.startsWith('http')) {
    if (insertIntroduceUrl === good.goodsUrl && insertGoodsUrl !== good.goodsUrl) {
      insertIntroduceUrl = insertGoodsUrl;
    } else {
      console.log(`Re-uploading intro image for "${good.goodsName}"...`);
      insertIntroduceUrl = await uploadImage(targetToken, insertIntroduceUrl, targetType);
    }
  }

  console.log(`Inserting product "${good.goodsName}" into target...`);
  const baseUrl = getBaseUrl(targetType);
  const addUrl = `${baseUrl}/commcustomgoods/addcommcustomgoods`;

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
    goodsUrl: insertGoodsUrl,
    introduceUrl: insertIntroduceUrl,
    goodsDesc: good.goodsDesc || '',
    goodsServiceOpen: good.goodsServiceOpen || 0,
    goodsService: good.goodsService || '',
    goodsAttribute: good.goodsAttribute || ''
  };

  const MAX_INSERT_RETRIES = 3;
  let lastInsertError = 'Failed to add product';

  for (let attempt = 1; attempt <= MAX_INSERT_RETRIES; attempt++) {
    try {
      const freshQauth = common.getQAuthorization();
      const insertHeaders = {
        'Content-Type': 'application/json',
        'authorization': targetToken,
        'qauthorization': freshQauth,
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      const addResponse = await axios.post(addUrl, payload, { headers: insertHeaders });
      if (addResponse.data && addResponse.data.result === 'true') {
        return { success: true, status: 'synced', message: 'Successfully synchronized product' };
      }
      lastInsertError = addResponse.data ? addResponse.data.resultDesc : 'Failed to add product';
    } catch (axiosErr) {
      lastInsertError = axiosErr.message || 'Network error during insert';
    }

    if (attempt < MAX_INSERT_RETRIES) {
      const backoffMs = 2000 * attempt;
      await new Promise(r => setTimeout(r, backoffMs));
      const recheck = await findProductInTarget(targetToken, good.goodsCode, good.goodsName, targetType);
      if (recheck) {
        return { success: true, status: 'synced', message: 'Product verified as synced after re-check' };
      }
    }
  }

  throw new Error(lastInsertError);
}

// 4. Export CSV
async function exportCsv(token, type) {
  let allGoods = [];
  let pageNo = 1;
  const pageSize = 100;
  let totalCount = 0;

  const baseUrl = getBaseUrl(type);
  do {
    const url = `${baseUrl}/commcustomgoods/querycommcustomgoodslist?goodsTypeStr=2&pageSize=${pageSize}&pageNo=${pageNo}&cateUuid=&likeCode=&accout=&goodsStat=&feeStart=&feeEnd=`;
    const qauth = common.getQAuthorization();
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
  getTargetMachineUuid,
  createCategory,
  uploadImage
};
