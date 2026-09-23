// Abstract "Omniverse-inspired" 3D readout: a connected system of glowing nodes.
// Not a literal Omniverse/USD scene (that needs local RTX hardware or NVIDIA's
// cloud streaming service, neither of which fits a link anyone can open) —
// this reproduces the aesthetic (glowing nodes, connective energy beams,
// a living system that reacts to state) directly in WebGL via three.js.

class EconomyVisualization {
  constructor(container, canvas) {
    this.container = container;
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 1.4, 7.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.scene.add(new THREE.AmbientLight(0x223344, 1.2));
    const key = new THREE.PointLight(0x4fd1c5, 2.5, 20);
    key.position.set(3, 4, 5);
    this.scene.add(key);

    this.nodePositions = {
      rate: new THREE.Vector3(0, 1.6, 0),
      cpi: new THREE.Vector3(-2.1, -1.0, 0.6),
      gs10: new THREE.Vector3(2.1, -1.0, -0.6),
      unrate: new THREE.Vector3(0, -0.4, -2.0),
      pressure: new THREE.Vector3(2.6, 0.6, 1.8),
    };

    this.nodes = {};
    for (const key2 of Object.keys(this.nodePositions)) {
      const geo = new THREE.SphereGeometry(0.5, 32, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4fd1c5,
        emissive: 0x1a4a45,
        emissiveIntensity: 1.2,
        roughness: 0.35,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(this.nodePositions[key2]);
      this.group.add(mesh);
      this.nodes[key2] = mesh;
    }

    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x336655,
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.4,
        wireframe: true,
      })
    );
    this.group.add(this.core);

    this.beams = {};
    for (const key3 of ["cpi", "gs10", "unrate"]) {
      const beam = this.makeBeam(this.nodePositions.rate, this.nodePositions[key3]);
      this.group.add(beam);
      this.beams[key3] = beam;
    }
    // The Pressure Index isn't driven by the rate — it feeds INTO inflation instead.
    const pressureBeam = this.makeBeam(this.nodePositions.pressure, this.nodePositions.cpi);
    this.group.add(pressureBeam);
    this.beams.pressure = pressureBeam;

    this.labels = this.makeLabelSprites();

    this._resize();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);

    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
  }

  makeBeam(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return mesh;
  }

  makeLabelSprites() {
    const labels = {};
    const text = { rate: "RATE", cpi: "CPI", gs10: "10Y", unrate: "UNEMP", pressure: "PRESSURE" };
    for (const key of Object.keys(this.nodePositions)) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.font = "bold 36px sans-serif";
      ctx.fillStyle = "#e6edf3";
      ctx.textAlign = "center";
      ctx.fillText(text[key], 128, 44);
      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(1.4, 0.35, 1);
      sprite.position.copy(this.nodePositions[key]).add(new THREE.Vector3(0, 0.75, 0));
      this.group.add(sprite);
      labels[key] = sprite;
    }
    return labels;
  }

  _resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  static lerpColor(c1, c2, t) {
    const a = new THREE.Color(c1);
    const b = new THREE.Color(c2);
    return a.lerp(b, Math.min(Math.max(t, 0), 1));
  }

  update(snap) {
    this.latest = snap;

    const rateT = snap.fedfunds / 22;
    this._setNode("rate", rateT, 0.4 + rateT * 0.35);

    const cpiT = (snap.cpiYoy - 1) / 14;
    this._setNode("cpi", cpiT, 0.35 + Math.min(Math.max(cpiT, 0), 1) * 0.4);

    const yield10yT = snap.yield10y / 20;
    this._setNode("gs10", yield10yT, 0.4 + yield10yT * 0.3);

    const unrateT = (snap.unrate - 4) / 10;
    this._setNode("unrate", unrateT, 0.35 + Math.min(Math.max(unrateT, 0), 1) * 0.4);

    const pressureT = Math.min(Math.abs(snap.pressureIndexReturn) / 0.3, 1);
    this._setNode("pressure", pressureT, 0.35 + pressureT * 0.4);

    const stress = (Math.min(Math.max(cpiT, 0), 1) + Math.min(Math.max(unrateT, 0), 1)) / 2;
    const coreColor = EconomyVisualization.lerpColor(0x4fd1c5, 0xfc8181, stress);
    this.core.material.emissive = coreColor;
    this.stress = stress;

    for (const key of Object.keys(this.beams)) {
      const node = this.nodes[key];
      this.beams[key].material.color = node.material.color;
    }
  }

  _setNode(key, t, scale) {
    const mesh = this.nodes[key];
    const color = EconomyVisualization.lerpColor(0x4fd1c5, 0xfc8181, t);
    mesh.material.color = color;
    mesh.material.emissive = EconomyVisualization.lerpColor(0x1a4a45, 0x7a1f1f, t);
    mesh.scale.setScalar(scale / 0.5);
  }

  _animate() {
    if (this._stopped) return;
    requestAnimationFrame(this._animate);
    const t = this.clock.getElapsedTime();
    this.group.rotation.y = t * 0.12;
    const pulse = 1 + Math.sin(t * (1.5 + (this.stress || 0) * 3)) * 0.08;
    this.core.scale.setScalar(pulse);
    this.core.rotation.x = t * 0.4;
    this.core.rotation.y = t * 0.6;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._stopped = true;
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
  }
}
