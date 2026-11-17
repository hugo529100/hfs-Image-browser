exports.version = 6.2;
exports.apiRequired = 10.0;
exports.repo = "Hug3O/Image-browser";
exports.description = "High-efficiency Picasa-style image browser with thumbnail strip, progressive preview, and smart deferred loading.";
exports.depend = [{ "repo": "rejetto/thumbnails", "version": 4 }]
exports.frontend_js = ['main.js', 'fileshow-help-image.js'];
exports.frontend_css = ['style.css'];
exports.changelog = [
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
    { version: 6.1, message: "Touch drag vs. huge-image countdown: starting a drag now suspends any pending deferred load and any running huge-image countdown of the previously selected image (countdown disappears, nothing is downloaded), re-arms it on release only if you stay on that image, and lets navigateTo() start a fresh countdown for the image actually selected. doLoadMainImage() is now hardened: it refuses to load while dragging or when the requested index is no longer the selected one, so a stale schedule can never pull in the pre-drag image." },
    { version: 5.8, message: "Dragging the thumbnail strip updates the main viewer live again, but through a single reused overlay <img> instead of a full navigateTo(): images already shown in this session display at full resolution from cache, unseen ones show their already-decoded thumbnail instantly and upgrade to the original after a 180ms dwell (huge images stay on the thumbnail). The overlay is handed over to the normal loader and removed only once the real image is painted." },
    { version: 5.7, message: "Touch/mobile fix: dragging the thumbnail strip no longer runs a full navigation (pushState + HFS redraw + image swap + HEAD request) on every 60ms tick, no longer reads getBoundingClientRect() for every rendered thumb on each move, and no longer fights centerOnIndex()'s centering transition." },
    { version: 4.6, message: "Added 'Super Huge Image Threshold (MB)': images >= this size still follow countdown/gate, then render via Canvas local drawing for smooth zoom/pan. Configurable in backend." },
    { version: 4.4, message: "Removed preloadCount (conflicts with gate/countdown throttling)." },
    { version: 4.3, message: "Rearranged config dialog: 'Large Images' (threshold + countdown) first, 'Thumbnails' second." },
    { version: 4.2, message: "Added tabbed configuration dialog (General / Huge Images)." },
];

exports.init = api => {
    return {
        middleware: async ctx => {
            if (ctx.state.fileSource) {
                const ext = ctx.state.fileSource.substring(
                    ctx.state.fileSource.lastIndexOf('.')
                ).toLowerCase();
                const IMG_EXTS = [
                    '.jpg', '.jpeg', '.png', '.gif', '.webp',
                    '.bmp', '.svg', '.avif'
                ];
                if (IMG_EXTS.includes(ext)) {
                    ctx.set('X-Image-Viewer', '1');
                }
            }
        }
    };
};