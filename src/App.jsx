import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Key, 
  ArrowsClockwise, 
  Play, 
  Stop,
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
  Tag,
  Sliders,
  CaretDown
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
  const [sourceType, setSourceType] = useState('main'); // 'main' (VM Putih), 'itspc' (VM Oren), 'grabotech' (Grabotech), 'yyvendor' (Yunyin)
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
  const [targetType, setTargetType] = useState('main'); // Default to VM Putih ('main')
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
  const [customLimit, setCustomLimit] = useState('');
  const [activeLimitPreset, setActiveLimitPreset] = useState(null); // 10, 50, 100, 200, 500, 'all', 'custom', or null

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
  const [enableFuzzyMatch, setEnableFuzzyMatch] = useState(true);
  const [excelFuzzyThreshold, setExcelFuzzyThreshold] = useState(0.6);
  const [excelUpdateTarget, setExcelUpdateTarget] = useState('both'); // 'both', 'cost_only', 'sale_only'
  const [showExcelAdvanced, setShowExcelAdvanced] = useState(false);
  const [showExcelLogs, setShowExcelLogs] = useState(false);

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
  const fetchGoods = async (token = sourceToken, portalType = sourceType) => {
    if (!token) return;
    setIsFetchingGoods(true);
    setGoodsFetchError('');
    try {
      const response = await fetch('/api/goods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type: portalType })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const goodsList = Array.isArray(data.goods) ? data.goods : (Array.isArray(data.data) ? data.data : []);
        setGoods(goodsList);
        setOriginalGoods(JSON.parse(JSON.stringify(goodsList)));
        setSelectedIds(new Set());
        addLog(`Loaded ${goodsList.length} goods from Source account.`);
      } else {
        const errMsg = data.error || 'Failed to fetch Source goods';
        setGoodsFetchError(errMsg);
        addLog(`Error: ${errMsg}`);
      }
    } catch (err) {
      setGoodsFetchError('Server error while fetching Source goods: ' + err.message);
      addLog(`Error: Network error fetching Source goods`);
    } finally {
      setIsFetchingGoods(false);
    }
  };

  const fetchTargetGoods = async (token = targetToken, portalType = targetType) => {
    if (!token) return;
    setIsLoadingTargetGoods(true);
    try {
      const response = await fetch('/api/goods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type: portalType })
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

  const handleSelectByLimit = (count) => {
    const limit = parseInt(count, 10);
    if (isNaN(limit) || limit <= 0) {
      setSelectedIds(new Set());
      setActiveLimitPreset(null);
      return;
    }
    const selectedSlice = filteredGoods.slice(0, limit);
    setSelectedIds(new Set(selectedSlice.map(g => g.uuid)));
    setActiveLimitPreset(limit);
  };

  const cancelSyncRef = useRef(false);

  const handleStopSync = () => {
    if (isSyncing) {
      cancelSyncRef.current = true;
      addLog('🛑 [STOP PAKSA] Permintaan penghentian sinkronisasi diterima. Menghentikan...');
    }
  };

  // --- HANDLERS: SYNC GOODS TO TARGET ---
  const handleSyncGoods = async () => {
    if (isSyncing || selectedIds.size === 0 || !targetToken || !targetUser) return;

    const currentCatalog = activeCatalogTab === 'source' ? goods : targetGoods;
    const selectedList = currentCatalog.filter(g => selectedIds.has(g.uuid));
    const total = selectedList.length;

    cancelSyncRef.current = false;
    setIsSyncing(true);
    setShowConfirmModal(false);
    
    setSyncProgress({ current: 0, total, success: 0, skipped: 0, error: 0 });
    setSyncResults({});
    addLog(`Starting synchronization of ${total} selected items...`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < total; i++) {
      if (cancelSyncRef.current) {
        addLog(`🛑 Sinkronisasi dihentikan paksa oleh pengguna di item ke-${i + 1}/${total}.`);
        break;
      }

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

        if (cancelSyncRef.current) {
          addLog(`🛑 Sinkronisasi dihentikan paksa oleh pengguna saat memproses "${good.goodsName}".`);
          break;
        }

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
        if (cancelSyncRef.current) {
          addLog(`🛑 Sinkronisasi dihentikan paksa oleh pengguna.`);
          break;
        }
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

      if (cancelSyncRef.current) {
        addLog(`🛑 Sinkronisasi dihentikan paksa oleh pengguna.`);
        break;
      }

      await new Promise(r => setTimeout(r, 600));
    }

    setIsSyncing(false);
    if (cancelSyncRef.current) {
      addLog(`🛑 Sinkronisasi dihentikan oleh pengguna. Diproses: ${successCount + skippedCount + errorCount}/${total} (Berhasil: ${successCount}, Skip: ${skippedCount}, Gagal: ${errorCount}).`);
    } else {
      addLog(`Sync finished. Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${errorCount}.`);
    }
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

  // --- FUZZY / SIMILAR MATCHING HELPER FUNCTIONS ---
  const normalizeStr = (str) => {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const levenshteinDistance = (a, b) => {
    const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  };

  const calculateSimilarity = (str1, str2) => {
    const norm1 = normalizeStr(str1);
    const norm2 = normalizeStr(str2);

    if (!norm1 || !norm2) return 0.0;
    if (norm1 === norm2) return 1.0;

    const maxLen = Math.max(norm1.length, norm2.length);
    const levDist = levenshteinDistance(norm1, norm2);
    const levRatio = maxLen > 0 ? (maxLen - levDist) / maxLen : 0;

    const tokens1 = new Set(norm1.split(' ').filter(Boolean));
    const tokens2 = new Set(norm2.split(' ').filter(Boolean));
    let intersection = 0;
    tokens1.forEach(t => {
      if (tokens2.has(t)) intersection++;
    });
    const union = new Set([...tokens1, ...tokens2]).size;
    const tokenRatio = union > 0 ? intersection / union : 0;

    let substringBonus = 0;
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      substringBonus = 0.15;
    }

    const finalScore = Math.min(1.0, (levRatio * 0.45) + (tokenRatio * 0.55) + substringBonus);
    return Math.round(finalScore * 100) / 100;
  };

  const excelMatches = useMemo(() => {
    if (!excelHeaders.length || !excelKeyColumn || (!excelPriceColumn && !excelCostColumn) || !excelRows.length) {
      return { matched: [], unmatchedCount: 0, totalRows: 0, matchingCount: 0, differingCount: 0, exactCount: 0, similarCount: 0 };
    }
    const activeCatalog = activeCatalogTab === 'source' ? goods : targetGoods;
    const keyIndex = excelHeaders.indexOf(excelKeyColumn);
    const saleIndex = excelPriceColumn ? excelHeaders.indexOf(excelPriceColumn) : -1;
    const costIndex = excelCostColumn ? excelHeaders.indexOf(excelCostColumn) : -1;
    if (keyIndex === -1) return { matched: [], unmatchedCount: 0, totalRows: 0, matchingCount: 0, differingCount: 0, exactCount: 0, similarCount: 0 };

    const catalogMap = new Map();
    const catalogItemsWithKeys = [];

    activeCatalog.forEach(item => {
      let rawKeyVal = (excelMatchingField === 'goodsCode' ? item.goodsCode : item.goodsName) || '';
      let key = String(rawKeyVal).trim().toLowerCase();
      if (key) {
        catalogMap.set(key, item);
        catalogItemsWithKeys.push({ item, rawKeyVal });
      }
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
    let exactCount = 0;
    let similarCount = 0;

    excelRows.forEach((row, idx) => {
      const rawKey = row[keyIndex];
      if (rawKey === undefined || rawKey === null || String(rawKey).trim() === '') return;
      const keyStr = String(rawKey).trim().toLowerCase();

      let catalogItem = catalogMap.get(keyStr);
      let matchType = 'exact';
      let similarityScore = 1.0;

      // Fuzzy / Similar Match if exact match fails
      if (!catalogItem && enableFuzzyMatch && catalogItemsWithKeys.length > 0) {
        let bestScore = 0;
        let bestItem = null;

        for (const catObj of catalogItemsWithKeys) {
          const score = calculateSimilarity(rawKey, catObj.rawKeyVal);
          if (score > bestScore) {
            bestScore = score;
            bestItem = catObj.item;
          }
        }

        if (bestItem && bestScore >= excelFuzzyThreshold) {
          catalogItem = bestItem;
          matchType = 'similar';
          similarityScore = bestScore;
        }
      }

      if (catalogItem) {
        if (matchType === 'exact') exactCount++;
        else similarCount++;

        const currentSalePrice = parseFloat(catalogItem.goodsPrice) || 0;
        const currentCostPrice = parseFloat(catalogItem.costPrice) || 0;

        const rawSaleVal = saleIndex !== -1 ? row[saleIndex] : null;
        const rawCostVal = costIndex !== -1 ? row[costIndex] : null;

        const newSalePrice = saleIndex !== -1 ? parseNum(rawSaleVal) : currentSalePrice;
        const newCostPrice = costIndex !== -1 ? parseNum(rawCostVal) : currentCostPrice;

        const saleDiff = newSalePrice - currentSalePrice;
        const costDiff = newCostPrice - currentCostPrice;

        // Flags for what prices to update based on excelUpdateTarget
        const hasSaleChange = saleIndex !== -1 && (excelUpdateTarget === 'both' || excelUpdateTarget === 'sale_only');
        const hasCostChange = costIndex !== -1 && (excelUpdateTarget === 'both' || excelUpdateTarget === 'cost_only');

        const isSaleMatching = !hasSaleChange || saleDiff === 0;
        const isCostMatching = !hasCostChange || costDiff === 0;
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
          hasSaleChange,
          hasCostChange,
          isMatching,
          matchType,
          similarityScore
        });
      } else {
        unmatchedCount++;
      }
    });

    return {
      matched,
      unmatchedCount,
      totalRows: excelRows.length,
      matchingCount,
      differingCount,
      exactCount,
      similarCount
    };
  }, [
    excelHeaders,
    excelKeyColumn,
    excelPriceColumn,
    excelCostColumn,
    excelRows,
    excelMatchingField,
    activeCatalogTab,
    goods,
    targetGoods,
    enableFuzzyMatch,
    excelFuzzyThreshold,
    excelUpdateTarget
  ]);

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
      <header className="border-b border-slate-800 py-4 px-6 md:px-12 liquid-glass sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="bg-slate-800 p-2.5 rounded-2xl border border-slate-700 text-slate-200">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">IT AUTOMATION</h1>
              <p className="text-xs text-slate-400 mt-1">Goods Sync Automation</p>
            </div>
          </div>

          {/* Top Page Navigation Switcher */}
          <div className="flex items-center bg-[#0d0e15] p-1.5 rounded-2xl border border-slate-800 gap-1.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveNavTab('sync')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                activeNavTab === 'sync'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
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
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Coins size={16} />
              <span>Penyesuaian Harga Excel</span>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                Baru
              </span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-3 text-xs font-mono">
            {sourceToken && (
              <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-status-pulse"></span>
                Source Connected
              </span>
            )}
            {targetToken && (
              <span className="flex items-center gap-1.5 bg-sky-500/10 text-sky-400 px-2.5 py-1 rounded-full border border-sky-500/20">
                <span className="h-2 w-2 rounded-full bg-sky-400 animate-status-pulse"></span>
                Target Connected
              </span>
            )}
          </div>
        </div>
      </header>

      {/* PAGE VIEW 1: FULL HIGH-AGENCY BENTO STUDIO WORKSPACE */}
      {activeNavTab === 'sync' && (
        <main className="max-w-7xl w-full mx-auto px-6 md:px-12 mt-8 flex-1 space-y-8 animate-fadeIn">
          
          {/* Top Horizontal Bento Connection Hub (Side-by-Side Source & Target) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Source Account Bento Card */}
            <section className="liquid-glass rounded-3xl p-6 border border-slate-800 space-y-4 spring-transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-800 p-2.5 rounded-2xl text-slate-300 border border-slate-700">
                    <Database size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Source Account</h2>
                    <p className="text-[11px] text-slate-400">Akun Asal (Pengambil Data Produk)</p>
                  </div>
                </div>
                {sourceToken && (
                  <span className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-300 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-500/30">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-status-pulse"></span>
                    Connected
                  </span>
                )}
              </div>
              
              <form onSubmit={handleLoginSource} className="space-y-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Source Portal Type</label>
                  <div className="flex bg-[#0d0e15] p-1 border border-slate-800 rounded-xl gap-1 text-xs">
                    <button
                      type="button"
                      disabled={sourceToken !== ''}
                      onClick={() => setSourceType('main')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        sourceType === 'main' 
                          ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      VM Putih
                    </button>
                    <button
                      type="button"
                      disabled={sourceToken !== ''}
                      onClick={() => setSourceType('itspc')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        sourceType === 'itspc' 
                          ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      VM Oren
                    </button>
                    {!isVercel && (
                      <button
                        type="button"
                        disabled={sourceToken !== ''}
                        onClick={() => setSourceType('grabotech')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          sourceType === 'grabotech' 
                            ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Grabotech
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={sourceToken !== ''}
                      onClick={() => setSourceType('yyvendor')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        sourceType === 'yyvendor' 
                          ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Yunyin
                    </button>
                  </div>
                </div>

                {!sourceToken ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <input 
                        type="text" 
                        value={sourceAccount}
                        onChange={(e) => setSourceAccount(e.target.value)}
                        placeholder="Username Source" 
                        className="w-full bg-[#0d0e15] border border-slate-800 focus:border-slate-600 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-all font-medium"
                      />
                    </div>
                    <div>
                      <input 
                        type="password" 
                        value={sourcePwd}
                        onChange={(e) => setSourcePwd(e.target.value)}
                        placeholder="Password Source" 
                        className="w-full bg-[#0d0e15] border border-slate-800 focus:border-slate-600 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-all font-medium"
                      />
                    </div>
                  </div>
                ) : null}

                {sourceType === 'grabotech' && !sourceToken && (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={sourceVifCode}
                      onChange={(e) => setSourceVifCode(e.target.value)}
                      placeholder="Input CAPTCHA" 
                      className="flex-1 bg-[#0d0e15] border border-slate-800 focus:border-slate-600 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                    {sourceCaptchaUrl ? (
                      <div className="flex items-center gap-1.5 bg-[#0d0e15] border border-slate-800 rounded-xl p-1 shrink-0">
                        <img src={sourceCaptchaUrl} alt="CAPTCHA" className="h-[30px] rounded object-contain" />
                        <button type="button" onClick={loadSourceCaptcha} className="p-1.5 text-slate-400 hover:text-white">
                          <ArrowsClockwise size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {sourceLoginError && (
                  <div className="bg-rose-500/10 text-rose-400 p-2.5 rounded-xl border border-rose-500/20 text-xs flex gap-2 items-center">
                    <Warning size={14} className="shrink-0" />
                    <span>{sourceLoginError}</span>
                  </div>
                )}

                {sourceUser ? (
                  <div className="bg-[#0d0e15] rounded-2xl p-3 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
                    <div>
                      <span className="font-semibold text-white block">{sourceUser.contactMan || sourceAccount}</span>
                      <span className="text-[11px] text-slate-400">{goods.length} produk katalog dimuat</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => { setSourceToken(''); setSourceUser(null); setGoods([]); }}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] font-semibold rounded-xl transition-all"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button 
                    type="submit" 
                    disabled={isLoggingInSource}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
                  >
                    {isLoggingInSource ? <ArrowsClockwise size={14} className="animate-spin" /> : <Key size={14} />}
                    <span>Login & Muat Katalog Source</span>
                  </button>
                )}
              </form>
            </section>

            {/* 2. Target Account Bento Card */}
            <section className="liquid-glass rounded-3xl p-6 border border-slate-800 space-y-4 spring-transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-800 p-2.5 rounded-2xl text-slate-300 border border-slate-700">
                    <Storefront size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Target Account</h2>
                    <p className="text-[11px] text-slate-400">Akun Tujuan (Penerima Update Produk)</p>
                  </div>
                </div>
                {targetToken && (
                  <span className="flex items-center gap-1.5 bg-sky-500/15 text-sky-300 text-xs font-semibold px-3 py-1 rounded-full border border-sky-500/30">
                    <span className="h-2 w-2 rounded-full bg-sky-400 animate-status-pulse"></span>
                    Connected
                  </span>
                )}
              </div>
              
              <form onSubmit={handleLoginTarget} className="space-y-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Target Portal Type</label>
                  <div className="flex bg-[#0d0e15] p-1 border border-slate-800 rounded-xl gap-1 text-xs">
                    <button
                      type="button"
                      disabled={targetToken !== ''}
                      onClick={() => setTargetType('main')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        targetType === 'main' 
                          ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      VM Putih
                    </button>
                    <button
                      type="button"
                      disabled={targetToken !== ''}
                      onClick={() => setTargetType('itspc')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        targetType === 'itspc' 
                          ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      VM Oren
                    </button>
                    {!isVercel && (
                      <button
                        type="button"
                        disabled={targetToken !== ''}
                        onClick={() => setTargetType('grabotech')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          targetType === 'grabotech' 
                            ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Grabotech
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={targetToken !== ''}
                      onClick={() => setTargetType('yyvendor')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        targetType === 'yyvendor' 
                          ? 'bg-slate-800 text-white border border-slate-700 shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Yunyin
                    </button>
                  </div>
                </div>

                {!targetToken ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <input 
                        type="text" 
                        value={targetAccount}
                        onChange={(e) => setTargetAccount(e.target.value)}
                        placeholder="Username Target" 
                        className="w-full bg-[#0d0e15] border border-slate-800 focus:border-slate-600 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-all font-medium"
                      />
                    </div>
                    <div>
                      <input 
                        type="password" 
                        value={targetPwd}
                        onChange={(e) => setTargetPwd(e.target.value)}
                        placeholder="Password Target" 
                        className="w-full bg-[#0d0e15] border border-slate-800 focus:border-slate-600 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-all font-medium"
                      />
                    </div>
                  </div>
                ) : null}

                {targetType === 'grabotech' && !targetToken && (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={targetVifCode}
                      onChange={(e) => setTargetVifCode(e.target.value)}
                      placeholder="Input CAPTCHA" 
                      className="flex-1 bg-[#0d0e15] border border-slate-800 focus:border-slate-600 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                    {targetCaptchaUrl ? (
                      <div className="flex items-center gap-1.5 bg-[#0d0e15] border border-slate-800 rounded-xl p-1 shrink-0">
                        <img src={targetCaptchaUrl} alt="CAPTCHA" className="h-[30px] rounded object-contain" />
                        <button type="button" onClick={loadTargetCaptcha} className="p-1.5 text-slate-400 hover:text-white">
                          <ArrowsClockwise size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {targetLoginError && (
                  <div className="bg-rose-500/10 text-rose-400 p-2.5 rounded-xl border border-rose-500/20 text-xs flex gap-2 items-center">
                    <Warning size={14} className="shrink-0" />
                    <span>{targetLoginError}</span>
                  </div>
                )}

                {targetUser ? (
                  <div className="bg-[#0d0e15] rounded-2xl p-3 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
                    <div>
                      <span className="font-semibold text-white block">{targetUser.contactMan || targetAccount}</span>
                      <span className="text-[11px] text-slate-400">{targetGoods.length} produk katalog target</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => { setTargetToken(''); setTargetUser(null); setTargetGoods([]); }}
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] font-semibold rounded-xl transition-all"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button 
                    type="submit" 
                    disabled={isLoggingInTarget}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
                  >
                    {isLoggingInTarget ? <ArrowsClockwise size={14} className="animate-spin" /> : <Key size={14} />}
                    <span>Login & Muat Katalog Target</span>
                  </button>
                )}
              </form>
            </section>

          </div>

          {/* Full-Width Synchronization Panel & Catalog Studio */}
          <div className="space-y-6">

            {/* Synchronization Panel */}
            <section className="liquid-glass rounded-3xl p-6 border border-slate-800 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <ArrowsClockwise className="text-slate-300" size={20} />
                    <span>Panel Sinkronisasi Produk</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Centang produk di katalog bawah untuk disinkronkan ke server akun target</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">Mode Sync:</span>
                    <div className="flex bg-[#0d0e15] p-1 border border-slate-800 rounded-xl gap-1 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setSyncMode('both')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          syncMode === 'both'
                            ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Copy & Harga
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyncMode('copy')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          syncMode === 'copy'
                            ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Copy Saja
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyncMode('price')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          syncMode === 'price'
                            ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Harga Saja
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyncMode('image')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          syncMode === 'image'
                            ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Gambar Saja
                      </button>
                    </div>
                  </div>

                  {isSyncing ? (
                    <button
                      type="button"
                      onClick={handleStopSync}
                      className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-[0.98] animate-pulse"
                    >
                      <Stop size={16} weight="fill" />
                      <span>Stop Paksa Sinkron</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      disabled={selectedIds.size === 0 || !targetToken}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all shadow-sm active:scale-[0.98]"
                    >
                      <Play size={16} weight="fill" />
                      <span>Sinkronkan Produk Terpilih ({selectedIds.size})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Product Limit / Batch Selection Controls */}
              <div className="pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sliders size={16} className="text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-200">Mau Up Berapa Product:</span>
                  {selectedIds.size > 0 && (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 font-semibold">
                      Terpilih: {selectedIds.size} / {filteredGoods.length}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {[10, 50, 100, 200, 500].map((num) => {
                    const isSelected = activeLimitPreset === num && selectedIds.size === Math.min(num, filteredGoods.length);
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          handleSelectByLimit(num);
                          setCustomLimit('');
                        }}
                        className={`px-3 py-1.5 rounded-xl font-semibold transition-all active:scale-[0.98] ${
                          isSelected
                            ? 'bg-emerald-500 text-[#090a0f] font-bold border border-emerald-400 shadow-md shadow-emerald-500/20'
                            : 'bg-[#0d0e15] hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {num === 10 ? '10 doang' : `${num}`}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      handleSelectAll({ target: { checked: true } });
                      setActiveLimitPreset('all');
                      setCustomLimit('');
                    }}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition-all active:scale-[0.98] ${
                      activeLimitPreset === 'all' || (filteredGoods.length > 0 && selectedIds.size === filteredGoods.length)
                        ? 'bg-emerald-500 text-[#090a0f] font-bold border border-emerald-400 shadow-md shadow-emerald-500/20'
                        : 'bg-[#0d0e15] hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Semua ({filteredGoods.length})
                  </button>

                  {/* Custom Input Box */}
                  <div className={`flex items-center gap-1.5 bg-[#0d0e15] border rounded-xl px-2.5 py-1 transition-all ${
                    activeLimitPreset === 'custom' ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-slate-800 hover:border-slate-700'
                  }`}>
                    <span className="text-[11px] text-slate-400 font-semibold">Custom:</span>
                    <input
                      type="number"
                      min="1"
                      max={filteredGoods.length || 9999}
                      placeholder="Jumlah"
                      value={customLimit}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomLimit(val);
                        if (val && !isNaN(val) && Number(val) > 0) {
                          handleSelectByLimit(Number(val));
                          setActiveLimitPreset('custom');
                        } else if (val === '') {
                          setSelectedIds(new Set());
                          setActiveLimitPreset(null);
                        }
                      }}
                      className="w-16 bg-transparent text-emerald-400 font-bold text-xs focus:outline-none placeholder-slate-600 font-mono"
                    />
                  </div>

                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIds(new Set());
                        setActiveLimitPreset(null);
                        setCustomLimit('');
                      }}
                      className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-[11px] font-semibold transition-all active:scale-[0.98]"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Sync Progress Indicator */}
              {isSyncing && (
                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300 font-semibold flex items-center gap-2">
                      <ArrowsClockwise size={14} className="animate-spin text-emerald-400" />
                      Proses: {syncProgress.current} / {syncProgress.total} produk
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      Berhasil: {syncProgress.success} | Skip: {syncProgress.skipped} | Gagal: {syncProgress.error}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
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
                    <option value="main">VM Putih (SANY POS)</option>
                    <option value="itspc">VM Oren (ITSPC)</option>
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

                {/* Main Automated Summary & Big Action Card (Monochrome) */}
                <div className="bg-[#12141e] p-6 rounded-3xl border border-white/10 space-y-6 shadow-xl relative overflow-hidden">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    
                    {/* Left Column: Automated Analysis Summary */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white px-3 py-1 rounded-full border border-white/20">
                          Hasil Deteksi Otomatis
                        </span>
                      </div>
                      <h2 className="text-xl font-bold text-white tracking-tight">
                        {excelMatches.differingCount > 0 ? (
                          <span className="text-zinc-200">
                            Ditemukan {excelMatches.differingCount} produk yang perlu di-update harganya
                          </span>
                        ) : (
                          <span className="text-white">
                            Semua harga produk ({excelMatches.matchingCount}) sudah sesuai dengan Excel!
                          </span>
                        )}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-medium">
                        <span>Total Cocok: <strong className="text-white font-mono">{excelMatches.matched.length} produk</strong></span>
                        <span>•</span>
                        <span>Dicocokkan Mirip: <strong className="text-slate-200 font-mono">{excelMatches.similarCount} produk</strong></span>
                        <span>•</span>
                        <span>Sudah Sesuai: <strong className="text-white font-mono">{excelMatches.matchingCount} produk</strong></span>
                      </div>
                    </div>

                    {/* Right Column: Direct One-Click Execution Button */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleApplyExcelPrices(true, true)}
                        disabled={excelCheckedUuids.size === 0 || isSyncing}
                        className="px-8 py-3.5 bg-white hover:bg-zinc-200 text-zinc-950 disabled:opacity-30 text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                      >
                        <Play size={18} weight="fill" />
                        <span>UPDATE {excelCheckedUuids.size} PRODUK KE SERVER TARGET</span>
                      </button>
                    </div>

                  </div>

                  {/* Simple Update Mode Pills & Advanced Toggle */}
                  <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-bold text-slate-300">Pilih Yang Ingin Diupdate:</span>
                      <div className="flex items-center bg-[#0d0e15] p-1 rounded-xl border border-slate-800 gap-1 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => setExcelUpdateTarget('both')}
                          className={`px-3.5 py-1.5 rounded-lg transition-all ${
                            excelUpdateTarget === 'both'
                              ? 'bg-white text-zinc-950 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          HPP & Harga Jual
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcelUpdateTarget('cost_only')}
                          className={`px-3.5 py-1.5 rounded-lg transition-all ${
                            excelUpdateTarget === 'cost_only'
                              ? 'bg-white text-zinc-950 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          HPP (Modal) Saja
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcelUpdateTarget('sale_only')}
                          className={`px-3.5 py-1.5 rounded-lg transition-all ${
                            excelUpdateTarget === 'sale_only'
                              ? 'bg-white text-zinc-950 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Harga Jual Saja
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Advanced Settings Button */}
                    <button
                      type="button"
                      onClick={() => setShowExcelAdvanced(prev => !prev)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-semibold py-1.5 px-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all"
                    >
                      <Sliders size={14} />
                      <span>{showExcelAdvanced ? 'Sembunyikan Pengaturan Kolom' : 'Pengaturan Kolom Excel (Opsional)'}</span>
                      <CaretDown size={12} className={`transition-transform duration-200 ${showExcelAdvanced ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Collapsible Advanced Settings Panel */}
                  {showExcelAdvanced && (
                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span>Pengaturan Pemetaan Kolom Excel & Pencocokan</span>
                        <span className="text-[10px] text-slate-500">Ubah hanya jika deteksi otomatis keliru</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                        <div className="bg-[#12141d] p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-400 font-semibold">1. Kolom Key Excel:</span>
                          <select
                            value={excelKeyColumn}
                            onChange={(e) => setExcelKeyColumn(e.target.value)}
                            className="bg-transparent text-white font-medium focus:outline-none text-xs"
                          >
                            {excelHeaders.map((h, idx) => (
                              <option key={`${h}_${idx}`} value={h} className="bg-[#12141d]">{h}</option>
                            ))}
                          </select>
                        </div>

                        <div className="bg-[#12141d] p-3 rounded-xl border border-white/5 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-400 font-semibold">2. Tipe Key Catalog:</span>
                          <select
                            value={excelMatchingField}
                            onChange={(e) => setExcelMatchingField(e.target.value)}
                            className="bg-transparent text-white font-medium focus:outline-none text-xs"
                          >
                            <option value="goodsCode" className="bg-[#12141d]">Barcode / Kode Produk</option>
                            <option value="goodsName" className="bg-[#12141d]">Nama Produk</option>
                          </select>
                        </div>

                        <div className="bg-[#12141d] p-3 rounded-xl border border-emerald-500/20 flex flex-col gap-1">
                          <span className="text-[10px] text-emerald-400 font-semibold">3. Kolom Harga Jual:</span>
                          <select
                            value={excelPriceColumn}
                            onChange={(e) => setExcelPriceColumn(e.target.value)}
                            className="bg-transparent text-emerald-300 font-bold focus:outline-none text-xs"
                          >
                            <option value="" className="bg-[#12141d]">-- Abaikan --</option>
                            {excelHeaders.map((h, idx) => (
                              <option key={`${h}_${idx}`} value={h} className="bg-[#12141d]">{h}</option>
                            ))}
                          </select>
                        </div>

                        <div className="bg-[#12141d] p-3 rounded-xl border border-amber-500/20 flex flex-col gap-1">
                          <span className="text-[10px] text-amber-400 font-semibold">4. Kolom Modal (HPP):</span>
                          <select
                            value={excelCostColumn}
                            onChange={(e) => setExcelCostColumn(e.target.value)}
                            className="bg-transparent text-amber-300 font-bold focus:outline-none text-xs"
                          >
                            <option value="" className="bg-[#12141d]">-- Abaikan --</option>
                            {excelHeaders.map((h, idx) => (
                              <option key={`${h}_${idx}`} value={h} className="bg-[#12141d]">{h}</option>
                            ))}
                          </select>
                        </div>

                        <div className="bg-[#12141d] p-3 rounded-xl border border-purple-500/20 flex flex-col gap-1">
                          <span className="text-[10px] text-purple-300 font-semibold">5. Pencocokan Mirip:</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={enableFuzzyMatch}
                              onChange={(e) => setEnableFuzzyMatch(e.target.checked)}
                              className="w-3.5 h-3.5 accent-purple-500 rounded cursor-pointer"
                            />
                            <select
                              value={excelFuzzyThreshold}
                              onChange={(e) => setExcelFuzzyThreshold(parseFloat(e.target.value))}
                              disabled={!enableFuzzyMatch}
                              className="bg-transparent text-purple-200 text-xs font-bold focus:outline-none disabled:opacity-40"
                            >
                              <option value={0.5} className="bg-[#12141d]">50% (Fleksibel)</option>
                              <option value={0.6} className="bg-[#12141d]">60% (Sedang)</option>
                              <option value={0.7} className="bg-[#12141d]">70% (Ketat)</option>
                              <option value={0.8} className="bg-[#12141d]">80% (Sangat Ketat)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Progress Bar Indicator with Detailed Counts */}
                {(isSyncing || syncProgress.total > 0) && (
                  <div className="bg-[#12141d]/90 p-5 rounded-2xl border border-emerald-500/30 space-y-3 shadow-xl">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono">
                      <span className="text-slate-200 font-bold flex items-center gap-2">
                        {isSyncing ? (
                          <ArrowsClockwise size={16} className="animate-spin text-emerald-400" />
                        ) : (
                          <CheckCircle size={16} className="text-emerald-400" />
                        )}
                        Status Update Server: {syncProgress.current} / {syncProgress.total} produk
                      </span>
                      <div className="flex items-center gap-3 font-bold text-xs">
                        <span className="text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle size={14} /> Berhasil: {syncProgress.success}
                        </span>
                        <span className="text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20 flex items-center gap-1">
                          <Info size={14} /> Skip: {syncProgress.skipped}
                        </span>
                        <span className="text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 flex items-center gap-1">
                          <XCircle size={14} /> Gagal: {syncProgress.error}
                        </span>
                        {isSyncing && (
                          <button
                            type="button"
                            onClick={handleStopSync}
                            className="ml-2 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm active:scale-95 animate-pulse"
                          >
                            <Stop size={14} weight="fill" />
                            <span>Stop Paksa</span>
                          </button>
                        )}
                      </div>
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
                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#12141d]/80 p-3 rounded-2xl border border-white/5 text-xs">
                      {/* Filter Status Tabs */}
                      <div className="flex flex-wrap items-center bg-[#1a1d29] p-1 rounded-xl border border-white/10 gap-1 font-semibold">
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
                        <button
                          type="button"
                          onClick={() => setExcelFilterStatus('SIMILAR')}
                          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            excelFilterStatus === 'SIMILAR'
                              ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30'
                              : 'text-slate-400 hover:text-purple-300'
                          }`}
                        >
                          <span>Mirip (Fuzzy)</span>
                          <span className="bg-purple-500/30 text-purple-200 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                            {excelMatches.similarCount}
                          </span>
                        </button>

                        {/* Server Status Filters */}
                        {syncProgress.total > 0 && (
                          <>
                            <div className="w-[1px] h-4 bg-white/10 mx-1"></div>
                            <button
                              type="button"
                              onClick={() => setExcelFilterStatus('SYNC_SUCCESS')}
                              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                                excelFilterStatus === 'SYNC_SUCCESS'
                                  ? 'bg-emerald-500/30 text-emerald-300 font-bold border border-emerald-500/40'
                                  : 'text-slate-400 hover:text-emerald-300'
                              }`}
                            >
                              <CheckCircle size={12} />
                              <span>Berhasil ({syncProgress.success})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExcelFilterStatus('SYNC_SKIPPED')}
                              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                                excelFilterStatus === 'SYNC_SKIPPED'
                                  ? 'bg-sky-500/30 text-sky-300 font-bold border border-sky-500/40'
                                  : 'text-slate-400 hover:text-sky-300'
                              }`}
                            >
                              <Info size={12} />
                              <span>Skip ({syncProgress.skipped})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExcelFilterStatus('SYNC_ERROR')}
                              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                                excelFilterStatus === 'SYNC_ERROR'
                                  ? 'bg-rose-500/30 text-rose-300 font-bold border border-rose-500/40'
                                  : 'text-slate-400 hover:text-rose-300'
                              }`}
                            >
                              <XCircle size={12} />
                              <span>Gagal ({syncProgress.error})</span>
                            </button>
                          </>
                        )}
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
                                      if (excelFilterStatus === 'SIMILAR') return m.matchType === 'similar';
                                      if (excelFilterStatus === 'SYNC_SUCCESS') return syncResults[m.catalogItem.uuid]?.status === 'success';
                                      if (excelFilterStatus === 'SYNC_SKIPPED') return syncResults[m.catalogItem.uuid]?.status === 'skipped';
                                      if (excelFilterStatus === 'SYNC_ERROR') return syncResults[m.catalogItem.uuid]?.status === 'error';
                                      return true;
                                    })
                                    .length > 0 &&
                                  excelMatches.matched
                                    .filter(m => {
                                      if (excelFilterStatus === 'NEED_UPDATE') return !m.isMatching;
                                      if (excelFilterStatus === 'ALREADY_MATCHED') return m.isMatching;
                                      if (excelFilterStatus === 'SIMILAR') return m.matchType === 'similar';
                                      if (excelFilterStatus === 'SYNC_SUCCESS') return syncResults[m.catalogItem.uuid]?.status === 'success';
                                      if (excelFilterStatus === 'SYNC_SKIPPED') return syncResults[m.catalogItem.uuid]?.status === 'skipped';
                                      if (excelFilterStatus === 'SYNC_ERROR') return syncResults[m.catalogItem.uuid]?.status === 'error';
                                      return true;
                                    })
                                    .every(m => excelCheckedUuids.has(m.catalogItem.uuid))
                                }
                                onChange={() => {
                                  const filtered = excelMatches.matched.filter(m => {
                                    if (excelFilterStatus === 'NEED_UPDATE') return !m.isMatching;
                                    if (excelFilterStatus === 'ALREADY_MATCHED') return m.isMatching;
                                    if (excelFilterStatus === 'SIMILAR') return m.matchType === 'similar';
                                    if (excelFilterStatus === 'SYNC_SUCCESS') return syncResults[m.catalogItem.uuid]?.status === 'success';
                                    if (excelFilterStatus === 'SYNC_SKIPPED') return syncResults[m.catalogItem.uuid]?.status === 'skipped';
                                    if (excelFilterStatus === 'SYNC_ERROR') return syncResults[m.catalogItem.uuid]?.status === 'error';
                                    return true;
                                  });
                                  toggleExcelCheckAllFiltered(filtered);
                                }}
                                className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                              />
                            </th>
                            <th className="p-3">#</th>
                            <th className="p-3 font-sans">Nama Produk Katalog</th>
                            <th className="p-3">Key Excel</th>
                            <th className="p-3 text-center font-sans">Pencocokan</th>
                            <th className="p-3 text-center font-sans">Status Kesesuaian</th>
                            <th className="p-3 text-center font-sans">Status Update Server</th>
                            {excelPriceColumn && <th className="p-3 text-right text-emerald-400">Harga Jual ({excelPriceColumn})</th>}
                            {excelCostColumn && <th className="p-3 text-right text-amber-400">Modal / HPP ({excelCostColumn})</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {excelMatches.matched
                            .filter(m => {
                              if (excelFilterStatus === 'NEED_UPDATE') return !m.isMatching;
                              if (excelFilterStatus === 'ALREADY_MATCHED') return m.isMatching;
                              if (excelFilterStatus === 'SIMILAR') return m.matchType === 'similar';
                              if (excelFilterStatus === 'SYNC_SUCCESS') return syncResults[m.catalogItem.uuid]?.status === 'success';
                              if (excelFilterStatus === 'SYNC_SKIPPED') return syncResults[m.catalogItem.uuid]?.status === 'skipped';
                              if (excelFilterStatus === 'SYNC_ERROR') return syncResults[m.catalogItem.uuid]?.status === 'error';
                              return true;
                            })
                            .map((m, idx) => {
                            const sRes = syncResults[m.catalogItem.uuid];
                            return (
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
                                {m.matchType === 'exact' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    Persis (100%)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                    Mirip ({Math.round(m.similarityScore * 100)}%)
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center font-sans">
                                {m.isMatching ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Sudah Sesuai</span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">Belum Sesuai</span>
                                )}
                              </td>
                              <td className="p-3 text-center font-sans">
                                {sRes ? (
                                  sRes.status === 'success' ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                      <CheckCircle size={12} />
                                      Berhasil
                                    </span>
                                  ) : sRes.status === 'skipped' ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40" title={sRes.message}>
                                      <Info size={12} />
                                      Skip
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40" title={sRes.message}>
                                      <XCircle size={12} />
                                      Gagal
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[10px] text-slate-500 font-mono">Belum Sync</span>
                                )}
                              </td>
                              {excelPriceColumn && (
                                <td className="p-3 text-right">
                                  <span className="text-slate-500 line-through text-[11px] mr-2">Rp {m.currentSalePrice.toLocaleString('id-ID')}</span>
                                  <span className={`font-bold ${m.hasSaleChange ? 'text-emerald-400' : 'text-slate-400'}`}>
                                    Rp {m.newSalePrice.toLocaleString('id-ID')}
                                  </span>
                                </td>
                              )}
                              {excelCostColumn && (
                                <td className="p-3 text-right">
                                  <span className="text-slate-500 line-through text-[11px] mr-2">Rp {m.currentCostPrice.toLocaleString('id-ID')}</span>
                                  <span className={`font-bold ${m.hasCostChange ? 'text-amber-400' : 'text-slate-400'}`}>
                                    Rp {m.newCostPrice.toLocaleString('id-ID')}
                                  </span>
                                </td>
                              )}
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Collapsible Log Console Box on Excel Page */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium py-2 px-1">
                        <button
                          type="button"
                          onClick={() => setShowExcelLogs(prev => !prev)}
                          className="flex items-center gap-1.5 hover:text-white font-semibold transition-colors"
                        >
                          <Sliders size={14} />
                          <span>{showExcelLogs ? 'Sembunyikan Log Eksekusi' : 'Tampilkan Log Eksekusi Server'}</span>
                          <CaretDown size={12} className={`transition-transform duration-200 ${showExcelLogs ? 'rotate-180' : ''}`} />
                        </button>

                        {showExcelLogs && syncLogs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSyncLogs([])}
                            className="hover:text-white underline text-[11px]"
                          >
                            Bersihkan Log
                          </button>
                        )}
                      </div>

                      {showExcelLogs && (
                        <div className="bg-[#0c0d12] rounded-2xl p-4 h-36 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1 scrollbar-thin border border-white/5 mt-2 animate-fadeIn">
                          {syncLogs.length === 0 ? (
                            <div className="text-slate-600 italic">Belum ada aktivitas eksekusi...</div>
                          ) : (
                            syncLogs.map((log, index) => (
                              <div key={index} className="leading-relaxed">{log}</div>
                            ))
                          )}
                        </div>
                      )}
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
                    {targetType === 'grabotech' ? 'Grabotech' : targetType === 'itspc' ? 'VM Oren' : targetType === 'yyvendor' ? 'Yunyin' : 'VM Putih'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Mode Sinkronisasi:</span>
                  <span className="font-bold text-emerald-400 text-xs">
                    {syncMode === 'both' && 'Copy & Price'}
                    {syncMode === 'copy' && 'Copy Only'}
                    {syncMode === 'price' && 'Price Only'}
                    {syncMode === 'image' && 'Image Only'}
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
