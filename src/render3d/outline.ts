import * as THREE from 'three';

/** 需要描边的对象所在图层（模型、布景、法宝等）。 */
export const OUTLINE_LAYER = 1;

/** 把对象（含子孙）中的网格加入描边图层。 */
export function markOutline(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.layers.enable(OUTLINE_LAYER);
  });
}

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const frag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 ink;
uniform float thickness;
uniform float strength;

float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  // 笔触：线宽沿画面缓慢变化，模拟毛笔的粗细起伏
  vec2 cell = floor(vUv * vec2(96.0, 54.0));
  float j = mix(hash(cell), hash(cell + 1.0), 0.5);
  vec2 o = texel * thickness * (0.7 + 0.6 * j);

  vec4 n0 = texture2D(tNormal, vUv);
  float d0 = linDepth(vUv);
  float dmin = n0.a > 0.5 ? d0 : 1e6;
  float dEdge = 0.0;
  float nEdge = 0.0;
  float sil = 0.0;

  vec2 offs[4];
  offs[0] = vec2(o.x, 0.0);
  offs[1] = vec2(-o.x, 0.0);
  offs[2] = vec2(0.0, o.y);
  offs[3] = vec2(0.0, -o.y);

  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + offs[i];
    vec4 n = texture2D(tNormal, uv);
    if (n.a > 0.5 && n0.a > 0.5) {
      float d = linDepth(uv);
      dmin = min(dmin, d);
      dEdge = max(dEdge, abs(d - d0) / max(min(d, d0), 1.0));
      vec3 a = normalize(n.xyz * 2.0 - 1.0);
      vec3 b = normalize(n0.xyz * 2.0 - 1.0);
      nEdge = max(nEdge, 1.0 - dot(a, b));
    } else if (n.a > 0.5 || n0.a > 0.5) {
      // 物体与空白（地面 / 天空）交界：轮廓线
      sil = 1.0;
      if (n.a > 0.5) dmin = min(dmin, linDepth(uv));
    }
  }

  float e = max(sil, max(smoothstep(0.035, 0.07, dEdge), smoothstep(0.3, 0.6, nEdge)));
  // 远处线条变淡，像水墨的远景
  float fade = 1.0 - smoothstep(1300.0, 3200.0, dmin);
  gl_FragColor = vec4(ink, e * strength * fade);
}`;

/**
 * 水墨描边后处理：
 * 1. 只渲染描边图层，输出视图空间法线 + 深度；
 * 2. 正常渲染场景；
 * 3. 全屏片元着色器根据深度 / 法线突变求出边缘，以墨色叠加到画面上。
 */
export class OutlineEffect {
  enabled = true;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly normalMat = new THREE.MeshNormalMaterial();
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat: THREE.ShaderMaterial;
  private readonly clear = new THREE.Color();

  constructor(private readonly renderer: THREE.WebGLRenderer, width: number, height: number) {
    const pr = renderer.getPixelRatio();
    const w = Math.round(width * pr);
    const h = Math.round(height * pr);
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    this.target = new THREE.WebGLRenderTarget(w, h, {
      depthTexture,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tNormal: { value: this.target.texture },
        tDepth: { value: depthTexture },
        texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        cameraNear: { value: 10 },
        cameraFar: { value: 6000 },
        ink: { value: new THREE.Color('#1a1612') },
        thickness: { value: 1.7 * pr },
        strength: { value: 0.9 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  setInk(color: THREE.ColorRepresentation): void {
    (this.mat.uniforms.ink.value as THREE.Color).set(color);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const r = this.renderer;
    if (!this.enabled) {
      r.render(scene, camera);
      return;
    }
    // 1) 法线 + 深度
    const bg = scene.background;
    const fog = scene.fog;
    const prevAlpha = r.getClearAlpha();
    r.getClearColor(this.clear);
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.normalMat;
    camera.layers.set(OUTLINE_LAYER);
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.setClearColor(this.clear, prevAlpha);
    camera.layers.set(0);
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = fog;

    // 2) 正常画面
    r.render(scene, camera);

    // 3) 叠加墨线
    this.mat.uniforms.cameraNear.value = camera.near;
    this.mat.uniforms.cameraFar.value = camera.far;
    const auto = r.autoClear;
    r.autoClear = false;
    r.render(this.quadScene, this.quadCam);
    r.autoClear = auto;
  }
}
