/**
 * BrillouinViewer3D — Three.js reciprocal-space viewer: the first Brillouin zone
 * (translucent facets + edges), high-symmetry k-points as labelled dots, and the
 * band path as connected segments. Dynamically imported (ssr:false). @phase R398
 */
'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { BrillouinZone } from '@/lib/dft/worker-client';

/** Tidy a seekpath label for display (GAMMA → Γ, K_1 → K₁). */
function prettyLabel(raw: string): string {
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  return raw
    .replace(/GAMMA/g, 'Γ')
    .replace(/_(\d)/g, (_m, d: string) => sub[Number(d)] ?? d)
    .replace(/DELTA/g, 'Δ')
    .replace(/SIGMA/g, 'Σ')
    .replace(/LAMBDA/g, 'Λ');
}

export default function BrillouinViewer3D({ bz }: { bz: BrillouinZone }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 400;
    const height = mount.clientHeight || 340;

    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Label overlay (transparent, on top of the canvas).
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    mount.appendChild(labelRenderer.domElement);

    threeScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.5);
    key.position.set(1, 1, 1);
    threeScene.add(key);

    // Centroid + scale from the BZ vertices.
    const all: THREE.Vector3[] = [];
    for (const face of bz.facets)
      for (const v of face) all.push(new THREE.Vector3(v[0], v[1], v[2]));
    const center = new THREE.Vector3();
    for (const v of all) center.add(v);
    if (all.length) center.multiplyScalar(1 / all.length);
    let radius = 0.5;
    for (const v of all) radius = Math.max(radius, v.distanceTo(center));

    // BZ faces (translucent) + edges.
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0x6b8cff,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      metalness: 0,
      roughness: 1
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5b6b9a });
    for (const face of bz.facets) {
      const pts = face.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
      if (pts.length >= 3) {
        // triangulate the (convex, planar) face as a fan
        const geo = new THREE.BufferGeometry();
        const verts: number[] = [];
        for (let i = 1; i < pts.length - 1; i++) {
          verts.push(pts[0].x, pts[0].y, pts[0].z);
          verts.push(pts[i].x, pts[i].y, pts[i].z);
          verts.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.computeVertexNormals();
        threeScene.add(new THREE.Mesh(geo, faceMat));
      }
      const loop = [...pts, pts[0]];
      threeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(loop), edgeMat));
    }

    // Band path (connected segments through high-symmetry points).
    const pathMat = new THREE.LineBasicMaterial({ color: 0xe0563b, linewidth: 2 });
    for (const [a, b] of bz.segments) {
      const pa = bz.points[a];
      const pb = bz.points[b];
      if (!pa || !pb) continue;
      threeScene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(pa[0], pa[1], pa[2]),
            new THREE.Vector3(pb[0], pb[1], pb[2])
          ]),
          pathMat
        )
      );
    }

    // High-symmetry points (dots + labels). Only those on the path.
    const onPath = new Set<string>();
    for (const [a, b] of bz.segments) {
      onPath.add(a);
      onPath.add(b);
    }
    const dotGeo = new THREE.SphereGeometry(radius * 0.03, 16, 12);
    const dotMat = new THREE.MeshStandardMaterial({ color: 0xe0563b });
    for (const label of onPath) {
      const p = bz.points[label];
      if (!p) continue;
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(p[0], p[1], p[2]);
      threeScene.add(dot);

      const el = document.createElement('div');
      el.textContent = prettyLabel(label);
      el.style.color = '#c2410c';
      el.style.fontSize = '11px';
      el.style.fontWeight = '600';
      el.style.textShadow = '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff';
      const tag = new CSS2DObject(el);
      tag.position.set(p[0], p[1], p[2]);
      threeScene.add(tag);
    }

    // Reciprocal axes at Γ.
    const axisLen = radius * 0.9;
    const mkAxis = (dir: THREE.Vector3, color: number) =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          dir.clone().multiplyScalar(axisLen)
        ]),
        new THREE.LineBasicMaterial({ color })
      );
    threeScene.add(mkAxis(new THREE.Vector3(1, 0, 0), 0xd62828));
    threeScene.add(mkAxis(new THREE.Vector3(0, 1, 0), 0x2a9d3a));
    threeScene.add(mkAxis(new THREE.Vector3(0, 0, 1), 0x2166cb));

    camera.position.set(center.x + radius * 2, center.y + radius * 1.4, center.z + radius * 2.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.update();

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(threeScene, camera);
      labelRenderer.render(threeScene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || 400;
      const h = mount.clientHeight || 340;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
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
      if (labelRenderer.domElement.parentNode === mount)
        mount.removeChild(labelRenderer.domElement);
    };
  }, [bz]);

  return <div ref={mountRef} className='relative h-full w-full' />;
}
