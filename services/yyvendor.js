const axios = require('axios');
const FormData = require('form-data');
const common = require('./common');

const BASE_URL = 'https://www.yyvendor.com/service/storeops';

// Helper: Format phone number for YYVendor login (+0811... or +62...)
function formatPhone(userAccount) {
  const clean = userAccount.trim();
  if (clean.startsWith('+')) return clean;
  return `+${clean}`;
}

// 1. Login endpoint
async function login(userAccount, userPwd) {
  const url = `${BASE_URL}/admin/login`;
  const formattedPhone = formatPhone(userAccount);

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  try {
    console.log(`[YYVendor] Attempting login for phone: ${formattedPhone}...`);
    let response = await axios.post(url, { phone: formattedPhone, password: userPwd.trim() }, { headers });

    // If formatted phone failed, try raw userAccount
    if (response.data && response.data.code !== 200) {
      console.log(`[YYVendor] Retry login with raw phone: ${userAccount.trim()}...`);
      response = await axios.post(url, { phone: userAccount.trim(), password: userPwd.trim() }, { headers });
    }

    if (response.data && response.data.code === 200 && response.data.data) {
      const { tokenHeader, token } = response.data.data;
      const fullToken = `${tokenHeader} ${token}`;
      return {
        success: true,
        token: fullToken,
        user: response.data.data
      };
    } else {
      throw new Error(response.data ? response.data.msg : 'Login failed on YYVendor');
    }
  } catch (err) {
    if (err.response && err.response.data) {
      throw new Error(err.response.data.msg || 'Login failed on YYVendor');
    }
    throw err;
  }
}

