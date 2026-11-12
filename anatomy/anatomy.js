/* Svetlana-T — interactive 3D anatomy (dog & cat), procedural, Three.js r128.
 * Built from anatomical landmarks (side view, x = forward, y = up, z = side).
 * Layers: skin (glass shell) · skeleton · organs/vessels/nerves.
 * API: window.Anatomy.setStory(key) | setSpecies('dog'|'cat') | setExplode(0..1) | refreshLabels() | toggleRotate() | reset()
 * Page hooks: window.anatLabel(key), window.onAnatomyLabel(key), window.onAnatomyExplode(v), window.onAnatomyReady()
 */
(function () {
  const stage = document.getElementById("stage3d");
  const canvas = document.getElementById("anatCanvas");
  if (!stage || !canvas) return;
  const noGL = () => stage.classList.add("nogl");
  try {
    const t = document.createElement("canvas");
    if (!window.THREE || !(t.getContext("webgl") || t.getContext("experimental-webgl"))) return noGL();
  } catch (e) { return noGL(); }

  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  const isTouch = matchMedia("(pointer: coarse)").matches;
  const isNarrow = () => innerWidth < 900;
  const lerp = (a, b, t) => a + (b - a) * t;
  const bump = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
  const cap = (t, e = 0.04) => Math.sqrt(Math.max(0, Math.min(1, Math.min(t, 1 - t) / e)));

  /* ======================= renderer / scene ======================= */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.6 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const HOME = { pos: V(0.9, 2.7, 11.2), target: V(0.25, 1.25, 0) };
  camera.position.copy(HOME.pos);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.enableZoom = false; controls.enablePan = false;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.75;
  controls.target.copy(HOME.target);
  if (isTouch) controls.enabled = false;
  let userDragging = false;
  controls.addEventListener("start", () => { userDragging = true; camAnim = 0; });
  controls.addEventListener("end", () => { userDragging = false; });

  scene.add(new THREE.HemisphereLight(0xfff4ee, 0x2a1a16, 0.65));
  const key = new THREE.DirectionalLight(0xffeee2, 1.8); key.position.set(4, 7, 6); scene.add(key);
  const fill = new THREE.DirectionalLight(0xe5a495, 0.9); fill.position.set(-6, 1, -3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x8fe0d0, 0.8); rim.position.set(-2, 6, -7); scene.add(rim);
  const front = new THREE.DirectionalLight(0xffffff, 0.55); front.position.set(0, 1.5, 9); scene.add(front);

  const discMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { c: { value: new THREE.Color(0xe5a495) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 c; varying vec2 vUv; void main(){ float d=distance(vUv,vec2(.5)); float a=smoothstep(.5,.0,d)*.35; float ring=smoothstep(.012,.0,abs(d-.42))*.35; gl_FragColor=vec4(c,a*.6+ring); }"
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), discMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = -0.02; scene.add(disc);
  const pg = new THREE.BufferGeometry(), pn = 160, pp = new Float32Array(pn * 3);
  for (let i = 0; i < pn; i++) { pp[i * 3] = (Math.random() - 0.5) * 12; pp[i * 3 + 1] = Math.random() * 6; pp[i * 3 + 2] = (Math.random() - 0.5) * 8; }
  pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf4c4b7, size: 0.025, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(dust);

  /* ======================= materials ======================= */
  function holoMat(color, opacity) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: { c: { value: new THREE.Color(color) }, o: { value: opacity }, glow: { value: 0 } },
      vertexShader: "varying vec3 n; varying vec3 v; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
      fragmentShader: "uniform vec3 c; uniform float o; uniform float glow; varying vec3 n; varying vec3 v; void main(){ float f=pow(1.0-abs(dot(n,v)),2.4); float a=(0.035+f*0.85+glow*0.22)*o; gl_FragColor=vec4(c*(0.55+f*1.25+glow),a); }"
    });
  }
  const lin = c => new THREE.Color(c).convertSRGBToLinear();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(color), roughness: 0.5, metalness: 0.05, transparent: true, opacity: 1 }, o));
  const wet = (color, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: lin(color), roughness: 0.38, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3, transparent: true, opacity: 1 }, o));

  /* ======================= geometry helpers ======================= */
  const SPH = new THREE.SphereGeometry(1, 36, 24), SPH_LO = new THREE.SphereGeometry(1, 14, 10);
  function ell(mat, c, r, lo) { const m = new THREE.Mesh(lo ? SPH_LO : SPH, mat); m.position.copy(c); m.scale.copy(r); return m; }

  /* sweep a (possibly elliptical, variable) cross-section along a curve.
     rFn(u) -> number | [ry, rz].  planar: curve lies in an x-y plane, section axes = (in-plane normal, +z). */
  function sweep(pts, rFn, seg = 48, rad = 12, planar = false) {
    const curve = pts.isCurve ? pts : new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const pos = [], idx = [], P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    let prevN = null;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      curve.getPointAt(u, P); curve.getTangentAt(u, T).normalize();
      if (planar) { B.set(0, 0, 1); N.set(-T.y, T.x, 0).normalize(); }
      else {
        if (!prevN) { const a = Math.abs(T.x) < 0.9 ? V(1, 0, 0) : V(0, 1, 0); N.crossVectors(T, a).normalize(); }
        else { N.copy(prevN).addScaledVector(T, -prevN.dot(T)).normalize(); }
        prevN = N.clone(); B.crossVectors(T, N).normalize();
      }
      const r = rFn(u), ry = Array.isArray(r) ? r[0] : r, rz = Array.isArray(r) ? r[1] : r;
      for (let j = 0; j <= rad; j++) {
        const a = (j / rad) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
        pos.push(P.x + N.x * ry * s + B.x * rz * c, P.y + N.y * ry * s + B.y * rz * c, P.z + N.z * ry * s + B.z * rz * c);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j, b = a + rad + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const mesh = (g, m) => new THREE.Mesh(g, m);
  const tube = (mat, pts, r, seg = 40, rad = 8) => mesh(sweep(pts, u => (typeof r === "function" ? r(u) : r) * cap(u, 0.03), seg, rad), mat);
  /* long bone: shaft + rounded epiphyses */
  function longBone(mat, a, b, r, seg = 22) {
    return mesh(sweep([a, a.clone().lerp(b, 0.5), b], u => r * (0.72 + 0.6 * bump(u, 0.06, 0.08) + 0.5 * bump(u, 0.94, 0.08)) * cap(u, 0.035), seg, 10), mat);
  }
  /* wrinkle a geometry along its normals (brain gyri) */
  function wrinkle(g, amp, f) {
    g = g.clone(); const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
      const d = Math.sin(v.x * f + Math.sin(v.y * f * 0.7) * 2.1) * Math.sin(v.y * f * 1.1 + v.z * f * 0.6) * Math.cos(v.z * f * 1.3 + v.x * 0.5);
      v.addScaledVector(nn, d * amp); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  /* merge many meshes (same parent space) into one draw call */
  function merge(list, mat) {
    const pos = [], idx = []; let off = 0;
    list.forEach(m => {
      m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
      else for (let i = 0; i < p.count; i++) idx.push(i + off);
      off += p.count;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
  /* oriented box between two points */
  function bar(mat, a, b, w, d) {
    const dir = new THREE.Vector3().subVectors(b, a), len = Math.max(1e-4, dir.length());
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
    m.position.copy(a).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize()); return m;
  }
  /* flat plate from an outline, placed in a plane given by origin, x-axis, y-axis */
  function plate(mat, outline, origin, ax, ay, depth) {
    const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: depth * 0.6, bevelSegments: 2 });
    g.translate(0, 0, -depth / 2);
    const x = ax.clone().normalize(), y = ay.clone().addScaledVector(x, -ay.dot(x)).normalize(), z = new THREE.Vector3().crossVectors(x, y);
    const m = new THREE.Mesh(g, mat);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    m.position.copy(origin); return m;
  }

  /* ======================= species landmarks ======================= */
  const SPECIES = {
    dog: {
      skin: 0xf4c4b7,
      body: [[V(2.56, 2.04), .05, .06], [V(2.3, 2.12), .14, .14], [V(1.95, 2.3), .26, .23], [V(1.6, 2.22), .24, .19], [V(1.3, 1.98), .27, .2],
             [V(0.85, 1.52), .5, .35], [V(0.2, 1.46), .45, .37], [V(-0.5, 1.6), .3, .31], [V(-1.05, 1.62), .34, .29], [V(-1.4, 1.65), .09, .08]],
      spine: [V(1.55, 2.17), V(1.32, 2.0), V(1.06, 1.84), V(0.55, 1.83), V(-0.25, 1.8), V(-0.95, 1.79), V(-1.22, 1.76), V(-1.36, 1.73)],
      regions: { C: [0, 0.2], T: [0.2, 0.62], L: [0.62, 0.9], S: [0.9, 1] },
      tail: [V(-1.36, 1.73), V(-1.7, 1.62), V(-2.08, 1.38), V(-2.4, 1.05), V(-2.52, 0.86)], tailR: [0.085, 0.025], wag: [3.5, 0.3],
      skull: { cran: V(1.8, 2.3), cranR: V(0.23, 0.17, 0.17), snoutA: V(1.98, 2.27), snoutB: V(2.52, 2.06), snoutR: [0.12, 0.065], occ: V(1.58, 2.24), eye: V(2.0, 2.33), eyeR: 0.07, jawBack: V(1.74, 2.06), chin: V(2.46, 1.97) },
      ear: "flop", teethN: 10,
      front: { scapTop: V(0.82, 1.98), shoulder: V(1.14, 1.36), elbow: V(0.93, 0.95), carpus: V(1.0, 0.32), fetlock: V(1.07, 0.12), toe: V(1.2, 0.04), z: 0.24, r: [0.15, 0.14, 0.1, 0.06, 0.055] },
      hind: { hip: V(-1.12, 1.46), stifle: V(-0.83, 0.96), hock: V(-1.24, 0.46), fetlock: V(-1.14, 0.12), toe: V(-1.02, 0.04), z: 0.26, r: [0.22, 0.2, 0.13, 0.06, 0.055] },
      pelvis: { ilium: V(-0.86, 1.86), ischium: V(-1.4, 1.42), pubis: V(-1.08, 1.28) },
      sternum: [V(1.1, 1.24), V(0.15, 0.98)], ribW: [0.3, 0.47, 0.42], ribs: 13,
      thorax: { x0: 1.02, x1: 0.08, top: 1.76, bot: 1.0, w: 0.42 },
      abd: { x0: 0.08, x1: -1.0, top: 1.74, bot: 1.08, w: 0.36 },
      larynx: V(1.72, 2.0), anus: V(-1.38, 1.62), bone: 0.045
    },
    cat: {
      skin: 0x9fe3d4,
      body: [[V(1.98, 1.4), .035, .045], [V(1.88, 1.45), .08, .1], [V(1.66, 1.53), .19, .19], [V(1.45, 1.5), .19, .17], [V(1.2, 1.32), .19, .15],
             [V(0.72, 1.04), .32, .24], [V(0.12, 0.99), .3, .25], [V(-0.5, 1.07), .27, .23], [V(-0.95, 1.12), .27, .22], [V(-1.2, 1.15), .07, .06]],
      spine: [V(1.47, 1.46), V(1.3, 1.32), V(1.08, 1.19), V(0.6, 1.15), V(-0.15, 1.15), V(-0.82, 1.21), V(-1.04, 1.18), V(-1.18, 1.16)],
      regions: { C: [0, 0.2], T: [0.2, 0.6], L: [0.6, 0.9], S: [0.9, 1] },
      tail: [V(-1.18, 1.16), V(-1.6, 1.18), V(-1.95, 1.4), V(-2.12, 1.8), V(-2.02, 2.15), V(-1.84, 2.28)], tailR: [0.06, 0.03], wag: [1.2, 0.16],
      skull: { cran: V(1.62, 1.56), cranR: V(0.17, 0.14, 0.15), snoutA: V(1.76, 1.5), snoutB: V(1.95, 1.43), snoutR: [0.075, 0.05], occ: V(1.46, 1.52), eye: V(1.76, 1.58), eyeR: 0.07, jawBack: V(1.58, 1.4), chin: V(1.9, 1.37) },
      ear: "point", teethN: 6,
      front: { scapTop: V(0.82, 1.32), shoulder: V(1.0, 0.93), elbow: V(0.84, 0.6), carpus: V(0.92, 0.19), fetlock: V(0.96, 0.08), toe: V(1.05, 0.03), z: 0.17, r: [0.11, 0.1, 0.075, 0.042, 0.04] },
      hind: { hip: V(-0.92, 1.0), stifle: V(-0.6, 0.62), hock: V(-1.03, 0.28), fetlock: V(-0.96, 0.08), toe: V(-0.86, 0.03), z: 0.18, r: [0.16, 0.14, 0.09, 0.042, 0.04] },
      pelvis: { ilium: V(-0.68, 1.24), ischium: V(-1.17, 0.98), pubis: V(-0.9, 0.88) },
      sternum: [V(1.04, 0.84), V(0.18, 0.72)], ribW: [0.2, 0.3, 0.27], ribs: 13,
      thorax: { x0: 1.0, x1: 0.0, top: 1.12, bot: 0.72, w: 0.27 },
      abd: { x0: 0.0, x1: -0.85, top: 1.12, bot: 0.78, w: 0.23 },
      larynx: V(1.56, 1.35), anus: V(-1.2, 1.12), bone: 0.032
    }
  };

  /* ======================= build one animal ======================= */
  function buildAnimal(S) {
    const root = new THREE.Group();
    const skin = new THREE.Group(), skel = new THREE.Group(), org = new THREE.Group(), fixed = new THREE.Group();
    root.add(skin, skel, org, fixed);
    const br = S.bone;

    /* ---------- skin shell ---------- */
    const skinMat = holoMat(S.skin, 0.8);
    const bp = S.body.map(b => b[0]);
    const acc = [0]; for (let i = 1; i < bp.length; i++) acc.push(acc[i - 1] + bp[i].distanceTo(bp[i - 1]));
    const tot = acc[acc.length - 1], us = acc.map(a => a / tot);
    const radAt = u => {
      let i = 0; while (i < us.length - 2 && u > us[i + 1]) i++;
      const t = Math.min(1, Math.max(0, (u - us[i]) / (us[i + 1] - us[i]))), k = (1 - Math.cos(Math.PI * t)) / 2;
      return [lerp(S.body[i][1], S.body[i + 1][1], k) * cap(u, 0.025), lerp(S.body[i][2], S.body[i + 1][2], k) * cap(u, 0.025)];
    };
    const skinParts = [mesh(sweep(bp, radAt, 120, 28, true), skinMat)];
    const legSkin = (pts, rs, z) => {
      const P = pts.map(p => V(p.x, p.y, z)), L = rs.length - 1;
      return mesh(sweep(P, u => { const f = u * L, i = Math.min(L - 1, Math.floor(f)); return lerp(rs[i], rs[i + 1], f - i) * cap(u, 0.02); }, 60, 16, true), skinMat);
    };
    for (const s of [-1, 1]) {
      const F = S.front, H = S.hind;
      skinParts.push(legSkin([V(F.scapTop.x + 0.18, F.shoulder.y + 0.32), F.shoulder, F.elbow, F.carpus, F.fetlock], F.r, s * F.z));
      skinParts.push(legSkin([V(H.hip.x + 0.22, H.hip.y + 0.12), H.hip, H.stifle, H.hock, H.fetlock], H.r, s * H.z));
      skinParts.push(ell(skinMat, V(F.fetlock.x + 0.06, F.r[4] * 0.9, s * F.z), V(F.r[4] * 1.9, F.r[4] * 0.9, F.r[4] * 1.3)));
      skinParts.push(ell(skinMat, V(H.fetlock.x + 0.06, H.r[4] * 0.9, s * H.z), V(H.r[4] * 1.9, H.r[4] * 0.9, H.r[4] * 1.3)));
      const c = S.skull.cran;
      if (S.ear === "flop") {
        const e = ell(skinMat, V(c.x - 0.08, c.y - 0.06, s * 0.21), V(0.09, 0.2, 0.035)); e.rotation.set(s * 0.25, 0, -0.35); skinParts.push(e);
      } else {
        const e = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 4), skinMat); e.position.set(c.x - 0.03, c.y + 0.2, s * 0.11); e.rotation.set(s * 0.3, Math.PI / 4, 0.1); skinParts.push(e);
      }
    }
    const tailSkinGeo = sweep(S.tail.map(p => p.clone().sub(S.tail[0])), u => lerp(S.tailR[0], S.tailR[1], u) * cap(u, 0.03), 60, 12);
    const tailG = new THREE.Group(); tailG.position.copy(S.tail[0]); tailG.add(mesh(tailSkinGeo, skinMat));
    skin.add(merge(skinParts, skinMat), tailG);

    /* ---------- skeleton ---------- */
    const bone = std(0xe9ddc9, { roughness: 0.62, emissive: 0x1a120c, emissiveIntensity: 0.1 });
    const cart = std(0xbcd7d6, { roughness: 0.4, opacity: 0.85 });
    const toothM = std(0xfbf8f2, { roughness: 0.25 });
    const claw = std(0x2b2523, { roughness: 0.35 });
    const B = [], C = [], TT = [], CL = [];
    const spine = new THREE.CatmullRomCurve3(S.spine, false, "centripetal");
    const R = S.regions, inR = (u, r) => u >= r[0] && u < r[1];

    // vertebrae: 7 cervical, 13 thoracic, 7 lumbar, 3 sacral
    const nV = 30, segLen = spine.getLength() / nV;
    for (let i = 0; i < nV; i++) {
      const u = (i + 0.5) / nV, p = spine.getPointAt(u), tg = spine.getTangentAt(u);
      const up = V(-tg.y, tg.x, 0).normalize(); if (up.y < 0) up.negate();
      const isC = inR(u, R.C), isT = inR(u, R.T), isL = inR(u, R.L);
      const bodyR = br * (isC ? 1.05 : isT ? 1.0 : isL ? 1.2 : 1.1);
      const vb = new THREE.Mesh(new THREE.CylinderGeometry(bodyR, bodyR, segLen * 0.78, 12), bone);
      vb.position.copy(p); vb.quaternion.setFromUnitVectors(V(0, 1, 0), tg); B.push(vb);
      // spinous process: tall & raked back at the withers, short and raked forward in the loin
      const t = isT ? (u - R.T[0]) / (R.T[1] - R.T[0]) : 0;
      const spH = br * (isC ? (i === 1 ? 2.2 : 1.1) : isT ? lerp(5.2, 1.8, t) : isL ? 2.0 : 1.3);
      const rake = isT ? lerp(0.35, -0.05, t) : isL ? -0.3 : 0;
      const tip = p.clone().addScaledVector(up, br * 1.2 + spH).addScaledVector(tg, rake * spH);
      B.push(bar(bone, p.clone().addScaledVector(up, br * 0.9), tip, br * 0.5, br * 0.35));
      // transverse processes (long lumbar wings, atlas wings)
      if (isL || isC) {
        const tl = br * (isL ? 2.4 : i === 0 ? 2.6 : 1.4);
        for (const s of [-1, 1]) B.push(bar(bone, p.clone().addScaledVector(up, br * 0.3), p.clone().add(V(0, 0, s * tl)), br * 0.6, br * 0.28));
      }
    }
    B.push(bar(bone, spine.getPointAt(0.9), spine.getPointAt(0.99), br * 2.2, br * 2.6));   // sacrum
    // tail vertebrae
    const tailCurve = new THREE.CatmullRomCurve3(S.tail, false, "centripetal"), tailBones = [];
    for (let i = 0; i < 20; i++) {
      const u = (i + 0.5) / 20, p = tailCurve.getPointAt(u).sub(S.tail[0]), tg = tailCurve.getTangentAt(u), r = br * lerp(0.95, 0.35, u);
      const v = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, tailCurve.getLength() / 20 * 0.8, 8), bone);
      v.position.copy(p); v.quaternion.setFromUnitVectors(V(0, 1, 0), tg); tailBones.push(v);
    }
    const tailSkel = new THREE.Group(); tailSkel.position.copy(S.tail[0]); tailSkel.add(merge(tailBones, bone));

    // sternebrae, ribs, costal cartilage
    const [st0, st1] = S.sternum, sternPts = [];
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8, p = st0.clone().lerp(st1, t); p.y -= Math.sin(t * Math.PI) * 0.04; sternPts.push(p);
      B.push(ell(bone, p, V(br * 1.25, br * 0.8, br * 0.9), true));
    }
    for (let i = 0; i < S.ribs; i++) {
      const k = i / (S.ribs - 1), u = lerp(R.T[0] + 0.01, R.T[1] - 0.005, k), top = spine.getPointAt(u);
      const w = k < 0.4 ? lerp(S.ribW[0], S.ribW[1], k / 0.4) : lerp(S.ribW[1], S.ribW[2], (k - 0.4) / 0.6);
      const bottomY = lerp(st0.y, st1.y, Math.min(1, k * 1.15)) + (k > 0.7 ? (k - 0.7) * 0.9 * (top.y - st1.y) : 0);
      const depth = top.y - bottomY, back = lerp(0.04, 0.22, k) * (top.y - st1.y);
      for (const s of [-1, 1]) {
        const p0 = top.clone().add(V(0, -br * 0.3, s * br * 1.3));
        const p1 = top.clone().add(V(-back * 0.35, -depth * 0.18, s * w * 0.9));
        const p2 = top.clone().add(V(-back * 0.85, -depth * 0.55, s * w));
        const p3 = top.clone().add(V(-back * 0.7, -depth * 0.8, s * w * 0.78));
        B.push(tube(bone, [p0, p1, p2, p3], br * 0.42, 26, 6));
        // true ribs (1-9) reach the sternum, false ribs form the costal arch, the last one floats
        const sp = i < 9 ? sternPts[Math.min(7, Math.round(i * 0.85))].clone().add(V(0, 0, s * br)) : top.clone().add(V(-back * 0.2, -depth * 0.97, s * w * 0.45));
        if (i < S.ribs - 1) C.push(tube(cart, [p3, p3.clone().lerp(sp, 0.55).add(V(0, -depth * 0.04, 0)), sp], br * 0.3, 14, 6));
      }
    }
    // skull: cranium, muzzle, occipital crest, zygomatic arches, mandible, teeth, eyes
    const K = S.skull;
    B.push(ell(bone, K.cran, K.cranR));
    B.push(mesh(sweep([K.cran.clone().add(V(K.cranR.x * 0.6, -K.cranR.y * 0.15)), K.snoutA, K.snoutB], u => [lerp(K.snoutR[0], K.snoutR[1], u) * cap(u, 0.03), lerp(K.snoutR[0] * 0.95, K.snoutR[1] * 0.9, u) * cap(u, 0.03)], 30, 14), bone));
    B.push(ell(bone, K.occ, V(K.cranR.x * 0.35, K.cranR.y * 0.55, K.cranR.z * 0.75)));
    const eyeM = wet(0x1b1010, { roughness: 0.1 });
    for (const s of [-1, 1]) {
      B.push(tube(bone, [K.cran.clone().add(V(-K.cranR.x * 0.2, -K.cranR.y * 0.45, s * K.cranR.z * 0.75)), K.eye.clone().add(V(-K.eyeR * 0.6, -K.eyeR * 1.3, s * K.cranR.z * 1.05)), K.eye.clone().add(V(K.eyeR * 0.9, -K.eyeR * 1.05, s * K.cranR.z * 0.8))], br * 0.38, 18, 6));
      const jb = K.jawBack.clone().add(V(0, 0, s * K.cranR.z * 0.75)), ch = K.chin.clone().add(V(0, 0, s * br * 0.6));
      B.push(tube(bone, [jb, jb.clone().lerp(ch, 0.5).add(V(0, -br * 0.4, -s * K.cranR.z * 0.2)), ch], u => br * lerp(0.95, 0.6, u), 24, 8));
      B.push(bar(bone, jb, jb.clone().add(V(0.02, K.cranR.y * 0.75, 0)), br * 0.5, br * 0.35));   // coronoid process
      fixed.add(ell(eyeM, K.eye.clone().add(V(0, 0, s * K.cranR.z * 0.62)), V(K.eyeR, K.eyeR, K.eyeR * 0.8), true));
      const n = S.teethN;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), canine = i === n - 2, tu = 0.1 + t * 0.85;
        const up = K.snoutA.clone().lerp(K.snoutB, tu), lw = jb.clone().lerp(ch, 0.25 + t * 0.72);
        const hU = canine ? br * 1.7 : br * (t < 0.6 ? 0.75 : 0.45), hL = canine ? br * 1.5 : br * 0.55;
        const ut = new THREE.Mesh(new THREE.ConeGeometry(canine ? br * 0.42 : br * 0.32, hU, 6), toothM);
        ut.position.set(up.x, up.y - lerp(K.snoutR[0], K.snoutR[1], tu) * 0.85 - hU * 0.4, s * lerp(K.snoutR[0] * 0.75, K.snoutR[1] * 0.6, t) * lerp(1, 0.55, t) * 1.1); ut.rotation.x = Math.PI; TT.push(ut);
        const lt = new THREE.Mesh(new THREE.ConeGeometry(canine ? br * 0.4 : br * 0.3, hL, 6), toothM);
        lt.position.set(lw.x, lw.y + hL * 0.45 + br * 0.4, s * lerp(K.cranR.z * 0.6, br * 0.9, t)); TT.push(lt);
      }
    }
    // shoulder blades, limb bones, paws
    for (const s of [-1, 1]) {
      const F = S.front, H = S.hind, zF = s * F.z, zH = s * H.z;
      const sh = V(F.shoulder.x, F.shoulder.y, zF), top = V(F.scapTop.x, F.scapTop.y, s * (F.z + 0.1));
      const ax = new THREE.Vector3().subVectors(top, sh), L = ax.length(), ayv = V(-ax.y, ax.x, 0).normalize();
      B.push(plate(bone, [[0, -0.03 * L], [0.55 * L, -0.25 * L], [1.0 * L, -0.33 * L], [1.03 * L, 0.18 * L], [0.6 * L, 0.12 * L], [0.12 * L, 0.06 * L]], sh, ax, ayv, br * 0.35));
      B.push(bar(bone, sh.clone().addScaledVector(ax, 0.15), sh.clone().addScaledVector(ax, 0.98).add(V(0, 0, s * br * 0.6)), br * 0.35, br * 1.1));  // scapular spine
      const el = V(F.elbow.x, F.elbow.y, zF), ca = V(F.carpus.x, F.carpus.y, zF), fe = V(F.fetlock.x, F.fetlock.y, zF);
      B.push(longBone(bone, sh, el, br * 0.95));                                                                                  // humerus
      B.push(longBone(bone, el.clone().add(V(0.015, 0, -s * br * 0.4)), ca.clone().add(V(0, 0, -s * br * 0.4)), br * 0.6));     // radius
      B.push(longBone(bone, el.clone().add(V(-0.06, 0.08, s * br * 0.5)), ca.clone().add(V(-0.02, 0.03, s * br * 0.5)), br * 0.5)); // ulna + olecranon
      const hp = V(H.hip.x, H.hip.y, zH), stf = V(H.stifle.x, H.stifle.y, zH), hk = V(H.hock.x, H.hock.y, zH), hf = V(H.fetlock.x, H.fetlock.y, zH);
      B.push(ell(bone, hp, V(br * 1.25, br * 1.25, br * 1.25), true));                                       // femoral head
      B.push(longBone(bone, hp, stf, br * 1.0));                                                              // femur
      B.push(ell(bone, stf.clone().add(V(0.05, 0.03, 0)), V(br * 0.6, br * 0.9, br * 0.55), true));          // patella
      B.push(longBone(bone, stf, hk, br * 0.85));                                                             // tibia
      B.push(longBone(bone, stf.clone().add(V(-0.03, -0.04, s * br * 0.7)), hk.clone().add(V(0, 0.05, s * br * 0.6)), br * 0.32)); // fibula
      B.push(longBone(bone, hk.clone().add(V(0.02, -0.02, 0)), hk.clone().add(V(-0.1, 0.07, 0)), br * 0.55)); // calcaneus
      for (const [j, f, toeX] of [[ca, fe, F.toe.x], [hk, hf, H.toe.x]]) {
        B.push(ell(bone, j, V(br * 1.1, br * 0.8, br * 1.1), true));                                         // carpus / tarsus
        for (let d = -1.5; d <= 1.5; d++) {
          const zz = j.z + d * br * 0.55, base = V(j.x + 0.01, j.y - br * 0.6, zz), fl = V(f.x, f.y + 0.01, zz + d * br * 0.15);
          B.push(longBone(bone, base, fl, br * 0.3, 14));                                                    // metacarpal / metatarsal
          const tip = V(toeX + 0.03, br * 0.4, fl.z + d * br * 0.2), mid = fl.clone().lerp(tip, 0.5).add(V(0, br * 0.2, 0));
          B.push(longBone(bone, fl, mid, br * 0.28, 10)); B.push(longBone(bone, mid, tip, br * 0.24, 10));   // phalanges
          const cl = new THREE.Mesh(new THREE.ConeGeometry(br * 0.25, br * 1.3, 6), claw);
          cl.position.copy(tip).add(V(br * 0.5, -br * 0.15, 0)); cl.rotation.z = -Math.PI / 2 - 0.5; CL.push(cl);
        }
      }
    }
    // pelvis: ilium wing, ischium, pubis
    const Pp = S.pelvis;
    for (const s of [-1, 1]) {
      const zi = s * S.hind.z * 0.85, acet = V(S.hind.hip.x, S.hind.hip.y, s * S.hind.z * 0.95), il = V(Pp.ilium.x, Pp.ilium.y, zi * 1.15);
      const ax = new THREE.Vector3().subVectors(il, acet), L = ax.length(), ayv = V(-ax.y, ax.x, 0).normalize();
      B.push(plate(bone, [[0, -0.05 * L], [0.6 * L, -0.12 * L], [1.05 * L, -0.2 * L], [1.1 * L, 0.18 * L], [0.55 * L, 0.12 * L], [0, 0.06 * L]], acet, ax, ayv, br * 0.4));
      const isch = V(Pp.ischium.x, Pp.ischium.y, zi * 0.9), pub = V(Pp.pubis.x, Pp.pubis.y, s * br * 0.6);
      B.push(tube(bone, [acet, acet.clone().lerp(isch, 0.5).add(V(0, 0.02, 0)), isch], br * 0.65, 16, 8));
      B.push(tube(bone, [acet, acet.clone().lerp(pub, 0.5).add(V(0.02, -0.03, 0)), pub], br * 0.5, 16, 8));
      B.push(tube(bone, [isch, isch.clone().lerp(pub, 0.5).add(V(-0.03, -0.04, 0)), pub], br * 0.5, 16, 8));
      B.push(ell(bone, isch, V(br * 1.1, br * 0.9, br * 0.8), true));
    }
    const teeth = merge(TT, toothM);
    skel.add(merge(B, bone), merge(C, cart), merge(CL, claw), tailSkel, teeth);

    /* ---------- organs ---------- */
    const O = {};
    const add = (k, m, dir) => {
      if (!O[k]) O[k] = { meshes: [], dir: V(0, 0, 0) };
      if (!O[k].group) { const g = new THREE.Group(); g.userData.key = k; org.add(g); O[k].group = g; O[k].dir = dir; }
      O[k].group.add(m); O[k].meshes.push(m); return m;
    };
    const addFixed = (k, m) => { if (!O[k]) O[k] = { meshes: [], dir: V(0, 0, 0) }; fixed.add(m); (O[k].fixed = O[k].fixed || []).push(m); return m; };
    const Th = S.thorax, Ab = S.abd;
    const TH = (u, v, w) => V(lerp(Th.x0, Th.x1, u), lerp(Th.bot, Th.top, v), w * Th.w);
    const AB = (u, v, w) => V(lerp(Ab.x0, Ab.x1, u), lerp(Ab.bot, Ab.top, v), w * Ab.w);
    const tL = Math.abs(Th.x0 - Th.x1), tH = Th.top - Th.bot, aL = Math.abs(Ab.x0 - Ab.x1), aH = Ab.top - Ab.bot;
    const spineAt = x => { let best = S.spine[0]; for (let i = 0; i <= 60; i++) { const p = spine.getPointAt(i / 60); if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; } return best.clone(); };

    // lungs: 3 lobes per side, trachea with cartilage rings, bronchi
    const lungM = wet(0xf2a3b0, { roughness: 0.55, clearcoat: 0.2, opacity: 0.9 }), LD = V(0.5, 0.7, 1);
    const lungLobes = [];
    for (const s of [-1, 1]) {
      lungLobes.push(add("lungs", ell(lungM, TH(0.2, 0.62, s * 0.48), V(tL * 0.18, tH * 0.3, Th.w * 0.42)), LD));
      lungLobes.push(add("lungs", ell(lungM, TH(0.45, 0.45, s * 0.58), V(tL * 0.14, tH * 0.28, Th.w * 0.36)), LD));
      lungLobes.push(add("lungs", ell(lungM, TH(0.74, 0.6, s * 0.52), V(tL * 0.26, tH * 0.36, Th.w * 0.44)), LD));
    }
    const bif = TH(0.42, 0.62, 0), trM = std(0xf5e4dc, { roughness: 0.45 });
    add("lungs", mesh(sweep([S.larynx, S.larynx.clone().lerp(bif, 0.4).add(V(0, 0.04, 0)), bif], u => br * 0.85 * (1 + 0.14 * Math.sin(u * 140)) * cap(u, 0.02), 140, 10), trM), LD);
    for (const s of [-1, 1]) add("lungs", tube(trM, [bif, TH(0.55, 0.55, s * 0.35), TH(0.75, 0.55, s * 0.5)], br * 0.5, 16, 8), LD);

    // heart: ventricles with apex pointing caudo-ventrally, atria, aorta arch, pulmonary trunk, cranial vena cava
    const heart = new THREE.Group(); heart.position.copy(TH(0.46, 0.33, 0.12));
    const hm = wet(0xb81d34, { emissive: lin(0x3a0008), emissiveIntensity: 0.5, roughness: 0.32 }), hs = tH * 0.24;
    const vent = ell(hm, V(0, 0, 0), V(hs * 0.62, hs, hs * 0.66)); vent.rotation.z = 0.55; heart.add(vent);
    heart.add(ell(wet(0x9c1a2c), V(0.03, hs * 0.7, hs * 0.35), V(hs * 0.32, hs * 0.26, hs * 0.3)));
    heart.add(ell(wet(0x7e2240), V(0.06, hs * 0.65, -hs * 0.35), V(hs * 0.3, hs * 0.25, hs * 0.28)));
    const artM = wet(0xc4162e), veinM = wet(0x2f4fb0);
    const toLocal = p => p.clone().sub(heart.position);
    const aortaTop = spineAt(heart.position.x - tL * 0.05).add(V(0, -br * 1.8, 0));
    heart.add(tube(artM, [V(0.02, hs * 0.6, 0), V(0.0, hs * 1.6, 0.02), toLocal(aortaTop).add(V(0.06, 0, 0)), toLocal(aortaTop).add(V(-0.12, -0.01, 0))], br * 0.55, 24, 8));
    heart.add(tube(wet(0x7a3a8a), [V(0.06, hs * 0.55, hs * 0.2), V(0.05, hs * 1.2, hs * 0.1), V(-0.06, hs * 1.4, hs * 0.05)], br * 0.45, 14, 8));
    heart.add(tube(veinM, [V(0.0, hs * 0.5, -hs * 0.3), V(0.14, hs * 0.75, -hs * 0.25), toLocal(S.larynx).multiplyScalar(0.55).add(V(0, 0, -0.04))], br * 0.42, 18, 8));
    add("heart", heart, V(0.8, -0.3, 1));
    // descending aorta, caudal vena cava, limb arteries (fixed; light up with the heart)
    const pelvicX = S.hind.hip.x + 0.05, aPts = [], vPts = [];
    for (let i = 0; i <= 12; i++) { const p = spineAt(lerp(aortaTop.x - 0.12, pelvicX, i / 12)); aPts.push(p.clone().add(V(0, -br * 1.8, 0.02))); vPts.push(p.clone().add(V(0, -br * 2.9, -0.06))); }
    addFixed("heart", tube(artM, aPts, br * 0.45, 60, 8));
    addFixed("heart", tube(veinM, [TH(0.5, 0.35, -0.2), ...vPts.slice(1, 9)], br * 0.5, 60, 8));
    for (const s of [-1, 1]) {
      const H = S.hind, F = S.front;
      addFixed("heart", tube(artM, [aPts[12], V(H.hip.x + 0.06, H.hip.y - 0.05, s * H.z * 0.7), V(H.stifle.x - 0.03, H.stifle.y + 0.05, s * H.z * 0.9), V(H.hock.x + 0.03, H.hock.y + 0.08, s * H.z)], br * 0.25, 40, 6));
      addFixed("heart", tube(artM, [aortaTop, V(F.shoulder.x - 0.05, F.shoulder.y - 0.02, s * F.z * 0.8), V(F.elbow.x + 0.02, F.elbow.y + 0.05, s * F.z * 0.95), V(F.carpus.x, F.carpus.y + 0.06, s * F.z)], br * 0.22, 40, 6));
    }
    // diaphragm (dome, convex towards the chest)
    const dia = mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), std(0xd98f86, { opacity: 0.35, roughness: 0.6, side: THREE.DoubleSide }));
    dia.position.copy(TH(0.98, 0.52, 0)).add(V(-tL * 0.12, 0, 0)); dia.scale.set(tL * 0.2, tH * 0.55, Th.w * 0.95); dia.rotation.z = Math.PI / 2;
    addFixed("diaphragm", dia);
    // liver (5 lobes) + gall bladder
    const livM = wet(0x6e1f1f, { roughness: 0.32 }), LV = V(0.35, -0.5, 1);
    [[0.06, 0.62, 0.35, 1], [0.1, 0.4, 0.55, 1.08], [0.08, 0.3, -0.35, 1], [0.12, 0.55, -0.6, 0.9], [0.14, 0.2, 0.05, 0.82]].forEach(([u, v, w, sc]) => {
      const l = ell(livM, AB(u, v, w), V(aL * 0.07, aH * 0.32 * sc, Ab.w * 0.45 * sc)); l.rotation.z = 0.35; add("liver", l, LV);
    });
    add("liver", ell(wet(0x4f7a2e), AB(0.13, 0.35, -0.05), V(aL * 0.03, aH * 0.06, Ab.w * 0.1)), LV);
    // oesophagus -> J-shaped stomach -> pylorus, spleen, pancreas
    const giM = wet(0xe9a084), SD = V(-0.1, 0.2, 1);
    add("stomach", tube(wet(0xd99a8c), [S.larynx.clone().add(V(-0.05, 0.05, 0)), spineAt(Th.x0 - tL * 0.2).add(V(0, -br * 2.2, 0.03)), spineAt(Th.x1 + tL * 0.15).add(V(0, -br * 2.6, 0.05)), AB(0.16, 0.72, 0.25)], br * 0.35, 60, 8), SD);
    add("stomach", mesh(sweep([AB(0.13, 0.82, 0.42), AB(0.2, 0.6, 0.6), AB(0.26, 0.32, 0.45), AB(0.24, 0.15, 0.05), AB(0.17, 0.25, -0.38), AB(0.13, 0.42, -0.5)], u => aH * lerp(0.2, 0.07, Math.pow(u, 0.8)) * cap(u, 0.06), 50, 16), giM), SD);
    add("stomach", mesh(sweep([AB(0.22, 0.75, 0.82), AB(0.3, 0.5, 0.85), AB(0.38, 0.25, 0.75)], u => [aH * 0.06 * cap(u, 0.08), Ab.w * 0.05 * cap(u, 0.08)], 30, 10), wet(0x5e1f3e)), SD);
    add("stomach", mesh(sweep([AB(0.18, 0.42, -0.45), AB(0.26, 0.52, -0.2), AB(0.33, 0.6, 0.15)], u => aH * 0.035 * (1 + 0.25 * Math.sin(u * 40)) * cap(u, 0.06), 40, 8), wet(0xefc490)), SD);
    // small intestine coil, caecum, colon -> rectum
    const ip = [], c0 = AB(0.6, 0.32, 0), ID = V(-0.5, -0.7, 1);
    for (let i = 0; i <= 160; i++) {
      const t = i / 160, a = t * Math.PI * 16;
      ip.push(V(c0.x + Math.cos(a) * aL * 0.22 * (0.65 + 0.35 * Math.sin(t * 9)) + (t - 0.5) * aL * 0.25, c0.y + Math.sin(a * 1.07) * aH * 0.2 * (0.7 + 0.3 * Math.cos(t * 7)), Math.sin(a * 0.5 + t * 3) * Ab.w * 0.62));
    }
    add("intestines", tube(wet(0xf0ab9a), ip, aH * 0.05, 900, 8), ID);
    add("intestines", tube(wet(0xd9957a), [AB(0.48, 0.25, -0.55), AB(0.4, 0.62, -0.5), AB(0.32, 0.8, -0.35), AB(0.32, 0.82, 0.35), AB(0.6, 0.78, 0.48), AB(0.85, 0.8, 0.2), AB(1.0, 0.84, 0.02), S.anus], aH * 0.07, 120, 10), ID);
    add("intestines", ell(wet(0xd9957a), AB(0.5, 0.2, -0.55), V(aH * 0.08, aH * 0.06, aH * 0.06)), ID);
    // kidneys (bean-shaped), adrenal glands, ureters, bladder
    const kM = wet(0x8a1f30, { roughness: 0.3 }), KD = V(-0.3, 1, 1);
    const kid = (c, s) => { const r = aH * 0.13, pts = []; for (let i = 0; i <= 8; i++) { const a = -1.0 + 2.0 * i / 8; pts.push(c.clone().add(V(Math.sin(a) * r, Math.cos(a) * r * 0.55 - r * 0.4, s * Math.cos(a) * r * 0.25))); } return mesh(sweep(pts, u => aH * 0.085 * cap(u, 0.12), 24, 14), kM); };
    const kR = AB(0.3, 0.9, -0.42), kL = AB(0.38, 0.88, 0.42);
    add("kidneys", kid(kR, -1), KD); add("kidneys", kid(kL, 1), KD);
    add("kidneys", ell(wet(0xe8c35a), kR.clone().add(V(aL * 0.05, aH * 0.05, 0.03)), V(aH * 0.03, aH * 0.02, aH * 0.02), true), KD);
    add("kidneys", ell(wet(0xe8c35a), kL.clone().add(V(aL * 0.05, aH * 0.05, -0.03)), V(aH * 0.03, aH * 0.02, aH * 0.02), true), KD);
    const blad = AB(0.9, 0.3, 0), urM = wet(0xe6c46a, { opacity: 0.95 });
    add("bladder", mesh(sweep([blad.clone().add(V(aL * 0.07, 0, 0)), blad, blad.clone().add(V(-aL * 0.09, aH * 0.05, 0))], u => aH * (0.13 * Math.sin(Math.PI * Math.min(1, u * 1.2)) + 0.02) * cap(u, 0.05), 30, 16), urM), V(-1, -0.6, 1));
    for (const [k, s] of [[kR, -1], [kL, 1]]) add("kidneys", tube(urM, [k.clone().add(V(0, -aH * 0.04, -s * 0.03)), AB(0.62, 0.55, s * 0.25), blad.clone().add(V(-aL * 0.03, aH * 0.08, s * 0.03))], br * 0.15, 40, 6), KD);
    // brain (folded cerebrum, cerebellum) + spinal cord + intercostal, brachial and sciatic nerves
    const brM = wet(0xf0b3bf, { roughness: 0.5, clearcoat: 0.3 }), cr = K.cranR, bc = K.cran.clone().add(V(0, cr.y * 0.08, 0)), BD = V(0.4, 1, 0.6);
    for (const s of [-1, 1]) { const h = mesh(wrinkle(new THREE.SphereGeometry(1, 64, 48), 0.045, 9), brM); h.position.copy(bc).add(V(0, 0, s * cr.z * 0.33)); h.scale.set(cr.x * 0.66, cr.y * 0.58, cr.z * 0.38); add("brain", h, BD); }
    const cbl = mesh(wrinkle(new THREE.SphereGeometry(1, 40, 30), 0.06, 16), wet(0xe7a2ae)); cbl.position.copy(bc).add(V(-cr.x * 0.62, -cr.y * 0.12, 0)); cbl.scale.set(cr.x * 0.25, cr.y * 0.32, cr.z * 0.4); add("brain", cbl, BD);
    const nerveM = std(0xf4cf3c, { emissive: lin(0x4a3a00), emissiveIntensity: 0.4, roughness: 0.4 });
    const cordPts = [bc.clone().add(V(-cr.x * 0.5, -cr.y * 0.3, 0))]; for (let i = 1; i <= 30; i++) cordPts.push(spine.getPointAt(i / 30 * 0.97).add(V(0, br * 0.15, 0)));
    addFixed("brain", tube(nerveM, cordPts, br * 0.28, 90, 8));
    for (let i = 1; i < S.ribs - 1; i += 2) {
      const top = spine.getPointAt(lerp(R.T[0] + 0.01, R.T[1] - 0.005, i / (S.ribs - 1))), d = top.y - S.sternum[1].y;
      for (const s of [-1, 1]) addFixed("brain", tube(nerveM, [top.clone().add(V(0, -br * 0.4, s * br)), top.clone().add(V(-0.03, -d * 0.3, s * S.ribW[1] * 0.92)), top.clone().add(V(-0.05, -d * 0.6, s * S.ribW[1] * 0.96))], br * 0.09, 18, 5));
    }
    for (const s of [-1, 1]) {
      const F = S.front, H = S.hind, t1 = spine.getPointAt(R.T[0]), sac = spine.getPointAt(0.93);
      addFixed("brain", tube(nerveM, [t1.clone().add(V(0.05, -br, s * br)), V(F.shoulder.x - 0.03, F.shoulder.y + 0.05, s * F.z * 0.85), V(F.elbow.x + 0.01, F.elbow.y + 0.04, s * F.z * 0.95), V(F.carpus.x - 0.01, F.carpus.y + 0.05, s * F.z * 1.02)], br * 0.13, 40, 5));
      addFixed("brain", tube(nerveM, [sac.clone().add(V(0, -br, s * br)), V(H.hip.x - 0.07, H.hip.y - 0.03, s * H.z * 0.9), V(H.stifle.x - 0.08, H.stifle.y + 0.06, s * H.z * 1.02), V(H.hock.x + 0.05, H.hock.y + 0.05, s * H.z * 1.04)], br * 0.15, 40, 5));
    }
    O.teeth = { meshes: [teeth], dir: V(0, 0, 0), noMove: true, anchor: K.chin.clone().lerp(K.snoutA, 0.35).add(V(0, -K.snoutR[0] * 0.6, 0)) };

    root.traverse(m => { if (m.material && !m.material.uniforms) m.userData.baseOpacity = m.material.opacity; });
    Object.values(O).forEach(o => { if (o.group) o.group.userData.home = o.group.position.clone(); });
    return { root, skin, skel, org, fixed, O, skinMat, heart: vent, lungs: lungLobes, tail: [tailG, tailSkel], bone, center: V((Th.x0 + Ab.x1) / 2, (Th.top + Th.bot) / 2 + 0.1, 0), S };
  }

  /* ======================= world ======================= */
  const world = new THREE.Group(); scene.add(world);
  const animals = { dog: buildAnimal(SPECIES.dog) };
  world.add(animals.dog.root);
  function ensure(s) { if (!animals[s]) { animals[s] = buildAnimal(SPECIES[s]); animals[s].root.scale.setScalar(0.001); animals[s].root.visible = false; world.add(animals[s].root); } return animals[s]; }
  let species = "dog", A = animals.dog;

  /* ======================= labels ======================= */
  const labelWrap = document.getElementById("anatLabels");
  const LABEL_KEYS = ["brain", "heart", "lungs", "liver", "stomach", "intestines", "kidneys", "bladder", "teeth"];
  const labels = {};
  LABEL_KEYS.forEach(k => {
    const el = document.createElement("button"); el.type = "button"; el.className = "alabel"; el.dataset.k = k;
    el.innerHTML = "<i></i><span></span>";
    el.addEventListener("click", () => window.onAnatomyLabel && window.onAnatomyLabel(k));
    labelWrap && labelWrap.appendChild(el); labels[k] = el;
  });
  function refreshLabels() { LABEL_KEYS.forEach(k => { labels[k].querySelector("span").textContent = window.anatLabel ? window.anatLabel(k) : k; }); }
  refreshLabels();

  /* ======================= story states ======================= */
  const STORY = {
    hero:     { explode: 0,    focus: null, rotate: true },
    heart:    { explode: 0.55, focus: ["heart", "lungs"], side: 1 },
    kidney:   { explode: 0.6,  focus: ["kidneys", "bladder"], side: -1 },
    digest:   { explode: 0.6,  focus: ["stomach", "intestines", "liver"], side: 1 },
    skeleton: { explode: 1,    focus: ["skeleton", "brain"], side: -1 },
    skin:     { explode: 0,    focus: ["skin", "teeth"], side: 1 },
    free:     { explode: null, focus: null }
  };
  let story = "hero", explode = 0, targetExplode = 0, focus = null, autoRotate = true, camAnim = 0, rotTarget = null;
  const camFrom = { pos: V(0, 0), target: V(0, 0) }, camTo = { pos: HOME.pos.clone(), target: HOME.target.clone() };
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

  function focusPoint(keys) {
    const pts = [];
    keys.forEach(k => {
      if (k === "skeleton") pts.push(A.center.clone());
      else if (k === "skin") pts.push(A.S.skull.cran.clone().add(V(0.15, -0.1, 0)));
      else if (k === "teeth") pts.push(A.O.teeth.anchor.clone());
      else if (A.O[k] && A.O[k].group) pts.push(new THREE.Box3().setFromObject(A.O[k].group).getCenter(new THREE.Vector3()));
    });
    if (!pts.length) return null;
    return pts.reduce((a, p) => a.add(p), V(0, 0)).multiplyScalar(1 / pts.length);
  }
  let viewShift = 0, viewShiftTo = 0;
  function applyViewShift() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (Math.abs(viewShift) < 0.001 && viewShiftTo === 0) { if (camera.view) camera.clearViewOffset(); return; }
    camera.setViewOffset(w, h, 0, h * viewShift, w, h);
  }
  function planCamera() {
    const s = STORY[story];
    camFrom.pos.copy(camera.position); camFrom.target.copy(controls.target);
    const narrow = isNarrow(), sc = species === "cat" ? 0.72 : 1;
    if (!s || !s.focus) {
      camTo.target.copy(HOME.target); camTo.target.y *= sc;
      camTo.pos.copy(HOME.pos); camTo.pos.z *= sc * 1.05; camTo.pos.y *= sc;
      if (!narrow) { camTo.target.x -= 2.1 * sc; camTo.pos.x -= 2.1 * sc; }
      else { camTo.pos.z += 4.2 * sc; camTo.pos.y += 0.4; }
    } else {
      const saved = explode; applyExplode(s.explode ?? explode); world.updateMatrixWorld(true);
      const p = focusPoint(s.focus) || HOME.target.clone();
      applyExplode(saved);
      const dist = (s.focus[0] === "skeleton" ? 11 : s.focus[0] === "skin" ? 6.5 : 8.2) * sc;
      const shift = (s.side || 1) * (narrow ? 0 : 1.7 * sc);
      camTo.target.copy(p).add(V(shift, 0, 0));
      camTo.pos.copy(camTo.target).add(V(0.9 * sc, 1.0 * sc, dist + (narrow ? 2.6 * sc : 0)));
    }
    viewShiftTo = narrow ? (s && s.focus ? 0.31 : 0.3) : 0;
    camAnim = 1;
  }
  function setStory(k) {
    if (!STORY[k] || k === story) return;
    story = k; const s = STORY[k];
    if (s.explode != null) targetExplode = s.explode;
    focus = s.focus; autoRotate = !!s.rotate;
    if (k !== "hero") { world.rotation.y = wrapAngle(world.rotation.y); rotTarget = 0; }
    planCamera();
    window.onAnatomyExplode && window.onAnatomyExplode(targetExplode);
  }

  /* ======================= explode ======================= */
  function applyExplode(f) {
    for (const a of Object.values(animals)) {
      a.skin.position.y = f * 1.45;
      for (const o of Object.values(a.O)) {
        if (!o.group || o.noMove) continue;
        o.group.position.copy(o.group.userData.home).add(V(o.dir.x * 0.5 * f, o.dir.y * 0.45 * f, o.dir.z * 1.0 * f));
      }
    }
  }

  /* ======================= highlight ======================= */
  function fade(obj, o) {
    obj.traverse(m => { if (m.material && !m.material.uniforms) { m.material.opacity = (m.userData.baseOpacity ?? 1) * o; m.material.depthWrite = o > 0.9; } });
  }
  function updateHighlight(t) {
    const f = focus, a = A;
    const skinO = (!f || f.includes("skin") ? 1 : 0.32) * (1 - Math.min(explode, 1) * 0.75);
    a.skinMat.uniforms.o.value = lerp(a.skinMat.uniforms.o.value, skinO, 0.08);
    a.skinMat.uniforms.glow.value = lerp(a.skinMat.uniforms.glow.value, f && f.includes("skin") ? 0.6 + Math.sin(t * 3) * 0.2 : 0, 0.08);
    a._sk = lerp(a._sk ?? 1, !f || f.includes("skeleton") || f.includes("teeth") ? 1 : 0.25, 0.08); fade(a.skel, a._sk);
    a.bone.emissiveIntensity = f && f.includes("skeleton") ? 0.28 + Math.sin(t * 3) * 0.1 : 0.1;
    for (const [k, o] of Object.entries(a.O)) {
      if (k === "teeth") continue;
      o._o = lerp(o._o ?? 1, !f || f.includes(k) ? 1 : (k === "diaphragm" ? 0.05 : 0.14), 0.08);
      if (o.group) fade(o.group, o._o);
      (o.fixed || []).forEach(m => fade(m, o._o));
    }
  }

  /* ======================= labels position ======================= */
  const tmp = new THREE.Vector3(), box = new THREE.Box3();
  function updateLabels() {
    if (!labelWrap) return;
    const rect = canvas.getBoundingClientRect(), showAll = explode > 0.35;
    LABEL_KEYS.forEach(k => {
      const el = labels[k], o = A.O[k], inFocus = focus && focus.includes(k);
      const vis = o && (inFocus || (showAll && !focus) || (story === "free" && explode > 0.35));
      if (!vis) { el.classList.remove("on"); return; }
      if (k === "teeth") tmp.copy(o.anchor).applyMatrix4(A.root.matrixWorld);
      else { box.setFromObject(o.group); box.getCenter(tmp); if (k === "lungs" || k === "liver" || k === "intestines") tmp.z = box.max.z; }
      tmp.project(camera);
      if (tmp.z > 1) { el.classList.remove("on"); return; }
      el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * rect.width}px, ${(-tmp.y * 0.5 + 0.5) * rect.height}px)`;
      el.classList.add("on"); el.classList.toggle("hot", !!inFocus);
    });
  }

  /* ======================= species switch ======================= */
  let swap = null;
  function setSpecies(s) {
    if (s === species || !SPECIES[s]) return;
    const from = animals[species], to = ensure(s);
    to.root.visible = true; to._sk = from._sk; to.skinMat.uniforms.o.value = 0;
    applyExplode(explode);
    swap = { from, to, t: 0 }; species = s; A = to;
    planCamera();
  }

  /* ======================= loop ======================= */
  let running = true, last = performance.now(), time = 0;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w < 600 ? 44 : 34; camera.updateProjectionMatrix(); applyViewShift();
  }
  addEventListener("resize", () => { resize(); planCamera(); });
  resize(); planCamera(); viewShift = viewShiftTo; applyViewShift(); camAnim = 0; camera.position.copy(camTo.pos); controls.target.copy(camTo.target);

  const ease = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.05); last = now; time += dt;
    explode = lerp(explode, targetExplode, 0.07);
    if (Math.abs(viewShift - viewShiftTo) > 0.0005) { viewShift = lerp(viewShift, viewShiftTo, 0.08); applyViewShift(); }
    applyExplode(explode);
    if (camAnim > 0 && !userDragging) {
      camAnim = Math.max(0, camAnim - dt * 0.9); const k = ease(1 - camAnim);
      camera.position.lerpVectors(camFrom.pos, camTo.pos, k);
      controls.target.lerpVectors(camFrom.target, camTo.target, k);
    }
    if (autoRotate && !userDragging) world.rotation.y += dt * 0.25;
    else if (rotTarget != null) { world.rotation.y = lerp(world.rotation.y, rotTarget, 0.06); if (Math.abs(world.rotation.y - rotTarget) < 0.001) rotTarget = null; }
    const beat = 1 + Math.pow(Math.max(0, Math.sin(time * 7.5)), 8) * 0.1, breath = 1 + Math.sin(time * 1.7) * 0.03;
    for (const a of Object.values(animals)) {
      if (!a.root.visible) continue;
      const h = a.heart; h.userData.s0 = h.userData.s0 || h.scale.clone(); h.scale.copy(h.userData.s0).multiplyScalar(beat);
      a.lungs.forEach(l => { l.userData.s0 = l.userData.s0 || l.scale.clone(); l.scale.set(l.userData.s0.x, l.userData.s0.y * breath, l.userData.s0.z * breath); });
      a.tail.forEach(g => g.rotation.y = Math.sin(time * a.S.wag[0]) * a.S.wag[1]);
      a.root.position.y = Math.sin(time * 1.1) * 0.03;
    }
    dust.rotation.y += dt * 0.02;
    if (swap) {
      swap.t = Math.min(1, swap.t + dt * 1.8); const k = ease(swap.t);
      swap.from.root.scale.setScalar(Math.max(0.001, 1 - k)); swap.to.root.scale.setScalar(Math.max(0.001, k));
      if (swap.t >= 1) { swap.from.root.visible = false; swap = null; }
    }
    updateHighlight(time);
    controls.update();
    renderer.render(scene, camera);
    updateLabels();
  }
  requestAnimationFrame(frame);
  new IntersectionObserver(([e]) => { running = e.isIntersecting; }, { threshold: 0 }).observe(stage);
  document.addEventListener("visibilitychange", () => { running = !document.hidden; });
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => ensure("cat"));   // pre-build the cat when idle

  stage.classList.add("ready");
  window.Anatomy = {
    setStory, setSpecies, refreshLabels,
    setExplode(v) { story = "free"; focus = null; targetExplode = v; autoRotate = false; },
    toggleRotate() { autoRotate = !autoRotate; return autoRotate; },
    reset() { story = "_"; setStory("hero"); },
    get species() { return species; }, get story() { return story; },
    _v: { world, camera, controls, animals, scene }
  };
  window.onAnatomyReady && window.onAnatomyReady();
})();
