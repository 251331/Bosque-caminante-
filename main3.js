import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/** ========= CONFIG ========= */
const WORLD_SIZE = 260;      // tamaño del mundo
const TERRAIN_RES = 256;     // subdivisiones del terreno (potencia de 2)
const TERRAIN_MAX_H = 2.6;   // altura máxima del terreno
const TREE_COUNT = 520;      // número de árboles
const ICEBERG_COUNT = 56;    // número de icebergs
const SPAWN_CLEAR_R = 6;     // radio despejado alrededor de spawn
const FOG_DENSITY = 0.005;   // niebla nocturna
const VR_WALK_SPEED = 3.6;   // velocidad al caminar con stick
const VR_STRAFE_SPEED = 3.0;
const ARC_STEPS = 40;        // puntos del arco de teletransporte
const ARC_SPEED = 7.5;       // velocidad inicial del arco
const ARC_GRAVITY = 9.8;     // gravedad del arco
const HDRI_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonless_golf_1k.hdr'; // IBL nocturna (Poly Haven)

/** ========= ESCENA BÁSICA ========= */
const canvas = document.getElementById('scene');
const ambientEl = document.getElementById('ambient');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xA9D6F4); // Azul claro pastel
scene.fog = new THREE.FogExp2(0x06080f, FOG_DENSITY);

// Grupo mundo para objetos estáticos
const world = new THREE.Group();
scene.add(world);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2000);

// Configuración inicial de la cámara
const cameraOffset = new THREE.Vector3(0, 1.6, 10); // Cámara ligeramente detrás del jugador

// Establecer la posición inicial de la cámara
camera.position.set(0, 1.6, 10); // Posición inicial detrás del camino

// Hacer que la cámara mire hacia el camino
camera.lookAt(0, 1.6, 0); // Apuntar hacia el comienzo del camino

// Posición virtual del jugador
const player = new THREE.Vector3(0, 1.6, 3);

/** ========= IBL / HDRI ========= */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
new RGBELoader().load(HDRI_URL, (hdr) => {
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = envMap;
  hdr.dispose();
  pmrem.dispose();
});

/** ========= ILUMINACIÓN ========= */
const hemi = new THREE.HemisphereLight(0x8fb2ff, 0x0a0c10, 0.35);
scene.add(hemi);

const moonLight = new THREE.DirectionalLight(0xcfe2ff, 0.9);
moonLight.position.set(-30, 35, 10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 180;
scene.add(moonLight);

// “luna” visual
const moon = new THREE.Mesh(
  new THREE.CircleGeometry(2.6, 64),
  new THREE.MeshBasicMaterial({ color: 0xd8e6ff })
);
moon.position.set(-90, 70, -60);
world.add(moon);

// Relleno suave
scene.add(new THREE.AmbientLight(0x223344, 0.12));

/** ========= CÚPULA DE ESTRELLAS ========= */
(function addStars() {
  const starsGeo = new THREE.BufferGeometry();
  const COUNT = 2500;
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    // distribuye en esfera grande
    const r = 600 + Math.random() * 300;
    const a = Math.random() * Math.PI * 2;
    const b = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(b) * Math.cos(a);
    positions[i * 3 + 1] = r * Math.cos(b);
    positions[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starsMat = new THREE.PointsMaterial({ size: 0.9, sizeAttenuation: true, color: 0xffffff });
  const stars = new THREE.Points(starsGeo, starsMat);
  world.add(stars);
})();

/** ========= OCÉANO LOW-POLY ========= */
const oceanHeight = 0.3; // Ajusta la altura máxima del océano
const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_RES, TERRAIN_RES);
terrainGeo.rotateX(-Math.PI / 2);

// Deformación controlada para el océano
const pos = terrainGeo.attributes.position;
const t = 0; // Tiempo inicial para deformación estática
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const z = pos.getZ(i);
  // Olas con amplitud más pequeña
  const waveHeight = Math.sin(x * 0.02 + t) * oceanHeight + Math.cos(z * 0.02 + t) * oceanHeight;
  pos.setY(i, waveHeight);  // Reducir la amplitud para un océano más tranquilo
}

