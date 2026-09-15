exports.version = 2.5;
exports.apiRequired = 10.0;
exports.repo = "Hug3O/Image-browser";
exports.description = "Picasa-style image browser with bottom thumbnail strip.";
exports.frontend_js = ['main.js'];
exports.frontend_css = ['style.css'];

exports.config = {
    // ============================================================
    // Thumbnail size (desktop)
    // ============================================================
    thumbnailSize: {
        type: 'number', defaultValue: 80, min: 40, max: 200,
        label: "Thumbnail Size (px, desktop)",
        helperText: "Height of each thumbnail in the strip (desktop only).",
        frontend: true
    },

    // ============================================================
    // Thumbnail size (mobile, independent)
    // ============================================================
    mobileThumbnailSize: {
        type: 'number', defaultValue: 46, min: 32, max: 160,
        label: "Thumbnail Size (px, mobile)",
        helperText: "Height of each thumbnail in the strip on mobile screens (width <= 640px).",
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