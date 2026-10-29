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

    const DRAG_SWITCH_MIN_INTERVAL_MS = 60;

    const COLLAPSE_KEY = 'ib.collapsed';

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

    let C = {
        thumbnailSize: 10,
        thumbnailSizeUnit: 'vh',
        mobileThumbnailSize: 6,
        mobileThumbnailSizeUnit: 'vh',
        hugeImageThresholdMb: 8,
        hugeCountdownSeconds: 3,
        canvasThresholdMb: 50,
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

    function injectCssVars() {
        const size = getEffectiveThumbSize();
        const thumbH = size.h;
        const thumbW = Math.round(thumbH * 1.33);
        const gap = size.gap;
        const itemW = thumbW + gap;

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
    }

    const IMG_EXTS = [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
        'svg', 'avif', 'ico', 'tif', 'tiff'
    ];
    function isImageExt(ext) {
        if (!ext) return false;
        return IMG_EXTS.includes(String(ext).toLowerCase());
    }
    function isImageName(name) {
        if (!name) return false;
        return isImageExt(String(name).split('.').pop());
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
        settleTimer: null,
        pendingLoadIndex: -1,
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

    function startHugeCountdown(index) {
        const img = state.images[index];
        if (!img) return;

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
                showingNow.src = BLANK_PIXEL;
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
        return normalizeUrl(src) === normalizeUrl(img.url);
    }

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

        const onReady = () => {
            try { showing.removeEventListener('load', onReady); } catch (e) { }
            try { showing.removeEventListener('error', onReady); } catch (e) { }
            if (!showing.naturalWidth) return;
            const s = showing.getAttribute('src') || '';
            if (s.startsWith('data:')) return;
            try {
                showing.style.removeProperty('opacity');
            } catch (e) {
                showing.style.opacity = '';
            }
            finishProgress();
        };

        showing.addEventListener('load', onReady);
        showing.addEventListener('error', onReady);

        showing.src = img.url;

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
    };

    // ============================================================
    // Canvas 局部渲染（仅用于超级大图，体积 >= canvasThresholdMb）
    // 注意：超级大图仍然照常走倒计时/闸门，放行后才用 Canvas 渲染
    // ============================================================
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

    // 源图降采样上限：长边超过此值时用 createImageBitmap 预缩小，
    // 避免每帧从巨大的原图纹理采样导致卡顿。
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
        // DPR 上限从 2 降到 1.5：高倍放大时源图本身已插值，画布无需过采样
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

        if (canvasState.srcUrl === img.url && canvasState.image) {
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
            if (!cur || cur.url !== img.url) return;

            const nw = loader.naturalWidth || 0;
            const nh = loader.naturalHeight || 0;
            let src = loader;
            let sw = nw;
            let sh = nh;

            // 降采样：长边超过 MAX_SOURCE_EDGE 时用 createImageBitmap 预缩小，
            // 之后所有绘制都从降采样图采样，避免每帧处理超大原图纹理。
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
            canvasState.srcUrl = img.url;
            canvasState.pendingSrc = '';

            canvasState.active = true;
            if (canvasState.el) canvasState.el.style.display = 'block';
            hideNativeShowing(true);
            scheduleCanvasRender();
            finishProgress();
        };
        loader.onerror = () => {
            if (token !== canvasState.loadToken) return;
            canvasState.pendingSrc = '';
            deactivateCanvas(true);
        };
        loader.src = img.url;
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

        // Canvas 模式下：不改 img transform，改为重绘 Canvas
        if (canvasState.active) {
            hideNativeShowing(true);
            scheduleCanvasRender();
            updateZoomLabel();
            return;
        }

        // 过渡完全由 animated 决定：true 平滑缩放，false 硬性即时（拖拽/平移跟手）
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

        updateZoomLabel();
    }

    function clampZoomTranslation() {
        const img = getMainImage();
        if (!img) return;
        const container = img.closest('.main') || img.parentElement;
        if (!container) return;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        // Canvas 模式下 naturalWidth/Height 可能为 0（img 被隐藏但仍有原图 src 尺寸），
        // 优先使用 canvasState 的尺寸
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

    // 以「当前可见屏幕中心」为轴心缩放：
    // 视口中心对应图片点 p = -t/s，缩放后保持该点在视口中心 → t' = t * (s'/s)
    // factor 为正数时表示目标缩放值；direction 为 ±1 时按 STEP 步进。
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
            const rect = img.getBoundingClientRect();
            const cx = (t1.clientX + t2.clientX) / 2;
            const cy = (t1.clientY + t2.clientY) / 2;
            zoomState.pinchStartCenterX = cx - (rect.left + rect.width / 2);
            zoomState.pinchStartCenterY = cy - (rect.top + rect.height / 2);
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

    function armProgressivePreview(img) {
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

        const thumbSrc = getReadyThumbSrc(img, state.currentIndex);

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

        const boundShowing = showing;
        const boundPreviewImg = pImg;
        let finalized = false;

        const isShowingReady = () => {
            if (!boundShowing) return false;
            if (!boundShowing.complete || !boundShowing.naturalWidth) return false;
            const s = boundShowing.getAttribute('src') || '';
            if (s.startsWith('data:')) return false;
            return true;
        };

        const finalize = () => {
            if (finalized) return;
            finalized = true;
            try { boundShowing.removeEventListener('load', onLoad); } catch (e) { }
            try { boundShowing.removeEventListener('error', onLoad); } catch (e) { }
            stopPreviewTimers();

            const ready = isShowingReady();
            if (ready) {
                try {
                    boundShowing.style.removeProperty('opacity');
                } catch (e) {
                    boundShowing.style.opacity = '';
                }
                boundShowing.classList.remove('ib-fading');
                if (boundPreviewImg && boundPreviewImg.parentNode) {
                    boundPreviewImg.remove();
                }
                if (previewImgEl === boundPreviewImg) previewImgEl = null;
                finishProgress();
            } else {
                try {
                    boundShowing.style.setProperty('opacity', '0', 'important');
                } catch (e) { boundShowing.style.opacity = '0'; }
            }

            if (previewBoundShowing === boundShowing) {
                previewBoundShowing = null;
                previewLoadHandler = null;
                previewErrorHandler = null;
                previewCurrentUrl = '';
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

            // 邪修闸门：每次导航先摘掉 img.showing 的原图 src，阻止 HFS 原生加载
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

    function scheduleLoad(index) {
        if (state.settleTimer) {
            clearTimeout(state.settleTimer);
            state.settleTimer = null;
        }
        state.pendingLoadIndex = index;
        const img = state.images[index];
        const delay = getSettleDelayFor(img);
        state.settleTimer = setTimeout(() => {
            state.settleTimer = null;
            if (state.pendingLoadIndex < 0) return;
            if (state.pendingLoadIndex !== state.currentIndex) return;
            const target = state.images[state.pendingLoadIndex];
            if (target && isHugeImage(target) &&
                !(hugeState.el && hugeState.targetIndex === state.pendingLoadIndex)) {
                startHugeCountdown(state.pendingLoadIndex);
                return;
            }
            doLoadMainImage(state.pendingLoadIndex);
        }, delay);
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
        const showing = document.querySelector('.file-show img.showing');
        if (!showing) return;

        // 已加载且非 Canvas 图：直接复用
        if (isImageAlreadyLoaded(img) && !shouldUseCanvas(img)) {
            clearHugeOverlay();
            deactivateCanvas(false);
            armProgressivePreview(img);
            return;
        }

        // 大图未放行：照常弹倒计时（超级大图也走这里）
        if (isHugeImage(img) && !force) {
            if (!(hugeState.el && hugeState.targetIndex === index)) {
                startHugeCountdown(index);
            }
            armProgressivePreview(img);
            return;
        }

        clearHugeOverlay();
        armProgressivePreview(img);

        // 放行后：超级大图走 Canvas 局部绘制，其余走原生 img
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

    async function fetchImageList(folderUri) {
        if (state.listFetching) return;
        if (state.listFetchedFor === folderUri) return;
        state.listFetching = true;
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
                    return {
                        name: it.n,
                        url: url,
                        thumbUrl: url + (url.includes('?') ? '&' : '?') + 'get=thumb',
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
        } catch (e) {
        } finally {
            state.listFetching = false;
        }
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
            } else {
                openGate(index);
                scheduleLoad(index);
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

    function updateFileInfoResFromShowing(showing) {
        if (!state.fileInfoEl) return;
        if (!showing || !showing.naturalWidth || !showing.naturalHeight) return;
        const idx = state.currentIndex;
        if (idx < 0) return;
        const img = state.images[idx];
        if (!img) return;
        const meta = state.metaCache.get(img.url) || {};
        const w = showing.naturalWidth;
        const h = showing.naturalHeight;
        const res = {
            w,
            h,
            ratio: formatAspectRatio(w, h),
            mp: (w * h) / 1e6,
        };
        meta.res = res;
        state.metaCache.set(img.url, meta);
        updateFileInfo(idx);
    }

    function resolveResolution(img, meta) {
        return new Promise(resolve => {
            if (!img) { resolve(null); return; }
            if (meta && meta.res !== undefined) { resolve(meta.res); return; }

            const showing = getMainImage();
            if (showing && showing.complete && showing.naturalWidth > 0 &&
                normalizeUrl(showing.getAttribute('src') || '') === normalizeUrl(img.url)) {
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

            resolve(null);
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
            const resText = (res && res.w && res.h) ? `${res.w}×${res.h}` : '—';
            const ratioText = (res && res.ratio) ? res.ratio : '—';
            const mpText = formatMegapixels(res && res.mp) || '—';
            state.fileInfoEl.innerHTML =
                `<span class="ib-meta">Ⓢ\uFE0E ${sizeText}</span>` +
                `<span class="ib-meta-gap"></span>` +
                `<span class="ib-meta">Ⓒ\uFE0E ${cText}</span>` +
                `<span class="ib-meta-gap"></span>` +
                `<span class="ib-meta">Ⓜ\uFE0E ${mText}</span>` +
                `<span class="ib-meta-gap ib-meta-gap-res"></span>` +
                `<span class="ib-meta ib-meta-res">Ⓡ\uFE0E ${resText}</span>` +
                `<span class="ib-meta-gap ib-meta-gap-res"></span>` +
                `<span class="ib-meta ib-meta-res">Ⓐ\uFE0E ${ratioText}</span>` +
                `<span class="ib-meta-gap ib-meta-gap-res"></span>` +
                `<span class="ib-meta ib-meta-res">Ⓟ\uFE0E ${mpText}</span>`;
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
        const size = getEffectiveThumbSize();
        const thumbH = size.h;
        const thumbW = Math.round(thumbH * 1.33);
        const gap = size.gap;
        const itemW = thumbW + gap;
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
    }

    function extendWindow(targetIndex) {
        const total = state.images.length;
        if (total === 0) return;
        const size = getEffectiveThumbSize();
        const thumbH = size.h;
        const thumbW = Math.round(thumbH * 1.33);
        const gap = size.gap;
        const itemW = thumbW + gap;
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
        const size = getEffectiveThumbSize();
        const thumbH = size.h;
        const thumbW = Math.round(thumbH * 1.33);
        const gap = size.gap;
        const itemW = thumbW + gap;
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
            im.src = img.url;
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
                if (idx === state.currentIndex && state.settleTimer &&
                    state.pendingLoadIndex === idx) {
                    forceLoadNow(idx);
                    return;
                }
                navigateTo(idx);
            });
        }
        return cell;
    }

    let updatingActive = false;
    let pendingIndex = null;

    function centerOnIndex(index, animated = true) {
        if (!state.trackEl || !state.stripEl) return;
        const size = getEffectiveThumbSize();
        const thumbH = size.h;
        const thumbW = Math.round(thumbH * 1.33);
        const gap = size.gap;
        const itemW = thumbW + gap;
        const containerW = state.stripEl.clientWidth;
        const center = containerW / 2;
        const targetCenter = index * itemW + thumbW / 2;
        const translateX = center - targetCenter;
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
            extendWindow(index);
            state.thumbEls.forEach((cell, cellIdx) => {
                const active = cellIdx === index;
                const near = Math.abs(cellIdx - index) <= 2 && !active;
                cell.classList.toggle('ib-active', active);
                cell.classList.toggle('ib-near', near);
            });
            const prevIdx = state.lastRenderIndex;
            const bigJump = prevIdx >= 0 && Math.abs(index - prevIdx) > 15;
            if (bigJump && state.trackEl) {
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

    function findThumbIndexAtPoint(clientX) {
        if (!state.stripEl) return -1;
        const rect = state.stripEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        let bestIdx = -1;
        let bestDist = Infinity;
        state.thumbEls.forEach((cell, idx) => {
            const r = cell.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const d = Math.abs(cx - centerX);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = idx;
            }
        });
        return bestIdx;
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
            // 放大模式：方向鍵平移圖片（平緩移動放大的視窗位置）
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
            // 非放大模式：左右鍵切換照片
            if (e.key === 'ArrowLeft') {
                e.preventDefault(); e.stopPropagation(); navigatePrev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation(); navigateNext();
            }
        }
    }

    function bindTouchEvents(strip) {
        let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
        let isDragging = false;
        let dragStartTranslateX = 0;
        let currentTranslateX = 0;
        let lastSwitchTime = 0;
        function getCurrentTranslateX() {
            if (!state.trackEl) return 0;
            const t = state.trackEl.style.transform || '';
            const m = t.match(/translateX\(([-\d.]+)px\)/);
            return m ? parseFloat(m[1]) : 0;
        }
        function onTouchStart(e) {
            if (state.collapsed) return;
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            touchStartX = t.clientX;
            touchStartY = t.clientY;
            touchStartTime = Date.now();
            isDragging = false;
            dragStartTranslateX = getCurrentTranslateX();
            currentTranslateX = dragStartTranslateX;
            lastSwitchTime = 0;
            if (state.trackEl) state.trackEl.style.transition = 'none';
        }
        function onTouchMove(e) {
            if (state.collapsed) return;
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            const dx = t.clientX - touchStartX;
            const dy = t.clientY - touchStartY;
            if (!isDragging) {
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) isDragging = true;
                else if (Math.abs(dy) > 10) return;
                else return;
            }
            e.preventDefault();
            currentTranslateX = dragStartTranslateX + dx;
            state.trackEl.style.transform =
                `translateY(-50%) translateX(${currentTranslateX}px)`;
            const now = Date.now();
            if ((now - lastSwitchTime) >= DRAG_SWITCH_MIN_INTERVAL_MS) {
                const idx = findThumbIndexAtPoint(t.clientX);
                if (idx >= 0 && idx !== state.currentIndex) {
                    navigateTo(idx);
                    lastSwitchTime = now;
                }
            }
        }
        function onTouchEnd() {
            if (!isDragging) return;
            isDragging = false;
            updateActive(state.currentIndex, true);
            const img = state.images[state.currentIndex];
            if (img && isHugeImage(img)) {
                if (!(hugeState.el && hugeState.targetIndex === state.currentIndex)) {
                    startHugeCountdown(state.currentIndex);
                }
            } else {
                openGate(state.currentIndex);
                scheduleLoad(state.currentIndex);
            }
        }
        strip.addEventListener('touchstart', onTouchStart, { passive: true });
        strip.addEventListener('touchmove', onTouchMove, { passive: false });
        strip.addEventListener('touchend', onTouchEnd, { passive: true });
        strip.addEventListener('touchcancel', onTouchEnd, { passive: true });
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

        if (!state.settleTimer) return;
        if (state.pendingLoadIndex < 0) return;
        forceLoadNow(state.pendingLoadIndex);
    }

    let mounted = false;
    let mountInProgress = false;

    async function mount() {
        if (mountInProgress) return;
        const viewer = document.querySelector('.file-show');
        if (!viewer) return;
        const showing = viewer.querySelector('img.showing');
        if (!showing) return;
        const src = showing.getAttribute('src') || '';
        const isObjectUrl = src.startsWith('blob:');
        const isBlankPixel = src.startsWith('data:');
        if (!isObjectUrl && !isBlankPixel && !isImageName(src.split('?')[0].split('/').pop())) {
            if (!state.lastKnownName) return;
        }
        const stripInThisViewer = viewer.querySelector('.ib-strip-container');
        if (mounted && state.stripEl && stripInThisViewer === state.stripEl) {
            healThumbnails();
            const idx = findCurrentIndex();
            if (idx >= 0 && idx !== state.currentIndex) updateActive(idx, true);
            else centerOnIndex(state.currentIndex, true);
            bindZoomDrag();
            bindShowingContainerClick();
            return;
        }
        mountInProgress = true;
        try {
            if (mounted) unmount();
            let folderUri = '';
            if (state.lastKnownName && state.images.length > 0) {
                const firstUrl = state.images[0].url;
                const lastSlash = firstUrl.lastIndexOf('/');
                folderUri = lastSlash >= 0 ? firstUrl.substring(0, lastSlash + 1) : '';
            } else {
                const url = src.split('?')[0];
                const lastSlash = url.lastIndexOf('/');
                folderUri = lastSlash >= 0 ? url.substring(0, lastSlash + 1) : '';
            }
            await fetchImageList(folderUri);
            if (state.images.length === 0) return;
            let currentName = state.lastKnownName;
            if (!currentName) {
                currentName = decodeURIComponent(src.split('/').pop().split('?')[0]);
            }
            let idx = state.images.findIndex(i => i.name === currentName);
            if (idx < 0) idx = 0;
            state.currentIndex = idx;
            state.lastKnownName = currentName;
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
            const size = getEffectiveThumbSize();
            state.lastSizeKey = `${size.h}x${size.gap}`;
            state.lastAspectKey = getAspectKey();
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
            window.addEventListener('orientationchange', onResize);
            setTimeout(() => { detectJumpMode(); }, 500);
            if (state.images[idx]) {
                const firstImg = state.images[idx];
                if (isImageAlreadyLoaded(firstImg) && !shouldUseCanvas(firstImg)) {
                    armProgressivePreview(firstImg);
                } else if (isHugeImage(firstImg)) {
                    armProgressivePreview(firstImg);
                    startHugeCountdown(idx);
                } else {
                    openGate(idx);
                    doLoadMainImage(idx);
                }
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
        removeCanvasLayer();
        const container = document.querySelector('.file-show .showing-container');
        if (container) {
            container.style.touchAction = '';
            container.querySelectorAll('.ib-progressive-preview').forEach(el => el.remove());
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
        mounted = false;
        if (state.resizeReloadTimer) {
            clearTimeout(state.resizeReloadTimer);
            state.resizeReloadTimer = null;
        }
        document.removeEventListener('keydown', onKeyDown, { capture: true });
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
    }

    function softReloadBrowser() {
        if (!mounted || !state.stripEl) return;
        const viewer = document.querySelector('.file-show');
        if (!viewer) return;
        clearProgressivePreview();
        abortProgress();
        removeCanvasLayer();
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
        const size = getEffectiveThumbSize();
        state.lastSizeKey = `${size.h}x${size.gap}`;
        state.lastAspectKey = getAspectKey();
        state.mountedAt = Date.now();
        applyCollapseState();
        updateActive(keepIndex, false);
        zoomDragBound = false;
        bindZoomDrag();
        bindShowingContainerClick();
        unbindWheelAll();
        if (main && BUILTIN.enableWheelSwitch) {
            main.addEventListener('wheel', onWheel, { passive: false });
            state.mainEl = main;
        }
        if (state.images[keepIndex]) {
            armProgressivePreview(state.images[keepIndex]);
        }
    }

    function getAspectKey() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (!w || !h) return '';
        return (w / h).toFixed(3);
    }

    function onResize() {
        if (!mounted) return;
        if (canvasState.active) {
            sizeCanvasToContainer();
            scheduleCanvasRender();
        }
        const size = getEffectiveThumbSize();
        const sizeKey = `${size.h}x${size.gap}`;
        const aspectKey = getAspectKey();
        const changed =
            state.lastSizeKey !== sizeKey ||
            state.lastAspectKey !== aspectKey;
        if (!changed) {
            if (state.currentIndex >= 0) centerOnIndex(state.currentIndex, false);
            return;
        }
        state.lastSizeKey = sizeKey;
        state.lastAspectKey = aspectKey;
        if (state.resizeReloadTimer) clearTimeout(state.resizeReloadTimer);
        state.resizeReloadTimer = setTimeout(() => {
            state.resizeReloadTimer = null;
            softReloadBrowser();
        }, 150);
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
                    if (!isObjectUrl && !isBlankPixel) {
                        const newName = decodeURIComponent(src.split('/').pop().split('?')[0]);
                        if (newName !== state.lastKnownName) {
                            state.lastKnownName = newName;
                            if (Date.now() - state.mountedAt > BUILTIN.coldStartMs) {
                                if (mounted && state.stripEl && viewer.querySelector('.ib-strip-container') === state.stripEl) {
                                    const idx = findCurrentIndex();
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
        const mo = new MutationObserver(schedule);
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
        resetDetect: () => { state.nextButtonSide = 'right'; state.jumpMode = null; },
        refresh: () => { state.listFetchedFor = ''; schedule(); },
    };

    function boot() {
        loadConfig();
        injectCssVars();
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();