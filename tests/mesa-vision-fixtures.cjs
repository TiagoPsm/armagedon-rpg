/* Deterministic contours reused by geometry/pixel tests and performance runs. */
function cave(count) {
  const vertices = Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2, radius = .36 + .012 * Math.sin(angle * 17);
    return { x: .5 + Math.cos(angle) * radius, y: .5 + Math.sin(angle) * radius };
  });
  return vertices.map((p, i) => ({ id: `cave-${i}`, ax: p.x, ay: p.y, bx: vertices[(i + 1) % count].x, by: vertices[(i + 1) % count].y, kind: "wall", doorState: null }));
}
const cases = [
  { name: "corner", walls: [{ id: "a", ax: .5, ay: .25, bx: .5, by: .6 }, { id: "b", ax: .5, ay: .6, bx: .8, by: .6 }] },
  { name: "crossing", walls: [{ id: "a", ax: .5, ay: .25, bx: .5, by: .75 }, { id: "b", ax: .3, ay: .6, bx: .8, by: .6 }] },
  { name: "short", walls: [{ id: "a", ax: .5, ay: .49, bx: .5, by: .51 }] },
  { name: "cave", walls: cave(80) },
  ...["closed", "locked", "open"].map(doorState => ({ name: `door-${doorState}`, walls: [{ id: "door", ax: .5, ay: 0, bx: .5, by: 1, kind: "door", doorState }] }))
];
module.exports = { cave, cases };
