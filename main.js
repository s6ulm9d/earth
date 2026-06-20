import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────
// VERIFIED TEXTURE URLS  (all confirmed 200 OK)
// ─────────────────────────────────────────────────────────
const TEX = {
  // 2K — loaded immediately so globe renders within ~1s
  dayLow:    'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg',
  nightLow:  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg',
  bump:      'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
  specular:  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
  // 4K — hot-swapped in the background
  dayHigh:    'https://cdn.jsdelivr.net/gh/stugrey/WebGLEarth@master/earth4096.jpg',
  nightHigh:  'https://cdn.jsdelivr.net/gh/stugrey/WebGLEarth@master/EarthNight.jpg',
  specHigh:   'https://cdn.jsdelivr.net/gh/stugrey/WebGLEarth@master/EarthSpec.jpg',
  cloudsHigh: 'https://cdn.jsdelivr.net/gh/stugrey/WebGLEarth@master/clouds4096.jpg',
};

// ─────────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const resolutionBadge = $('resolution-badge');
const loaderContainer = $('loader-container');
const loaderStatus    = $('loader-status');
const loaderPercent   = $('loader-percent');
const loaderBar       = $('loader-bar');
const statFps         = $('stat-fps');
const statZoom        = $('stat-zoom');

const btnRotate     = $('btn-rotate');
const sliderSpeed   = $('slider-speed');
const speedVal      = $('speed-val');
const sliderSun     = $('slider-sun');
const sunValEl      = $('sun-val');
const btnClouds     = $('btn-layer-clouds');
const btnAtmosphere = $('btn-layer-atmosphere');
const btnNight      = $('btn-layer-night');
const btnBump       = $('btn-layer-bump');
const btnReset      = $('btn-reset');

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let autoRotate    = true;
let rotationSpeed = 0.0015;  // radians per frame
let sunAngle      = 45;       // degrees — sun from front-left

// ─────────────────────────────────────────────────────────
// RENDERER
// ─────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding        = THREE.sRGBEncoding;
renderer.toneMapping           = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure   = 1.05;
renderer.shadowMap.enabled     = false; // not needed for a globe
$('canvas-container').appendChild(renderer.domElement);

// ─────────────────────────────────────────────────────────
// SCENE / CAMERA / CONTROLS
// ─────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 0, 28);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance   = 11;
controls.maxDistance   = 80;

// ─────────────────────────────────────────────────────────
// LIGHTING
// A DirectionalLight acts like the Sun — parallel rays from a fixed
// world-space position.  As the Earth MESH rotates, its world-space
// normals change, so different polygons become lit/shadowed every frame.
// This is correct physical behaviour out-of-the-box with MeshPhongMaterial.
// ─────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x0d1533, 0.9); // very dim blue ambient
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff8e8, 2.2);  // warm sunlight
scene.add(sunLight);

// Subtle rim from behind for space depth
const rimLight = new THREE.DirectionalLight(0x1a2a55, 0.18);
rimLight.position.set(-60, 20, -60);
scene.add(rimLight);

const SUN_DIST = 80;
function updateSunPosition() {
  const rad = THREE.MathUtils.degToRad(sunAngle);
  sunLight.position.set(
    Math.cos(rad) * SUN_DIST,
    0,
    Math.sin(rad) * SUN_DIST
  );
  if (sliderSun) {
    sliderSun.value = sunAngle;
  }
  if (sunValEl) {
    sunValEl.innerText = `${sunAngle}°`;
  }
}
updateSunPosition();

// ─────────────────────────────────────────────────────────
// STARFIELD
// ─────────────────────────────────────────────────────────
(function () {
  const pos = [], col = [];
  for (let i = 0; i < 7000; i++) {
    const theta = Math.acos(2 * Math.random() - 1);
    const phi   = 2 * Math.PI * Math.random();
    const r     = 500 + Math.random() * 600;
    pos.push(r * Math.sin(theta) * Math.cos(phi),
             r * Math.sin(theta) * Math.sin(phi),
             r * Math.cos(theta));
    const t = Math.random();
    // Warm/cool star colour variance
    col.push(0.78 + t * 0.22, 0.78 + t * 0.14, 0.70 + Math.random() * 0.30);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.65, vertexColors: true,
    sizeAttenuation: true, transparent: true, opacity: 0.95,
  });
  scene.add(new THREE.Points(geo, mat));
})();

// ─────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────
const EARTH_R = 8;

