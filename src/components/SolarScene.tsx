import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { BODIES, orbitAngle, type Body } from "@/lib/planets";

export interface SimState {
  days: number;
  paused: boolean;
  speed: number; // days per second
  positions: Record<string, THREE.Vector3>;
}

function makeTexture(b: Body) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = b.color;
  g.fillRect(0, 0, 256, 128);
  let s = b.id.length * 97;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const banded = b.type === "Gas Giant" || b.type === "Ice Giant";
  for (let i = 0; i < (banded ? 18 : 60); i++) {
    g.globalAlpha = 0.15 + rnd() * 0.35;
    g.fillStyle = rnd() > 0.5 ? b.color2 : b.color;
    if (banded) g.fillRect(0, rnd() * 128, 256, 2 + rnd() * 10);
    else {
      g.beginPath();
      g.ellipse(rnd() * 256, rnd() * 128, 4 + rnd() * 26, 3 + rnd() * 14, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Planet({ b, sim, selected, onSelect }: { b: Body; sim: React.MutableRefObject<SimState>; selected: boolean; onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => makeTexture(b), [b]);
  useFrame((_, dt) => {
    const a = orbitAngle(b, sim.current.days);
    group.current!.position.set(Math.cos(a) * b.orbit, 0, -Math.sin(a) * b.orbit);
    sim.current.positions[b.id] = group.current!.position;
    if (!sim.current.paused) mesh.current!.rotation.y += Math.min(dt, 0.05) * 0.5;
  });
  const isSun = b.type === "Star";
  return (
    <group ref={group}>
      <mesh
        ref={mesh}
        onClick={(e) => { e.stopPropagation(); onSelect(b.id); }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <sphereGeometry args={[b.radius, 48, 32]} />
        {isSun ? (
          <meshBasicMaterial map={tex} color="#ffd9a0" toneMapped={false} />
        ) : (
          <meshStandardMaterial map={tex} roughness={0.85} />
        )}
      </mesh>
      {b.ring && (
        <mesh rotation={[-Math.PI / 2.3, 0, 0]}>
          <ringGeometry args={[b.radius * 1.35, b.radius * 2.2, 64]} />
          <meshStandardMaterial color={b.color2} side={THREE.DoubleSide} transparent opacity={0.7} />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[b.radius * 1.25 + 0.15, b.radius * 1.25 + 0.25, 64]} />
          <meshBasicMaterial color="#7dd3fc" side={THREE.DoubleSide} />
        </mesh>
      )}
      <Html center position={[0, b.radius + 0.7, 0]} style={{ pointerEvents: "none" }}>
        <span className={selected ? "planet-label planet-label-active" : "planet-label"}>{b.name}</span>
      </Html>
    </group>
  );
}

function Orbit({ r }: { r: number }) {
  const geo = useMemo(() => {
    const pts = Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    });
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [r]);
  return (
    <lineLoop geometry={geo}>
      <lineBasicMaterial color="#5b6b8a" transparent opacity={0.35} />
    </lineLoop>
  );
}

const HOME = new THREE.Vector3(0, 28, 46);

function Rig({ sim, selectedId, resetKey }: { sim: React.MutableRefObject<SimState>; selectedId: string | null; resetKey: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const flying = useRef(0);
  const last = useRef(new THREE.Vector3());

  useEffect(() => { flying.current = 1.2; }, [selectedId, resetKey]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = sim.current;
    if (!s.paused) s.days += s.speed * dt;
    const c = controls.current;
    if (!c) return;
    if (selectedId && s.positions[selectedId]) {
      const p = s.positions[selectedId];
      const b = BODIES.find((x) => x.id === selectedId)!;
      // carry the camera with the body as it orbits
      const move = p.clone().sub(last.current);
      if (flying.current <= 0) camera.position.add(move);
      last.current.copy(p);
      if (flying.current > 0) {
        flying.current -= dt;
        const k = 1 - Math.exp(-4 * dt);
        c.target.lerp(p, k);
        const want = p.clone().add(new THREE.Vector3(0, b.radius * 2.5, b.radius * 6 + 2));
        camera.position.lerp(want, k);
      } else c.target.copy(p);
    } else if (flying.current > 0) {
      flying.current -= dt;
      const k = 1 - Math.exp(-4 * dt);
      c.target.lerp(new THREE.Vector3(), k);
      camera.position.lerp(HOME, k);
    }
    c.update();
  }, -1);

  return <OrbitControls ref={controls} makeDefault enableDamping minDistance={1} maxDistance={120} />;
}

export default function SolarScene({ sim, selectedId, onSelect, resetKey }: { sim: React.MutableRefObject<SimState>; selectedId: string | null; onSelect: (id: string) => void; resetKey: number }) {
  return (
    <div className="absolute inset-0" ref={(el) => el?.setAttribute("data-scene-ready", "1")}>
      <Canvas camera={{ position: HOME.toArray(), fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={["#05070d"]} />
        <ambientLight intensity={0.18} />
        <pointLight position={[0, 0, 0]} intensity={900} decay={2} distance={0} color="#fff1dc" />
        <Stars radius={150} depth={60} count={4000} factor={4} fade />
        {BODIES.filter((b) => b.orbit).map((b) => <Orbit key={b.id} r={b.orbit} />)}
        {BODIES.map((b) => (
          <Planet key={b.id} b={b} sim={sim} selected={b.id === selectedId} onSelect={onSelect} />
        ))}
        <Rig sim={sim} selectedId={selectedId} resetKey={resetKey} />
      </Canvas>
    </div>
  );
}
