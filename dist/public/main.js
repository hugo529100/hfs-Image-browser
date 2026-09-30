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
        return Math.max(24, h);
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
    };

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

        const diff = index - state.currentIndex;

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

        requestAnimationFrame(() => {
            fadeInMainImage();
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

        const counter = document.createElement('div');
        counter.className = 'ib-counter';
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

        buildThumbsInitial();

        if (BUILTIN.enableWheelSwitch) {
            strip.addEventListener('wheel', onWheel, { passive: false });
        }
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
        e.preventDefault();
        e.stopPropagation();

        const now = Date.now();
        if (now - state.lastWheelTime < BUILTIN.wheelDebounceMs) return;
        state.lastWheelTime = now;

        let dir = 0;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) dir = e.deltaX > 0 ? 1 : -1;
        else dir = e.deltaY > 0 ? 1 : -1;

        const magnitude = Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY));
        let step = 1 + Math.floor(Math.max(0, magnitude - 50) / 100);
        step = Math.min(step, BUILTIN.maxWheelStep);

        const target = state.currentIndex + dir * step;
        const clamped = Math.max(0, Math.min(state.images.length - 1, target));
        if (clamped !== state.currentIndex) navigateTo(clamped);
    }

    function onKeyDown(e) {
        if (!BUILTIN.enableKeyboardNav) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' ||
            (document.activeElement && document.activeElement.isContentEditable)) return;
        if (!document.querySelector('.file-show')) return;
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

            if (BUILTIN.enableKeyboardNav) {
                document.addEventListener('keydown', onKeyDown, { capture: true });
            }
            window.addEventListener('resize', onResize);
            window.addEventListener('orientationchange', onResize);

            setTimeout(() => {
                detectJumpMode();
            }, 500);
        } finally {
            mountInProgress = false;
        }
    }

    function unmount() {
        document.querySelectorAll('.ib-strip-container').forEach(el => el.remove());

        state.stripEl = null;
        state.trackEl = null;
        state.counterEl = null;
        state.fileInfoEl = null;
        state.collapseTabEl = null;
        state.selectorEl = null;
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
        document.removeEventListener('keydown', onKeyDown, { capture: true });
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
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

        if (state.lastSizeKey !== sizeKey || state.lastOrientationKey !== orientKey) {
            state.lastSizeKey = sizeKey;
            state.lastOrientationKey = orientKey;

            injectCssVars();

            const strip = state.stripEl;
            const track = state.trackEl;
            if (strip && track) {
                track.style.transition = 'none';
                track.style.transform = 'translateY(-50%) translateX(0px)';
                rebuildTrackDOM();
                requestAnimationFrame(() => {
                    if (state.currentIndex >= 0) {
                        updateActive(state.currentIndex, false);
                    }
                });
            }
            return;
        }

        if (state.currentIndex >= 0) {
            centerOnIndex(state.currentIndex, false);
        }
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
        }, 100);

        schedule();
    }

    window.ImageBrowser = {
        state,
        config: C,
        builtin: BUILTIN,
        navigateTo, navigateNext, navigatePrev,
        detectNextButton, detectJumpMode,
        getNavButtons, findCurrentIndex,
        interruptMainImage, tryDirectJump,
        healThumbnails, fadeInMainImage, fadeOutMainImage,
        injectCssVars, getEffectiveThumbSize,
        mount, unmount,
        toggleCollapse,
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