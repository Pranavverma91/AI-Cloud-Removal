import { Camera, Color, Matrix3, Matrix4, Mesh, Scene, Vector3 } from "three";

type Face = { xy: number[]; depth: number; color: string };

/** Canvas fallback for the same GLB geometry when the device has no WebGL. */
export class SoftwareSatelliteRenderer {
  readonly domElement = document.createElement("canvas");
  private context = this.domElement.getContext("2d", { alpha: true })!;
  private projection = new Matrix4();
  private view = new Matrix4();
  private normal = new Matrix3();
  private light = new Vector3(-0.3, 0.6, 1).normalize();
  private shades = new WeakMap<object, string[]>();
  private faces: Face[] = [];

  setSize(width: number, height: number) {
    this.domElement.width = Math.max(1, Math.round(width));
    this.domElement.height = Math.max(1, Math.round(height));
    this.domElement.style.width = width + "px";
    this.domElement.style.height = height + "px";
  }

  render(scene: Scene, camera: Camera) {
    const ctx = this.context, width = this.domElement.width, height = this.domElement.height;
    ctx.clearRect(0, 0, width, height);
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    let count = 0;
    scene.traverse(object => {
      if (!(object instanceof Mesh) || !object.visible) return;
      const geometry = object.geometry, position = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), indices = geometry.index;
      if (!position || !indices || Array.isArray(object.material)) return;
      const material = object.material as typeof object.material & { color?: Color };
      let palette = this.shades.get(material);
      if (!palette) {
        const base = (material.color || new Color("#a4b8d3")).clone().convertLinearToSRGB();
        palette = Array.from({length: 24}, (_, i) => {
          const illumination = 0.65 + i / 23 * 0.48;
          return `rgb(${Math.min(255, Math.round(base.r * 255 * illumination))},${Math.min(255, Math.round(base.g * 255 * illumination))},${Math.min(255, Math.round(base.b * 255 * illumination))})`;
        });
        this.shades.set(material, palette);
      }
      this.view.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
      this.projection.multiplyMatrices(camera.projectionMatrix, this.view);
      this.normal.getNormalMatrix(this.view);
      const m = this.projection.elements, nm = this.normal.elements, projected = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        projected[i * 3] = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) * width / 2;
        projected[i * 3 + 1] = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * height / 2;
        projected[i * 3 + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
      }
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
        const ax = projected[a * 3], ay = projected[a * 3 + 1], bx = projected[b * 3], by = projected[b * 3 + 1], cx = projected[c * 3], cy = projected[c * 3 + 1];
        // Canvas has a downward Y axis: front-facing triangles have negative area.
        if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) >= 0) continue;
        if (Math.max(ax, bx, cx) < 0 || Math.min(ax, bx, cx) > width || Math.max(ay, by, cy) < 0 || Math.min(ay, by, cy) > height) continue;
        let illumination = 0.6;
        if (normals) {
          const nx = normals.getX(a), ny = normals.getY(a), nz = normals.getZ(a);
          const x = nm[0] * nx + nm[3] * ny + nm[6] * nz, y = nm[1] * nx + nm[4] * ny + nm[7] * nz, z = nm[2] * nx + nm[5] * ny + nm[8] * nz;
          illumination = Math.max(0, (x * this.light.x + y * this.light.y + z * this.light.z) / (Math.hypot(x, y, z) || 1));
        }
        const face = this.faces[count] || (this.faces[count] = {xy: [0,0,0,0,0,0], depth: 0, color: ""});
        face.xy[0] = ax; face.xy[1] = ay; face.xy[2] = bx; face.xy[3] = by; face.xy[4] = cx; face.xy[5] = cy;
        face.depth = projected[a * 3 + 2] + projected[b * 3 + 2] + projected[c * 3 + 2];
        face.color = palette[Math.min(23, Math.round(illumination * 23))];
        count++;
      }
    });
    const visible = this.faces.slice(0, count).sort((a, b) => b.depth - a.depth);
    ctx.lineWidth = 0.5;
    ctx.lineJoin = "round";
    for (const face of visible) {
      ctx.fillStyle = ctx.strokeStyle = face.color;
      ctx.beginPath();
      ctx.moveTo(face.xy[0], face.xy[1]);
      ctx.lineTo(face.xy[2], face.xy[3]);
      ctx.lineTo(face.xy[4], face.xy[5]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  dispose() { this.faces = []; this.domElement.width = 0; this.domElement.height = 0; }
}
