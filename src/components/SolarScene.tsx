import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { BODIES, orbitAngle, type Body } from "@/lib/planets";

export interface SimState {
  days: number;
  paused: boolean;
  speed: number;
  positions: Record<string, THREE.Vector3>;
}

const TILT: Record<string, number> = { mercury: 0.03, venus: 3.1, earth: 0.41, mars: 0.44, jupiter: 0.05, saturn: 0.47, uranus: 1.71, neptune: 0.49, sun: 0.12 };

/* ---------- procedural textures (value-noise fbm) ---------- */
function noiseFn(seed: number) {
  const perm = new Uint8Array(512);
  let s = seed;
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x: number, y: number) => perm[(perm[x & 255] + y) & 511] / 255;
  const n = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x: number, y: number, oct = 5) => {
    let f = 0, amp = 0.5, fr = 1;
    for (let i = 0; i < oct; i++) { f += amp * n(x * fr, y * fr); amp *= 0.5; fr *= 2; }
    return f;
  };
}

const hex = (c: string) => new THREE.Color(c);

function makeTexture(b: Body, clouds = false) {
  const W = 512, H = 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  const fbm = noiseFn(b.id.charCodeAt(0) * 131 + b.id.length * 7 + (clouds ? 999 : 0));
  const c1 = hex(b.color), c2 = hex(b.color2), tmp = new THREE.Color();
  const banded = b.type === "Gas Giant" || b.type === "Ice Giant";
  const ocean = hex("#0b2a5c"), land = hex("#3d6b35"), desert = hex("#a68a5b"), ice = hex("#f1f5f9");
  for (let y = 0; y < H; y++) {
    const lat = y / H;
    for (let x = 0; x < W; x++) {
      // wrap seamlessly on x by sampling on a cylinder
      const a = (x / W) * Math.PI * 2;
      const nx = Math.cos(a) * 1.6 + 10, nz = Math.sin(a) * 1.6 + 10;
      const ny = lat * 5;
      let alpha = 255;
      if (clouds) {
        const v = fbm(nx * 2 + ny, nz * 2 + ny * 0.5, 6);
        const k = Math.max(0, (v - 0.48) * 3.2);
        tmp.setRGB(1, 1, 1);
        alpha = Math.min(255, k * 255);
      } else if (banded) {
        const turb = fbm(nx * 1.5, nz * 1.5 + ny, 4);
        const band = Math.sin((lat * 18 + turb * 3.2) * Math.PI) * 0.5 + 0.5;
        tmp.copy(c1).lerp(c2, band * 0.85);
        if (b.id === "jupiter") {
          const dx = (x / W - 0.3) * 4, dy = (lat - 0.62) * 9;
          const spot = Math.exp(-(dx * dx + dy * dy));
          tmp.lerp(hex("#b5502e"), spot * 0.8);
        }
      } else if (b.id === "earth") {
        const v = fbm(nx * 1.4, nz * 1.4 + ny * 0.8, 6);
        const polar = Math.abs(lat - 0.5) > 0.42;
        if (polar) tmp.copy(ice);
        else if (v < 0.5) tmp.copy(ocean).lerp(hex("#1e5a9a"), v);
        else tmp.copy(land).lerp(desert, Math.min(1, (v - 0.5) * 3.5 * (1 - Math.abs(lat - 0.5) * 1.6)));
      } else if (b.type === "Star") {
        const v = fbm(nx * 3, nz * 3 + ny * 2, 5);
        tmp.copy(c2).lerp(c1, v * 1.4);
      } else {
        const v = fbm(nx * 2, nz * 2 + ny, 6);
        const crater = fbm(nx * 8, nz * 8 + ny * 4, 3);
        tmp.copy(c2).lerp(c1, v * 1.3).multiplyScalar(0.8 + crater * 0.4);
        if (b.id === "mars" && Math.abs(lat - 0.5) > 0.44) tmp.lerp(ice, 0.8);
      }
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, tmp.r * 255);
      img.data[i + 1] = Math.min(255, tmp.g * 255);
      img.data[i + 2] = Math.min(255, tmp.b * 255);
      img.data[i + 3] = alpha;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------- shaders ---------- */
const atmoVert = `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const atmoFrag = `uniform vec3 uColor; uniform float uPow; uniform float uInt; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(vN, vV)), uPow); gl_FragColor = vec4(uColor*uInt, f); }`;

function Atmosphere({ r, color, intensity = 1.4, power = 3 }: { r: number; color: string; intensity?: number; power?: number }) {
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uInt: { value: intensity } }), [color, power, intensity]);
  return (
    <mesh scale={1.06}>
      <sphereGeometry args={[r, 48, 32]} />
      <shaderMaterial vertexShader={atmoVert} fragmentShader={atmoFrag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.FrontSide} toneMapped={false} />
    </mesh>
  );
}

function SunCorona({ r }: { r: number }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,230,180,1)");
    grd.addColorStop(0.25, "rgba(255,170,80,0.55)");
    grd.addColorStop(0.55, "rgba(255,110,30,0.12)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ clock }) => {
    const s = r * 6 * (1 + Math.sin(clock.elapsedTime * 0.8) * 0.03);
    ref.current!.scale.set(s, s, 1);
  });
  return (
    <sprite ref={ref}>
      <spriteMaterial map={tex} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
    </sprite>
  );
}

/* ---------- bodies ---------- */
function Planet({ b, sim, selected, onSelect }: { b: Body; sim: React.MutableRefObject<SimState>; selected: boolean; onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const cloud = useRef<THREE.Mesh>(null);
  const label = useRef<HTMLSpanElement>(null);
  const tex = useMemo(() => makeTexture(b), [b]);
  const cloudTex = useMemo(() => (b.id === "earth" || b.id === "venus" ? makeTexture(b, true) : null), [b]);
  const isSun = b.type === "Star";
  const spin = isSun ? 0.05 : Math.min(2, 24 / Math.abs(b.dayLengthHours)) * 0.25;

  useFrame(({ camera }, dt) => {
    const d = Math.min(dt, 0.05);
    const a = orbitAngle(b, sim.current.days);
    group.current!.position.set(Math.cos(a) * b.orbit, 0, -Math.sin(a) * b.orbit);
    sim.current.positions[b.id] = group.current!.position;
    const rate = sim.current.paused ? 0.02 : Math.min(3, sim.current.speed / 30);
    mesh.current!.rotation.y += d * spin * rate;
    if (cloud.current) cloud.current.rotation.y += d * spin * rate * 1.3;
    if (label.current) {
      const dist = camera.position.distanceTo(group.current!.position);
      label.current.style.opacity = selected ? "1" : String(Math.max(0, Math.min(0.75, (dist - b.radius * 5) / 20)));
    }
  });

  return (
    <group ref={group}>
      <group rotation={[0, 0, TILT[b.id] ?? 0]}>
        <mesh
          ref={mesh}
          onClick={(e) => { e.stopPropagation(); onSelect(b.id); }}
          onPointerOver={() => (document.body.style.cursor = "pointer")}
          onPointerOut={() => (document.body.style.cursor = "")}
        >
          <sphereGeometry args={[b.radius, 96, 64]} />
          {isSun ? (
            <meshBasicMaterial map={tex} color={[4, 2.6, 1.4]} toneMapped={false} />
          ) : (
            <meshStandardMaterial map={tex} roughness={b.id === "earth" ? 0.6 : 0.95} metalness={0} />
          )}
        </mesh>
        {cloudTex && (
          <mesh ref={cloud} scale={1.015}>
            <sphereGeometry args={[b.radius, 64, 48]} />
            <meshStandardMaterial map={cloudTex} transparent opacity={b.id === "venus" ? 0.9 : 0.8} depthWrite={false} />
          </mesh>
        )}
        {b.ring && <Rings b={b} />}
      </group>
      {isSun ? <SunCorona r={b.radius} /> : (
        b.type !== "Terrestrial" || b.id === "earth" || b.id === "venus" ? <Atmosphere r={b.radius} color={b.id === "earth" ? "#5aa9ff" : b.color} intensity={b.id === "earth" ? 1.6 : 0.9} /> : null
      )}
      <Html center position={[0, b.radius + 0.6, 0]} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
        <span ref={label} className={selected ? "planet-label planet-label-active" : "planet-label"}>{b.name}</span>
      </Html>
    </group>
  );
}

function Rings({ b }: { b: Body }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 8;
    const g = c.getContext("2d")!;
    const fbm = noiseFn(42);
    for (let x = 0; x < 512; x++) {
      const v = fbm(x / 18, 0.5, 4);
      const gap = x > 300 && x < 320 ? 0.1 : 1;
      g.fillStyle = `rgba(${210 + v * 40},${190 + v * 30},${150 + v * 20},${(0.25 + v * 0.75) * gap})`;
      g.fillRect(x, 0, 1, 8);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const geo = useMemo(() => {
    const inner = b.radius * 1.3, outer = b.radius * 2.4;
    const gg = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = gg.attributes.position, uv = gg.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    return gg;
  }, [b.radius]);
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial map={tex} side={THREE.DoubleSide} transparent depthWrite={false} roughness={1} />
    </mesh>
  );
}

function AsteroidBelt({ sim }: { sim: React.MutableRefObject<SimState> }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 3500, arr = new Float32Array(n * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rad = 16.5 + r() * 2.2 + (r() - 0.5) * 0.8;
      arr.set([Math.cos(a) * rad, (r() - 0.5) * 0.5, Math.sin(a) * rad], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  useFrame(() => { ref.current!.rotation.y = -sim.current.days / 1600; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.06} color="#9c8f80" sizeAttenuation transparent opacity={0.8} />
    </points>
  );
}

function Orbit({ r, active }: { r: number; active: boolean }) {
  const geo = useMemo(() => {
    const pts = Array.from({ length: 256 }, (_, i) => {
      const a = (i / 256) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    });
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [r]);
  return (
    <lineLoop geometry={geo}>
      <lineBasicMaterial color={active ? "#8fd3ff" : "#4a5878"} transparent opacity={active ? 0.6 : 0.18} />
    </lineLoop>
  );
}

/* ---------- cinematic camera ---------- */
const HOME = new THREE.Vector3(0, 22, 52);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function Rig({ sim, selectedId, resetKey }: { sim: React.MutableRefObject<SimState>; selectedId: string | null; resetKey: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const fly = useRef({ t: 1, dur: 2.4, fromPos: new THREE.Vector3(), fromTgt: new THREE.Vector3() });
  const last = useRef(new THREE.Vector3());
  const intro = useRef(true);
  const idle = useRef(0);

  useEffect(() => {
    camera.position.set(-70, 45, 110);
    const f = fly.current;
    f.t = 0; f.dur = 4.5;
    f.fromPos.copy(camera.position); f.fromTgt.set(0, 0, 0);
  }, [camera]);

  useEffect(() => {
    if (intro.current) { intro.current = false; return; }
    const f = fly.current, c = controls.current;
    f.t = 0; f.dur = 2.6;
    f.fromPos.copy(camera.position);
    f.fromTgt.copy(c ? c.target : new THREE.Vector3());
  }, [selectedId, resetKey, camera]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = sim.current;
    if (!s.paused) s.days += s.speed * dt;
    const c = controls.current;
    if (!c) return;
    const f = fly.current;
    const p = selectedId ? s.positions[selectedId] : undefined;
    const b = selectedId ? BODIES.find((x) => x.id === selectedId)! : undefined;

    if (f.t < 1) {
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = ease(f.t);
      const tgt = p ? p.clone() : new THREE.Vector3();
      let want: THREE.Vector3;
      if (p && b) {
        // approach from the sun-lit side, slightly above
        const dir = p.clone().setY(0).normalize();
        if (!dir.lengthSq()) dir.set(0, 0, 1);
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        want = p.clone().addScaledVector(dir, -b.radius * 3.2).addScaledVector(side, b.radius * 4.5).add(new THREE.Vector3(0, b.radius * 1.6, 0));
      } else want = HOME.clone();
      const pos = f.fromPos.clone().lerp(want, k);
      pos.y += Math.sin(k * Math.PI) * f.fromPos.distanceTo(want) * 0.18; // arc
      camera.position.copy(pos);
      c.target.copy(f.fromTgt.clone().lerp(tgt, k));
      if (p) last.current.copy(p);
    } else if (p) {
      camera.position.add(p.clone().sub(last.current));
      last.current.copy(p);
      c.target.copy(p);
    }
    // slow drift when idle
    idle.current += dt;
    c.autoRotate = f.t >= 1 && idle.current > 6;
    c.update();
  }, -1);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
      zoomSpeed={0.7}
      autoRotateSpeed={0.25}
      minDistance={0.8}
      maxDistance={140}
      onStart={() => { idle.current = 0; }}
    />
  );
}

export default function SolarScene({ sim, selectedId, onSelect, resetKey }: { sim: React.MutableRefObject<SimState>; selectedId: string | null; onSelect: (id: string) => void; resetKey: number }) {
  return (
    <div className="absolute inset-0" ref={(el) => el?.setAttribute("data-scene-ready", "1")}>
      <Canvas
        camera={{ position: HOME.toArray(), fov: 38, near: 0.05, far: 2000 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      >
        <color attach="background" args={["#020309"]} />
        <fog attach="fog" args={["#020309", 120, 400]} />
        <ambientLight intensity={0.04} />
        <hemisphereLight args={["#2a3a66", "#000000", 0.08]} />
        <pointLight position={[0, 0, 0]} intensity={1400} decay={2} distance={0} color="#ffe6c4" />
        <Stars radius={300} depth={120} count={9000} factor={5} saturation={0.4} fade speed={0.3} />
        <AsteroidBelt sim={sim} />
        {BODIES.filter((b) => b.orbit).map((b) => <Orbit key={b.id} r={b.orbit} active={b.id === selectedId} />)}
        {BODIES.map((b) => (
          <Planet key={b.id} b={b} sim={sim} selected={b.id === selectedId} onSelect={onSelect} />
        ))}
        <Rig sim={sim} selectedId={selectedId} resetKey={resetKey} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.9} luminanceSmoothing={0.2} radius={0.8} />
          <Noise opacity={0.035} />
          <Vignette eskil={false} offset={0.2} darkness={0.85} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
