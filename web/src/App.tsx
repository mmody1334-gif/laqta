import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Flame,
  AlertTriangle,
  RefreshCw,
  Volume2,
  VolumeX,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
  Globe2,
  Clock,
  Sparkles,
  Zap,
  ShoppingBag
} from 'lucide-react';
import type { DealItem, MarketId, SystemStats, SellerType } from './types.js';
import { soundManager } from './audio.js';

export function App() {
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [activeMarket, setActiveMarket] = useState<MarketId | 'all' | 'fake'>('all');
  const [selectedSeller, setSelectedSeller] = useState<SellerType | 'all'>('all');
  const [minDropPct, setMinDropPct] = useState<number>(50);
  const [dealTypeFilter, setDealTypeFilter] = useState<'all' | 'pricing_error' | 'real'>('all');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [liveConnected, setLiveConnected] = useState<boolean>(false);
  const [lastScanMessage, setLastScanMessage] = useState<string>('');
  const [isSolverOpen, setIsSolverOpen] = useState<boolean>(false);

  // Fetch Deals
  const fetchDeals = useCallback(async () => {
    try {
      const url = new URL('/api/deals', window.location.origin);
      if (activeMarket !== 'all' && activeMarket !== 'fake') {
        url.searchParams.set('market', activeMarket);
      }
      if (activeMarket === 'fake') {
        url.searchParams.set('dealType', 'fake');
      } else if (dealTypeFilter !== 'all') {
        url.searchParams.set('dealType', dealTypeFilter);
      }
      if (selectedSeller !== 'all') {
        url.searchParams.set('sellerType', selectedSeller);
      }
      url.searchParams.set('minDrop', String(minDropPct));

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setDeals(data);
      }
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    }
  }, [activeMarket, selectedSeller, minDropPct, dealTypeFilter]);

  // Fetch Stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  // Trigger Instant Refresh Scan
  const triggerInstantScan = async () => {
    setIsScanning(true);
    setLastScanMessage('جاري الفحص المباشر لكافة الأقسام الآن...');
    try {
      const res = await fetch('/api/scan/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: activeMarket === 'all' || activeMarket === 'fake' ? undefined : activeMarket
        })
      });
      const data = await res.json();
      if (data.success) {
        setLastScanMessage(`اكتمل الفحص: فُحصت ${data.result.scannedTargets} أهداف، ووُجدت ${data.result.newDeals} لقطات جديدة!`);
        await fetchDeals();
        await fetchStats();
      }
    } catch (err: any) {
      setLastScanMessage('تعذر إكمال الفحص اللحظي');
    } finally {
      setIsScanning(false);
      setTimeout(() => setLastScanMessage(''), 5000);
    }
  };

  // Open Browser Solver
  const openBrowserSolver = async (market: MarketId) => {
    try {
      await fetch('/api/solver/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market })
      });
      alert('تم فتح نافذة المتصفح على سطح المكتب الآن. قم بحل الكابتشا واضغط إنتر في الطرفية لحفظ الجلسة.');
    } catch (err) {
      alert('فشل فتح المتصفح');
    }
  };

  // SSE Live Stream Connection
  useEffect(() => {
    fetchDeals();
    fetchStats();
    const interval = setInterval(fetchStats, 10000);

    // Setup SSE connection
    const eventSource = new EventSource('/api/deals/stream');

    eventSource.onopen = () => {
      setLiveConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'new_deal' && parsed.data?.deal) {
          const newDeal = parsed.data.deal;
          const product = parsed.data.product;

          // Sound alarm
          if (newDeal.dealType === 'pricing_error') {
            soundManager.playPricingErrorAlarm();
          } else {
            soundManager.playRealDealChime();
          }

          // Prepend new deal to list
          setDeals((prev) => [
            {
              ...newDeal,
              title: product.title,
              url: product.url,
              image: product.image,
              store: product.store,
              market: product.market,
              externalId: product.externalId,
              reasons: JSON.parse(newDeal.reasonsJson || '[]')
            },
            ...prev
          ]);
        }
      } catch (err) {
        console.error('Error handling SSE deal event:', err);
      }
    };

    eventSource.onerror = () => {
      setLiveConnected(false);
    };

    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, [fetchDeals]);

  // Sound toggle handler
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundManager.enabled = next;
    if (next) {
      soundManager.playPricingErrorAlarm();
    }
  };

  // Helper format relative time in Arabic
  const formatRelativeTime = (isoDate: string) => {
    const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (diff < 60) return `منذ ${Math.max(1, diff)} ثانية`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };

  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      if (activeMarket === 'fake') {
        return deal.dealType === 'fake';
      }
      if (activeMarket !== 'all' && deal.market !== activeMarket) return false;
      if (dealTypeFilter !== 'all' && deal.dealType !== dealTypeFilter) return false;
      if (selectedSeller !== 'all' && deal.sellerType !== selectedSeller) return false;
      if (deal.dropPct < minDropPct) return false;
      return true;
    });
  }, [deals, activeMarket, dealTypeFilter, selectedSeller, minDropPct]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 pb-16">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">«لَقْطَة»</h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  رادار الصفقات الكبرى
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                مراقبة لحظية لغلطات التسعير والتخفيضات العميقة في أمازون ونون
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Live Indicator */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                liveConnected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${liveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="hidden md:inline">{liveConnected ? 'تحديث فوري لحظي' : 'جاري إعادة الاتصال'}</span>
            </div>

            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              title={soundEnabled ? 'كتم صوت التنبيه' : 'تفعيل صوت التنبيه'}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
              <span className="text-xs hidden sm:inline">{soundEnabled ? 'الصوت مفعّل' : 'مكتوم'}</span>
            </button>

            {/* Solver button */}
            <button
              onClick={() => setIsSolverOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">فك الحظر / كابتشا</span>
            </button>

            {/* Instant Refresh Button */}
            <button
              onClick={triggerInstantScan}
              disabled={isScanning}
              className="px-4 py-2 rounded-xl font-bold text-xs sm:text-sm bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span>تحديث لحظي</span>
            </button>
          </div>
        </div>

        {/* Scan Message Banner */}
        {lastScanMessage && (
          <div className="bg-amber-500/10 border-t border-b border-amber-500/20 py-1.5 px-4 text-center text-xs font-semibold text-amber-300">
            {lastScanMessage}
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 flex-1 w-full space-y-6">
        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black text-rose-400">{stats.dbPricingErrors || 0}</div>
                <div className="text-xs text-slate-400">غلطات تسعير مرصودة</div>
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400">{stats.dbTotalDeals || 0}</div>
                <div className="text-xs text-slate-400">إجمالي اللقطات النشطة</div>
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black text-slate-200">{stats.dbProductsCount || 0}</div>
                <div className="text-xs text-slate-400">منتجات تحت المراقبة</div>
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Globe2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black text-slate-200">{stats.pagesCrawled || 0}</div>
                <div className="text-xs text-slate-400">صفحات تم مسحها</div>
              </div>
            </div>
          </div>
        )}

        {/* Market Navigation Tabs */}
        <div className="border-b border-slate-800 flex overflow-x-auto no-scrollbar gap-2 pb-1">
          {[
            { id: 'all', label: 'كافة الأسواق', flag: '🌐' },
            { id: 'noon-eg', label: 'نون مصر', flag: '🇪🇬' },
            { id: 'noon-ae', label: 'نون الإمارات', flag: '🇦🇪' },
            { id: 'amazon-eg', label: 'أمازون مصر', flag: '🇪🇬' },
            { id: 'amazon-ae', label: 'أمازون الإمارات', flag: '🇦🇪' },
            { id: 'fake', label: 'تخفيضات وهمية', flag: '⚠️' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveMarket(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
                activeMarket === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              <span>{tab.flag}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Filters Bar */}
        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              <span>فلاتر:</span>
            </div>

            {/* Min Drop Filter */}
            <select
              value={minDropPct}
              onChange={(e) => setMinDropPct(Number(e.target.value))}
              aria-label="الحد الأدنى لنسبة الخصم"
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value={50}>خصم ≥ 50%</option>
              <option value={60}>خصم ≥ 60%</option>
              <option value={70}>خصم ≥ 70%</option>
              <option value={80}>خصم ≥ 80%</option>
              <option value={90}>خصم ≥ 90% (استثنائي)</option>
            </select>

            {/* Seller Filter */}
            <select
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value as any)}
              aria-label="نوع البائع"
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value="all">كل البائعين</option>
              <option value="store">المتجر الرسمي نفسه (أمازون / نون)</option>
              <option value="fulfilled_by_store">شحن المتجر (Express / FBA)</option>
              <option value="third_party">بائع خارجي</option>
            </select>

            {/* Deal Type Filter */}
            <select
              value={dealTypeFilter}
              onChange={(e) => setDealTypeFilter(e.target.value as any)}
              aria-label="نوع الصفقة"
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value="all">كل أنواع اللقطات</option>
              <option value="pricing_error">🚨 غلطات تسعير فقط</option>
              <option value="real">✅ خصومات حقيقية فقط</option>
            </select>
          </div>

          <div className="text-xs text-slate-400">
            المعروض: <span className="font-bold text-amber-400">{filteredDeals.length}</span> لقطة
          </div>
        </div>

        {/* Deals Grid */}
        {filteredDeals.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900/30 border border-slate-800/80 space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-500">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">لا توجد صفقات تطابق هذا الفلتر حالياً</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              اضغط على زر «تحديث لحظي» لبدء فحص الأقسام فوراً واكتشاف المنتجات الجديدة ذات الخصومات الكبرى.
            </p>
            <button
              onClick={triggerInstantScan}
              disabled={isScanning}
              className="px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 inline-flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span>فحص الأقسام الآن</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDeals.map((deal) => {
              const isStoreSold = deal.sellerType === 'store';
              const isFulfilled = deal.sellerType === 'fulfilled_by_store';
              const isPricingError = deal.dealType === 'pricing_error';
              const savings = Math.max(0, deal.refPrice - deal.newPrice);
              const currencyStr = deal.market.endsWith('-ae') ? 'درهم' : 'جنيه';

              return (
                <div
                  key={deal.id}
                  className={`relative rounded-3xl overflow-hidden flex flex-col transition-all duration-200 ${
                    isStoreSold
                      ? 'border-2 border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-500/10'
                      : isFulfilled
                      ? 'border-2 border-amber-500/70 bg-amber-950/15'
                      : 'border border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  {/* Top Highlight Banner for Store Seller */}
                  {isStoreSold && (
                    <div className="bg-emerald-600 text-white text-xs font-black py-1.5 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>البائع: {deal.store === 'amazon' ? 'AMAZON' : 'NOON'} نفسه رسميًا</span>
                      </div>
                      <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded-full font-bold">موثوق 100%</span>
                    </div>
                  )}

                  {isFulfilled && !isStoreSold && (
                    <div className="bg-amber-600/90 text-slate-950 text-xs font-bold py-1 px-4 flex items-center justify-between">
                      <span>الشحن بواسطة {deal.store === 'amazon' ? 'أمازون (FBA)' : 'نون (Express)'}</span>
                      <span className="text-[10px] bg-amber-700 text-white px-2 py-0.5 rounded-full">شحن سريع ومضمون</span>
                    </div>
                  )}

                  {/* Card Content */}
                  <div className="p-4 sm:p-5 flex-1 flex flex-col gap-4">
                    {/* Header Row: Badges & Market */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Drop Pct Badge */}
                        <div
                          className={`text-xl sm:text-2xl font-black px-3 py-1 rounded-xl flex items-center gap-1 ${
                            isPricingError
                              ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-500/30'
                              : 'bg-amber-500 text-slate-950'
                          }`}
                        >
                          <span>−{deal.dropPct}%</span>
                        </div>

                        {/* Deal Type Badge */}
                        {isPricingError ? (
                          <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5" />
                            غلطة تسعير
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            خصم حقيقي
                          </span>
                        )}
                      </div>

                      {/* Market Pill */}
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/80">
                        {deal.market === 'noon-eg' && 'نون مصر 🇪🇬'}
                        {deal.market === 'noon-ae' && 'نون الإمارات 🇦🇪'}
                        {deal.market === 'amazon-eg' && 'أمازون مصر 🇪🇬'}
                        {deal.market === 'amazon-ae' && 'أمازون الإمارات 🇦🇪'}
                      </span>
                    </div>

                    {/* Image & Title */}
                    <div className="flex gap-4 items-center">
                      <div className="w-20 h-20 rounded-2xl bg-slate-800/80 border border-slate-700/60 overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
                        {deal.image ? (
                          <img src={deal.image} alt={deal.title} className="w-full h-full object-contain" />
                        ) : (
                          <ShoppingBag className="w-8 h-8 text-slate-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-sm sm:text-base text-slate-100 line-clamp-2 leading-snug hover:text-amber-400 transition-colors">
                          <a href={deal.url} target="_blank" rel="noopener noreferrer">
                            {deal.title}
                          </a>
                        </h2>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatRelativeTime(deal.detectedAt)}</span>
                          <span>•</span>
                          <span className="text-[11px] font-mono text-slate-500">{deal.externalId}</span>
                        </div>
                      </div>
                    </div>

                    {/* Pricing Box */}
                    <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400 line-through">
                          كان: {deal.refPrice.toLocaleString()} {currencyStr}
                        </div>
                        <div className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight">
                          {deal.newPrice.toLocaleString()}{' '}
                          <span className="text-sm font-semibold text-slate-300">{currencyStr}</span>
                        </div>
                      </div>

                      {savings > 0 && (
                        <div className="text-right">
                          <div className="text-[10px] text-emerald-400 font-bold">وفرت</div>
                          <div className="text-sm font-black text-emerald-400">
                            +{savings.toLocaleString()} {currencyStr}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Seller details & Reasons */}
                    <div className="text-xs text-slate-400 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>البائع:</span>
                        <span className="font-bold text-slate-200">
                          {isStoreSold
                            ? `${deal.store === 'amazon' ? 'Amazon' : 'Noon'} نفسه`
                            : deal.sellerName || (isFulfilled ? 'بائع معتمد (شحن المتجر)' : 'بائع خارجي')}
                        </span>
                      </div>
                      {deal.reasons && deal.reasons.length > 0 && (
                        <div className="text-[11px] text-slate-400 line-clamp-1 italic">
                          💡 {deal.reasons[0]}
                        </div>
                      )}
                    </div>

                    {/* Action Buy Button */}
                    <a
                      href={deal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full mt-auto py-3 rounded-2xl font-black text-sm bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all"
                    >
                      <span>اشتري الآن</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Solver Modal */}
      {isSolverOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-5">
            <div className="flex items-center gap-3 text-indigo-400">
              <ShieldCheck className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">حل الكابتشا وتثبيت الجلسة</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              اختر السوق الذي تريد فتح متصفح له أمامك على الشاشة لتحل الكابتشا يدوياً بيدك. ستُحفظ ملفات الجلسة في البروفايل تلقائياً ولن تظهر الكابتشا مجدداً.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'noon-eg', label: 'نون مصر 🇪🇬' },
                { id: 'noon-ae', label: 'نون الإمارات 🇦🇪' },
                { id: 'amazon-eg', label: 'أمازون مصر 🇪🇬' },
                { id: 'amazon-ae', label: 'أمازون الإمارات 🇦🇪' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    openBrowserSolver(m.id as MarketId);
                    setIsSolverOpen(false);
                  }}
                  className="p-3 rounded-2xl bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500 text-xs font-bold text-slate-200 transition-all text-center"
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsSolverOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 hover:text-white"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
