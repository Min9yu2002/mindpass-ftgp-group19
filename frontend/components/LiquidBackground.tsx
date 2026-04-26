"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

const RIPPLE_COUNT = 12;

const vertexShaderSource = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform vec2 uPointer;
uniform vec2 uVelocity;
uniform float uTime;
uniform float uInteraction;
uniform float uMotionScale;
uniform vec4 uRipples[${RIPPLE_COUNT}];
uniform vec3 uColorBgA;
uniform vec3 uColorBgB;
uniform vec3 uColorFieldA;
uniform vec3 uColorFieldB;
uniform vec3 uColorFieldC;
uniform vec3 uColorFieldD;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.02 + vec2(14.2, 9.7);
    amplitude *= 0.5;
  }

  return value;
}

vec2 rippleOffset(vec2 p, float aspect) {
  vec2 offset = vec2(0.0);

  for (int i = 0; i < ${RIPPLE_COUNT}; i++) {
    vec4 ripple = uRipples[i];
    if (ripple.w <= 0.0001) {
      continue;
    }

    vec2 center = ripple.xy * 2.0 - 1.0;
    center.x *= aspect;

    vec2 diff = p - center;
    float distanceToRipple = length(diff);
    float wave = sin(distanceToRipple * 24.0 - ripple.z * 16.0);
    float envelope = exp(-distanceToRipple * 4.8) * exp(-ripple.z * 0.92);

    offset += normalize(diff + 0.0001) * wave * envelope * ripple.w * 0.09;
  }

  return offset;
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= aspect;

  float t = uTime * 0.18;
  vec2 pointer = uPointer * 2.0 - 1.0;
  pointer.x *= aspect;

  vec2 velocity = vec2(uVelocity.x * aspect, uVelocity.y);
  float pointerSpeed = clamp(length(velocity) * 18.0 + uInteraction * 0.8, 0.0, 1.4);

  vec2 fluidDrift = vec2(
    fbm(p * 1.18 + vec2(t * 0.72, -t * 0.46)),
    fbm((p + 2.4) * 1.34 - vec2(t * 0.44, t * 0.61))
  ) - 0.5;

  vec2 ripple = rippleOffset(p, aspect);
  float pointerDistance = length(p - pointer);
  float pointerCore = exp(-pointerDistance * 7.2);
  float pointerMask = exp(-pointerDistance * 2.1);
  vec2 flowDirection = normalize(velocity + vec2(0.0001));
  vec2 pointerPull = (pointer - p) * pointerMask * (0.055 + 0.06 * uInteraction);
  vec2 pointerSwirl = vec2(-(p.y - pointer.y), p.x - pointer.x);
  pointerSwirl = normalize(pointerSwirl + flowDirection * 0.28 + 0.0001)
    * pointerMask
    * (0.08 + 0.12 * pointerSpeed);
  vec2 pointerTurbulence = vec2(
    fbm(p * 2.8 + pointer * 2.2 + vec2(t * 1.24, -t * 1.08)),
    fbm(p * 2.6 - pointer * 1.8 + vec2(-t * 1.12, t * 0.96))
  ) - 0.5;
  pointerTurbulence *= pointerMask * (0.06 + 0.1 * uInteraction);

  vec2 fieldUv = p
    + fluidDrift * (0.32 * uMotionScale)
    + ripple * (1.15 * uMotionScale)
    + pointerPull * uMotionScale
    + pointerSwirl * uMotionScale;
  fieldUv += pointerTurbulence * uMotionScale;

  vec2 centerA = vec2(-0.72 + 0.18 * sin(t * 1.12), -0.26 + 0.16 * cos(t * 0.86));
  vec2 centerB = vec2(0.62 + 0.16 * cos(t * 0.74), -0.42 + 0.18 * sin(t * 1.06));
  vec2 centerC = vec2(-0.12 + 0.24 * cos(t * 0.52), 0.66 + 0.14 * sin(t * 0.82));
  vec2 centerD = vec2(0.56 + 0.18 * sin(t * 0.64), 0.32 + 0.2 * cos(t * 0.7));

  float blobA = exp(-2.6 * dot(fieldUv - centerA, fieldUv - centerA));
  float blobB = exp(-2.3 * dot(fieldUv - centerB, fieldUv - centerB));
  float blobC = exp(-2.8 * dot(fieldUv - centerC, fieldUv - centerC));
  float blobD = exp(-2.0 * dot(fieldUv - centerD, fieldUv - centerD));

  float mist = fbm(fieldUv * 1.72 + vec2(-t * 0.38, t * 0.26));
  float baseMix = clamp(0.46 + fieldUv.y * 0.17 + mist * 0.14, 0.0, 1.0);

  vec3 color = mix(uColorBgA, uColorBgB, baseMix);
  color = mix(color, uColorFieldC, clamp(blobC * 0.88 + mist * 0.08, 0.0, 1.0));
  color = mix(color, uColorFieldA, clamp(blobA * 0.8, 0.0, 1.0));
  color = mix(color, uColorFieldB, clamp(blobB * 0.72, 0.0, 1.0));
  color = mix(color, uColorFieldD, clamp(blobD * 0.62, 0.0, 1.0));
  color = mix(color, mix(uColorFieldA, uColorFieldB, 0.45), pointerCore * (0.08 + 0.16 * pointerSpeed));

  float upperLift = smoothstep(1.05, -0.1, vUv.y) * 0.05;
  float vignette = smoothstep(1.62, 0.42, length(vec2((vUv.x - 0.5) * aspect, vUv.y - 0.48)));

  color += upperLift;
  color = mix(mix(color, uColorBgA, 0.18), color, vignette);

  gl_FragColor = vec4(color, 0.98);
}
`;

type ParsedColor = [number, number, number, number];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseCssColor(value: string): ParsedColor {
  const color = value.trim();

  if (color.startsWith("#")) {
    const normalized = color.slice(1);
    const hex =
      normalized.length === 3 || normalized.length === 4
        ? normalized
            .split("")
            .map((token) => token + token)
            .join("")
        : normalized;

    const hasAlpha = hex.length === 8;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hasAlpha ? parseInt(hex.slice(6, 8), 16) / 255 : 1;

    return [r, g, b, a];
  }

  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1]
      .split(/[,\s/]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const [r, g, b, a = "1"] = parts;
    return [
      clamp(Number(r) / 255, 0, 1),
      clamp(Number(g) / 255, 0, 1),
      clamp(Number(b) / 255, 0, 1),
      clamp(Number(a), 0, 1),
    ];
  }

  return [0, 0, 0, 1];
}

function compositeOn(base: ParsedColor, overlay: ParsedColor): [number, number, number] {
  const alpha = overlay[3];
  return [
    overlay[0] * alpha + base[0] * (1 - alpha),
    overlay[1] * alpha + base[1] * (1 - alpha),
    overlay[2] * alpha + base[2] * (1 - alpha),
  ];
}

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Unable to create shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(info);
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "Unknown program error";
    gl.deleteProgram(program);
    throw new Error(info);
  }

  return program;
}

export default function LiquidBackground() {
  const { resolvedTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      root.dataset.liquidBackground = "fallback";
      return;
    }

    let animationFrame = 0;
    let disposed = false;
    let rafStart = 0;
    let previousFrame = 0;

    const program = createProgram(gl);
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const resolutionLocation = gl.getUniformLocation(program, "uResolution");
    const pointerLocation = gl.getUniformLocation(program, "uPointer");
    const velocityLocation = gl.getUniformLocation(program, "uVelocity");
    const timeLocation = gl.getUniformLocation(program, "uTime");
    const interactionLocation = gl.getUniformLocation(program, "uInteraction");
    const motionScaleLocation = gl.getUniformLocation(program, "uMotionScale");
    const ripplesLocation = gl.getUniformLocation(program, "uRipples[0]");
    const colorBgALocation = gl.getUniformLocation(program, "uColorBgA");
    const colorBgBLocation = gl.getUniformLocation(program, "uColorBgB");
    const colorFieldALocation = gl.getUniformLocation(program, "uColorFieldA");
    const colorFieldBLocation = gl.getUniformLocation(program, "uColorFieldB");
    const colorFieldCLocation = gl.getUniformLocation(program, "uColorFieldC");
    const colorFieldDLocation = gl.getUniformLocation(program, "uColorFieldD");

    const quad = gl.createBuffer();
    if (!quad) {
      root.dataset.liquidBackground = "fallback";
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const currentPointer = { x: 0.5, y: 0.5 };
    const targetPointer = { x: 0.5, y: 0.5 };
    const velocity = { x: 0, y: 0 };
    let interactionEnergy = 0;
    const ripples = Array.from({ length: RIPPLE_COUNT }, () => ({
      x: 0.5,
      y: 0.5,
      age: 99,
      strength: 0,
    }));
    const rippleUniform = new Float32Array(RIPPLE_COUNT * 4);

    let lastPointerX = window.innerWidth * 0.5;
    let lastPointerY = window.innerHeight * 0.5;
    let lastRippleStamp = 0;

    const setColorUniform = (
      location: WebGLUniformLocation | null,
      color: [number, number, number],
    ) => {
      if (location) {
        gl.uniform3fv(location, color);
      }
    };

    const readThemeColors = () => {
      const styles = getComputedStyle(root);
      const bgPrimary = parseCssColor(styles.getPropertyValue("--bg-primary"));
      const bgSecondary = parseCssColor(styles.getPropertyValue("--bg-secondary"));
      const fieldPrimary = parseCssColor(styles.getPropertyValue("--liquid-field-primary"));
      const fieldSecondary = parseCssColor(styles.getPropertyValue("--liquid-field-secondary"));
      const fieldTertiary = parseCssColor(styles.getPropertyValue("--liquid-field-tertiary"));
      const fieldQuaternary = parseCssColor(styles.getPropertyValue("--liquid-field-quaternary"));

      setColorUniform(colorBgALocation, [bgPrimary[0], bgPrimary[1], bgPrimary[2]]);
      setColorUniform(colorBgBLocation, [bgSecondary[0], bgSecondary[1], bgSecondary[2]]);
      setColorUniform(colorFieldALocation, compositeOn(bgSecondary, fieldPrimary));
      setColorUniform(colorFieldBLocation, compositeOn(bgSecondary, fieldSecondary));
      setColorUniform(colorFieldCLocation, compositeOn(bgPrimary, fieldTertiary));
      setColorUniform(colorFieldDLocation, compositeOn(bgSecondary, fieldQuaternary));
    };

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
      const width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
      const height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));

      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;

      gl.viewport(0, 0, width, height);
      if (resolutionLocation) {
        gl.uniform2f(resolutionLocation, width, height);
      }
    };

    const spawnRipple = (x: number, y: number, strength: number) => {
      const nextRipple = ripples.reduce((lowest, ripple, index) => {
        return ripple.age > ripples[lowest].age ? index : lowest;
      }, 0);

      ripples[nextRipple] = {
        x,
        y,
        age: 0,
        strength,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetPointer.x = clamp(event.clientX / window.innerWidth, 0, 1);
      targetPointer.y = clamp(1 - event.clientY / window.innerHeight, 0, 1);

      if (prefersReducedMotion) {
        return;
      }

      const deltaX = event.clientX - lastPointerX;
      const deltaY = event.clientY - lastPointerY;
      const distance = Math.hypot(deltaX, deltaY);
      const now = performance.now();
      const moveStrength = clamp(distance / 140, 0, 1);

      velocity.x = clamp(deltaX / Math.max(window.innerWidth, 1), -0.22, 0.22);
      velocity.y = clamp(-deltaY / Math.max(window.innerHeight, 1), -0.22, 0.22);
      interactionEnergy = Math.max(interactionEnergy, moveStrength);

      if (distance > 4 && now - lastRippleStamp > 18) {
        spawnRipple(
          targetPointer.x,
          targetPointer.y,
          clamp(distance / 24, 0.3, 1.45),
        );
        lastRippleStamp = now;
      }

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    };

    const handlePointerDown = (event: PointerEvent) => {
      targetPointer.x = clamp(event.clientX / window.innerWidth, 0, 1);
      targetPointer.y = clamp(1 - event.clientY / window.innerHeight, 0, 1);
      interactionEnergy = 1;

      if (!prefersReducedMotion) {
        spawnRipple(targetPointer.x, targetPointer.y, 1.5);
      }

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    };

    const updateRippleUniform = () => {
      for (let index = 0; index < RIPPLE_COUNT; index += 1) {
        const ripple = ripples[index];
        const offset = index * 4;

        rippleUniform[offset] = ripple.x;
        rippleUniform[offset + 1] = ripple.y;
        rippleUniform[offset + 2] = ripple.age;
        rippleUniform[offset + 3] = ripple.strength;
      }

      if (ripplesLocation) {
        gl.uniform4fv(ripplesLocation, rippleUniform);
      }
    };

    const draw = (timestamp: number) => {
      if (disposed) {
        return;
      }

      if (rafStart === 0) {
        rafStart = timestamp;
        previousFrame = timestamp;
      }

      const delta = (timestamp - previousFrame) / 1000;
      previousFrame = timestamp;
      const frameScale = delta * 60;

      currentPointer.x += (targetPointer.x - currentPointer.x) * Math.min(0.18 * frameScale, 0.24);
      currentPointer.y += (targetPointer.y - currentPointer.y) * Math.min(0.18 * frameScale, 0.24);

      velocity.x *= Math.pow(0.88, frameScale);
      velocity.y *= Math.pow(0.88, frameScale);
      interactionEnergy *= Math.pow(0.9, frameScale);

      for (const ripple of ripples) {
        if (ripple.strength <= 0.0001) {
          continue;
        }

        ripple.age += delta;
        ripple.strength *= Math.pow(0.965, frameScale);

        if (ripple.age > 3.2 || ripple.strength < 0.001) {
          ripple.age = 99;
          ripple.strength = 0;
        }
      }

      const elapsed = prefersReducedMotion ? 0 : (timestamp - rafStart) / 1000;

      if (timeLocation) {
        gl.uniform1f(timeLocation, elapsed);
      }

      if (interactionLocation) {
        gl.uniform1f(interactionLocation, interactionEnergy);
      }

      if (motionScaleLocation) {
        gl.uniform1f(motionScaleLocation, prefersReducedMotion ? 0 : 1);
      }

      if (pointerLocation) {
        gl.uniform2f(pointerLocation, currentPointer.x, currentPointer.y);
      }

      if (velocityLocation) {
        gl.uniform2f(velocityLocation, velocity.x, velocity.y);
      }

      updateRippleUniform();

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (!prefersReducedMotion) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    root.dataset.liquidBackground = prefersReducedMotion ? "static" : "interactive";
    readThemeColors();
    resize();
    updateRippleUniform();

    const classObserver = new MutationObserver(() => {
      readThemeColors();
    });

    classObserver.observe(root, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });

    if (prefersReducedMotion) {
      draw(0);
    } else {
      animationFrame = window.requestAnimationFrame(draw);
    }

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.cancelAnimationFrame(animationFrame);
      classObserver.disconnect();
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      delete root.dataset.liquidBackground;
    };
  }, [resolvedTheme]);

  return (
    <div className="liquid-background" aria-hidden="true">
      <canvas ref={canvasRef} className="liquid-background__canvas" />
    </div>
  );
}
