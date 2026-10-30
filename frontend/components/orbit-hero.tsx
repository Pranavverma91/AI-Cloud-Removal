"use client";
import { useEffect, useRef, useState } from "react";
import type { Camera, Scene } from "three";
import { ArrowUpRight, MapPin, Pause, Play, ScanLine } from "lucide-react";
export default function OrbitHero({ signedIn = false }: { signedIn?: boolean }) {
    const mount = useRef<HTMLDivElement>(null), motion = useRef(true);
    const [paused, setPaused] = useState(false), [status, setStatus] = useState("Loading satellite…"), [modelReady, setModelReady] = useState(false);
    useEffect(() => {
        let cancelled = false, dispose = () => { };
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        motion.current = !reduced.matches;
        setPaused(reduced.matches);
        Promise.all([import("three"), import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/DRACOLoader.js")]).then(async ([T, { GLTFLoader }, { DRACOLoader }]) => {
            if (cancelled || !mount.current)
                return;
            const container = mount.current;
            let renderer: {domElement: HTMLCanvasElement;setSize(w:number,h:number):void;render(scene:Scene,camera:Camera):void;dispose():void};
            let software = false;
            try {
                const gpu = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
                gpu.setPixelRatio(Math.min(devicePixelRatio, 1.6));
                gpu.outputColorSpace = T.SRGBColorSpace;
                gpu.toneMapping = T.ACESFilmicToneMapping;
                gpu.toneMappingExposure = 1.35;
                renderer = gpu;
            } catch {
                const { SoftwareSatelliteRenderer } = await import("@/lib/software-satellite-renderer");
                if (cancelled) return;
                renderer = new SoftwareSatelliteRenderer();
                software = true;
            }
            container.appendChild(renderer.domElement);
            const scene = new T.Scene(), camera = new T.PerspectiveCamera(38, 1, .1, 100);
            camera.position.set(0, 1, 7.7);
            camera.lookAt(0, 0, 0);
            scene.add(new T.HemisphereLight(0xd6eaff, 0x46506b, 3));
            const key = new T.DirectionalLight(0xffffff, 4);
            key.position.set(3, 6, 5);
            scene.add(key);
            const rim = new T.DirectionalLight(0x8db4ff, 3);
            rim.position.set(-4, 1, -2);
            scene.add(rim);
            const starGeometry = new T.BufferGeometry(), positions = new Float32Array(1800 * 3);
            let seed = 349;
            const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] = (random() - .5) * 32;
                positions[i + 1] = (random() - .5) * 18;
                positions[i + 2] = -5 - random() * 12;
            }
            starGeometry.setAttribute("position", new T.BufferAttribute(positions, 3));
            const starMaterial = new T.PointsMaterial({ color: 0xe4eaff, size: .023, transparent: true, opacity: .8, sizeAttenuation: true });
            const stars = new T.Points(starGeometry, starMaterial);
            scene.add(stars);
            const orbit = new T.Group();
            scene.add(orbit);
            let satellite: InstanceType<typeof T.Object3D> | undefined;
            const draco = new DRACOLoader();
            draco.setDecoderPath("/space/draco/");
            new GLTFLoader().setDRACOLoader(draco).load("/space/satellite.glb", gltf => { if (cancelled) {
                gltf.scene.traverse(obj => { if (obj instanceof T.Mesh) {
                    obj.geometry.dispose();
                    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
                } });
                return;
            } satellite = gltf.scene; const box = new T.Box3().setFromObject(satellite), center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3()); satellite.position.sub(center); const normalized = new T.Group(); normalized.add(satellite); normalized.scale.setScalar(5.8 / Math.max(size.x, size.y, size.z)); orbit.add(normalized); orbit.rotation.set(.32, .5, -.28); setStatus("NASA Hinode satellite · 3D orbital view"); setModelReady(true); render(); }, undefined, () => setStatus("Galaxy view · satellite model could not load"));
            const resize = () => { const width = container.clientWidth, height = container.clientHeight; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); orbit.position.x = width > 600 ? Math.min(2.6, width / height * .95) : .1; render(); };
            const render = () => renderer.render(scene, camera);
            let frame = 0, last = 0, visible = true, time = 0;
            const animate = (now: number) => { frame = requestAnimationFrame(animate); if (now - last < (software ? 250 : 33) || !visible || document.hidden)
                return; const delta = Math.min((now - last) / 1000, software ? .35 : .06); last = now; if (!motion.current) return; if (motion.current) {
                time += delta;
                orbit.rotation.y = .5 + time * .17;
                orbit.rotation.z = -.28 + Math.sin(time * .3) * .06;
                orbit.position.y = Math.sin(time * .7) * .1;
                stars.rotation.z = time * .002;
            } render(); };
            const observer = new ResizeObserver(resize);
            observer.observe(container);
            const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; });
            visibility.observe(container);
            resize();
            frame = requestAnimationFrame(animate);
            const onReduced = () => { motion.current = !reduced.matches; setPaused(reduced.matches); };
            reduced.addEventListener("change", onReduced);
            dispose = () => { draco.dispose(); cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); reduced.removeEventListener("change", onReduced); scene.traverse(obj => { if (obj instanceof T.Mesh) {
                obj.geometry.dispose();
                (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => { for (const value of Object.values(m))
                    if (value instanceof T.Texture)
                        value.dispose(); m.dispose(); });
            } }); starGeometry.dispose(); starMaterial.dispose(); renderer.dispose(); renderer.domElement.remove(); };
        }).catch(() => setStatus("Satellite view is unavailable on this device"));
        return () => { cancelled = true; dispose(); };
    }, []);
    return <section className={"orbit-hero" + (paused ? " motion-paused" : "")}><div className="galaxy-background"/><div className="orbit-canvas" ref={mount} role="img" aria-label={modelReady ? "A three-dimensional satellite slowly rotating in a galaxy filled with small stars" : "A satellite over a galaxy filled with small stars"}/><div className="hero-shade"/><div className="orbit-copy"><div className="eyebrow">YOUR PERSONAL EARTH OBSERVATORY</div><h1>Earth, in<br /><em>your orbit.</em></h1><p>Explore crops, water, and forests with real satellite imagery.<br />Your places. Your observations. Your perspective.</p><div className="hero-actions"><a className="btn btn-lime" href={signedIn ? "/workspace" : "/signup"}>{signedIn ? "Open my workspace" : "Create your account"}<ArrowUpRight /></a>{!signedIn && <a className="btn btn-orbit" href="/login">Log in<ArrowUpRight /></a>}</div></div><div className="orbit-meta"><span>SATELLITE IMAGERY / CROPS · WATER · FORESTS</span><button className="orbit-pause" title={status} aria-label={paused ? "Play satellite rotation" : "Pause satellite rotation"} onClick={() => { motion.current = paused; setPaused(!paused); }}>{paused ? <Play size={14}/> : <Pause size={14}/>}<span>{paused ? "Motion paused" : "Orbital motion"}</span></button></div></section>;
}