// 2. Fetch all goods endpoint
async function fetchGoods(token) {
  const url = `${BASE_URL}/commodity/listAll`;
  const headers = {
    'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  console.log('[YYVendor] Fetching all commodities...');
  const response = await axios.get(url, { headers });

  if (response.data && response.data.code === 200) {
    const commodities = response.data.data || [];
    console.log(`[YYVendor] Fetched ${commodities.length} commodities.`);

    const formattedGoods = commodities.map(c => ({
      goodsUuid: String(c.unionId),
      goodsName: c.commodityName || 'Unnamed Product',
      goodsPrice: c.commodityPrice !== undefined ? c.commodityPrice : 0,
      costPrice: c.commodityCost !== undefined ? c.commodityCost : 0,
      goodsUrl: c.commodityPic || '',
      goodsDesc: c.commodityDesc || '',
      cateUuid: c.firstCategoryUnionId || c.mainCategoryUnionId || '',
      categoryName: c.firstCategoryName || c.mainCategoryName || 'ALL',
      goodsCode: String(c.unionId),
      membersPrice: c.commodityPrice || 0,
      raw: c
    }));

    return {
      success: true,
      goods: formattedGoods,
      data: formattedGoods,
      total: formattedGoods.length
    };
  } else {
    throw new Error(response.data ? response.data.msg : 'Failed to fetch commodities from YYVendor');
  }
}

// 3. Upload Image to YYVendor
async function uploadCommodityPicture(token, imageUrl) {
  if (!imageUrl) return '';
  if (imageUrl.includes('yyvendor.com/files/')) return imageUrl;

  try {
    console.log('[YYVendor] Uploading image from URL:', imageUrl);
    const imgRes = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const form = new FormData();
    const contentType = imgRes.headers['content-type'] || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';

    form.append('file', Buffer.from(imgRes.data), {
      filename: `product_${Date.now()}.${ext}`,
      contentType: contentType
    });

    const uploadUrl = `${BASE_URL}/commodity/uploadCommodityPicture`;
    const headers = {
      'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      ...form.getHeaders()
    };

    const res = await axios.post(uploadUrl, form, { headers });
    if (res.data && res.data.code === 200 && res.data.data) {
      console.log('[YYVendor] Uploaded image successfully:', res.data.data);
      return res.data.data;
    }
  } catch (err) {
    console.error('[YYVendor] Image upload failed, falling back to original URL:', err.message);
  }
  return imageUrl;
}

// 4. Fetch Categories
async function getYyvendorCategories(token) {
  const url = `${BASE_URL}/category/listWithChildren`;
  const headers = {
    'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0'
  };

  try {
    const res = await axios.get(url, { headers });
    if (res.data && res.data.code === 200 && Array.isArray(res.data.data)) {
      const categories = [];
      function extractNodes(nodes) {
        for (const n of nodes) {
          if (n.className && n.unionId && n.unionId !== '0') {
            categories.push({
              id: String(n.unionId),
              name: n.className,
              businessType: 'Retail Sector'
            });
          }
          if (n.children && Array.isArray(n.children)) {
            extractNodes(n.children);
          }
        }
      }
      extractNodes(res.data.data);
      return categories;
    }
  } catch (err) {
    console.error('[YYVendor] Failed to fetch categories:', err.message);
  }
  return [];
}

// 5. Create Category
async function createYyvendorCategory(token, categoryName) {
  const url = `${BASE_URL}/category/create`;
  const headers = {
    'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0'
  };

  try {
    const res = await axios.post(url, { className: categoryName.trim(), type: 0 }, { headers });
    if (res.data && res.data.code === 200) {
      return res.data;
    }
  } catch (err) {
    console.error('[YYVendor] Failed to create category:', err.message);
  }
  return null;
}

// 6. Sync single item to YYVendor
async function syncItem(targetToken, good, mode = 'copy', targetCategory = '') {
  const headers = {
    'Authorization': targetToken.startsWith('Bearer ') ? targetToken : `Bearer ${targetToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0'
  };

  // Check if product already exists on target
  console.log(`[YYVendor] Checking if product "${good.goodsName}" exists...`);
  const listUrl = `${BASE_URL}/commodity/listAll`;
  const listRes = await axios.get(listUrl, { headers });
  let existingProduct = null;

  if (listRes.data && listRes.data.code === 200 && Array.isArray(listRes.data.data)) {
    existingProduct = listRes.data.data.find(c => 
      c.commodityName.trim().toLowerCase() === good.goodsName.trim().toLowerCase() ||
      (good.goodsUuid && String(c.unionId) === String(good.goodsUuid))
    );
  }

  // Delete existing if replacing
  if (existingProduct && existingProduct.unionId) {
    console.log(`[YYVendor] Product "${good.goodsName}" already exists (${existingProduct.unionId}). Re-creating...`);
    try {
      await axios.get(`${BASE_URL}/commodity/delete/${existingProduct.unionId}`, { headers });
    } catch (e) {
      console.warn(`[YYVendor] Failed to remove existing product:`, e.message);
    }
  }

  // Upload picture if URL is provided
  let uploadedPicUrl = good.goodsUrl || '';
  if (uploadedPicUrl) {
    uploadedPicUrl = await uploadCommodityPicture(targetToken, uploadedPicUrl);
  }

  // Determine category unionId
  let categoryUnionId = targetCategory || '0';
  if (!categoryUnionId || categoryUnionId === 'Default Categories') {
    categoryUnionId = '0';
  }

  const payload = {
    commodityName: good.goodsName.trim(),
    commodityDesc: good.goodsDesc || '',
    commodityPrice: Number(good.goodsPrice) || 0,
    commodityCost: Number(good.costPrice) || 0,
    commodityPic: uploadedPicUrl,
    mainCategoryUnionId: '0',
    firstCategoryUnionId: categoryUnionId
  };

  console.log(`[YYVendor] Creating product "${good.goodsName}" with payload:`, payload);
  const createUrl = `${BASE_URL}/commodity/create`;
  const response = await axios.post(createUrl, payload, { headers });

  if (response.data && response.data.code === 200) {
    return {
      success: true,
      status: 'synced',
      message: `Successfully synced "${good.goodsName}" to YYVendor`
    };
  } else {
    throw new Error(response.data ? response.data.msg : 'Failed to create commodity on YYVendor');
  }
}

module.exports = {
  login,
  fetchGoods,
  syncItem,
  getYyvendorCategories,
  createYyvendorCategory
};
