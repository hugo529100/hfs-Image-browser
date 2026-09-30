exports.version = 2.8;
exports.apiRequired = 10.0;
exports.repo = "Hug3O/Image-browser";
exports.description = "Picasa-style image browser with bottom thumbnail strip.";
exports.depend = [{ "repo": "rejetto/thumbnails", "version": 4 }]
exports.frontend_js = ['main.js'];
exports.frontend_css = ['style.css'];

exports.config = {
    // ============================================================
    // Thumbnail size (desktop)
    // ============================================================
    thumbnailSize: {
        type: 'number', defaultValue: 10, min: 1, max: 200,
        label: "Thumbnail Size (desktop)",
        helperText: "Height of each thumbnail in the strip (desktop only). " +
                    "Unit is controlled by 'Thumbnail Size Unit' below. " +
                    "You can also use vh or vw.",
        frontend: true
    },

    // ============================================================
    // Thumbnail size unit (desktop)
    // ============================================================
    thumbnailSizeUnit: {
        type: 'select',
        defaultValue: 'vh',
        options: [
            { value: 'px', label: 'px (pixels)' },
            { value: 'vh', label: 'vh (viewport height)' },
            { value: 'vw', label: 'vw (viewport width)' }
        ],
        label: "Thumbnail Size Unit (desktop)",
        helperText: "Unit for the desktop thumbnail height. Choose px, vh, or vw.",
        frontend: true
    },

    // ============================================================
    // Thumbnail size (mobile, independent)
    // ============================================================
    mobileThumbnailSize: {
        type: 'number', defaultValue: 6, min: 1, max: 160,
        label: "Thumbnail Size (mobile)",
        helperText: "Height of each thumbnail in the strip on mobile screens " +
                    "(width <= 640px). Unit is controlled by " +
                    "'Mobile Thumbnail Size Unit' below. " +
                    "You can also use vh or vw.",
        frontend: true
    },

    // ============================================================
    // Thumbnail size unit (mobile)
    // ============================================================
    mobileThumbnailSizeUnit: {
        type: 'select',
        defaultValue: 'vh',
        options: [
            { value: 'px', label: 'px (pixels)' },
            { value: 'vh', label: 'vh (viewport height)' },
            { value: 'vw', label: 'vw (viewport width)' }
        ],
        label: "Mobile Thumbnail Size Unit",
        helperText: "Unit for the mobile thumbnail height. Choose px, vh, or vw.",
        frontend: true
    },

    // ============================================================
    // Preload
    // ============================================================
    preloadCount: {
        type: 'number', defaultValue: 3, min: 1, max: 10,
        label: "Preload Adjacent Images",
        helperText: "How many original images to preload on each side.",
        frontend: true
    }
};

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