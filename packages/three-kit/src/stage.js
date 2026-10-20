// Stage: um unico WebGLRenderer em que vivem TODAS as cenas 3D do video.
// Cada frame: render da cena A (e B, numa transicao) para render targets HDR,
// mistura no TransitionPass (GLSL), depois bloom + tone mapping + grain + vinheta + aberracao.
// Como as transicoes acontecem dentro do GL, nao ha captura de DOM -> nunca sai preto.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  EffectComposer,
  EffectPass,
  Pass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  NoiseEffect,
  VignetteEffect,
  ChromaticAberrationEffect,
  BlendFunction,
} from "postprocessing";
import { TRANSITION_FRAG, TRANSITIONS } from "./transitions.js";

class TransitionPass extends Pass {
  constructor(texA, texB) {
    super("HF3DTransitionPass");
    this.fullscreenMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: texA },
        tB: { value: texB },
        uMix: { value: 0 },
        uType: { value: 0 },
        uHasB: { value: 0 },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1920, 1080) },
        uAccent: { value: new THREE.Color(0x7c5cff) },
      },
      vertexShader:
        "varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }",
      fragmentShader: TRANSITION_FRAG,
      depthWrite: false,
      depthTest: false,
    });
  }
  render(renderer, inputBuffer, outputBuffer) {
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }
}

export class Stage {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {number} [o.width=1920] @param {number} [o.height=1080]
   * @param {object} [o.bloom] {intensity, threshold, smoothing, radius}
   * @param {number} [o.chroma=0.0012] aberracao cromatica base
   * @param {number} [o.grain=0.05] @param {number} [o.vignette=0.5]
   */
  constructor({
    canvas,
    width = 1920,
    height = 1080,
    bloom = {},
    chroma = 0.0012,
    grain = 0.05,
    vignette = 0.5,
    samples = 4,
  }) {
    this.width = width;
    this.height = height;
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
      stencil: false,
    }));
    r.setPixelRatio(1);
    r.setSize(width, height, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const rtOpts = {
      type: THREE.HalfFloatType,
      samples,
      colorSpace: THREE.LinearSRGBColorSpace,
    };
    this.rtA = new THREE.WebGLRenderTarget(width, height, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(width, height, rtOpts);
    this.composer = new EffectComposer(r, {
      frameBufferType: THREE.HalfFloatType,
    });
    this.tpass = new TransitionPass(this.rtA.texture, this.rtB.texture);
    this.tpass.fullscreenMaterial.uniforms.uRes.value.set(width, height);
    this.composer.addPass(this.tpass);
    const cam = new THREE.PerspectiveCamera();
    this.bloom = new BloomEffect({
      intensity: bloom.intensity ?? 1.4,
      luminanceThreshold: bloom.threshold ?? 0.72,
      luminanceSmoothing: bloom.smoothing ?? 0.25,
      mipmapBlur: true,
      radius: bloom.radius ?? 0.78,
    });
    this.bloomBase = this.bloom.intensity;
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: vignette });
    this.noise = new NoiseEffect({
      premultiply: true,
      blendFunction: BlendFunction.SCREEN,
    });
    this.noise.blendMode.opacity.value = grain;
    this.fx = new EffectPass(
      cam,
      this.bloom,
      this.tone,
      this.vignette,
      this.noise,
    );
    this.composer.addPass(this.fx);
    this.ca = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(chroma, chroma * 0.6),
      radialModulation: true,
      modulationOffset: 0.25,
    });
    this.caBase = chroma;
    this.caPass = new EffectPass(cam, this.ca);
    this.composer.addPass(this.caPass);
    this.scenes = {};
  }
  /** Regista uma cena: {scene, camera, update(t)}. Use env do stage como scene.environment. */
  add(name, s) {
    if (!s.scene.environment) s.scene.environment = this.env;
    this.scenes[name] = s;
    return s;
  }
  /** Compila shaders de todas as cenas (evita picos no primeiro frame). */
  warm() {
    for (const k in this.scenes) {
      const s = this.scenes[k];
      s.update && s.update(0);
      this.renderer.compile(s.scene, s.camera);
    }
  }
  /**
   * Desenha um frame. Chamar SEMPRE com o tempo da timeline.
   * @param {number} t tempo global (s)
   * @param {string} a cena actual @param {string|null} b cena seguinte (transicao)
   * @param {number} mix 0..1 progresso da transicao @param {string|number} type nome em TRANSITIONS
   * @param {object} [fx] {chroma, bloom} overrides por frame (ex.: pulso no beat)
   */
  render(t, a, b = null, mix = 0, type = "fade", fx = {}) {
    const r = this.renderer,
      A = this.scenes[a];
    A.update && A.update(t);
    r.setRenderTarget(this.rtA);
    r.clear();
    r.render(A.scene, A.camera);
    const u = this.tpass.fullscreenMaterial.uniforms;
    if (b && this.scenes[b]) {
      const B = this.scenes[b];
      B.update && B.update(t);
      r.setRenderTarget(this.rtB);
      r.clear();
      r.render(B.scene, B.camera);
      u.uHasB.value = 1;
    } else u.uHasB.value = 0;
    r.setRenderTarget(null);
    u.uMix.value = mix;
    u.uType.value = typeof type === "number" ? type : (TRANSITIONS[type] ?? 0);
    u.uTime.value = t;
    this.bloom.intensity = fx.bloom ?? this.bloomBase ?? this.bloom.intensity;
    const c = fx.chroma ?? this.caBase;
    this.ca.offset.set(c, c * 0.6);
    // tempo dos efeitos = tempo da timeline (o NoiseEffect deixa de depender do delta)
    this.fx.fullscreenMaterial.time = t;
    this.caPass.fullscreenMaterial.time = t;
    this.composer.render(0);
  }
}