pos.needsUpdate = true;
terrainGeo.computeVertexNormals(); // Recalcular normales

// Crear olas con funciones seno
function updateTerrainWaves(t) {
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Onda sinusoidal que genera el efecto de olas, más sutil
    const waveHeight = Math.sin(x * 0.02 + t) * oceanHeight + Math.cos(z * 0.02 + t) * oceanHeight;
    pos.setY(i, waveHeight);  // Reducir la amplitud para olas más suaves
  }
  pos.needsUpdate = true;
  terrainGeo.computeVertexNormals(); // Recalcular normales para iluminación correcta
}

// Material para el océano
const terrainMat = new THREE.MeshStandardMaterial({
  color: 0x7AD2F7,  // Azul del océano
  roughness: 0.5,
  metalness: 0.1
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
world.add(terrain);

/** ========= CAMINO DE HIELO ELEVADO ========= */
const pathWidth = 10;  // Ancho del camino
const pathLength = 3000;  // Longitud del camino
const pathDensity = 20;  // Subdivisiones para mayor detalle

// Crear el plano para el camino
const pathGeo = new THREE.PlaneGeometry(pathWidth, pathLength, pathDensity, pathDensity);
pathGeo.rotateX(-Math.PI / 2);

// Deformación para el camino (bloques de hielo)
const pathPos = pathGeo.attributes.position;
for (let i = 0; i < pathPos.count; i++) {
  const x = pathPos.getX(i);
  const z = pathPos.getZ(i);
  const height = Math.sin(x * 0.1) * 0.3 + Math.cos(z * 0.1) * 0.3; // Efecto de altura
  pathPos.setY(i, height + 1.6);  // Elevación del camino por encima del océano
}

pathGeo.computeVertexNormals();  // Recalcular normales para iluminación correcta

// Material para el camino de hielo
const pathMat = new THREE.MeshStandardMaterial({
  color: 0x7FDBFF,  // Color de hielo azul claro
  roughness: 0.3,   // Suaviza la rugosidad para reflejar un poco
  metalness: 0.2,   // Le da un efecto de reflexión
  flatShading: true  // Mantiene la apariencia angular
});

// Crear la malla del camino
const path = new THREE.Mesh(pathGeo, pathMat);
world.add(path);

/** ========= ÁRBOLES SOBRE EL CAMINO ========= */
let trees = []; // Array para almacenar los pinos generados

function addTree(x, z, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * scale, 0.22 * scale, 2.6 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2b1a, roughness: 1 })
  );
  trunk.castShadow = true;
  trunk.receiveShadow = true;

  const crowns = new THREE.Group();
  const levels = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < levels; i++) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry((1.6 - i * 0.25) * scale, (2.2 - i * 0.25) * scale, 10),
      new THREE.MeshStandardMaterial({ color: 0x0f2d1c, roughness: 0.9, metalness: 0.0, emissive: 0x001100, emissiveIntensity: 0.05 })
    );
    crown.castShadow = true;
    crown.position.y = (2.0 + i * 0.7) * scale;
    crowns.add(crown);
  }

  const tree = new THREE.Group();
  tree.add(trunk, crowns);

  const y = getTerrainHeight(x, z) + 0.5;  // Aseguramos que el árbol esté sobre el camino
  tree.position.set(x, y, z);
  world.add(tree);
  return tree;
}

// Función para crear un árbol
function addRandomTree() {
  // Generar una posición aleatoria a lo largo del camino
  const randomX = Math.random() * pathWidth - pathWidth / 2; // Aleatorio entre -pathWidth/2 y pathWidth/2
  const randomZ = player.z - 200 - Math.random() * 1000; // Z menor para simular que aparece más adelante
  const scale = 0.8 + Math.random() * 1.5; // Tamaño aleatorio para cada árbol

  const tree = addTree(randomX, randomZ, scale); // Función para agregar el árbol en la escena
  tree.userData = { x: randomX, z: randomZ, scale }; // Almacenamos datos en userData
  trees.push(tree); // Almacenamos el árbol directamente
}

