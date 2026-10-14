import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as KeyEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  ArrowsClockwise,
  Cube,
  Eye,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Stack,
} from "@phosphor-icons/react";
import { coord, groupAt, index, point, stoneMoveNumbers } from "../domain/go";
import type { Color, Point, Position } from "../domain/go";
import type { Preferences } from "../storage";
import { useCoachBoard } from "./Coach";
import { buildScenery } from "./scenery";
import { useAppearance } from "./Appearance";

type Props = {
  position: Position;
  onSelect?: (p: Point) => void;
  onConfirm?: (p: Point) => void;
  preferences: Preferences;
  selected?: Point | null;
  hint?: Point | null;
  showLiberties?: boolean;
  dead?: number[];
  ownership?: number[];
  numbers?: boolean;
  compact?: boolean;
  coachNote?: string;
};
type SceneAPI = {
  update: (props: Props) => void;
  top: () => void;
  reset: () => void;
  zoom: (amount: number) => void;
  dispose: () => void;
};
function woodTexture(material: Preferences["boardMaterial"]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle =
    material === "walnut"
      ? "#937356"
      : material === "slate"
        ? "#acb5b4"
        : "#d9b983";
  ctx.fillRect(0, 0, 1024, 1024);
  let seed = 9321;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  if (material === "slate") {
    for (let i = 0; i < 16000; i++) {
      const shade = Math.floor(130 + random() * 75);
      ctx.fillStyle = `rgba(${shade},${shade + 4},${shade + 4},0.14)`;
      ctx.fillRect(
        random() * 1024,
        random() * 1024,
        1 + random() * 4,
        1 + random() * 3,
      );
    }
  }
  for (let x = 0; material !== "slate" && x < 1024; x += 2) {
    const shade = random();
    ctx.strokeStyle = `rgba(${shade > 0.7 ? "248,224,176" : "122,83,39"},${0.025 + random() * 0.06})`;
    ctx.lineWidth = 1 + random();
    ctx.beginPath();
    for (let y = 0; y <= 1024; y += 16) {
      const grain =
        x + Math.sin(y / 190 + x / 120) * 2.5 + Math.sin(y / 70) * 0.5;
      if (!y) ctx.moveTo(grain, y);
      else ctx.lineTo(grain, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function labelTexture(text: string, color = "#60492e", size = 80) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `500 ${size}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 68);
  return new THREE.CanvasTexture(canvas);
}
function buildScene(
  container: HTMLDivElement,
  initial: Props,
  select: (p: Point) => void,
): SceneAPI {
  const renderer = new THREE.WebGLRenderer({
    antialias: initial.preferences.quality === "high",
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(
    Math.min(
      devicePixelRatio,
      initial.preferences.quality === "high" ? 1.7 : 1,
    ),
  );
  renderer.shadowMap.enabled = initial.preferences.quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(39, 1, 0.1, 80);
  camera.position.set(0, 13, 8.8);
  camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = initial.position.size === 19;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = 0.88;
  controls.minDistance = 10;
  controls.maxDistance = 22;
  controls.rotateSpeed = 0.35;
  controls.enableZoom = true;
  const scenery = buildScenery(scene, initial.preferences.scene);
  const ambient = new THREE.HemisphereLight(
    initial.preferences.scene === "night" ? "#bacfdc" : "#ffffff",
    "#76634f",
    initial.preferences.scene === "night" ? 1.7 : 2.5,
  );
  scene.add(ambient);
  const light = new THREE.DirectionalLight(
    initial.preferences.scene === "night" ? "#ccdfec" : "#fff5e5",
    initial.preferences.scene === "night" ? 2.3 : 4,
  );
  light.position.set(-6, 12, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -7;
  light.shadow.camera.right = 7;
  light.shadow.camera.top = 7;
  light.shadow.camera.bottom = -7;
  light.shadow.bias = -0.0008;
  light.shadow.normalBias = 0.025;
  scene.add(light);
  const fill = new THREE.DirectionalLight("#ffffff", 1);
  fill.position.set(5, 4, -7);
  scene.add(fill);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ color: "#2c3328", opacity: 0.15 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.58;
  shadow.receiveShadow = true;
  scene.add(shadow);
  const wood = woodTexture(initial.preferences.boardMaterial);
  const board = new THREE.Mesh(
    new RoundedBoxGeometry(9.3, 0.5, 9.3, 4, 0.09),
    new THREE.MeshStandardMaterial({
      map: wood,
      roughness: initial.preferences.boardMaterial === "slate" ? 0.54 : 0.72,
      color:
        initial.preferences.boardMaterial === "kaya" ? "#f7e0b3" : "#ffffff",
    }),
  );
  board.position.y = -0.25;
  board.receiveShadow = true;
  board.castShadow = true;
  scene.add(board);
  const stoneGeometry = new THREE.SphereGeometry(1, 32, 20);
  const blackMaterial = new THREE.MeshStandardMaterial({
    color: "#15191b",
    roughness: 0.26,
    metalness: 0.06,
  });
  const whiteMaterial = new THREE.MeshStandardMaterial({
    color: "#fffdfa",
    roughness: 0.3,
    metalness: 0.01,
  });
  const boardObjects = new THREE.Group(),
    stones = new THREE.Group(),
    overlays = new THREE.Group();
  scene.add(boardObjects, stones, overlays);
  const animated = new Map<number, number>();
  const removed = new Map<
    THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>,
    { start: number; y: number }
  >();
  let currentProps = initial,
    currentSize = 0,
    dirty = true,
    frame = 0,
    disposed = false,
    pointerStart: { x: number; y: number } | null = null;
  let isVisible = true,
    lastTime = performance.now();
  const pointers = new Set<number>();
  let multiTouch = false;
  let dragged = false;
  function clearGroup(group: THREE.Group, keepMaterials = false) {
    group.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && mesh.geometry !== stoneGeometry)
        mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      if (!keepMaterials)
        materials.forEach((m) => {
          if (m && m !== blackMaterial && m !== whiteMaterial) {
            (m as THREE.MeshBasicMaterial).map?.dispose();
            m.dispose();
          }
        });
    });
    group.clear();
  }
  const stepFor = (size: number) => 8 / (size - 1);
  function planeLabel(text: string, x: number, z: number, scale: number) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(scale, scale),
      new THREE.MeshBasicMaterial({
        map: labelTexture(text),
        transparent: true,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.024, z);
    boardObjects.add(mesh);
  }
  function rebuildGrid(size: number) {
    clearGroup(boardObjects);
    const vertices: number[] = [],
      step = stepFor(size);
    for (let i = 0; i < size; i++) {
      const p = -4 + i * step;
      vertices.push(-4, 0.02, p, 4, 0.02, p, p, 0.02, -4, p, 0.02, 4);
      planeLabel("ABCDEFGHJKLMNOPQRST"[i], p, 4.35, Math.min(0.27, step * 0.6));
      planeLabel(String(size - i), -4.35, p, Math.min(0.27, step * 0.6));
    }
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      ),
      new THREE.LineBasicMaterial({
        color:
          initial.preferences.boardMaterial === "slate"
            ? "#364e52"
            : initial.preferences.boardMaterial === "walnut"
              ? "#453023"
              : "#72552f",
        transparent: true,
        opacity: 0.68,
      }),
    );
    boardObjects.add(lines);
    const stars =
      size === 19
        ? [3, 9, 15]
        : size === 13
          ? [3, 6, 9]
          : size === 9
            ? [2, 4, 6]
            : [2];
    for (const row of stars)
      for (const col of stars) {
        if (size === 9 && row !== col && row + col !== 8) continue;
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(size >= 13 ? 0.045 : 0.06, 16),
          new THREE.MeshBasicMaterial({ color: "#70502a" }),
        );
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(-4 + col * step, 0.027, -4 + row * step);
        boardObjects.add(dot);
      }
    currentSize = size;
  }
  function ring(p: Point, color: string, radius: number, y = 0.05) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.72, radius, 32),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      -4 + p.col * stepFor(currentSize),
      y,
      -4 + p.row * stepFor(currentSize),
    );
    overlays.add(mesh);
  }
  function update(props: Props) {
    const moveNumbers = props.numbers ? stoneMoveNumbers(props.position) : {};
    currentProps = props;
    if (props.preferences.reducedMotion) {
      animated.clear();
      removed.forEach((_, mesh) => {
        scene.remove(mesh);
        mesh.material.dispose();
      });
      removed.clear();
    }
    if (currentSize !== props.position.size) {
      rebuildGrid(props.position.size);
      animated.clear();
    }
    const previous = new Set(
      stones.children.map((c) => c.userData.index as number),
    );
    if (!props.preferences.reducedMotion)
      stones.children.forEach((child) => {
        if (props.position.board[child.userData.index]) return;
        const old = child as THREE.Mesh<
          THREE.SphereGeometry,
          THREE.MeshStandardMaterial
        >;
        const material = old.material.clone();
        material.transparent = true;
        material.depthWrite = false;
        const ghost = new THREE.Mesh(stoneGeometry, material);
        ghost.position.copy(old.position);
        ghost.scale.copy(old.scale);
        scene.add(ghost);
        removed.set(ghost, { start: performance.now(), y: ghost.position.y });
      });
    clearGroup(stones, true);
    clearGroup(overlays);
    const step = stepFor(currentSize);
    props.position.board.forEach((color, i) => {
      if (!color) return;
      const p = point(i, currentSize);
      const mesh = new THREE.Mesh(
        stoneGeometry,
        color === 1 ? blackMaterial : whiteMaterial,
      );
      mesh.scale.set(step * 0.44, step * 0.235, step * 0.44);
      mesh.position.set(
        -4 + p.col * step,
        step * 0.235 + 0.035,
        -4 + p.row * step,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.index = i;
      if (!previous.has(i) && !props.preferences.reducedMotion) {
        animated.set(i, performance.now());
        mesh.position.y += 0.75;
      }
      if (props.dead?.includes(i)) {
        mesh.scale.multiplyScalar(0.8);
        ring(p, "#bf6b56", step * 0.2, step * 0.55);
      }
      stones.add(mesh);
      if (props.numbers && moveNumbers[i]) {
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: labelTexture(
              String(moveNumbers[i]),
              color === 1 ? "#ffffff" : "#153e35",
              76,
            ),
            depthTest: false,
          }),
        );
        label.scale.set(step * 0.48, step * 0.48, 1);
        label.position.copy(mesh.position);
        label.position.y += step * 0.27;
        overlays.add(label);
      }
    });
    if (props.position.last)
      ring(
        props.position.last,
        props.position.toPlay === 2 ? "#d9eadc" : "#4a7e68",
        step * 0.105,
        step * 0.49 + 0.04,
      );
    if (props.selected) {
      const i = index(props.selected, currentSize);
      ring(
        props.selected,
        "#39846b",
        step * 0.25,
        props.position.board[i] ? step * 0.55 : 0.04,
      );
      if (props.showLiberties && props.position.board[i])
        groupAt(props.position.board, i, currentSize).liberties.forEach((l) =>
          ring(point(l, currentSize), "#438f72", step * 0.115),
        );
    }
    if (props.hint) ring(props.hint, "#2d8d6a", step * 0.28);
    if (props.ownership)
      props.ownership.forEach((owner, i) => {
        if (!owner || props.position.board[i]) return;
        const p = point(i, currentSize);
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(step * 0.64, step * 0.64),
          new THREE.MeshBasicMaterial({
            color: owner === 1 ? "#293b35" : "#ffffff",
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(-4 + p.col * step, 0.035, -4 + p.row * step);
        overlays.add(mesh);
      });
    dirty = true;
  }
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  controls.addEventListener("change", () => {
    dirty = true;
  });
  const raycaster = new THREE.Raycaster(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function down(event: PointerEvent) {
    if (event.button !== 0) {
      pointerStart = null;
      return;
    }
    dragged = false;
    pointers.add(event.pointerId);
    if (pointers.size > 1) multiTouch = true;
    pointerStart = { x: event.clientX, y: event.clientY };
  }
  function up(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (event.button !== 0) {
      pointerStart = null;
      return;
    }
    if (dragged) {
      pointerStart = null;
      return;
    }
    if (multiTouch) {
      if (!pointers.size) multiTouch = false;
      pointerStart = null;
      return;
    }
    if (
      !pointerStart ||
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ) > 7
    ) {
      pointerStart = null;
      return;
    }
    pointerStart = null;
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const step = stepFor(currentSize),
      col = Math.round((hit.x + 4) / step),
      row = Math.round((hit.z + 4) / step);
    if (
      row < 0 ||
      col < 0 ||
      row >= currentSize ||
      col >= currentSize ||
      Math.abs(hit.x - (-4 + col * step)) > step * 0.5 ||
      Math.abs(hit.z - (-4 + row * step)) > step * 0.5
    )
      return;
    select({ row, col });
  }
  renderer.domElement.addEventListener("pointerdown", down);
  const trackDrag = (event: PointerEvent) => {
    if (
      pointerStart &&
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ) > 7
    )
      dragged = true;
  };
  renderer.domElement.addEventListener("pointermove", trackDrag);
  renderer.domElement.addEventListener("pointerup", up);
  const cancelPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    pointerStart = null;
    if (!pointers.size) multiTouch = false;
  };
  renderer.domElement.addEventListener("pointercancel", cancelPointer);
  const visibility = () => {
    isVisible = !document.hidden;
    dirty = true;
  };
  document.addEventListener("visibilitychange", visibility);
  const contextLost = (e: Event) => {
    e.preventDefault();
    container.dispatchEvent(new CustomEvent("board-failed"));
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  function animate(time: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    controls.update();
    if (
      !currentProps.preferences.reducedMotion &&
      currentProps.preferences.quality === "high"
    )
      scenery.animate(time);
    const active = animated.size > 0 || removed.size > 0;
    if (active)
      stones.children.forEach((child) => {
        const start = animated.get(child.userData.index);
        if (!start) return;
        const t = Math.min(1, (time - start) / 200);
        child.position.y =
          stepFor(currentSize) * 0.235 + 0.035 + 0.75 * (1 - t) ** 3;
        if (t >= 1) animated.delete(child.userData.index);
      });
    removed.forEach(({ start, y }, mesh) => {
      const t = Math.min(1, (time - start) / 280);
      mesh.position.y = y + t * 0.4;
      mesh.material.opacity = 1 - t;
      if (t >= 1) {
        scene.remove(mesh);
        mesh.material.dispose();
        removed.delete(mesh);
      }
    });
    if (
      isVisible &&
      (dirty ||
        active ||
        (!currentProps.preferences.reducedMotion &&
          currentProps.preferences.quality === "high" &&
          currentProps.preferences.scene === "bamboo")) &&
      time - lastTime > (currentProps.preferences.quality === "low" ? 30 : 12)
    ) {
      renderer.render(scene, camera);
      dirty = false;
      lastTime = time;
    }
  }
  update(initial);
  resize();
  frame = requestAnimationFrame(animate);
  return {
    update,
    top: () => {
      camera.position.set(0, 14, 0.02);
      controls.target.set(0, 0, 0);
      controls.update();
      dirty = true;
    },
    reset: () => {
      camera.position.set(0, 13, 8.8);
      controls.target.set(0, 0, 0);
      controls.update();
      dirty = true;
    },
    zoom: (amount) => {
      camera.position
        .sub(controls.target)
        .multiplyScalar(amount)
        .add(controls.target);
      controls.update();
      dirty = true;
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", trackDrag);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", cancelPointer);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      clearGroup(boardObjects);
      clearGroup(stones, true);
      clearGroup(overlays);
      removed.forEach((_, mesh) => {
        scene.remove(mesh);
        mesh.material.dispose();
      });
      removed.clear();
      scenery.dispose();
      stoneGeometry.dispose();
      blackMaterial.dispose();
      whiteMaterial.dispose();
      wood.dispose();
      board.geometry.dispose();
      (board.material as THREE.Material).dispose();
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
export function MiniBoard({
  position,
  size = 150,
  highlight,
}: {
  position: Pick<Position, "size" | "board">;
  size?: number;
  highlight?: Point;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden="true"
      className="mini-board"
    >
      <rect width="200" height="200" rx="8" fill="#e7cc9e" />
      {Array.from({ length: position.size }, (_, i) => {
        const p = 16 + (i * 168) / (position.size - 1);
        return (
          <g key={i} stroke="#a78a58" strokeWidth=".65">
            <path d={`M16 ${p}H184M${p} 16V184`} />
          </g>
        );
      })}
      {position.board.map((color, i) =>
        color ? (
          <circle
            key={i}
            cx={16 + ((i % position.size) * 168) / (position.size - 1)}
            cy={
              16 + (Math.floor(i / position.size) * 168) / (position.size - 1)
            }
            r={(168 / (position.size - 1)) * 0.44}
            fill={color === 1 ? "#25302e" : "#fffefa"}
            stroke={color === 1 ? "#172520" : "#cab994"}
            strokeWidth=".5"
          />
        ) : null,
      )}
      {highlight && (
        <circle
          cx={16 + (highlight.col * 168) / (position.size - 1)}
          cy={16 + (highlight.row * 168) / (position.size - 1)}
          r={(168 / (position.size - 1)) * 0.35}
          fill="none"
          stroke="#3e8669"
          strokeWidth="3"
        />
      )}
    </svg>
  );
}
export function Board(props: Props) {
  useCoachBoard(props.position, props.coachNote);
  const { change } = useAppearance();
  const container = useRef<HTMLDivElement>(null),
    api = useRef<SceneAPI | null>(null),
    propsRef = useRef(props);
  propsRef.current = props;
  const [failed, setFailed] = useState(false),
    [top, setTop] = useState(false),
    [cursor, setCursor] = useState<Point>({ row: 0, col: 0 }),
    [keyboard, setKeyboard] = useState(false);
  const mode2d = props.preferences.board2d || failed;
  useEffect(() => {
    setCursor({ row: 0, col: 0 });
    setKeyboard(false);
    setTop(false);
  }, [props.position.size]);
  // Dispose while the canvas is still connected: OrbitControls removes its document keyboard listeners through getRootNode().
  useLayoutEffect(() => {
    if (mode2d || !container.current) return;
    const element = container.current;
    const onFailure = () => setFailed(true);
    element.addEventListener("board-failed", onFailure);
    try {
      api.current = buildScene(element, propsRef.current, (p) => {
        setCursor(p);
        setKeyboard(false);
        propsRef.current.onSelect?.(p);
      });
    } catch {
      setFailed(true);
    }
    return () => {
      api.current?.dispose();
      api.current = null;
      element.removeEventListener("board-failed", onFailure);
    };
  }, [
    mode2d,
    props.position.size,
    props.preferences.quality,
    props.preferences.scene,
    props.preferences.boardMaterial,
  ]);
  useEffect(() => {
    api.current?.update({
      ...props,
      selected: keyboard ? cursor : props.selected,
    });
  }, [props, cursor, keyboard]);
  const choose = (p: Point) => {
    setCursor(p);
    setKeyboard(false);
    props.onSelect?.(p);
  };
  const selected = keyboard ? cursor : props.selected || cursor;
  const flatMoveNumbers =
    mode2d && props.numbers ? stoneMoveNumbers(props.position) : {};
  const handleKey = (e: KeyEvent) => {
    const p = { ...selected };
    if (e.key === "ArrowUp") p.row = Math.max(0, p.row - 1);
    else if (e.key === "ArrowDown")
      p.row = Math.min(props.position.size - 1, p.row + 1);
    else if (e.key === "ArrowLeft") p.col = Math.max(0, p.col - 1);
    else if (e.key === "ArrowRight")
      p.col = Math.min(props.position.size - 1, p.col + 1);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (props.onConfirm) props.onConfirm(selected);
      else choose(selected);
      return;
    } else return;
    e.preventDefault();
    setCursor(p);
    setKeyboard(true);
  };
  const loupeStart = {
    row: Math.max(0, Math.min(props.position.size - 5, selected.row - 2)),
    col: Math.max(0, Math.min(props.position.size - 5, selected.col - 2)),
  };
  const loupeBoard = Array.from(
    { length: 25 },
    (_, i) =>
      props.position.board[
        (loupeStart.row + Math.floor(i / 5)) * props.position.size +
          loupeStart.col +
          (i % 5)
      ],
  );
  return (
    <div
      className={`board-shell scene-${props.preferences.scene} material-${props.preferences.boardMaterial} ${props.compact ? "compact" : ""}`}
    >
      <div className="board-status">
        <span>
          <i className="live-dot" /> {mode2d ? "清晰 2D 棋盘" : "交互 3D 棋盘"}
        </span>
        <span>
          {props.position.size} × {props.position.size}
        </span>
      </div>
      {mode2d ? (
        <div className="flat-board">
          <div
            className="flat-grid"
            role="grid"
            aria-label="围棋棋盘"
            aria-rowcount={props.position.size}
            aria-colcount={props.position.size}
            tabIndex={0}
            onKeyDown={handleKey}
            style={{
              gridTemplateColumns: `repeat(${props.position.size}, 1fr)`,
            }}
          >
            {props.position.board.map((color, i) => {
              const p = point(i, props.position.size);
              const isSelected =
                (props.selected || keyboard) &&
                index(selected, props.position.size) === i;
              return (
                <button
                  key={i}
                  tabIndex={-1}
                  aria-label={`${coord(p, props.position.size)} ${color === 1 ? "黑子" : color === 2 ? "白子" : "空点"}`}
                  className={`intersection ${color ? `stone-${color}` : ""} ${isSelected ? "selected" : ""} ${props.dead?.includes(i) ? "dead" : ""} ${props.hint && index(props.hint, props.position.size) === i ? "hint" : ""}`}
                  onClick={() => choose(p)}
                >
                  <span>
                    {color && flatMoveNumbers[i] ? flatMoveNumbers[i] : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          ref={container}
          className="three-canvas"
          data-testid="three-board"
        />
      )}
      {!mode2d && (
        <div
          role="grid"
          aria-label="围棋棋盘"
          aria-rowcount={props.position.size}
          aria-colcount={props.position.size}
          tabIndex={0}
          className={mode2d ? "sr-only" : "accessible-board"}
          onKeyDown={handleKey}
        >
          <span className="sr-only">
            方向键选择，Enter 落子。当前 {coord(selected, props.position.size)}
            。
          </span>
          {props.position.board.map((color, i) => (
            <button
              className="sr-only"
              key={i}
              tabIndex={-1}
              aria-label={`${coord(point(i, props.position.size), props.position.size)} ${color === 1 ? "黑子" : color === 2 ? "白子" : "空点"}`}
              onClick={() => choose(point(i, props.position.size))}
            />
          ))}
        </div>
      )}
      {props.position.size === 19 && (props.selected || keyboard) && (
        <div className="board-loupe">
          <MiniBoard
            position={{ size: 5, board: loupeBoard }}
            size={84}
            highlight={{
              row: selected.row - loupeStart.row,
              col: selected.col - loupeStart.col,
            }}
          />
          <span>
            {coord(selected, props.position.size)}
            <small>局部预览</small>
          </span>
        </div>
      )}
      <div className="board-toolbar">
        <span>{mode2d ? "点击交叉点选子" : "拖动旋转 · 滚轮缩放"}</span>
        {!props.compact && (
          <div className="board-appearance">
            <select
              aria-label="快速切换场景"
              value={props.preferences.scene}
              onChange={(e) => change("scene", e.target.value)}
            >
              <option value="bamboo">竹林</option>
              <option value="room">棋室</option>
              <option value="night">夜庭</option>
            </select>
            <select
              aria-label="快速切换棋盘材质"
              value={props.preferences.boardMaterial}
              onChange={(e) => change("boardMaterial", e.target.value)}
            >
              <option value="kaya">榧木</option>
              <option value="walnut">胡桃木</option>
              <option value="slate">岩石</option>
            </select>
          </div>
        )}
        <div>
          {!mode2d && (
            <>
              <button
                title="切换俯视"
                aria-label="切换俯视"
                className={top ? "active" : ""}
                onClick={() => {
                  top ? api.current?.reset() : api.current?.top();
                  setTop(!top);
                }}
              >
                <Eye size={19} />
              </button>
              <button
                aria-label="放大棋盘"
                onClick={() => api.current?.zoom(0.9)}
              >
                <MagnifyingGlassPlus size={19} />
              </button>
              <button
                aria-label="缩小棋盘"
                onClick={() => api.current?.zoom(1.1)}
              >
                <MagnifyingGlassMinus size={19} />
              </button>
              <button
                aria-label="复位视角"
                onClick={() => {
                  api.current?.reset();
                  setTop(false);
                }}
              >
                <ArrowsClockwise size={19} />
              </button>
            </>
          )}
          <span className="render-badge">
            {mode2d ? <Stack size={16} /> : <Cube size={16} />}
            {mode2d ? "2D" : "3D"}
          </span>
        </div>
      </div>
      {failed && (
        <p className="board-fallback" role="status">
          设备暂不支持 3D，已切换为相同规则的 2D 棋盘。
        </p>
      )}
    </div>
  );
}
export function StoneDot({ color }: { color: Color }) {
  return (
    <span
      className={`stone-dot color-${color}`}
      aria-label={color === 1 ? "黑棋" : "白棋"}
    />
  );
}
