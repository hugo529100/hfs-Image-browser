exports.version = 6.8;
exports.apiRequired = 10.0;
exports.repo = "hugo529100/hfs-Image-browser";
exports.description = "High-efficiency Picasa-style image browser with thumbnail strip, progressive preview, and smart deferred loading.";
exports.depend = [{ "repo": "rejetto/thumbnails", "version": 4 }]
exports.frontend_js = ['main.js', 'fileshow-help-image.js'];
exports.frontend_css = ['style.css'];
exports.changelog = [
    { version: 6.8, message: "Regression fix: 6.7 made the drag preview invisible. The drag layer used to carry the ib-progressive-preview style class, so the new 'other layers yield while dragging' rule also matched the drag layer itself and hid it - dragging then showed no image change at all. The drag layer now has its own .ib-drag-preview class (full styling included), so the yielding rule can only affect the real progressive preview, the canvas layer and HFS's .cover. The drag preview is visible again and the previous image can no longer leak through its letterbox." },
    { version: 6.7, message: "Drag artefact fix: while the drag-preview layer owns the main area, the previous image's progressive-preview layer, the super-huge canvas layer and HFS's .cover underlay are now hidden too (new .ib-drag-owned class on .file-show), and the drag layer paints the container background (background: inherit) so its letterbox is a clean backdrop. Previously, dragging onto an image with a different aspect ratio could reveal the still-alive previous layer through the letterbox, which looked like two differently-proportioned images stacked together." },
    { version: 6.6, message: "Stale-image artefact fix: the main <img class=showing> used to be un-hidden in several places (interceptShowingWithThumb, the native loader's onReady and the progressive-preview finalize) even while a preview layer was responsible for the display. During fast switching between images of different aspect ratios, a late 'image ready' event could therefore re-show the previously loaded big image, which appeared stacked behind/around the new preview. Every reveal now goes through one gate (revealShowingIfIdle), and while a preview layer is active a .ib-showing-hidden class on .file-show keeps every .showing hidden - including <img> nodes HFS inserts after a re-render. The class is re-synced on DOM changes and removed on unmount." },
    { version: 6.5, message: "No more accidental downloads for TIFF/TIFF/BMP/PSD: HFS serves those as image/tiff or application/octet-stream, so any document-level open (refresh, pull-to-refresh, new tab from HFS's Open link, or HFS's own location.reload()) made Chrome/Safari save the file instead of showing it. The plugin now answers such document requests (Accept: text/html) with a small viewer page that displays the '?convert=' JPEG; explicit '?dl' downloads and all ?get= / ?convert= resource requests are untouched. New option 'Open TIFF / BMP / PSD in the browser instead of downloading' (Large Images tab) to turn it off." },
    { version: 6.3, message: "Orientation / viewport fix: thumbnail geometry now comes from a single metrics snapshot (CSS variables and pad/centering math can no longer disagree), centerOnIndex() measures the real cell position, and every strip rebuild re-injects the CSS variables first. Rotating now resets zoom, drops the drag preview, waits for iOS to report the new size and rebuilds the strip for the new orientation; plain toolbar resizes only re-center. The super-huge Canvas layer survives the rebuild, so a rotated canvas image no longer goes black. Resize work is deferred while dragging." },
    { version: 6.1, message: "Touch drag vs. huge-image countdown: starting a drag now suspends any pending deferred load and any running huge-image countdown of the previously selected image (countdown disappears, nothing is downloaded), re-arms it on release only if you stay on that image, and lets navigateTo() start a fresh countdown for the image actually selected. doLoadMainImage() is now hardened: it refuses to load while dragging or when the requested index is no longer the selected one, so a stale schedule can never pull in the pre-drag image." },
    { version: 5.8, message: "Dragging the thumbnail strip updates the main viewer live again, but through a single reused overlay <img> instead of a full navigateTo(): images already shown in this session display at full resolution from cache, unseen ones show their already-decoded thumbnail instantly and upgrade to the original after a 180ms dwell (huge images stay on the thumbnail). The overlay is handed over to the normal loader and removed only once the real image is painted, so there is no black flash and no flash back to the previous image." },
    { version: 5.7, message: "Touch/mobile fix: dragging the thumbnail strip no longer runs a full navigation (pushState + HFS redraw + image swap + HEAD request) on every 60ms tick, no longer reads getBoundingClientRect() for every rendered thumb on each move, and no longer fights centerOnIndex()'s centering transition. Touchmove is now coalesced into one rAF transform write with arithmetic hit-testing; navigation is committed once on release. Also removed the strip's backdrop-filter blur, per-thumb will-change layers and per-switch transitions while dragging." },
    { version: 5.5, message: "First-open interception: original image src is swapped to its thumbnail (or a blank pixel) before mount, so huge images no longer block the viewer in a black screen; countdown/gate now overlays the thumbnail instead of a blank frame. Fixed folderUri/currentName derivation when showing.src was already replaced." },
    { version: 5.4, message: "Added 'Super Huge Image Threshold (MB)': images >= this size still follow countdown/gate, then render via Canvas local drawing for smooth zoom/pan. Configurable in backend." },
    { version: 4.6, message: "Added 'Super Huge Image Threshold (MB)': images >= this size still follow countdown/gate, then render via Canvas local drawing for smooth zoom/pan. Configurable in backend." },
    { version: 4.4, message: "Removed preloadCount (conflicts with gate/countdown throttling)." },
    { version: 4.3, message: "Rearranged config dialog: 'Large Images' (threshold + countdown) first, 'Thumbnails' second." },
    { version: 4.2, message: "Added tabbed configuration dialog (General / Huge Images)." },
];
exports.config = {
    // ============================================
    // === Configuration Group Selector ===
    // ============================================
    config_tab: {
        type: 'select',
        defaultValue: 'large',
        options: {
            '1. Large Images': 'large',
            '2. Thumbnails': 'thumbs'
        },
        label: "Configuration Category",
        helperText: "Select a category to view and edit settings.",
        frontend: true
    },

    // ============================================
    // === 1. Large Images ===
    // ============================================
    largeImagesHint: {
        showIf: x => x.config_tab === 'large',
        type: 'select',
        defaultValue: 'ok',
        options: [
            { value: 'ok', label: 'About temporary preview quality...' }
        ],
        label: "Temporary preview quality",
         helperText: "For a sharper temporary preview, in the 'thumbnails' plugin " +
                    "raise 'pixels' to 600 or above, turn 'EXIF' OFF, then clear " +
                    "the thumbnail cache and let thumbnails regenerate. The image " +
                    "browser reuses those ?get=thumb images as its progressive " +
                    "preview, so this directly improves temporary preview clarity.",
        frontend: true
    },

    hugeImageThresholdMb: {
        showIf: x => x.config_tab === 'large',
        type: 'number', defaultValue: 6, min: 1, max: 4096,
        label: "Large Image Threshold (MB)",
        helperText: "Images at or above this size (MB) will show a countdown " +
                    "overlay before the original is loaded. Keep this in sync with " +
                    "rejetto/thumbnails' own huge-image threshold if you use it. " +
                    "Default 8 MB.",
        frontend: true
    },

    hugeCountdownSeconds: {
        showIf: x => x.config_tab === 'large',
        type: 'number', defaultValue: 3, min: 1, max: 60,
        label: "Large Image Countdown (seconds)",
        helperText: "Countdown shown before loading an image whose size is at " +
                    "or above 'Large Image Threshold'. Applies uniformly to all " +
                    "large images. Default 3 seconds.",
        frontend: true
    },

    canvasThresholdMb: {
        showIf: x => x.config_tab === 'large',
        type: 'number', defaultValue: 60, min: 1, max: 4096,
        label: "Super Huge Image Threshold (MB)",
        helperText: "Images at or above this size (MB) still follow the normal " +
                    "countdown/gate flow, but after the gate opens they are " +
                    "rendered with Canvas local drawing for smooth zoom/pan. " +
                    "Independent from 'Large Image Threshold'. Default 60 MB.",
        frontend: true
    },

    directOpenViewer: {
        showIf: x => x.config_tab === 'large',
        type: 'boolean', defaultValue: true,
        label: "Open TIFF / BMP / PSD in the browser instead of downloading",
        helperText: "When one of these files is opened as a page (refresh, " +
                    "new tab, HFS's Open, or an accidental browser reload), HFS " +
                    "would send image/tiff / application/octet-stream, so " +
                    "Chrome and Safari download the file instead of showing it. " +
                    "With this on, a small viewer page is served instead, using " +
                    "the '?convert=' conversion of the TIFF-Support / " +
                    "Bmp-support / Psd-support plugins. Explicit downloads " +
                    "('?dl') are never affected.",
        frontend: true
    },

    // ============================================
    // === 2. Thumbnails ===
    // ============================================
    thumbnailSize: {
        showIf: x => x.config_tab === 'thumbs',
        type: 'number', defaultValue: 54, min: 1, max: 200,
        label: "Thumbnail Size (desktop)",
        helperText: "Height of each thumbnail in the strip (desktop only). " +
                    "Unit is controlled by 'Thumbnail Size Unit' below. " +
                    "You can also use vh or vw. Default 54 px .",
        frontend: true
    },

    thumbnailSizeUnit: {
        showIf: x => x.config_tab === 'thumbs',
        type: 'select',
        defaultValue: 'px',
        options: [
            { value: 'px', label: 'px (pixels)' },
            { value: 'vh', label: 'vh (viewport height)' },
            { value: 'vw', label: 'vw (viewport width)' }
        ],
        label: "Thumbnail Size Unit (desktop)",
        helperText: "Unit for the desktop thumbnail height. Choose px, vh, or vw.",
        frontend: true
    },

    mobileThumbnailSize: {
        showIf: x => x.config_tab === 'thumbs',
        type: 'number', defaultValue: 48, min: 1, max: 160,
        label: "Thumbnail Size (mobile)",
        helperText: "Height of each thumbnail in the strip on mobile screens " +
                    "(width <= 640px). Unit is controlled by " +
                    "'Mobile Thumbnail Size Unit' below. " +
                    "You can also use vh or vw. Default 48 px .",
        frontend: true
    },

    mobileThumbnailSizeUnit: {
        showIf: x => x.config_tab === 'thumbs',
        type: 'select',
        defaultValue: 'px',
        options: [
            { value: 'px', label: 'px (pixels)' },
            { value: 'vh', label: 'vh (viewport height)' },
            { value: 'vw', label: 'vw (viewport width)' }
        ],
        label: "Mobile Thumbnail Size Unit",
        helperText: "Unit for the mobile thumbnail height. Choose px, vh, or vw.",
        frontend: true
    }
};