// Función para mover los árboles en el camino
function moveTrees() {
  trees.forEach(tree => {
    tree.userData.z += 3; // Movimiento de los árboles hacia el lado opuesto (en el eje Z)

    // Reemplazamos los árboles cuando cruzan la zona visible
    if (tree.userData.z > camera.position.z + 200) {
      tree.userData.z = camera.position.z - 1000; // Los reseteamos al frente
      tree.userData.x = Math.random() * pathWidth - pathWidth / 2;
      tree.userData.scale = 0.8 + Math.random() * 1.5; // Cambio de tamaño aleatorio
    }

    // Actualiza la posición de cada árbol en la escena
    tree.position.set(tree.userData.x, getTerrainHeight(tree.userData.x, tree.userData.z) + 0.5, tree.userData.z);
  });
}

// Función para programar el próximo árbol con intervalo aleatorio
function scheduleNextTree() {
  const delay = 1000 + Math.random() * 3000; // Intervalo aleatorio entre 1 y 4 segundos
  setTimeout(() => {
    addRandomTree();
    scheduleNextTree(); // Llamar recursivamente para el siguiente
  }, delay);
}

function getTerrainHeight(x, z) {
  // Raycast desde arriba hacia el camino para obtener la altura correcta
  _raycaster.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));  // Comienza desde una altura elevada
  const hits = _raycaster.intersectObject(path, false);  // Solo chequea el camino

  if (hits.length > 0) {
    return hits[0].point.y;  // Devuelve la altura del camino
  }

  // Si no detecta intersección, podemos retornar 0 o una altura por defecto
  return 0;
}

const _raycaster = new THREE.Raycaster();
const raycaster = new THREE.Raycaster(); // Raycaster global para controladores VR

// Iniciar la generación aleatoria de árboles
scheduleNextTree();

// Add a test tree close to the camera
addTree(0, -50, 1);

/** ========= ICEBERGS ========= */
const icebergs = [];

function addIceberg(x, z) {
  const y = 0.5; // Posición sobre el océano, no sobre el camino

  // Material para el iceberg (hielo)
  const icebergMat = new THREE.MeshStandardMaterial({
    color: 0xADD8E6,  // Color hielo (azul claro)
    roughness: 0.5,
    metalness: 0.1,
    emissive: new THREE.Color(0xA9D6F4), // Luz tenue, para simular frío
    emissiveIntensity: 0.4
  });

  // Geometría del iceberg (puedes experimentar con diferentes formas)
  const baseGeometry = new THREE.ConeGeometry(1.5, 3, 4);  // Cono invertido para dar forma
  baseGeometry.rotateX(Math.PI);  // Volteamos el cono para que apunte hacia arriba
  const iceberg = new THREE.Mesh(baseGeometry, icebergMat);
  iceberg.castShadow = true;
  iceberg.receiveShadow = true;

  // Para hacer el iceberg más interesante, podemos agregar "picos"
  const spikes = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const spikeGeometry = new THREE.ConeGeometry(0.2, 0.8, 3); // Pequeños conos para los picos
    const spike = new THREE.Mesh(spikeGeometry, icebergMat);
    // Variar la orientación: algunos hacia arriba, otros hacia abajo
    spike.rotation.x = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    spike.position.set(Math.random() * 0.8 - 0.4, 1.4, Math.random() * 0.8 - 0.4); // Posición aleatoria en el iceberg
    spikes.add(spike);
  }

  iceberg.add(spikes);

  // Crear una luz para simular un brillo tenue, como un faro en el iceberg (debajo)
  const light = new THREE.PointLight(0xA9D6F4, 1, 5, 2);
  light.position.set(0, -0.5, 0);
  iceberg.add(light);

  // Agregar el iceberg a la escena
  iceberg.position.set(x, y, z);
  world.add(iceberg);
}

for (let i = 0; i < ICEBERG_COUNT; i++) {
  let x, z;
  do {
    x = (Math.random() - 0.5) * WORLD_SIZE;
    z = (Math.random() - 0.5) * WORLD_SIZE;
  } while (Math.abs(x) <= pathWidth / 2 || Math.hypot(x - player.x, z - player.z) < SPAWN_CLEAR_R + 2);
  addIceberg(x, z);
}



