// Compatibility entrypoint. ficha.html now loads the split files directly.
(function () {
  const files = [
    "js/ficha-core.js",
    "js/ficha-master.js",
    "js/ficha-sheet.js",
    "js/ficha-inventory.js",
    "js/ficha-dice.js",
    "js/ficha-habs.js",
    "js/ficha-memories.js",
    "js/ficha-soul.js",
    "js/ficha-init.js"
  ];

  if (document.currentScript && document.readyState === "loading") {
    document.write(files.map(src => '<script src="' + src + '"><\/script>').join(""));
  }
})();