exports.configDialog = {
    maxWidth: 'md',
};

exports.changelog = [
    { version: 6.8, message: "Regression fix: 6.7 made the drag preview invisible. The drag layer used to carry the ib-progressive-preview style class, so the new 'other layers yield while dragging' rule also matched the drag layer itself and hid it - dragging then showed no image change at all. The drag layer now has its own .ib-drag-preview class (full styling included), so the yielding rule can only affect the real progressive preview, the canvas layer and HFS's .cover. The drag preview is visible again and the previous image can no longer leak through its letterbox." },
    { version: 6.7, message: "Drag artefact fix: while the drag-preview layer owns the main area, the previous image's progressive-preview layer, the super-huge canvas layer and HFS's .cover underlay are now hidden too (new .ib-drag-owned class on .file-show), and the drag layer paints the container background (background: inherit) so its letterbox is a clean backdrop. Previously, dragging onto an image with a different aspect ratio could reveal the still-alive previous layer through the letterbox, which looked like two differently-proportioned images stacked together." },
    { version: 6.6, message: "Stale-image artefact fix: the main <img class=showing> used to be un-hidden in several places (interceptShowingWithThumb, the native loader's onReady and the progressive-preview finalize) even while a preview layer was responsible for the display. During fast switching between images of different aspect ratios, a late 'image ready' event could therefore re-show the previously loaded big image, which appeared stacked behind/around the new preview. Every reveal now goes through one gate (revealShowingIfIdle), and while a preview layer is active a .ib-showing-hidden class on .file-show keeps every .showing hidden - including <img> nodes HFS inserts after a re-render. The class is re-synced on DOM changes and removed on unmount." },
    { version: 6.5, message: "No more accidental downloads for TIFF/TIFF/BMP/PSD: HFS serves those as image/tiff or application/octet-stream, so any document-level open (refresh, pull-to-refresh, new tab from HFS's Open link, or HFS's own location.reload()) made Chrome/Safari save the file instead of showing it. The plugin now answers such document requests (Accept: text/html) with a small viewer page that displays the '?convert=' JPEG; explicit '?dl' downloads and all ?get= / ?convert= resource requests are untouched. New option 'Open TIFF / BMP / PSD in the browser instead of downloading' (Large Images tab) to turn it off." },
    { version: 6.3, message: "Orientation / viewport fix: thumbnail geometry now comes from a single metrics snapshot (CSS variables and pad/centering math can no longer disagree), centerOnIndex() measures the real cell position, and every strip rebuild re-injects the CSS variables first. Rotating now resets zoom, drops the drag preview, waits for iOS to report the new size and rebuilds the strip for the new orientation; plain toolbar resizes only re-center. The super-huge Canvas layer survives the rebuild, so a rotated canvas image no longer goes black. Resize work is deferred while dragging." },
    { version: 6.1, message: "Touch drag vs. huge-image countdown: starting a drag now suspends any pending deferred load and any running huge-image countdown of the previously selected image (countdown disappears, nothing is downloaded), re-arms it on release only if you stay on that image, and lets navigateTo() start a fresh countdown for the image actually selected. doLoadMainImage() is now hardened: it refuses to load while dragging or when the requested index is no longer the selected one, so a stale schedule can never pull in the pre-drag image." },
    { version: 5.8, message: "Dragging the thumbnail strip updates the main viewer live again, but through a single reused overlay <img> instead of a full navigateTo(): images already shown in this session display at full resolution from cache, unseen ones show their already-decoded thumbnail instantly and upgrade to the original after a 180ms dwell (huge images stay on the thumbnail). The overlay is handed over to the normal loader and removed only once the real image is painted." },
    { version: 5.7, message: "Touch/mobile fix: dragging the thumbnail strip no longer runs a full navigation (pushState + HFS redraw + image swap + HEAD request) on every 60ms tick, no longer reads getBoundingClientRect() for every rendered thumb on each move, and no longer fights centerOnIndex()'s centering transition." },
    { version: 4.6, message: "Added 'Super Huge Image Threshold (MB)': images >= this size still follow countdown/gate, then render via Canvas local drawing for smooth zoom/pan. Configurable in backend." },
    { version: 4.4, message: "Removed preloadCount (conflicts with gate/countdown throttling)." },
    { version: 4.3, message: "Rearranged config dialog: 'Large Images' (threshold + countdown) first, 'Thumbnails' second." },
    { version: 4.2, message: "Added tabbed configuration dialog (General / Huge Images)." },
];

