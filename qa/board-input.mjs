import { PerspectiveCamera, Vector3 } from "three";
export async function click3DPoint(page, row, col, size) {
  const canvas = page.locator(".three-canvas canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("No rendered 3D board");
  const camera = new PerspectiveCamera(
    39,
    bounds.width / bounds.height,
    0.1,
    80,
  );
  camera.position.set(0, 13, 8.8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(
    -4 + (col * 8) / (size - 1),
    0,
    -4 + (row * 8) / (size - 1),
  ).project(camera);
  await canvas.click({
    position: {
      x: ((v.x + 1) * bounds.width) / 2,
      y: ((1 - v.y) * bounds.height) / 2,
    },
  });
}
