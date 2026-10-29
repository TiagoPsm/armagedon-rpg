/* Screen-density bitmaps for just the visible slice, not the entire zoomed map. */
function mesaCanvasViewport(canvas, stage) {
  const zoom = getStageZoom(), bounds = document.getElementById("mesaStageInner").getBoundingClientRect();
  const view = document.getElementById("mesaStageWrap").getBoundingClientRect();
  const left = clamp((Math.max(0, view.left) - bounds.left) / zoom, 0, stage.clientWidth);
  const top = clamp((Math.max(0, view.top) - bounds.top) / zoom, 0, stage.clientHeight);
  const width = Math.max(1 / zoom, clamp((Math.min(innerWidth, view.right) - bounds.left) / zoom, left, stage.clientWidth) - left);
  const height = Math.max(1 / zoom, clamp((Math.min(innerHeight, view.bottom) - bounds.top) / zoom, top, stage.clientHeight) - top);
  const density = Math.min((devicePixelRatio || 1) * zoom, Math.sqrt(24_000_000 / (width * height)));
  const pixelWidth = Math.max(1, Math.ceil(width * density)), pixelHeight = Math.max(1, Math.ceil(height * density));
  const key = [left, top, width, height, density, stage.clientWidth, stage.clientHeight].join(":");
  canvas.style.left = `${left}px`; canvas.style.top = `${top}px`;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  canvas.dataset.viewport = key;
  return { left, top, width, height, density, pixelWidth, pixelHeight, key };
}
