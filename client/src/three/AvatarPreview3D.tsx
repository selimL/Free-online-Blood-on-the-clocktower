// Rotating 3D preview of a single figure for the character creator.
// Drag to turn it; it slowly turns by itself otherwise.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Avatar } from '../../../shared/types';
import { buildCharacter, disposeCharacter } from './character';

export default function AvatarPreview3D({ avatar, size = 220 }: { avatar: Avatar; size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ setAvatar: (a: Avatar) => void } | null>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size * 1.2);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1 / 1.2, 0.1, 50);
    camera.position.set(0, 1.9, 6.4);
    camera.lookAt(0, 1.25, 0);

    scene.add(new THREE.HemisphereLight('#c9d3ff', '#2a1d14', 1.1));
    const key = new THREE.DirectionalLight('#ffe2b8', 2.2);
    key.position.set(2.5, 4, 3); key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#c7262c', 1.6);
    rim.position.set(-3, 2.5, -3);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshStandardMaterial({ color: '#2b2733', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 6, 48), new THREE.MeshStandardMaterial({ color: '#c9a15b', metalness: 0.6, roughness: 0.4 }));
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);

    const turntable = new THREE.Group();
    scene.add(turntable);
    let fig: THREE.Group | null = null;
    const setAvatar = (a: Avatar) => {
      if (fig) { turntable.remove(fig); disposeCharacter(fig); }
      fig = buildCharacter(a);
      turntable.add(fig);
    };
    api.current = { setAvatar };

    // drag to rotate
    let dragging = false, lastX = 0, spin = 0.5, rot = 0.35;
    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!dragging) return; rot += (e.clientX - lastX) * 0.012; spin = 0; lastX = e.clientX; };
    const up = () => { dragging = false; spin = 0.5; };
    const el = renderer.domElement;
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = clock.getDelta(), t = clock.elapsedTime;
      if (!reduced) rot += spin * dt;
      turntable.rotation.y = rot;
      fig?.userData.animate?.(t);
      renderer.render(scene, camera);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      if (fig) disposeCharacter(fig);
      renderer.dispose();
      mount.innerHTML = '';
      api.current = null;
    };
  }, [size]);

  useEffect(() => { api.current?.setAvatar(avatar); }, [avatar]);

  return <div ref={mountRef} className="avatar3d" title="Drag to turn your figure" aria-label="3D preview of your figure" role="img" />;
}
