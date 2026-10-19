'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { MotionValue } from 'motion/react';
import styles from './PromoVideo.module.css';

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D video;
uniform vec2 lensSize;
uniform vec2 videoSize;
uniform vec2 center;
uniform float angle;
uniform vec3 tint;
varying vec2 uv;

float capsule(vec2 p) {
  float r = lensSize.y * 0.5;
  vec2 q = abs(p) - vec2(lensSize.x * 0.5 - r, 0.0);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = vec2(uv.x - 0.5, 0.5 - uv.y) * lensSize;
  float distance = capsule(p);
  if (distance > 0.0) discard;
  vec2 normal = normalize(vec2(
    capsule(p + vec2(0.5, 0.0)) - capsule(p - vec2(0.5, 0.0)),
    capsule(p + vec2(0.0, 0.5)) - capsule(p - vec2(0.0, 0.5))
  ) + vec2(0.0001));
  float depth = clamp(1.0 + distance / 14.0, 0.0, 1.0);
  float rim = 1.0 - sqrt(1.0 - depth * depth);
  vec2 bent = p * 0.98 - normal * rim * 7.0;
  mat2 rotation = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  vec2 point = center + rotation * bent;
  vec2 sampleUV = vec2(point.x / videoSize.x, 1.0 - point.y / videoSize.y);
  vec2 fringe = rotation * normal * rim * 0.4 / videoSize;
  fringe.y *= -1.0;
  vec3 color = vec3(0.0);
  float total = 0.0;
  float inner = 1.0 - smoothstep(0.0, 0.6, depth);
  vec2 blur = (1.1 + 0.8 * inner) / videoSize;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      float weight = exp(-float(i * i + j * j) * 0.35);
      vec2 offset = vec2(float(i), float(j)) * blur;
      color += weight * vec3(
        texture2D(video, sampleUV + offset + fringe).r,
        texture2D(video, sampleUV + offset).g,
        texture2D(video, sampleUV + offset - fringe).b
      );
      total += weight;
    }
  }
  color /= total;
  color = mix(color, tint, 0.2 + 0.2 * uv.y);
  float across = abs(uv.x - 0.5) * 2.0;
  float below = 1.0 - uv.y;
  float reach = 0.36 - 0.16 * across * across;
  float inset = smoothstep(0.0, 0.14, uv.x) * smoothstep(0.0, 0.14, 1.0 - uv.x);
  float gloss = (1.0 - smoothstep(0.02, reach, below)) * inset;
  color += vec3(gloss * 0.2);
  float shine = pow(max(dot(normal, normalize(vec2(-0.5, -1.0))), 0.0), 3.0);
  float edge = smoothstep(-2.0, 0.0, distance);
  float ring = smoothstep(-1.6, -0.6, distance) * (1.0 - smoothstep(-0.5, 0.0, distance));
  color += vec3(ring * (0.34 + 0.3 * shine));
  color += vec3(shine * edge * 0.3);
  color *= 1.0 - edge * (1.0 - shine) * 0.1;
  gl_FragColor = vec4(color, 1.0);
}`;

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
};

export default function VideoGlassLens({ videoRef, buttonRef, x, y, rotate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const button = buttonRef.current;
    if (!canvas || !video || !button) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return;

    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const release = () => {
      delete button.dataset.lensReady;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
    };
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
      return shader;
    };

    try {
      if (!program || !buffer || !texture) throw new Error('WebGL resources unavailable');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
    } catch {
      release();
      return;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program!, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.uniform1i(gl.getUniformLocation(program!, 'video'), 0);
    const uniforms = Object.fromEntries(['lensSize', 'videoSize', 'center', 'angle', 'tint'].map((name) => [name, gl.getUniformLocation(program!, name)]));
    let frame = 0;
    let visible = false;
    let stopped = false;
    let lastTime = -1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    gl.uniform3f(uniforms.tint, 0.06, 0.06, 0.09);
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(button.offsetWidth * dpr));
      canvas.height = Math.max(1, Math.round(button.offsetHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      schedule();
    };
    const draw = () => {
      frame = 0;
      if (stopped || !visible || document.hidden) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        try {
          if (lastTime !== video.currentTime) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            lastTime = video.currentTime;
          }
          const videoRect = video.getBoundingClientRect();
          const buttonRect = button.getBoundingClientRect();
          gl.uniform2f(uniforms.lensSize, button.offsetWidth, button.offsetHeight);
          gl.uniform2f(uniforms.videoSize, videoRect.width, videoRect.height);
          gl.uniform2f(uniforms.center, buttonRect.left + buttonRect.width / 2 - videoRect.left, buttonRect.top + buttonRect.height / 2 - videoRect.top);
          gl.uniform1f(uniforms.angle, reducedMotion.matches || button.matches(':focus-visible') ? 0 : rotate.get() * Math.PI / 180);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          button.dataset.lensReady = 'true';
        } catch {
          stopped = true;
          delete button.dataset.lensReady;
        }
      }
      if (!video.paused && !video.ended) schedule();
    };
    function schedule() {
      if (!frame && !stopped && visible && !document.hidden) frame = requestAnimationFrame(draw);
    }
    const contextLost = (event: Event) => {
      event.preventDefault();
      stopped = true;
      cancelAnimationFrame(frame);
      delete button.dataset.lensReady;
    };
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else { cancelAnimationFrame(frame); frame = 0; }
    });
    intersection.observe(canvas);
    const size = new ResizeObserver(resize);
    size.observe(button);
    const unsubscribe = [x, y, rotate].map((value) => value.on('change', schedule));
    const events = ['loadeddata', 'play', 'pause', 'seeked'] as const;
    events.forEach((name) => video.addEventListener(name, schedule));
    document.addEventListener('visibilitychange', schedule);
    canvas.addEventListener('webglcontextlost', contextLost);
    resize();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      intersection.disconnect();
      size.disconnect();
      unsubscribe.forEach((dispose) => dispose());
      events.forEach((name) => video.removeEventListener(name, schedule));
      document.removeEventListener('visibilitychange', schedule);
      canvas.removeEventListener('webglcontextlost', contextLost);
      release();
    };
  }, [videoRef, buttonRef, x, y, rotate]);

  return <canvas ref={canvasRef} className={styles.lens} aria-hidden="true" />;
}