/** ========= MANDO VR: LOCOMOCIÓN + TELEPORT ========= */
const vrBtn = VRButton.createButton(renderer);
vrBtn.classList.add('vr-button');
document.body.appendChild(vrBtn);

// Controladores
const controllerLeft = renderer.xr.getController(0);
const controllerRight = renderer.xr.getController(1);
scene.add(controllerLeft, controllerRight);

// Estado de presión para los controladores
controllerLeft.isPressing = false;
controllerRight.isPressing = false;

// Event listeners para detectar presión de botones
controllerLeft.addEventListener('selectstart', () => {
  controllerLeft.isPressing = true;
});
controllerLeft.addEventListener('selectend', () => {
  controllerLeft.isPressing = false;
});

controllerRight.addEventListener('selectstart', () => {
  controllerRight.isPressing = true;
});
controllerRight.addEventListener('selectend', () => {
  controllerRight.isPressing = false;
});

const controllerModelFactory = new XRControllerModelFactory();
const controllerGrip0 = renderer.xr.getControllerGrip(0);
controllerGrip0.add(controllerModelFactory.createControllerModel(controllerGrip0));
scene.add(controllerGrip0);

const controllerGrip1 = renderer.xr.getControllerGrip(1);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
scene.add(controllerGrip1);

// Arco parabólico de teletransporte
const arcMat = new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.9 });
const arcGeo = new THREE.BufferGeometry().setFromPoints(new Array(ARC_STEPS).fill(0).map(_ => new THREE.Vector3()));
const arcLine = new THREE.Line(arcGeo, arcMat);
arcLine.visible = false;
scene.add(arcLine);

let teleportValid = false;
let teleportPoint = new THREE.Vector3();

controllerRight.addEventListener('selectstart', () => {
  arcLine.visible = true;
});
controllerRight.addEventListener('selectend', () => {
  arcLine.visible = false;
  if (teleportValid) {
    // Mantén altura “ojos” respecto al terreno
    const targetY = getTerrainHeight(teleportPoint.x, teleportPoint.z) + 1.6;
    player.set(teleportPoint.x, targetY, teleportPoint.z);
  }
});

// Mover con stick izquierdo durante la sesión
renderer.xr.addEventListener('sessionstart', async () => {
  try {
    ambientEl.volume = 0.45;
    await ambientEl.play(); // se permite por gesto de entrar a VR
  } catch (e) {
    console.warn('Audio no pudo iniciar aún:', e);
  }
});

// Utilidades arco/teleport
const _arcPoints = new Float32Array(ARC_STEPS * 3);
const _tmpVec = new THREE.Vector3();

function updateTeleportArc(dt) {
  if (!arcLine.visible) return;
  teleportValid = false;

  // Origen y dirección del controlador derecho (en mundo)
  _tmpVec.set(0, 0, 0);
  controllerRight.localToWorld(_tmpVec);
  const origin = _tmpVec.clone();

  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyQuaternion(controllerRight.quaternion).normalize();

  const points = [];
  let hitPoint = null;

  // Simula trayecto balístico
  const v0 = dir.clone().multiplyScalar(ARC_SPEED);
  const g = new THREE.Vector3(0, -ARC_GRAVITY, 0);

  let p = origin.clone();
  let v = v0.clone();

  for (let i = 0; i < ARC_STEPS; i++) {
    points.push(p.clone());
    // integración simple
    v.addScaledVector(g, 1/60);
    p.addScaledVector(v, 1/60);

    // checar intersección segmento con el terreno
    const from = points[points.length - 2] || origin;
    const to = p;
    const hit = segmentIntersectTerrain(from, to);
    if (hit) {
      hitPoint = hit;
      teleportValid = true;
      break;
    }
  }

  // completar geometría del arco
  const used = points.length;
  for (let i = 0; i < ARC_STEPS; i++) {
    const idx = i * 3;
    const P = points[Math.min(i, used - 1)];
    _arcPoints[idx + 0] = P.x;
    _arcPoints[idx + 1] = P.y;
    _arcPoints[idx + 2] = P.z;
  }
  arcGeo.setAttribute('position', new THREE.BufferAttribute(_arcPoints, 3));
  arcGeo.attributes.position.needsUpdate = true;

  // punto de destino
  if (teleportValid && hitPoint) {
    teleportPoint.copy(hitPoint);
    // pequeño marcador (opcional): puedes añadir una malla si lo deseas
  }
}

