/* Pure geometry shared by the future Mesa UI and authoritative movement service.
 * Coordinates are map fractions: x=u, y=v*aspect (aspect=mapHeight/mapWidth).
 * Radii/distances use map-width units, never viewport pixels. No DOM or IO.
 * Loaded by mesa.html and imported by the server; no rendering state here.
 */
(function installMesaVisionGeometry(root) {
  "use strict";
  const EPS = 1e-9;
  const ANGLE_EPS = 1e-7;
  const TAU = Math.PI * 2;
  // Resource guards, NOT a claim of interactive performance at these limits.
  const MAX_WALLS = 5000;
  const MAX_INTERSECTIONS = 20000;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const length = a => Math.hypot(a.x, a.y);
  const at = (a, d, t) => ({ x: a.x + d.x * t, y: a.y + d.y * t });
  const wrap = angle => ((angle % TAU) + TAU) % TAU;

  function number(value, name, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`Invalid ${name}`);
    }
    return value;
  }

  function point(p) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError("Invalid point");
    return p;
  }

  function normalizeVision(input) {
    if (input == null) input = {};
    if (typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid vision");
    if (input.schemaVersion != null && input.schemaVersion !== 1) throw new RangeError("Unsupported vision version");
    if (input.enabled != null && typeof input.enabled !== "boolean") throw new TypeError("Invalid enabled");
    const walls = input.walls ?? [];
    if (!Array.isArray(walls) || walls.length > MAX_WALLS) throw new RangeError("Invalid walls count");
    const ids = new Set();
    return {
      schemaVersion: 1,
      enabled: input.enabled === true,
      coneDeg: number(input.coneDeg ?? 120, "coneDeg", 1, 360),
      walls: walls.map(w => {
        if (!w || typeof w.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(w.id) || ids.has(w.id)) {
          throw new TypeError("Invalid or duplicate wall id");
        }
        ids.add(w.id);
        const ax = number(w.ax, "ax", 0, 1), ay = number(w.ay, "ay", 0, 1);
        const bx = number(w.bx, "bx", 0, 1), by = number(w.by, "by", 0, 1);
        if (Math.hypot(bx - ax, by - ay) <= EPS) throw new RangeError("Degenerate wall");
        const kind = w.kind ?? "wall";
        if (kind !== "wall" && kind !== "door") throw new TypeError("Invalid wall kind");
        const doorState = kind === "door" ? (w.doorState ?? "closed") : null;
        if (kind === "door" && !["open", "closed", "locked"].includes(doorState)) throw new TypeError("Invalid door state");
        return { id: w.id, ax, ay, bx, by, kind, doorState };
      })
    };
  }

  function segment(id, a, b) {
    return { id, a, b, dx: b.x - a.x, dy: b.y - a.y, size: Math.hypot(b.x - a.x, b.y - a.y), minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  }

  function overlaps(a, b) {
    return a.minX <= b.maxX + EPS && a.maxX + EPS >= b.minX &&
      a.minY <= b.maxY + EPS && a.maxY + EPS >= b.minY;
  }

  function tree(items) {
    if (!items.length) return null;
    const node = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const item of items) {
      node.minX = Math.min(node.minX, item.minX); node.minY = Math.min(node.minY, item.minY);
      node.maxX = Math.max(node.maxX, item.maxX); node.maxY = Math.max(node.maxY, item.maxY);
    }
    if (items.length <= 8) node.items = items;
    else {
      const axis = node.maxX - node.minX >= node.maxY - node.minY ? "X" : "Y";
      items.sort((a, b) => (a[`min${axis}`] + a[`max${axis}`]) - (b[`min${axis}`] + b[`max${axis}`]));
      const mid = Math.floor(items.length / 2);
      node.left = tree(items.slice(0, mid)); node.right = tree(items.slice(mid));
    }
    return node;
  }

  function query(node, box, visit) {
    if (!node || !overlaps(node, box)) return;
    if (node.items) {
      for (const s of node.items) if (overlaps(s, box)) visit(s);
    } else { query(node.left, box, visit); query(node.right, box, visit); }
  }

  function closest(p, s) {
    const d = sub(s.b, s.a);
    const t = Math.max(0, Math.min(1, dot(sub(p, s.a), d) / dot(d, d)));
    return at(s.a, d, t);
  }

  function intersection(a, b) {
    const d = sub(a.b, a.a), e = sub(b.b, b.a), q = sub(b.a, a.a);
    const denom = cross(d, e);
    if (Math.abs(denom) <= EPS * length(d) * length(e)) return null;
    const t = cross(q, e) / denom, u = cross(q, d) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? at(a.a, d, t) : null;
  }

  function prepare(input, aspect = 1) {
    number(aspect, "aspect", 0.01, 100);
    const vision = normalizeVision(input);
    vision.walls.forEach(Object.freeze);
    Object.freeze(vision.walls);
    Object.freeze(vision);
    const segments = vision.walls.filter(w => w.doorState !== "open")
      .map(w => segment(w.id, { x: w.ax, y: w.ay * aspect }, { x: w.bx, y: w.by * aspect }));
    // Prefix cannot collide with normalized wall IDs.
    const corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: aspect }, { x: 0, y: aspect }];
    corners.forEach((p, i) => segments.push(segment(`@edge${i}`, p, corners[(i + 1) % 4])));
    segments.forEach((s, i) => { s.index = i; });
    const index = tree(segments.slice());
    const unique = new Map();
    for (const s of segments) for (const [p, other] of [[s.a, s.b], [s.b, s.a]]) {
      const key = `${p.x}:${p.y}`;
      if (!unique.has(key)) unique.set(key, { ...p, edges: [] });
      unique.get(key).edges.push({ x: other.x - p.x, y: other.y - p.y });
    }
    const vertices = [...unique.values()];
    let crossings = 0;
    for (const s of segments) {
      query(index, s, other => {
        if (other.index <= s.index) return;
        const hit = intersection(s, other);
        if (!hit) return;
        if (++crossings > MAX_INTERSECTIONS) throw new RangeError("Too many wall intersections");
        if (![s.a, s.b, other.a, other.b].some(p => Math.hypot(p.x - hit.x, p.y - hit.y) <= EPS)) vertices.push({ ...hit, crossing: true });
      });
    }
    // Hide mutable index/segments from callers; snapshots are rebuilt only on edits.
    return Object.freeze({ vision, aspect,
      polygon: (origin, facingDeg = 0, coneDeg = vision.coneDeg) => polygon(index, vertices, aspect, origin, facingDeg, coneDeg),
      canSee: (origin, target, facingDeg = 0, coneDeg = vision.coneDeg) => canSee(index, aspect, origin, target, facingDeg, coneDeg),
      sweep: (from, to, radius) => sweep(index, aspect, from, to, radius),
      canReachDoor: (origin, doorId, reach) => canReachDoor(index, vision, aspect, origin, doorId, reach)
    });
  }

  function rayDistance(origin, dir, s, max) {
    const ex = s.dx, ey = s.dy;
    const qx = s.a.x - origin.x, qy = s.a.y - origin.y;
    const denom = dir.x * ey - dir.y * ex;
    if (Math.abs(denom) <= EPS * s.size) {
      if (Math.abs(qx * dir.y - qy * dir.x) > EPS) return max;
      const t1 = qx * dir.x + qy * dir.y, t2 = (s.b.x - origin.x) * dir.x + (s.b.y - origin.y) * dir.y;
      if (Math.max(t1, t2) < -EPS) return max;
      return Math.min(max, Math.max(0, Math.min(t1, t2)));
    }
    const t = (qx * ey - qy * ex) / denom, u = (qx * dir.y - qy * dir.x) / denom;
    return t >= -EPS && u >= -EPS && u <= 1 + EPS ? Math.min(max, Math.max(0, t)) : max;
  }

  function rayEntry(node, origin, dir, max) {
    let near = 0, far = max;
    if (Math.abs(dir.x) < 1e-15) {
      if (origin.x < node.minX - EPS || origin.x > node.maxX + EPS) return Infinity;
    } else {
      const a = (node.minX - EPS - origin.x) / dir.x, b = (node.maxX + EPS - origin.x) / dir.x;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return Infinity;
    }
    if (Math.abs(dir.y) < 1e-15) {
      if (origin.y < node.minY - EPS || origin.y > node.maxY + EPS) return Infinity;
    } else {
      const a = (node.minY - EPS - origin.y) / dir.y, b = (node.maxY + EPS - origin.y) / dir.y;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return Infinity;
    }
    return near;
  }
  function cast(index, origin, dir, max, ignoreId) {
    if (rayEntry(index, origin, dir, max) > max) return max;
    if (index.items) {
      for (const s of index.items) if (s.id !== ignoreId) max = rayDistance(origin, dir, s, max);
    } else if (rayEntry(index.left, origin, dir, max) <= rayEntry(index.right, origin, dir, max)) {
      max = cast(index.left, origin, dir, max, ignoreId);
      max = cast(index.right, origin, dir, max, ignoreId);
    } else {
      max = cast(index.right, origin, dir, max, ignoreId);
      max = cast(index.left, origin, dir, max, ignoreId);
    }
    return max;
  }

  function validOrigin(index, aspect, origin) {
    point(origin);
    if (origin.x <= 0 || origin.x >= 1 || origin.y <= 0 || origin.y >= aspect) return false;
    let valid = true;
    query(index, { minX: origin.x - EPS, maxX: origin.x + EPS, minY: origin.y - EPS, maxY: origin.y + EPS }, s => {
      if (length(sub(origin, closest(origin, s))) <= EPS) valid = false;
    });
    return valid;
  }

  function angles(facingDeg, coneDeg) {
    number(facingDeg, "facingDeg", -1e6, 1e6); number(coneDeg, "coneDeg", 1, 360);
    const span = coneDeg * Math.PI / 180;
    return { start: facingDeg * Math.PI / 180 - span / 2, span };
  }

  function polygon(index, vertices, aspect, origin, facingDeg, coneDeg) {
    const { start, span } = angles(facingDeg, coneDeg);
    if (!validOrigin(index, aspect, origin)) return [];
    const rays = [0, span];
    for (const v of vertices) {
      const angle = Math.atan2(v.y - origin.y, v.x - origin.x);
      // A continuous joint straddling this ray has no occlusion jump: its exact
      // vertex is sufficient. Cast side rays only at silhouette/open endpoints.
      // This keeps cave contours exact without tripling every ray unnecessarily.
      let positive = false, negative = false;
      for (const edge of v.edges || []) {
        const side = (v.x - origin.x) * edge.y - (v.y - origin.y) * edge.x;
        if (side > EPS) positive = true;
        if (side < -EPS) negative = true;
      }
      const offsets = v.crossing || (positive && negative) ? [0] : [-ANGLE_EPS, 0, ANGLE_EPS];
      for (const offset of offsets) {
        const relative = wrap(angle + offset - start);
        if (relative < span) rays.push(relative);
      }
    }
    rays.sort((a, b) => a - b);
    const result = span < TAU ? [{ ...origin }] : [];
    let previous = -Infinity;
    for (const relative of rays) {
      if (relative - previous < 1e-12) continue;
      previous = relative;
      const dir = { x: Math.cos(start + relative), y: Math.sin(start + relative) };
      result.push(at(origin, dir, cast(index, origin, dir, Math.hypot(1, aspect) + 1)));
    }
    return result;
  }

  function canSee(index, aspect, origin, target, facingDeg, coneDeg) {
    point(target);
    const { start, span } = angles(facingDeg, coneDeg);
    if (!validOrigin(index, aspect, origin) || target.x < 0 || target.x > 1 || target.y < 0 || target.y > aspect) return false;
    const d = sub(target, origin), dist = length(d);
    if (dist <= EPS) return true;
    const relative = wrap(Math.atan2(d.y, d.x) - start);
    if (relative > span + EPS && TAU - relative > EPS) return false;
    const hit = cast(index, origin, { x: d.x / dist, y: d.y / dist }, dist);
    return hit >= dist - EPS;
  }

  // First contact between the moving disk and a segment's capsule.
  function capsuleTime(from, delta, radius, s) {
    const initialDistance = length(sub(from, closest(from, s)));
    if (initialDistance < radius - EPS) return 0; // Invalid start: requires master repositioning.
    const candidates = [];
    const e = sub(s.b, s.a), size = length(e), tangent = { x: e.x / size, y: e.y / size };
    const normal = { x: -tangent.y, y: tangent.x };
    const signed = dot(sub(from, s.a), normal), velocity = dot(delta, normal);
    if (Math.abs(velocity) > EPS) {
      for (const side of [-radius, radius]) {
        const t = (side - signed) / velocity;
        const along = dot(sub(at(from, delta, t), s.a), tangent);
        if (along >= -EPS && along <= size + EPS) candidates.push(t);
      }
    }
    const a = dot(delta, delta);
    for (const endpoint of [s.a, s.b]) {
      const q = sub(from, endpoint), b = 2 * dot(q, delta), c = dot(q, q) - radius * radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) candidates.push((-b - Math.sqrt(discriminant)) / (2 * a));
    }
    let earliest = 1;
    for (const t of candidates) {
      if (t < -EPS || t > earliest) continue;
      const p = at(from, delta, Math.max(0, t));
      // A disk touching a wall can move away or slide along it.
      if (dot(delta, sub(p, closest(p, s))) >= 0) continue;
      earliest = Math.max(0, t);
    }
    return earliest;
  }

  function sweep(index, aspect, from, to, radius) {
    point(from); point(to); number(radius, "radius", EPS * 10, Math.min(1, aspect) / 2);
    const delta = sub(to, from), distance = length(delta);
    if (from.x < radius - EPS || from.x > 1 - radius + EPS || from.y < radius - EPS || from.y > aspect - radius + EPS) {
      return { ...from, fraction: 0, blocked: true };
    }
    const box = segment("", from, to);
    box.minX -= radius; box.minY -= radius; box.maxX += radius; box.maxY += radius;
    let fraction = 1;
    query(index, box, s => {
      if (distance <= EPS) {
        if (length(sub(from, closest(from, s))) < radius - EPS) fraction = 0;
      } else fraction = Math.min(fraction, capsuleTime(from, delta, radius, s));
    });
    const safe = fraction < 1 ? Math.max(0, fraction - 16 * EPS / Math.max(distance, EPS)) : 1;
    return { ...at(from, delta, safe), fraction: safe, blocked: fraction < 1 };
  }

  function canReachDoor(index, vision, aspect, origin, doorId, reach) {
    number(reach, "reach", 0, Math.hypot(1, aspect));
    if (!validOrigin(index, aspect, origin)) return false;
    const door = vision.walls.find(w => w.id === doorId && w.kind === "door");
    if (!door || door.doorState === "locked") return false;
    const s = segment(door.id, { x: door.ax, y: door.ay * aspect }, { x: door.bx, y: door.by * aspect });
    const target = closest(origin, s), d = sub(target, origin), distance = length(d);
    if (distance > reach + EPS) return false;
    if (distance <= EPS) return true;
    // Unlike canSee(), contact with ANOTHER wall at the destination blocks reach.
    const hit = cast(index, origin, { x: d.x / distance, y: d.y / distance }, distance + EPS * 2, door.id);
    return hit > distance + EPS;
  }

  root.MesaVisionGeometry = Object.freeze({ normalizeVision, prepare, MAX_WALLS, MAX_INTERSECTIONS });
})(globalThis);
