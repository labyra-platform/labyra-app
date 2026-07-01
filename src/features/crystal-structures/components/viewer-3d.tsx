/**
 * Viewer3D — Three.js renderer for a crystal structure scene (atoms + bonds +
 * unit cell + axes) with orbit controls. Dynamically imported (ssr:false) so the
 * ~150KB three bundle is a lazy chunk that never touches other pages.
 *
 * Build effect (dep: scene) constructs the scene once; a separate toggle effect
 * (dep: show) flips group visibility instantly without rebuilding or resetting
 * the camera.
 *
 * @phase R327-structure-viewer
 */
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { StructureScene } from '@/lib/dft/worker-client';

export interface ShowFlags {
  atoms: boolean;
  bonds: boolean;
  cell: boolean;
  axes: boolean;
}

export default function Viewer3D({ scene, show }: { scene: StructureScene; show: ShowFlags }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<Record<keyof ShowFlags, THREE.Group | null>>({
    atoms: null,
    bonds: null,
    cell: null,
    axes: null
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 480;

    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    threeScene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(1, 1, 1);
    threeScene.add(key);

    const L = scene.lattice.map((r) => new THREE.Vector3(r[0], r[1], r[2]));
    const cellCenter = new THREE.Vector3()
      .addScaledVector(L[0], 0.5)
      .addScaledVector(L[1], 0.5)
      .addScaledVector(L[2], 0.5);

    // Atoms
    const atomGroup = new THREE.Group();
    for (const a of scene.atoms) {
      const geo = new THREE.SphereGeometry(Math.max(0.28, a.radius * 0.5), 24, 20);
      const mat = new THREE.MeshPhongMaterial({ color: a.color, shininess: 60 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(a.xyz[0], a.xyz[1], a.xyz[2]);
      atomGroup.add(mesh);
    }

    // Bonds
    const bondGroup = new THREE.Group();
    const bondMat = new THREE.MeshPhongMaterial({ color: 0x9aa0aa });
    const up = new THREE.Vector3(0, 1, 0);
    for (const b of scene.bonds) {
      const start = new THREE.Vector3(b.from[0], b.from[1], b.from[2]);
      const end = new THREE.Vector3(b.to[0], b.to[1], b.to[2]);
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      if (len < 0.05) continue;
      const geo = new THREE.CylinderGeometry(0.11, 0.11, len, 10);
      const mesh = new THREE.Mesh(geo, bondMat);
      mesh.position.copy(start).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      bondGroup.add(mesh);
    }

    // Unit cell
    const cellGroup = new THREE.Group();
    const corners: THREE.Vector3[] = [];
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++)
        for (let k = 0; k < 2; k++)
          corners.push(
            new THREE.Vector3()
              .addScaledVector(L[0], i)
              .addScaledVector(L[1], j)
              .addScaledVector(L[2], k)
          );
    const cellEdges = [
      [0, 1],
      [0, 2],
      [0, 4],
      [1, 3],
      [1, 5],
      [2, 3],
      [2, 6],
      [3, 7],
      [4, 5],
      [4, 6],
      [5, 7],
      [6, 7]
    ];
    const cellMat = new THREE.LineBasicMaterial({ color: 0x8890b0 });
    for (const [a, b] of cellEdges) {
      const g = new THREE.BufferGeometry().setFromPoints([corners[a], corners[b]]);
      cellGroup.add(new THREE.Line(g, cellMat));
    }

    // Axes (at origin)
    const axesGroup = new THREE.Group();
    const axisLen = Math.max(2, Math.min(L[0].length(), L[1].length(), L[2].length()) * 0.5);
    const mkAxis = (v: THREE.Vector3, color: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        v.clone().multiplyScalar(axisLen)
      ]);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    };
    axesGroup.add(mkAxis(new THREE.Vector3(1, 0, 0), 0xd62828));
    axesGroup.add(mkAxis(new THREE.Vector3(0, 1, 0), 0x2a9d3a));
    axesGroup.add(mkAxis(new THREE.Vector3(0, 0, 1), 0x2166cb));

    threeScene.add(atomGroup, bondGroup, cellGroup, axesGroup);
    groupsRef.current = { atoms: atomGroup, bonds: bondGroup, cell: cellGroup, axes: axesGroup };

    const span = Math.max(L[0].length(), L[1].length(), L[2].length(), 4);
    camera.position.set(
      cellCenter.x + span * 1.4,
      cellCenter.y + span * 0.7,
      cellCenter.z + span * 1.8
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(cellCenter);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.update();

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(threeScene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || 600;
      const h = mount.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      threeScene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      groupsRef.current = { atoms: null, bonds: null, cell: null, axes: null };
    };
  }, [scene]);

  // Instant show/hide without rebuilding the scene.
  useEffect(() => {
    const g = groupsRef.current;
    if (g.atoms) g.atoms.visible = show.atoms;
    if (g.bonds) g.bonds.visible = show.bonds;
    if (g.cell) g.cell.visible = show.cell;
    if (g.axes) g.axes.visible = show.axes;
  }, [show]);

  return <div ref={mountRef} className='h-[70vh] max-h-[640px] min-h-[420px] w-full' />;
}
