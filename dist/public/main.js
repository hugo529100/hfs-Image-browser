'use strict';
(function () {
    const BUILTIN = {
        enableWheelSwitch: true,
        wheelDebounceMs: 120,
        maxWheelStep: 5,
        maxTouchStep: 5,
        enableKeyboardNav: true,
        enableClickToSelect: true,
        enableDirectJump: true,
        enableInterruptOnNavigate: true,

        mainImageFadeOutMs: 400,
        mainImageFadeInMs: 500,
        trackFadeMs: 200,
        transitionDuration: 250,
        mobileTransitionDuration: 150,

        thumbnailSpacing: 8,
        mobileThumbnailSpacing: 4,

        mobileBreakpoint: 640,
        mobileThumbnailSize: 56,

        unmountDelayMs: 300,
        mountDelayMs: 60,
        coldStartMs: 500,

        collapseTabSize: 22,

        settleDelayMs: 500,
    };

    const SETTLE_TIERS = [
        { minSize: 50 * 1024 * 1024, delay: 5000 },
        { minSize: 20 * 1024 * 1024, delay: 4000 },
        { minSize: 10 * 1024 * 1024, delay: 3000 },
        { minSize: 3  * 1024 * 1024, delay: 1000 },
    ];

    // 縮圖條拖曳參數
    const DRAG_CFG = {
        slopPx: 10,            // 水平位移超過此值才判定為拖曳（太小會把點擊誤判成拖曳）
        switchIntervalMs: 90,  // 拖曳期間更新預覽／高亮的節流
        dwellMs: 180,          // 停在同一格多久才把預覽升級成原圖
    };

    const COLLAPSE_KEY = 'ib.collapsed';

    // 右上角「Countdown-load」模式切換鈕（記在 localStorage，刷新後保持）
    //   'countdown' → Ⓒ 倒計時加載原圖模式
    //   'thumb'     → Ⓣ 停用倒計時、只顯示縮圖模式
    // 預設：Ⓣ（縮圖模式）
    const LOAD_MODE_KEY = 'ib.loadMode';
    let countdownLoad = false;

    const BLANK_PIXEL =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    const PREVIEW = {
        enabled: true,
    };

    const PROGRESS = {
        enabled: true,
    };

    function loadCollapseState() {
        try {
            return localStorage.getItem(COLLAPSE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function saveCollapseState(collapsed) {
        try {
            localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
        } catch (e) { }
    }

    function loadCountdownPref() {
        try {
            const v = localStorage.getItem(LOAD_MODE_KEY);
            // 沒有記錄 → 預設「Ⓣ 縮圖模式」（不倒計時、不預載）
            countdownLoad = v === 'countdown';
        } catch (e) {
            countdownLoad = false;
        }
        return countdownLoad;
    }

    function saveCountdownPref(on) {
        try {
            localStorage.setItem(LOAD_MODE_KEY, on ? 'countdown' : 'thumb');
        } catch (e) { }
    }

    // 是否允許「自動／倒計時載入原圖」。
    // 關閉（預設 Ⓣ）：不倒計時、不預載，只顯示縮圖；
    //   點主圖區、放大或切回 Ⓒ 才載入高清圖。
    function countdownLoadEnabled() {
        return countdownLoad;
    }

    // ============================================================
    // 把面板上的 pixels / quality / regenerateBefore 套用到 thumbnails 外掛
    //
    // Image-browser 的暫時預覽圖就是 thumbnails 的 ?get=thumb。
    // HFS 沒有「A 外掛寫 B 外掛設定」的伺服器 API，但管理員身分可以用
    // 後台同款的 get_plugin / set_plugin：先讀回完整設定再合併，
    // 只改這三個 key（不會動到 exif / thresholds 等其他欄位），
    // 而且只有「與目前 thumbnails 設定不同」時才寫入。
    // 非管理員／未登入：完全不呼叫 API，只在面板顯示。
    // ============================================================
    let thumbSyncDone = false;

    function syncThumbnailSettings() {
        if (thumbSyncDone) return;
        const H = window.HFS || {};
        if (typeof H.apiCall !== 'function') return;
        const sess = H.session || {};
        if (!sess.isAdmin) return;
        const pixels = Math.round(Number(C.pixels));
        const quality = Math.round(Number(C.quality));
        if (!pixels || !quality) return;
        const regenerateBefore = C.regenerateBefore || '';

        thumbSyncDone = true;
        const fail = (e) => {
            thumbSyncDone = false;
            try {
                console.warn('[Image-browser] thumbnails settings not applied:',
                    e && (e.message || e));
            } catch (err) { }
        };

        Promise.resolve()
            .then(() => H.apiCall('get_plugin', { id: 'thumbnails' }))
            .then(res => {
                const conf = (res && res.config) || {};
                const next = Object.assign({}, conf, {
                    pixels: pixels,
                    quality: quality,
                });
                if (regenerateBefore) next.regenerateBefore = regenerateBefore;
                // 完全相同就不寫，避免每次載入都動 thumbnails 的設定
                if (JSON.stringify(next) === JSON.stringify(conf)) return null;
                return H.apiCall('set_plugin', { id: 'thumbnails', config: next });
            })
            .catch(fail);
    }

    let C = {
        thumbnailSize: 10,
        thumbnailSizeUnit: 'vh',
        mobileThumbnailSize: 6,
        mobileThumbnailSizeUnit: 'vh',
        hugeImageThresholdMb: 8,
        hugeCountdownSeconds: 3,
        canvasThresholdMb: 50,
        // 面板上的縮圖設定（載入時會同步到 thumbnails 外掛）
        pixels: 800,
        quality: 95,
        regenerateBefore: '',
    };

    function loadConfig() {
        try {
            const raw = (window.HFS && window.HFS.getPluginConfig)
                ? window.HFS.getPluginConfig() : {};
            Object.keys(C).forEach(k => {
                if (raw[k] !== undefined && raw[k] !== null) C[k] = raw[k];
            });
        } catch (e) { }
    }

    function getHugeThresholdBytes() {
        const mb = Math.max(1, Math.floor(+C.hugeImageThresholdMb) || 8);
        return mb * 1024 * 1024;
    }

    function getHugeCountdownMs() {
        const sec = Math.max(1, Math.floor(+C.hugeCountdownSeconds) || 3);
        return sec * 1000;
    }

    function getCanvasThresholdBytes() {
        const mb = Math.max(1, Math.floor(+C.canvasThresholdMb) || 50);
        return mb * 1024 * 1024;
    }

    function resolveThumbHeight(value, unit) {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) return null;
        switch (unit) {
            case 'vh':
                return Math.round((num / 100) * window.innerHeight);
            case 'vw':
                return Math.round((num / 100) * window.innerWidth);
            case 'px':
            default:
                return Math.round(num);
        }
    }

    function getEffectiveThumbSize() {
        const isMobile = window.innerWidth <= BUILTIN.mobileBreakpoint;
        const rawSize = isMobile ? C.mobileThumbnailSize : C.thumbnailSize;
        const rawUnit = isMobile
            ? (C.mobileThumbnailSizeUnit || 'px')
            : (C.thumbnailSizeUnit || 'px');
        const resolved = resolveThumbHeight(rawSize, rawUnit);
        const h = (resolved && resolved > 0)
            ? resolved
            : (isMobile ? BUILTIN.mobileThumbnailSize : BUILTIN.thumbnailSize);
        return {
            h,
            gap: isMobile ? BUILTIN.mobileThumbnailSpacing : BUILTIN.thumbnailSpacing,
            trans: isMobile ? BUILTIN.mobileTransitionDuration : BUILTIN.transitionDuration,
        };
    }

    // ============================================================
    // 幾何快照：縮圖尺寸只算一次，CSS 變數與所有幾何計算共用同一份。
    // 舊版每個函式各自呼叫 getEffectiveThumbSize()：一旦視窗尺寸在
    // 「寫 CSS 變數」與「算 pad / 置中」之間改變（旋轉螢幕、工具列伸縮、
    // HFS 重繪後重新 mount），DOM 用舊尺寸、計算用新尺寸 → 選中格偏掉。
    // ============================================================
    const metricsState = { thumbH: 0, thumbW: 0, gap: 0, itemW: 0, key: '' };

    function injectCssVars() {
        const size = getEffectiveThumbSize();
        const thumbH = size.h;
        const thumbW = Math.round(thumbH * 1.33);
        const gap = size.gap;
        const itemW = thumbW + gap;

        metricsState.thumbH = thumbH;
        metricsState.thumbW = thumbW;
        metricsState.gap = gap;
        metricsState.itemW = itemW;
        metricsState.key = `${thumbH}x${gap}`;

        const root = document.documentElement;
        root.style.setProperty('--ib-thumb-h', thumbH + 'px');
        root.style.setProperty('--ib-thumb-w', thumbW + 'px');
        root.style.setProperty('--ib-thumb-gap', gap + 'px');
        root.style.setProperty('--ib-item-w', itemW + 'px');
        root.style.setProperty('--ib-transition', size.trans + 'ms');
        root.style.setProperty('--ib-fade-out', BUILTIN.mainImageFadeOutMs + 'ms');
        root.style.setProperty('--ib-fade-in', BUILTIN.mainImageFadeInMs + 'ms');
        root.style.setProperty('--ib-track-fade', BUILTIN.trackFadeMs + 'ms');
        root.style.setProperty('--ib-tab-size', BUILTIN.collapseTabSize + 'px');
        return metricsState;
    }

    // 幾何計算一律吃這一份；尚未初始化時先補算
    function requireMetrics() {
        if (!metricsState.key) injectCssVars();
        return metricsState;
    }

    const IMG_EXTS = [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
        'svg', 'avif', 'ico', 'tif', 'tiff', 'psd'
    ];
    function isImageExt(ext) {
        if (!ext) return false;
        return IMG_EXTS.includes(String(ext).toLowerCase());
    }
    function isImageName(name) {
        if (!name) return false;
        return isImageExt(String(name).split('.').pop());
    }

    function getEffectiveImageUrl(img) {
        if (!img || !img.url) return '';
        const name = img.name || String(img.url).split('?')[0].split('/').pop();
        if (!name) return img.url;
        const ext = String(name).split('.').pop().toLowerCase();
        if (ext === 'tif' || ext === 'tiff') {
            const sep = img.url.includes('?') ? '&' : '?';
            return img.url + sep + 'convert=tiff';
        }
        if (ext === 'bmp') {
            const sep = img.url.includes('?') ? '&' : '?';
            return img.url + sep + 'convert=bmp';
        }
        if (ext === 'psd') {
            const sep = img.url.includes('?') ? '&' : '?';
            return img.url + sep + 'convert=psd';
        }
        return img.url;
    }

    function formatBytes(n) {
        if (n === null || n === undefined || isNaN(n)) return '';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
        return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    function formatDate(ts) {
        if (!ts) return '';
        try {
            const d = new Date(ts);
            if (isNaN(d.getTime())) return '';
            const pad = v => String(v).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
                   `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch (e) { return ''; }
    }

    function formatAspectRatio(w, h) {
        if (!w || !h) return '';
        const gcd = (a, b) => b ? gcd(b, a % b) : a;
        const g = gcd(w, h);
        let rw = w / g;
        let rh = h / g;
        if (rw > 30 || rh > 30) {
            const dec = w / h;
            const KNOWN = [
                [1, 1], [4, 3], [3, 2], [16, 9], [16, 10], [21, 9], [5, 4], [7, 5],
            ];
            for (const [kw, kh] of KNOWN) {
                if (Math.abs(dec - kw / kh) < 0.01) return `${kw}:${kh}`;
            }
            return dec.toFixed(2) + ':1';
        }
        return `${rw}:${rh}`;
    }

    function formatMegapixels(mp) {
        if (mp === null || mp === undefined || isNaN(mp) || mp <= 0) return '';
        if (mp >= 10) return mp.toFixed(1) + ' MP';
        return mp.toFixed(2) + ' MP';
    }

    const WINDOW_CFG = {
        INITIAL_RADIUS: 25,
        MARGIN: 20,
        EXTEND_STEP: 40,
        MAX_RENDERED: 300,
        KEEP_RADIUS: 120,
    };

    const state = {
        images: [],
        currentIndex: -1,
        stripEl: null,
        trackEl: null,
        counterEl: null,
        fileInfoEl: null,
        collapseTabEl: null,
        selectorEl: null,
        zoomControlsEl: null,
        mainEl: null,
        showingContainerEl: null,
        collapsed: false,
        lastWheelTime: 0,
        listFetchedFor: '',
        listFetching: false,
        // 抓清單時 HFS.state.list 的長度；用來偵測刪除／新增後清單過期
        hfsListCount: -1,
        lastListRefreshAt: 0,
        nextButtonSide: 'right',
        detecting: false,
        lastKnownName: '',
        winStart: 0,
        winEnd: 0,
        thumbEls: new Map(),
        jumpMode: null,
        lastRenderIndex: -1,
        lastSizeKey: '',
        lastAspectKey: '',
        mountedAt: 0,
        metaCache: new Map(),
        resizeReloadTimer: null,
        orientationTimer: null,
        resizeDeferred: false,
        settleTimer: null,
        pendingLoadIndex: -1,

        // === 縮圖條拖曳狀態 ===
        dragging: false,          // 拖曳中：壓制 centerOnIndex / 全域 observer
        dragPreviewIndex: -1,     // 拖曳期間手指所在（置中）的索引
        activeClassIndex: -1,     // 目前掛著 .ib-active 的索引，供增量更新
        trackX: 0,                // 目前 track 的 translateX（避免解析 style 字串）
    };

    const hugeState = {
        el: null,
        timer: null,
        deadline: 0,
        targetIndex: -1,
        countdownMs: 0,
        parkedSrc: '',
        gateClosed: false,
        gateIndex: -1,
    };

    // === PATCH B：記錄攔截前的原始 src，供 mount() 推導路徑 ===
    let preInterceptSrc = '';
    // === PATCH B END ===

    // === PATCH 1：首屏原生攔截標記 ===
    let bootInterceptDone = false;
    // === PATCH 1 END ===

    function closeGate(index) {
        hugeState.gateClosed = true;
        hugeState.gateIndex = index;
    }

    function openGate(index) {
        hugeState.gateClosed = false;
        hugeState.gateIndex = index;
    }

    function clearHugeOverlay() {
        if (hugeState.timer) {
            clearTimeout(hugeState.timer);
            clearInterval(hugeState.timer);
            hugeState.timer = null;
        }
        if (hugeState.el && hugeState.el.parentNode) {
            hugeState.el.remove();
        }
        hugeState.el = null;
        hugeState.deadline = 0;
        hugeState.targetIndex = -1;
        hugeState.countdownMs = 0;
        // 不清 gateClosed / gateIndex / parkedSrc：由 openGate/closeGate 显式控制
    }

    function startHugeCountdown(index, forceAuto) {
        const img = state.images[index];
        if (!img) return;

        // 拖曳中不要起倒計時：等放手後再依最終選取的圖重新起算，
        // 否則倒計時會在拖曳途中跑完，並用「拖曳前」的索引去下載舊圖。
        if (state.dragging) return;

        // Countdown-load 關閉：不倒計時、不預載，只留縮圖等使用者點擊。
        // forceAuto = 使用者主動要求（放大手勢/放大按鈕），照樣走倒計時。
        if (!countdownLoadEnabled() && !forceAuto) {
            if (state.settleTimer) {
                clearTimeout(state.settleTimer);
                state.settleTimer = null;
            }
            clearHugeOverlay();
            state.pendingLoadIndex = index;
            if (!isImageAlreadyLoaded(img)) armProgressivePreview(img);
            return;
        }

        clearHugeOverlay();

        // 邪修闸门：摘掉 img.showing 的原图 src，关闸，阻止 HFS 原生加载
        const showingNow = getMainImage();
        if (showingNow) {
            const cur = showingNow.getAttribute('src') || '';
            if (cur && !cur.startsWith('data:')) hugeState.parkedSrc = cur;
            try {
                showingNow.removeAttribute('srcset');
                showingNow.setAttribute('loading', 'lazy');
                showingNow.style.setProperty('opacity', '0', 'important');
                // === PATCH 2：不要在这里无条件覆盖成 BLANK_PIXEL，
                // 若已有缩略图（非 data:）保留它，避免倒计时期间黑屏 ===
                if (!cur || cur.startsWith('data:')) {
                    showingNow.src = BLANK_PIXEL;
                }
                // === PATCH 2 END ===
            } catch (e) { }
        }
        closeGate(index);

        const container = getShowingContainerEl();
        if (!container) {
            hugeState.targetIndex = index;
            hugeState.deadline = 0;
            hugeState.countdownMs = 0;
            hugeState.timer = setTimeout(() => {
                hugeState.timer = null;
                if (state.currentIndex !== index) return;
                startHugeCountdown(index);
            }, 120);
            return;
        }

        try {
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
        } catch (e) { }

        const countdownMs = getHugeCountdownMs();

        const overlay = document.createElement('div');
        overlay.className = 'ib-huge-overlay';
        overlay.innerHTML =
            '<div class="ib-huge-countdown">' + Math.ceil(countdownMs / 1000) + '</div>' +
            '<div class="ib-huge-text">Click to load now</div>' +
            '<div class="ib-huge-hint">' + formatBytes(img.size || 0) + ' · Large image</div>';
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            forceHugeLoad(index);
        });
        container.appendChild(overlay);

        hugeState.el = overlay;
        hugeState.targetIndex = index;
        hugeState.deadline = Date.now() + countdownMs;
        hugeState.countdownMs = countdownMs;

        updateHugeOverlay();

        hugeState.timer = setInterval(() => {
            updateHugeOverlay();
            if (Date.now() >= hugeState.deadline) {
                forceHugeLoad(index);
            }
        }, 200);
    }

    function updateHugeOverlay() {
        if (!hugeState.el) return;
        const remain = Math.max(0, hugeState.deadline - Date.now());
        const sec = Math.ceil(remain / 1000);
        const cd = hugeState.el.querySelector('.ib-huge-countdown');
        if (cd) cd.textContent = sec;
    }

    function forceHugeLoad(index) {
        clearHugeOverlay();
        if (state.currentIndex !== index) return;
        if (state.settleTimer) {
            clearTimeout(state.settleTimer);
            state.settleTimer = null;
        }
        state.pendingLoadIndex = -1;
        openGate(index);
        doLoadMainImage(index, true);
    }

    function isHugeImage(img) {
        if (!img) return false;
        const size = (img.size !== null && img.size !== undefined) ? img.size : 0;
        return size >= getHugeThresholdBytes();
    }

    function isSuperHugeImage(img) {
        if (!img) return false;
        const size = (img.size !== null && img.size !== undefined) ? img.size : 0;
        return size >= getCanvasThresholdBytes();
    }

    function shouldUseCanvas(img) {
        return isSuperHugeImage(img);
    }

    function normalizeUrl(u) {
        if (!u) return '';
        try {
            const url = new URL(u, location.origin);
            return url.pathname + url.search;
        } catch (e) {
            return u;
        }
    }

    function getMainImage() {
        return document.querySelector('.file-show img.showing');
    }

    function getShowingContainerEl() {
        const img = getMainImage();
        if (!img) return null;
        return img.closest('.showing-container') || img.parentElement || null;
    }

    function isImageAlreadyLoaded(img) {
        if (!img) return false;
        const showing = getMainImage();
        if (!showing || !showing.complete || !showing.naturalWidth) return false;
        const src = showing.getAttribute('src') || '';
        if (!src || src.startsWith('blob:') || src.startsWith('data:')) return false;
        return normalizeUrl(src) === normalizeUrl(getEffectiveImageUrl(img));
    }

    // 上一輪原生載入的 load/error 監聽（縮圖的 load 不會被當成原圖，
    // 監聽要留到真正的原圖載入為止；這裡記錄起來，下一輪先清掉避免累積）
    let mainLoadCleanup = null;

    function loadMainImageNative(img) {
        if (!img || !img.url) return;
        const showing = getMainImage();
        if (!showing) return;

        // 闸门：未放行则不允许设原图 src
        if (hugeState.gateClosed) return;
        if (hugeState.gateIndex >= 0 &&
            state.images[hugeState.gateIndex] !== img) return;

        // 双保险：倒计时未结束不加载
        if (hugeState.el &&
            hugeState.targetIndex >= 0 &&
            state.images[hugeState.targetIndex] === img &&
            Date.now() < hugeState.deadline) {
            return;
        }

        try { showing.removeAttribute('srcset'); } catch (e) { }
        try { showing.removeAttribute('loading'); } catch (e) { }

        // 保持 opacity:0，等真正加载出内容再显示，避免空白闪烁
        try {
            showing.style.setProperty('opacity', '0', 'important');
        } catch (e) {
            showing.style.opacity = '0';
        }
        showing.classList.remove('ib-fading');

        const expected = normalizeUrl(getEffectiveImageUrl(img));
        const onReady = () => {
            if (!showing.naturalWidth) return;
            const s = showing.getAttribute('src') || '';
            if (s.startsWith('data:')) return;
            // 縮圖 / 舊圖的 load 不算數，繼續等真正的原圖（避免提早收掉預覽層）
            if (normalizeUrl(s) !== expected) return;
            try { showing.removeEventListener('load', onReady); } catch (e) { }
            try { showing.removeEventListener('error', onReady); } catch (e) { }
            if (mainLoadCleanup && mainLoadCleanup.fn === onReady) mainLoadCleanup = null;
            finishProgress();
            rememberLoadedFull(fullImageKey(img));
            // 真圖已畫出：先收拖曳預覽層
            dropDragPreview();
            // 若漸進預覽還綁在同一個 <img> 上（例如它自己已因縮圖 load 而 finalize 過），
            // 这里要主動交棒，否則它會一直蓋住／藏住剛載入的真圖。
            if (previewBoundShowing === showing) clearProgressivePreview();
            // 最後由「唯一出口」決定是否讓主圖現身
            revealShowingIfIdle();
            // 原圖就緒 → Ⓡ/Ⓐ/Ⓟ 立刻顯示（不必再點一次）
            updateFileInfoResFromShowing(showing);
        };

        if (mainLoadCleanup) {
            try { mainLoadCleanup.el.removeEventListener('load', mainLoadCleanup.fn); } catch (e) { }
            try { mainLoadCleanup.el.removeEventListener('error', mainLoadCleanup.fn); } catch (e) { }
            mainLoadCleanup = null;
        }
        showing.addEventListener('load', onReady);
        showing.addEventListener('error', onReady);
        mainLoadCleanup = { el: showing, fn: onReady };

        showing.src = getEffectiveImageUrl(img);

        startProgressFor(state.currentIndex);

        if (showing.complete && showing.naturalWidth > 0) {
            const s = showing.getAttribute('src') || '';
            if (!s.startsWith('data:')) requestAnimationFrame(onReady);
        }
    }

    const ZOOM_CFG = {
        MIN: 1,
        MAX: 60,
        STEP: 0.5,
        PAN_STEP: 40,
    };

    const zoomState = {
        scale: 1,
        translateX: 0,
        translateY: 0,
        dragging: false,
        dragStartX: 0,
        dragStartY: 0,
        startTranslateX: 0,
        startTranslateY: 0,
        lastTouchDist: 0,
        pinchStartScale: 1,
        pinchStartTranslateX: 0,
        pinchStartTranslateY: 0,
        pinchStartCenterX: 0,
        pinchStartCenterY: 0,
        // 這次手勢是否已經因放大而要求過高清圖（每次手勢只要求一次）
        hdRequested: false,
    };

    const canvasState = {
        el: null,
        ctx: null,
        naturalW: 0,
        naturalH: 0,
        dpr: 1,
        active: false,
        srcUrl: '',
        pendingSrc: '',
        loadToken: 0,
        image: null,
        renderPending: false,
    };

    const MAX_SOURCE_EDGE = 8192;

    function getCanvasLayer() {
        return canvasState.el;
    }

    function ensureCanvasLayer() {
        const container = getShowingContainerEl();
        if (!container) return null;
        if (canvasState.el && canvasState.el.parentNode === container) {
            return canvasState.el;
        }
        removeCanvasLayer();
        const cv = document.createElement('canvas');
        cv.className = 'ib-canvas-layer';
        cv.style.position = 'absolute';
        cv.style.inset = '0';
        cv.style.width = '100%';
        cv.style.height = '100%';
        cv.style.pointerEvents = 'none';
        cv.style.zIndex = '2';
        cv.style.display = 'none';
        container.appendChild(cv);
        canvasState.el = cv;
        canvasState.ctx = cv.getContext('2d');
        return cv;
    }

    function removeCanvasLayer() {
        if (canvasState.el && canvasState.el.parentNode) {
            canvasState.el.remove();
        }
        canvasState.el = null;
        canvasState.ctx = null;
        canvasState.active = false;
        canvasState.image = null;
        canvasState.srcUrl = '';
        canvasState.pendingSrc = '';
        canvasState.loadToken++;
        canvasState.renderPending = false;
    }

    function sizeCanvasToContainer() {
        const cv = canvasState.el;
        const container = getShowingContainerEl();
        if (!cv || !container) return;
        const dpr = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
        const cw = Math.max(1, container.clientWidth);
        const ch = Math.max(1, container.clientHeight);
        const needW = Math.round(cw * dpr);
        const needH = Math.round(ch * dpr);
        if (cv.width !== needW || cv.height !== needH) {
            cv.width = needW;
            cv.height = needH;
        }
        canvasState.dpr = dpr;
    }

    function getBaseFitRect() {
        const container = getShowingContainerEl();
        if (!container) return null;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const nw = canvasState.naturalW;
        const nh = canvasState.naturalH;
        if (!cw || !ch || !nw || !nh) return null;
        const fit = Math.min(cw / nw, ch / nh);
        const dispW = nw * fit;
        const dispH = nh * fit;
        return { cw, ch, nw, nh, fit, dispW, dispH };
    }

    function renderCanvas() {
        const cv = canvasState.el;
        const ctx = canvasState.ctx;
        const imgEl = canvasState.image;
        if (!cv || !ctx || !imgEl) return;
        if (!canvasState.active) return;

        sizeCanvasToContainer();
        const base = getBaseFitRect();
        if (!base) return;

        const dpr = canvasState.dpr;
        const cw = base.cw;
        const ch = base.ch;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);

        const scale = zoomState.scale;
        const tx = zoomState.translateX;
        const ty = zoomState.translateY;

        const dispW = base.dispW * scale;
        const dispH = base.dispH * scale;

        const drawLeft = -dispW / 2 + tx;
        const drawTop = -dispH / 2 + ty;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const destX = drawLeft + cw / 2;
        const destY = drawTop + ch / 2;

        const visX0 = Math.max(0, destX);
        const visY0 = Math.max(0, destY);
        const visX1 = Math.min(cw, destX + dispW);
        const visY1 = Math.min(ch, destY + dispH);
        if (visX1 <= visX0 || visY1 <= visY0) return;

        const sx = (visX0 - destX) / dispW * base.nw;
        const sy = (visY0 - destY) / dispH * base.nh;
        const sw = (visX1 - visX0) / dispW * base.nw;
        const sh = (visY1 - visY0) / dispH * base.nh;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        try {
            ctx.drawImage(
                imgEl,
                sx, sy, sw, sh,
                visX0, visY0, visX1 - visX0, visY1 - visY0
            );
        } catch (e) { }
    }

    function scheduleCanvasRender() {
        if (!canvasState.active) return;
        if (canvasState.renderPending) return;
        canvasState.renderPending = true;
        requestAnimationFrame(() => {
            canvasState.renderPending = false;
            renderCanvas();
        });
    }

    function loadCanvasImage(img) {
        if (!img || !img.url) return;
        ensureCanvasLayer();
        if (!canvasState.el) return;

        const effUrl = getEffectiveImageUrl(img);
        if (canvasState.srcUrl === effUrl && canvasState.image) {
            canvasState.active = true;
            canvasState.el.style.display = 'block';
            hideNativeShowing(true);
            scheduleCanvasRender();
            return;
        }

        const token = ++canvasState.loadToken;
        canvasState.pendingSrc = img.url;

        const loader = new Image();
        loader.decoding = 'async';
        loader.onload = async () => {
            if (token !== canvasState.loadToken) return;
            const cur = state.images[state.currentIndex];
            if (!cur || getEffectiveImageUrl(cur) !== effUrl) return;

            const nw = loader.naturalWidth || 0;
            const nh = loader.naturalHeight || 0;
            let src = loader;
            let sw = nw;
            let sh = nh;

            const maxEdge = Math.max(nw, nh);
            if (maxEdge > MAX_SOURCE_EDGE && typeof createImageBitmap === 'function') {
                const ratio = MAX_SOURCE_EDGE / maxEdge;
                const rw = Math.max(1, Math.round(nw * ratio));
                const rh = Math.max(1, Math.round(nh * ratio));
                try {
                    const bmp = await createImageBitmap(loader, {
                        resizeWidth: rw,
                        resizeHeight: rh,
                        resizeQuality: 'high',
                    });
                    src = bmp;
                    sw = rw;
                    sh = rh;
                } catch (e) {
                    src = loader;
                    sw = nw;
                    sh = nh;
                }
            }

            if (token !== canvasState.loadToken) return;

            canvasState.image = src;
            canvasState.naturalW = sw;
            canvasState.naturalH = sh;
            canvasState.srcUrl = effUrl;
            canvasState.pendingSrc = '';

            // canvas 用原始解碼尺寸（不是可能被縮過的 sw/sh）更新資訊列
            recordResolution(cur, nw, nh);

            canvasState.active = true;
            if (canvasState.el) canvasState.el.style.display = 'block';
            hideNativeShowing(true);
            scheduleCanvasRender();
            finishProgress();
            rememberLoadedFull(normalizeUrl(effUrl));
            dropDragPreview();
            // canvas 已經接手顯示，漸進預覽層也交棒
            clearProgressivePreview();
        };
        loader.onerror = () => {
            if (token !== canvasState.loadToken) return;
            canvasState.pendingSrc = '';
            deactivateCanvas(true);
        };
        loader.src = effUrl;
    }

    function hideNativeShowing(hide) {
        const showing = getMainImage();
        if (!showing) return;
        if (hide) {
            showing.style.visibility = 'hidden';
            showing.style.transform = 'none';
            showing.style.transition = 'none';
        } else {
            showing.style.visibility = '';
        }
    }

    function deactivateCanvas(restoreNative) {
        canvasState.active = false;
        if (canvasState.el) canvasState.el.style.display = 'none';
        canvasState.image = null;
        canvasState.srcUrl = '';
        canvasState.pendingSrc = '';
        canvasState.loadToken++;
        hideNativeShowing(false);
        if (restoreNative) {
            applyZoomTransform(false);
            // canvas 失敗要退回原生 <img>：確保它沒有被預覽層的隱藏規則卡住
            revealShowingIfIdle();
        }
    }

    function getShowingContainer() {
        const img = getMainImage();
        if (!img) return null;
        return img.closest('.showing-container') || img.parentElement || null;
    }

    function setContainerTouchAction(value) {
        const container = getShowingContainer();
        if (container) container.style.touchAction = value;
    }

    function updateZoomLabel() {
        const btn = state.zoomControlsEl
            ? state.zoomControlsEl.querySelector('.ib-zoom-reset')
            : null;
        if (!btn) return;
        const txt = zoomState.scale.toFixed(1) + 'x';
        if (btn.textContent !== txt) btn.textContent = txt;
    }

    function applyZoomTransform(animated = false) {
        const img = getMainImage();
        if (!img) return;

        if (canvasState.active) {
            hideNativeShowing(true);
            scheduleCanvasRender();
            updateZoomLabel();
            return;
        }

        img.style.transition = animated ? 'transform 0.2s ease-out' : 'none';
        img.style.transformOrigin = 'center center';
        img.style.transform =
            `translate(${zoomState.translateX}px, ${zoomState.translateY}px) scale(${zoomState.scale})`;
        img.style.cursor = zoomState.scale > 1
            ? (zoomState.dragging ? 'grabbing' : 'grab')
            : '';
        img.style.willChange = zoomState.scale > 1 ? 'transform' : '';
        img.style.userSelect = 'none';
        img.style.touchAction = zoomState.scale > 1 ? 'none' : '';

        // 主圖還只是縮圖（漸進預覽層在顯示）時，預覽層也要套用同樣的
        // transform，否則縮放時畫面完全不動，等原圖載完才突然跳過去。
        if (previewImgEl) {
            previewImgEl.style.transition = animated ? 'transform 0.2s ease-out' : 'none';
            previewImgEl.style.transformOrigin = 'center center';
            previewImgEl.style.transform =
                `translate(${zoomState.translateX}px, ${zoomState.translateY}px) scale(${zoomState.scale})`;
        }

        updateZoomLabel();
    }

    function clampZoomTranslation() {
        const img = getMainImage();
        if (!img) return;
        const container = img.closest('.main') || img.parentElement;
        if (!container) return;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        let nw = img.naturalWidth || 0;
        let nh = img.naturalHeight || 0;
        if (canvasState.active && canvasState.naturalW && canvasState.naturalH) {
            nw = canvasState.naturalW;
            nh = canvasState.naturalH;
        }
        if (!nw || !nh) return;
        const fit = Math.min(cw / nw, ch / nh);
        const displayW = nw * fit * zoomState.scale;
        const displayH = nh * fit * zoomState.scale;
        const maxX = Math.max(0, (displayW - cw) / 2);
        const maxY = Math.max(0, (displayH - ch) / 2);
        zoomState.translateX = Math.max(-maxX, Math.min(maxX, zoomState.translateX));
        zoomState.translateY = Math.max(-maxY, Math.min(maxY, zoomState.translateY));
    }

    // ============================================================
    // 主動要求高清圖（放大手勢 / 放大按鈕 / 鍵盤 +）
    //
    // 使用者放大＝想看細節，把縮圖放大沒有意義。
    // 不論 Countdown-load 開或關，都走「一般機制」：
    //   巨型圖 → 立刻開始倒計時（點遮罩可立即載入）
    //   其他圖 → 照 settle 排程載入
    // 已經載入 / 已排程 / 已在倒計時 → 不重複觸發。
    // ============================================================
    function requestOriginalForZoom() {
        const idx = state.currentIndex;
        if (idx < 0 || idx >= state.images.length) return;
        const img = state.images[idx];
        if (!img) return;
        if (isImageAlreadyLoaded(img)) return;
        if (hugeState.el && hugeState.targetIndex === idx) return;
        if (state.settleTimer && state.pendingLoadIndex === idx) return;
        armProgressivePreview(img);
        if (isHugeImage(img)) {
            startHugeCountdown(idx, true);
        } else {
            scheduleLoad(idx, true);
        }
    }

    function zoomImage(direction, factor) {
        const oldScale = zoomState.scale;
        let newScale;
        if (typeof factor === 'number' && factor > 0) {
            newScale = factor;
        } else {
            newScale = oldScale + direction * ZOOM_CFG.STEP;
        }
        newScale = Math.max(ZOOM_CFG.MIN, Math.min(ZOOM_CFG.MAX, newScale));
        if (newScale === oldScale) return;

        // 往「放大」方向：主動把原圖載進來（縮圖放大沒有意義）
        if (newScale > oldScale) requestOriginalForZoom();

        const ratio = newScale / oldScale;
        zoomState.translateX *= ratio;
        zoomState.translateY *= ratio;
        zoomState.scale = newScale;

        if (newScale <= 1) {
            zoomState.translateX = 0;
            zoomState.translateY = 0;
        } else {
            clampZoomTranslation();
        }
        applyZoomTransform(true);
    }

    function resetZoom() {
        zoomState.hdRequested = false;
        if (zoomState.scale === 1 &&
            zoomState.translateX === 0 &&
            zoomState.translateY === 0) return;
        zoomState.scale = 1;
        zoomState.translateX = 0;
        zoomState.translateY = 0;
        applyZoomTransform(true);
        setContainerTouchAction('');
        const img = getMainImage();
        if (img) img.style.cursor = '';
    }

    function panZoomBy(dx, dy) {
        if (zoomState.scale <= 1) return false;
        zoomState.translateX += dx;
        zoomState.translateY += dy;
        clampZoomTranslation();
        applyZoomTransform(false);
        return true;
    }

    let zoomDragBound = false;

    function onZoomPointerDown(e) {
        if (zoomState.scale <= 1) return;
        const img = getMainImage();
        if (!img) return;
        if (e.button !== undefined && e.button !== 0) return;
        if (e.target && e.target.closest &&
            e.target.closest('.ib-strip-container, .ib-zoom-controls, .nav, button, a')) {
            return;
        }
        zoomState.dragging = true;
        zoomState.dragStartX = e.clientX;
        zoomState.dragStartY = e.clientY;
        zoomState.startTranslateX = zoomState.translateX;
        zoomState.startTranslateY = zoomState.translateY;
        img.style.cursor = 'grabbing';
        img.style.transition = 'none';
        if (e.pointerId !== undefined && img.setPointerCapture) {
            try { img.setPointerCapture(e.pointerId); } catch (err) { }
        }
        e.preventDefault();
    }

    function onZoomPointerMove(e) {
        if (!zoomState.dragging) return;
        const img = getMainImage();
        if (!img) return;
        const dx = e.clientX - zoomState.dragStartX;
        const dy = e.clientY - zoomState.dragStartY;
        zoomState.translateX = zoomState.startTranslateX + dx;
        zoomState.translateY = zoomState.startTranslateY + dy;
        clampZoomTranslation();
        applyZoomTransform(false);
        e.preventDefault();
    }

    function onZoomPointerUp(e) {
        if (!zoomState.dragging) return;
        zoomState.dragging = false;
        const img = getMainImage();
        if (img) {
            img.style.cursor = zoomState.scale > 1 ? 'grab' : '';
            if (e.pointerId !== undefined && img.releasePointerCapture) {
                try { img.releasePointerCapture(e.pointerId); } catch (err) { }
            }
        }
    }

    function onZoomTouchStart(e) {
        const img = getMainImage();
        if (!img) return;
        if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dx = t2.clientX - t1.clientX;
            const dy = t2.clientY - t1.clientY;
            zoomState.lastTouchDist = Math.sqrt(dx * dx + dy * dy);
            zoomState.pinchStartScale = zoomState.scale;
            zoomState.pinchStartTranslateX = zoomState.translateX;
            zoomState.pinchStartTranslateY = zoomState.translateY;
            // 新手勢：允許再要求一次高清圖（僅放大時觸發）
            zoomState.hdRequested = false;

            const cx = (t1.clientX + t2.clientX) / 2;
            const cy = (t1.clientY + t2.clientY) / 2;

            let baseRect;
            if (canvasState.active) {
                const container = getShowingContainerEl();
                baseRect = container ? container.getBoundingClientRect() : img.getBoundingClientRect();
            } else {
                baseRect = img.getBoundingClientRect();
            }
            zoomState.pinchStartCenterX = cx - (baseRect.left + baseRect.width / 2);
            zoomState.pinchStartCenterY = cy - (baseRect.top + baseRect.height / 2);

            setContainerTouchAction('none');
            e.preventDefault();
        } else if (e.touches.length === 1 && zoomState.scale > 1) {
            const t = e.touches[0];
            zoomState.dragging = true;
            zoomState.dragStartX = t.clientX;
            zoomState.dragStartY = t.clientY;
            zoomState.startTranslateX = zoomState.translateX;
            zoomState.startTranslateY = zoomState.translateY;
            e.preventDefault();
        }
    }

    function onZoomTouchMove(e) {
        const img = getMainImage();
        if (!img) return;
        if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dx = t2.clientX - t1.clientX;
            const dy = t2.clientY - t1.clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (zoomState.lastTouchDist > 0) {
                let newScale = zoomState.pinchStartScale * (dist / zoomState.lastTouchDist);
                newScale = Math.max(ZOOM_CFG.MIN, Math.min(ZOOM_CFG.MAX, newScale));
                zoomState.scale = newScale;
                const scaleRatio = newScale / zoomState.pinchStartScale;
                zoomState.translateX = zoomState.pinchStartTranslateX +
                    zoomState.pinchStartCenterX * (1 - scaleRatio);
                zoomState.translateY = zoomState.pinchStartTranslateY +
                    zoomState.pinchStartCenterY * (1 - scaleRatio);
                if (newScale <= 1) {
                    zoomState.translateX = 0;
                    zoomState.translateY = 0;
                } else {
                    clampZoomTranslation();
                }
                applyZoomTransform(false);
                // 手指往「放大」方向：這次手勢要求一次高清圖
                if (newScale > zoomState.pinchStartScale + 0.01 && !zoomState.hdRequested) {
                    zoomState.hdRequested = true;
                    requestOriginalForZoom();
                }
            }
            setContainerTouchAction('none');
            e.preventDefault();
        } else if (e.touches.length === 1 && zoomState.dragging) {
            const t = e.touches[0];
            const dx = t.clientX - zoomState.dragStartX;
            const dy = t.clientY - zoomState.dragStartY;
            zoomState.translateX = zoomState.startTranslateX + dx;
            zoomState.translateY = zoomState.startTranslateY + dy;
            clampZoomTranslation();
            applyZoomTransform(false);
            e.preventDefault();
        }
    }

    function onZoomTouchEnd(e) {
        if (e.touches.length < 2) {
            zoomState.lastTouchDist = 0;
        }
        if (e.touches.length === 0) {
            zoomState.dragging = false;
            zoomState.hdRequested = false;
        }
        if (zoomState.scale <= 1) {
            zoomState.scale = 1;
            zoomState.translateX = 0;
            zoomState.translateY = 0;
            applyZoomTransform(true);
        }
        if (e.touches.length === 0 && zoomState.scale <= 1) {
            setContainerTouchAction('');
        }
    }

    function bindZoomDrag() {
        const img = getMainImage();
        if (!img) return;
        const container = getShowingContainer();
        if (!container) return;
        if (zoomDragBound) return;
        img.style.cursor = zoomState.scale > 1 ? 'grab' : '';
        container.addEventListener('pointerdown', onZoomPointerDown);
        window.addEventListener('pointermove', onZoomPointerMove);
        window.addEventListener('pointerup', onZoomPointerUp);
        container.addEventListener('touchstart', onZoomTouchStart, { passive: false });
        container.addEventListener('touchmove', onZoomTouchMove, { passive: false });
        container.addEventListener('touchend', onZoomTouchEnd, { passive: true });
        container.addEventListener('touchcancel', onZoomTouchEnd, { passive: true });
        zoomDragBound = true;
    }

    function unbindZoomDrag() {
        const container = getShowingContainer();
        if (container) {
            container.removeEventListener('pointerdown', onZoomPointerDown);
            container.removeEventListener('touchstart', onZoomTouchStart);
            container.removeEventListener('touchmove', onZoomTouchMove);
            container.removeEventListener('touchend', onZoomTouchEnd);
            container.removeEventListener('touchcancel', onZoomTouchEnd);
        }
        window.removeEventListener('pointermove', onZoomPointerMove);
        window.removeEventListener('pointerup', onZoomPointerUp);
        zoomDragBound = false;
    }

    const progressState = {
        targetIndex: -1,
        targetUrl: '',
        el: null,
        fillEl: null,
        textEl: null,
        hideTimer: null,
    };

    function getProgressEls(cell) {
        if (!cell) return null;
        const el = cell.querySelector('.ib-thumb-progress');
        if (!el) return null;
        return {
            el,
            fillEl: el.querySelector('.ib-thumb-progress-fill'),
            textEl: el.querySelector('.ib-thumb-progress-text'),
        };
    }

    function resetProgressVisual() {
        if (progressState.el) progressState.el.classList.remove('is-active');
        if (progressState.fillEl) progressState.fillEl.style.transform = 'scaleY(0)';
        if (progressState.textEl) progressState.textEl.textContent = '0%';
        progressState.el = null;
        progressState.fillEl = null;
        progressState.textEl = null;
        progressState.targetIndex = -1;
        progressState.targetUrl = '';
        if (progressState.hideTimer) {
            clearTimeout(progressState.hideTimer);
            progressState.hideTimer = null;
        }
    }

    function abortProgress() {
        resetProgressVisual();
    }

    function startProgressFor(index) {
        if (!PROGRESS.enabled) return;
        if (!mounted) return;
        if (index < 0 || index >= state.images.length) return;
        const img = state.images[index];
        if (!img) return;

        if (isImageName(img.name)) {
            const ext = String(img.name).split('.').pop().toLowerCase();
            if (ext === 'tif' || ext === 'tiff' || ext === 'bmp' || ext === 'psd') return;
        }

        const cell = state.thumbEls.get(index);
        if (!cell) return;
        const els = getProgressEls(cell);
        if (!els) return;

        if (progressState.el && progressState.el !== els.el) {
            progressState.el.classList.remove('is-active');
        }
        if (progressState.hideTimer) {
            clearTimeout(progressState.hideTimer);
            progressState.hideTimer = null;
        }

        progressState.el = els.el;
        progressState.fillEl = els.fillEl;
        progressState.textEl = els.textEl;
        progressState.targetIndex = index;
        progressState.targetUrl = img.url;

        els.el.classList.add('is-active');
        if (els.textEl) els.textEl.textContent = '0%';
        if (els.fillEl) els.fillEl.style.transform = 'scaleY(0)';
    }

    function applyProgressVisual(pct) {
        if (!progressState.el) return;
        const v = Math.max(0, Math.min(100, pct));
        if (progressState.fillEl) {
            progressState.fillEl.style.transform = `scaleY(${v / 100})`;
        }
        if (progressState.textEl) {
            progressState.textEl.textContent = v + '%';
        }
    }

    function scheduleProgressHide(delay) {
        if (progressState.hideTimer) clearTimeout(progressState.hideTimer);
        const d = (delay === undefined) ? 250 : delay;
        progressState.hideTimer = setTimeout(() => {
            progressState.hideTimer = null;
            if (progressState.el) progressState.el.classList.remove('is-active');
        }, d);
    }

    function finishProgress() {
        applyProgressVisual(100);
        scheduleProgressHide(250);
    }

    let previewImgEl = null;
    let previewBoundShowing = null;
    let previewLoadHandler = null;
    let previewErrorHandler = null;
    let previewCurrentUrl = '';
    let previewSafetyTimer = null;

    function stopPreviewTimers() {
        if (previewSafetyTimer) {
            clearTimeout(previewSafetyTimer);
            previewSafetyTimer = null;
        }
    }

    function clearProgressivePreview() {
        stopPreviewTimers();
        if (previewBoundShowing) {
            if (previewLoadHandler) {
                try { previewBoundShowing.removeEventListener('load', previewLoadHandler); } catch (e) { }
            }
            if (previewErrorHandler) {
                try { previewBoundShowing.removeEventListener('error', previewErrorHandler); } catch (e) { }
            }
        }
        previewBoundShowing = null;
        previewLoadHandler = null;
        previewErrorHandler = null;
        if (previewImgEl) {
            previewImgEl.remove();
            previewImgEl = null;
        }
        previewCurrentUrl = '';
        syncShowingHiddenClass();
    }

    function getReadyThumbSrc(img, index) {
        const cell = state.thumbEls.get(index);
        if (cell) {
            const im = cell.querySelector('.ib-thumb-frame img');
            if (im) {
                const s = im.getAttribute('src') || '';
                if (s && !s.startsWith('data:')) {
                    return s;
                }
            }
        }
        return img.thumbUrl;
    }

    // ============================================================
    // 拖曳時的即時預覽層
    //
    // 需求：拖縮圖條時，主圖區要像以前一樣「邊拖邊換圖」。
    // 舊做法是每一格都 navigateTo()（pushState + HFS 重繪 + 換 src），
    // 那就是卡頓的來源；這裡改成在 .showing-container 上疊「一張」預覽圖：
    //   - 本頁顯示過的原圖 → 直接秀原圖（瀏覽器快取，零下載、全解析度）
    //   - 沒看過的 → 先秀縮圖（條子上早已解碼，切換零成本）
    //   - 停頓超過 dwellMs 且不是巨型圖 → 才升級下載原圖
    // 放手後由 progressive preview / loadMainImageNative 接手，
    // 直到「真正的大圖」載入完成才把這張預覽收掉，所以不會閃黑或閃回舊圖。
    // ============================================================
    const loadedFullUrls = new Set();
    let dragPreviewEl = null;
    let dragPreviewIndex = -1;
    let dragPreviewTimer = 0;
    let dragPreviewPendingFull = '';
    let dragHidShowing = false;
    let dragHidEl = null;

    function fullImageKey(img) {
        return normalizeUrl(getEffectiveImageUrl(img));
    }

    function rememberLoadedFull(key) {
        if (key) loadedFullUrls.add(key);
    }

    function ensureDragPreview() {
        if (dragPreviewEl && dragPreviewEl.isConnected) return dragPreviewEl;
        dragPreviewEl = null;   // 舊節點已被 HFS 換掉 / cleanupMainImageInlineStyles 清掉
        const container = getShowingContainerEl();
        if (!container) return null;
        const el = document.createElement('img');
        // 刻意「不」共用 .ib-progressive-preview：
        // 那個 class 會被「隱藏漸進預覽」的規則命中，
        // 之前的寫法把拖曳層自己也一起藏掉，變成拖曳時完全看不到預覽。
        el.className = 'ib-drag-preview';
        el.decoding = 'async';
        el.draggable = false;
        el.alt = '';
        el.setAttribute('aria-hidden', 'true');
        el.src = BLANK_PIXEL;
        el.addEventListener('load', () => {
            if (dragPreviewPendingFull && el === dragPreviewEl &&
                el.getAttribute('src') === dragPreviewPendingFull) {
                rememberLoadedFull(dragPreviewPendingFull);
                dragPreviewPendingFull = '';
            }
        });
        container.appendChild(el);
        dragPreviewEl = el;
        return el;
    }

    function hideShowingForDrag() {
        const showing = getMainImage();
        if (!showing) return;
        try { showing.style.setProperty('opacity', '0', 'important'); } catch (e) { }
        dragHidShowing = true;
        dragHidEl = showing;
    }

    function showDragPreview(index) {
        const img = state.images[index];
        if (!img) return;
        const el = ensureDragPreview();
        if (!el) return;
        hideShowingForDrag();
        dragPreviewIndex = index;
        syncShowingHiddenClass();

        const full = fullImageKey(img);
        const showFull = loadedFullUrls.has(full);
        const src = showFull
            ? getEffectiveImageUrl(img)
            : (getReadyThumbSrc(img, index) || BLANK_PIXEL);
        if (el.getAttribute('src') !== src) el.src = src;

        if (dragPreviewTimer) { clearTimeout(dragPreviewTimer); dragPreviewTimer = 0; }
        // Countdown-load 關閉時連拖曳中的「停頓升級」也不做（不預載原圖）
        if (!showFull && countdownLoadEnabled() && !isHugeImage(img) && !shouldUseCanvas(img)) {
            const want = getEffectiveImageUrl(img);
            dragPreviewTimer = setTimeout(() => {
                dragPreviewTimer = 0;
                if (!state.dragging || dragPreviewIndex !== index) return;
                const cur = dragPreviewEl;
                if (!cur || !cur.isConnected) return;
                if (cur.getAttribute('src') === want) return;
                dragPreviewPendingFull = want;
                cur.src = want;   // 停頓才升級，快速掃過不會爆量下載
            }, DRAG_CFG.dwellMs);
        }
    }

    function clearDragPreview() {
        if (dragPreviewTimer) { clearTimeout(dragPreviewTimer); dragPreviewTimer = 0; }
        dragPreviewIndex = -1;
        dragPreviewPendingFull = '';
        if (dragPreviewEl) {
            if (dragPreviewEl.parentNode) dragPreviewEl.remove();
            dragPreviewEl = null;
        }
        syncShowingHiddenClass();
    }

    // ============================================================
    // 主圖顯隱的唯一出口
    //
    // 這裡以前散落著好幾處 `showing.style.removeProperty('opacity')`。
    // 導航途中只要有任何一處提前還原（例如前一張的 onReady/finalize 在
    // 拖曳或換圖途中才到），就會把「上一張已載入的大圖」重新顯示出來；
    // 兩張圖長寬比不同時，新預覽圖四周就會疊著舊大圖的殘影。
    // 現在只有「沒有任何預覽層在負責顯示」時才允許主圖現身。
    // ============================================================
    function previewLayerOwnsDisplay() {
        if (dragPreviewEl) return true;   // 拖曳預覽層（含放手後等真圖的空窗）
        const showing = getMainImage();
        return !!(previewBoundShowing && previewBoundShowing === showing);
    }

    function syncShowingHiddenClass() {
        const viewer = document.querySelector('.file-show');
        if (!viewer) return;
        // 用 class 而不是只對某個 <img> 設 inline opacity：
        // HFS 換圖時可能會整個換掉 <img> 節點，class 會連新節點一起藏住。
        viewer.classList.toggle('ib-showing-hidden', previewLayerOwnsDisplay());
        // 拖曳預覽層在顯示時，連同「上一張的漸進預覽 / canvas / 封面底圖」
        // 一起讓位，否則不同長寬比時會從 letterbox 空隙露出第二張圖。
        viewer.classList.toggle('ib-drag-owned', !!dragPreviewEl);
    }

    function revealShowingIfIdle() {
        syncShowingHiddenClass();
        if (previewLayerOwnsDisplay()) return;
        const showing = getMainImage();
        if (!showing) return;
        try { showing.style.removeProperty('opacity'); } catch (e) { }
        showing.classList.remove('ib-fading');
    }

    // ============================================================
    // HFS 自己換圖時的「預覽層交棒」
    //
    // 刪除圖片後 HFS 會直接換掉 <img class="showing"> 的 src（跳下一張），
    // 這時舊的漸進預覽還綁在同一個 <img> 上、主圖又被 opacity:0 藏著，
    // 而 finalize 的目標 URL 還是「被刪掉那張」→ 永遠不會 ready，
    // 於是主界面一直停在舊圖（或它的縮圖）。
    // 這裡把舊預覽清掉，改綁新圖的縮圖；新圖已就緒就直接顯示。
    // ============================================================
    function resyncPreviewForDomChange(index) {
        const showing = getMainImage();
        if (!showing) return;
        const img = index >= 0 ? state.images[index] : null;
        const wantUrl = img ? normalizeUrl(img.url) : '';
        // 綁在舊節點、或綁的目標不是現在這張 → 清掉（含殘留在舊 DOM 的預覽）
        if (previewBoundShowing &&
            (previewBoundShowing !== showing || previewCurrentUrl !== wantUrl)) {
            clearProgressivePreview();
        }
        if (img && !isImageAlreadyLoaded(img)) {
            armProgressivePreview(img, index);
        } else {
            revealShowingIfIdle();
        }
    }

    function dropDragPreview() {
        // 拖曳進行中不拆預覽層：換手時（例如上一張原圖剛載入完成）
        // 拆掉會讓主圖區閃一下，放手時自然會收。
        if (state.dragging) return;
        clearDragPreview();
        if (!dragHidShowing) {
            revealShowingIfIdle();
            return;
        }
        dragHidShowing = false;
        const hidden = dragHidEl;
        dragHidEl = null;
        // 只還原「我們自己藏起來的那個 img」；HFS 換掉 DOM 後的新 img 不要亂動
        if (hidden) {
            try { hidden.style.removeProperty('opacity'); } catch (e) { }
        }
        revealShowingIfIdle();
    }

    function armProgressivePreview(img, index) {
        if (!PREVIEW.enabled) return;
        if (!img || !img.thumbUrl || !img.url) return;
        const showing = getMainImage();
        if (!showing) return;
        const targetNorm = normalizeUrl(img.url);
        if (previewBoundShowing === showing && previewCurrentUrl === targetNorm) return;

        clearProgressivePreview();

        const container = getShowingContainerEl();
        if (!container) return;
        try {
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
        } catch (e) { }

        // index 由呼叫方指定（HFS 自己換圖時 state.currentIndex 可能還沒更新，
        // 用錯索引會取到上一張的縮圖 → 看起來像主界面沒切換）
        const thumbIdx = (index !== undefined && index >= 0) ? index : state.currentIndex;
        const thumbSrc = getReadyThumbSrc(img, thumbIdx);

        const pImg = document.createElement('img');
        pImg.className = 'ib-progressive-preview';
        pImg.decoding = 'async';
        pImg.draggable = false;
        pImg.alt = '';
        pImg.src = thumbSrc;

        if (showing.parentNode === container) {
            container.insertBefore(pImg, showing.nextSibling);
        } else {
            container.appendChild(pImg);
        }
        previewImgEl = pImg;
        previewCurrentUrl = targetNorm;
        previewBoundShowing = showing;

        try {
            showing.style.setProperty('opacity', '0', 'important');
        } catch (e) {
            showing.style.opacity = '0';
        }
        showing.classList.remove('ib-fading');
        syncShowingHiddenClass();

        const boundShowing = showing;
        const boundPreviewImg = pImg;
        const targetUrlNorm = normalizeUrl(getEffectiveImageUrl(img));
        let finalized = false;

        const isShowingReady = () => {
            if (!boundShowing) return false;
            if (!boundShowing.complete || !boundShowing.naturalWidth) return false;
            const s = boundShowing.getAttribute('src') || '';
            if (s.startsWith('data:')) return false;
            // === PATCH D：只有 src 真的是目標原圖（或其轉換 URL）時才算 ready，
            // 避免縮略圖 load 完成就誤判為原圖已就緒 ===
            return normalizeUrl(s) === targetUrlNorm;
            // === PATCH D END ===
        };

        const finalize = () => {
            if (finalized) return;
            finalized = true;
            try { boundShowing.removeEventListener('load', onLoad); } catch (e) { }
            try { boundShowing.removeEventListener('error', onLoad); } catch (e) { }
            stopPreviewTimers();

            const ready = isShowingReady();
            if (ready) {
                // 先解除預覽層的綁定，主圖才准現身（否則會被判成「預覽仍負責顯示」）
                if (previewImgEl === boundPreviewImg) previewImgEl = null;
                if (previewBoundShowing === boundShowing) {
                    previewBoundShowing = null;
                    previewLoadHandler = null;
                    previewErrorHandler = null;
                    previewCurrentUrl = '';
                }
                if (boundPreviewImg && boundPreviewImg.parentNode) {
                    boundPreviewImg.remove();
                }
                finishProgress();
                rememberLoadedFull(fullImageKey(img));
                // 真正的大圖已經顯示，拖曳預覽層可以收了
                dropDragPreview();
                revealShowingIfIdle();
            } else {
                // 還沒就緒：預覽層繼續負責顯示，主圖保持隱藏
                try {
                    boundShowing.style.setProperty('opacity', '0', 'important');
                } catch (e) { boundShowing.style.opacity = '0'; }
                syncShowingHiddenClass();
            }

            if (ready) updateFileInfoResFromShowing(boundShowing);
        };

        const onLoad = () => finalize();
        previewLoadHandler = onLoad;
        previewErrorHandler = onLoad;

        boundShowing.addEventListener('load', onLoad);
        boundShowing.addEventListener('error', onLoad);

        if (isShowingReady()) {
            requestAnimationFrame(finalize);
            return;
        }

        previewSafetyTimer = setTimeout(() => {
            previewSafetyTimer = null;
            finalize();
        }, 8000);
    }

    function fadeOutMainImage() {
        const showing = document.querySelector('.file-show img.showing');
        if (!showing) return;
        showing.classList.add('ib-fading');
    }

    function fadeInMainImage() {
        const showing = document.querySelector('.file-show img.showing');
        if (!showing) return;
        showing.classList.remove('ib-fading');
    }

    function clearHfsLoadingState(el) {
        if (!el) return;
        try {
            el.classList.remove('loading', 'is-loading', 'ib-loading');
            el.removeAttribute('data-loading');
            const parent = el.parentElement;
            if (parent) {
                parent.classList.remove('loading', 'is-loading', 'ib-loading');
                parent.removeAttribute('data-loading');
            }
            const container = el.closest('.showing-container') || el.closest('.main');
            if (container && container !== el && container !== parent) {
                container.classList.remove('loading', 'is-loading', 'ib-loading');
                container.removeAttribute('data-loading');
            }
        } catch (e) { }
    }

    function interruptMainImage() {
        if (!BUILTIN.enableInterruptOnNavigate) return;

        clearHugeOverlay();

        if (previewBoundShowing) {
            clearProgressivePreview();
        }

        const showing = document.querySelector('.file-show img.showing');
        if (showing) {
            showing.onload = null;
            showing.onerror = null;
            try { showing.removeAttribute('srcset'); } catch (e) { }
            try {
                showing.style.setProperty('opacity', '0', 'important');
            } catch (e) {
                showing.style.opacity = '0';
            }
            clearHfsLoadingState(showing);

            try {
                showing.setAttribute('loading', 'lazy');
                showing.src = BLANK_PIXEL;
            } catch (e) { }
        }
        closeGate(-1);

        const showingContainer = document.querySelector('.file-show .showing-container');
        if (showingContainer) {
            showingContainer.querySelectorAll('img').forEach(im => {
                if (im === showing) return;
                if (im.closest('.ib-strip-container')) return;
                if (im.classList.contains('ib-progressive-preview')) return;
                im.onload = null;
                im.onerror = null;
                try { im.removeAttribute('srcset'); } catch (e) { }
            });
            clearHfsLoadingState(showingContainer);
        }

        const cover = document.querySelector('.file-show .cover');
        if (cover && cover.style && cover.style.backgroundImage) {
            cover.style.backgroundImage = '';
        }
    }

    function getSettleDelayFor(img) {
        const base = BUILTIN.settleDelayMs;
        if (!img) return base;
        const size = (img.size !== null && img.size !== undefined) ? img.size : 0;
        for (const tier of SETTLE_TIERS) {
            if (size >= tier.minSize) return tier.delay;
        }
        return base;
    }

    function scheduleLoad(index, forceAuto) {
        if (state.settleTimer) {
            clearTimeout(state.settleTimer);
            state.settleTimer = null;
        }
        state.pendingLoadIndex = index;
        const img = state.images[index];

        // Countdown-load 關閉：不排程、不預載原圖。
        // 只維持縮圖（漸進預覽）當臨時主圖，點主圖區才載入高清圖。
        // forceAuto = 使用者主動要求（放大手勢/放大按鈕），不受此限。
        if (!countdownLoadEnabled() && !forceAuto) {
            if (img && !isImageAlreadyLoaded(img)) armProgressivePreview(img);
            return;
        }

        const delay = getSettleDelayFor(img);
        state.settleTimer = setTimeout(() => {
            state.settleTimer = null;
            if (state.pendingLoadIndex < 0) return;
            if (state.pendingLoadIndex !== state.currentIndex) return;
            const target = state.images[state.pendingLoadIndex];
            if (target && isHugeImage(target) &&
                !(hugeState.el && hugeState.targetIndex === state.pendingLoadIndex)) {
                startHugeCountdown(state.pendingLoadIndex, forceAuto);
                return;
            }
            doLoadMainImage(state.pendingLoadIndex);
        }, delay);
    }

    // 手動載入：點一下臨時主圖（或同一張縮圖）就把目前這張的原圖載進來。
    // 跳過倒計時與尺寸判斷（force=true）。
    function loadCurrentImageNow() {
        const idx = state.currentIndex;
        if (idx < 0 || idx >= state.images.length) return;
        const img = state.images[idx];
        if (!img) return;
        if (state.settleTimer) {
            clearTimeout(state.settleTimer);
            state.settleTimer = null;
        }
        state.pendingLoadIndex = -1;
        clearHugeOverlay();
        openGate(idx);
        doLoadMainImage(idx, true);
    }

    function forceLoadNow(index) {
        if (index < 0 || index >= state.images.length) return;
        if (state.settleTimer) {
            clearTimeout(state.settleTimer);
            state.settleTimer = null;
        }
        if (state.pendingLoadIndex !== index) return;
        openGate(index);
        doLoadMainImage(index);
    }

    function doLoadMainImage(index, force) {
        const img = state.images[index];
        if (!img) return;
        // 拖曳中一律不載入：放手後會依最終選取的那張重新排程／重新倒計時
        if (state.dragging) return;
        // 只允許載入「目前選取」的那張，避免殘留的排程把舊圖載進來
        if (index !== state.currentIndex) return;
        const showing = document.querySelector('.file-show img.showing');
        if (!showing) return;

        if (isImageAlreadyLoaded(img) && !shouldUseCanvas(img)) {
            clearHugeOverlay();
            deactivateCanvas(false);
            armProgressivePreview(img);
            return;
        }

        if (isHugeImage(img) && !force) {
            if (!(hugeState.el && hugeState.targetIndex === index)) {
                startHugeCountdown(index);
            }
            armProgressivePreview(img);
            return;
        }

        clearHugeOverlay();
        armProgressivePreview(img);

        if (shouldUseCanvas(img)) {
            const showingNow = getMainImage();
            if (showingNow) {
                try {
                    showingNow.removeAttribute('srcset');
                    showingNow.src = BLANK_PIXEL;
                } catch (e) { }
            }
            loadCanvasImage(img);
        } else {
            deactivateCanvas(false);
            loadMainImageNative(img);
        }

        requestAnimationFrame(() => {
            zoomDragBound = false;
            bindZoomDrag();
        });
    }

    function healThumbnails() {
        if (!mounted) return;
        state.thumbEls.forEach((cell, idx) => {
            const im = cell.querySelector('.ib-thumb-frame img');
            if (!im) return;
            const img = state.images[idx];
            if (!img) return;
            const current = im.getAttribute('src') || '';
            if (current === '') {
                if (im.dataset.ibHealing) return;
                im.dataset.ibHealing = '1';
                im.src = img.thumbUrl;
                setTimeout(() => { delete im.dataset.ibHealing; }, 100);
            }
        });
    }

    async function detectJumpMode() {
        if (state.jumpMode) return state.jumpMode;
        const showing = document.querySelector('.file-show img.showing');
        if (!showing) return null;
        const src = decodeURIComponent(showing.getAttribute('src') || '');
        const norm = u => u.split('?')[0].split('#')[0];
        const srcPath = norm(src);
        const locPath = norm(location.pathname);
        if (srcPath === locPath || srcPath.endsWith(locPath)) {
            state.jumpMode = 'path';
        } else {
            state.jumpMode = 'query';
        }
        return state.jumpMode;
    }

    function tryDirectJump(index) {
        if (!BUILTIN.enableDirectJump) return false;
        if (state.jumpMode !== 'path') return false;
        const img = state.images[index];
        if (!img) return false;
        try {
            const url = new URL(img.url, location.origin);
            const targetPath = url.pathname + url.search;
            const currentPath = location.pathname + location.search;
            if (targetPath === currentPath) return false;
            history.pushState({ ibJump: index }, '', targetPath);
            window.dispatchEvent(new PopStateEvent('popstate', { state: { ibJump: index } }));
            return true;
        } catch (e) {
            return false;
        }
    }

    // === PATCH C：拒絕非 HTTP 路徑，防止 data:/blob:/空字串打入 API ===
    async function fetchImageList(folderUri) {
        if (state.listFetching) return;
        if (state.listFetchedFor === folderUri) return;
        if (!folderUri ||
            !(folderUri.startsWith('/') || /^https?:\/\//i.test(folderUri))) {
            return;
        }
        state.listFetching = true;
        // === PATCH C END ===
        try {
            const apiUrl = `/~/api/get_file_list?uri=${encodeURIComponent(folderUri)}`;
            const res = await fetch(apiUrl, {
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) return;
            const data = await res.json();
            const list = data && data.list ? data.list : [];
            const baseUri = folderUri.endsWith('/') ? folderUri : folderUri + '/';
            const toTs = v => {
                if (!v) return null;
                const t = Date.parse(v);
                return isNaN(t) ? null : t;
            };
            const apiImages = list
                .filter(it => it && it.n && isImageName(it.n))
                .map(it => {
                    const url = baseUri + it.n;
                    const ext = String(it.n).split('.').pop().toLowerCase();
                    let thumbUrl;
                    if (ext === 'tif' || ext === 'tiff') {
                        thumbUrl = url + (url.includes('?') ? '&' : '?') + 'get=thumbtiff';
                    } else if (ext === 'bmp') {
                        thumbUrl = url + (url.includes('?') ? '&' : '?') + 'get=thumbbmp';
                    } else if (ext === 'psd') {
                        thumbUrl = url + (url.includes('?') ? '&' : '?') + 'get=thumbpsd';
                    } else {
                        thumbUrl = url + (url.includes('?') ? '&' : '?') + 'get=thumb';
                    }
                    return {
                        name: it.n,
                        url: url,
                        thumbUrl: thumbUrl,
                        size: (it.s !== undefined && it.s !== null) ? it.s : null,
                        ctime: toTs(it.c),
                        mtime: toTs(it.m),
                    };
                });
            const hfsList = (window.HFS && window.HFS.state && window.HFS.state.list) || [];
            let orderedImages;
            if (hfsList.length > 0) {
                const byName = new Map();
                apiImages.forEach(img => byName.set(img.name, img));
                orderedImages = [];
                hfsList.forEach(entry => {
                    const n = entry && (entry.n || entry.name);
                    if (n && byName.has(n)) {
                        orderedImages.push(byName.get(n));
                        byName.delete(n);
                    }
                });
                byName.forEach(img => orderedImages.push(img));
            } else {
                orderedImages = apiImages;
            }
            state.images = orderedImages;
            state.listFetchedFor = folderUri;
            state.hfsListCount = hfsList.length;
        } catch (e) {
        } finally {
            state.listFetching = false;
        }
    }

    // ============================================================
    // 清單過期偵測 + 重新對位
    //
    // 刪除（或新增）檔案後 HFS 會 reloadList 並直接換成下一張圖；
    // 我們的 state.images 是快取的，索引会跟 HFS 不一致（條子上還留著
    // 已刪除的縮圖）。這裡比對 HFS 清單長度，一變動就重抓並以
    // 「目前顯示的檔名」重新定位，重建條子。
    // ============================================================
    function checkListChanged() {
        if (!mounted || state.dragging) return;
        if (state.hfsListCount < 0) return;
        const list = (window.HFS && window.HFS.state && window.HFS.state.list) || [];
        if (list.length === state.hfsListCount) return;
        if (Date.now() - state.lastListRefreshAt < 1500) return;
        refreshImageList();
    }

    async function refreshImageList() {
        if (state.listFetching) return;
        const folderUri = state.listFetchedFor;
        if (!folderUri) return;
        state.lastListRefreshAt = Date.now();
        const keepName = state.lastKnownName;
        state.listFetchedFor = '';
        await fetchImageList(folderUri);
        if (!mounted || !state.stripEl) return;
        const total = state.images.length;
        if (!total) {
            // 資料夾已經沒有圖片了 → 收掉縮圖條
            unmount();
            return;
        }

        let idx = -1;
        if (keepName) idx = state.images.findIndex(i => i.name === keepName);
        if (idx < 0) idx = findCurrentIndex();
        if (idx < 0) idx = Math.max(0, Math.min(state.currentIndex, total - 1));

        state.currentIndex = idx;
        state.lastRenderIndex = -1;
        // 以目前的圖為中心重建視窗，索引位移才不會錯位
        const R = WINDOW_CFG.INITIAL_RADIUS;
        state.winStart = Math.max(0, idx - R);
        state.winEnd = Math.min(total - 1, idx + R);
        rebuildTrackDOM();
        if (state.counterEl) state.counterEl.textContent = `${idx + 1} / ${total}`;
        updateFileInfo(idx);
        centerOnIndex(idx, false);
        resyncPreviewForDomChange(idx);
    }

    function findCurrentIndex() {
        const showing = document.querySelector('.file-show img.showing');
        let cur = showing ? showing.getAttribute('src') : '';
        if (!cur || cur.startsWith('data:')) cur = window.location.pathname;
        if (cur.startsWith('blob:')) {
            if (state.lastKnownName) {
                const idx = state.images.findIndex(i => i.name === state.lastKnownName);
                if (idx >= 0) return idx;
            }
            return state.currentIndex;
        }
        const norm = u => {
            try { return decodeURIComponent(u.split('?')[0].split('#')[0]); }
            catch { return u; }
        };
        const target = norm(cur);
        const tName = target.split('/').pop();
        let idx = state.images.findIndex(i => i.name === tName);
        if (idx < 0) idx = state.images.findIndex(i => norm(i.url) === target);
        return idx;
    }

    function getNavButtons() {
        const navs = document.querySelectorAll('.file-show .nav');
        if (!navs.length) return { left: null, right: null };
        let left = null, right = null;
        navs.forEach(el => {
            const il = el.style.left, ir = el.style.right;
            if (il && il !== 'auto') left = el;
            else if (ir && ir !== 'auto') right = el;
        });
        if (!left || !right) {
            const w = window.innerWidth;
            navs.forEach(el => {
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                if (cx < w / 2 && !left) left = el;
                if (cx >= w / 2 && !right) right = el;
            });
        }
        if (!left && navs[0]) left = navs[0];
        if (!right && navs[navs.length - 1]) right = navs[navs.length - 1];
        return { left, right };
    }

    function simulateClick(el) {
        if (!el) return false;
        try { el.click(); return true; } catch (e) { }
        try {
            const r = el.getBoundingClientRect();
            const ev = new MouseEvent('click', {
                bubbles: true, cancelable: true, view: window,
                clientX: r.left + r.width / 2,
                clientY: r.top + r.height / 2,
            });
            el.dispatchEvent(ev);
            return true;
        } catch (e) { return false; }
    }

    async function detectNextButton() {
        if (state.nextButtonSide) return state.nextButtonSide;
        state.nextButtonSide = 'right';
        return 'right';
    }

    async function stepOnce(direction) {
        if (!state.nextButtonSide) await detectNextButton();
        const { left, right } = getNavButtons();
        const effectiveSide = state.nextButtonSide || 'right';
        const btn = direction > 0
            ? (effectiveSide === 'left' ? left : right)
            : (effectiveSide === 'left' ? right : left);
        if (!btn) return;
        simulateClick(btn);
    }

    async function fastStepClean(diff) {
        if (!state.nextButtonSide) await detectNextButton();
        const { left, right } = getNavButtons();
        const effectiveSide = state.nextButtonSide || 'right';
        const btn = diff > 0
            ? (effectiveSide === 'left' ? left : right)
            : (effectiveSide === 'left' ? right : left);
        if (!btn) return;
        const n = Math.abs(diff);
        for (let i = 0; i < n; i++) {
            if (BUILTIN.enableInterruptOnNavigate) interruptMainImage();
            btn.click();
            if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
            else await new Promise(r => setTimeout(r, 6));
        }
    }

    async function navigateTo(index) {
        if (index < 0 || index >= state.images.length) return;
        if (index === state.currentIndex) return;
        if (Date.now() - state.mountedAt < BUILTIN.coldStartMs) return;

        // 拖曳預覽層若還在，且這次導航不是拖曳本身要的目標，先收掉
        if (dragPreviewEl && dragPreviewIndex !== index) dropDragPreview();

        resetZoom();
        deactivateCanvas(false);

        if (BUILTIN.enableInterruptOnNavigate) {
            interruptMainImage();
        }
        clearProgressivePreview();
        abortProgress();
        clearHugeOverlay();

        fadeOutMainImage();

        const diff = index - state.currentIndex;

        let jumped = false;
        if (BUILTIN.enableDirectJump) {
            if (!state.jumpMode) await detectJumpMode();
            jumped = tryDirectJump(index);
        }
        if (!jumped) {
            if (Math.abs(diff) > 1) await fastStepClean(diff);
            else await stepOnce(diff > 0 ? 1 : -1);
        }

        updateActive(index, true);

        const targetImg = state.images[index];
        if (targetImg) {
            armProgressivePreview(targetImg);
            if (isImageAlreadyLoaded(targetImg) && !shouldUseCanvas(targetImg)) {
                if (state.settleTimer) {
                    clearTimeout(state.settleTimer);
                    state.settleTimer = null;
                }
                state.pendingLoadIndex = -1;
                return;
            }
            if (isHugeImage(targetImg)) {
                if (state.settleTimer) {
                    clearTimeout(state.settleTimer);
                    state.settleTimer = null;
                }
                state.pendingLoadIndex = -1;
                startHugeCountdown(index);
                // === PATCH 3：倒计时立起来后再挂缩略图，避免被 startHugeCountdown 抹掉 ===
                interceptShowingWithThumb(targetImg);
                // === PATCH 3 END ===
            } else {
                openGate(index);
                scheduleLoad(index);
                // === PATCH 3：小图也先顶上缩略图，避免 scheduleLoad 延时期间黑屏 ===
                interceptShowingWithThumb(targetImg);
                // === PATCH 3 END ===
            }
        }
    }

    function navigateNext() {
        const t = Math.min(state.images.length - 1, state.currentIndex + 1);
        navigateTo(t);
    }
    function navigatePrev() {
        const t = Math.max(0, state.currentIndex - 1);
        navigateTo(t);
    }

    async function fetchFileMeta(img) {
        if (!img) return null;
        const key = img.url;
        if (state.metaCache.has(key)) return state.metaCache.get(key);
        const meta = {
            size:  (img.size  !== undefined && img.size  !== null) ? img.size  : null,
            ctime: (img.ctime !== undefined && img.ctime !== null) ? img.ctime : null,
            mtime: (img.mtime !== undefined && img.mtime !== null) ? img.mtime : null,
        };
        if (meta.size === null || meta.mtime === null) {
            try {
                const res = await fetch(img.url, {
                    method: 'HEAD',
                    credentials: 'same-origin',
                    cache: 'force-cache',
                });
                if (res.ok) {
                    const len = res.headers.get('Content-Length');
                    if (len && meta.size === null) meta.size = parseInt(len, 10);
                    const lm = res.headers.get('Last-Modified');
                    if (lm && meta.mtime === null) {
                        const t = Date.parse(lm);
                        if (!isNaN(t)) meta.mtime = t;
                    }
                }
            } catch (e) { }
        }
        state.metaCache.set(key, meta);
        return meta;
    }

    // 記住某張圖的原圖尺寸；若它就是目前這張，立刻刷新資訊列
    // （Ⓡ/Ⓐ/Ⓟ 不必等使用者再點一次才出現）
    function recordResolution(img, w, h) {
        if (!img || !img.url || !w || !h) return;
        const meta = state.metaCache.get(img.url) || {};
        const prev = meta.res;
        meta.res = { w, h, ratio: formatAspectRatio(w, h), mp: (w * h) / 1e6 };
        state.metaCache.set(img.url, meta);
        const changed = !prev || prev.w !== w || prev.h !== h;
        const cur = state.images[state.currentIndex];
        if (changed && cur && cur.url === img.url && state.fileInfoEl) {
            updateFileInfo(state.currentIndex);
        }
    }

    function updateFileInfoResFromShowing(showing) {
        if (!state.fileInfoEl) return;
        if (!showing || !showing.naturalWidth || !showing.naturalHeight) return;
        const idx = state.currentIndex;
        if (idx < 0) return;
        const img = state.images[idx];
        if (!img) return;
        const src = showing.getAttribute('src') || '';
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
        // 用「實際載入的 URL」比對：tif/bmp/psd 會是 ?convert=… 的版本
        if (normalizeUrl(src) !== normalizeUrl(getEffectiveImageUrl(img))) return;
        recordResolution(img, showing.naturalWidth, showing.naturalHeight);
    }

    // ============================================================
    // 影像尺寸：先問後端（只讀檔頭），原圖還沒下載也能先顯示 Ⓡ/Ⓐ/Ⓟ
    // ============================================================
    const sizeRequests = new Map();

    function fetchImageSize(img) {
        if (!img || !img.url) return Promise.resolve(null);
        if (sizeRequests.has(img.url)) return sizeRequests.get(img.url);
        const url = img.url + (img.url.includes('?') ? '&' : '?') + 'ib_meta=1';
        const p = fetch(url, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        })
            .then(r => (r.ok ? r.json() : null))
            .then(d => {
                const w = Math.round(Number(d && d.w));
                const h = Math.round(Number(d && d.h));
                if (!w || !h) return null;
                const meta = state.metaCache.get(img.url) || {};
                const res = { w, h, ratio: formatAspectRatio(w, h), mp: (w * h) / 1e6 };
                meta.res = res;
                state.metaCache.set(img.url, meta);
                return res;
            })
            .catch(() => null)
            .finally(() => {
                sizeRequests.delete(img.url);
            });
        sizeRequests.set(img.url, p);
        return p;
    }

    function resolveResolution(img, meta) {
        return new Promise(resolve => {
            if (!img) { resolve(null); return; }
            if (meta && meta.res !== undefined) { resolve(meta.res); return; }

            const showing = getMainImage();
            if (showing && showing.complete && showing.naturalWidth > 0 &&
                normalizeUrl(showing.getAttribute('src') || '') === normalizeUrl(getEffectiveImageUrl(img))) {
                const w = showing.naturalWidth;
                const h = showing.naturalHeight;
                const res = {
                    w,
                    h,
                    ratio: formatAspectRatio(w, h),
                    mp: (w && h) ? (w * h) / 1e6 : null,
                };
                if (meta) meta.res = res;
                state.metaCache.set(img.url, meta);
                resolve(res);
                return;
            }

            // 原圖還沒載入：問後端能不能只讀檔頭就得到尺寸
            fetchImageSize(img).then(r => resolve(r || null));
        });
    }

    function updateFileInfo(index) {
        if (!state.fileInfoEl) return;
        const img = state.images[index];
        if (!img) {
            state.fileInfoEl.innerHTML = '';
            return;
        }
        const apply = (meta, res) => {
            if (!state.fileInfoEl) return;
            const sizeText = (meta && meta.size != null) ? formatBytes(meta.size) : '—';
            const cText = (meta && meta.ctime) ? formatDate(meta.ctime) : '—';
            const mText = (meta && meta.mtime) ? formatDate(meta.mtime) : '—';
            const known = !!(res && res.w && res.h);
            const resText = known ? `${res.w}×${res.h}` : '—';
            const ratioText = (known && res.ratio) ? res.ratio : '—';
            const mpText = known ? (formatMegapixels(res.mp) || '—') : '—';
            // Ⓡ/Ⓐ/Ⓟ 還沒取得 → 淡化（.ib-meta-unknown），載入完成後恢復正常色
            const resCls = 'ib-meta ib-meta-res' + (known ? '' : ' ib-meta-unknown');
            state.fileInfoEl.innerHTML =
                `<span class="ib-meta">Ⓢ\uFE0E ${sizeText}</span>` +
                `<span class="ib-meta-gap"></span>` +
                `<span class="ib-meta">Ⓒ\uFE0E ${cText}</span>` +
                `<span class="ib-meta-gap"></span>` +
                `<span class="ib-meta">Ⓜ\uFE0E ${mText}</span>` +
                `<span class="ib-meta-gap ib-meta-gap-res"></span>` +
                `<span class="${resCls}">Ⓡ\uFE0E ${resText}</span>` +
                `<span class="ib-meta-gap ib-meta-gap-res"></span>` +
                `<span class="${resCls}">Ⓐ\uFE0E ${ratioText}</span>` +
                `<span class="ib-meta-gap ib-meta-gap-res"></span>` +
                `<span class="${resCls}">Ⓟ\uFE0E ${mpText}</span>`;
            state.fileInfoEl.title =
                img.name + '\n' +
                `Size: ${sizeText}\n` +
                `Created: ${cText}\n` +
                `Modified: ${mText}\n` +
                `Resolution: ${resText}\n` +
                `Aspect: ${ratioText}\n` +
                `Megapixels: ${mpText}`;
        };
        const cached = state.metaCache.get(img.url);
        if (cached) {
            if (cached.res !== undefined) {
                apply(cached, cached.res);
            } else {
                apply(cached, null);
                resolveResolution(img, cached).then(r => {
                    if (state.images[state.currentIndex] === img) apply(cached, r);
                });
            }
        } else {
            state.fileInfoEl.innerHTML = '';
            fetchFileMeta(img).then(meta => {
                apply(meta, null);
                return resolveResolution(img, meta).then(r => {
                    if (state.images[state.currentIndex] === img) apply(meta, r);
                });
            }).catch(() => { });
        }
        // 原圖一載入完成就補上尺寸（不必再點一次滑鼠）
        watchShowingForResolution(img);
    }

    // 原圖載入完成 → 立刻補上 Ⓡ/Ⓐ/Ⓟ。
    // 同一個 <img> 可能先載入縮圖、之後才換成原圖，所以每次 load 都
    // 用「src 是否等於這張的原圖 URL」判斷，符合才記錄。
    function watchShowingForResolution(img) {
        if (!img || !state.fileInfoEl) return;
        const showing = getMainImage();
        if (!showing) return;
        const want = normalizeUrl(getEffectiveImageUrl(img));
        const check = () => {
            const s = showing.getAttribute('src') || '';
            if (!s || s.startsWith('data:') || s.startsWith('blob:')) return;
            if (!showing.complete || !showing.naturalWidth) return;
            if (normalizeUrl(s) !== want) return;
            recordResolution(img, showing.naturalWidth, showing.naturalHeight);
        };
        check();
        if (showing.__ibInfoCheck !== check) {
            if (showing.__ibInfoCheck) {
                try { showing.removeEventListener('load', showing.__ibInfoCheck); } catch (e) { }
            }
            showing.__ibInfoCheck = check;
            try { showing.addEventListener('load', check); } catch (e) { }
        }
    }

    function buildCollapseTab() {
        const tab = document.createElement('div');
        tab.className = 'ib-collapse-tab';
        tab.title = 'Collapse / expand thumbnail strip';
        tab.innerHTML = '<span class="ib-collapse-arrow">▲</span>';
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleCollapse();
        });
        return tab;
    }

    function toggleCollapse() {
        state.collapsed = !state.collapsed;
        applyCollapseState();
    }

    // ============================================================
    // 右上角「Countdown-load」開關（Auto-play 左邊）
    //   開（預設）：巨型圖倒數後自動載入原圖
    //   關：不倒計時、也不預載原圖，只留縮圖當臨時主圖，
    //       點一下主圖區（或再點同一張縮圖）才載入高清圖
    // 狀態存在 localStorage，刷新頁面後保持。
    // ============================================================
    const COUNTDOWN_BTN_ID = 'ib-countdown-btn';

    // 找出 Auto-play 按鈕「外面那層 div」，新按鈕要插在它前面。
    // 注意：HFS 的標籤會被翻譯（zh-TW 是「自動播放」），所以要同時比對中英，
    // 最後再退回「本列唯一的 <button class="small">」這個結構特徵。
    function findAutoPlayAnchor(controls) {
        const buttons = controls.querySelectorAll('button');
        for (let i = 0; i < buttons.length; i++) {
            const b = buttons[i];
            const text = (b.getAttribute('title') || '') + ' ' +
                (b.getAttribute('aria-label') || '') + ' ' +
                (b.textContent || '');
            if (/auto-?play|自動播放|自动播放|autoplay/i.test(text)) {
                return b.parentElement || b;
            }
        }
        const small = controls.querySelector('button.small');
        if (small) {
            const wrap = small.parentElement;
            return (wrap && wrap !== controls) ? wrap : small;
        }
        return null;
    }

    function syncCountdownButton() {
        const btn = document.getElementById(COUNTDOWN_BTN_ID);
        if (!btn) return;
        const on = countdownLoadEnabled();
        // 只用 HFS 原生外觀：Ⓒ 用 button.toggled（按下樣式），
        // Ⓣ 就是普通按鈕；不再加半透明／暗調。
        btn.classList.toggle('toggled', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = 'Countdown-load';
        // 圖標就是模式：Ⓒ＝倒計時加載原圖、Ⓣ＝停用倒計時（縮圖模式）
        const glyph = btn.querySelector('.ib-countdown-glyph');
        if (glyph) {
            const want = on ? '\u24B8' : '\u24C9';
            if (glyph.textContent !== want) glyph.textContent = want;
        }
    }

    function ensureCountdownButton() {
        if (!document.querySelector('.file-show')) return;
        const existing = document.getElementById(COUNTDOWN_BTN_ID);
        if (existing && existing.isConnected) {
            syncCountdownButton();
            return existing;
        }
        const bar = document.querySelector('.file-show .bar');
        if (!bar) return null;
        const controls = bar.querySelector('.controls') || bar;
        if (!controls) return null;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = COUNTDOWN_BTN_ID;
        btn.className = 'icon-button ib-countdown-btn';
        btn.title = 'Countdown-load';
        btn.setAttribute('aria-label', 'Countdown-load');
        // 圖標就是模式：Ⓒ＝倒計時加載原圖、Ⓣ＝停用倒計時（縮圖模式）。
        // 放在一層 span 裡用 flex 置中，讓它在按鈕內跟 help 的 "?" 一樣正中；
        // 直接塞 textContent 會受 line-height／baseline 影響而偏上或偏左。
        const glyph = document.createElement('span');
        glyph.className = 'ib-countdown-glyph';
        glyph.textContent = countdownLoadEnabled() ? '\u24B8' : '\u24C9';
        btn.appendChild(glyph);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setCountdownLoad(!countdownLoadEnabled());
        });

        // 插在 Auto-play 左邊：Auto-play 外面包了一層 <div>，要插到那個 div 之前
        const anchor = findAutoPlayAnchor(controls);
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(btn, anchor);
        } else {
            controls.appendChild(btn);
        }
        syncCountdownButton();
        return btn;
    }

    function setCountdownLoad(on) {
        countdownLoad = !!on;
        saveCountdownPref(countdownLoad);
        syncCountdownButton();
        if (!mounted) return;

        if (!countdownLoad) {
            // 關閉：取消進行中的倒計時／排程，回到「只顯示縮圖」
            if (state.settleTimer) {
                clearTimeout(state.settleTimer);
                state.settleTimer = null;
            }
            clearHugeOverlay();
            state.pendingLoadIndex = state.currentIndex;
            const img = state.images[state.currentIndex];
            if (img && !isImageAlreadyLoaded(img)) armProgressivePreview(img);
            syncShowingHiddenClass();
        } else {
            // 開啟：目前這張若還沒載入原圖，立刻恢復「倒計時 → 載入」。
            // 巨型圖要「馬上」彈出倒計時（不再等 settle 延遲），
            // 倒計時跑完才下載原圖；普通圖直接載入。
            const idx = state.currentIndex;
            const img = state.images[idx];
            if (img && !isImageAlreadyLoaded(img)) {
                if (isHugeImage(img)) {
                    if (!(hugeState.el && hugeState.targetIndex === idx)) {
                        armProgressivePreview(img);
                        startHugeCountdown(idx, true);
                    }
                } else {
                    loadCurrentImageNow();
                }
            }
        }
    }

    function applyCollapseState() {
        const strip = state.stripEl;
        if (!strip) return;
        strip.classList.toggle('ib-collapsed', state.collapsed);
        const arrow = strip.querySelector('.ib-collapse-arrow');
        if (arrow) arrow.textContent = state.collapsed ? '▲' : '▼';
        saveCollapseState(state.collapsed);
        if (!state.collapsed && state.currentIndex >= 0) {
            centerOnIndex(state.currentIndex, false);
        }
    }

    function buildStrip() {
        // 建立 strip 前先把尺寸快照 / CSS 變數對齊，
        // 任何一條重建路徑（mount、旋轉、目錄切換）都不會用到舊方向的尺寸
        injectCssVars();
        const strip = document.createElement('div');
        strip.className = 'ib-strip-container';
        const track = document.createElement('div');
        track.className = 'ib-strip-track';
        strip.appendChild(track);
        const selector = document.createElement('div');
        selector.className = 'ib-selector';
        strip.appendChild(selector);
        const bar = document.createElement('div');
        bar.className = 'ib-bar';
        const fileInfo = document.createElement('div');
        fileInfo.className = 'ib-file-info';
        bar.appendChild(fileInfo);
        const zoomControls = document.createElement('div');
        zoomControls.className = 'ib-zoom-controls';
        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.type = 'button';
        zoomOutBtn.className = 'ib-zoom-btn';
        zoomOutBtn.textContent = '−';
        zoomOutBtn.title = 'Zoom out (-)';
        zoomOutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zoomImage(-1);
        });
        const zoomResetBtn = document.createElement('button');
        zoomResetBtn.type = 'button';
        zoomResetBtn.className = 'ib-zoom-btn ib-zoom-reset';
        zoomResetBtn.textContent = '1.0x';
        zoomResetBtn.title = 'Reset zoom (*)';
        zoomResetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            resetZoom();
        });
        const zoomInBtn = document.createElement('button');
        zoomInBtn.type = 'button';
        zoomInBtn.className = 'ib-zoom-btn';
        zoomInBtn.textContent = '+';
        zoomInBtn.title = 'Zoom in (+)';
        zoomInBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zoomImage(1);
        });
        zoomControls.appendChild(zoomOutBtn);
        zoomControls.appendChild(zoomResetBtn);
        zoomControls.appendChild(zoomInBtn);
        const counter = document.createElement('div');
        counter.className = 'ib-counter';
        bar.appendChild(zoomControls);
        bar.appendChild(counter);
        strip.appendChild(bar);
        const tab = buildCollapseTab();
        strip.appendChild(tab);
        state.stripEl = strip;
        state.trackEl = track;
        state.selectorEl = selector;
        state.counterEl = counter;
        state.fileInfoEl = fileInfo;
        state.collapseTabEl = tab;
        state.zoomControlsEl = zoomControls;
        buildThumbsInitial();
        bindTouchEvents(strip);
        return strip;
    }

    function buildThumbsInitial() {
        const total = state.images.length;
        if (total === 0) return;
        const R = WINDOW_CFG.INITIAL_RADIUS;
        const center = state.currentIndex < 0 ? 0 : state.currentIndex;
        state.winStart = Math.max(0, center - R);
        state.winEnd = Math.min(total - 1, center + R);
        rebuildTrackDOM();
    }

    function rebuildTrackDOM() {
        const track = state.trackEl;
        if (!track) return;
        track.innerHTML = '';
        state.thumbEls.clear();
        state.activeClassIndex = -1;
        const m = requireMetrics();
        const thumbH = m.thumbH;
        const thumbW = m.thumbW;
        const itemW = m.itemW;
        const total = state.images.length;
        if (state.winStart > 0) {
            const leftPad = document.createElement('div');
            leftPad.className = 'ib-pad-left';
            leftPad.style.width = `${state.winStart * itemW}px`;
            track.appendChild(leftPad);
        }
        const frag = document.createDocumentFragment();
        for (let idx = state.winStart; idx <= state.winEnd; idx++) {
            const el = createThumbCell(state.images[idx], idx, thumbW, thumbH);
            frag.appendChild(el);
            state.thumbEls.set(idx, el);
        }
        track.appendChild(frag);
        if (state.winEnd < total - 1) {
            const rightPad = document.createElement('div');
            rightPad.className = 'ib-pad-right';
            rightPad.style.width = `${(total - 1 - state.winEnd) * itemW}px`;
            track.appendChild(rightPad);
        }
        const hi = state.dragPreviewIndex >= 0 ? state.dragPreviewIndex : state.currentIndex;
        if (hi >= 0) applyActiveClasses(hi);
    }

    function extendWindow(targetIndex) {
        const total = state.images.length;
        if (total === 0) return;
        const m = requireMetrics();
        const thumbH = m.thumbH;
        const thumbW = m.thumbW;
        const itemW = m.itemW;
        const track = state.trackEl;
        if (!track) return;
        const MARGIN = WINDOW_CFG.MARGIN;
        const STEP = WINDOW_CFG.EXTEND_STEP;
        let guard = 0;
        while (targetIndex < state.winStart && state.winStart > 0 && guard++ < 200) {
            const newStart = Math.max(0, state.winStart - STEP);
            const leftPad = track.querySelector('.ib-pad-left');
            const frag = document.createDocumentFragment();
            for (let idx = newStart; idx < state.winStart; idx++) {
                const el = createThumbCell(state.images[idx], idx, thumbW, thumbH);
                frag.appendChild(el);
                state.thumbEls.set(idx, el);
            }
            if (leftPad) {
                leftPad.after(frag);
            } else {
                const firstThumb = track.querySelector('.ib-thumb');
                if (firstThumb) track.insertBefore(frag, firstThumb);
                else track.insertBefore(frag, track.firstChild);
            }
            state.winStart = newStart;
            if (leftPad) {
                leftPad.style.width = `${state.winStart * itemW}px`;
                if (state.winStart <= 0) leftPad.remove();
            }
        }
        guard = 0;
        while (targetIndex > state.winEnd && state.winEnd < total - 1 && guard++ < 200) {
            const newEnd = Math.min(total - 1, state.winEnd + STEP);
            const rightPad = track.querySelector('.ib-pad-right');
            const frag = document.createDocumentFragment();
            for (let idx = state.winEnd + 1; idx <= newEnd; idx++) {
                const el = createThumbCell(state.images[idx], idx, thumbW, thumbH);
                frag.appendChild(el);
                state.thumbEls.set(idx, el);
            }
            if (rightPad) track.insertBefore(frag, rightPad);
            else track.appendChild(frag);
            state.winEnd = newEnd;
            if (rightPad) {
                rightPad.style.width = `${(total - 1 - state.winEnd) * itemW}px`;
                if (state.winEnd >= total - 1) rightPad.remove();
            }
        }
        if (targetIndex > state.winEnd - MARGIN && state.winEnd < total - 1) {
            const newEnd = Math.min(total - 1, state.winEnd + STEP);
            const rightPad = track.querySelector('.ib-pad-right');
            const frag = document.createDocumentFragment();
            for (let idx = state.winEnd + 1; idx <= newEnd; idx++) {
                const el = createThumbCell(state.images[idx], idx, thumbW, thumbH);
                frag.appendChild(el);
                state.thumbEls.set(idx, el);
            }
            if (rightPad) track.insertBefore(frag, rightPad);
            else track.appendChild(frag);
            state.winEnd = newEnd;
            if (rightPad) {
                rightPad.style.width = `${(total - 1 - state.winEnd) * itemW}px`;
                if (state.winEnd >= total - 1) rightPad.remove();
            }
        }
        if (targetIndex < state.winStart + MARGIN && state.winStart > 0) {
            const newStart = Math.max(0, state.winStart - STEP);
            const leftPad = track.querySelector('.ib-pad-left');
            const frag = document.createDocumentFragment();
            for (let idx = newStart; idx < state.winStart; idx++) {
                const el = createThumbCell(state.images[idx], idx, thumbW, thumbH);
                frag.appendChild(el);
                state.thumbEls.set(idx, el);
            }
            if (leftPad) {
                leftPad.after(frag);
            } else {
                const firstThumb = track.querySelector('.ib-thumb');
                if (firstThumb) track.insertBefore(frag, firstThumb);
                else track.insertBefore(frag, track.firstChild);
            }
            state.winStart = newStart;
            if (leftPad) {
                leftPad.style.width = `${state.winStart * itemW}px`;
                if (state.winStart <= 0) leftPad.remove();
            }
        }
        trimWindow(targetIndex);
    }

    function trimWindow(centerIndex) {
        const center = (centerIndex !== undefined) ? centerIndex : state.currentIndex;
        const total = state.images.length;
        const rendered = state.winEnd - state.winStart + 1;
        if (rendered <= WINDOW_CFG.MAX_RENDERED) return;
        const m = requireMetrics();
        const itemW = m.itemW;
        const track = state.trackEl;
        if (!track) return;
        const KEEP = WINDOW_CFG.KEEP_RADIUS;
        const newStart = Math.max(0, center - KEEP);
        const newEnd = Math.min(total - 1, center + KEEP);
        if (newStart > state.winStart) {
            for (let idx = state.winStart; idx < newStart; idx++) {
                const el = state.thumbEls.get(idx);
                if (el) { el.remove(); state.thumbEls.delete(idx); }
            }
            let leftPad = track.querySelector('.ib-pad-left');
            if (!leftPad) {
                leftPad = document.createElement('div');
                leftPad.className = 'ib-pad-left';
                const firstThumb = track.querySelector('.ib-thumb');
                if (firstThumb) track.insertBefore(leftPad, firstThumb);
                else track.insertBefore(leftPad, track.firstChild);
            }
            leftPad.style.width = `${newStart * itemW}px`;
            state.winStart = newStart;
        }
        if (newEnd < state.winEnd) {
            for (let idx = newEnd + 1; idx <= state.winEnd; idx++) {
                const el = state.thumbEls.get(idx);
                if (el) { el.remove(); state.thumbEls.delete(idx); }
            }
            let rightPad = track.querySelector('.ib-pad-right');
            if (!rightPad) {
                rightPad = document.createElement('div');
                rightPad.className = 'ib-pad-right';
                track.appendChild(rightPad);
            }
            rightPad.style.width = `${(total - 1 - newEnd) * itemW}px`;
            state.winEnd = newEnd;
        }
    }

    function createThumbCell(img, idx, thumbW, thumbH) {
        const cell = document.createElement('div');
        cell.className = 'ib-thumb';
        cell.dataset.index = idx;
        cell.title = img.name;
        // 增量更新狀態：新建立的格子自己帶上正確的 active / near，
        // 之後 updateActive 只要改有變動的格子即可。
        const hi = state.dragPreviewIndex >= 0 ? state.dragPreviewIndex : state.currentIndex;
        if (idx === hi) cell.classList.add('ib-active');
        else if (Math.abs(idx - hi) <= 2) cell.classList.add('ib-near');
        const frame = document.createElement('div');
        frame.className = 'ib-thumb-frame';
        const im = document.createElement('img');
        im.loading = 'lazy';
        im.decoding = 'async';
        im.draggable = false;
        im.alt = img.name;
        im.dataset.ibThumb = '1';
        im.onload = () => { im.classList.add('ib-loaded'); };
        im.onerror = () => {
            if (im.dataset.fallback) return;
            im.dataset.fallback = '1';
            const ext = String(img.name || '').split('.').pop().toLowerCase();
            if (ext === 'bmp' || ext === 'psd' || ext === 'tif' || ext === 'tiff') {
                im.src = getEffectiveImageUrl(img);
            } else {
                im.src = img.url;
            }
        };
        im.src = img.thumbUrl;
        frame.appendChild(im);
        const progress = document.createElement('div');
        progress.className = 'ib-thumb-progress';
        progress.innerHTML =
            '<div class="ib-thumb-progress-fill"></div>' +
            '<div class="ib-thumb-progress-text">0%</div>';
        frame.appendChild(progress);
        cell.appendChild(frame);
        const nameEl = document.createElement('div');
        nameEl.className = 'ib-thumb-name';
        nameEl.textContent = img.name;
        nameEl.title = img.name;
        cell.appendChild(nameEl);
        if (BUILTIN.enableClickToSelect) {
            cell.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 目前這張還沒載入原圖：
                //   一般模式 → 有排程就提前載入
                //   Countdown-load 關閉 → 點同一張縮圖就直接載入高清圖
                if (idx === state.currentIndex && state.pendingLoadIndex === idx) {
                    if (state.settleTimer) {
                        forceLoadNow(idx);
                        return;
                    }
                    if (!countdownLoadEnabled()) {
                        loadCurrentImageNow();
                        return;
                    }
                }
                navigateTo(idx);
            });
        }
        return cell;
    }

    let updatingActive = false;
    let pendingIndex = null;

    // 只更新「有變動」的格子：舊版每次都對全部（可達 300 個）格子做
    // classList.toggle，拖曳時每個切換都造成整條 strip 的樣式重算。
    function applyActiveClasses(index) {
        if (index < 0) return;
        const prev = state.activeClassIndex;
        if (prev === index) return;
        state.activeClassIndex = index;

        if (prev >= 0) {
            for (let i = prev - 2; i <= prev + 2; i++) {
                if (i === prev || i === index) continue;
                const el = state.thumbEls.get(i);
                if (el) el.classList.remove('ib-near');
            }
            const prevEl = state.thumbEls.get(prev);
            if (prevEl) prevEl.classList.remove('ib-active');
        }
        for (let i = index - 2; i <= index + 2; i++) {
            const el = state.thumbEls.get(i);
            if (!el) continue;
            if (i === index) el.classList.add('ib-active');
            else el.classList.add('ib-near');
        }
    }

    function centerOnIndex(index, animated = true) {
        if (!state.trackEl || !state.stripEl) return;
        // 拖曳中位置由手指決定，任何置中寫入都會和 touchmove 打架（回彈、不跟手）
        if (state.dragging) return;
        const m = requireMetrics();
        const containerW = state.stripEl.clientWidth;
        if (!containerW) return;
        const center = containerW / 2;

        // 優先量測「實際 DOM 位置」：即使尺寸來源有任何不同步，
        // 選中格依然會落在條子正中央。（offsetParent 就是 .ib-strip-track）
        let targetCenter = null;
        const cell = state.thumbEls.get(index);
        if (cell && cell.offsetWidth) {
            targetCenter = cell.offsetLeft + cell.offsetWidth / 2;
        }
        if (targetCenter === null) {
            targetCenter = index * m.itemW + m.thumbW / 2;
        }

        const translateX = center - targetCenter;
        state.trackX = translateX;
        if (!animated) {
            state.trackEl.style.transition = 'none';
            state.trackEl.style.transform = `translateY(-50%) translateX(${translateX}px)`;
            requestAnimationFrame(() => {
                if (state.trackEl) state.trackEl.style.transition = '';
            });
        } else {
            state.trackEl.style.transition = '';
            state.trackEl.style.transform = `translateY(-50%) translateX(${translateX}px)`;
        }
    }

    function updateActive(index, animated = true) {
        if (index < 0 || index >= state.images.length) return;
        if (updatingActive) { pendingIndex = index; return; }
        updatingActive = true;
        try {
            state.currentIndex = index;
            state.dragPreviewIndex = -1;
            extendWindow(index);
            applyActiveClasses(index);
            const prevIdx = state.lastRenderIndex;
            const bigJump = prevIdx >= 0 && Math.abs(index - prevIdx) > 15;
            if (bigJump && state.trackEl && !state.dragging) {
                state.trackEl.style.opacity = '0.7';
                setTimeout(() => {
                    if (state.trackEl) state.trackEl.style.opacity = '1';
                }, 30);
            }
            state.lastRenderIndex = index;
            centerOnIndex(index, animated);
            if (state.counterEl) {
                state.counterEl.textContent = `${index + 1} / ${state.images.length}`;
            }
            updateFileInfo(index);
        } finally {
            updatingActive = false;
            if (pendingIndex !== null && pendingIndex !== index) {
                const p = pendingIndex;
                pendingIndex = null;
                updateActive(p, animated);
            } else {
                pendingIndex = null;
            }
        }
    }

    // ============================================================
    // 縮圖條拖曳（觸控）
    //
    // 舊架構在每個 touchmove 裡做三件重活：
    //   1. 讀 strip + 最多 300 個縮圖的 getBoundingClientRect()，
    //      而且是在寫完 transform 之後讀 → 每次移動都強制同步重排；
    //   2. 每 60ms 呼叫 navigateTo()，等於 pushState + popstate +
    //      HFS 重繪 + 主圖換圖 + 檔案資訊 HEAD 請求；
    //   3. centerOnIndex() 用「置中動畫」覆寫手指剛寫入的 transform，
    //      下一次 move 又從起點重算 → 條子來回彈、跟不上手指。
    // 這三件事相乘就是 iPad 上「不跟手」的來源。
    //
    // 新架構：touchmove 只記座標，一個 rAF 寫一次 transform；
    // 命中索引純算術（零 layout 讀取）；拖曳期間只換高亮不導航，
    // 放手（touchend）才提交一次 navigateTo()。
    // ============================================================
    function readTrackTranslateX() {
        const el = state.trackEl;
        if (!el) return state.trackX || 0;
        try {
            const tr = getComputedStyle(el).transform;
            if (tr && tr !== 'none') {
                const m = tr.match(/matrix\(([^)]+)\)/);
                if (m) {
                    const parts = m[1].split(',');
                    if (parts.length >= 6) {
                        const v = parseFloat(parts[4]);
                        if (!isNaN(v)) return v;
                    }
                }
            }
        } catch (e) { }
        return state.trackX || 0;
    }

    function getDragMetrics() {
        const m = requireMetrics();
        const stripW = state.stripEl ? state.stripEl.clientWidth : window.innerWidth;
        return { thumbW: m.thumbW, itemW: m.itemW, center: stripW / 2 };
    }

    function clampTrackX(x, m) {
        const total = state.images.length;
        if (total <= 0) return x;
        const maxX = m.center - m.thumbW / 2;
        const minX = m.center - ((total - 1) * m.itemW + m.thumbW / 2);
        return Math.max(minX, Math.min(maxX, x));
    }

    function setStripDragging(on) {
        state.dragging = on;
        if (state.stripEl) state.stripEl.classList.toggle('ib-dragging', on);
        if (state.trackEl) state.trackEl.style.transition = on ? 'none' : '';
    }

    // 放手但不換圖（同索引 / 手勢取消 / 冷啟動）：回當前索引並重新置中
    function restoreAfterDrag() {
        const idx = state.currentIndex;
        state.dragPreviewIndex = -1;
        dropDragPreview();
        if (idx < 0) return;
        applyActiveClasses(idx);
        if (state.counterEl) {
            state.counterEl.textContent = `${idx + 1} / ${state.images.length}`;
        }
        centerOnIndex(idx, true);
    }

    // ============================================================
    // 拖曳期間暫停「延遲載入 / 巨型圖倒計時」
    //
    // 舊行為：開始拖曳前那次點選若已起動巨型圖倒計時，倒計時會在拖曳途中
    // 繼續跑，時間到就用「拖曳前的索引」去下載那張舊圖（還在拖就下載）。
    // 新行為：一判定為拖曳就暫停，放手時才依最終選取的圖重新起算倒計時。
    // ============================================================
    function suspendLoadsForDrag() {
        const suspended = { index: -1, huge: false };
        if (hugeState.el && hugeState.targetIndex >= 0) {
            suspended.index = hugeState.targetIndex;
            suspended.huge = true;
        } else if (state.settleTimer && state.pendingLoadIndex >= 0) {
            suspended.index = state.pendingLoadIndex;
        }
        if (state.settleTimer) {
            clearTimeout(state.settleTimer);
            state.settleTimer = null;
        }
        state.pendingLoadIndex = -1;
        if (hugeState.el || hugeState.timer) clearHugeOverlay();
        abortProgress();
        return suspended;
    }

    function rearmSuspendedLoad(suspended) {
        if (!suspended || suspended.index < 0) return;
        if (suspended.index !== state.currentIndex) return;
        const img = state.images[suspended.index];
        if (!img) return;
        if (isHugeImage(img)) {
            if (!(hugeState.el && hugeState.targetIndex === suspended.index)) {
                startHugeCountdown(suspended.index);
            }
            return;
        }
        openGate(suspended.index);
        scheduleLoad(suspended.index);
    }

    function onWheel(e) {
        if (state.collapsed) return;
        if (zoomState.scale > 1) return;
        const now = Date.now();
        if (now - state.lastWheelTime < BUILTIN.wheelDebounceMs) return;
        let dir = 0;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) dir = e.deltaX > 0 ? 1 : -1;
        else dir = e.deltaY > 0 ? 1 : -1;
        const magnitude = Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY));
        let step = 1 + Math.floor(Math.max(0, magnitude - 50) / 100);
        step = Math.min(step, BUILTIN.maxWheelStep);
        const target = state.currentIndex + dir * step;
        const clamped = Math.max(0, Math.min(state.images.length - 1, target));
        if (clamped === state.currentIndex) return;
        e.preventDefault();
        e.stopPropagation();
        state.lastWheelTime = now;
        navigateTo(clamped);
    }

    function onKeyDown(e) {
        if (!BUILTIN.enableKeyboardNav) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' ||
            (document.activeElement && document.activeElement.isContentEditable)) return;
        if (!document.querySelector('.file-show')) return;

        if (e.key === '+' || e.key === '=') {
            e.preventDefault(); e.stopPropagation(); zoomImage(1); return;
        }
        if (e.key === '-' || e.key === '_') {
            e.preventDefault(); e.stopPropagation(); zoomImage(-1); return;
        }
        if (e.key === '*') {
            e.preventDefault(); e.stopPropagation(); resetZoom(); return;
        }

        const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
                        e.key === 'ArrowUp' || e.key === 'ArrowDown';

        if (isArrow) {
            if (zoomState.scale > 1) {
                e.preventDefault();
                e.stopPropagation();
                const step = ZOOM_CFG.PAN_STEP;
                if (e.key === 'ArrowLeft') panZoomBy(step, 0);
                else if (e.key === 'ArrowRight') panZoomBy(-step, 0);
                else if (e.key === 'ArrowUp') panZoomBy(0, step);
                else if (e.key === 'ArrowDown') panZoomBy(0, -step);
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault(); e.stopPropagation(); navigatePrev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation(); navigateNext();
            }
        }
    }

    function bindTouchEvents(strip) {
        let armed = false;
        let dragging = false;
        let startX = 0, startY = 0;
        let baseTrackX = 0;        // 按下瞬間的 track 位移（視覺位置）
        let baseCenterIndex = 0;   // 按下瞬間「條子中心」對應的（小數）索引
        let latestDx = 0;
        let metrics = null;
        let frame = 0;
        let previewIndex = -1;
        let lastSwitchAt = 0;
        let suspendedLoad = null;  // 拖曳前被暫停的延遲載入／倒計時

        function clearFrame() {
            if (frame) { cancelAnimationFrame(frame); frame = 0; }
        }

        function indexAtDx(dx) {
            if (!metrics) return state.currentIndex;
            const raw = Math.round(baseCenterIndex - dx / metrics.itemW);
            return Math.max(0, Math.min(state.images.length - 1, raw));
        }

        function applyDragFrame() {
            frame = 0;
            if (!dragging || !state.trackEl || !metrics) return;
            const x = clampTrackX(baseTrackX + latestDx, metrics);
            state.trackX = x;
            state.trackEl.style.transform = `translateY(-50%) translateX(${x}px)`;

            const idx = indexAtDx(latestDx);
            const now = Date.now();
            // 拖曳期間：換高亮 + 換主圖區預覽 + 補格子 + 更新計數，但不導航
            if (idx !== previewIndex && now - lastSwitchAt >= DRAG_CFG.switchIntervalMs) {
                previewIndex = idx;
                lastSwitchAt = now;
                state.dragPreviewIndex = idx;
                applyActiveClasses(idx);
                extendWindow(idx);
                showDragPreview(idx);
                if (state.counterEl) {
                    state.counterEl.textContent = `${idx + 1} / ${state.images.length}`;
                }
            }
        }

        // 保險索：strip 若在拖曳中被 HFS 換掉，touchend 不會回到 strip 上，
        // 全域（冒泡階段）補一次收尾，避免 state.dragging 卡住。
        function onGlobalTouchEnd() {
            releaseGuard();
            if (state.dragging) cancelDrag();
        }

        function releaseGuard() {
            window.removeEventListener('touchend', onGlobalTouchEnd, true);
            window.removeEventListener('touchcancel', onGlobalTouchEnd, true);
            window.removeEventListener('touchend', onGlobalTouchEnd);
            window.removeEventListener('touchcancel', onGlobalTouchEnd);
        }

        function cancelDrag() {
            clearFrame();
            releaseGuard();
            const wasDragging = dragging;
            dragging = false;
            armed = false;
            metrics = null;
            setStripDragging(false);
            if (wasDragging) {
                restoreAfterDrag();
                rearmSuspendedLoad(suspendedLoad);
            }
            suspendedLoad = null;
            flushDeferredViewportChange();
        }

        function onTouchStart(e) {
            if (state.collapsed) return;
            if (e.touches.length !== 1) return;
            if (Date.now() - state.mountedAt < BUILTIN.coldStartMs) return;
            const t = e.touches[0];
            armed = true;
            dragging = false;
            suspendedLoad = null;
            startX = t.clientX;
            startY = t.clientY;
            latestDx = 0;
            previewIndex = -1;
            lastSwitchAt = 0;
            metrics = getDragMetrics();
            baseTrackX = readTrackTranslateX();
            baseCenterIndex = (metrics.center - baseTrackX - metrics.thumbW / 2) / metrics.itemW;
            state.dragPreviewIndex = -1;
            state.trackX = baseTrackX;
            if (state.trackEl) {
                // 凍結在目前「視覺」位置：置中動畫途中抓住也不會跳一下
                state.trackEl.style.transition = 'none';
                state.trackEl.style.transform = `translateY(-50%) translateX(${baseTrackX}px)`;
            }
        }

        function onTouchMove(e) {
            if (!armed) return;
            if (!dragging) {
                if (e.touches.length !== 1) {
                    armed = false;
                    if (state.trackEl) state.trackEl.style.transition = '';
                    return;
                }
                const t0 = e.touches[0];
                const dx0 = t0.clientX - startX;
                const dy0 = t0.clientY - startY;
                if (Math.abs(dx0) > Math.abs(dy0) && Math.abs(dx0) > DRAG_CFG.slopPx) {
                    dragging = true;
                    // 先暫停上一張的延遲載入／巨型圖倒計時，
                    // 拖曳期間絕不載入，放手後再依最終選取重新起算。
                    suspendedLoad = suspendLoadsForDrag();
                    setStripDragging(true);
                    // 冒泡階段的全域收尾（strip 上的 handler 先跑，正常情況會先移除它）
                    window.addEventListener('touchend', onGlobalTouchEnd);
                    window.addEventListener('touchcancel', onGlobalTouchEnd);
                } else if (Math.abs(dy0) > 10) {
                    // 垂直手勢：放棄拖曳，交還瀏覽器
                    armed = false;
                    if (state.trackEl) state.trackEl.style.transition = '';
                    return;
                } else {
                    return;
                }
            }
            if (e.touches.length !== 1) { cancelDrag(); return; }
            latestDx = e.touches[0].clientX - startX;
            // 必須在事件處理器內同步 preventDefault（不能等 rAF），
            // 否則 iOS 仍會補一個 click，拖完又跳一次圖。
            if (e.cancelable) e.preventDefault();
            if (!frame) frame = requestAnimationFrame(applyDragFrame);
        }

        function onTouchEnd() {
            if (!armed) return;
            armed = false;
            clearFrame();
            releaseGuard();
            if (!dragging) {
                // 只是點一下：回到當前索引並把過場還原，之後交給縮圖的 click 處理
                metrics = null;
                restoreAfterDrag();
                suspendedLoad = null;
                flushDeferredViewportChange(80);
                return;
            }
            dragging = false;
            const target = indexAtDx(latestDx);
            metrics = null;
            setStripDragging(false);
            state.dragPreviewIndex = -1;
            if (target >= 0 && target !== state.currentIndex &&
                Date.now() - state.mountedAt >= BUILTIN.coldStartMs) {
                // 讓放手瞬間的預覽就是最終目標（最後一次節流可能還沒切到）
                if (target !== dragPreviewIndex) showDragPreview(target);
                // 整個拖曳只提交一次真正的導航（倒計時／載入由 navigateTo 重新起算）
                const pendingSuspended = suspendedLoad;
                suspendedLoad = null;
                navigateTo(target);
                // 保險：若導航最終沒完成，別讓預覽層一直蓋著主圖，也把原本那張的載入還原
                const guardEl = dragPreviewEl;
                setTimeout(() => {
                    if (dragPreviewEl && dragPreviewEl === guardEl) dropDragPreview();
                    if (state.currentIndex !== target) rearmSuspendedLoad(pendingSuspended);
                }, 5000);
            } else {
                restoreAfterDrag();
                rearmSuspendedLoad(suspendedLoad);
                suspendedLoad = null;
            }
            flushDeferredViewportChange();
        }
        strip.addEventListener('touchstart', onTouchStart, { passive: true });
        strip.addEventListener('touchmove', onTouchMove, { passive: false });
        strip.addEventListener('touchend', onTouchEnd, { passive: true });
        strip.addEventListener('touchcancel', cancelDrag, { passive: true });
    }

    function bindShowingContainerClick() {
        const container = document.querySelector('.file-show .showing-container');
        if (!container) return;
        if (state.showingContainerEl === container) return;
        if (state.showingContainerEl) {
            try {
                state.showingContainerEl.removeEventListener('click', onShowingContainerClick);
            } catch (e) { }
        }
        state.showingContainerEl = container;
        container.addEventListener('click', onShowingContainerClick);
    }

    function onShowingContainerClick(e) {
        if (e.target && e.target.closest &&
            e.target.closest('.ib-strip-container, .ib-zoom-controls, .nav, button, a')) {
            return;
        }

        if (hugeState.el && hugeState.targetIndex >= 0) {
            forceHugeLoad(hugeState.targetIndex);
            return;
        }

        // Countdown-load 關閉（手動模式）：點臨時預覽圖就載入高清圖
        if (!countdownLoadEnabled()) {
            loadCurrentImageNow();
            return;
        }

        if (!state.settleTimer) return;
        if (state.pendingLoadIndex < 0) return;
        forceLoadNow(state.pendingLoadIndex);
    }

    let mounted = false;
    let mountInProgress = false;

    // === PATCH 4：首屏拦截辅助函数 ===
    // 把 img.showing 的 src 换成缩略图（或 BLANK_PIXEL），并关闸，
    // 等待 mount 流程里的 startHugeCountdown / scheduleLoad 接管。
    function interceptShowingWithThumb(img) {
        if (!img) return;
        const showing = getMainImage();
        if (!showing) return;
        const cur = showing.getAttribute('src') || '';
        if (cur && !cur.startsWith('data:') && !cur.startsWith('blob:')) {
            hugeState.parkedSrc = cur;
        }
        try { showing.removeAttribute('srcset'); } catch (e) { }
        showing.setAttribute('loading', 'lazy');
        try { showing.style.setProperty('opacity', '0', 'important'); } catch (e) { }
        const thumb = getReadyThumbSrc(img, state.currentIndex);
        if (thumb) {
            showing.src = thumb;
            // 有預覽層在負責顯示時不要還原 opacity：主圖會蓋在預覽層上，
            // 而它的新 src 解碼完成前，瀏覽器仍會畫著「上一張大圖」，
            // 長寬比不同時就會看到殘影叠加。
            revealShowingIfIdle();
        } else {
            showing.src = BLANK_PIXEL;
            syncShowingHiddenClass();
        }
        // === PATCH FIX GATE：閘門狀態由呼叫方控制（startHugeCountdown / openGate /
        // interceptNativeFirstShowing），此處不再 closeGate(-1)，
        // 否則小圖路徑 scheduleLoad 到點後 loadMainImageNative 會被 gateClosed 擋掉，
        // 導致原圖永遠不載入。 ===
    }

    // 在插件 mount 之前，把 HFS 已挂上的原图 src 换掉，
    // 避免 25MB 大图把界面卡在黑色加载态。
    function interceptNativeFirstShowing() {
        if (bootInterceptDone) return;
        const showing = document.querySelector('.file-show img.showing');
        if (!showing) return;
        const src = showing.getAttribute('src') || '';
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;

        // === PATCH B：記錄攔截前的原始 src ===
        if (!preInterceptSrc) preInterceptSrc = src;
        // === PATCH B END ===

        let replaced = false;
        if (state.images.length > 0) {
            const name = decodeURIComponent(src.split('/').pop().split('?')[0]);
            const hit = state.images.find(i => i.name === name);
            if (hit && hit.thumbUrl) {
                try { showing.removeAttribute('srcset'); } catch (e) { }
                showing.setAttribute('loading', 'lazy');
                try { showing.style.setProperty('opacity', '0', 'important'); } catch (e) { }
                showing.src = hit.thumbUrl;
                replaced = true;
            }
        }
        if (!replaced) {
            try { showing.removeAttribute('srcset'); } catch (e) { }
            showing.setAttribute('loading', 'lazy');
            try { showing.style.setProperty('opacity', '0', 'important'); } catch (e) { }
            showing.src = BLANK_PIXEL;
        }
        closeGate(-1);
        bootInterceptDone = true;
    }
    // === PATCH 4 END ===

    async function mount() {
        if (mountInProgress) return;
        // 拖曳中不要重建 / 卸載縮圖條（會把正在拖的節點換掉）；
        // 放手時 class 變動會再觸發 observer → schedule → mount
        if (state.dragging) return;
        // 工具列可能在 HFS 重繪後才出現 / 被換掉，先把按鈕補上
        ensureCountdownButton();
        const viewer = document.querySelector('.file-show');
        if (!viewer) return;
        const showing = viewer.querySelector('img.showing');
        if (!showing) return;

        // === PATCH A：不依賴 showing.src（可能已被攔截換成 data:/縮略圖） ===
        const src = showing.getAttribute('src') || '';
        const rawSrc = preInterceptSrc || src;
        const isObjectUrl = rawSrc.startsWith('blob:');
        const isBlankPixel = rawSrc.startsWith('data:');

        function nameFromLocation() {
            try {
                const p = decodeURIComponent(location.pathname || '');
                return p.split('/').pop().split('?')[0] || '';
            } catch (e) {
                return '';
            }
        }

        let currentName = '';
        if (!isObjectUrl && !isBlankPixel) {
            const baseName = decodeURIComponent(rawSrc.split('?')[0].split('/').pop() || '');
            if (isImageName(baseName)) currentName = baseName;
        }
        if (!currentName) currentName = state.lastKnownName || nameFromLocation();
        if (!currentName && !isBlankPixel && !isObjectUrl) return;

        const stripInThisViewer = viewer.querySelector('.ib-strip-container');
        if (mounted && state.stripEl && stripInThisViewer === state.stripEl) {
            healThumbnails();
            const idx = findCurrentIndex();
            // HFS 自己換圖（刪除跳下一張）時，舊預覽層要交棒，否則主圖一直被藏住
            if (idx >= 0) resyncPreviewForDomChange(idx);
            if (idx >= 0 && idx !== state.currentIndex) updateActive(idx, true);
            else centerOnIndex(state.currentIndex, true);
            bindZoomDrag();
            bindShowingContainerClick();
            return;
        }
        mountInProgress = true;
        try {
            if (mounted) unmount();

            // folderUri：優先 lastKnownName 所屬目錄 → location.pathname → rawSrc
            let folderUri = '';
            if (state.lastKnownName && state.images.length > 0) {
                const firstUrl = state.images[0].url;
                const lastSlash = firstUrl.lastIndexOf('/');
                folderUri = lastSlash >= 0 ? firstUrl.substring(0, lastSlash + 1) : '';
            }
            if (!folderUri) {
                try {
                    const p = decodeURIComponent(location.pathname || '');
                    const lastSlash = p.lastIndexOf('/');
                    folderUri = lastSlash >= 0 ? p.substring(0, lastSlash + 1) : '';
                } catch (e) { folderUri = ''; }
            }
            if (!folderUri && !isObjectUrl && !isBlankPixel) {
                const lastSlash = rawSrc.lastIndexOf('/');
                if (lastSlash >= 0) folderUri = rawSrc.substring(0, lastSlash + 1);
            }

            await fetchImageList(folderUri);
            if (state.images.length === 0) return;

            let idx = state.images.findIndex(i => i.name === currentName);
            if (idx < 0) idx = 0;
            state.currentIndex = idx;
            state.lastKnownName = currentName;
            // === PATCH A END ===

            const contain = viewer.querySelector('.contain') || viewer.firstElementChild;
            if (!contain) return;
            contain.style.display = 'flex';
            contain.style.setProperty('flex-direction', 'column', 'important');
            contain.style.height = '100%';
            contain.style.overflow = 'hidden';
            const main = contain.querySelector('.main');
            if (main) {
                main.style.flex = '1 1 auto';
                main.style.minHeight = '0';
                main.style.overflow = 'hidden';
                main.style.position = 'relative';
                main.style.paddingBottom = '0';
            }
            state.collapsed = loadCollapseState();
            const strip = buildStrip();
            contain.appendChild(strip);
            mounted = true;
            state.mountedAt = Date.now();
            markViewportHandled();
            applyCollapseState();
            updateActive(idx, false);
            bindZoomDrag();
            bindShowingContainerClick();
            if (main && BUILTIN.enableWheelSwitch) {
                main.removeEventListener('wheel', onWheel);
                main.addEventListener('wheel', onWheel, { passive: false });
                state.mainEl = main;
            }
            if (BUILTIN.enableKeyboardNav) {
                document.addEventListener('keydown', onKeyDown, { capture: true });
            }
            window.addEventListener('resize', onResize);
            window.addEventListener('orientationchange', onOrientationChange);
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', onResize);
            }
            setTimeout(() => { detectJumpMode(); }, 500);
            if (state.images[idx]) {
                const firstImg = state.images[idx];

                // === PATCH 5：首屏防卡黑，统一先顶上缩略图再决定何时放原图 ===
                if (isImageAlreadyLoaded(firstImg) && !shouldUseCanvas(firstImg)) {
                    armProgressivePreview(firstImg);
                } else if (isHugeImage(firstImg)) {
                    armProgressivePreview(firstImg);
                    startHugeCountdown(idx);
                    // 倒计时立起来后再挂缩略图，避免被 startHugeCountdown 抹掉
                    interceptShowingWithThumb(firstImg);
                } else {
                    openGate(idx);
                    scheduleLoad(idx);
                    // 小图也先顶上缩略图，避免 scheduleLoad 延时期间黑屏
                    interceptShowingWithThumb(firstImg);
                }
                // === PATCH 5 END ===
            }
        } finally {
            mountInProgress = false;
        }
    }

    function unbindWheel() {
        if (state.mainEl) {
            state.mainEl.removeEventListener('wheel', onWheel);
            state.mainEl = null;
        }
    }

    function unbindWheelAll() {
        document.querySelectorAll('.file-show .main').forEach(el => {
            el.removeEventListener('wheel', onWheel);
        });
        unbindWheel();
    }

    function unbindWheelFromMain() {
        unbindWheelAll();
    }

    function cleanupMainImageInlineStyles() {
        const showing = document.querySelector('.file-show img.showing');
        if (showing) {
            showing.style.transform = '';
            showing.style.transformOrigin = '';
            showing.style.visibility = '';
            try {
                showing.style.removeProperty('opacity');
            } catch (e) {
                showing.style.opacity = '';
            }
            showing.style.cursor = '';
            showing.style.willChange = '';
            showing.style.userSelect = '';
            showing.style.touchAction = '';
            showing.classList.remove('ib-fading');
        }
        // 卸載時把「主圖隱藏」的 class 一起清掉，否則整個 file-show 會是全黑
        const fileShow = document.querySelector('.file-show');
        if (fileShow) {
            fileShow.classList.remove('ib-showing-hidden');
            fileShow.classList.remove('ib-drag-owned');
        }
        removeCanvasLayer();
        const container = document.querySelector('.file-show .showing-container');
        if (container) {
            container.style.touchAction = '';
            container.querySelectorAll('.ib-progressive-preview').forEach(el => el.remove());
            container.querySelectorAll('.ib-drag-preview').forEach(el => el.remove());
            container.querySelectorAll('.ib-huge-overlay').forEach(el => el.remove());
            container.querySelectorAll('.ib-canvas-layer').forEach(el => el.remove());
            if (state.showingContainerEl === container) {
                try {
                    container.removeEventListener('click', onShowingContainerClick);
                } catch (e) { }
                state.showingContainerEl = null;
            }
        }
        document.querySelectorAll('.file-show .ib-progressive-preview').forEach(el => el.remove());
        document.querySelectorAll('.file-show .ib-huge-overlay').forEach(el => el.remove());
        document.querySelectorAll('.file-show .ib-canvas-layer').forEach(el => el.remove());
    }

    function unmount() {
        clearProgressivePreview();
        abortProgress();
        clearHugeOverlay();
        closeGate(-1);
        hugeState.parkedSrc = '';
        resetZoom();
        removeCanvasLayer();
        unbindZoomDrag();
        state.dragging = false;
        dropDragPreview();
        window.removeEventListener('pointermove', onZoomPointerMove);
        window.removeEventListener('pointerup', onZoomPointerUp);
        zoomState.scale = 1;
        zoomState.translateX = 0;
        zoomState.translateY = 0;
        zoomState.dragging = false;
        zoomState.lastTouchDist = 0;
        unbindWheelFromMain();
        cleanupMainImageInlineStyles();
        document.querySelectorAll('.ib-strip-container').forEach(el => el.remove());
        // 離開圖片檢視時把工具列的 Ⓒ 按鈕也收掉（換成影片／音檔就不該出現）
        const countdownBtn = document.getElementById(COUNTDOWN_BTN_ID);
        if (countdownBtn) countdownBtn.remove();
        if (state.settleTimer) {
            clearTimeout(state.settleTimer);
            state.settleTimer = null;
        }
        state.pendingLoadIndex = -1;
        state.stripEl = null;
        state.trackEl = null;
        state.counterEl = null;
        state.fileInfoEl = null;
        state.collapseTabEl = null;
        state.selectorEl = null;
        state.zoomControlsEl = null;
        state.thumbEls.clear();
        state.winStart = 0;
        state.winEnd = 0;
        state.jumpMode = null;
        state.nextButtonSide = 'right';
        state.lastRenderIndex = -1;
        state.lastSizeKey = '';
        state.lastAspectKey = '';
        state.images = [];
        state.currentIndex = -1;
        state.listFetchedFor = '';
        state.lastKnownName = '';
        state.mountedAt = 0;
        state.metaCache.clear();
        state.dragging = false;
        state.dragPreviewIndex = -1;
        state.activeClassIndex = -1;
        state.trackX = 0;
        mounted = false;
        // === PATCH 6：SPA 切换目录时允许重新拦截 ===
        bootInterceptDone = false;
        preInterceptSrc = '';   // === PATCH B：重置攔截前 src ===
        // === PATCH 6 END ===
        if (state.resizeReloadTimer) {
            clearTimeout(state.resizeReloadTimer);
            state.resizeReloadTimer = null;
        }
        if (state.orientationTimer) {
            clearTimeout(state.orientationTimer);
            state.orientationTimer = null;
        }
        if (deferredFlushTimer) {
            clearTimeout(deferredFlushTimer);
            deferredFlushTimer = null;
        }
        state.resizeDeferred = false;
        document.removeEventListener('keydown', onKeyDown, { capture: true });
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onOrientationChange);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', onResize);
        }
    }

    function softReloadBrowser() {
        if (!mounted || !state.stripEl) return;
        const viewer = document.querySelector('.file-show');
        if (!viewer) return;
        state.dragging = false;
        state.dragPreviewIndex = -1;
        dropDragPreview();
        clearProgressivePreview();
        abortProgress();
        // 巨型圖的 canvas 圖層屬於 .showing-container，
        // 這裡只是重建縮圖條，不該把它拆掉（否則旋轉後大圖會變黑）。
        if (canvasState.active) {
            sizeCanvasToContainer();
            scheduleCanvasRender();
        } else {
            removeCanvasLayer();
        }
        const keepIndex = state.currentIndex;
        const keepCollapsed = state.collapsed;
        const keepImages = state.images;
        const keepFetchedFor = state.listFetchedFor;
        const keepName = state.lastKnownName;
        document.querySelectorAll('.ib-strip-container').forEach(el => el.remove());
        state.stripEl = null;
        state.trackEl = null;
        state.counterEl = null;
        state.fileInfoEl = null;
        state.collapseTabEl = null;
        state.selectorEl = null;
        state.zoomControlsEl = null;
        state.thumbEls.clear();
        state.winStart = 0;
        state.winEnd = 0;
        state.lastRenderIndex = -1;
        injectCssVars();
        state.images = keepImages;
        state.currentIndex = keepIndex;
        state.collapsed = keepCollapsed;
        state.listFetchedFor = keepFetchedFor;
        state.lastKnownName = keepName;
        const contain = viewer.querySelector('.contain') || viewer.firstElementChild;
        if (!contain) return;
        contain.style.display = 'flex';
        contain.style.setProperty('flex-direction', 'column', 'important');
        contain.style.height = '100%';
        contain.style.overflow = 'hidden';
        const main = contain.querySelector('.main');
        if (main) {
            main.style.flex = '1 1 auto';
            main.style.minHeight = '0';
            main.style.overflow = 'hidden';
            main.style.position = 'relative';
            main.style.paddingBottom = '0';
        }
        const strip = buildStrip();
        contain.appendChild(strip);
        markViewportHandled();
        applyCollapseState();
        updateActive(keepIndex, false);
        // buildStrip 之後版面才真正套用新尺寸：下一幀再依實測位置校一次，
        // 這樣旋轉後選中格一定回到正中央（不受 subpixel / 版面時序影響）
        const settleIndex = keepIndex;
        requestAnimationFrame(() => {
            if (!mounted || state.dragging) return;
            if (state.currentIndex !== settleIndex) return;
            centerOnIndex(settleIndex, false);
        });
        zoomDragBound = false;
        bindZoomDrag();
        bindShowingContainerClick();
        unbindWheelAll();
        if (main && BUILTIN.enableWheelSwitch) {
            main.addEventListener('wheel', onWheel, { passive: false });
            state.mainEl = main;
        }
        const curImg = state.images[keepIndex];
        // 巨型圖用 canvas 顯示時不要疊上縮圖預覽（會蓋住 canvas 且卡在那裡）
        if (curImg && !canvasState.active) {
            armProgressivePreview(curImg);
        }
    }

    // 目前方向的識別：只看「橫/直」與縮圖尺寸，工具列伸縮（innerHeight 小變動）
    // 不該觸發整條 strip 重建，只要重新置中即可。
    function getOrientationKey() {
        const w = window.innerWidth || 0;
        const h = window.innerHeight || 0;
        if (!w || !h) return '';
        return w >= h ? 'L' : 'P';
    }

    function markViewportHandled() {
        state.lastSizeKey = requireMetrics().key;
        state.lastAspectKey = getOrientationKey();
    }

    function onResize() {
        if (!mounted) {
            // 尚未 mount：只把 CSS 變數對齊目前的視窗，之後 buildStrip 會再算一次
            injectCssVars();
            return;
        }
        if (state.resizeReloadTimer || state.orientationTimer) return;
        const m = getEffectiveThumbSize();
        const sizeKey = `${m.h}x${m.gap}`;
        const orientationKey = getOrientationKey();
        const changed =
            state.lastSizeKey !== sizeKey ||
            state.lastAspectKey !== orientationKey;

        if (!changed) {
            // 尺寸沒變（例如手機工具列伸縮）：DOM 與計算仍一致，只需依實測重新置中。
            if (canvasState.active) {
                sizeCanvasToContainer();
                scheduleCanvasRender();
            }
            if (state.currentIndex >= 0 && !state.dragging) {
                centerOnIndex(state.currentIndex, false);
                const idx = state.currentIndex;
                requestAnimationFrame(() => {
                    if (mounted && !state.dragging && state.currentIndex === idx) {
                        centerOnIndex(idx, false);
                    }
                });
            }
            return;
        }

        // 尺寸真的變了：整條 strip 必須重建（重新注入變數、重算 pad、重新置中），
        // 只改 CSS 變數會讓 pad 的 px 值與實際格寬不一致 → 選中格偏掉。
        if (state.dragging) {
            // 拖曳中不能拆 strip，等放手後再處理
            state.resizeDeferred = true;
            return;
        }
        if (canvasState.active) {
            sizeCanvasToContainer();
            scheduleCanvasRender();
        }
        if (state.resizeReloadTimer) clearTimeout(state.resizeReloadTimer);
        state.resizeReloadTimer = setTimeout(() => {
            state.resizeReloadTimer = null;
            if (!mounted) return;
            softReloadBrowser();
        }, 120);
    }

    // 旋轉螢幕：iOS 的 innerWidth/innerHeight 會晚一拍才更新，
    // 所以先放掉縮放／預覽狀態，等尺寸穩定後用「新方向」整個重建一次。
    function onOrientationChange() {
        if (!mounted) {
            injectCssVars();
            return;
        }
        if (state.dragging) {
            state.resizeDeferred = true;
            return;
        }
        resetZoom();
        dropDragPreview();
        clearProgressivePreview();
        if (state.resizeReloadTimer) {
            clearTimeout(state.resizeReloadTimer);
            state.resizeReloadTimer = null;
        }
        if (state.orientationTimer) clearTimeout(state.orientationTimer);
        state.orientationTimer = setTimeout(() => {
            state.orientationTimer = null;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!mounted) return;
                    softReloadBrowser();
                });
            });
        }, 80);
    }

    // 若因為「拖曳中」而延後的重建，拖完立刻補做。
    // 點擊（tap）時給一點延遲：重建會換掉縮圖節點，
    // 太早重建會讓 iOS 剛補發的 click 落空（點縮圖沒反應）。
    let deferredFlushTimer = null;

    function flushDeferredViewportChange(delay) {
        if (!state.resizeDeferred) return;
        if (deferredFlushTimer) clearTimeout(deferredFlushTimer);
        deferredFlushTimer = setTimeout(() => {
            deferredFlushTimer = null;
            if (!state.resizeDeferred) return;
            state.resizeDeferred = false;
            onResize();
        }, delay === undefined ? 0 : delay);
    }

    let scheduled = false;
    let pendingUnmount = null;
    let pendingMount = null;

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            try {
                const viewer = document.querySelector('.file-show');
                const showing = viewer ? viewer.querySelector('img.showing') : null;
                const src = showing ? (showing.getAttribute('src') || '') : '';
                const isObjectUrl = src.startsWith('blob:');
                const isBlankPixel = src.startsWith('data:');
                const isImg = !!showing && (isObjectUrl || isBlankPixel ||
                    isImageName(src.split('?')[0].split('/').pop()));
                if (isImg) {
                    if (pendingUnmount) {
                        clearTimeout(pendingUnmount);
                        pendingUnmount = null;
                    }
                    if (mounted) healThumbnails();
                    // 右上角 Countdown-load 按鈕：HFS 重繪工具列後會消失，這裡補回
                    ensureCountdownButton();
                    // 自我修復：HFS 若重建了 file-show（class 會掉），
                    // 或換了新的 <img>，這裡把「預覽層負責顯示 → 主圖要藏」的狀態補回去
                    syncShowingHiddenClass();
                    if (!isObjectUrl && !isBlankPixel) {
                        const newName = decodeURIComponent(src.split('/').pop().split('?')[0]);
                        if (newName !== state.lastKnownName) {
                            state.lastKnownName = newName;
                            if (Date.now() - state.mountedAt > BUILTIN.coldStartMs) {
                                if (mounted && state.stripEl && viewer.querySelector('.ib-strip-container') === state.stripEl) {
                                    const idx = findCurrentIndex();
                                    // HFS 自己換了圖（刪除後跳下一張、改名、外部變動）：
                                    // 舊的漸進預覽可能還綁在同一個 <img> 上，
                                    // 不交棒的話新圖會一直被藏住 → 主界面看起來沒切換
                                    resyncPreviewForDomChange(idx);
                                    if (idx >= 0 && idx !== state.currentIndex) {
                                        updateActive(idx, false);
                                    } else if (idx >= 0) {
                                        centerOnIndex(idx, true);
                                    }
                                }
                            }
                        }
                    }
                    if (pendingMount) clearTimeout(pendingMount);
                    pendingMount = setTimeout(() => {
                        pendingMount = null;
                        mount();
                    }, BUILTIN.mountDelayMs);
                } else if (mounted && !pendingUnmount) {
                    clearProgressivePreview();
                    pendingUnmount = setTimeout(() => {
                        pendingUnmount = null;
                        if (mounted) unmount();
                    }, BUILTIN.unmountDelayMs);
                }
            } catch (e) { }
        });
    }

    function startObserver() {
        // === PATCH 7：先手拦截（此时可能还没有 .showing，晚一点再说） ===
        interceptNativeFirstShowing();
        // === PATCH 7 END ===
        const mo = new MutationObserver(() => {
            // 拖曳期間只會切換縮圖高亮 class；不必每次變動都掃全頁 + 判斷 mount
            if (state.dragging) return;
            // === PATCH 7：每次 DOM 变动都尝试，直到 done ===
            interceptNativeFirstShowing();
            // === PATCH 7 END ===
            schedule();
        });
        mo.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'class'],
        });
        let lastUri = (window.HFS && window.HFS.state && window.HFS.state.uri) || '';
        setInterval(() => {
            const uri = (window.HFS && window.HFS.state && window.HFS.state.uri) || '';
            if (uri !== lastUri) {
                const prevUri = lastUri;
                lastUri = uri;
                const prevDir = prevUri.split('/').slice(0, -1).join('/');
                const newDir = uri.split('/').slice(0, -1).join('/');
                const dirChanged = prevDir !== newDir;
                if (dirChanged) {
                    if (mounted) unmount();
                } else if (mounted) {
                    setTimeout(healThumbnails, 50);
                    setTimeout(healThumbnails, 200);
                    setTimeout(healThumbnails, 500);
                }
            }
            // 刪除／新增後 HFS 清單長度會變 → 重抓圖片清單並重新對位
            checkListChanged();
        }, 250);
        schedule();
    }

    window.ImageBrowser = {
        state,
        config: C,
        builtin: BUILTIN,
        preview: PREVIEW,
        progress: PROGRESS,
        settleTiers: SETTLE_TIERS,
        get hugeThreshold() { return getHugeThresholdBytes(); },
        get canvasThreshold() { return getCanvasThresholdBytes(); },
        getHugeThresholdBytes,
        getCanvasThresholdBytes,
        getHugeCountdownMs,
        navigateTo, navigateNext, navigatePrev,
        detectNextButton, detectJumpMode,
        getNavButtons, findCurrentIndex,
        interruptMainImage, tryDirectJump,
        healThumbnails, fadeInMainImage, fadeOutMainImage,
        injectCssVars, getEffectiveThumbSize,
        mount, unmount,
        softReloadBrowser,
        toggleCollapse,
        zoomImage, resetZoom, panZoomBy, zoomState, updateZoomLabel,
        canvasState, renderCanvas, deactivateCanvas,
        isSuperHugeImage, shouldUseCanvas,
        clearProgressivePreview, armProgressivePreview,
        startProgressFor, finishProgress, abortProgress,
        scheduleLoad, doLoadMainImage, getSettleDelayFor, forceLoadNow,
        startHugeCountdown, forceHugeLoad, clearHugeOverlay,
        isHugeImage, isImageAlreadyLoaded,
        loadMainImageNative,
        closeGate, openGate,
        interceptShowingWithThumb,
        interceptNativeFirstShowing,
        // Countdown-load 開關（右上角 Ⓒ 按鈕）：也可從 console 直接呼叫
        setCountdownLoad, countdownLoadEnabled, loadCountdownPref,
        ensureCountdownButton,
        loadCurrentImageNow,
        requestOriginalForZoom,
        // 把面板上的縮圖設定（pixels / quality / regenerateBefore）套到 thumbnails 外掛
        syncThumbnailSettings,
        // 刪除／新增後重新抓圖片清單並重新對位
        refreshImageList,
        resyncPreviewForDomChange,
        resetDetect: () => { state.nextButtonSide = 'right'; state.jumpMode = null; },
        refresh: () => { state.listFetchedFor = ''; schedule(); },
    };

    function boot() {
        loadConfig();
        loadCountdownPref();
        syncThumbnailSettings();
        injectCssVars();
        // === PATCH 8：boot 同步段先尝试拦截一次 ===
        interceptNativeFirstShowing();
        // === PATCH 8 END ===
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();