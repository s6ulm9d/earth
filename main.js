import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─────────────────────────────────────────────────────────
// VERIFIED TEXTURE URLS (2K fast start, 8K streaming background)
// ─────────────────────────────────────────────────────────
const TEX = {
  // 2K — loaded immediately so globe renders within ~1s
  dayLow:    'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg',
  nightLow:  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg',
  bump:      'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
  specular:  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
  // 8K — hot-swapped in the background
  dayHigh:    'https://cdn.jsdelivr.net/gh/Siqister/files/8k_earth_daymap.jpg',
  nightHigh:  'https://cdn.jsdelivr.net/gh/Siqister/files/8k_earth_nightmap.jpg',
  specHigh:   'https://cdn.jsdelivr.net/gh/Siqister/files/8k_earth_specular_map.jpg',
  normalHigh: 'https://cdn.jsdelivr.net/gh/Siqister/files/8k_earth_normal_map.jpg',
  cloudsHigh: 'https://cdn.jsdelivr.net/gh/Siqister/files/8k_earth_clouds.jpg',
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

const btnSettingsToggle = $('btn-settings-toggle');
const settingsCard      = $('settings-card');

const btnRotate     = $('btn-rotate');
const sliderSpeed   = $('slider-speed');
const speedVal      = $('speed-val');
const sliderSun     = $('slider-sun');
const sunValEl      = $('sun-val');
const btnClouds     = $('btn-layer-clouds');
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
renderer.shadowMap.enabled     = false;
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
// EARTH SURFACE — MeshPhongMaterial
// ─────────────────────────────────────────────────────────
const earthGeo = new THREE.SphereGeometry(EARTH_R, 128, 128);
let earthMat  = null;
let earthMesh = null;

// ─────────────────────────────────────────────────────────
// NIGHT LIGHTS MESH (custom terminator shader)
// ─────────────────────────────────────────────────────────
const nightMat = new THREE.ShaderMaterial({
  uniforms: {
    uNightTex: { value: null },
    uSunDir:   { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    void main() {
      vUv          = uv;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D uNightTex;
    uniform vec3      uSunDir;
    varying vec2      vUv;
    varying vec3      vWorldNormal;
    void main() {
      vec3 normal = normalize(vWorldNormal);
      float dp    = dot(normal, uSunDir);
      float nightMask = smoothstep(0.10, -0.12, dp);
      vec4  lights    = texture2D(uNightTex, vUv);
      vec3  cityCol   = lights.rgb * vec3(1.0, 0.85, 0.60) * 2.2;
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
  setLoader(0, 5, 'Connecting to satellite network…');

  const [dayTex, nightTex, bumpTex, specTex] = await Promise.all([
    loadTex(TEX.dayLow),
    loadTex(TEX.nightLow),
    loadTex(TEX.bump),
    loadTex(TEX.specular),
  ]);

  setLoader(5, 5, '2K textures ready — building globe…');

  earthMat = new THREE.MeshPhongMaterial({
    map:         dayTex,
    bumpMap:     bumpTex,
    bumpScale:   0.28,
    specularMap: specTex,
    specular:    new THREE.Color(0x4477aa),
    shininess:   32,
  });
  earthMesh = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earthMesh);

  nightMat.uniforms.uNightTex.value = nightTex;
  scene.add(nightMesh);

  resolutionBadge.innerText = '2K ACTIVE';
  resolutionBadge.className = 'badge badge-low-res';

  phase2();
}

// ─────────────────────────────────────────────────────────
// PHASE 2 — 8K texture swap (background stream)
// ─────────────────────────────────────────────────────────
async function phase2() {
  const tasks = [
    {
      label: 'Streaming 8K day map…',
      url:   TEX.dayHigh,
      apply: t => { earthMat.map = t; earthMat.needsUpdate = true; },
    },
    {
      label: 'Streaming 8K night lights…',
      url:   TEX.nightHigh,
      apply: t => { nightMat.uniforms.uNightTex.value = t; },
    },
    {
      label: 'Streaming 8K specular…',
      url:   TEX.specHigh,
      apply: t => { earthMat.specularMap = t; earthMat.needsUpdate = true; },
    },
    {
      label: 'Streaming 8K terrain details…',
      url:   TEX.normalHigh,
      apply: t => {
        earthMat.bumpMap = null;
        earthMat.bumpScale = 0;
        earthMat.normalMap = t;
        earthMat.normalScale.set(0.6, 0.6);
        earthMat.needsUpdate = true;
      },
    },
    {
      label: 'Streaming 8K clouds…',
      url:   TEX.cloudsHigh,
      apply: t => {
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
      console.warn('8K load failed, keeping fallback for:', label, e);
    }
  }

  setLoader(tasks.length, tasks.length, 'All systems nominal — 8K online.');
  resolutionBadge.innerText = '8K ACTIVE';
  resolutionBadge.className = 'badge badge-high-res';

  setTimeout(() => {
    loaderContainer.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    loaderContainer.style.opacity    = '0';
    loaderContainer.style.transform  = 'translateY(-10px)';
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
if (btnSettingsToggle && settingsCard) {
  btnSettingsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsCard.classList.toggle('collapsed');
  });
  
  // Close menu if clicked outside
  document.addEventListener('click', (e) => {
    if (!settingsCard.contains(e.target) && e.target !== btnSettingsToggle) {
      settingsCard.classList.add('collapsed');
    }
  });
}

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

btnNight.addEventListener('click', () => {
  nightMesh.visible = !nightMesh.visible;
  btnNight.classList.toggle('active', nightMesh.visible);
});

btnBump.addEventListener('click', () => {
  if (!earthMat) return;
  if (earthMat.normalMap) {
    const active = earthMat.normalScale.x > 0;
    const val = active ? 0 : 0.6;
    earthMat.normalScale.set(val, val);
    btnBump.classList.toggle('active', !active);
  } else {
    earthMat.bumpScale = earthMat.bumpScale > 0 ? 0 : 0.28;
    btnBump.classList.toggle('active', earthMat.bumpScale > 0);
  }
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
// SHARED VECTORS
// ─────────────────────────────────────────────────────────
const sunDirWorld = new THREE.Vector3();

// ─────────────────────────────────────────────────────────
// RENDER LOOP
// ─────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (autoRotate && earthMesh) {
    earthMesh.rotation.y += rotationSpeed;
  }

  if (earthMesh) {
    nightMesh.rotation.y = earthMesh.rotation.y;
  }

  cloudsMesh.rotation.y += autoRotate ? rotationSpeed * 1.20 : 0.00006;

  sunDirWorld.copy(sunLight.position).normalize();
  nightMat.uniforms.uSunDir.value.copy(sunDirWorld);

  renderer.render(scene, camera);
}

animate();
