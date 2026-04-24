if (window.electronAPI) {
    // Caricamento automatico Fonts
    if (window.electronAPI.onFontsLoaded) {
      window.electronAPI.onFontsLoaded(function(fonts) {
        fonts.forEach(function(font) {
          var mime = font.ext === 'woff2' ? 'font/woff2'
                   : font.ext === 'woff'  ? 'font/woff'
                   : font.ext === 'otf'   ? 'font/otf'
                   : 'font/truetype';
          var url = 'data:' + mime + ';base64,' + font.base64;
          var cn  = 'cf-' + font.name.replace(/\s+/g, '_');
          new FontFace(cn, 'url(' + url + ')').load().then(function(face) {
            document.fonts.add(face);
            var binary = atob(font.base64);
            var bytes  = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            try {
              var parsed = opentype.parse(bytes.buffer);
              // Validate that the font has glyph data
              if (parsed && parsed.glyphs && parsed.glyphs.length > 0) {
                window._pendingFonts = window._pendingFonts || [];
                window._pendingFonts.push({ name: font.name, css: "'" + cn + "',sans-serif", open: parsed });
              } else {
                console.warn('Font parsed but has no glyphs:', font.name);
              }
            } catch(e) {
              console.warn('Opentype parse failed for:', font.name, e);
            }
            var tryAdd = function() {
              if (typeof S !== 'undefined') {
                (window._pendingFonts || []).forEach(function(pf) {
                  S.fonts[pf.name]     = pf.css;
                  S.openFonts[pf.name] = pf.open;
                  S.curFont = pf.name;
                });
                window._pendingFonts = [];
                if(S.viewMode === 'fonts') renderFonts();
                toast(Object.keys(S.fonts).length + ' font auto-caricati ✓');
              } else {
                setTimeout(tryAdd, 100);
              }
            };
            tryAdd();
          }).catch(function() {});
        });
      });
    }

    // Caricamento automatico SVGs
    if (window.electronAPI.onSVGsLoaded) {
      window.electronAPI.onSVGsLoaded(function(svgs) {
        var tryAddSvg = function() {
          if (typeof S !== 'undefined' && typeof processSingleSVGForLibrary === 'function') {
            svgs.forEach(function(svgObj) {
              processSingleSVGForLibrary(svgObj.name, svgObj.content);
            });
            if(S.viewMode === 'svgs') renderSVGs();
            toast(svgs.length + ' SVG auto-caricati ✓');
          } else {
            setTimeout(tryAddSvg, 100);
          }
        };
        tryAddSvg();
      });
    }
}