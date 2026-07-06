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
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { StructureScene } from '@/lib/dft/worker-client';

export interface ShowFlags {
  atoms: boolean;
  bonds: boolean;
  cell: boolean;
  axes: boolean;
  polyhedra: boolean;
}

/** Electronegative elements that sit at polyhedron vertices (anions); every
 * other element is treated as a coordination centre (cation). */
const ANION_ELEMENTS = new Set(['N', 'O', 'F', 'P', 'S', 'Cl', 'Se', 'Br', 'Te', 'I']);

export default function Viewer3D({
  scene,
  show,
  onReady
}: {
  scene: StructureScene;
  show: ShowFlags;
  onReady?: (actions: { reset: () => void; screenshot: () => void }) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<Record<keyof ShowFlags, THREE.Group | null>>({
    atoms: null,
    bonds: null,
    cell: null,
    axes: null,
    polyhedra: null
  });
  const resetViewRef = useRef<() => void>(() => {});
  const screenshotRef = useRef<() => void>(() => {});

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 480;

    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // Image-based lighting for glossy, realistic spheres (Materials-Project look).
    const pmrem = new THREE.PMREMGenerator(renderer);
    threeScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    threeScene.add(new THREE.AmbientLight(0xffffff, 0.45));
    threeScene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(3, 4, 5);
    threeScene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-4, -2, -3);
    threeScene.add(fill);

    const L = scene.lattice.map((r) => new THREE.Vector3(r[0], r[1], r[2]));
    const cellCenter = new THREE.Vector3()
      .addScaledVector(L[0], 0.5)
      .addScaledVector(L[1], 0.5)
      .addScaledVector(L[2], 0.5);

    // Atoms
    const atomGroup = new THREE.Group();
    for (const a of scene.atoms) {
      const geo = new THREE.SphereGeometry(Math.max(0.28, a.radius * 0.5), 32, 24);
      const mat = new THREE.MeshStandardMaterial({
        color: a.color,
        metalness: 0.35,
        roughness: 0.35
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(a.xyz[0], a.xyz[1], a.xyz[2]);
      atomGroup.add(mesh);
    }

    // Atom lookup by rounded position (used by split bonds + polyhedra).
    const pk = (p: number[] | readonly number[]) =>
      `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
    const atomAt = new Map<string, (typeof scene.atoms)[number]>();
    for (const a of scene.atoms) atomAt.set(pk(a.xyz), a);

    // Bonds — split at the midpoint, each half colored by its atom (MP style).
    const bondGroup = new THREE.Group();
    const up = new THREE.Vector3(0, 1, 0);
    const bondMatCache = new Map<string, THREE.MeshStandardMaterial>();
    const bondMatFor = (color: string) => {
      let m = bondMatCache.get(color);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 });
        bondMatCache.set(color, m);
      }
      return m;
    };
    for (const b of scene.bonds) {
      const start = new THREE.Vector3(b.from[0], b.from[1], b.from[2]);
      const end = new THREE.Vector3(b.to[0], b.to[1], b.to[2]);
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      if (len < 0.05) continue;
      const mid = new THREE.Vector3().copy(start).addScaledVector(dir, 0.5);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      const cFrom = atomAt.get(pk(b.from))?.color ?? '#9aa0aa';
      const cTo = atomAt.get(pk(b.to))?.color ?? '#9aa0aa';
      // half nearest `start`
      const gA = new THREE.CylinderGeometry(0.13, 0.13, len / 2, 12);
      const mA = new THREE.Mesh(gA, bondMatFor(cFrom));
      mA.position.copy(start).addScaledVector(dir, 0.25);
      mA.quaternion.copy(quat);
      bondGroup.add(mA);
      // half nearest `end`
      const gB = new THREE.CylinderGeometry(0.13, 0.13, len / 2, 12);
      const mB = new THREE.Mesh(gB, bondMatFor(cTo));
      mB.position.copy(mid).addScaledVector(dir, 0.25);
      mB.quaternion.copy(quat);
      bondGroup.add(mB);
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

    // Coordination polyhedra: for each cation, hull its bonded anion neighbours.
    const polyGroup = new THREE.Group();
    const neighborPos = new Map<string, number[][]>();
    const pushNbr = (key: string, xyz: number[]) => {
      const arr = neighborPos.get(key);
      if (arr) arr.push(xyz);
      else neighborPos.set(key, [xyz]);
    };
    for (const b of scene.bonds) {
      pushNbr(pk(b.from), [b.to[0], b.to[1], b.to[2]]);
      pushNbr(pk(b.to), [b.from[0], b.from[1], b.from[2]]);
    }
    for (const a of scene.atoms) {
      if (ANION_ELEMENTS.has(a.el)) continue; // only cations centre a polyhedron
      const anions = (neighborPos.get(pk(a.xyz)) ?? []).filter((p) => {
        const nb = atomAt.get(pk(p));
        return nb && ANION_ELEMENTS.has(nb.el);
      });
      if (anions.length < 4) continue; // need a 3D hull
      try {
        const pts = anions.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        const geo = new ConvexGeometry(pts);
        const mat = new THREE.MeshStandardMaterial({
          color: a.color,
          transparent: true,
          opacity: 0.5,
          metalness: 0.1,
          roughness: 0.6,
          side: THREE.DoubleSide,
          flatShading: true
        });
        polyGroup.add(new THREE.Mesh(geo, mat));
      } catch {
        /* degenerate (coplanar) coordination — skip */
      }
    }
    threeScene.add(polyGroup);

    groupsRef.current = {
      atoms: atomGroup,
      bonds: bondGroup,
      cell: cellGroup,
      axes: axesGroup,
      polyhedra: polyGroup
    };

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

    const initialCamPos = camera.position.clone();
    resetViewRef.current = () => {
      camera.position.copy(initialCamPos);
      controls.target.copy(cellCenter);
      controls.update();
    };
    screenshotRef.current = () => {
      renderer.render(threeScene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${scene.formula ?? 'structure'}.png`;
      link.click();
    };
    onReady?.({
      reset: () => resetViewRef.current(),
      screenshot: () => screenshotRef.current()
    });

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
      groupsRef.current = { atoms: null, bonds: null, cell: null, axes: null, polyhedra: null };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Instant show/hide without rebuilding the scene.
  useEffect(() => {
    const g = groupsRef.current;
    if (g.atoms) g.atoms.visible = show.atoms;
    if (g.bonds) g.bonds.visible = show.bonds;
    if (g.cell) g.cell.visible = show.cell;
    if (g.axes) g.axes.visible = show.axes;
    if (g.polyhedra) g.polyhedra.visible = show.polyhedra;
  }, [show]);

  return (
    <div className='relative h-full w-full'>
      <div ref={mountRef} className='h-full w-full' />
    </div>
  );
}
