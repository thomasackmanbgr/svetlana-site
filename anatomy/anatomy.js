/* Svetlana-T — interactive 3D anatomy (dog & cat), procedural, Three.js r128.
 * Layers: skin (glass shell) · skeleton · organs.  API: window.Anatomy
 *   Anatomy.setStory(key)      'hero' | 'heart' | 'kidney' | 'digest' | 'skeleton' | 'skin'
 *   Anatomy.setSpecies('dog'|'cat')
 *   Anatomy.setExplode(0..1)   manual layer separation (slider)
 *   Anatomy.refreshLabels()    re-read label texts (language change)
 * Page provides: window.anatLabel(key) -> text,  window.onAnatomyLabel(key) on label click,
 *                window.onAnatomyExplode(v) to sync the slider.
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

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const isTouch = matchMedia("(pointer: coarse)").matches;
  const isNarrow = () => innerWidth < 900;

  /* ---------- renderer / scene ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.6 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const HOME = { pos: V(1.0, 2.9, 11.5), target: V(0.15, 1.3, 0) };
  camera.position.copy(HOME.pos);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.enableZoom = false; controls.enablePan = false;           // wheel/touch must keep scrolling the page
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.75;
  controls.target.copy(HOME.target);
  if (isTouch) controls.enabled = false;                             // phones: page scroll wins, model auto-rotates
  let userDragging = false;
  controls.addEventListener("start", () => { userDragging = true; camAnim = 0; });
  controls.addEventListener("end", () => { userDragging = false; });

  scene.add(new THREE.AmbientLight(0xfff3ec, 0.55));
  const key = new THREE.DirectionalLight(0xffeee2, 1.9); key.position.set(4, 7, 6); scene.add(key);
  const fill = new THREE.DirectionalLight(0xe5a495, 1.1); fill.position.set(-6, 1, -3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x8fe0d0, 0.9); rim.position.set(-2, 6, -7); scene.add(rim);
  const under = new THREE.PointLight(0xe5a495, 0.8, 12); under.position.set(0, -1, 3); scene.add(under);

  /* floor glow disc */
  const discMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { c: { value: new THREE.Color(0xe5a495) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 c; varying vec2 vUv; void main(){ float d=distance(vUv,vec2(.5)); float a=smoothstep(.5,.0,d)*.35; float ring=smoothstep(.012,.0,abs(d-.42))*.35; gl_FragColor=vec4(c,a*.6+ring); }"
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), discMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = -0.02; scene.add(disc);

  /* dust particles */
  const pg = new THREE.BufferGeometry(), pn = 160, pp = new Float32Array(pn * 3);
  for (let i = 0; i < pn; i++) { pp[i * 3] = (Math.random() - 0.5) * 12; pp[i * 3 + 1] = Math.random() * 6; pp[i * 3 + 2] = (Math.random() - 0.5) * 8; }
  pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf4c4b7, size: 0.025, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(dust);

  /* ---------- materials ---------- */
  function holoMat(color, opacity) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: { c: { value: new THREE.Color(color) }, o: { value: opacity }, glow: { value: 0 } },
      vertexShader: "varying vec3 n; varying vec3 v; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
      fragmentShader: "uniform vec3 c; uniform float o; uniform float glow; varying vec3 n; varying vec3 v; void main(){ float f=pow(1.0-abs(dot(n,v)),2.2); float a=(0.05+f*0.9+glow*0.25)*o; gl_FragColor=vec4(c*(0.6+f*1.2+glow),a); }"
    });
  }
  const lin = c => new THREE.Color(c).convertSRGBToLinear();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(color), roughness: 0.42, metalness: 0.08, transparent: true, opacity: 1 }, o));
  const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: lin(color), roughness: 0.32, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.3, transparent: true, opacity: 1 }, o));

  /* ---------- geometry helpers ---------- */
  const SPH = new THREE.SphereGeometry(1, 40, 28), SPH_LO = new THREE.SphereGeometry(1, 18, 12);
  function ell(mat, c, r, lo) { const m = new THREE.Mesh(lo ? SPH_LO : SPH, mat); m.position.copy(c); m.scale.copy(r); return m; }
  function limb(mat, a, b, r1, r2, seg = 18) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(r2 ?? r1, r1, len, seg, 1, true);
    const m = new THREE.Mesh(g, mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    return m;
  }
  function tube(mat, pts, r, seg = 80, rad = 10) { return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false), mat); }

  /* ---------- species parameters ---------- */
  const SPECIES = {
    dog: {
      C: V(0, 1.58, 0), R: V(1.3, 0.58, 0.5), head: V(1.72, 2.48, 0), hr: 0.4, snout: 0.62, snoutR: V(0.36, 0.19, 0.2),
      neckR: 0.27, leg: 0.15, paw: V(0.17, 0.08, 0.13), ears: "flop", tail: [V(-1.32, 1.78, 0), V(-1.75, 2.05, 0), V(-2.05, 2.45, 0), V(-2.15, 2.75, 0)], tailR: 0.075,
      skin: 0xf4c4b7, scale: 1
    },
    cat: {
      C: V(0, 1.18, 0), R: V(1.12, 0.47, 0.4), head: V(1.38, 1.86, 0), hr: 0.38, snout: 0.2, snoutR: V(0.17, 0.13, 0.16),
      neckR: 0.22, leg: 0.11, paw: V(0.12, 0.06, 0.1), ears: "point", tail: [V(-1.12, 1.3, 0), V(-1.7, 1.05, 0.05), V(-2.15, 1.3, 0.1), V(-2.3, 1.95, 0), V(-2.12, 2.35, 0)], tailR: 0.06,
      skin: 0x9fe3d4, scale: 1.12
    }
  };

  /* ---------- build one animal ---------- */
  function buildAnimal(P) {
    const root = new THREE.Group();
    const skin = new THREE.Group(), skel = new THREE.Group(), org = new THREE.Group();
    root.add(skin, skel, org);
    const { C, R, head, hr } = P;
    const skinMat = holoMat(P.skin, 0.8);
    const bone = std(0xe6d8c4, { roughness: 0.6, emissive: 0x1a120c, emissiveIntensity: 0.12 });
    const boneJ = std(0xd9c9b3, { roughness: 0.6 });

    /* joint positions */
    const sx = C.x + R.x * 0.58, hx = C.x - R.x * 0.66;
    const F = (z) => [V(sx, C.y - R.y * 0.05, z), V(sx + 0.06, C.y * 0.52, z), V(sx + 0.02, 0.12, z)];
    const H = (z) => [V(hx, C.y + R.y * 0.05, z), V(hx + R.x * 0.24, C.y * 0.56, z), V(hx - R.x * 0.09, C.y * 0.27, z), V(hx - 0.01, 0.12, z)];
    const legZ = R.z * 0.55;
    const neckBase = V(C.x + R.x * 0.82, C.y + R.y * 0.5, 0);
    const skullBack = V(head.x - hr * 0.72, head.y - hr * 0.05, 0);
    const snoutTip = V(head.x + hr * 0.5 + P.snout, head.y - hr * 0.22, 0);

    /* ---- skin shell ---- */
    skin.add(ell(skinMat, C, R));
    skin.add(ell(skinMat, V(C.x + R.x * 0.45, C.y + R.y * 0.04, 0), V(R.x * 0.55, R.y * 1.12, R.z * 1.1)));
    skin.add(ell(skinMat, V(C.x - R.x * 0.62, C.y + R.y * 0.08, 0), V(R.x * 0.42, R.y * 1.04, R.z * 1.02)));
    skin.add(limb(skinMat, neckBase, V(head.x - hr * 0.35, head.y - hr * 0.2, 0), P.neckR * 1.25, P.neckR));
    skin.add(ell(skinMat, head, V(hr * 1.05, hr * 0.95, hr * 0.9)));
    skin.add(ell(skinMat, V(head.x + hr * 0.55 + P.snout * 0.45, head.y - hr * 0.25, 0), P.snoutR));
    for (const z of [-1, 1]) {
      if (P.ears === "flop") {
        const e = ell(skinMat, V(head.x - hr * 0.1, head.y + hr * 0.05, z * hr * 0.9), V(hr * 0.32, hr * 0.62, hr * 0.12));
        e.rotation.x = z * 0.35; e.rotation.z = -0.25; skin.add(e);
      } else {
        const g = new THREE.ConeGeometry(hr * 0.36, hr * 0.85, 4, 1, true);
        const e = new THREE.Mesh(g, skinMat); e.position.set(head.x - hr * 0.15, head.y + hr * 0.95, z * hr * 0.52); e.rotation.x = z * 0.32; e.rotation.y = Math.PI / 4; skin.add(e);
      }
      const f = F(z * legZ), h = H(z * legZ);
      skin.add(limb(skinMat, f[0], f[1], P.leg * 1.25, P.leg), limb(skinMat, f[1], f[2], P.leg, P.leg * 0.8));
      skin.add(limb(skinMat, h[0], h[1], P.leg * 1.6, P.leg * 1.1), limb(skinMat, h[1], h[2], P.leg * 1.0, P.leg * 0.85), limb(skinMat, h[2], h[3], P.leg * 0.8, P.leg * 0.75));
      skin.add(ell(skinMat, V(f[2].x + 0.05, 0.08, f[2].z), P.paw), ell(skinMat, V(h[3].x + 0.05, 0.08, h[3].z), P.paw));
    }
    const tailG = new THREE.Group(); tailG.position.copy(P.tail[0]);
    tailG.add(tube(skinMat, P.tail.map(p => p.clone().sub(P.tail[0])), P.tailR, 40, 8));
    skin.add(tailG);

    /* ---- skeleton ---- */
    const spinePts = [skullBack, neckBase.clone().add(V(-0.05, 0.12, 0)), V(C.x + R.x * 0.3, C.y + R.y * 0.72, 0), V(C.x - R.x * 0.3, C.y + R.y * 0.76, 0), V(C.x - R.x * 0.82, C.y + R.y * 0.6, 0), P.tail[0].clone()];
    const spine = new THREE.CatmullRomCurve3(spinePts);
    const vN = 34;
    for (let i = 0; i <= vN; i++) {
      const t = i / vN, p = spine.getPoint(t), tg = spine.getTangent(t);
      const s = (i < 7 ? 0.055 : 0.07) * P.scale;
      const v = new THREE.Mesh(new THREE.CylinderGeometry(s, s, 0.075, 10), bone);
      v.position.copy(p); v.quaternion.setFromUnitVectors(V(0, 1, 0), tg);
      skel.add(v);
      if (i % 2 === 0 && i > 6 && i < 30) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 6), bone); sp.position.copy(p).add(V(0, 0.09, 0)); skel.add(sp); }
    }
    const tailCurve = new THREE.CatmullRomCurve3(P.tail);
    const tailSkel = new THREE.Group(); tailSkel.position.copy(P.tail[0]);
    for (let i = 1; i <= 16; i++) { const t = i / 16, p = tailCurve.getPoint(t).sub(P.tail[0]); const v = ell(bone, p, V(0.035, 0.035, 0.035).multiplyScalar(1.4 - t * 0.7), true); tailSkel.add(v); }
    skel.add(tailSkel);

    // ribs
    const ribN = 11;
    for (let i = 0; i < ribN; i++) {
      const t = 0.22 + (i / (ribN - 1)) * 0.36, top = spine.getPoint(t);
      const k = Math.sin((i / (ribN - 1)) * Math.PI * 0.85 + 0.35);
      const depth = R.y * (1.05 + 0.25 * k), width = R.z * (0.75 + 0.3 * k);
      for (const z of [-1, 1]) {
        const pts = [top.clone(), top.clone().add(V(-0.02, -depth * 0.2, z * width * 0.85)), top.clone().add(V(-0.04, -depth * 0.62, z * width)), top.clone().add(V(0.03, -depth * 0.98, z * width * 0.35))];
        skel.add(tube(bone, pts, 0.02 * P.scale, 16, 6));
      }
    }
    const st1 = spine.getPoint(0.22), st2 = spine.getPoint(0.58);
    skel.add(limb(bone, st1.clone().add(V(0.05, -R.y * 1.3, 0)), st2.clone().add(V(0.05, -R.y * 1.25, 0)), 0.025));
    // skull + jaw + teeth
    const skull = ell(bone, V(head.x - hr * 0.05, head.y + hr * 0.02, 0), V(hr * 0.72, hr * 0.62, hr * 0.6)); skel.add(skull);
    const muzzle = ell(bone, V(head.x + hr * 0.45 + P.snout * 0.4, head.y - hr * 0.16, 0), V(hr * 0.25 + P.snout * 0.5, hr * 0.22, hr * 0.3)); skel.add(muzzle);
    const jaw = ell(bone, V(head.x + hr * 0.3 + P.snout * 0.38, head.y - hr * 0.48, 0), V(hr * 0.25 + P.snout * 0.5, hr * 0.1, hr * 0.27)); skel.add(jaw);
    for (const z of [-1, 1]) { const o = ell(boneJ, V(head.x + hr * 0.18, head.y + hr * 0.12, z * hr * 0.42), V(hr * 0.16, hr * 0.16, hr * 0.1), true); o.material = std(0x2a1d1a); skel.add(o); }
    const teeth = new THREE.Group(), toothMat = std(0xffffff, { roughness: 0.2, emissive: 0x333333, emissiveIntensity: 0.3 });
    const tN = 7;
    for (let i = 0; i < tN; i++) for (const z of [-1, 1]) {
      const t = i / (tN - 1), x = head.x + hr * 0.15 + (P.snout + hr * 0.38) * t, w = hr * 0.26 * (1 - t * 0.55);
      const isCanine = i === tN - 2;
      const c = new THREE.Mesh(new THREE.ConeGeometry(isCanine ? 0.03 : 0.018, isCanine ? 0.12 : 0.05, 6), toothMat);
      c.position.set(x, head.y - hr * 0.36, z * w); c.rotation.x = Math.PI; teeth.add(c);
    }
    skel.add(teeth);
    // scapula + pelvis
    for (const z of [-1, 1]) {
      const sc = ell(bone, V(sx - 0.02, C.y + R.y * 0.35, z * R.z * 0.72), V(0.12, 0.3, 0.03)); sc.rotation.z = -0.35; skel.add(sc);
    }
    const pelvis = ell(bone, V(hx + 0.05, C.y + R.y * 0.38, 0), V(0.32, 0.12, R.z * 0.55)); pelvis.rotation.z = 0.35; skel.add(pelvis);
    // limb bones
    const bR = 0.042 * P.scale;
    for (const z of [-1, 1]) {
      const f = F(z * legZ), h = H(z * legZ);
      [[f[0], f[1]], [f[1], f[2]], [h[0], h[1]], [h[1], h[2]], [h[2], h[3]]].forEach(([a, b]) => skel.add(limb(bone, a, b, bR, bR * 0.8, 10)));
      [...f, ...h].forEach(p => skel.add(ell(boneJ, p, V(bR * 1.3, bR * 1.3, bR * 1.3), true)));
      for (const p of [f[2], h[3]]) for (let k = -1; k <= 1; k++) skel.add(limb(bone, p, p.clone().add(V(0.14, -0.06, k * 0.05)), 0.015, 0.012, 6));
    }

    /* ---- organs ---- */
    const O = {}, add = (k, mesh, dir) => { mesh.userData.key = k; org.add(mesh); (O[k] = O[k] || { meshes: [], dir }).meshes.push(mesh); };
    const T = (u, v, w) => V(C.x + u * R.x, C.y + v * R.y, w * R.z);
    // brain
    add("brain", ell(phys(0xf4b8c4), V(head.x - hr * 0.12, head.y + hr * 0.12, 0), V(hr * 0.48, hr * 0.36, hr * 0.4)), V(0.3, 1, 0.6));
    // lungs
    for (const z of [-1, 1]) add("lungs", ell(phys(0xf39aab, { roughness: 0.45 }), T(0.42, 0.18, z * 0.42), V(R.x * 0.3, R.y * 0.52, R.z * 0.36)), V(0.6, 0.6, 1));
    // heart
    const heart = new THREE.Group(); heart.position.copy(T(0.5, -0.22, 0.08));
    const hm = phys(0xd3283f, { emissive: 0x4a0010, emissiveIntensity: 0.6 });
    heart.add(ell(hm, V(0, 0.03, 0), V(0.17, 0.19, 0.15).multiplyScalar(P.scale)));
    const apex = new THREE.Mesh(new THREE.ConeGeometry(0.14 * P.scale, 0.24 * P.scale, 20), hm); apex.position.set(-0.04, -0.15 * P.scale, 0); apex.rotation.z = 0.35 + Math.PI; heart.add(apex);
    const aorta = tube(phys(0xb81e33), [V(0, 0.12, 0), V(0.02, 0.3, 0), V(-0.12, 0.38, 0), V(-0.35, 0.32, 0)].map(p => p.multiplyScalar(P.scale)), 0.035 * P.scale, 20, 8); heart.add(aorta);
    add("heart", heart, V(0.7, -0.2, 1));
    // liver
    const liver = ell(phys(0x8e2a2e), T(0.1, -0.15, 0.05), V(R.x * 0.16, R.y * 0.48, R.z * 0.82)); liver.rotation.z = 0.25; add("liver", liver, V(0.25, -0.4, 1));
    // stomach
    const stom = new THREE.Mesh(new THREE.TorusGeometry(0.17 * P.scale, 0.1 * P.scale, 16, 28, Math.PI * 1.25), phys(0xeda07f)); stom.position.copy(T(-0.06, 0.02, 0.3)); stom.rotation.set(0.4, 0.5, 2.4); add("stomach", stom, V(-0.1, 0.2, 1));
    // intestines (meander)
    const ip = []; const ic = T(-0.38, -0.22, 0);
    for (let i = 0; i <= 70; i++) { const a = (i / 70) * Math.PI * 7; ip.push(V(ic.x + Math.cos(a) * R.x * 0.24 * (0.7 + 0.3 * Math.sin(i * 0.37)), ic.y + Math.sin(a) * R.y * 0.3 + (i / 70 - 0.5) * R.y * 0.25, Math.sin(a * 0.5 + i * 0.13) * R.z * 0.55)); }
    add("intestines", tube(phys(0xf2b0a0), ip, 0.05 * P.scale, 260, 8), V(-0.4, -0.7, 1));
    // kidneys
    for (const z of [-1, 1]) { const k = ell(phys(0x9a2a3a), T(-0.36, 0.42, z * 0.48), V(0.12, 0.075, 0.06).multiplyScalar(P.scale * 1.15)); k.rotation.z = 0.5; add("kidneys", k, V(-0.3, 0.9, 1)); }
    // bladder
    add("bladder", ell(phys(0xf0c95c, { opacity: 0.95 }), T(-0.82, -0.32, 0), V(0.12, 0.1, 0.1).multiplyScalar(P.scale)), V(-1, -0.6, 1));
    // label anchors
    O.teeth = { meshes: [teeth], dir: V(0, 0, 0), noMove: true };

    // keep originals for explode / dimming
    org.children.forEach(m => m.userData.home = m.position.clone());
    root.traverse(m => { if (m.material) m.userData.baseOpacity = m.material.opacity ?? 1; });
    return { root, skin, skel, org, O, skinMat, heart, lungs: O.lungs.meshes, tail: [tailG, tailSkel], bone, center: C.clone() };
  }

  const animals = { dog: buildAnimal(SPECIES.dog), cat: buildAnimal(SPECIES.cat) };
  const world = new THREE.Group(); scene.add(world);
  world.add(animals.dog.root, animals.cat.root);
  animals.cat.root.scale.setScalar(0.001); animals.cat.root.visible = false;
  let species = "dog", A = animals.dog;

  /* ---------- labels ---------- */
  const labelWrap = document.getElementById("anatLabels");
  const LABEL_KEYS = ["brain", "heart", "lungs", "liver", "stomach", "intestines", "kidneys", "bladder", "teeth"];
  const labels = {};
  LABEL_KEYS.forEach(k => {
    const el = document.createElement("button"); el.type = "button"; el.className = "alabel"; el.dataset.k = k;
    el.innerHTML = '<i></i><span></span>';
    el.addEventListener("click", () => window.onAnatomyLabel && window.onAnatomyLabel(k));
    labelWrap && labelWrap.appendChild(el); labels[k] = el;
  });
  function refreshLabels() { LABEL_KEYS.forEach(k => { labels[k].querySelector("span").textContent = window.anatLabel ? window.anatLabel(k) : k; }); }
  refreshLabels();

  /* ---------- story states ---------- */
  const STORY = {
    hero:     { explode: 0,    focus: null,        rotate: true },
    heart:    { explode: 0.55, focus: ["heart", "lungs"],              side: 1 },
    kidney:   { explode: 0.6,  focus: ["kidneys", "bladder"],          side: -1 },
    digest:   { explode: 0.6,  focus: ["stomach", "intestines", "liver"], side: 1 },
    skeleton: { explode: 1,    focus: ["skeleton", "brain"],            side: -1 },
    skin:     { explode: 0,    focus: ["skin", "teeth"],               side: 1 },
    free:     { explode: null, focus: null }
  };
  let story = "hero", explode = 0, targetExplode = 0, focus = null, autoRotate = true, camAnim = 0;
  const camFrom = { pos: V(), target: V() }, camTo = { pos: HOME.pos.clone(), target: HOME.target.clone() };

  function focusPoint(keys) {
    if (!keys) return null;
    const pts = [];
    keys.forEach(k => {
      if (k === "skeleton") pts.push(A.center.clone().add(V(0, 0.2, 0)));
      else if (k === "skin") pts.push(SPECIES[species].head.clone());
      else if (A.O[k]) A.O[k].meshes.forEach(m => pts.push(m.getWorldPosition(new THREE.Vector3())));
    });
    if (!pts.length) return null;
    return pts.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / pts.length);
  }
  function planCamera() {
    const s = STORY[story];
    camFrom.pos.copy(camera.position); camFrom.target.copy(controls.target);
    const narrow = isNarrow();
    if (!s.focus) {
      camTo.target.copy(HOME.target); camTo.pos.copy(HOME.pos);
      if (!narrow) { camTo.target.x -= 2.1; camTo.pos.x -= 2.1; }         // hero: animal on the right, text on the left
      else { camTo.pos.z += 4.2; camTo.pos.y += 0.4; }
    } else {
      // predict organ positions at the target explode value
      const saved = explode; applyExplode(s.explode ?? explode); world.updateMatrixWorld(true);
      const p = focusPoint(s.focus) || HOME.target.clone();
      applyExplode(saved);
      const dist = s.focus[0] === "skeleton" ? 11 : s.focus[0] === "skin" ? 8 : 8.2;
      const shift = (s.side || 1) * (narrow ? 0 : 1.7);                // panel on the right -> organ shown on the left
      camTo.target.copy(p).add(V(shift, 0, 0));
      camTo.pos.copy(camTo.target).add(V(0.9, 1.0, dist + (narrow ? 2.6 : 0)));
    }
    viewShiftTo = narrow ? (s.focus ? 0.31 : 0.3) : 0;   // phones: draw the model in the top part of the screen
    camAnim = 1;
  }
  let viewShift = 0, viewShiftTo = 0;
  function applyViewShift() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (Math.abs(viewShift) < 0.001 && viewShiftTo === 0) { if (camera.view) { camera.clearViewOffset(); } return; }
    camera.setViewOffset(w, h, 0, h * viewShift, w, h);
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
  let rotTarget = null;
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- explode ---------- */
  function applyExplode(f) {
    for (const a of Object.values(animals)) {
      a.skin.position.y = f * 1.55;
      a.org.children.forEach(m => {
        const o = a.O[m.userData.key]; if (!o || o.noMove) return;
        const d = o.dir;
        m.position.copy(m.userData.home).add(V(d.x * 0.55 * f, d.y * 0.5 * f, d.z * 1.05 * f));
      });
    }
  }

  /* ---------- dimming / highlight ---------- */
  function setOpacity(group, o) { group.traverse(m => { if (m.material && m.material.opacity !== undefined && !(m.material.uniforms)) { m.material.opacity = (m.userData.baseOpacity ?? 1) * o; m.material.depthWrite = o > 0.9; } }); }
  function updateHighlight(t) {
    const f = focus;
    const skinOn = !f || f.includes("skin");
    const skinO = (skinOn ? 1 : 0.35) * (1 - Math.min(explode, 1) * 0.72);
    A.skinMat.uniforms.o.value = THREE.MathUtils.lerp(A.skinMat.uniforms.o.value, skinO, 0.08);
    A.skinMat.uniforms.glow.value = THREE.MathUtils.lerp(A.skinMat.uniforms.glow.value, f && f.includes("skin") ? 0.6 + Math.sin(t * 3) * 0.2 : 0, 0.08);
    const skelO = !f || f.includes("skeleton") || f.includes("teeth") ? 1 : 0.28;
    A._skelO = THREE.MathUtils.lerp(A._skelO ?? 1, skelO, 0.08); setOpacity(A.skel, A._skelO);
    A.bone.emissiveIntensity = f && f.includes("skeleton") ? 0.35 + Math.sin(t * 3) * 0.12 : 0.12;
    A.org.children.forEach(m => {
      const on = !f || f.includes(m.userData.key);
      m.userData._o = THREE.MathUtils.lerp(m.userData._o ?? 1, on ? 1 : 0.16, 0.08);
      m.traverse(x => { if (x.material && !x.material.uniforms) { x.material.opacity = m.userData._o; x.material.depthWrite = m.userData._o > 0.9; if (x.material.emissive) x.material.emissiveIntensity = on && f ? 0.35 + Math.sin(t * 3) * 0.2 : (x.material === A.heart.children[0].material ? 0.6 : 0); } });
    });
  }

  /* ---------- labels ---------- */
  const tmp = new THREE.Vector3();
  function updateLabels() {
    if (!labelWrap) return;
    const rect = canvas.getBoundingClientRect();
    const showAll = explode > 0.35;
    LABEL_KEYS.forEach(k => {
      const el = labels[k], o = A.O[k];
      const inFocus = focus && focus.includes(k);
      const vis = o && (inFocus || (showAll && !focus) || (story === "free" && explode > 0.35));
      if (!vis) { el.classList.remove("on"); return; }
      const m = o.meshes[0]; m.getWorldPosition(tmp);
      if (k === "teeth") tmp.copy(SPECIES[species].head).add(V(SPECIES[species].hr * 0.6, -SPECIES[species].hr * 0.45, 0)).applyMatrix4(A.root.matrixWorld);
      tmp.project(camera);
      if (tmp.z > 1) { el.classList.remove("on"); return; }
      el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * rect.width}px, ${(-tmp.y * 0.5 + 0.5) * rect.height}px)`;
      el.classList.add("on"); el.classList.toggle("hot", !!inFocus);
    });
  }

  /* ---------- species switch ---------- */
  let swap = null;
  function setSpecies(s) {
    if (s === species || !animals[s]) return;
    const from = animals[species], to = animals[s];
    to.root.visible = true; to._skelO = from._skelO; to.skinMat.uniforms.o.value = 0;
    swap = { from, to, t: 0 }; species = s; A = to;
    if (STORY[story].focus) planCamera();
  }

  /* ---------- loop ---------- */
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

    explode = THREE.MathUtils.lerp(explode, targetExplode, 0.07);
    if (Math.abs(viewShift - viewShiftTo) > 0.0005) { viewShift = THREE.MathUtils.lerp(viewShift, viewShiftTo, 0.08); applyViewShift(); }
    applyExplode(explode);

    // camera move
    if (camAnim > 0 && !userDragging) {
      camAnim = Math.max(0, camAnim - dt * 0.9); const k = ease(1 - camAnim);
      camera.position.lerpVectors(camFrom.pos, camTo.pos, k);
      controls.target.lerpVectors(camFrom.target, camTo.target, k);
    }
    // rotation
    if (autoRotate && !userDragging) world.rotation.y += dt * 0.25;
    else if (rotTarget != null) { world.rotation.y = THREE.MathUtils.lerp(world.rotation.y, rotTarget, 0.06); if (Math.abs(world.rotation.y - rotTarget) < 0.001) rotTarget = null; }

    // life: heartbeat, breathing, tail, float
    const beat = 1 + Math.pow(Math.max(0, Math.sin(time * 7.5)), 8) * 0.12;
    for (const a of Object.values(animals)) {
      a.heart.scale.setScalar(beat);
      a.lungs.forEach(l => { const b = 1 + Math.sin(time * 1.7) * 0.035; l.scale.y = l.userData.sy ?? (l.userData.sy = l.scale.y); l.scale.y = l.userData.sy * b; });
      a.tail.forEach(g => g.rotation.y = Math.sin(time * (species === "dog" ? 4 : 1.2)) * (species === "dog" ? 0.35 : 0.18));
      a.root.position.y = Math.sin(time * 1.1) * 0.04;
    }
    dust.rotation.y += dt * 0.02;

    // species cross-fade
    if (swap) {
      swap.t = Math.min(1, swap.t + dt * 1.8);
      const k = ease(swap.t);
      swap.from.root.scale.setScalar(Math.max(0.001, 1 - k)); swap.to.root.scale.setScalar(Math.max(0.001, k));
      if (swap.t >= 1) { swap.from.root.visible = false; swap = null; }
    }

    updateHighlight(time);
    controls.update();
    renderer.render(scene, camera);
    updateLabels();
  }
  requestAnimationFrame(frame);

  // pause when the stage is off screen
  new IntersectionObserver(([e]) => { running = e.isIntersecting; }, { threshold: 0 }).observe(stage);
  document.addEventListener("visibilitychange", () => { running = !document.hidden; });

  stage.classList.add("ready");
  window.Anatomy = {
    setStory, setSpecies, refreshLabels,
    setExplode(v) { story = "free"; focus = null; targetExplode = v; autoRotate = false; },
    toggleRotate() { autoRotate = !autoRotate; return autoRotate; },
    reset() { story = "_"; setStory("hero"); },
    get species() { return species; }, get story() { return story; }
  };
  window.onAnatomyReady && window.onAnatomyReady();
})();