function segmentIntersectTerrain(a, b) {
  // Raycast desde a hacia b
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len === 0) return null;
  dir.normalize();

  _raycaster.set(a, dir);
  _raycaster.far = len + 0.01;
  const hits = _raycaster.intersectObject(terrain, false);
  return hits[0]?.point || null;
}



// Función de raycasting para detectar la colisión con los árboles
function checkCollisionWithController(controller) {
  // Usar el raycaster global
  const controllerPosition = controller.position; // Obtiene la posición del controlador
  const controllerDirection = new THREE.Vector3(0, 0, -1); // Dirección en la que apunta el controlador

  // Aplica la rotación del controlador a la dirección
  controller.getWorldDirection(controllerDirection);

  raycaster.ray.origin.copy(controllerPosition); // El origen del rayo es la posición del controlador
  raycaster.ray.direction.copy(controllerDirection); // La dirección del rayo es hacia donde apunta el controlador

  // Realizamos la intersección con los árboles
  const intersects = raycaster.intersectObjects(trees, true); // 'true' para recursivo en grupos

  if (intersects.length > 0) {
    const intersectedObject = intersects[0].object; // El primer objeto con el que colisiona
    // Encontrar el árbol raíz
    let tree = intersectedObject;
    while (tree.parent && tree.parent !== scene) {
      tree = tree.parent;
    }
    if (trees.includes(tree) && controller.isPressing) { // Verificar si se ha presionado el botón del controlador
      removeTree(tree); // Eliminar el árbol tocado
    }
  }
}

// Función para eliminar un árbol de la escena
function removeTree(tree) {
  scene.remove(tree); // Remueve el árbol de la escena
  // Liberar recursos si es necesario
  tree.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose();
      child.material.dispose();
    }
  });
  const index = trees.indexOf(tree);
  if (index !== -1) {
    trees.splice(index, 1); // Elimina el árbol del arreglo
  }
}

// Locomoción por stick (izquierdo preferentemente)
function vrGamepadMove(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;

  for (const src of session.inputSources) {
    if (!src.gamepad) continue;

    // heurstica: el izquierdo normalmente tiene axes[2,3], si no, usa [0,1]
    const axes = src.gamepad.axes;
    let x = axes[2], y = axes[3];
    if (x === undefined || y === undefined) { x = axes[0] ?? 0; y = axes[1] ?? 0; }

    const dead = 0.12;
    if (Math.abs(x) < dead) x = 0;
    if (Math.abs(y) < dead) y = 0;
    if (x === 0 && y === 0) continue;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

    const move = new THREE.Vector3();
    move.addScaledVector(forward, -y * VR_WALK_SPEED * dt);
    move.addScaledVector(right,   x * VR_STRAFE_SPEED * dt);

    // Ajustar a la altura del terreno al mover
    const next = player.clone().add(move);
    next.y = getTerrainHeight(next.x, next.z) + 1.6;
    player.copy(next);
  }
}

/** ========= LOOP ========= */
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (renderer.xr.isPresenting) {
    vrGamepadMove(dt);
    updateTeleportArc(dt);
    // Detectar colisiones con controladores para eliminar árboles
    checkCollisionWithController(controllerLeft);
    checkCollisionWithController(controllerRight);
  }

  // Actualizar la posición de la cámara para seguir al jugador en ambos modos
  camera.position.set(player.x + cameraOffset.x, player.y + cameraOffset.y, player.z + cameraOffset.z);
  camera.lookAt(player);

  // Animar las olas con el tiempo
  const t = performance.now() * 0.002; // Controla la velocidad de las olas
  updateTerrainWaves(t);



  // Mover los árboles
  moveTrees();

  renderer.render(scene, camera);
});

/** ========= RESIZE ========= */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
/** ========= Fin ========= */