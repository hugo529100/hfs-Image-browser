'use strict';
(function () {
    const HELP_TITLE = 'Image Browser Help';
    const STYLE_ID = 'ib-help-image-style';
    const HELP_ICON = 'Ⓗ\uFE0E';
    const HELP_TITLE_ATTR = 'Image Browser Help';

    // ============================================================
    // ★ 說明書開啟時的事件隔離
    // ============================================================
    let helpSession = null;

    function isInsideHelpDialog(target) {
        if (!target || !target.closest) return false;
        return !!target.closest('.ibhi-backdrop, .ibhi-dialog, .ibhi-help');
    }

    function onHelpWheelCapture(e) {
        if (isInsideHelpDialog(e.target)) {
            e.stopPropagation();
        }
    }
    function onHelpKeyCapture(e) {
        if (!helpSession) return;
        if (isInsideHelpDialog(e.target) || isInsideHelpDialog(document.activeElement)) {
            if (e.key !== 'Escape') {
                e.stopPropagation();
            }
        }
    }
    function onHelpTouchCapture(e) {
        if (isInsideHelpDialog(e.target)) {
            e.stopPropagation();
        }
    }

    function enterHelpSession() {
        if (helpSession) return;
        helpSession = {};

        document.addEventListener('wheel', onHelpWheelCapture, { capture: true, passive: true });
        document.addEventListener('keydown', onHelpKeyCapture, true);
        document.addEventListener('touchstart', onHelpTouchCapture, { capture: true, passive: true });
        document.addEventListener('touchmove', onHelpTouchCapture, { capture: true, passive: true });
        document.addEventListener('touchend', onHelpTouchCapture, { capture: true, passive: true });
    }

    function exitHelpSession() {
        if (!helpSession) return;
        helpSession = null;

        document.removeEventListener('wheel', onHelpWheelCapture, { capture: true });
        document.removeEventListener('keydown', onHelpKeyCapture, true);
        document.removeEventListener('touchstart', onHelpTouchCapture, { capture: true });
        document.removeEventListener('touchmove', onHelpTouchCapture, { capture: true });
        document.removeEventListener('touchend', onHelpTouchCapture, { capture: true });
    }

    // ============================================================

    function isImageMode() {
        const viewer = document.querySelector('.file-show');
        if (!viewer) return false;
        const container = viewer.querySelector('.showing-container');
        if (!container) return false;
        if (container.querySelector('.vjs-player-wrapper, video.vjs-tech, .video-js')) return false;
        if (container.querySelector('video')) return false;
        return !!container.querySelector('img.showing');
    }

    function getHelpButtons() {
        return document.querySelectorAll('.file-show .bar button.icon-button');
    }

    function patchHelpButton(btn) {
        if (!btn) return;
        const txt = (btn.textContent || '').trim();
        const title = btn.getAttribute('title') || '';
        const isHelp = txt === '?' || title === '?';
        if (!isHelp) return;
        if (!isImageMode()) return;

        if (btn.textContent !== HELP_ICON) {
            btn.textContent = HELP_ICON;
        }
        if (btn.getAttribute('title') !== HELP_TITLE_ATTR) {
            btn.setAttribute('title', HELP_TITLE_ATTR);
        }
        if (btn.dataset.ibHelpImage === undefined) {
            btn.dataset.ibHelpImage = '1';
        }
    }

    function patchAllHelpButtons() {
        if (!isImageMode()) return;
        getHelpButtons().forEach(patchHelpButton);
    }

    function isHelpButton(btn) {
        if (!btn) return false;
        if (btn.dataset && btn.dataset.ibHelpImage === '1') return true;
        const txt = (btn.textContent || '').trim();
        const title = btn.getAttribute('title') || '';
        return txt === '?' || txt === HELP_ICON ||
               title === '?' || title === HELP_TITLE_ATTR;
    }

    function section(title, rows) {
        return (
            '<div class="ibhi-section">' +
                '<div class="ibhi-section-title">' + title + '</div>' +
                '<div class="ibhi-rows">' + rows.join('') + '</div>' +
            '</div>'
        );
    }
    function row(keys, desc) {
        const k = keys.map(x => '<kbd>' + x + '</kbd>').join(' ');
        return (
            '<div class="ibhi-row">' +
                '<div class="ibhi-keys">' + k + '</div>' +
                '<div class="ibhi-desc">' + desc + '</div>' +
            '</div>'
        );
    }
    function note(text) {
        return '<div class="ibhi-note">' + text + '</div>';
    }
    function divider() {
        return '<div class="ibhi-divider"></div>';
    }

    function buildHelpHtml() {
        return '<div class="ibhi-help">' + [
            section('Quick Start', [
                note('Use \u2190\uFE0E / \u2192\uFE0E or the mouse wheel to browse images. Click any thumbnail to jump.'),
                note('Press + / - to zoom, * to reset. Drag to pan when zoomed in.'),
            ]),
            divider(),
            section('Navigation', [
                row(['\u2190\uFE0E', '\u2192\uFE0E'], 'Previous / next image'),
                row(['Mouse wheel'], 'Switch images \u2014 scroll faster to skip multiple'),
                row(['Click thumbnail'], 'Jump directly to that image'),
                row(['Drag thumbnail strip'], 'Browse and switch quickly'),
                row(['Home', 'End'], 'Jump to first / last image'),
            ]),
            section('Zoom & Pan', [
                row(['+', '='], 'Zoom in'),
                row(['-', '_'], 'Zoom out'),
                row(['*'], 'Reset zoom to 1.0x'),
                row(['Double-click'], 'Toggle zoom in / reset'),
                row(['Drag'], 'Pan when zoomed in'),
                row(['Arrow keys'], 'Pan smoothly when zoomed in'),
                row(['Pinch'], 'Zoom on touch devices'),
                row(['Two-finger drag'], 'Pan on touch devices when zoomed in'),
            ]),
            section('Thumbnail Strip', [
                row(['\u25BC\uFE0E', '\u25B2\uFE0E'], 'Collapse / expand thumbnail strip'),
                row(['Click strip tab'], 'Toggle thumbnail strip'),
                row(['Hover thumbnail'], 'Show file name'),
                row(['Counter'], 'Current position / total images'),
            ]),
            section('File Info Bar', [
                row(['\u24C8\uFE0E'], 'File size'),
                row(['\u24B8\uFE0E'], 'Created time'),
                row(['\u24C2\uFE0E'], 'Modified time'),
                row(['\u24C7\uFE0E'], 'Pixel resolution'),
                row(['\u24B6\uFE0E'], 'Aspect ratio'),
                row(['\u24C5\uFE0E'], 'Megapixels'),
            ]),
            section('Large Images', [
                note('Large images show a countdown before loading. Click the countdown overlay to load immediately.'),
                note('Super-large images are rendered with Canvas local drawing for smooth zoom and pan, without blocking the browser.'),
            ]),
            section('Touch Devices', [
                row(['Tap thumbnail'], 'Jump to that image'),
                row(['Swipe strip'], 'Browse and switch'),
                row(['Pinch'], 'Zoom in / out'),
                row(['Drag'], 'Pan when zoomed in'),
            ]),
            section('Tips', [
                note('Keyboard shortcuts work whenever the image viewer has focus.'),
                note('The thumbnail strip extends automatically as you navigate, keeping memory usage low.'),
                note('Zoom state resets automatically when switching to another image.'),
            ]),
        ].join('') + '</div>';
    }

    function isFileShowHelpDialog(dialog) {
        if (!dialog || !dialog.classList || !dialog.classList.contains('dialog')) return false;
        const t = dialog.querySelector('.dialog-title');
        if (!t) return false;
        return /file show help/i.test(t.textContent || '');
    }

    function rewriteHelpDialog(dialog) {
        if (!isImageMode()) return;
        if (!isFileShowHelpDialog(dialog)) return;
        const title = dialog.querySelector('.dialog-title');
        const content = dialog.querySelector('.dialog-content');
        if (!title || !content) return;
        title.textContent = HELP_TITLE;
        content.innerHTML = buildHelpHtml();
        dialog.dataset.ibHelpImageRewritten = '1';
    }

    function openHelpDialog() {
        enterHelpSession();

        const backdrop = document.createElement('div');
        backdrop.className = 'dialog-backdrop file-show ibhi-backdrop';
        backdrop.innerHTML =
            '<div role="dialog" aria-modal="true" class="dialog ibhi-dialog">' +
                '<button aria-label="Close" class="dialog-icon dialog-closer">x</button>' +
                '<h1 class="dialog-title">' + HELP_TITLE + '</h1>' +
                '<div class="dialog-content">' + buildHelpHtml() + '</div>' +
            '</div>';

        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            backdrop.remove();
            document.removeEventListener('keydown', onEsc, true);
            exitHelpSession();
        };
        const onEsc = (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation();
                close();
            }
        };
        backdrop.querySelector('.dialog-closer').addEventListener('click', close);
        backdrop.addEventListener('click', (ev) => {
            if (ev.target === backdrop) close();
        });
        document.addEventListener('keydown', onEsc, true);
        document.body.appendChild(backdrop);
        backdrop.querySelector('.dialog').dataset.ibHelpImageRewritten = '1';
    }

    function onDocumentClickCapture(e) {
        const btn = e.target && e.target.closest
            ? e.target.closest('.file-show .bar button.icon-button')
            : null;
        if (!btn) return;
        if (!isHelpButton(btn)) return;
        if (!isImageMode()) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const existing = document.querySelector('.dialog .dialog-title');
        if (existing && /file show help/i.test(existing.textContent || '')) {
            rewriteHelpDialog(existing.closest('.dialog'));
            enterHelpSession();
            return;
        }
        openHelpDialog();
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = `
.ibhi-dialog { max-width: 680px; }
.ibhi-help {
    display: flex; flex-direction: column; gap: 14px;
    padding: 4px 0; max-height: 70vh; overflow-y: auto;
}
.ibhi-section { display: flex; flex-direction: column; gap: 6px; }
.ibhi-section-title {
    font-size: 12px; font-weight: 700; letter-spacing: .6px;
    text-transform: uppercase; opacity: .65;
    border-bottom: 1px solid currentColor;
    padding-bottom: 3px; margin-bottom: 2px;
}
.ibhi-rows { display: flex; flex-direction: column; gap: 5px; }
.ibhi-row {
    display: grid; grid-template-columns: 160px 1fr;
    gap: 10px; align-items: center;
    font-size: 13px; line-height: 1.45;
}
.ibhi-keys { display: flex; flex-wrap: wrap; gap: 4px; }
.ibhi-keys kbd {
    display: inline-block; min-width: 20px; text-align: center;
    padding: 1px 6px; border-radius: 4px;
    border: 1px solid currentColor; opacity: .85;
    font-family: inherit; font-size: 11px;
    background: color-mix(in srgb, currentColor 8%, transparent);
}
.ibhi-desc { opacity: .92; }
.ibhi-note {
    font-size: 12.5px; line-height: 1.55; opacity: .85;
    padding: 7px 11px; border-radius: 6px;
    background: color-mix(in srgb, currentColor 6%, transparent);
}
.ibhi-divider {
    height: 1px; width: 100%;
    background: color-mix(in srgb, currentColor 15%, transparent);
    margin: 2px 0;
}
@media (max-width: 480px) {
    .ibhi-row { grid-template-columns: 120px 1fr; font-size: 12px; }
    .ibhi-keys kbd { font-size: 10px; padding: 1px 4px; }
    .ibhi-note { font-size: 12px; padding: 6px 9px; }
}
`;
        document.head.appendChild(st);
    }

    function scanDialogs(root) {
        if (!isImageMode()) return;
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('.dialog').forEach(rewriteHelpDialog);
    }

    function boot() {
        injectStyle();
        patchAllHelpButtons();
        document.addEventListener('click', onDocumentClickCapture, true);

        const mo = new MutationObserver(muts => {
            if (!isImageMode()) return;
            for (const m of muts) {
                if (m.type !== 'childList') continue;
                m.addedNodes.forEach(n => {
                    if (n.nodeType !== 1) return;
                    if (n.classList && n.classList.contains('dialog')) rewriteHelpDialog(n);
                    else if (n.querySelectorAll) scanDialogs(n);
                });
            }
            patchAllHelpButtons();
        });
        mo.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['title'],
        });

        scanDialogs(document);
        patchAllHelpButtons();

        setInterval(() => {
            if (isImageMode()) patchAllHelpButtons();
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();