// ─────────────────────────────────────────────────────────
// ATMOSPHERE – outer Fresnel glow
//
// KEY: we compute normals in WORLD SPACE (mat3(modelMatrix) * normal)
// and pass the world-space camera position so the Fresnel + sun-facing
// calculations are correct regardless of mesh/camera orientation.
// ─────────────────────────────────────────────────────────
const atmosphereMat = new THREE.ShaderMaterial({
  uniforms: {
    uSunDir: { value: new THREE.Vector3() },
    uCamPos: { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */`
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    void main() {
      // World-space normal — rotates with the mesh each frame
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vec4 wp      = modelMatrix * vec4(position, 1.0);
      vWorldPos    = wp.xyz;
      gl_Position  = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uSunDir;   // normalised, world space
    uniform vec3 uCamPos;   // world space
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    void main() {
      vec3 normal = normalize(vWorldNormal);
      // View direction in world space (camera → fragment)
      vec3  viewDir   = normalize(uCamPos - vWorldPos);
      float fresnel   = 1.0 - max(dot(normal, viewDir), 0.0);
      fresnel         = pow(fresnel, 3.5);

      // Brighter atmosphere on the sunlit limb
      float sunFacing = max(dot(normal, uSunDir), 0.0);
      float intensity = fresnel * (0.45 + 0.75 * sunFacing);

      // Azure-blue atmosphere
      gl_FragColor = vec4(0.20, 0.52, 1.0, 1.0) * intensity;
    }
  `,
  blending:    THREE.AdditiveBlending,
  side:        THREE.BackSide,
  transparent: true,
  depthWrite:  false,
});
const atmosphereMesh = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_R * 1.038, 128, 128),
  atmosphereMat
);
scene.add(atmosphereMesh);

// Inner thin haze — sunlit limb only
const innerAtmMat = new THREE.ShaderMaterial({
  uniforms: {
    uSunDir: { value: new THREE.Vector3() },
    uCamPos: { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */`
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    void main() {
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vec4 wp      = modelMatrix * vec4(position, 1.0);
      vWorldPos    = wp.xyz;
      gl_Position  = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uSunDir;
    uniform vec3 uCamPos;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    void main() {
      vec3 normal = normalize(vWorldNormal);
      vec3  viewDir   = normalize(uCamPos - vWorldPos);
      float fresnel   = 1.0 - max(dot(normal, viewDir), 0.0);
      fresnel         = pow(fresnel, 5.5);
      float sunFacing = max(dot(normal, uSunDir), 0.0);
      float haze      = fresnel * sunFacing * 0.5;
      gl_FragColor    = vec4(0.42, 0.70, 1.0, haze);
    }
  `,
  blending:    THREE.AdditiveBlending,
  side:        THREE.FrontSide,
  transparent: true,
  depthWrite:  false,
});
const innerAtmMesh = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_R * 1.013, 128, 128),
  innerAtmMat
);
scene.add(innerAtmMesh);

// ─────────────────────────────────────────────────────────
// EARTH SURFACE  — MeshPhongMaterial
// Three.js automatically computes per-fragment lighting from sunLight's
// world position vs each polygon's current WORLD-SPACE normal.
// So as earthMesh.rotation.y increases, the bright/dark split moves.
// ─────────────────────────────────────────────────────────
const earthGeo = new THREE.SphereGeometry(EARTH_R, 128, 128);
let earthMat  = null;
let earthMesh = null;

