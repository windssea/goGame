import * as THREE from "three";
import type { Preferences } from "../storage";

// Procedural assets stay local and work offline.
export function buildScenery(scene: THREE.Scene, kind: Preferences["scene"]) {
  const root = new THREE.Group();
  scene.add(root);
  const resources = new Set<THREE.Material | THREE.BufferGeometry>();
  const material = (
    color: string,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      ...extra,
    });
    resources.add(m);
    return m;
  };
  const add = (
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    root.add(mesh);
    mesh.receiveShadow = true;
    return mesh;
  };
  const floor = material(
    kind === "room" ? "#6b5844" : kind === "night" ? "#202d32" : "#566b4d",
  );
  add(new THREE.BoxGeometry(42, 0.2, 42), floor, 0, -0.72, 0);
  const rim = material(kind === "room" ? "#42352b" : "#354c3b");
  add(new THREE.BoxGeometry(10.2, 0.16, 10.2), rim, 0, -0.57, 0);
  for (const x of [-3.5, 3.5])
    for (const z of [-3.5, 3.5])
      add(new THREE.CylinderGeometry(0.26, 0.34, 0.4, 10), rim, x, -0.58, z);
  const bowlMat = material("#463b30", { roughness: 0.48 });
  for (const [x, color] of [
    [-5.65, "#171c1f"],
    [5.65, "#eaece6"],
  ] as const) {
    add(
      new THREE.SphereGeometry(0.68, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      bowlMat,
      x,
      -0.35,
      3.4,
    ).rotation.x = Math.PI;
    const stone = material(color, { roughness: 0.25 });
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const mesh = add(
        new THREE.SphereGeometry(0.17, 12, 8),
        stone,
        x + Math.cos(a) * 0.36,
        -0.16 + (i % 2) * 0.04,
        3.4 + Math.sin(a) * 0.36,
      );
      mesh.scale.y = 0.42;
    }
  }
  const movers: THREE.Object3D[] = [];
  if (kind === "bamboo") {
    scene.fog = new THREE.Fog("#b5c5ad", 18, 38);
    const stalkGeo = new THREE.CylinderGeometry(0.095, 0.13, 0.9, 7),
      stalkMat = material("#486546");
    resources.add(stalkGeo);
    const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, 168);
    root.add(stalks);
    const leaves = material("#567c4b", { side: THREE.DoubleSide });
    const leafGeo = new THREE.SphereGeometry(0.25, 6, 4);
    resources.add(leafGeo);
    const leafMesh = new THREE.InstancedMesh(leafGeo, leaves, 168);
    root.add(leafMesh);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (let i = 0; i < 28; i++) {
      const x = (i % 2 ? 1 : -1) * (6.1 + (i % 5) * 0.8),
        z = -7 + (i / 28) * 14,
        h = 3.6 + (i % 4) * 0.5;
      for (let j = 0; j < 6; j++) {
        dummy.position.set(
          x + Math.sin(j + i) * 0.05,
          -0.6 + (j * h) / 6 + h / 12,
          z,
        );
        dummy.scale.set(1, h / 5.4, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        stalks.setMatrixAt(n, dummy.matrix);
        dummy.position.set(
          x + Math.cos(i + j) * 0.65,
          1 + j * 0.5,
          z + Math.sin(i + j) * 0.3,
        );
        dummy.scale.set(2.7, 0.15, 0.75);
        dummy.rotation.set(0, i + j, 0.2);
        dummy.updateMatrix();
        leafMesh.setMatrixAt(n, dummy.matrix);
        n++;
      }
    }
    movers.push(leafMesh);
    const moss = material("#75845c");
    for (let i = 0; i < 9; i++) {
      const stone = add(
        new THREE.DodecahedronGeometry(0.65 + (i % 3) * 0.25),
        moss,
        (i % 2 ? 1 : -1) * (6.2 + i * 0.22),
        -0.38,
        -5 + i * 1.4,
      );
      stone.scale.y = 0.42;
    }
  } else if (kind === "room") {
    scene.fog = new THREE.Fog("#81705a", 22, 45);
    const mat = material("#918575"),
      seams = material("#45544b");
    for (let x = -16; x <= 16; x += 4)
      for (let z = -16; z <= 16; z += 6) {
        add(new THREE.BoxGeometry(3.95, 0.035, 5.95), mat, x, -0.595, z);
        add(new THREE.BoxGeometry(0.09, 0.045, 5.95), seams, x + 1.8, -0.57, z);
      }
    const paper = material("#eee7d6", {
        emissive: "#e8d9b5",
        emissiveIntensity: 0.15,
      }),
      frame = material("#3e3830");
    for (let x = -10; x <= 10; x += 4) {
      add(new THREE.BoxGeometry(3.8, 5, 0.12), paper, x, 1.9, -8);
      for (let j = 0; j < 6; j++)
        add(new THREE.BoxGeometry(3.9, 0.06, 0.18), frame, x, -0.5 + j, -7.9);
      for (const dx of [-1.95, 0, 1.95])
        add(new THREE.BoxGeometry(0.065, 5, 0.2), frame, x + dx, 1.9, -7.9);
    }
    add(new THREE.BoxGeometry(23, 0.24, 0.5), frame, 0, 4.45, -8);
  } else {
    scene.fog = new THREE.Fog("#1b2930", 16, 38);
    const water = material("#2d4e58", { roughness: 0.2, metalness: 0.32 });
    add(new THREE.BoxGeometry(28, 0.04, 8), water, 0, -0.58, -11);
    const stone = material("#687475"),
      glow = material("#ffd49c", {
        emissive: "#ffa74e",
        emissiveIntensity: 1.5,
      });
    for (const x of [-6.7, 6.7]) {
      add(new THREE.CylinderGeometry(0.38, 0.6, 1.6, 6), stone, x, 0.1, -4.7);
      add(new THREE.BoxGeometry(0.8, 0.65, 0.8), glow, x, 1.05, -4.7);
      add(
        new THREE.ConeGeometry(0.95, 0.5, 4),
        stone,
        x,
        1.65,
        -4.7,
      ).rotation.y = Math.PI / 4;
      const lamp = new THREE.PointLight("#ffd9a0", 7, 8, 2);
      lamp.position.set(x, 1.3, -4.7);
      root.add(lamp);
    }
  }
  return {
    animate: (time: number) => {
      for (const m of movers) m.rotation.y = Math.sin(time * 0.00035) * 0.012;
    },
    dispose: () => {
      scene.remove(root);
      resources.forEach((r) => r.dispose());
    },
  };
}
