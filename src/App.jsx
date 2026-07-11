import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  // Source Account State
  const [sourceType, setSourceType] = useState('main'); // 'main', 'itspc', or 'grabotech'
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

  // Update credentials when sourceType changes
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

  // Target Account State
  const [targetType, setTargetType] = useState('main'); // 'main', 'itspc', or 'grabotech'
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

  // Clear target token on type change
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

  // Goods Data State
  const [goods, setGoods] = useState([]);
  const [originalGoods, setOriginalGoods] = useState([]); // Backup for pricing resets
  const [isFetchingGoods, setIsFetchingGoods] = useState(false);
  const [goodsFetchError, setGoodsFetchError] = useState('');
  const [targetGoods, setTargetGoods] = useState([]);
  const [originalTargetGoods, setOriginalTargetGoods] = useState([]); // Backup for target pricing resets
  const [isLoadingTargetGoods, setIsLoadingTargetGoods] = useState(false);
  const [activeCatalogTab, setActiveCatalogTab] = useState('source');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Pricing Adjustment State
  const [priceAdjMethod, setPriceAdjMethod] = useState('margin_cost'); // 'margin_cost', 'markup_sale', 'fixed'
  const [priceAdjValue, setPriceAdjValue] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Sync Progress State
  const [isSyncing, setIsSyncing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, success: 0, skipped: 0, error: 0 });
  const [syncResults, setSyncResults] = useState({}); // { [uuid]: { status, message } }
  const [syncLogs, setSyncLogs] = useState([]);
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');
  const [imageDownloadTask, setImageDownloadTask] = useState(null);
  const [syncMode, setSyncMode] = useState('both');

  const logConsoleRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [syncLogs]);

  // Add a log message
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setSyncLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  // Login to Source
  const handleLoginSource = async (e) => {
    e.preventDefault();
    if (!sourceAccount || !sourcePwd) return;
    setIsLoggingInSource(true);
    setSourceLoginError('');
    try {
      const bodyPayload = { userAccount: sourceAccount, userPwd: sourcePwd, type: sourceType };
      if (sourceType === 'grabotech') {
        bodyPayload.sessionCookie = sourceSessionCookie;
        bodyPayload.vifCode = sourceVifCode;
      }

      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSourceToken(data.token);
        setSourceUser(data.user);
        addLog(`Source Account Authenticated: ${data.user.contactMan || data.user.userAccount}`);
        // Fetch goods automatically upon success
        fetchGoods(data.token);
      } else {
        setSourceLoginError(data.error || 'Login failed');
        if (sourceType === 'grabotech') {
          loadSourceCaptcha(); // captcha is single-use
        }
      }
    } catch (err) {
      setSourceLoginError('Server error occurred during login');
      if (sourceType === 'grabotech') {
        loadSourceCaptcha();
      }
    } finally {
      setIsLoggingInSource(false);
    }
  };

  // Login to Target
  const handleLoginTarget = async (e) => {
    e.preventDefault();
    if (!targetAccount || !targetPwd) return;
    setIsLoggingInTarget(true);
    setTargetLoginError('');
    try {
      const bodyPayload = { userAccount: targetAccount, userPwd: targetPwd, type: targetType };
      if (targetType === 'grabotech') {
        bodyPayload.sessionCookie = targetSessionCookie;
        bodyPayload.vifCode = targetVifCode;
      }

      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTargetToken(data.token);
        setTargetUser(data.user);
        addLog(`Target Account Authenticated: ${data.user.contactMan || data.user.userAccount}`);
        // Fetch target goods automatically
        fetchTargetGoods(data.token);
      } else {
        setTargetLoginError(data.error || 'Login failed');
        if (targetType === 'grabotech') {
          loadTargetCaptcha(); // captcha is single-use
        }
      }
    } catch (err) {
      setTargetLoginError('Server error occurred during login');
      if (targetType === 'grabotech') {
        loadTargetCaptcha();
      }
    } finally {
      setIsLoggingInTarget(false);
    }
  };

  // Fetch Goods from Target
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
        setTargetGoods(data.goods);
        setOriginalTargetGoods(JSON.parse(JSON.stringify(data.goods)));
        addLog(`Successfully loaded ${data.goods.length} goods from Target account.`);
      } else {
        addLog(`Warning: Failed to fetch Target goods: ${data.error || 'unknown error'}`);
      }
    } catch (err) {
      addLog(`Warning: Network error fetching Target goods: ${err.message}`);
    } finally {
      setIsLoadingTargetGoods(false);
    }
  };

  // Handle inline manual price change
  const handlePriceChange = (uuid, field, value) => {
    const numValue = value === '' ? 0 : parseFloat(value);
    if (activeCatalogTab === 'source') {
      setGoods(prev => prev.map(g => {
        if (g.uuid === uuid) {
          return { ...g, [field]: numValue };
        }
        return g;
      }));
    } else {
      setTargetGoods(prev => prev.map(g => {
        if (g.uuid === uuid) {
          return { ...g, [field]: numValue };
        }
        return g;
      }));
    }
  };

  // Apply pricing adjustments in bulk
  const applyPricingAdjustment = (applyToAll = false) => {
    const value = parseFloat(priceAdjValue);
    if (isNaN(value)) {
      alert('Please enter a valid numeric value for the adjustment.');
      return;
    }

    const backupCatalog = activeCatalogTab === 'source' ? originalGoods : originalTargetGoods;
    const setter = activeCatalogTab === 'source' ? setGoods : setTargetGoods;

    setter(prev => prev.map(g => {
      const shouldApply = applyToAll || selectedIds.has(g.uuid);
      if (!shouldApply) return g;

      const origItem = backupCatalog.find(orig => orig.uuid === g.uuid) || g;
      const originalCost = parseFloat(origItem.costPrice) || 0;
      const originalSale = parseFloat(origItem.goodsPrice) || 0;

      let newSalePrice = g.goodsPrice;

      if (priceAdjMethod === 'margin_cost') {
        newSalePrice = Math.round(originalCost * (1 + value / 100));
      } else if (priceAdjMethod === 'markup_sale') {
        newSalePrice = Math.round(originalSale * (1 + value / 100));
      } else if (priceAdjMethod === 'fixed') {
        newSalePrice = value;
      }

      let newMembersPrice = g.membersPrice;
      if (origItem.membersPrice && originalSale > 0) {
        newMembersPrice = Math.round(newSalePrice * (origItem.membersPrice / originalSale));
      } else {
        newMembersPrice = newSalePrice;
      }

      return {
        ...g,
        goodsPrice: newSalePrice,
        membersPrice: newMembersPrice
      };
    }));

    addLog(`Applied pricing adjustment (${priceAdjMethod === 'fixed' ? 'Fixed Rp ' + value : value + '% margin'}) to ${applyToAll ? 'all' : selectedIds.size} items in ${activeCatalogTab} catalog.`);
  };

  // Reset all prices to original loaded prices
  const resetPrices = () => {
    if (activeCatalogTab === 'source') {
      if (originalGoods.length === 0) return;
      setGoods(JSON.parse(JSON.stringify(originalGoods)));
    } else {
      if (originalTargetGoods.length === 0) return;
      setTargetGoods(JSON.parse(JSON.stringify(originalTargetGoods)));
    }
    addLog(`Reset all ${activeCatalogTab} item prices to original catalog prices.`);
  };

  // Fetch Goods from Source
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
        setGoods(data.goods);
        setOriginalGoods(JSON.parse(JSON.stringify(data.goods)));
        setSelectedIds(new Set());
        addLog(`Loaded ${data.goods.length} custom goods from source account.`);
      } else {
        setGoodsFetchError(data.error || 'Failed to fetch goods list');
      }
    } catch (err) {
      setGoodsFetchError('Server error occurred while fetching goods');
    } finally {
      setIsFetchingGoods(false);
    }
  };

  // Sync selected goods one by one
  const handleSyncGoods = async () => {
    if (isSyncing || selectedIds.size === 0 || !targetToken || !targetUser) return;

    const currentCatalog = activeCatalogTab === 'source' ? goods : targetGoods;
    const selectedList = currentCatalog.filter(g => selectedIds.has(g.uuid));
    const total = selectedList.length;

    setIsSyncing(true);
    setSyncLogs([]);
    
    setSyncProgress({ current: 0, total, success: 0, skipped: 0, error: 0 });
    setSyncResults({});
    if (activeCatalogTab === 'target') {
      addLog(`Starting price update of ${total} selected target items...`);
    } else {
      addLog(`Starting synchronization of ${total} selected items...`);
    }

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < total; i++) {
      const good = selectedList[i];
      const currentProgress = i + 1;
      
      setSyncProgress(prev => ({ ...prev, current: currentProgress }));
      setSyncResults(prev => ({
        ...prev,
        [good.uuid]: { status: 'syncing', message: activeCatalogTab === 'target' ? 'Updating target price...' : 'Syncing product...' }
      }));
      if (activeCatalogTab === 'target') {
        addLog(`[${currentProgress}/${total}] Updating target price: "${good.goodsName}"...`);
      } else {
        addLog(`[${currentProgress}/${total}] Syncing: "${good.goodsName}"...`);
      }

      try {
        const response = await fetch('/api/sync-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetToken,
            targetUserUuid: targetUser.uuid,
            good,
            mode: activeCatalogTab === 'target' ? 'price' : syncMode,
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
              [good.uuid]: { status: 'success', message: activeCatalogTab === 'target' ? 'Successfully updated' : 'Successfully synced' }
            }));
            if (activeCatalogTab === 'target') {
              addLog(`↳ Success: "${good.goodsName}" price updated successfully.`);
            } else {
              addLog(`↳ Success: "${good.goodsName}" synced successfully.`);
            }
          }
        } else {
          errorCount++;
          setSyncResults(prev => ({
            ...prev,
            [good.uuid]: { status: 'error', message: data.error || (activeCatalogTab === 'target' ? 'Failed to update' : 'Failed to sync') }
          }));
          addLog(`↳ Error: Failed for "${good.goodsName}" - ${data.error}`);
        }
      } catch (err) {
        errorCount++;
        setSyncResults(prev => ({
          ...prev,
          [good.uuid]: { status: 'error', message: 'Network or server error' }
        }));
        addLog(`↳ Error: Failed for "${good.goodsName}" - Network error`);
      }

      setSyncProgress(prev => ({
        ...prev,
        success: successCount,
        skipped: skippedCount,
        error: errorCount
      }));

      // Delay between items to avoid API rate limiting
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    setIsSyncing(false);
    addLog(`Sync finished. Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${errorCount}.`);
  };

  // Export all products to CSV via backend download
  const handleDownloadCSV = () => {
    if (!sourceToken) return;
    addLog('Requesting CSV download from server...');
    window.location.href = `/api/export-csv?token=${encodeURIComponent(sourceToken)}&username=${encodeURIComponent(sourceAccount)}`;
    addLog('Exported all products to CSV.');
  };

  // Download selected product images (Vercel: single request ZIP; local: background + polling)
  const handleDownloadImages = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one product to download images.');
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

      // --- Vercel serverless: response is the ZIP file directly ---
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

      // --- Local dev: response is JSON, start polling ---
      const data = await response.json();

      if (response.ok && data.success) {
        setDownloadMsg('Download started. Polling status...');
        addLog('Image download task initialized on server.');

        // Start polling status
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
                // Trigger actual browser download
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

  // Multi-select actions
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = filteredGoods.map(g => g.uuid);
      setSelectedIds(new Set(allIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (uuid) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(uuid)) {
      newSelected.delete(uuid);
    } else {
      newSelected.add(uuid);
    }
    setSelectedIds(newSelected);
  };

  // Get unique categories list
  const categories = useMemo(() => {
    const list = new Set();
    const currentList = activeCatalogTab === 'source' ? goods : targetGoods;
    currentList.forEach(g => {
      if (g.customName) list.add(g.customName);
    });
    return ['ALL', ...Array.from(list)];
  }, [goods, targetGoods, activeCatalogTab]);

  // Filtered Goods
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
    <div className="min-h-[100dvh] pb-12 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-white/5 py-5 px-6 md:px-12 liquid-glass sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20 text-emerald-400">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">HUIYUN</h1>
              <p className="text-xs text-slate-500 mt-1">Goods Sync Automation</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
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

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-6 md:px-12 mt-8 flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Setup Forms */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Source Account Form */}
          <section className="liquid-glass rounded-3xl p-6 border border-white/5 spring-transition">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-400">
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
                    Main Portal
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
                    ITSPC Portal
                  </button>
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
                        <img 
                          src={sourceCaptchaUrl} 
                          alt="CAPTCHA" 
                          className="h-[38px] rounded-lg object-contain" 
                        />
                        <button
                          type="button"
                          onClick={loadSourceCaptcha}
                          className="p-2 text-slate-400 hover:text-white"
                          title="Reload CAPTCHA"
                        >
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
                    onClick={() => { setSourceToken(''); setSourceUser(null); setGoods([]); setOriginalGoods([]); }}
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

          {/* Target Account Form */}
          <section className="liquid-glass rounded-3xl p-6 border border-white/5 spring-transition">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-sky-500/10 p-2 rounded-xl text-sky-400">
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
                    Main Portal
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
                    ITSPC Portal
                  </button>
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
                        <img 
                          src={targetCaptchaUrl} 
                          alt="CAPTCHA" 
                          className="h-[38px] rounded-lg object-contain" 
                        />
                        <button
                          type="button"
                          onClick={loadTargetCaptcha}
                          className="p-2 text-slate-400 hover:text-white"
                          title="Reload CAPTCHA"
                        >
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
                    onClick={() => { setTargetToken(''); setTargetUser(null); setTargetGoods([]); setOriginalTargetGoods([]); }}
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

        {/* Right Side: Goods list & console log */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Action Bar */}
          <div className="liquid-glass rounded-3xl p-6 border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">Synchronization Panel</h3>
              <p className="text-xs text-slate-400 mt-1">Select items below to push to the target merchant account</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Sync Mode</label>
                <div className="flex bg-[#12141d]/85 p-1 border border-white/5 rounded-xl gap-1">
                  <button
                    type="button"
                    disabled={isSyncing}
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
                    disabled={isSyncing}
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
                    disabled={isSyncing}
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
                onClick={() => setShowConfirmModal(true)}
                disabled={isSyncing || selectedIds.size === 0 || !targetToken}
                className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-6 bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/5 disabled:text-slate-500 text-[#090a0f] active:scale-[0.98] text-sm font-bold rounded-2xl spring-transition disabled:scale-100 disabled:pointer-events-none mt-4 sm:mt-0"
              >
                {isSyncing ? <ArrowsClockwise size={16} className="animate-spin" /> : <Play size={16} />}
                {activeCatalogTab === 'target' 
                  ? `Update ${selectedIds.size > 0 ? `${selectedIds.size} Prices` : 'Prices'}`
                  : `Sync ${selectedIds.size > 0 ? `${selectedIds.size} Items` : 'Selected'}`
                }
              </button>
            </div>
          </div>

          {/* Pricing Adjustment Panel */}
          {goods.length > 0 && (
            <section className="liquid-glass rounded-3xl p-6 border border-white/5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-400">
                  <Coins size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Pricing Adjustment (Penyesuaian Harga)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Atur margin persentase atau harga jual tetap secara massal sebelum sinkronisasi</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                {/* Method Selector */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-400">Metode Penyesuaian</label>
                  <select
                    value={priceAdjMethod}
                    onChange={(e) => setPriceAdjMethod(e.target.value)}
                    className="bg-[#12141d]/80 border border-white/5 focus:border-emerald-500/50 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none transition-all"
                  >
                    <option value="margin_cost">Margin dari Modal (% Cost)</option>
                    <option value="markup_sale">Markup dari Jual Asal (% Jual)</option>
                    <option value="fixed">Harga Jual Tetap (Fixed Rp)</option>
                  </select>
                </div>

                {/* Input Value */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-400">
                    {priceAdjMethod === 'fixed' ? 'Nominal (Rp)' : 'Persentase (%)'}
                  </label>
                  <input
                    type="number"
                    value={priceAdjValue}
                    onChange={(e) => setPriceAdjValue(e.target.value)}
                    placeholder={priceAdjMethod === 'fixed' ? 'Contoh: 15000' : 'Contoh: 20'}
                    className="bg-[#12141d]/80 border border-white/5 focus:border-emerald-500/50 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Aksi Penyesuaian</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => applyPricingAdjustment(false)}
                      disabled={selectedIds.size === 0}
                      className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:pointer-events-none text-[#090a0f] text-xs font-bold rounded-xl active:scale-[0.98] transition-all"
                    >
                      Terapkan Terpilih ({selectedIds.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPricingAdjustment(true)}
                      className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold rounded-xl active:scale-[0.98] transition-all"
                    >
                      Terapkan Semua ({goods.length})
                    </button>
                    <button
                      type="button"
                      onClick={resetPrices}
                      className="py-2.5 px-3.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl active:scale-[0.98] transition-all"
                      title="Reset ke Harga Asli"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Image Download Progress Card */}
          {imageDownloadTask && imageDownloadTask.status !== 'idle' && (
            <section className="liquid-glass rounded-3xl p-6 border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-sky-500/10 p-1.5 rounded-lg text-sky-400">
                    <Image size={16} className={imageDownloadTask.status === 'downloading' || imageDownloadTask.status === 'zipping' ? 'animate-pulse' : ''} />
                  </div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {imageDownloadTask.status === 'downloading' && 'Downloading Product Images'}
                    {imageDownloadTask.status === 'zipping' && 'Compressing into ZIP'}
                    {imageDownloadTask.status === 'completed' && 'Images ZIP Ready'}
                    {imageDownloadTask.status === 'failed' && 'Download Failed'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400 font-bold">
                    {imageDownloadTask.current} / {imageDownloadTask.total}
                  </span>
                  {(imageDownloadTask.status === 'completed' || imageDownloadTask.status === 'failed') && (
                    <button 
                      onClick={() => setImageDownloadTask(null)}
                      className="text-slate-500 hover:text-slate-300 text-[10px] font-bold uppercase tracking-wider"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full spring-transition ${
                    imageDownloadTask.status === 'failed' 
                      ? 'bg-rose-500' 
                      : (imageDownloadTask.status === 'completed' ? 'bg-emerald-500' : 'bg-sky-500')
                  }`}
                  style={{ 
                    width: `${
                      imageDownloadTask.status === 'completed' 
                        ? 100 
                        : ((imageDownloadTask.current / imageDownloadTask.total) * 100 || 0)
                    }%` 
                  }}
                ></div>
              </div>

              {/* Status Message */}
              <div className="text-xs font-mono text-slate-400 flex justify-between items-center bg-[#12141d]/85 p-3 rounded-xl border border-white/5">
                <span className="truncate max-w-[280px]">
                  {imageDownloadTask.status === 'downloading' && `${downloadMsg}`}
                  {imageDownloadTask.status === 'zipping' && 'Creating ZIP file on server...'}
                  {imageDownloadTask.status === 'completed' && 'ZIP file created and downloaded successfully!'}
                  {imageDownloadTask.status === 'failed' && `Error: ${imageDownloadTask.error || 'Failed task'}`}
                </span>
                <span className="text-[10px] text-slate-500 shrink-0">
                  Failed: {imageDownloadTask.failed || 0}
                </span>
              </div>
            </section>
          )}

          {/* Sync Progress Bar & Logs */}
          {(isSyncing || syncLogs.length > 0) && (
            <section className="liquid-glass rounded-3xl p-6 border border-white/5 space-y-4">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Sync Status: {isSyncing ? 'Processing' : 'Completed'}</span>
                <span className="text-slate-200 font-bold">{syncProgress.current} / {syncProgress.total}</span>
              </div>
              
              {/* Progress Bar */}
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 spring-transition" 
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100 || 0}%` }}
                ></div>
              </div>

              {/* Counts */}
              <div className="grid grid-cols-3 gap-3 text-xs font-mono text-center">
                <div className="bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl">
                  <p className="text-slate-500">Success</p>
                  <p className="text-lg font-bold text-emerald-400">{syncProgress.success}</p>
                </div>
                <div className="bg-sky-500/5 border border-sky-500/10 p-2.5 rounded-xl">
                  <p className="text-slate-500">Skipped</p>
                  <p className="text-lg font-bold text-sky-400">{syncProgress.skipped}</p>
                </div>
                <div className="bg-rose-500/5 border border-rose-500/10 p-2.5 rounded-xl">
                  <p className="text-slate-500">Failed</p>
                  <p className="text-lg font-bold text-rose-400">{syncProgress.error}</p>
                </div>
              </div>

              {/* Console Logs */}
              <div 
                ref={logConsoleRef}
                className="bg-[#07080c] border border-white/5 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs text-slate-300 space-y-1.5 scrollbar-thin"
              >
                {syncLogs.length === 0 ? (
                  <span className="text-slate-600 italic">No activity logs yet.</span>
                ) : (
                  syncLogs.map((log, idx) => (
                    <div key={idx} className={log.includes('Failed') || log.includes('Error') ? 'text-rose-400' : log.includes('Success') ? 'text-emerald-400' : log.includes('Skip') ? 'text-sky-400' : 'text-slate-300'}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* Goods Catalog List */}
          <section className="liquid-glass rounded-3xl p-6 border border-white/5 space-y-6">
            {/* Catalog Tabs */}
            <div className="flex border-b border-white/5 pb-px gap-4">
              <button
                type="button"
                onClick={() => { setActiveCatalogTab('source'); setSelectedCategory('ALL'); }}
                className={`pb-3 text-sm font-bold transition-all relative ${
                  activeCatalogTab === 'source' 
                    ? 'text-emerald-400 font-bold' 
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
                disabled={!targetToken}
                onClick={() => { setActiveCatalogTab('target'); setSelectedCategory('ALL'); }}
                className={`pb-3 text-sm font-bold transition-all relative ${
                  !targetToken ? 'opacity-30 cursor-not-allowed' : ''
                } ${
                  activeCatalogTab === 'target' 
                    ? 'text-emerald-400 font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={!targetToken ? "Connect target account first to preview its catalog" : "Preview target account goods"}
              >
                Target Catalog ({targetGoods.length})
                {activeCatalogTab === 'target' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full"></span>
                )}
              </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>{activeCatalogTab === 'source' ? 'Source Goods' : 'Target Goods'}</span>
                  <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-xs font-mono text-slate-400">
                    {activeCatalogTab === 'source' ? goods.length : targetGoods.length} items
                  </span>
                </h3>

                {activeCatalogTab === 'source' && goods.length > 0 && (
                  <div className="flex items-center gap-2 md:ml-4">
                    <button
                      onClick={handleDownloadCSV}
                      title="Download catalog as CSV"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white rounded-xl text-[10px] font-semibold spring-transition"
                    >
                      <DownloadSimple size={12} />
                      Export CSV
                    </button>
                    <button
                      onClick={handleDownloadImages}
                      disabled={isDownloadingImages || selectedIds.size === 0}
                      title={selectedIds.size === 0 ? "Select products in the list below to download their images" : "Download selected product images locally"}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-xl text-[10px] font-semibold spring-transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isDownloadingImages ? <ArrowsClockwise size={12} className="animate-spin" /> : <Image size={12} />}
                      Download Images {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                    </button>
                  </div>
                )}
              </div>

              {((activeCatalogTab === 'source' && goods.length > 0) || (activeCatalogTab === 'target' && targetGoods.length > 0)) && (
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                  {/* Search Bar */}
                  <div className="relative w-full sm:w-60">
                    <MagnifyingGlass size={16} className="absolute left-3.5 top-3 text-slate-500" />
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or code..."
                      className="w-full bg-[#12141d]/80 border border-white/5 focus:border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none transition-all duration-200"
                    />
                  </div>

                  {/* Category Dropdown */}
                  <select 
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full sm:w-40 bg-[#12141d]/80 border border-white/5 focus:border-white/15 rounded-xl px-3 py-2.5 text-xs focus:outline-none text-slate-300 transition-all duration-200"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Goods Catalog Table / Lists */}
            {isFetchingGoods || (activeCatalogTab === 'target' && isLoadingTargetGoods) ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex gap-4 items-center bg-white/2 p-4 rounded-xl border border-white/5 animate-pulse">
                    <div className="h-4 w-4 bg-white/10 rounded"></div>
                    <div className="h-10 w-10 bg-white/10 rounded-lg"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/3 bg-white/10 rounded"></div>
                      <div className="h-3 w-1/4 bg-white/10 rounded"></div>
                    </div>
                    <div className="h-5 w-16 bg-white/10 rounded"></div>
                  </div>
                ))}
              </div>
            ) : activeCatalogTab === 'source' && goodsFetchError ? (
              <div className="bg-rose-500/10 text-rose-400 p-6 rounded-2xl border border-rose-500/20 text-sm text-center flex flex-col items-center gap-3">
                <Warning size={24} />
                <p>{goodsFetchError}</p>
                <button 
                  onClick={() => fetchGoods()}
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold"
                >
                  Try Again
                </button>
              </div>
            ) : (activeCatalogTab === 'source' && goods.length === 0) ? (
              <div className="bg-white/2 p-12 rounded-3xl border border-white/5 text-center flex flex-col items-center gap-4">
                <div className="bg-slate-800/10 p-3 rounded-full text-slate-500 border border-slate-700/10">
                  <Database size={32} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-300">No goods loaded</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">Connect your source account credentials on the left panel to load your customs goods catalog.</p>
                </div>
              </div>
            ) : (activeCatalogTab === 'target' && targetGoods.length === 0) ? (
              <div className="bg-white/2 p-12 rounded-3xl border border-white/5 text-center flex flex-col items-center gap-4">
                <div className="bg-slate-800/10 p-3 rounded-full text-slate-500 border border-slate-700/10">
                  <Storefront size={32} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-300">No Target Products Found</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    {!targetToken 
                      ? 'Connect target account on the left panel to preview its products.' 
                      : 'The target account does not have any custom goods yet.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/1">
                <div className="overflow-x-auto max-h-[500px] scrollbar-thin">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/2 text-slate-400 font-semibold">
                        {activeCatalogTab === 'source' && (
                          <th className="py-3.5 px-4 w-12 text-center">
                            <input 
                              type="checkbox"
                              checked={filteredGoods.length > 0 && filteredGoods.every(g => selectedIds.has(g.uuid))}
                              onChange={handleSelectAll}
                              className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0 bg-transparent h-4 w-4"
                            />
                          </th>
                        )}
                        <th className="py-3.5 px-4">Item details</th>
                        <th className="py-3.5 px-4">Barcode</th>
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4 text-right">Prices</th>
                        {activeCatalogTab === 'source' && <th className="py-3.5 px-4 text-center w-24">Sync status</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredGoods.map((good) => {
                        const result = syncResults[good.uuid];
                        return (
                          <tr key={good.uuid} className="hover:bg-white/1 transition-all duration-150">
                            {activeCatalogTab === 'source' && (
                              <td className="py-3 px-4 text-center">
                                <input 
                                  type="checkbox"
                                  checked={selectedIds.has(good.uuid)}
                                  onChange={() => handleSelectOne(good.uuid)}
                                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0 bg-transparent h-4 w-4"
                                />
                              </td>
                            )}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                {good.goodsUrl ? (
                                  <img 
                                    src={good.goodsUrl} 
                                    alt={good.goodsName} 
                                    className="h-9 w-9 rounded-lg object-cover bg-white/5 border border-white/10 shrink-0"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 shrink-0 flex items-center justify-center text-slate-600 font-bold">
                                    {good.goodsName?.substring(0, 2)}
                                  </div>
                                )}
                                <div className="truncate max-w-[250px]">
                                  <p className="font-semibold text-slate-200">{good.goodsName}</p>
                                  <p className="text-[10px] text-slate-500">ID: {good.uuid}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-400">
                              {good.goodsCode || '-'}
                            </td>
                            <td className="py-3 px-4">
                              <span className="bg-white/5 border border-white/5 px-2 py-0.5 rounded text-[10px] text-slate-400 font-medium">
                                {good.customName || 'General'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5 justify-end">
                                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">Jual:</span>
                                  <div className="relative flex items-center">
                                    <span className="absolute left-1 text-[10px] text-slate-500">Rp</span>
                                    <input
                                      type="number"
                                      value={good.goodsPrice || 0}
                                      onChange={(e) => handlePriceChange(good.uuid, 'goodsPrice', e.target.value)}
                                      className="w-20 bg-[#12141d]/80 border border-white/5 focus:border-emerald-500/50 rounded-lg pl-5 pr-1 py-1 text-[11px] text-right text-slate-200 focus:outline-none focus:ring-0"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 justify-end">
                                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">Modal:</span>
                                  <div className="relative flex items-center">
                                    <span className="absolute left-1 text-[10px] text-slate-500">Rp</span>
                                    <input
                                      type="number"
                                      value={good.costPrice || 0}
                                      onChange={(e) => handlePriceChange(good.uuid, 'costPrice', e.target.value)}
                                      className="w-20 bg-[#12141d]/80 border border-white/5 focus:border-emerald-500/50 rounded-lg pl-5 pr-1 py-0.5 text-[10px] text-right text-slate-400 focus:outline-none focus:ring-0"
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                            {activeCatalogTab === 'source' && (
                              <td className="py-3 px-4 text-center">
                                {result ? (
                                  <div className="flex justify-center">
                                    {result.status === 'syncing' && (
                                      <span className="flex items-center gap-1 text-slate-400 animate-pulse">
                                        <ArrowsClockwise size={12} className="animate-spin text-slate-500" />
                                        Syncing
                                      </span>
                                    )}
                                    {result.status === 'success' && (
                                      <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold">
                                        <CheckCircle size={12} />
                                        Synced
                                      </span>
                                    )}
                                    {result.status === 'skipped' && (
                                      <span className="flex items-center gap-1 text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20 font-semibold" title={result.message}>
                                        <Info size={12} />
                                        Skipped
                                      </span>
                                    )}
                                    {result.status === 'error' && (
                                      <span className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 font-semibold" title={result.message}>
                                        <XCircle size={12} />
                                        Failed
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-600">Pending</span>
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

        </div>

      </main>

      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0b0c11] border border-white/10 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 transform scale-100">
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <div className="bg-amber-500/10 p-2 rounded-xl text-amber-400">
                <Warning size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {activeCatalogTab === 'target' ? 'Konfirmasi Perubahan Harga Target' : 'Konfirmasi Sinkronisasi'}
                </h3>
                <p className="text-xs text-slate-400">
                  {activeCatalogTab === 'target' 
                    ? 'Harap periksa kembali perubahan harga langsung sebelum menyimpan' 
                    : 'Harap periksa kembali sebelum melanjutkan'}
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-white/2 rounded-2xl p-4 border border-white/5 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Total Produk Terpilih:</span>
                  <span className="font-bold text-white bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 font-mono text-xs">
                    {selectedIds.size} Item
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Tipe Target Portal:</span>
                  <span className={`font-bold px-2.5 py-1 rounded-lg border text-xs ${
                    targetType === 'grabotech'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : targetType === 'itspc'
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {targetType === 'grabotech' ? 'Grabotech' : targetType === 'itspc' ? 'ITSPC Portal' : 'Main Portal'}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-xs">Mode Aksi:</span>
                    <span className="font-bold text-emerald-400 text-xs">
                      {activeCatalogTab === 'target' ? (
                        'Price Update Only (Pembaluan Harga)'
                      ) : (
                        <>
                          {syncMode === 'both' && 'Copy & Price (Salin & Harga)'}
                          {syncMode === 'copy' && 'Copy Only (Salin Baru Saja)'}
                          {syncMode === 'price' && 'Price Only (Harga Saja)'}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 italic leading-relaxed">
                    {activeCatalogTab === 'target' ? (
                      '*Pembaluan harga langsung pada akun target berdasarkan nilai yang Anda ketik / ubah.'
                    ) : (
                      <>
                        {syncMode === 'both' && '*Menyalin semua produk baru dan menyamakan harga produk yang sudah ada di target.'}
                        {syncMode === 'copy' && '*Hanya menyalin produk yang belum ada di target. Harga produk lama TIDAK diubah.'}
                        {syncMode === 'price' && '*Hanya menyamakan harga produk yang sudah terdaftar di target. Produk baru diabaikan.'}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 flex gap-2">
                <Info size={16} className="shrink-0 mt-0.5" />
                <span>
                  {activeCatalogTab === 'target'
                    ? 'Peringatan: Perubahan harga akan langsung aktif di portal target setelah proses selesai berjalan!'
                    : 'Peringatan: Aksi ini tidak dapat dibatalkan setelah eksekusi berjalan. Pastikan mode di atas sesuai niat Anda!'}
                </span>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-6 bg-[#12141d]/50 border-t border-white/5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 text-center border border-white/10 hover:border-white/25 text-slate-300 hover:text-white rounded-xl transition-all duration-200 text-sm font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  handleSyncGoods();
                }}
                className="flex-1 py-3 text-center bg-emerald-500 hover:bg-emerald-400 text-[#090a0f] rounded-xl transition-all duration-200 text-sm font-bold active:scale-[0.98] shadow-lg shadow-emerald-500/10"
              >
                {activeCatalogTab === 'target' ? 'Mulai Update' : 'Mulai Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
