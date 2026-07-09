"use client";

/**
 * 3D building-envelope massing viewer (Phase 3).
 *
 * Renders the real parcel as a ground pad and the setback-inset building
 * envelope extruded to the height limit, with per-storey floor outlines and
 * orbit controls. Loaded via next/dynamic({ ssr:false }) from the report, so
 * three.js is client-only and kept out of the initial bundle.
 *
 * This is an indicative ENVELOPE explorer — the maximum buildable box after
 * setbacks/height — not a compliant architectural design.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MassingModel } from "../../utils/envelope/geometry";

const TEAL = 0x0f4c5c;

export default function MassingViewer({ massing }: { massing: MassingModel }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      mount.innerHTML =
        '<div style="padding:24px;text-align:center;color:#6b7280;font-size:13px">3D view needs WebGL, which is unavailable in this browser.</div>';
      return;
    }

    const width = mount.clientWidth || 640;
    const height = 400;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f6f7);

    // Parcel extent → sizing.
    const xs = massing.parcel.map((p) => p[0]);
    const ys = massing.parcel.map((p) => p[1]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const span = Math.max(spanX, spanY, 10);
    const maxDim = Math.max(span, massing.heightM);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, span * 20 + 500);
    camera.position.set(span * 0.9, maxDim * 1.4 + 8, span * 1.1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, massing.heightM / 2, 0);
    controls.maxPolarAngle = Math.PI / 2.05; // don't drop below ground

    // Lights.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(span, maxDim * 2 + 20, span * 0.6);
    scene.add(sun);

    // Ground grid.
    const grid = new THREE.GridHelper(Math.ceil(span * 2.2), Math.ceil(span * 2.2 / 5), 0xcbd5e1, 0xe2e8f0);
    (grid.material as THREE.Material).opacity = 0.5;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Helper: THREE.Shape from local-metre points.
    const toShape = (pts: [number, number][]) => {
      const s = new THREE.Shape();
      pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      s.closePath();
      return s;
    };

    // Parcel pad (lies flat; rotate the XY shape onto the ground plane).
    const padGeo = new THREE.ShapeGeometry(toShape(massing.parcel));
    padGeo.rotateX(-Math.PI / 2);
    const pad = new THREE.Mesh(
      padGeo,
      new THREE.MeshStandardMaterial({ color: 0xdfeae4, roughness: 1, side: THREE.DoubleSide }),
    );
    pad.position.y = 0.02;
    scene.add(pad);
    // Parcel outline.
    const padEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(padGeo),
      new THREE.LineBasicMaterial({ color: 0x94a3b8 }),
    );
    padEdge.position.y = 0.03;
    scene.add(padEdge);

    // Building envelope (extrude up to height).
    const extrude = new THREE.ExtrudeGeometry(toShape(massing.footprint), {
      depth: massing.heightM,
      bevelEnabled: false,
    });
    extrude.rotateX(-Math.PI / 2); // extrusion (+Z) becomes +Y (up)
    const building = new THREE.Mesh(
      extrude,
      new THREE.MeshStandardMaterial({
        color: TEAL,
        roughness: 0.55,
        metalness: 0.05,
        transparent: true,
        opacity: 0.92,
      }),
    );
    scene.add(building);
    scene.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(extrude),
        new THREE.LineBasicMaterial({ color: 0xffffff }),
      ),
    );

    // Per-storey floor outlines.
    const storeyLines = Math.min(massing.storeys, 60);
    const loop = [...massing.footprint, massing.footprint[0]];
    for (let k = 1; k < storeyLines; k++) {
      const y = k * massing.storeyHeightM;
      if (y >= massing.heightM) break;
      const geo = new THREE.BufferGeometry().setFromPoints(
        loop.map(([x, yy]) => new THREE.Vector3(x, y, -yy)),
      );
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xbfe3e8 })));
    }

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || width;
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [massing]);

  return <div ref={mountRef} className="w-full" style={{ height: 400 }} aria-label="3D building envelope" />;
}