exports.init = api => {
    const IMG_EXTS = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp',
        '.bmp', '.svg', '.avif'
    ];

    // 瀏覽器無法直接顯示、必須先轉檔的格式。
    // 轉檔由 TIFF-Support / Bmp-support / Psd-support 的 ?convert= 提供。
    const CONVERTIBLE = {
        '.tif': 'tiff',
        '.tiff': 'tiff',
        '.bmp': 'bmp',
        '.psd': 'psd'
    };

    function extOf(p) {
        const s = String(p || '');
        const i = s.lastIndexOf('.');
        return i < 0 ? '' : s.slice(i).toLowerCase();
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function baseName(p) {
        const s = String(p || '');
        const name = s.slice(s.lastIndexOf('/') + 1);
        try { return decodeURIComponent(name); } catch (e) { return name; }
    }

    // ============================================================
    // 直接開啟 TIFF / BMP / PSD 時不要讓瀏覽器「下載」
    //
    // HFS 對這些檔案回的是 image/tiff、image/vnd.adobe.photoshop 等
    // 瀏覽器無法顯示的類型。放在 <img> 裡沒問題（我們的 viewer 用的是
    // ?convert= 轉出來的 JPEG），但只要發生「文件層級」的開啟：
    //   - 重新整理 / 下拉重新載入
    //   - 另開分頁（HFS 的 Open 是 <a target="_blank" href="x.tif">）
    //   - HFS 自己的 location.reload()（例如 405 download_starting）
    // Chrome / Safari 就會把原檔存下來 → 使用者看到「莫名其妙的下載」。
    // 這裡在「文件導覽」(Accept: text/html) 時改回一個極簡檢視頁，
    // 顯示轉檔後的 JPEG，永遠不會觸發下載。
    // ============================================================
    function directOpenHtml(path, kind) {
        const sep = path.includes('?') ? '&' : '?';
        const src = esc(path + sep + 'convert=' + kind);
        const dl = esc(path + sep + 'dl');
        const name = esc(baseName(path));
        return '<!doctype html>\n' +
            '<html lang="zh-Hant"><head>\n' +
            '<meta charset="utf-8">\n' +
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
            '<title>' + name + '</title>\n' +
            '<style>\n' +
            'html,body{margin:0;height:100%;background:#111;color:#eaeaea;' +
            'font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}\n' +
            'body{display:flex;align-items:center;justify-content:center;overflow:hidden}\n' +
            'img{max-width:100%;max-height:100%;object-fit:contain;display:block}\n' +
            '.fail{position:fixed;inset:0;display:none;flex-direction:column;align-items:center;' +
            'justify-content:center;gap:.5em;padding:1em;text-align:center}\n' +
            'body.failed .fail{display:flex}\n' +
            'body.failed img{display:none}\n' +
            'a{color:#6ab0ff}\n' +
            '</style></head><body>\n' +
            '<img id="v" src="' + src + '" alt="' + name + '">\n' +
            '<div class="fail"><div>無法預覽 ' + name + '</div>' +
            '<div><a href="' + dl + '">下載原始檔</a></div></div>\n' +
            '<script>var v=document.getElementById("v");' +
            'v.onerror=function(){document.body.className="failed"};</script>\n' +
            '</body></html>';
    }

    function wantsViewerFor(ext, query, accept) {
        if (!CONVERTIBLE[ext]) return '';
        // 明確的下載（?dl）與資源請求（?get= / ?convert=）一律放行
        if (query.dl !== undefined) return '';
        if (query.get !== undefined) return '';
        if (query.convert !== undefined) return '';
        // 只有「文件導覽」才攔：<img> / fetch / XHR 不會帶 text/html
        if (!String(accept || '').toLowerCase().includes('text/html')) return '';
        return CONVERTIBLE[ext];
    }

    return {
        middleware: ctx => async () => {
            // 整段包 try/catch：這裡只是「避免下載」的加分功能，
            // 任何例外都不該讓正常的檔案請求失敗。
            try {
                const path = ctx.path || '';
                const ext = extOf(path);

                if (IMG_EXTS.includes(ext)) {
                    ctx.set('X-Image-Viewer', '1');
                }

                let conf = {};
                try { conf = api.getConfig() || {}; } catch (e) { }
                if (conf.directOpenViewer === false) return;

                let accept = '';
                try { accept = ctx.get('accept') || ''; } catch (e) {
                    accept = (ctx.request && ctx.request.headers && ctx.request.headers.accept) || '';
                }

                const kind = wantsViewerFor(ext, ctx.query || {}, accept);
                if (!kind) return;

                // 讓 HFS 已經開好的檔案串流收掉，避免檔案句柄殘留
                if (ctx.body && typeof ctx.body.destroy === 'function') {
                    try { ctx.body.destroy(); } catch (e) { }
                }

                const html = directOpenHtml(path, kind);
                ctx.status = 200;
                ctx.type = 'text/html; charset=utf-8';
                ctx.set('Content-Disposition', 'inline');
                ctx.set('Cache-Control', 'no-store');
                ctx.set('Content-Length', String(Buffer.byteLength(html)));
                ctx.body = html;
                return ctx.stop();
            } catch (e) {
                try { api.log('Image-browser: direct-open viewer failed', e); } catch (e2) { }
            }
        }
    };
};