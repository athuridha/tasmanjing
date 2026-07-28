import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Key, 
  ArrowsClockwise, 
  Play, 
  CheckCircle, 
  XCircle, 
  MagnifyingGlass, 
  Storefront, 
  Database, 
  Warning,
  Copy,
  Info,
  Trash,
  DownloadSimple,
  Image,
  Coins,
  Percent,
  Tag
} from '@phosphor-icons/react';

export default function App() {
  // Environment Detector for Vercel vs Local Laragon
  const isVercel = typeof window !== 'undefined' && (
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('vercel')
  );

  // Active Top Navigation Tab: 'sync' (Halaman Utama / Vercel layout) | 'excel' (Penyesuaian Harga Excel)
  const [activeNavTab, setActiveNavTab] = useState('sync');

  // --- SOURCE ACCOUNT STATE ---
  const [sourceType, setSourceType] = useState('main'); // 'main' (VM Oren), 'itspc' (VM Putih), 'grabotech' (Grabotech), 'yyvendor' (Yunyin)
  const [sourceAccount, setSourceAccount] = useState('');
  const [sourcePwd, setSourcePwd] = useState('');
  const [sourceToken, setSourceToken] = useState('');
  const [sourceUser, setSourceUser] = useState(null);
  const [isLoggingInSource, setIsLoggingInSource] = useState(false);
  const [sourceLoginError, setSourceLoginError] = useState('');

  // Source Captcha State
  const [sourceCaptchaUrl, setSourceCaptchaUrl] = useState('');
  const [sourceSessionCookie, setSourceSessionCookie] = useState('');
  const [sourceVifCode, setSourceVifCode] = useState('');

  const loadSourceCaptcha = async () => {
    try {
      const res = await fetch('/api/grabotech-captcha');
      const data = await res.json();
      if (data.success) {
        setSourceCaptchaUrl(data.captchaUrl);
        setSourceSessionCookie(data.phpSessionId);
      }
    } catch (e) {
      console.error('Failed to load source captcha', e);
    }
  };

  useEffect(() => {
    setSourceAccount('');
    setSourcePwd('');
    setSourceToken('');
    setSourceUser(null);
    setGoods([]);
    setOriginalGoods([]);
    setSourceCaptchaUrl('');
    setSourceSessionCookie('');
    setSourceVifCode('');
    if (sourceType === 'grabotech') {
      loadSourceCaptcha();
    }
  }, [sourceType]);

  // --- TARGET ACCOUNT STATE ---
  const [targetType, setTargetType] = useState('main'); // Default to VM Oren ('main')
  const [targetAccount, setTargetAccount] = useState('');
  const [targetPwd, setTargetPwd] = useState('');
  const [targetToken, setTargetToken] = useState('');
  const [targetUser, setTargetUser] = useState(null);
  const [isLoggingInTarget, setIsLoggingInTarget] = useState(false);
  const [targetLoginError, setTargetLoginError] = useState('');

  // Target Captcha State
  const [targetCaptchaUrl, setTargetCaptchaUrl] = useState('');
  const [targetSessionCookie, setTargetSessionCookie] = useState('');
  const [targetVifCode, setTargetVifCode] = useState('');

  const loadTargetCaptcha = async () => {
    try {
      const res = await fetch('/api/grabotech-captcha');
      const data = await res.json();
      if (data.success) {
        setTargetCaptchaUrl(data.captchaUrl);
        setTargetSessionCookie(data.phpSessionId);
      }
    } catch (e) {
      console.error('Failed to load target captcha', e);
    }
  };

  useEffect(() => {
    setTargetToken('');
    setTargetUser(null);
    setTargetGoods([]);
    setOriginalTargetGoods([]);
    setTargetCaptchaUrl('');
    setTargetSessionCookie('');
    setTargetVifCode('');
    if (targetType === 'grabotech') {
      loadTargetCaptcha();
    }
  }, [targetType]);

  // --- GOODS CATALOG STATE ---
  const [goods, setGoods] = useState([]);
  const [originalGoods, setOriginalGoods] = useState([]);
  const [isFetchingGoods, setIsFetchingGoods] = useState(false);
  const [goodsFetchError, setGoodsFetchError] = useState('');

  const [targetGoods, setTargetGoods] = useState([]);
  const [originalTargetGoods, setOriginalTargetGoods] = useState([]);
  const [isLoadingTargetGoods, setIsLoadingTargetGoods] = useState(false);

  const [activeCatalogTab, setActiveCatalogTab] = useState('source'); // 'source' or 'target'
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Search & Category Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Manual Price Adjustment
  const [priceAdjMethod, setPriceAdjMethod] = useState('margin_cost');
  const [priceAdjValue, setPriceAdjValue] = useState('');

  // Sync Progress State
  const [isSyncing, setIsSyncing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [syncMode, setSyncMode] = useState('both'); // 'both', 'copy', 'price'
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, success: 0, skipped: 0, error: 0 });
  const [syncResults, setSyncResults] = useState({});
  const [syncLogs, setSyncLogs] = useState([]);
  const logConsoleRef = useRef(null);

  // Image Download Task State
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');
  const [imageDownloadTask, setImageDownloadTask] = useState(null);

  // --- EXCEL PRICE SYNCHRONIZATION STATE ---
  const [excelFileName, setExcelFileName] = useState('');
  const [excelSheets, setExcelSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [excelWorkbook, setExcelWorkbook] = useState(null);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelRows, setExcelRows] = useState([]);
  const [excelKeyColumn, setExcelKeyColumn] = useState('');
  const [excelPriceColumn, setExcelPriceColumn] = useState('');
  const [excelCostColumn, setExcelCostColumn] = useState('');
  const [excelMatchingField, setExcelMatchingField] = useState('goodsCode');
  const [isReadingExcel, setIsReadingExcel] = useState(false);
  const [excelErrorMsg, setExcelErrorMsg] = useState('');
  const [excelFilterStatus, setExcelFilterStatus] = useState('ALL');
  const [excelCheckedUuids, setExcelCheckedUuids] = useState(new Set());

  // Auto-scroll Log Console
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [syncLogs]);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString('id-ID');
    setSyncLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  // --- HANDLERS: SOURCE LOGIN ---
  const handleLoginSource = async (e) => {
    if (e) e.preventDefault();
    if (!sourceAccount || !sourcePwd) return;
    setIsLoggingInSource(true);
    setSourceLoginError('');
    try {
      const payload = { userAccount: sourceAccount, userPwd: sourcePwd, type: sourceType };
      if (sourceType === 'grabotech') {
        payload.sessionCookie = sourceSessionCookie;
        payload.vifCode = sourceVifCode;
      }
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSourceToken(data.token);
        setSourceUser(data.user);
        addLog(`Source Account Authenticated: ${data.user?.contactMan || data.user?.userAccount || sourceAccount}`);
        fetchGoods(data.token);
      } else {
        setSourceLoginError(data.error || 'Source login failed');
        if (sourceType === 'grabotech') loadSourceCaptcha();
      }
    } catch (err) {
      setSourceLoginError('Server error occurred during Source login');
      if (sourceType === 'grabotech') loadSourceCaptcha();
    } finally {
      setIsLoggingInSource(false);
    }
  };

  // --- HANDLERS: TARGET LOGIN ---
  const handleLoginTarget = async (e) => {
    if (e) e.preventDefault();
    if (!targetAccount || !targetPwd) return;
    setIsLoggingInTarget(true);
    setTargetLoginError('');
    try {
      const payload = { userAccount: targetAccount, userPwd: targetPwd, type: targetType };
      if (targetType === 'grabotech') {
        payload.sessionCookie = targetSessionCookie;
        payload.vifCode = targetVifCode;
      }
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTargetToken(data.token);
        setTargetUser(data.user);
        addLog(`Target Account Authenticated: ${data.user?.contactMan || data.user?.userAccount || targetAccount}`);
        fetchTargetGoods(data.token);
      } else {
        setTargetLoginError(data.error || 'Target login failed');
        if (targetType === 'grabotech') loadTargetCaptcha();
      }
    } catch (err) {
      setTargetLoginError('Server error occurred during Target login');
      if (targetType === 'grabotech') loadTargetCaptcha();
    } finally {
      setIsLoggingInTarget(false);
    }
  };

  // --- HANDLERS: FETCH GOODS ---
  const fetchGoods = async (token = sourceToken) => {
    if (!token) return;
    setIsFetchingGoods(true);
    setGoodsFetchError('');
    try {
      const response = await fetch('/api/goods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type: sourceType })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const goodsList = Array.isArray(data.goods) ? data.goods : (Array.isArray(data.data) ? data.data : []);
        setGoods(goodsList);
        setOriginalGoods(JSON.parse(JSON.stringify(goodsList)));
        setSelectedIds(new Set());
        addLog(`Loaded ${goodsList.length} goods from Source account.`);
      } else {
        setGoodsFetchError(data.error || 'Failed to fetch Source goods');
      }
    } catch (err) {
      setGoodsFetchError('Server error while fetching Source goods');
    } finally {
      setIsFetchingGoods(false);
    }
  };

  const fetchTargetGoods = async (token = targetToken) => {
    if (!token) return;
    setIsLoadingTargetGoods(true);
    try {
      const response = await fetch('/api/goods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type: targetType })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const goodsList = Array.isArray(data.goods) ? data.goods : (Array.isArray(data.data) ? data.data : []);
        setTargetGoods(goodsList);
        setOriginalTargetGoods(JSON.parse(JSON.stringify(goodsList)));
        addLog(`Successfully loaded ${goodsList.length} goods from Target account.`);
      } else {
        addLog(`Warning: Failed to fetch Target goods: ${data.error || 'unknown error'}`);
      }
    } catch (err) {
      addLog(`Warning: Network error fetching Target goods: ${err.message}`);
    } finally {
      setIsLoadingTargetGoods(false);
    }
  };

  // Export CSV
  const handleDownloadCSV = () => {
    if (!sourceToken) return;
    addLog('Requesting CSV download from server...');
    window.location.href = `/api/export-csv?token=${encodeURIComponent(sourceToken)}&username=${encodeURIComponent(sourceAccount)}`;
    addLog('Exported all products to CSV.');
  };

  // Download Product Images
  const handleDownloadImages = async () => {
    if (selectedIds.size === 0) {
      alert('Select products in the list below to download their images');
      return;
    }
    if (isDownloadingImages) return;

    const selectedGoods = goods.filter(g => selectedIds.has(g.uuid));

    setIsDownloadingImages(true);
    setDownloadMsg(`Downloading ${selectedGoods.length} items...`);
    setImageDownloadTask({ status: 'downloading', current: 0, total: selectedGoods.length, downloaded: 0, failed: 0 });
    addLog(`Requesting image download for ${selectedGoods.length} selected items...`);

    try {
      const response = await fetch('/api/download-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: sourceAccount,
          goods: selectedGoods
        })
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/zip')) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sourceAccount}_images.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setIsDownloadingImages(false);
        setDownloadMsg('Success! Images downloaded as ZIP.');
        setImageDownloadTask({ status: 'completed', current: selectedGoods.length, total: selectedGoods.length, downloaded: selectedGoods.length, failed: 0 });
        addLog('Image ZIP downloaded successfully.');
        return;
      }

      const data = await response.json();
      if (response.ok && data.success) {
        setDownloadMsg('Download started. Polling status...');
        addLog('Image download task initialized on server.');

        const pollInterval = setInterval(async () => {
          try {
            const statusResp = await fetch(`/api/download-status?username=${encodeURIComponent(sourceAccount)}`);
            if (statusResp.ok) {
              const statusData = await statusResp.json();
              setImageDownloadTask(statusData);

              if (statusData.status === 'downloading') {
                setDownloadMsg(`Downloading: ${statusData.current} / ${statusData.total} images... (Failed: ${statusData.failed})`);
              } else if (statusData.status === 'zipping') {
                setDownloadMsg('Compressing files into a ZIP archive...');
              } else if (statusData.status === 'completed') {
                clearInterval(pollInterval);
                setIsDownloadingImages(false);
                setDownloadMsg('Success! Images downloaded as ZIP.');
                addLog('Image ZIP creation completed successfully.');
                window.location.href = `/api/download-zip?username=${encodeURIComponent(sourceAccount)}`;
              } else if (statusData.status === 'failed') {
                clearInterval(pollInterval);
                setIsDownloadingImages(false);
                setDownloadMsg(`Failed: ${statusData.error || 'Unknown error'}`);
                addLog(`Error: Image zip task failed: ${statusData.error}`);
              }
            }
          } catch (pollErr) {
            console.error('Error polling status:', pollErr);
          }
        }, 2000);

      } else {
        setDownloadMsg(data.error || 'Failed to start download');
        setImageDownloadTask(null);
        addLog(`Error: ${data.error || 'Failed to start image download'}`);
        setIsDownloadingImages(false);
      }
    } catch (err) {
      setDownloadMsg('Server error starting image download');
      setImageDownloadTask(null);
      addLog('Error: Server connection error during image download');
      setIsDownloadingImages(false);
    }
  };

  // Select / Deselect Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredGoods.map(g => g.uuid)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (uuid) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  // --- HANDLERS: SYNC GOODS TO TARGET ---
  const handleSyncGoods = async () => {
    if (isSyncing || selectedIds.size === 0 || !targetToken || !targetUser) return;

    const currentCatalog = activeCatalogTab === 'source' ? goods : targetGoods;
    const selectedList = currentCatalog.filter(g => selectedIds.has(g.uuid));
    const total = selectedList.length;

    setIsSyncing(true);
    setShowConfirmModal(false);
    
    setSyncProgress({ current: 0, total, success: 0, skipped: 0, error: 0 });
    setSyncResults({});
    addLog(`Starting synchronization of ${total} selected items...`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < total; i++) {
      const good = selectedList[i];
      const currentProgress = i + 1;
      
      setSyncProgress(prev => ({ ...prev, current: currentProgress }));
      setSyncResults(prev => ({
        ...prev,
        [good.uuid]: { status: 'syncing', message: 'Syncing product...' }
      }));
      addLog(`[${currentProgress}/${total}] Syncing: "${good.goodsName}"...`);

      try {
        const response = await fetch('/api/sync-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetToken,
            targetUserUuid: targetUser.uuid,
            good,
            mode: syncMode,
            targetType,
            sourceType
          })
        });
        const data = await response.json();

        if (response.ok && data.success) {
          if (data.status === 'skipped') {
            skippedCount++;
            setSyncResults(prev => ({
              ...prev,
              [good.uuid]: { status: 'skipped', message: data.message }
            }));
            addLog(`↳ Skip: "${good.goodsName}" (${data.message})`);
          } else {
            successCount++;
            setSyncResults(prev => ({
              ...prev,
              [good.uuid]: { status: 'success', message: 'Successfully synced' }
            }));
            addLog(`↳ Success: "${good.goodsName}" synced successfully.`);
          }
        } else {
          errorCount++;
          setSyncResults(prev => ({
            ...prev,
            [good.uuid]: { status: 'error', message: data.error || 'Failed to sync' }
          }));
          addLog(`↳ Error: Failed to sync "${good.goodsName}" - ${data.error}`);
        }
      } catch (err) {
        errorCount++;
        setSyncResults(prev => ({
          ...prev,
          [good.uuid]: { status: 'error', message: 'Network or server error' }
        }));
        addLog(`↳ Error: Failed to sync "${good.goodsName}" - Network error`);
      }

      setSyncProgress(prev => ({
        ...prev,
        success: successCount,
        skipped: skippedCount,
        error: errorCount
      }));

      await new Promise(r => setTimeout(r, 600));
    }

    setIsSyncing(false);
    addLog(`Sync finished. Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${errorCount}.`);
  };

  // --- EXCEL PARSING & MATCHING LOGIC ---
  const parseSheetData = (wb, sheetName) => {
    try {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) return;
      const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rawMatrix || rawMatrix.length === 0) {
        setExcelHeaders([]);
        setExcelRows([]);
        return;
      }
      let headerRowIndex = 0;
      for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
        const nonCount = rawMatrix[r].filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
        if (nonCount >= 2) {
          headerRowIndex = r;
          break;
        }
      }
      const headers = rawMatrix[headerRowIndex].map((h, i) => {
        const str = String(h || '').trim();
        return str !== '' ? str : `Kolom ${i + 1}`;
      });
      const dataRows = rawMatrix.slice(headerRowIndex + 1);
      setExcelHeaders(headers);
      setExcelRows(dataRows);

      const barcodeCol = headers.find(h => /barcode|sku|kode/i.test(h));
      const nameCol = headers.find(h => /nama|produk|product|item/i.test(h));
      if (barcodeCol) {
        setExcelKeyColumn(barcodeCol);
        setExcelMatchingField('goodsCode');
      } else if (nameCol) {
        setExcelKeyColumn(nameCol);
        setExcelMatchingField('goodsName');
      } else if (headers.length > 0) {
        setExcelKeyColumn(headers[0]);
      }

      const priceCol2026 = headers.find(h => /harga jual update 2026|harga 2026|c8888/i.test(h));
      const priceColGeneral = headers.find(h => /harga jual|harga|jual|price/i.test(h));
      if (priceCol2026) setExcelPriceColumn(priceCol2026);
      else if (priceColGeneral) setExcelPriceColumn(priceColGeneral);
      else if (headers.length > 1) setExcelPriceColumn(headers[1]);
      else setExcelPriceColumn('');

      const costCol2026 = headers.find(h => /hpp 2026|hpp\+ppn 2026|hpp|modal|cost/i.test(h));
      if (costCol2026) setExcelCostColumn(costCol2026);
      else setExcelCostColumn('');
    } catch (err) {
      console.error('Error parsing sheet:', err);
      setExcelErrorMsg('Gagal membaca sheet Excel: ' + err.message);
    }
  };

  const handleExcelFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsReadingExcel(true);
    setExcelErrorMsg('');
    setExcelFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        setExcelWorkbook(wb);
        setExcelSheets(wb.SheetNames);
        const defaultSheet = wb.SheetNames.find(s => /update harga|harga/i.test(s)) || wb.SheetNames[0];
        setSelectedSheet(defaultSheet);
        parseSheetData(wb, defaultSheet);
        addLog(`Loaded Excel file "${file.name}" with ${wb.SheetNames.length} sheet(s).`);
      } catch (err) {
        setExcelErrorMsg('Invalid or corrupt Excel file: ' + err.message);
      } finally {
        setIsReadingExcel(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (sheetName) => {
    setSelectedSheet(sheetName);
    if (excelWorkbook) parseSheetData(excelWorkbook, sheetName);
  };

  const excelMatches = useMemo(() => {
    if (!excelHeaders.length || !excelKeyColumn || (!excelPriceColumn && !excelCostColumn) || !excelRows.length) {
      return { matched: [], unmatchedCount: 0, totalRows: 0, matchingCount: 0, differingCount: 0 };
    }
    const activeCatalog = activeCatalogTab === 'source' ? goods : targetGoods;
    const keyIndex = excelHeaders.indexOf(excelKeyColumn);
    const saleIndex = excelPriceColumn ? excelHeaders.indexOf(excelPriceColumn) : -1;
    const costIndex = excelCostColumn ? excelHeaders.indexOf(excelCostColumn) : -1;
    if (keyIndex === -1) return { matched: [], unmatchedCount: 0, totalRows: 0, matchingCount: 0, differingCount: 0 };

    const catalogMap = new Map();
    activeCatalog.forEach(item => {
      let key = (excelMatchingField === 'goodsCode' ? item.goodsCode : item.goodsName) || '';
      key = String(key).trim().toLowerCase();
      if (key) catalogMap.set(key, item);
    });

    const parseNum = (val) => {
      if (typeof val === 'number') return Math.round(val);
      if (typeof val === 'string') {
        const clean = val.replace(/[^0-9.-]+/g, '');
        return Math.round(parseFloat(clean)) || 0;
      }
      return 0;
    };

    const matched = [];
    let unmatchedCount = 0;
    let matchingCount = 0;
    let differingCount = 0;

    excelRows.forEach((row, idx) => {
      const rawKey = row[keyIndex];
      if (rawKey === undefined || rawKey === null || String(rawKey).trim() === '') return;
      const keyStr = String(rawKey).trim().toLowerCase();
      const catalogItem = catalogMap.get(keyStr);

      if (catalogItem) {
        const currentSalePrice = parseFloat(catalogItem.goodsPrice) || 0;
        const currentCostPrice = parseFloat(catalogItem.costPrice) || 0;

        const rawSaleVal = saleIndex !== -1 ? row[saleIndex] : null;
        const rawCostVal = costIndex !== -1 ? row[costIndex] : null;

        const newSalePrice = saleIndex !== -1 ? parseNum(rawSaleVal) : currentSalePrice;
        const newCostPrice = costIndex !== -1 ? parseNum(rawCostVal) : currentCostPrice;

        const saleDiff = newSalePrice - currentSalePrice;
        const costDiff = newCostPrice - currentCostPrice;

        const isSaleMatching = saleIndex === -1 || saleDiff === 0;
        const isCostMatching = costIndex === -1 || costDiff === 0;
        const isMatching = isSaleMatching && isCostMatching;

        if (isMatching) matchingCount++;
        else differingCount++;

        matched.push({
          rowNum: idx + 1,
          excelKey: String(rawKey).trim(),
          catalogItem,
          currentSalePrice,
          newSalePrice,
          saleDiff,
          currentCostPrice,
          newCostPrice,
          costDiff,
          hasSaleChange: saleIndex !== -1,
          hasCostChange: costIndex !== -1,
          isMatching
        });
      } else {
        unmatchedCount++;
      }
    });

    return { matched, unmatchedCount, totalRows: excelRows.length, matchingCount, differingCount };
  }, [excelHeaders, excelKeyColumn, excelPriceColumn, excelCostColumn, excelRows, excelMatchingField, activeCatalogTab, goods, targetGoods]);

  useEffect(() => {
    if (excelMatches.matched.length > 0) {
      const nextChecked = new Set();
      const differing = excelMatches.matched.filter(m => !m.isMatching);
      if (differing.length > 0) differing.forEach(m => nextChecked.add(m.catalogItem.uuid));
      else excelMatches.matched.forEach(m => nextChecked.add(m.catalogItem.uuid));
      setExcelCheckedUuids(nextChecked);
    } else {
      setExcelCheckedUuids(new Set());
    }
  }, [excelMatches.matched]);

  const toggleExcelCheckItem = (uuid) => {
    setExcelCheckedUuids(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const toggleExcelCheckAllFiltered = (filteredRows) => {
    const allChecked = filteredRows.length > 0 && filteredRows.every(m => excelCheckedUuids.has(m.catalogItem.uuid));
    setExcelCheckedUuids(prev => {
      const next = new Set(prev);
      if (allChecked) filteredRows.forEach(m => next.delete(m.catalogItem.uuid));
      else filteredRows.forEach(m => next.add(m.catalogItem.uuid));
      return next;
    });
  };

  const checkOnlyDifferingExcel = () => {
    const next = new Set();
    excelMatches.matched.filter(m => !m.isMatching).forEach(m => next.add(m.catalogItem.uuid));
    setExcelCheckedUuids(next);
  };

  const checkAllMatchedExcel = () => {
    const next = new Set();
    excelMatches.matched.forEach(m => next.add(m.catalogItem.uuid));
    setExcelCheckedUuids(next);
  };

  const uncheckAllExcel = () => {
    setExcelCheckedUuids(new Set());
  };

  const handleApplyExcelPrices = (applyToCheckedOnly = true, pushToServer = false) => {
    if (!excelMatches.matched.length) {
      alert('Tidak ada produk katalog yang cocok dengan data Excel.');
      return;
    }
    if (applyToCheckedOnly && excelCheckedUuids.size === 0) {
      alert('Silakan centang setidaknya 1 produk.');
      return;
    }

    if (pushToServer && !targetToken) {
      alert('Silakan login ke Akun Target terlebih dahulu di bagian atas agar harga produk dapat di-update ke server toko online!');
      return;
    }

    const priceMap = new Map();
    const updatedUuids = new Set();
    excelMatches.matched.forEach(m => {
      if (!applyToCheckedOnly || excelCheckedUuids.has(m.catalogItem.uuid)) {
        priceMap.set(m.catalogItem.uuid, {
          newSalePrice: m.newSalePrice,
          newCostPrice: m.newCostPrice,
          hasSaleChange: m.hasSaleChange,
          hasCostChange: m.hasCostChange
        });
        updatedUuids.add(m.catalogItem.uuid);
      }
    });

    const setter = activeCatalogTab === 'source' ? setGoods : setTargetGoods;
    let appliedCount = 0;

    setter(prev => prev.map(item => {
      if (priceMap.has(item.uuid)) {
        const pData = priceMap.get(item.uuid);
        appliedCount++;
        let updatedItem = { ...item };
        const originalSale = parseFloat(item.goodsPrice) || 0;

        if (pData.hasSaleChange) {
          updatedItem.goodsPrice = pData.newSalePrice;
          if (item.membersPrice && originalSale > 0) {
            updatedItem.membersPrice = Math.round(pData.newSalePrice * (item.membersPrice / originalSale));
          } else {
            updatedItem.membersPrice = pData.newSalePrice;
          }
        }
        if (pData.hasCostChange) updatedItem.costPrice = pData.newCostPrice;

        return updatedItem;
      }
      return item;
    }));

    setSelectedIds(updatedUuids);
    addLog(`Penyesuaian Harga Excel: Applied prices to ${appliedCount} items in ${activeCatalogTab.toUpperCase()} catalog.`);

    if (pushToServer) {
      setSyncMode('price');
      setShowConfirmModal(true);
    } else {
      alert(`Berhasil menerapkan harga Excel ke ${appliedCount} produk di katalog lokal aplikasi.`);
    }
  };

  // --- FILTERED GOODS COMPUTATION ---
  const categories = useMemo(() => {
    const list = new Set();
    const currentList = activeCatalogTab === 'source' ? goods : targetGoods;
    currentList.forEach(g => {
      if (g.customName) list.add(g.customName);
    });
    return ['ALL', ...Array.from(list)];
  }, [goods, targetGoods, activeCatalogTab]);

  const filteredGoods = useMemo(() => {
    const currentList = activeCatalogTab === 'source' ? goods : targetGoods;
    return currentList.filter(g => {
      const matchesSearch = 
        g.goodsName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        g.goodsCode?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = 
        selectedCategory === 'ALL' || 
        g.customName === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [goods, targetGoods, searchQuery, selectedCategory, activeCatalogTab]);

  return (
    <div className="min-h-[100dvh] pb-12 flex flex-col font-sans bg-[#090a0f] text-white">
      {/* Top Header Bar */}
      <header className="border-b border-white/5 py-4 px-6 md:px-12 liquid-glass sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2.5 rounded-2xl border border-emerald-500/20 text-emerald-400">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">IT AUTOMATION</h1>
              <p className="text-xs text-slate-500 mt-1">Goods Sync Automation</p>
            </div>
          </div>

          {/* Top Page Navigation Switcher */}
          <div className="flex items-center bg-[#12141d]/90 p-1.5 rounded-2xl border border-white/10 gap-1.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveNavTab('sync')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                activeNavTab === 'sync'
                  ? 'bg-emerald-500 text-[#090a0f] font-bold shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Copy size={16} />
              <span>Halaman Utama (Copy & Sync Goods)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveNavTab('excel')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                activeNavTab === 'excel'
                  ? 'bg-emerald-500 text-[#090a0f] font-bold shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Coins size={16} />
              <span>Penyesuaian Harga Excel</span>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-black/30 text-emerald-300 font-extrabold tracking-wider">
                Baru
              </span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-3 text-xs font-mono">
            {sourceToken && (
              <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-status-pulse"></span>
                Source Connected
              </span>
            )}
            {targetToken && (
              <span className="flex items-center gap-1.5 bg-sky-500/10 text-sky-400 px-2.5 py-1 rounded-full border border-sky-500/20">
                <span className="h-2 w-2 rounded-full bg-sky-500 animate-status-pulse"></span>
                Target Connected
              </span>
            )}
          </div>
        </div>
      </header>

      {/* PAGE VIEW 1: 100% EXACT VERCEL SCREENSHOT MATCH (tasmanjing.vercel.app) */}
      {activeNavTab === 'sync' && (
        <main className="max-w-7xl w-full mx-auto px-6 md:px-12 mt-8 flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Source Account Card & Target Account Card */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* 1. Source Account Card */}
            <section className="liquid-glass rounded-3xl p-6 border border-white/5 spring-transition">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-emerald-500/10 p-2.5 rounded-xl text-emerald-400">
                  <Database size={20} />
                </div>
                <h2 className="text-base font-bold text-white">Source Account</h2>
              </div>
              
              <form onSubmit={handleLoginSource} className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-400">Source Portal Type</label>
                  <div className="flex bg-[#12141d]/80 p-1 border border-white/5 rounded-xl gap-1">
                    <button
                      type="button"
                      disabled={sourceToken !== ''}
                      onClick={() => setSourceType('main')}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        sourceType === 'main' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      VM Oren
                    </button>
                    <button
                      type="button"
                      disabled={sourceToken !== ''}
                      onClick={() => setSourceType('itspc')}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        sourceType === 'itspc' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      VM Putih
                    </button>
                    {!isVercel && (
                      <button
                        type="button"
                        disabled={sourceToken !== ''}
                        onClick={() => setSourceType('grabotech')}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          sourceType === 'grabotech' 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'text-slate-400 hover:text-white border border-transparent'
                        }`}
                      >
                        Grabotech
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={sourceToken !== ''}
                      onClick={() => setSourceType('yyvendor')}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        sourceType === 'yyvendor' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      Yunyin
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-400">Account Username</label>
                  <input 
                    type="text" 
                    disabled={sourceToken !== ''}
                    value={sourceAccount}
                    onChange={(e) => setSourceAccount(e.target.value)}
                    placeholder="Enter username" 
                    className="bg-[#12141d]/80 border border-white/5 focus:border-emerald-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all duration-200"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-400">Account Password</label>
                  <input 
                    type="password" 
                    disabled={sourceToken !== ''}
                    value={sourcePwd}
                    onChange={(e) => setSourcePwd(e.target.value)}
                    placeholder="Password" 
                    className="bg-[#12141d]/80 border border-white/5 focus:border-emerald-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all duration-200"
                  />
                </div>

                {sourceType === 'grabotech' && !sourceToken && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-slate-400">Verification Code</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={sourceVifCode}
                        onChange={(e) => setSourceVifCode(e.target.value)}
                        placeholder="Enter CAPTCHA" 
                        className="flex-1 bg-[#12141d]/80 border border-white/5 focus:border-emerald-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all duration-200"
                      />
                      {sourceCaptchaUrl ? (
                        <div className="flex items-center gap-2 bg-[#12141d]/80 border border-white/5 rounded-xl p-1 shrink-0">
                          <img src={sourceCaptchaUrl} alt="CAPTCHA" className="h-[38px] rounded-lg object-contain" />
                          <button type="button" onClick={loadSourceCaptcha} className="p-2 text-slate-400 hover:text-white">
                            <ArrowsClockwise size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center bg-[#12141d]/80 border border-white/5 rounded-xl px-4 h-[44px] text-xs text-slate-500 shrink-0">
                          Loading...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {sourceLoginError && (
                  <div className="bg-rose-500/10 text-rose-400 p-3 rounded-xl border border-rose-500/20 text-xs flex gap-2 items-start">
                    <Warning size={14} className="mt-0.5 shrink-0" />
                    <span>{sourceLoginError}</span>
                  </div>
                )}

                {sourceUser ? (
                  <div className="bg-white/2 rounded-xl p-3.5 border border-white/5 space-y-1.5 text-xs text-slate-400">
                    <div className="flex justify-between"><span className="text-slate-500">Contact:</span><span className="font-medium text-slate-200">{sourceUser.contactMan || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Email:</span><span className="font-medium text-slate-200">{sourceUser.email || '-'}</span></div>
                    <button 
                      type="button" 
                      onClick={() => { setSourceToken(''); setSourceUser(null); setGoods([]); }}
                      className="w-full mt-3 text-center py-1.5 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 rounded-lg transition-all duration-200 font-medium"
                    >
                      Disconnect Account
                    </button>
                  </div>
                ) : (
                  <button 
                    type="submit" 
                    disabled={isLoggingInSource}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-[#090a0f] text-sm font-semibold rounded-xl spring-transition disabled:opacity-50"
                  >
                    {isLoggingInSource ? <ArrowsClockwise size={16} className="animate-spin" /> : <Key size={16} />}
                    Connect Source
                  </button>
                )}
              </form>
            </section>

            {/* 2. Target Account Card */}
            <section className="liquid-glass rounded-3xl p-6 border border-white/5 spring-transition">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-sky-500/10 p-2.5 rounded-xl text-sky-400">
                  <Storefront size={20} />
                </div>
                <h2 className="text-base font-bold text-white">Target Account</h2>
              </div>
              
              <form onSubmit={handleLoginTarget} className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-400">Target Portal Type</label>
                  <div className="flex bg-[#12141d]/80 p-1 border border-white/5 rounded-xl gap-1">
                    <button
                      type="button"
                      disabled={targetToken !== ''}
                      onClick={() => setTargetType('main')}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        targetType === 'main' 
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' 
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      VM Oren
                    </button>
                    <button
                      type="button"
                      disabled={targetToken !== ''}
                      onClick={() => setTargetType('itspc')}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        targetType === 'itspc' 
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' 
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      VM Putih
                    </button>
                    {!isVercel && (
                      <button
                        type="button"
                        disabled={targetToken !== ''}
                        onClick={() => setTargetType('grabotech')}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          targetType === 'grabotech' 
                            ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' 
                            : 'text-slate-400 hover:text-white border border-transparent'
                        }`}
                      >
                        Grabotech
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={targetToken !== ''}
                      onClick={() => setTargetType('yyvendor')}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        targetType === 'yyvendor' 
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' 
                          : 'text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      Yunyin
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-400">Account Username</label>
                  <input 
                    type="text" 
                    disabled={targetToken !== ''}
                    value={targetAccount}
                    onChange={(e) => setTargetAccount(e.target.value)}
                    placeholder="Enter target username" 
                    className="bg-[#12141d]/80 border border-white/5 focus:border-sky-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all duration-200"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-400">Account Password</label>
                  <input 
                    type="password" 
                    disabled={targetToken !== ''}
                    value={targetPwd}
                    onChange={(e) => setTargetPwd(e.target.value)}
                    placeholder="Password" 
                    className="bg-[#12141d]/80 border border-white/5 focus:border-sky-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all duration-200"
                  />
                </div>

                {targetType === 'grabotech' && !targetToken && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-slate-400">Verification Code</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={targetVifCode}
                        onChange={(e) => setTargetVifCode(e.target.value)}
                        placeholder="Enter CAPTCHA" 
                        className="flex-1 bg-[#12141d]/80 border border-white/5 focus:border-sky-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all duration-200"
                      />
                      {targetCaptchaUrl ? (
                        <div className="flex items-center gap-2 bg-[#12141d]/80 border border-white/5 rounded-xl p-1 shrink-0">
                          <img src={targetCaptchaUrl} alt="CAPTCHA" className="h-[38px] rounded-lg object-contain" />
                          <button type="button" onClick={loadTargetCaptcha} className="p-2 text-slate-400 hover:text-white">
                            <ArrowsClockwise size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center bg-[#12141d]/80 border border-white/5 rounded-xl px-4 h-[44px] text-xs text-slate-500 shrink-0">
                          Loading...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {targetLoginError && (
                  <div className="bg-rose-500/10 text-rose-400 p-3 rounded-xl border border-rose-500/20 text-xs flex gap-2 items-start">
                    <Warning size={14} className="mt-0.5 shrink-0" />
                    <span>{targetLoginError}</span>
                  </div>
                )}

                {targetUser ? (
                  <div className="bg-white/2 rounded-xl p-3.5 border border-white/5 space-y-1.5 text-xs text-slate-400">
                    <div className="flex justify-between"><span className="text-slate-500">Contact:</span><span className="font-medium text-slate-200">{targetUser.contactMan || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Email:</span><span className="font-medium text-slate-200">{targetUser.email || '-'}</span></div>
                    <button 
                      type="button" 
                      onClick={() => { setTargetToken(''); setTargetUser(null); setTargetGoods([]); }}
                      className="w-full mt-3 text-center py-1.5 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 rounded-lg transition-all duration-200 font-medium"
                    >
                      Disconnect Account
                    </button>
                  </div>
                ) : (
                  <button 
                    type="submit" 
                    disabled={isLoggingInTarget}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-sky-500 hover:bg-sky-400 active:scale-[0.98] text-[#090a0f] text-sm font-semibold rounded-xl spring-transition disabled:opacity-50"
                  >
                    {isLoggingInTarget ? <ArrowsClockwise size={16} className="animate-spin" /> : <Key size={16} />}
                    Connect Target
                  </button>
                )}
              </form>
            </section>

          </div>

          {/* Right Column: Synchronization Panel & Catalog Area */}
          <div className="lg:col-span-2 space-y-6">

            {/* Synchronization Panel */}
            <section className="liquid-glass rounded-3xl p-6 border border-white/5 spring-transition">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white">Synchronization Panel</h2>
                  <p className="text-xs text-slate-500 mt-1">Select items below to push to the target merchant account</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Sync Mode</span>
                    <div className="flex bg-[#12141d]/80 p-1 border border-white/5 rounded-xl gap-1">
                      <button
                        type="button"
                        onClick={() => setSyncMode('both')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          syncMode === 'both'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-slate-400 hover:text-white border border-transparent'
                        }`}
                      >
                        Copy & Price
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyncMode('copy')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          syncMode === 'copy'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-slate-400 hover:text-white border border-transparent'
                        }`}
                      >
                        Copy Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyncMode('price')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          syncMode === 'price'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-slate-400 hover:text-white border border-transparent'
                        }`}
                      >
                        Price Only
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={isSyncing || selectedIds.size === 0 || !targetToken}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-[#171c26] hover:bg-[#1f2634] text-slate-300 border border-white/10 hover:border-emerald-500/30 hover:text-emerald-400 font-bold text-xs rounded-2xl transition-all duration-200 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Play size={14} weight="fill" />
                    <span>Sync Selected ({selectedIds.size})</span>
                  </button>
                </div>
              </div>

              {/* Sync Progress Indicator */}
              {isSyncing && (
                <div className="mt-6 pt-6 border-t border-white/5 space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Processing: {syncProgress.current} / {syncProgress.total}</span>
                    <span className="text-emerald-400">Success: {syncProgress.success} | Skipped: {syncProgress.skipped} | Errors: {syncProgress.error}</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </section>

            {/* Catalog Card */}
            <section className="liquid-glass rounded-3xl p-6 border border-white/5 space-y-6">
              
              {/* Catalog Tabs Switcher */}
              <div className="border-b border-white/5 flex gap-8">
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('source')}
                  className={`pb-4 text-sm font-bold transition-all relative ${
                    activeCatalogTab === 'source'
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Source Catalog ({goods.length})
                  {activeCatalogTab === 'source' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full"></span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('target')}
                  className={`pb-4 text-sm font-bold transition-all relative ${
                    activeCatalogTab === 'target'
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={!targetToken ? "Connect target account first to preview catalog" : "Preview target goods"}
                >
                  Target Catalog ({targetGoods.length})
                  {activeCatalogTab === 'target' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full"></span>
                  )}
                </button>
              </div>

              {/* Subheader Title & Action Buttons */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{activeCatalogTab === 'source' ? 'Source Goods' : 'Target Goods'}</span>
                    <span className="bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full text-xs font-mono text-slate-400">
                      {activeCatalogTab === 'source' ? goods.length : targetGoods.length} items
                    </span>
                  </h3>

                  {activeCatalogTab === 'source' && goods.length > 0 && (
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        type="button"
                        onClick={handleDownloadCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white rounded-xl text-[10px] font-semibold"
                      >
                        <DownloadSimple size={12} />
                        Export CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadImages}
                        disabled={isDownloadingImages || selectedIds.size === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-semibold disabled:opacity-30"
                      >
                        {isDownloadingImages ? <ArrowsClockwise size={12} className="animate-spin" /> : <Image size={12} />}
                        Download Images {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                      </button>
                    </div>
                  )}
                </div>

                {((activeCatalogTab === 'source' && goods.length > 0) || (activeCatalogTab === 'target' && targetGoods.length > 0)) && (
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-56">
                      <MagnifyingGlass size={14} className="absolute left-3.5 top-3 text-slate-500" />
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or code..."
                        className="w-full bg-[#12141d]/80 border border-white/5 focus:border-white/15 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none text-white"
                      />
                    </div>

                    <select 
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full sm:w-36 bg-[#12141d]/80 border border-white/5 focus:border-white/15 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none"
                    >
                      {categories.map((cat, idx) => (
                        <option key={`${cat}_${idx}`} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Goods Table or Empty State (Exact Vercel Screenshot Match!) */}
              {isFetchingGoods || (activeCatalogTab === 'target' && isLoadingTargetGoods) ? (
                <div className="space-y-3 py-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex gap-4 items-center bg-white/2 p-4 rounded-xl border border-white/5 animate-pulse">
                      <div className="h-4 w-4 bg-white/10 rounded"></div>
                      <div className="h-10 w-10 bg-white/10 rounded-lg"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-1/3 bg-white/10 rounded"></div>
                        <div className="h-3 w-1/4 bg-white/10 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeCatalogTab === 'source' && goodsFetchError ? (
                <div className="bg-rose-500/10 text-rose-400 p-6 rounded-2xl border border-rose-500/20 text-sm text-center flex flex-col items-center gap-3">
                  <Warning size={24} />
                  <p>{goodsFetchError}</p>
                </div>
              ) : (activeCatalogTab === 'source' && goods.length === 0) ? (
                <div className="bg-[#12141d]/40 p-16 rounded-3xl border border-white/5 text-center flex flex-col items-center justify-center gap-4 min-h-[300px]">
                  <div className="bg-slate-800/20 p-4 rounded-full text-slate-600 border border-slate-700/20">
                    <Database size={36} />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-300">No goods loaded</h4>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                      Connect your source account credentials on the left panel to load your customs goods catalog.
                    </p>
                  </div>
                </div>
              ) : (activeCatalogTab === 'target' && targetGoods.length === 0) ? (
                <div className="bg-[#12141d]/40 p-16 rounded-3xl border border-white/5 text-center flex flex-col items-center justify-center gap-4 min-h-[300px]">
                  <div className="bg-slate-800/20 p-4 rounded-full text-slate-600 border border-slate-700/20">
                    <Storefront size={36} />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-300">No Target Products Found</h4>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                      {!targetToken ? 'Connect target account on the left panel to preview its products.' : 'The target account does not have any custom goods yet.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/1">
                  <div className="overflow-x-auto max-h-[480px] scrollbar-thin">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/2 text-slate-400 font-semibold">
                          {activeCatalogTab === 'source' && (
                            <th className="py-3.5 px-4 w-12 text-center">
                              <input 
                                type="checkbox"
                                checked={filteredGoods.length > 0 && filteredGoods.every(g => selectedIds.has(g.uuid))}
                                onChange={handleSelectAll}
                                className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0 bg-transparent h-4 w-4 cursor-pointer"
                              />
                            </th>
                          )}
                          <th className="py-3.5 px-4">Item details</th>
                          <th className="py-3.5 px-4">Barcode</th>
                          <th className="py-3.5 px-4">Category</th>
                          <th className="py-3.5 px-4 text-right">Prices</th>
                          {activeCatalogTab === 'source' && <th className="py-3.5 px-4 text-center w-28">Sync status</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredGoods.map((good) => {
                          const result = syncResults[good.uuid];
                          return (
                            <tr key={good.uuid} className="hover:bg-white/5 transition-colors">
                              {activeCatalogTab === 'source' && (
                                <td className="py-3 px-4 text-center">
                                  <input 
                                    type="checkbox"
                                    checked={selectedIds.has(good.uuid)}
                                    onChange={() => handleSelectOne(good.uuid)}
                                    className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0 bg-transparent h-4 w-4 cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  {good.goodsUrl ? (
                                    <img 
                                      src={good.goodsUrl} 
                                      alt={good.goodsName} 
                                      className="h-10 w-10 rounded-xl object-cover bg-white/5 border border-white/10 shrink-0"
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 shrink-0 flex items-center justify-center text-slate-500 font-bold text-xs">
                                      {good.goodsName?.substring(0, 2)?.toUpperCase()}
                                    </div>
                                  )}
                                  <div className="truncate max-w-[240px]">
                                    <p className="font-semibold text-slate-200">{good.goodsName}</p>
                                    <p className="text-[10px] text-slate-500 font-mono">ID: {good.uuid}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-400">{good.goodsCode || '-'}</td>
                              <td className="py-3 px-4">
                                <span className="bg-white/5 border border-white/5 px-2 py-0.5 rounded text-[10px] text-slate-400 font-medium">
                                  {good.customName || 'General'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right space-y-0.5 font-mono">
                                <div className="text-emerald-400 font-bold">
                                  Rp {(parseFloat(good.goodsPrice) || 0).toLocaleString('id-ID')}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Cost: Rp {(parseFloat(good.costPrice) || 0).toLocaleString('id-ID')}
                                </div>
                              </td>
                              {activeCatalogTab === 'source' && (
                                <td className="py-3 px-4 text-center">
                                  {result ? (
                                    <div className="flex justify-center">
                                      {result.status === 'syncing' && (
                                        <span className="flex items-center gap-1 text-slate-400 animate-pulse text-[10px]">
                                          <ArrowsClockwise size={12} className="animate-spin text-slate-500" /> Syncing
                                        </span>
                                      )}
                                      {result.status === 'success' && (
                                        <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold text-[10px]">
                                          <CheckCircle size={12} /> Synced
                                        </span>
                                      )}
                                      {result.status === 'skipped' && (
                                        <span className="flex items-center gap-1 text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20 font-semibold text-[10px]" title={result.message}>
                                          <Info size={12} /> Skipped
                                        </span>
                                      )}
                                      {result.status === 'error' && (
                                        <span className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 font-semibold text-[10px]" title={result.message}>
                                          <XCircle size={12} /> Failed
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-600 text-[10px]">Pending</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* Execution Console Logs */}
            <div className="liquid-glass rounded-3xl p-5 border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>System Execution Logs</span>
                <button
                  type="button"
                  onClick={() => setSyncLogs([])}
                  className="hover:text-white underline text-[11px]"
                >
                  Clear Logs
                </button>
              </div>
              <div ref={logConsoleRef} className="bg-[#0c0d12] rounded-2xl p-4 h-36 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1 scrollbar-thin border border-white/5">
                {syncLogs.length === 0 ? (
                  <div className="text-slate-600 italic">No activity logs yet...</div>
                ) : (
                  syncLogs.map((log, index) => (
                    <div key={index} className="leading-relaxed">{log}</div>
                  ))
                )}
              </div>
            </div>

          </div>
        </main>
      )}

      {/* PAGE VIEW 2: STANDALONE EXCEL PRICE SYNCHRONIZATION */}
      {activeNavTab === 'excel' && (
        <main className="max-w-7xl w-full mx-auto px-6 md:px-12 mt-8 flex-1 space-y-6">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#12141d]/90 p-6 rounded-3xl border border-white/10 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Coins className="text-emerald-400" size={24} />
                <span>Halaman Sync & Penyesuaian Harga Excel</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Unggah file Excel (seperti MARGIN VM FINAL JULI 2026), tentukan kolom harga jual & HPP, centang produk, dan update langsung ke katalog Akun Target/Source.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {excelFileName && (
                <button
                  type="button"
                  onClick={() => { setExcelFileName(''); setExcelRows([]); setExcelWorkbook(null); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold rounded-xl transition-all"
                >
                  <Trash size={14} />
                  <span>Reset Excel</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveNavTab('sync')}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold rounded-xl transition-all"
              >
                <span>Lihat Halaman Utama</span>
              </button>
            </div>
          </div>

          {/* Account Status / Login Banner on Excel Page */}
          {(!targetToken && !sourceToken) ? (
            <div className="liquid-glass rounded-3xl p-6 border border-amber-500/30 bg-amber-500/5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                  <Key size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Connect Akun Target / Source Terlebih Dahulu</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Wajib Login
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Login ke akun Target atau Source agar sistem dapat memuat katalog produk dan mencocokkan harga dengan file Excel.
                  </p>
                </div>
              </div>

              <form onSubmit={handleLoginTarget} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <select 
                    value={targetType} 
                    onChange={(e) => setTargetType(e.target.value)}
                    className="w-full bg-[#12141d] border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none font-medium"
                  >
                    <option value="main">VM Oren (SANY POS)</option>
                    <option value="itspc">VM Putih (ITSPC)</option>
                    {!isVercel && <option value="grabotech">Grabotech</option>}
                    <option value="yyvendor">Yunyin</option>
                  </select>
                </div>

                <div>
                  <input
                    type="text"
                    value={targetAccount}
                    onChange={(e) => setTargetAccount(e.target.value)}
                    placeholder="Username Target"
                    className="w-full bg-[#12141d] border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>

                <div>
                  <input
                    type="password"
                    value={targetPwd}
                    onChange={(e) => setTargetPwd(e.target.value)}
                    placeholder="Password Target"
                    className="w-full bg-[#12141d] border border-white/10 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isLoggingInTarget}
                    className="w-full bg-sky-500 hover:bg-sky-400 text-[#090a0f] font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoggingInTarget ? <ArrowsClockwise size={14} className="animate-spin" /> : <Key size={14} />}
                    <span>Login & Muat Katalog</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="liquid-glass rounded-3xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <CheckCircle size={18} />
                </div>
                <div>
                  <span className="text-slate-400">Status Akun: </span>
                  {targetToken && (
                    <span className="font-bold text-sky-400 mr-3">Target: {targetUser?.contactMan || targetAccount} ({targetGoods.length} produk)</span>
                  )}
                  {sourceToken && (
                    <span className="font-bold text-emerald-400">Source: {sourceUser?.contactMan || sourceAccount} ({goods.length} produk)</span>
                  )}
                </div>
              </div>

              <div className="flex items-center bg-[#1a1d29] p-1 rounded-2xl border border-white/10 gap-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('target')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    activeCatalogTab === 'target'
                      ? 'bg-sky-500 text-[#090a0f] font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cocokkan ke Katalog Target ({targetGoods.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('source')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    activeCatalogTab === 'source'
                      ? 'bg-emerald-500 text-[#090a0f] font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cocokkan ke Katalog Source ({goods.length})
                </button>
              </div>
            </div>
          )}

          {/* Excel File Upload & Mapping Area */}
          <section className="liquid-glass rounded-3xl p-6 border border-white/5 space-y-6">
            {!excelFileName ? (
              <label className="group relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-white/10 hover:border-emerald-500/50 rounded-3xl bg-[#12141d]/40 hover:bg-[#12141d]/80 cursor-pointer transition-all duration-300">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelFileUpload}
                  className="hidden"
                />
                <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-full group-hover:scale-110 group-active:scale-95 transition-transform duration-200 mb-3">
                  <DownloadSimple size={32} className="rotate-180" />
                </div>
                <span className="text-base font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                  Upload atau Drop File Excel (.xlsx / .xls / .csv)
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  Contoh file: MARGIN VM FINAL JULI 2026 NEW UPDATE.xlsx
                </span>
              </label>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 bg-[#12141d]/80 p-4 rounded-2xl border border-white/5 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                      <CheckCircle size={18} />
                    </div>
                    <div>
                      <span className="font-bold text-white text-sm block">{excelFileName}</span>
                      <span className="text-slate-400 text-xs">{excelRows.length} baris data ditemukan</span>
                    </div>
                  </div>

                  {excelSheets.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs font-semibold">Sheet Excel:</span>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="bg-[#1a1d29] border border-emerald-500/40 text-emerald-300 font-bold rounded-xl px-3 py-2 text-xs focus:outline-none"
                      >
                        {excelSheets.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#12141d]/40 p-5 rounded-2xl border border-white/5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-400">1. Kolom Pengenal Excel</label>
                    <select
                      value={excelKeyColumn}
                      onChange={(e) => setExcelKeyColumn(e.target.value)}
                      className="bg-[#12141d] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                    >
                      {excelHeaders.map((h, idx) => (
                        <option key={`${h}_${idx}`} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-400">2. Cocokkan Berdasarkan</label>
                    <select
                      value={excelMatchingField}
                      onChange={(e) => setExcelMatchingField(e.target.value)}
                      className="bg-[#12141d] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                    >
                      <option value="goodsCode">Barcode / Kode Produk (goodsCode)</option>
                      <option value="goodsName">Nama Produk (goodsName)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-emerald-400 flex items-center justify-between">
                      <span>3. Kolom Harga Jual</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">HARGA JUAL</span>
                    </label>
                    <select
                      value={excelPriceColumn}
                      onChange={(e) => setExcelPriceColumn(e.target.value)}
                      className="bg-[#12141d] border border-emerald-500/50 focus:border-emerald-400 rounded-xl px-3 py-2.5 text-xs text-emerald-300 font-bold focus:outline-none"
                    >
                      <option value="">-- Abaikan --</option>
                      {excelHeaders.map((h, idx) => (
                        <option key={`${h}_${idx}`} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-amber-400 flex items-center justify-between">
                      <span>4. Kolom Harga Modal (HPP)</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">HARGA MODAL</span>
                    </label>
                    <select
                      value={excelCostColumn}
                      onChange={(e) => setExcelCostColumn(e.target.value)}
                      className="bg-[#12141d] border border-amber-500/50 focus:border-amber-400 rounded-xl px-3 py-2.5 text-xs text-amber-300 font-bold focus:outline-none"
                    >
                      <option value="">-- Abaikan --</option>
                      {excelHeaders.map((h, idx) => (
                        <option key={`${h}_${idx}`} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div><span className="text-slate-400">Total Baris: </span><span className="font-bold text-white font-mono">{excelMatches.totalRows}</span></div>
                    <div className="w-[1px] h-4 bg-white/10 hidden sm:block"></div>
                    <div><span className="text-slate-400">Cocok: </span><span className="font-bold text-slate-200 font-mono">{excelMatches.matched.length} Produk</span></div>
                    <div className="w-[1px] h-4 bg-white/10 hidden sm:block"></div>
                    <div><span className="text-amber-400 font-semibold">Belum Sesuai: </span><span className="font-bold text-amber-300 font-mono bg-amber-500/20 px-2 py-0.5 rounded">{excelMatches.differingCount}</span></div>
                    <div className="w-[1px] h-4 bg-white/10 hidden sm:block"></div>
                    <div><span className="text-emerald-400 font-semibold">Sudah Sesuai: </span><span className="font-bold text-emerald-300 font-mono bg-emerald-500/20 px-2 py-0.5 rounded">{excelMatches.matchingCount}</span></div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyExcelPrices(true, true)}
                      disabled={excelCheckedUuids.size === 0}
                      className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-[#090a0f] disabled:opacity-40 text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/10 flex items-center gap-2 active:scale-[0.98] transition-all"
                    >
                      <Play size={14} weight="fill" />
                      <span>Terapkan & Update Ke Server Target ({excelCheckedUuids.size} Produk)</span>
                    </button>
                  </div>
                </div>

                {/* Live Progress Bar Indicator on Excel Page */}
                {isSyncing && (
                  <div className="bg-[#12141d]/90 p-5 rounded-2xl border border-emerald-500/30 space-y-3 shadow-xl">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono">
                      <span className="text-slate-200 font-bold flex items-center gap-2">
                        <ArrowsClockwise size={16} className="animate-spin text-emerald-400" />
                        Meng-update Server Target: {syncProgress.current} / {syncProgress.total} produk
                      </span>
                      <span className="text-emerald-400 font-bold">
                        ✓ Berhasil: {syncProgress.success} | ℹ️ Skip: {syncProgress.skipped} | ❌ Gagal: {syncProgress.error}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/10">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300 shadow-lg shadow-emerald-500/50"
                        style={{ width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Filter & Selection Control Bar */}
                {excelMatches.matched.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#12141d]/80 p-3 rounded-2xl border border-white/5 text-xs">
                      {/* Filter Status Tabs */}
                      <div className="flex items-center bg-[#1a1d29] p-1 rounded-xl border border-white/10 gap-1 font-semibold">
                        <button
                          type="button"
                          onClick={() => setExcelFilterStatus('ALL')}
                          className={`px-3 py-1.5 rounded-lg transition-all ${
                            excelFilterStatus === 'ALL'
                              ? 'bg-white/10 text-white font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Semua ({excelMatches.matched.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcelFilterStatus('NEED_UPDATE')}
                          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            excelFilterStatus === 'NEED_UPDATE'
                              ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                              : 'text-slate-400 hover:text-amber-300'
                          }`}
                        >
                          <span>Belum Sesuai</span>
                          <span className="bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                            {excelMatches.differingCount}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcelFilterStatus('ALREADY_MATCHED')}
                          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            excelFilterStatus === 'ALREADY_MATCHED'
                              ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                              : 'text-slate-400 hover:text-emerald-300'
                          }`}
                        >
                          <span>Sudah Sesuai</span>
                          <span className="bg-emerald-500/30 text-emerald-200 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                            {excelMatches.matchingCount}
                          </span>
                        </button>
                      </div>

                      {/* Quick Selection Buttons */}
                      <div className="flex flex-wrap items-center gap-1.5 font-semibold text-[11px]">
                        <button
                          type="button"
                          onClick={checkOnlyDifferingExcel}
                          className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl transition-all"
                        >
                          Centang Belum Sesuai ({excelMatches.differingCount})
                        </button>
                        <button
                          type="button"
                          onClick={checkAllMatchedExcel}
                          className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl transition-all"
                        >
                          Centang Semua
                        </button>
                        <button
                          type="button"
                          onClick={uncheckAllExcel}
                          className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10 rounded-xl transition-all"
                        >
                          Kosongkan
                        </button>
                      </div>
                    </div>

                    {/* Excel Preview Table */}
                    <div className="max-h-[500px] overflow-y-auto rounded-2xl border border-white/10 bg-[#12141d]/90 scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse font-mono">
                        <thead className="sticky top-0 bg-[#1a1d29] text-slate-400 uppercase text-[10px] font-bold border-b border-white/10">
                          <tr>
                            <th className="p-3 text-center w-10">
                              <input
                                type="checkbox"
                                checked={
                                  excelMatches.matched
                                    .filter(m => {
                                      if (excelFilterStatus === 'NEED_UPDATE') return !m.isMatching;
                                      if (excelFilterStatus === 'ALREADY_MATCHED') return m.isMatching;
                                      return true;
                                    })
                                    .length > 0 &&
                                  excelMatches.matched
                                    .filter(m => {
                                      if (excelFilterStatus === 'NEED_UPDATE') return !m.isMatching;
                                      if (excelFilterStatus === 'ALREADY_MATCHED') return m.isMatching;
                                      return true;
                                    })
                                    .every(m => excelCheckedUuids.has(m.catalogItem.uuid))
                                }
                                onChange={() => {
                                  const filtered = excelMatches.matched.filter(m => {
                                    if (excelFilterStatus === 'NEED_UPDATE') return !m.isMatching;
                                    if (excelFilterStatus === 'ALREADY_MATCHED') return m.isMatching;
                                    return true;
                                  });
                                  toggleExcelCheckAllFiltered(filtered);
                                }}
                                className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                              />
                            </th>
                            <th className="p-3">#</th>
                            <th className="p-3 font-sans">Nama Produk</th>
                            <th className="p-3">Key / Barcode</th>
                            <th className="p-3 text-center font-sans">Status Kesesuaian</th>
                            {excelPriceColumn && <th className="p-3 text-right text-emerald-400">Harga Jual ({excelPriceColumn})</th>}
                            {excelCostColumn && <th className="p-3 text-right text-amber-400">Modal / HPP ({excelCostColumn})</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {excelMatches.matched
                            .filter(m => {
                              if (excelFilterStatus === 'NEED_UPDATE') return !m.isMatching;
                              if (excelFilterStatus === 'ALREADY_MATCHED') return m.isMatching;
                              return true;
                            })
                            .map((m, idx) => (
                            <tr key={idx} className="hover:bg-white/5">
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={excelCheckedUuids.has(m.catalogItem.uuid)}
                                  onChange={() => toggleExcelCheckItem(m.catalogItem.uuid)}
                                  className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                                />
                              </td>
                              <td className="p-3 text-slate-500">{m.rowNum}</td>
                              <td className="p-3 font-sans text-slate-200 font-medium">{m.catalogItem.goodsName}</td>
                              <td className="p-3 text-slate-400">{m.excelKey}</td>
                              <td className="p-3 text-center font-sans">
                                {m.isMatching ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Sudah Sesuai</span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">⚠ Belum Sesuai</span>
                                )}
                              </td>
                              {excelPriceColumn && (
                                <td className="p-3 text-right">
                                  <span className="text-slate-500 line-through text-[11px] mr-2">Rp {m.currentSalePrice.toLocaleString('id-ID')}</span>
                                  <span className="text-emerald-400 font-bold">Rp {m.newSalePrice.toLocaleString('id-ID')}</span>
                                </td>
                              )}
                              {excelCostColumn && (
                                <td className="p-3 text-right">
                                  <span className="text-slate-500 line-through text-[11px] mr-2">Rp {m.currentCostPrice.toLocaleString('id-ID')}</span>
                                  <span className="text-amber-400 font-bold">Rp {m.newCostPrice.toLocaleString('id-ID')}</span>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Log Console Box on Excel Page */}
                    <div className="liquid-glass rounded-3xl p-5 border border-white/5 space-y-3 mt-4">
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                        <span>Log Eksekusi Penyesuaian Harga</span>
                        <button
                          type="button"
                          onClick={() => setSyncLogs([])}
                          className="hover:text-white underline text-[11px]"
                        >
                          Bersihkan Log
                        </button>
                      </div>
                      <div className="bg-[#0c0d12] rounded-2xl p-4 h-36 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1 scrollbar-thin border border-white/5">
                        {syncLogs.length === 0 ? (
                          <div className="text-slate-600 italic">Belum ada aktivitas eksekusi...</div>
                        ) : (
                          syncLogs.map((log, index) => (
                            <div key={index} className="leading-relaxed">{log}</div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0b0c11] border border-white/10 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <div className="bg-amber-500/10 p-2 rounded-xl text-amber-400">
                <Warning size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Konfirmasi Sinkronisasi</h3>
                <p className="text-xs text-slate-400">Harap periksa kembali sebelum melanjutkan</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-white/2 rounded-2xl p-4 border border-white/5 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Total Produk Terpilih:</span>
                  <span className="font-bold text-white bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 font-mono text-xs">
                    {selectedIds.size} Item
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Target Portal:</span>
                  <span className="font-bold text-sky-400 text-xs bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
                    {targetType === 'grabotech' ? 'Grabotech' : targetType === 'itspc' ? 'VM Putih' : targetType === 'yyvendor' ? 'Yunyin' : 'VM Oren'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Mode Sinkronisasi:</span>
                  <span className="font-bold text-emerald-400 text-xs">
                    {syncMode === 'both' && 'Copy & Price'}
                    {syncMode === 'copy' && 'Copy Only'}
                    {syncMode === 'price' && 'Price Only'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSyncGoods}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-[#090a0f] text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  <Play size={14} weight="fill" />
                  <span>Start Synchronization</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
