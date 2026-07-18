const axios = require('axios');
const common = require('./common');

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

// Helper: Check if product already exists in target
async function findProductInTarget(token, barcode, name) {
  const cleanName = name ? name.trim().toLowerCase() : '';
  const cleanBarcode = barcode ? barcode.trim() : '';

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
            (sub.goodsName && common.normalizeName(sub.goodsName) === common.normalizeName(name)) ||
            (info.goodsName && common.normalizeName(info.goodsName) === common.normalizeName(name))
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

// 1. Login
async function login(userAccount, userPwd) {
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

  const response = await axios.post(url, payload, { headers });
  if (response.data && response.data.code === 200) {
    const token = response.data.data.token;
    return {
      success: true,
      token: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      user: {
        userAccount: userAccount,
        contactMan: userAccount,
        email: '-',
        type: 'itspc'
      }
    };
  } else {
    const err = new Error(response.data ? response.data.msg : 'Login failed');
    err.status = 401;
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

      if (rows.length === 0 || allGoods.length >= totalCount) {
        break;
      }
      pageNo++;
    } else {
      throw new Error(response.data ? response.data.msg : 'Failed to query ITSPC goods');
    }
  } while (allGoods.length < totalCount);

  return {
    success: true,
    total: allGoods.length,
    goods: allGoods
  };
}

// 3. Sync Item
async function syncItem(targetToken, targetUserUuid, good, mode) {
  const categoryName = (good.customName || 'General').trim();
  const categoryKey = categoryName.toLowerCase();
  let targetCategoryId = 5537;
  let targetCategoryName = "อื่นๆ L (Non-Food & Drink)";

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
  let customCategoryName = categoryName;
  let customCategoryId = null;
  console.log(`Resolving ITSPC Custom Category for "${customCategoryName}"...`);
  try {
    const cats = await getItspcCategories(targetToken, targetUserUuid);
    let matched = cats.find(c => c.categoryName && c.categoryName.trim().toLowerCase() === categoryKey);
    if (matched) {
      customCategoryId = matched.id;
      console.log(`Found existing ITSPC custom category: "${customCategoryName}" -> ID: ${customCategoryId}`);
    } else {
      console.log(`ITSPC custom category "${customCategoryName}" not found. Setting categoryId to null for manual insertion.`);
    }
  } catch (err) {
    console.error('Error resolving ITSPC custom category:', err.message);
  }

  // Check if product already exists in target
  console.log(`Checking if "${good.goodsName}" exists in target...`);
  const existingProduct = await findProductInTarget(targetToken, good.goodsCode, good.goodsName);

  if (existingProduct) {
    const isPriceMatch = 
      existingProduct.goodsPrice === good.goodsPrice &&
      existingProduct.costPrice === good.costPrice &&
      existingProduct.membersPrice === good.membersPrice;

    const isCategoryMatch = existingProduct.goodsSubInfoVo && 
      String(existingProduct.goodsSubInfoVo.categoryId) === String(customCategoryId) &&
      existingProduct.goodsInfoVo && 
      String(existingProduct.goodsInfoVo.goodsCategoryId) === String(targetCategoryId);

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
      return { success: true, status: 'synced', message: `Updated price to ${good.goodsPrice}` };
    } else {
      throw new Error(response.data ? response.data.msg : 'Failed to update ITSPC product prices');
    }
  }

  if (mode === 'price') {
    return { success: true, status: 'skipped', message: 'Product does not exist in target' };
  }

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
          (r.goodsName && common.normalizeName(r.goodsName) === common.normalizeName(good.goodsName))
        );
      }
    } catch (ptErr) {
      console.error('Error querying Platform Goods Library:', ptErr.message);
    }
  }

  if (platformProduct) {
    console.log(`Product "${good.goodsName}" found in Platform Goods Library (ID: ${platformProduct.id}). Copying...`);
    const copyUrl = `https://sv.hnzczy.cn/machine/baseInfo/copyBql/${platformProduct.id}`;
    
    const copyResponse = await axios.get(copyUrl, { headers: copyHeaders });
    if (copyResponse.data && copyResponse.data.code === 200) {
      await new Promise(r => setTimeout(r, 2000));
      const copiedMerchantProduct = await findProductInTarget(targetToken, good.goodsCode, good.goodsName);
      
      if (copiedMerchantProduct) {
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
          return { success: true, status: 'synced', message: 'Copied and customized platform product' };
        } else {
          throw new Error(updateResponse.data ? updateResponse.data.msg : 'Failed to update copied product details');
        }
      } else {
        throw new Error('Copied product successfully but could not retrieve its IDs in merchant catalog');
      }
    } else {
      throw new Error(copyResponse.data ? copyResponse.data.msg : 'Failed to copy platform product');
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
    return { success: true, status: 'synced', message: 'Created new product in ITSPC from scratch' };
  } else {
    throw new Error(response.data ? response.data.msg : 'Failed to create product in ITSPC from scratch');
  }
}

module.exports = {
  login,
  fetchGoods,
  syncItem,
  getItspcCategories,
  createItspcCategory
};
