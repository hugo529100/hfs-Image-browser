exports.version = 8.0;
exports.apiRequired = 10.1;
exports.repo = "hugo529100/hfs-Image-browser";
exports.description = "High-efficiency Picasa-style image browser with thumbnail strip, progressive preview, and smart deferred loading.";
exports.depend = [{ "repo": "rejetto/thumbnails", "version": 4 }]
exports.frontend_js = ['main.js', 'fileshow-help-image.js'];
exports.frontend_css = ['style.css'];
exports.changelog = [
    { version: 8.0, message: "Resolution / aspect / megapixels in the file-info bar: (1) they now update the moment the original image finishes loading - previously the info was only recomputed on the next click; (2) while the original is not loaded the plugin asks the backend for the size - a new ?ib_meta=1 endpoint reads only the first 256 KB of the file header (jpg/png/gif/webp/bmp/tif/psd, cached per path+size+mtime), so the values appear immediately even in thumbnail mode; (3) until they are known the three fields render dimmed (.ib-meta-unknown) and switch back to the normal colour once known. The canvas path records the decoded dimensions too, and the comparison now uses the effective URL so ?convert= formats (tif/bmp/psd) work." },
    { version: 7.9, message: "Viewer backdrop is now an opaque solid colour that follows the active theme's light/dark palette. HFS painted .file-show as rgba(136,136,136,.933) and the Orange theme paints the showing container as rgba(0,0,0,.8), so the whole screen was blended every frame. The plugin now paints both with the theme's own --deepprevew (light #dbdbdb, dark #000) and, when that variable is missing, derives a neutral tone from --bg / --text (near-white in light mode, near-black in dark mode), with a fixed fallback for older browsers. backdrop-filter stays off and the thumbnail strip is solid black instead of 95% black." },
    { version: 7.8, message: "Delete-then-advance fix: after deleting an image HFS switches the <img class=showing> to the next file, but the previous progressive-preview layer was still bound to that same <img> with the deleted image as its target, so its finalize never matched the new image and the main area kept showing the old one. The plugin now hands the preview over whenever HFS changes the image itself (new src detected in the DOM): stale previews are cleared and the new image gets its own thumbnail, or is revealed directly when already loaded. It also notices that HFS's folder list changed (deletion/addition), re-fetches the image list, re-resolves the current index from the displayed file name and rebuilds the strip, so the dead thumbnail no longer lingers and indices stay aligned." },
    { version: 7.7, message: "Config wording: dropped the Chinese word from the thumbnail settings' helper texts. They now simply read 'Recommended: pixels 600~800' and 'Recommended: quality 80~95', and the note under them says 'Recommended: pixels 600~800, quality 80~95'." },
    { version: 7.6, message: "Thumbnail preview settings in the panel: three new fields at the top of the Large Images tab (above the temporary-preview note) - pixels (default 800, recommended 600~800), quality (default 95, recommended 80~95) and regenerateBefore. They are the thumbnails plugin's settings, whose ?get=thumb images the browser reuses as temporary previews. On page load an admin session merges them into the thumbnails plugin through the official get_plugin / set_plugin API - only when they differ, and without touching its other keys - so they can be tuned here. After changing pixels or quality, bump regenerateBefore (or clear the thumbnail cache) so existing thumbnails are rebuilt." },
    { version: 7.5, message: "Countdown-load button styling: removed the custom semi-transparent 'off' look. Both modes now use HFS's native button appearance only - the countdown mode (\u24B8) uses the native toggled/pressed style, the thumbnail mode (\u24C9) is a plain native button - and the glyph alone tells you which mode is active." },
    { version: 7.4, message: "Countdown-load is now a two-state mode switch whose icon shows the active mode: circled-C = countdown mode (large images count down, then the original loads), circled-T = thumbnail mode (countdown disabled, nothing preloaded). The default is now thumbnail mode and the choice is stored under ib.loadMode; the old ib.countdownLoad key is no longer read, so every browser starts in thumbnail mode once and then remembers what you pick. The help page documents both glyphs, the new default and how to get the high-resolution image in thumbnail mode." },
    { version: 7.3, message: "Turning Countdown-load back on now starts the countdown for the current image immediately (it used to wait for the settle delay first). With the toggle off, navigating to a large image still shows only the thumbnail; pressing the button then pops the countdown right away, and the original loads when it finishes. Non-huge images are loaded directly when the toggle is turned back on." },
    { version: 7.2, message: "Zoom now pulls in the high-resolution image: pressing the toolbar + / keyboard + or pinching in triggers the normal loading flow for the current image even while Countdown-load is off (huge images show the countdown first, other images load after the settle delay). The progressive-preview layer receives the same zoom transform, so zooming a thumbnail gives immediate feedback instead of nothing until the full image arrives. Already-loaded, already-scheduled or already-counting-down images are not re-triggered, and a pinch requests it only once per gesture." },
    { version: 7.1, message: "Countdown-load glyph centering: the circled-C is now wrapped in its own flex-centred <span> (and the redundant font-size / line-height overrides are gone), so it sits exactly in the middle of the toolbar button like the help button's '?'. The stray leading variation selector (U+FE0E) was dropped, so the icon is a single character and cannot be nudged sideways by an invisible advance." },
    { version: 7.0, message: "Countdown-load polish: the toolbar button's title and aria-label are now capitalised ('Countdown-load'), and the in-app File Show help documents it - a new row plus notes in 'Large Images' (what ON/OFF do, and that the state is remembered in this browser) and a 'Touch Devices' row explaining that tapping the main preview loads the high-resolution image while Countdown-load is off." },
    { version: 6.9, message: "New Countdown-load toggle: a circled-C button (title 'Countdown-load') sits just left of the Auto-play button in the file-show toolbar and is remembered in localStorage. ON (default) keeps the current behaviour (settle delay / huge-image countdown, then automatic load). OFF: no countdown and no preloading at all - every image stays on its thumbnail as the temporary main image, and clicking the main area (or the same thumbnail again) loads the original immediately without a countdown. The drag preview's 'dwell upgrade' is disabled while off too, and the button is re-inserted automatically if HFS re-renders the toolbar." },
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
    // ── 縮圖品質（這三項會套用到 rejetto/thumbnails 外掛）──────────
    // Image-browser 的暫時預覽圖就是 thumbnails 的 ?get=thumb，
    // 所以在這裡直接調最方便。以管理員身分載入檔案頁面時，
    // 前端會用官方 get_plugin / set_plugin API 把這裡的值合併寫進
    // thumbnails 外掛（不會動到其他欄位）。
    pixels: {
        showIf: x => x.config_tab === 'large',
        type: 'number', defaultValue: 800, min: 10, max: 2000,
        unit: 'pixels',
        label: "pixels - thumbnail size (preview source)",
        helperText: "Longest side of the thumbnails that the browser reuses as " +
                    "temporary previews. Recommended: pixels 600~800 - " +
                    "sharp enough for the preview, still fast to generate. " +
                    "Values above ~1000 slow down the first generation and grow " +
                    "the cache.",
        frontend: true
    },

    quality: {
        showIf: x => x.config_tab === 'large',
        type: 'number', defaultValue: 95, min: 1, max: 100,
        label: "quality - thumbnail JPEG quality",
        helperText: "JPEG quality of the generated thumbnails. " +
                    "Recommended: quality 80~95 - 100 is best quality but " +
                    "bigger files and slower generation.",
        frontend: true
    },

    regenerateBefore: {
        showIf: x => x.config_tab === 'large',
        type: 'date_time', defaultValue: '2026-11-12T00:34:25.652Z',
        label: "regenerateBefore - thumbnail cache invalidation",
        helperText: "Thumbnails older than this are regenerated on the next " +
                    "request. After changing pixels or quality, set it to now " +
                    "(or clear the thumbnail cache in the thumbnails plugin) so " +
                    "existing thumbnails are rebuilt.",
        frontend: true
    },

    largeImagesHint: {
        showIf: x => x.config_tab === 'large',
        type: 'select',
        defaultValue: 'ok',
        options: [
            { value: 'ok', label: 'About temporary preview quality...' }
        ],
        label: "Temporary preview quality",
         helperText: "The three values above are applied to the 'thumbnails' plugin " +
                    "(the browser reuses its ?get=thumb images as progressive " +
                    "previews). Recommended: pixels 600~800, quality 80~95. " +
                    "Turning EXIF OFF in the thumbnails plugin also helps clarity. " +
                    "After changing them, refresh 'regenerateBefore' so old " +
                    "thumbnails are rebuilt. Changes take effect after reloading " +
                    "the file browser page.",
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
    { version: 8.0, message: "Resolution / aspect / megapixels in the file-info bar: (1) they now update the moment the original image finishes loading - previously the info was only recomputed on the next click; (2) while the original is not loaded the plugin asks the backend for the size - a new ?ib_meta=1 endpoint reads only the first 256 KB of the file header (jpg/png/gif/webp/bmp/tif/psd, cached per path+size+mtime), so the values appear immediately even in thumbnail mode; (3) until they are known the three fields render dimmed (.ib-meta-unknown) and switch back to the normal colour once known. The canvas path records the decoded dimensions too, and the comparison now uses the effective URL so ?convert= formats (tif/bmp/psd) work." },
    { version: 7.9, message: "Viewer backdrop is now an opaque solid colour that follows the active theme's light/dark palette. HFS painted .file-show as rgba(136,136,136,.933) and the Orange theme paints the showing container as rgba(0,0,0,.8), so the whole screen was blended every frame. The plugin now paints both with the theme's own --deepprevew (light #dbdbdb, dark #000) and, when that variable is missing, derives a neutral tone from --bg / --text (near-white in light mode, near-black in dark mode), with a fixed fallback for older browsers. backdrop-filter stays off and the thumbnail strip is solid black instead of 95% black." },
    { version: 7.8, message: "Delete-then-advance fix: after deleting an image HFS switches the <img class=showing> to the next file, but the previous progressive-preview layer was still bound to that same <img> with the deleted image as its target, so its finalize never matched the new image and the main area kept showing the old one. The plugin now hands the preview over whenever HFS changes the image itself (new src detected in the DOM): stale previews are cleared and the new image gets its own thumbnail, or is revealed directly when already loaded. It also notices that HFS's folder list changed (deletion/addition), re-fetches the image list, re-resolves the current index from the displayed file name and rebuilds the strip, so the dead thumbnail no longer lingers and indices stay aligned." },
    { version: 7.7, message: "Config wording: dropped the Chinese word from the thumbnail settings' helper texts. They now simply read 'Recommended: pixels 600~800' and 'Recommended: quality 80~95', and the note under them says 'Recommended: pixels 600~800, quality 80~95'." },
    { version: 7.6, message: "Thumbnail preview settings in the panel: three new fields at the top of the Large Images tab (above the temporary-preview note) - pixels (default 800, recommended 600~800), quality (default 95, recommended 80~95) and regenerateBefore. They are the thumbnails plugin's settings, whose ?get=thumb images the browser reuses as temporary previews. On page load an admin session merges them into the thumbnails plugin through the official get_plugin / set_plugin API - only when they differ, and without touching its other keys - so they can be tuned here. After changing pixels or quality, bump regenerateBefore (or clear the thumbnail cache) so existing thumbnails are rebuilt." },
    { version: 7.5, message: "Countdown-load button styling: removed the custom semi-transparent 'off' look. Both modes now use HFS's native button appearance only - the countdown mode (\u24B8) uses the native toggled/pressed style, the thumbnail mode (\u24C9) is a plain native button - and the glyph alone tells you which mode is active." },
    { version: 7.4, message: "Countdown-load is now a two-state mode switch whose icon shows the active mode: circled-C = countdown mode (large images count down, then the original loads), circled-T = thumbnail mode (countdown disabled, nothing preloaded). The default is now thumbnail mode and the choice is stored under ib.loadMode; the old ib.countdownLoad key is no longer read, so every browser starts in thumbnail mode once and then remembers what you pick. The help page documents both glyphs, the new default and how to get the high-resolution image in thumbnail mode." },
    { version: 7.3, message: "Turning Countdown-load back on now starts the countdown for the current image immediately (it used to wait for the settle delay first). With the toggle off, navigating to a large image still shows only the thumbnail; pressing the button then pops the countdown right away, and the original loads when it finishes. Non-huge images are loaded directly when the toggle is turned back on." },
    { version: 7.2, message: "Zoom now pulls in the high-resolution image: pressing the toolbar + / keyboard + or pinching in triggers the normal loading flow for the current image even while Countdown-load is off (huge images show the countdown first, other images load after the settle delay). The progressive-preview layer receives the same zoom transform, so zooming a thumbnail gives immediate feedback instead of nothing until the full image arrives. Already-loaded, already-scheduled or already-counting-down images are not re-triggered, and a pinch requests it only once per gesture." },
    { version: 7.1, message: "Countdown-load glyph centering: the circled-C is now wrapped in its own flex-centred <span> (and the redundant font-size / line-height overrides are gone), so it sits exactly in the middle of the toolbar button like the help button's '?'. The stray leading variation selector (U+FE0E) was dropped, so the icon is a single character and cannot be nudged sideways by an invisible advance." },
    { version: 7.0, message: "Countdown-load polish: the toolbar button's title and aria-label are now capitalised ('Countdown-load'), and the in-app File Show help documents it - a new row plus notes in 'Large Images' (what ON/OFF do, and that the state is remembered in this browser) and a 'Touch Devices' row explaining that tapping the main preview loads the high-resolution image while Countdown-load is off." },
    { version: 6.9, message: "New Countdown-load toggle: a circled-C button (title 'Countdown-load') sits just left of the Auto-play button in the file-show toolbar and is remembered in localStorage. ON (default) keeps the current behaviour (settle delay / huge-image countdown, then automatic load). OFF: no countdown and no preloading at all - every image stays on its thumbnail as the temporary main image, and clicking the main area (or the same thumbnail again) loads the original immediately without a countdown. The drag preview's 'dwell upgrade' is disabled while off too, and the button is re-inserted automatically if HFS re-renders the toolbar." },
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
    // 影像尺寸查詢：只讀檔頭，不串流整個檔案
    //
    // 前端在「原圖還沒載入」時就想要 Ⓡ/Ⓐ/Ⓟ（解析度／比例／百萬像素）。
    // 這裡直接讀檔頭（最多 256 KB）解析尺寸，I/O 極小、也不必把原圖
    // 下載到瀏覽器。支援 jpg / png / gif / webp / bmp / tif / psd。
    // 用法：GET <檔案路徑>?ib_meta=1 → {"w":4072,"h":2280}（失敗回 {}）
    // ============================================================
    const META_HEAD_BYTES = 256 * 1024;
    const META_CACHE_MAX = 800;
    const metaCache = new Map();

    function jpegSize(buf) {
        let off = 2;                                    // skip SOI (FFD8)
        while (off + 4 < buf.length) {
            if (buf[off] !== 0xFF) { off++; continue; }
            const m = buf[off + 1];
            if (m === 0xFF) { off++; continue; }        // fill byte
            if (m === 0x01 || m === 0xD8 || (m >= 0xD0 && m <= 0xD7)) { off += 2; continue; }
            if (off + 4 > buf.length) return null;
            const len = buf.readUInt16BE(off + 2);
            const isSOF = m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC;
            if (isSOF) {
                if (off + 9 > buf.length) return null;
                return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
            }
            if (len < 2) return null;
            off += 2 + len;
        }
        return null;
    }

    function webpSize(buf) {
        if (buf.length < 30) return null;
        if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
        const type = buf.toString('ascii', 12, 16);
        if (type === 'VP8 ') {
            return {
                w: buf.readUInt16LE(26) & 0x3fff,
                h: buf.readUInt16LE(28) & 0x3fff,
            };
        }
        if (type === 'VP8L' && buf.length >= 25) {
            const bits = buf.readUInt32LE(21);
            return {
                w: (bits & 0x3fff) + 1,
                h: ((bits >> 14) & 0x3fff) + 1,
            };
        }
        if (type === 'VP8X' && buf.length >= 30) {
            return {
                w: buf.readUIntLE(24, 3) + 1,
                h: buf.readUIntLE(27, 3) + 1,
            };
        }
        return null;
    }

    function tiffSize(buf) {
        if (buf.length < 8) return null;
        const le = buf.toString('ascii', 0, 2) === 'II';
        const u16 = o => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const u32 = o => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        if (u16(2) !== 42) return null;
        const ifd = u32(4);
        if (ifd + 2 > buf.length) return null;
        const n = u16(ifd);
        let w = 0, h = 0;
        for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (e + 12 > buf.length) break;
            const tag = u16(e);
            if (tag !== 256 && tag !== 257) continue;
            const type = u16(e + 2);
            let val = 0;
            if (type === 3) val = u16(e + 8);
            else if (type === 4) val = u32(e + 8);
            else continue;
            if (tag === 256) w = val; else h = val;
        }
        return (w && h) ? { w, h } : null;
    }

    function parseImageSize(ext, buf) {
        try {
            if (!buf || buf.length < 16) return null;
            if (ext === '.jpg' || ext === '.jpeg') return jpegSize(buf);
            if (ext === '.png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
            if (ext === '.gif') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
            if (ext === '.webp') return webpSize(buf);
            if (ext === '.bmp' && buf.length >= 26) {
                return { w: buf.readInt32LE(18), h: Math.abs(buf.readInt32LE(22)) };
            }
            if (ext === '.tif' || ext === '.tiff') return tiffSize(buf);
            if (ext === '.psd' && buf.length >= 22) {
                return { w: buf.readUInt32BE(18), h: buf.readUInt32BE(14) };
            }
        } catch (e) { }
        return null;
    }

    async function readImageSize(ctx) {
        const src = ctx.state && ctx.state.fileSource;
        if (!src) return null;
        const ext = extOf(ctx.path || '');
        const stats = (ctx.state && ctx.state.fileStats) || null;
        const key = String(src) + '|' + (stats ? (stats.size + '|' + stats.mtimeMs) : '');
        if (metaCache.has(key)) return metaCache.get(key);

        let res = null;
        try {
            const fs = api.require('fs');
            const fh = await fs.promises.open(src, 'r');
            try {
                const size = (stats && stats.size) ? stats.size : (await fh.stat()).size;
                const want = Math.max(16, Math.min(Number(size) || META_HEAD_BYTES, META_HEAD_BYTES));
                const buf = Buffer.alloc(want);
                await fh.read(buf, 0, want, 0);
                res = parseImageSize(ext, buf);
            } finally {
                try { await fh.close(); } catch (e) { }
            }
        } catch (e) {
            res = null;
        }
        if (res && !(res.w > 0 && res.h > 0 && res.w < 200000 && res.h < 200000)) res = null;
        if (metaCache.size >= META_CACHE_MAX) metaCache.clear();
        metaCache.set(key, res);
        return res;
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

                // 影像尺寸查詢（?ib_meta=1）：只讀檔頭，取代原本的下載整張圖
                if (ctx.query && ctx.query.ib_meta !== undefined) {
                    const size = await readImageSize(ctx);
                    if (ctx.body && typeof ctx.body.destroy === 'function') {
                        try { ctx.body.destroy(); } catch (e) { }
                    }
                    try { ctx.state.dontLog = true; } catch (e) { }
                    const json = JSON.stringify(size || {});
                    ctx.status = 200;
                    ctx.type = 'application/json; charset=utf-8';
                    ctx.set('Cache-Control', 'no-store');
                    ctx.set('Content-Length', String(Buffer.byteLength(json)));
                    ctx.body = json;
                    return ctx.stop();
                }

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