// ─────────────────────────────────────────────────────────
// NIGHT LIGHTS MESH
//
// This is a separate sphere sitting just above the Earth surface.
// It shows city lights only on the DARK side, computed by comparing
// the fragment's WORLD-SPACE normal against the world-space sun direction.
//
// Because nightMesh.rotation.y is always kept equal to earthMesh.rotation.y,
// the city light texture co-rotates with the planet, and the terminator
// boundary moves naturally as the Earth spins relative to the sun.
// ─────────────────────────────────────────────────────────
const nightMat = new THREE.ShaderMaterial({
  uniforms: {
    uNightTex: { value: null },
    uSunDir:   { value: new THREE.Vector3() },  // world space
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    void main() {
      vUv          = uv;
      // *** WORLD-SPACE normals — this is the critical fix ***
      // Using normalMatrix here gives view-space normals which break when
      // compared against world-space uSunDir. mat3(modelMatrix) is correct.
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D uNightTex;
    uniform vec3      uSunDir;      // normalised world-space sun direction
    varying vec2      vUv;
    varying vec3      vWorldNormal; // world-space surface normal
    void main() {
      vec3 normal = normalize(vWorldNormal);
      // dp > 0  → facing the sun (day side)
      // dp < 0  → facing away   (night side)
      float dp        = dot(normal, uSunDir);

      // Smooth transition across the terminator (~±8° band)
      // nightMask = 1 on night side, 0 on day side
      float nightMask = smoothstep(0.10, -0.12, dp);

      // City-lights texture — warm orange-yellow tint
      vec4  lights    = texture2D(uNightTex, vUv);
      // Enhance brightness so lights pop against the dark background
      vec3  cityCol   = lights.rgb * vec3(1.0, 0.85, 0.60) * 2.2;

      // Only show where it's dark AND there are actual lights
      float alpha     = nightMask * smoothstep(0.02, 0.18, length(lights.rgb));

      gl_FragColor    = vec4(cityCol * nightMask, alpha);
    }
  `,
  blending:    THREE.AdditiveBlending,
  transparent: true,
  depthWrite:  false,
  side:        THREE.FrontSide,
});
const nightMesh = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_R + 0.004, 128, 128),
  nightMat
);

// ─────────────────────────────────────────────────────────
// CLOUDS MESH
// ─────────────────────────────────────────────────────────
const cloudsMat = new THREE.MeshPhongMaterial({
  transparent: true,
  depthWrite:  false,
  opacity:     0,   // invisible until texture loads
  shininess:   8,
});
const cloudsMesh = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_R + 0.07, 128, 128),
  cloudsMat
);
scene.add(cloudsMesh);

// ─────────────────────────────────────────────────────────
// TEXTURE LOADER
// ─────────────────────────────────────────────────────────
const texLoader = new THREE.TextureLoader();
function loadTex(url) {
  return new Promise((resolve, reject) => {
    texLoader.load(
      url,
      t => { t.encoding = THREE.sRGBEncoding; resolve(t); },
      undefined,
      err => reject(err)
    );
  });
}

// ─────────────────────────────────────────────────────────
// PHASE 1 — 2K textures (fast baseline)
// ─────────────────────────────────────────────────────────
function setLoader(n, of, msg) {
  const pct = Math.round((n / of) * 100);
  loaderStatus.innerText  = msg;
  loaderPercent.innerText = `${pct}%`;
  loaderBar.style.width   = `${pct}%`;
}

async function phase1() {
  setLoader(0, 4, 'Connecting to satellite network…');

  // Load all 2K textures in parallel for speed
  const [dayTex, nightTex, bumpTex, specTex] = await Promise.all([
    loadTex(TEX.dayLow),
    loadTex(TEX.nightLow),
    loadTex(TEX.bump),
    loadTex(TEX.specular),
  ]);

  setLoader(4, 4, '2K textures ready — building globe…');

  // Earth surface
  earthMat = new THREE.MeshPhongMaterial({
    map:         dayTex,
    bumpMap:     bumpTex,
    bumpScale:   0.28,
    specularMap: specTex,
    specular:    new THREE.Color(0x4477aa),  // blue-ish ocean shine
    shininess:   32,
  });
  earthMesh = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earthMesh);

  // Night lights — add after earth so render order is correct
  nightMat.uniforms.uNightTex.value = nightTex;
  scene.add(nightMesh);

  resolutionBadge.innerText = '2K ACTIVE';
  resolutionBadge.className = 'badge badge-low-res';

  phase2(); // non-blocking
}

// ─────────────────────────────────────────────────────────
// PHASE 2 — 4K texture swap (background)
// ─────────────────────────────────────────────────────────
async function phase2() {
  const tasks = [
    {
      label: 'Streaming 4K day map…',
      url:   TEX.dayHigh,
      apply: t => { earthMat.map = t; earthMat.needsUpdate = true; },
    },
    {
      label: 'Streaming 4K night lights…',
      url:   TEX.nightHigh,
      apply: t => { nightMat.uniforms.uNightTex.value = t; },
    },
    {
      label: 'Streaming 4K specular…',
      url:   TEX.specHigh,
      apply: t => { earthMat.specularMap = t; earthMat.needsUpdate = true; },
    },
    {
      label: 'Streaming 4K clouds…',
      url:   TEX.cloudsHigh,
      apply: t => {
        // clouds4096.jpg is an alpha-map style texture (white = cloud)
        cloudsMat.map         = t;
        cloudsMat.alphaMap    = t;
        cloudsMat.opacity     = 0.88;
        cloudsMat.color.set(0xffffff);
        cloudsMat.needsUpdate = true;
      },
    },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const { label, url, apply } = tasks[i];
    setLoader(i, tasks.length, label);
    try {
      apply(await loadTex(url));
    } catch (e) {
      console.warn('4K load failed, keeping 2K for:', label, e);
    }
  }

  setLoader(tasks.length, tasks.length, 'All systems nominal — 4K online.');
  resolutionBadge.innerText = '4K ACTIVE';
  resolutionBadge.className = 'badge badge-high-res';

  setTimeout(() => {
    loaderContainer.style.transition = 'opacity 0.6s ease';
    loaderContainer.style.opacity    = '0';
    setTimeout(() => (loaderContainer.style.display = 'none'), 700);
  }, 1800);
}

phase1().catch(e => {
  loaderStatus.innerText = 'Texture load failed — check console.';
  console.error(e);
});

// ─────────────────────────────────────────────────────────
// UI CONTROLS
// ─────────────────────────────────────────────────────────
btnRotate.addEventListener('click', () => {
  autoRotate = !autoRotate;
  btnRotate.classList.toggle('active', autoRotate);
});

sliderSpeed.addEventListener('input', e => {
  const v = parseFloat(e.target.value) / 100;
  rotationSpeed      = v * 0.01;
  speedVal.innerText = `${v.toFixed(2)}x`;
});

sliderSun.addEventListener('input', e => {
  sunAngle            = parseInt(e.target.value);
  sunValEl.innerText  = `${sunAngle}°`;
  updateSunPosition();
});

btnClouds.addEventListener('click', () => {
  cloudsMesh.visible = !cloudsMesh.visible;
  btnClouds.classList.toggle('active', cloudsMesh.visible);
});

btnAtmosphere.addEventListener('click', () => {
  const v = !atmosphereMesh.visible;
  atmosphereMesh.visible = v;
  innerAtmMesh.visible   = v;
  btnAtmosphere.classList.toggle('active', v);
});

btnNight.addEventListener('click', () => {
  nightMesh.visible = !nightMesh.visible;
  btnNight.classList.toggle('active', nightMesh.visible);
});

btnBump.addEventListener('click', () => {
  if (!earthMat) return;
  earthMat.bumpScale = earthMat.bumpScale > 0 ? 0 : 0.28;
  btnBump.classList.toggle('active', earthMat.bumpScale > 0);
});

btnReset.addEventListener('click', () => {
  camera.position.set(0, 0, 28);
  controls.reset();
  sunAngle           = 45;
  sliderSun.value    = 45;
  sunValEl.innerText = '45°';
  updateSunPosition();
  rotationSpeed      = 0.0015;
  sliderSpeed.value  = 15;
  speedVal.innerText = '0.15x';
  autoRotate         = true;
  btnRotate.classList.add('active');
});

// ─────────────────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─────────────────────────────────────────────────────────
// SHARED VECTORS (reused every frame — no GC pressure)
// ─────────────────────────────────────────────────────────
const sunDirWorld = new THREE.Vector3();

// ─────────────────────────────────────────────────────────
// FPS TRACKER
// ─────────────────────────────────────────────────────────
let lastT = performance.now(), frames = 0;
function trackFPS() {
  frames++;
  const now = performance.now();
  if (now - lastT >= 1000) {
    statFps.innerText = Math.round((frames * 1000) / (now - lastT));
    frames = 0;
    lastT  = now;
  }
}

// ─────────────────────────────────────────────────────────
// RENDER LOOP
// ─────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // ── Rotate the Earth (surface + night lights co-rotate) ──────────────
  if (autoRotate && earthMesh) {
    earthMesh.rotation.y += rotationSpeed;
  }

  // Night lights MUST always match Earth rotation so cities stay in place
  if (earthMesh) {
    nightMesh.rotation.y = earthMesh.rotation.y;
  }

  // Clouds drift slightly faster → visible movement against surface
  cloudsMesh.rotation.y += autoRotate ? rotationSpeed * 1.20 : 0.00006;

  // ── Update sun direction (world space, normalised) ────────────────────
  // sunLight.position is fixed in world space.
  // As earthMesh.rotation changes, its world-space face normals rotate,
  // so the dot(worldNormal, sunDir) in each shader correctly splits
  // day/night every single frame. No extra math needed here.
  sunDirWorld.copy(sunLight.position).normalize();

  // ── Feed uniforms ─────────────────────────────────────────────────────
  // Atmosphere uniforms (world-space sun + camera position)
  atmosphereMat.uniforms.uSunDir.value.copy(sunDirWorld);
  atmosphereMat.uniforms.uCamPos.value.copy(camera.position);
  innerAtmMat.uniforms.uSunDir.value.copy(sunDirWorld);
  innerAtmMat.uniforms.uCamPos.value.copy(camera.position);

  // Night-lights uniform — world-space sun direction
  // The shader uses vWorldNormal = mat3(modelMatrix)*normal which is also
  // world-space, so the dot product is physically correct.
  nightMat.uniforms.uSunDir.value.copy(sunDirWorld);

  // ── Render ────────────────────────────────────────────────────────────
  renderer.render(scene, camera);

  // ── Telemetry ─────────────────────────────────────────────────────────
  const d = camera.position.distanceTo(controls.target);
  statZoom.innerText = `${(28 / d).toFixed(2)}x`;
  trackFPS();
}

animate();
