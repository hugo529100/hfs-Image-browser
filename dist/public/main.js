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
    };

    const DRAG_SWITCH_MIN_INTERVAL_MS = 60;

    const COLLAPSE_KEY = 'ib.collapsed';

    // Progressive preview config (hardcoded, not user-configurable)
    const PREVIEW = {
        enabled: true,
        fadeOutMs: 300,   // 縮圖淡出時間
    };

    // Thumbnail loading progress config
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
    preloadCount: 3,
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

    /**
     * 将“数值 + 单位”换算成实际的像素高度。
     * 支持 px / vh / vw，默认回退到 px。
     */
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

        // 换算失败时回退到内置默认值（px）
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
        collapsed: false,
        lastWheelTime: 0,
        preloadCache: new Map(),
        preloadPending: new Set(),
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
        lastOrientationKey: '',
        mountedAt: 0,
        metaCache: new Map(),
        resizeReloadTimer: null,
    };

    // ============================================================
    // Zoom state & functions
    // ============================================================
    const ZOOM_CFG = {
        MIN: 1,
        MAX: 8,
        STEP: 0.5,
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

    function getMainImage() {
        return document.querySelector('.file-show img.showing');
    }

    /**
     * 取得包裹主图的容器（.showing-container）。
     * 手势监听绑定在这个容器上，让捕捉范围扩大到整块图片显示区域，
     * 而不只是图片本身。
     */
    function getShowingContainer() {
        const img = getMainImage();
        if (!img) return null;
        return img.closest('.showing-container') || img.parentElement || null;
    }

    /**
     * 设置/恢复容器的 touch-action，用来在捏合缩放时阻止浏览器
     * 把双指手势当作页面缩放（pinch-zoom）。
     */
    function setContainerTouchAction(value) {
        const container = getShowingContainer();
        if (container) container.style.touchAction = value;
    }

    function applyZoomTransform(animated = false) {
        const img = getMainImage();
        if (!img) return;

        if (animated) {
            img.style.transition = 'transform 0.2s ease-out';
        } else {
            img.style.transition = 'none';
        }

        img.style.transformOrigin = 'center center';
        img.style.transform =
            `translate(${zoomState.translateX}px, ${zoomState.translateY}px) scale(${zoomState.scale})`;
        img.style.cursor = zoomState.scale > 1
            ? (zoomState.dragging ? 'grabbing' : 'grab')
            : '';
        img.style.willChange = zoomState.scale > 1 ? 'transform' : '';
        img.style.userSelect = 'none';
        img.style.touchAction = zoomState.scale > 1 ? 'none' : '';

        if (animated) {
            requestAnimationFrame(() => {
                const cur = getMainImage();
                if (cur) cur.style.transition = '';
            });
        }
    }

    function clampZoomTranslation() {
        const img = getMainImage();
        if (!img) return;

        const container = img.closest('.main') || img.parentElement;
        if (!container) return;

        const cw = container.clientWidth;
        const ch = container.clientHeight;

        const nw = img.naturalWidth || 0;
        const nh = img.naturalHeight || 0;
        if (!nw || !nh) return;

        const fit = Math.min(cw / nw, ch / nh);
        const displayW = nw * fit * zoomState.scale;
        const displayH = nh * fit * zoomState.scale;

        const maxX = Math.max(0, (displayW - cw) / 2);
        const maxY = Math.max(0, (displayH - ch) / 2);

        zoomState.translateX = Math.max(-maxX, Math.min(maxX, zoomState.translateX));
        zoomState.translateY = Math.max(-maxY, Math.min(maxY, zoomState.translateY));
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

    // 始终绑定主图容器上的指针/触摸监听，让双指手势独立于缩放级别可用。
    let zoomDragBound = false;

    function onZoomPointerDown(e) {
        if (zoomState.scale <= 1) return;
        const img = getMainImage();
        if (!img) return;
        if (e.button !== undefined && e.button !== 0) return;

        // 排除交互元素（缩略图条、缩放按钮、导航按钮等），
        // 其余区域（含图片周围空白）都视为拖拽起点。
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
            // 双指捏合：无论当前 scale 是多少都进入捏合模式
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

            // 阻止浏览器默认的翻页 / 页面缩放行为
            setContainerTouchAction('none');
            e.preventDefault();
        } else if (e.touches.length === 1 && zoomState.scale > 1) {
            // 放大后单指拖拽平移
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
            // 阻止浏览器接管手势（页面缩放 / 滚动）
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
        // 捏合缩回 1x 时归位，但不解除监听
        if (zoomState.scale <= 1) {
            zoomState.scale = 1;
            zoomState.translateX = 0;
            zoomState.translateY = 0;
            applyZoomTransform(true);
        }
        // 手指全部离开后恢复容器的 touch-action，让页面可正常滚动
        if (e.touches.length === 0 && zoomState.scale <= 1) {
            setContainerTouchAction('');
        }
    }

    function bindZoomDrag() {
        const img = getMainImage();
        if (!img) return;

        // 绑定到包裹容器，扩大手势捕捉范围
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
    // ============================================================
    // Zoom end
    // ============================================================

    // ============================================================
    // Thumbnail loading progress
    // 在當前 active 的縮圖框內顯示原圖下載百分比
    // ============================================================
    const progressState = {
        xhr: null,
        targetIndex: -1,
        targetUrl: '',
        el: null,          // .ib-thumb-progress
        fillEl: null,      // .ib-thumb-progress-fill
        textEl: null,      // .ib-thumb-progress-text
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
        if (progressState.el) {
            progressState.el.classList.remove('is-active');
        }
        if (progressState.fillEl) {
            progressState.fillEl.style.transform = 'scaleY(0)';
        }
        if (progressState.textEl) {
            progressState.textEl.textContent = '0%';
        }
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
        if (progressState.xhr) {
            try { progressState.xhr.abort(); } catch (e) { }
            progressState.xhr = null;
        }
        resetProgressVisual();
    }

    /**
     * 在指定 index 的縮圖上啟動進度條。
     * 若原圖已在快取（showing.complete），直接不顯示。
     */
    function startProgressFor(index) {
        if (!PROGRESS.enabled) return;
        if (!mounted) return;
        if (index < 0 || index >= state.images.length) return;

        const img = state.images[index];
        if (!img) return;

        // 已載入完成（快取命中）→ 不顯示進度
        const showing = getMainImage();
        if (showing && showing.complete && showing.naturalWidth > 0) {
            abortProgress();
            return;
        }

        const cell = state.thumbEls.get(index);
        if (!cell) return;

        const els = getProgressEls(cell);
        if (!els) return;

        // 切換到新的目標 → 先 abort 舊的
        if (progressState.xhr && progressState.targetUrl !== img.url) {
            abortProgress();
        }

        progressState.el = els.el;
        progressState.fillEl = els.fillEl;
        progressState.textEl = els.textEl;
        progressState.targetIndex = index;
        progressState.targetUrl = img.url;

        els.el.classList.add('is-active');
        if (els.textEl) els.textEl.textContent = '0%';
        if (els.fillEl) els.fillEl.style.transform = 'scaleY(0)';

        // 若已有同 URL 的 XHR 在跑，不重複發
        if (progressState.xhr && progressState.targetUrl === img.url) return;

        // 發 XHR 追蹤進度
        const xhr = new XMLHttpRequest();
        progressState.xhr = xhr;

        xhr.open('GET', img.url, true);
        xhr.responseType = 'blob';

        xhr.onprogress = (e) => {
            if (progressState.xhr !== xhr) return;
            let pct = 0;
            if (e.lengthComputable && e.total > 0) {
                pct = Math.round((e.loaded / e.total) * 100);
            } else {
                // 沒有 Content-Length：顯示不確定進度（用 received 遞增但封頂 99%）
                pct = Math.min(99, Math.round(Math.log10(e.loaded + 10) * 20));
            }
            if (progressState.fillEl) {
                progressState.fillEl.style.transform = `scaleY(${pct / 100})`;
            }
            if (progressState.textEl) {
                progressState.textEl.textContent = pct + '%';
            }
        };

        xhr.onload = () => {
            if (progressState.xhr !== xhr) return;
            if (progressState.fillEl) progressState.fillEl.style.transform = 'scaleY(1)';
            if (progressState.textEl) progressState.textEl.textContent = '100%';
            // 短暫停留後隱藏
            scheduleProgressHide();
            progressState.xhr = null;
        };

        xhr.onerror = () => {
            if (progressState.xhr !== xhr) return;
            // 失敗：直接隱藏
            scheduleProgressHide(200);
            progressState.xhr = null;
        };

        xhr.onabort = () => {
            if (progressState.xhr === xhr) progressState.xhr = null;
        };

        try {
            xhr.send();
        } catch (e) {
            progressState.xhr = null;
            scheduleProgressHide(200);
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

    /**
     * 結束進度條（原圖 load / error / 中斷時呼叫）。
     * 若 xhr 還沒完成，abort；視覺上 100% 停留 250ms 後淡出。
     */
    function finishProgress() {
        if (progressState.xhr) {
            try { progressState.xhr.abort(); } catch (e) { }
            progressState.xhr = null;
        }
        if (progressState.fillEl) progressState.fillEl.style.transform = 'scaleY(1)';
        if (progressState.textEl) progressState.textEl.textContent = '100%';
        scheduleProgressHide(250);
    }
    // ============================================================
    // Thumbnail loading progress end
    // ============================================================

    // ============================================================
    // Progressive preview (LQIP)
    // 上層：縮略圖 <img>（?get=thumb），先顯示
    // 下層：原圖 <img class="showing">，載入後直接顯示，縮圖淡出
    //
    // 可靠性設計：
    // 1. 不依賴 showing.complete（不可靠）→ 輪詢 src 直到變成目標 URL
    // 2. finalize 捕獲自己的 previewImgEl / timer，不依賴外層可變變數
    // 3. 有 8s 保險計時器，避免 load 永不觸發時縮圖永久卡住
    // ============================================================
    let previewImgEl = null;        // 上層縮略圖 <img>
    let previewBoundShowing = null; // 目前監聽的原圖節點
    let previewLoadHandler = null;
    let previewErrorHandler = null;
    let previewCurrentUrl = '';     // 目標原圖 URL（normalized，不是 thumbUrl）
    let previewPollTimer = null;
    let previewSafetyTimer = null;

    function getShowingContainerEl() {
        const img = getMainImage();
        if (!img) return null;
        return img.closest('.showing-container') || img.parentElement || null;
    }

    function stopPreviewTimers() {
        if (previewPollTimer) {
            clearInterval(previewPollTimer);
            previewPollTimer = null;
        }
        if (previewSafetyTimer) {
            clearTimeout(previewSafetyTimer);
            previewSafetyTimer = null;
        }
    }

    function clearProgressivePreview() {
        stopPreviewTimers();
        abortProgress();

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

    function normalizeUrl(u) {
        if (!u) return '';
        try {
            // 只取 pathname + search，忽略 origin / hash
            const url = new URL(u, location.origin);
            return url.pathname + url.search;
        } catch (e) {
            return u;
        }
    }

    /**
     * 武裝漸進式預覽。
     * @param {object} img state.images 裡的物件（含 url / thumbUrl）
     */
    function armProgressivePreview(img) {
        if (!PREVIEW.enabled) return;
        if (!img || !img.thumbUrl || !img.url) return;

        const showing = getMainImage();
        if (!showing) return;

        const targetNorm = normalizeUrl(img.url);

        // 若已經武裝同一張（同 target URL）→ 不重複
        if (previewBoundShowing === showing && previewCurrentUrl === targetNorm) return;

        // 先清掉舊的
        clearProgressivePreview();

        const container = getShowingContainerEl();
        if (!container) return;

        // 確保容器是定位容器
        try {
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
        } catch (e) { }

        // 建立上層縮圖（捕獲到閉包，後續操作都用這個變數）
        const pImg = document.createElement('img');
        pImg.className = 'ib-progressive-preview';
        pImg.decoding = 'async';
        pImg.draggable = false;
        pImg.alt = '';
        pImg.src = img.thumbUrl;
        pImg.style.opacity = '1';
        if (showing.parentNode === container) {
            container.insertBefore(pImg, showing.nextSibling);
        } else {
            container.appendChild(pImg);
        }
        previewImgEl = pImg;
        previewCurrentUrl = targetNorm;
        previewBoundShowing = showing;

        // 原圖先隱藏
        showing.style.transition = 'none';
        showing.style.opacity = '0';

        // 在縮圖上啟動進度條（若原圖尚未載入完成）
        startProgressFor(state.currentIndex);

        // 用閉包捕獲所有需要的狀態，避免被後續 clearProgressivePreview 破壞
        const boundShowing = showing;
        const boundPreviewImg = pImg;
        const boundTargetNorm = targetNorm;
        let finalized = false;

        const finalize = () => {
            if (finalized) return;
            finalized = true;

            // 移除監聽
            try { boundShowing.removeEventListener('load', onLoad); } catch (e) { }
            try { boundShowing.removeEventListener('error', onLoad); } catch (e) { }
            stopPreviewTimers();

            // 結束進度條
            finishProgress();

            // 原圖直接顯示（無過渡，避免與縮圖淡出重疊產生雙重動畫）
            boundShowing.style.transition = 'none';
            boundShowing.style.opacity = '1';
            boundShowing.classList.remove('ib-fading');

            // 縮圖淡出 → 移除
            if (boundPreviewImg && boundPreviewImg.parentNode) {
                boundPreviewImg.style.transition = `opacity ${PREVIEW.fadeOutMs}ms ease-out`;
                boundPreviewImg.style.opacity = '0';
                setTimeout(() => {
                    if (boundPreviewImg.parentNode) boundPreviewImg.remove();
                }, PREVIEW.fadeOutMs + 50);
            }
            if (previewImgEl === boundPreviewImg) previewImgEl = null;

            // 清 transition，讓 applyZoomTransform 接管
            setTimeout(() => {
                if (boundShowing && boundShowing.style.transition) {
                    boundShowing.style.transition = '';
                }
            }, PREVIEW.fadeOutMs + 60);

            if (previewBoundShowing === boundShowing) {
                previewBoundShowing = null;
                previewLoadHandler = null;
                previewErrorHandler = null;
                previewCurrentUrl = '';
            }
        };

        const onLoad = () => finalize();
        previewLoadHandler = onLoad;
        previewErrorHandler = onLoad;

        const tryAttach = () => {
            // 若 showing 已換（HFS 重建節點），finalize 直接結束
            const cur = getMainImage();
            if (cur !== boundShowing) {
                // 節點已換，舊 showing 不會再有 load，直接 finalize（清掉自己的縮圖）
                finalize();
                return true;
            }

            const curNorm = normalizeUrl(boundShowing.getAttribute('src') || '');

            // 目標 src 已就位 → 掛監聽
            if (curNorm === boundTargetNorm) {
                // 先移除再添加，避免重複
                boundShowing.removeEventListener('load', onLoad);
                boundShowing.removeEventListener('error', onLoad);
                boundShowing.addEventListener('load', onLoad, { once: true });
                boundShowing.addEventListener('error', onLoad, { once: true });

                // 若已經載入完成（快取命中）→ 下一幀 finalize
                if (boundShowing.complete && boundShowing.naturalWidth > 0) {
                    requestAnimationFrame(finalize);
                }
                return true; // 停止輪詢
            }
            return false;
        };

        // 立即嘗試一次；若 src 還沒換，開始輪詢
        if (!tryAttach()) {
            stopPreviewTimers();
            previewPollTimer = setInterval(() => {
                tryAttach();
                if (!previewPollTimer) return;
                // 若 finalized 已 true，停止
                if (finalized) {
                    clearInterval(previewPollTimer);
                    previewPollTimer = null;
                }
            }, 50);

            // 保險：8 秒後無論如何強制 finalize
            previewSafetyTimer = setTimeout(() => {
                previewSafetyTimer = null;
                finalize();
            }, 8000);
        }
    }
    // ============================================================
    // Progressive preview end
    // ============================================================

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

    function interruptMainImage() {
        if (!BUILTIN.enableInterruptOnNavigate) return;

        // 若預覽已武裝但原圖被中斷，無條件清掉預覽並還原 opacity。
        // 不用 !showing.complete 判斷（complete 不可靠）。
        if (previewBoundShowing) {
            clearProgressivePreview();
            const showing = document.querySelector('.file-show img.showing');
            if (showing) {
                showing.style.opacity = '';
                showing.style.transition = '';
            }
        }

        const showing = document.querySelector('.file-show img.showing');
        if (showing) {
            showing.onload = null;
            showing.onerror = null;
            if (showing.src && !showing.src.startsWith('data:')) {
                try { showing.src = ''; } catch (e) { }
            }
        }

        const showingContainer = document.querySelector('.file-show .showing-container');
        if (showingContainer) {
            showingContainer.querySelectorAll('img').forEach(im => {
                if (im === showing) return;
                if (im.closest('.ib-strip-container')) return;
                if (im.classList.contains('ib-progressive-preview')) return;
                im.onload = null;
                im.onerror = null;
                if (im.src && !im.src.startsWith('data:')) {
                    try { im.src = ''; } catch (e) { }
                }
            });
        }

        const cover = document.querySelector('.file-show .cover');
        if (cover && cover.style && cover.style.backgroundImage) {
            cover.style.backgroundImage = '';
        }
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
        if (!cur) cur = window.location.pathname;

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

    function preloadAround(index) {
        if (index < 0) return;
        const N = +C.preloadCount;
        for (let off = -N; off <= N; off++) {
            if (off === 0) continue;
            const img = state.images[index + off];
            if (!img) continue;
            if (state.preloadCache.has(img.url) || state.preloadPending.has(img.url)) continue;
            state.preloadPending.add(img.url);
            const im = new Image();
            im.dataset.ibPreload = '1';
            im.decoding = 'async';
            im.onload = () => {
                state.preloadPending.delete(img.url);
                state.preloadCache.set(img.url, im);
                if (state.preloadCache.size > N * 2 + 5) {
                    const first = state.preloadCache.keys().next().value;
                    state.preloadCache.delete(first);
                }
            };
            im.onerror = () => state.preloadPending.delete(img.url);
            im.src = img.url;
        }
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

        if (Date.now() - state.mountedAt < BUILTIN.coldStartMs) {
            return;
        }

        // 只重置缩放，不解绑监听（双指手势需要持续可用）
        resetZoom();

        const diff = index - state.currentIndex;

        // 切图前清掉上一张的预览，避免残留
        clearProgressivePreview();

        fadeOutMainImage();

        if (BUILTIN.enableInterruptOnNavigate) {
            interruptMainImage();
        }

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

        // 明確武裝目標圖的漸進式預覽
        const targetImg = state.images[index];
        if (targetImg) {
            // 用 rAF 等 HFS 把 showing.src 換好後再武裝
            requestAnimationFrame(() => {
                armProgressivePreview(targetImg);
            });
        }

        requestAnimationFrame(() => {
            fadeInMainImage();
            // 切换图片后主图节点可能被替换，需要重新绑定
            zoomDragBound = false;
            bindZoomDrag();
        });
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

    function resolveResolution(img, meta) {
        return new Promise(resolve => {
            if (!img) { resolve(null); return; }
            if (meta && meta.res !== undefined) { resolve(meta.res); return; }

            const im = new Image();
            im.decoding = 'async';
            im.onload = () => {
                const w = im.naturalWidth;
                const h = im.naturalHeight;
                const res = {
                    w,
                    h,
                    ratio: formatAspectRatio(w, h),
                    mp: (w && h) ? (w * h) / 1e6 : null,
                };
                if (meta) meta.res = res;
                state.metaCache.set(img.url, meta);
                resolve(res);
            };
            im.onerror = () => {
                if (meta) meta.res = null;
                state.metaCache.set(img.url, meta);
                resolve(null);
            };
            im.src = img.url;
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

            const sizeText = (meta && meta.size != null)
                ? formatBytes(meta.size) : '—';
            const cText = (meta && meta.ctime)
                ? formatDate(meta.ctime) : '—';
            const mText = (meta && meta.mtime)
                ? formatDate(meta.mtime) : '—';
            const resText = (res && res.w && res.h)
                ? `${res.w}×${res.h}` : '—';
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
                    if (state.images[state.currentIndex] === img) {
                        apply(cached, r);
                    }
                });
            }
        } else {
            state.fileInfoEl.innerHTML = '';
            fetchFileMeta(img).then(meta => {
                apply(meta, null);
                return resolveResolution(img, meta).then(r => {
                    if (state.images[state.currentIndex] === img) {
                        apply(meta, r);
                    }
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

        // Zoom controls
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
        zoomResetBtn.className = 'ib-zoom-btn';
        zoomResetBtn.textContent = 'o';
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

        // 注意：滚轮监听不在这里绑定。
        // 为了让捕捉范围扩大到整块大图区域，统一绑在 .main 上（见 mount()）。

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

        // 進度條（從底部往上推）
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
            preloadAround(index);
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

        // 缩放态下不接管滚轮（避免拖拽/平移时误切图）
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

        // 已到边界：不拦截，让滚轮继续交给页面/父级处理
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

        // Zoom hotkeys
        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            e.stopPropagation();
            zoomImage(1);
            return;
        }
        if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            e.stopPropagation();
            zoomImage(-1);
            return;
        }
        if (e.key === '*') {
            e.preventDefault();
            e.stopPropagation();
            resetZoom();
            return;
        }

        if (e.key === 'ArrowLeft') {
            e.preventDefault(); e.stopPropagation(); navigatePrev();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault(); e.stopPropagation(); navigateNext();
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
        }

        strip.addEventListener('touchstart', onTouchStart, { passive: true });
        strip.addEventListener('touchmove', onTouchMove, { passive: false });
        strip.addEventListener('touchend', onTouchEnd, { passive: true });
        strip.addEventListener('touchcancel', onTouchEnd, { passive: true });
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
        if (!isImageName(src.split('?')[0].split('/').pop())) return;

        const stripInThisViewer = viewer.querySelector('.ib-strip-container');

        if (mounted && state.stripEl && stripInThisViewer === state.stripEl) {
            healThumbnails();
            const idx = findCurrentIndex();
            if (idx >= 0 && idx !== state.currentIndex) updateActive(idx, true);
            else centerOnIndex(state.currentIndex, true);
            // 确保缩放监听已绑定
            bindZoomDrag();
            return;
        }

        mountInProgress = true;

        try {
            if (mounted) {
                unmount();
            }

            const folderUri = (() => {
                const url = src.split('?')[0];
                const lastSlash = url.lastIndexOf('/');
                return lastSlash >= 0 ? url.substring(0, lastSlash + 1) : '';
            })();

            await fetchImageList(folderUri);
            if (state.images.length === 0) return;

            const currentName = decodeURIComponent(src.split('/').pop().split('?')[0]);
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
            state.lastOrientationKey = getOrientationKey();

            applyCollapseState();
            updateActive(idx, false);

            // 始终绑定主图容器上的指针/触摸监听，
            // 让双指手势独立于缩放级别可用。
            bindZoomDrag();

            // 把滚轮监听绑定到主图区域（.main），
            // 这样在大图上滚动即可切换图片，而不仅限于缩略图条。
            if (main && BUILTIN.enableWheelSwitch) {
                // 幂等：先移除再添加，避免 softReload 后重复绑定
                main.removeEventListener('wheel', onWheel);
                main.addEventListener('wheel', onWheel, { passive: false });
                state.mainEl = main;
            }

            if (BUILTIN.enableKeyboardNav) {
                document.addEventListener('keydown', onKeyDown, { capture: true });
            }
            window.addEventListener('resize', onResize);
            window.addEventListener('orientationchange', onResize);

            setTimeout(() => {
                detectJumpMode();
            }, 500);

            // 初次挂载后武装预览（若原图尚未载入完成）
            if (state.images[idx]) {
                armProgressivePreview(state.images[idx]);
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
        // 兜底：把可能绑定过 wheel 的元素都解绑一次
        document.querySelectorAll('.file-show .main').forEach(el => {
            el.removeEventListener('wheel', onWheel);
        });
        unbindWheel();
    }

    function unbindWheelFromMain() {
        unbindWheelAll();
    }

    function unmount() {
        clearProgressivePreview();
        abortProgress();
        resetZoom();
        unbindZoomDrag();
        zoomState.scale = 1;
        zoomState.translateX = 0;
        zoomState.translateY = 0;
        zoomState.dragging = false;

        unbindWheelFromMain();

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
        state.jumpMode = null;
        state.nextButtonSide = 'right';
        state.lastRenderIndex = -1;
        state.lastSizeKey = '';
        state.lastOrientationKey = '';
        state.images = [];
        state.currentIndex = -1;
        state.listFetchedFor = '';
        state.lastKnownName = '';
        state.mountedAt = 0;
        mounted = false;
        if (state.resizeReloadTimer) {
            clearTimeout(state.resizeReloadTimer);
            state.resizeReloadTimer = null;
        }
        document.removeEventListener('keydown', onKeyDown, { capture: true });
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
    }

    /**
     * 软重载：保留 state.images / currentIndex / collapsed 等资料，
     * 只拆掉 strip DOM，用新的 innerWidth / innerHeight 重新建立。
     * 用于手机竖屏 <-> 横屏切换等「环境级」变化。
     */
    function softReloadBrowser() {
        if (!mounted || !state.stripEl) return;

        const viewer = document.querySelector('.file-show');
        if (!viewer) return;

        clearProgressivePreview();
        abortProgress();

        const keepIndex = state.currentIndex;
        const keepCollapsed = state.collapsed;
        const keepImages = state.images;
        const keepFetchedFor = state.listFetchedFor;
        const keepName = state.lastKnownName;

        // 只移除旧 strip DOM，不清 state 资料
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

        // 用新的视窗尺寸重新注入 CSS 变数
        injectCssVars();

        // 还原资料
        state.images = keepImages;
        state.currentIndex = keepIndex;
        state.collapsed = keepCollapsed;
        state.listFetchedFor = keepFetchedFor;
        state.lastKnownName = keepName;

        // 重新建立 strip
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
        state.lastOrientationKey = getOrientationKey();
        state.mountedAt = Date.now();

        applyCollapseState();
        updateActive(keepIndex, false);

        // 重建 DOM 后重新绑定手势
        zoomDragBound = false;
        bindZoomDrag();

        // 重新绑定滚轮到主图区域（幂等：先解绑再绑）
        unbindWheelAll();
        if (main && BUILTIN.enableWheelSwitch) {
            main.addEventListener('wheel', onWheel, { passive: false });
            state.mainEl = main;
        }

        // 重新武装预览
        if (state.images[keepIndex]) {
            armProgressivePreview(state.images[keepIndex]);
        }
    }

    function getOrientationKey() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const isMobile = w <= BUILTIN.mobileBreakpoint;
        const landscape = w > h;
        return `${isMobile ? 'M' : 'D'}-${landscape ? 'L' : 'P'}-${w}x${h}`;
    }

    function onResize() {
        if (!mounted) return;

        const size = getEffectiveThumbSize();
        const sizeKey = `${size.h}x${size.gap}`;
        const orientKey = getOrientationKey();

        const changed =
            state.lastSizeKey !== sizeKey ||
            state.lastOrientationKey !== orientKey;

        if (!changed) {
            if (state.currentIndex >= 0) centerOnIndex(state.currentIndex, false);
            return;
        }

        state.lastSizeKey = sizeKey;
        state.lastOrientationKey = orientKey;

        // debounce：手机旋转时 resize / orientationchange 会连续触发多次，
        // 等 150ms 让浏览器稳定后再重建，避免用旧尺寸建好又立刻被拆掉。
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
                const isImg = !!showing && isImageName(src.split('?')[0].split('/').pop());

                if (isImg) {
                    if (pendingUnmount) {
                        clearTimeout(pendingUnmount);
                        pendingUnmount = null;
                    }

                    if (mounted) healThumbnails();

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

                    if (pendingMount) clearTimeout(pendingMount);
                    pendingMount = setTimeout(() => {
                        pendingMount = null;
                        mount();
                    }, BUILTIN.mountDelayMs);
                } else if (mounted && !pendingUnmount) {
                    // 非图片 → 清掉预览
                    clearProgressivePreview();
                    pendingUnmount = setTimeout(() => {
                        pendingUnmount = null;
                        if (mounted) {
                            unmount();
                        }
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
        navigateTo, navigateNext, navigatePrev,
        detectNextButton, detectJumpMode,
        getNavButtons, findCurrentIndex,
        interruptMainImage, tryDirectJump,
        healThumbnails, fadeInMainImage, fadeOutMainImage,
        injectCssVars, getEffectiveThumbSize,
        mount, unmount,
        softReloadBrowser,
        toggleCollapse,
        zoomImage, resetZoom, zoomState,
        clearProgressivePreview, armProgressivePreview,
        startProgressFor, finishProgress, abortProgress,
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