const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const os = require('os');

const mainService = require('./services/main');
const itspcService = require('./services/itspc');
const grabotechService = require('./services/grabotech');
const common = require('./services/common');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;
const activeDownloads = {};

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

  try {
    if (type === 'grabotech') {
      const { sessionCookie, vifCode } = req.body;
      const result = await grabotechService.login(userAccount, userPwd, sessionCookie, vifCode);
      return res.json(result);
    }
    if (type === 'itspc') {
      const result = await itspcService.login(userAccount, userPwd);
      return res.json(result);
    }
    const result = await mainService.login(userAccount, userPwd, type);
    return res.json(result);
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

// 2. Fetch all goods endpoint
app.post('/api/goods', async (req, res) => {
  const { token, type = 'main' } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Authentication token is required' });
  }

  try {
    if (type === 'grabotech') {
      const result = await grabotechService.fetchGoods(token);
      return res.json(result);
    }
    if (type === 'itspc') {
      const result = await itspcService.fetchGoods(token);
      return res.json(result);
    }
    const result = await mainService.fetchGoods(token, type);
    return res.json(result);
  } catch (err) {
    console.error('Fetch goods error:', err.message);
    return res.status(err.status || 500).json({
      success: false,
      error: err.message
    });
  }
});

// 3. Sync single item endpoint
app.post('/api/sync-item', async (req, res) => {
  const { targetToken, targetUserUuid, good, mode = 'copy', targetType = 'main' } = req.body;
  if (!targetToken || !good) {
    return res.status(400).json({ error: 'targetToken and good object are required' });
  }

  try {
    if (targetType === 'grabotech') {
      const result = await grabotechService.syncItem(targetToken, good, mode);
      return res.json(result);
    }
    if (targetType === 'itspc') {
      const result = await itspcService.syncItem(targetToken, targetUserUuid, good, mode);
      return res.json(result);
    }
    const result = await mainService.syncItem(targetToken, good, mode, targetType);
    return res.json(result);
  } catch (err) {
    console.error(`Error syncing "${good.goodsName}":`, err.message);
    return res.status(err.status || 500).json({
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
  const { token, username, type = 'main' } = req.query;
  if (!token) {
    return res.status(400).send('Authentication token is required');
  }

  const userLabel = username ? username.trim() : 'export';

  try {
    const allGoods = await mainService.exportCsv(token, type);

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

