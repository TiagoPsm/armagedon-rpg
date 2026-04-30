// Compatibility entrypoint. mesa.html now loads the split files directly.
(function () {
  const files = [
    "js/mesa-core.js",
    "js/mesa-stage.js",
    "js/mesa-roster.js",
    "js/mesa-inspector.js",
    "js/mesa-storage.js",
    "js/mesa-init.js"
  ];

  if (document.currentScript && document.readyState === "loading") {
    document.write(files.map(src => '<script src="' + src + '"><\/script>').join(""));
  }
})();
