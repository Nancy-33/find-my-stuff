// Post-build script: injects PWA manifest, meta tags, and service worker
// into the built dist/index.html. Run after `expo export --platform web`.

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('dist/index.html not found. Run expo export first.');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf-8');

// Add manifest link + PWA meta tags in <head>
const headEnd = '</head>';
const pwaHead = [
  '<link rel="manifest" href="/manifest.json">',
  '<meta name="theme-color" content="#007AFF">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="apple-mobile-web-app-title" content="找东西">',
  '<link rel="apple-touch-icon" href="/icon-192.png">',
  '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">',
  headEnd,
].join('\n  ');

html = html.replace(headEnd, '  ' + pwaHead);

// Add PWA install handler + service worker registration before </body>
const bodyEnd = '</body>';
const swScript = [
  '<script>',
  "  // Capture PWA install prompt for programmatic triggering",
  "  var __pwaInstallEvent = null;",
  "  window.addEventListener('beforeinstallprompt', function(e) {",
  "    e.preventDefault();",
  "    __pwaInstallEvent = e;",
  "    window.__pwaCanInstall = true;",
  "    console.log('PWA: install prompt available');",
  "  });",
  "  window.__pwaInstall = function() {",
  "    if (__pwaInstallEvent) {",
  "      __pwaInstallEvent.prompt();",
  "      __pwaInstallEvent.userChoice.then(function(result) {",
  "        console.log('PWA install:', result.outcome);",
  "        __pwaInstallEvent = null;",
  "        window.__pwaCanInstall = false;",
  "      });",
  "    } else {",
  "      alert('请使用浏览器菜单中的「添加到主屏幕」功能安装');",
  "    }",
  "  };",
  "  // Check if already installed",
  "  if (window.matchMedia('(display-mode: standalone)').matches) {",
  "    window.__pwaIsInstalled = true;",
  "  }",
  "  // Register service worker",
  "  if ('serviceWorker' in navigator) {",
  "    window.addEventListener('load', function() {",
  "      navigator.serviceWorker.register('/sw.js').then(function(reg) {",
  "        console.log('SW registered:', reg.scope);",
  "      }).catch(function(err) {",
  "        console.log('SW registration failed:', err);",
  "      });",
  "    });",
  "  }",
  '</script>',
  bodyEnd,
].join('\n  ');

html = html.replace(bodyEnd, '  ' + swScript);

fs.writeFileSync(htmlPath, html, 'utf-8');
console.log('PWA tags injected into dist/index.html');
