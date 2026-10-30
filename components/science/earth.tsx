"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import * as THREE from "three";
function Globe() {
  const texture = useTexture("/space/earth-day.png"),
    mesh = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (
      mesh.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      mesh.current.rotation.y =
        -2.93 + Math.sin(clock.elapsedTime * 0.07) * 0.12;
  });
  return (
    <mesh ref={mesh} rotation={[0.18, -2.93, 0]}>
      <sphereGeometry args={[1, 80, 80]} />
      <meshStandardMaterial map={texture} roughness={0.95} />
    </mesh>
  );
}
function SoftwareEarth() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const texture = new Image();
    texture.onload = () => {
      if (!active || !ref.current) return;
      const canvas = ref.current,
        ctx = canvas.getContext("2d");
      if (!ctx) return;
      const sample = document.createElement("canvas");
      sample.width = texture.width;
      sample.height = texture.height;
      const source = sample.getContext("2d");
      if (!source) return;
      source.drawImage(texture, 0, 0);
      const pixels = source.getImageData(
          0,
          0,
          sample.width,
          sample.height,
        ).data,
        size = 480;
      canvas.width = canvas.height = size;
      const output = ctx.createImageData(size, size),
        lat = (20 * Math.PI) / 180,
        lon = (78 * Math.PI) / 180;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const px = (x - size / 2) / (size / 2 - 3),
            py = -(y - size / 2) / (size / 2 - 3),
            r = px * px + py * py;
          if (r > 1) continue;
          const z = Math.sqrt(1 - r),
            wx =
              px * Math.cos(lon) -
              py * Math.sin(lat) * Math.sin(lon) +
              z * Math.cos(lat) * Math.sin(lon),
            wy = py * Math.cos(lat) + z * Math.sin(lat),
            wz =
              -px * Math.sin(lon) -
              py * Math.sin(lat) * Math.cos(lon) +
              z * Math.cos(lat) * Math.cos(lon),
            u = (((Math.atan2(wx, wz) / (2 * Math.PI) + 0.5) % 1) + 1) % 1,
            v = 0.5 - Math.asin(wy) / Math.PI,
            si =
              (Math.min(sample.height - 1, Math.floor(v * sample.height)) *
                sample.width +
                Math.floor(u * sample.width)) *
              4,
            di = (y * size + x) * 4,
            light = 0.22 + 0.78 * Math.max(0, -px * 0.5 + py * 0.2 + z * 0.82);
          for (let c = 0; c < 3; c++)
            output.data[di + c] = pixels[si + c] * light;
          output.data[di + 3] = 255;
        }
      ctx.putImageData(output, 0, 0);
    };
    texture.src = "/space/earth-day.png";
    return () => {
      active = false;
    };
  }, []);
  return (
    <canvas
      ref={ref}
      aria-label="Earth centered on India, rendered from NASA Blue Marble imagery"
    />
  );
}
export default function Earth() {
  const [webgl] = useState(() => {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  });
  return (
    <div className="se-earth" aria-label="Decorative Earth visualization">
      {webgl ? (
        <Canvas camera={{ position: [0, 0, 2.9], fov: 43 }} dpr={[1, 1.5]}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[-3, 2, 4]} intensity={2} />
          <Suspense fallback={null}>
            <Globe />
            <Stars radius={30} depth={20} count={1400} factor={2} fade />
          </Suspense>
          <OrbitControls enableZoom={false} enablePan={false} />
        </Canvas>
      ) : (
        <SoftwareEarth />
      )}
      <div className="se-earth-caption">
        20° N · 78° E<small>INDIAN SUBCONTINENT</small>
      </div>
    </div>
  );
}
