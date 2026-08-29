import * as THREE from 'three';

/**
 * Creates a clean, solid white circular sun disc with a prominent, wide glowing halo.
 */
export class SunShaderDecal {
    constructor(scene, camera, options = {}) {
        this.scene = scene;
        this.camera = camera;

        const distance = options.distance || 400;
        const size = options.size || 140;
        const sunDirection = (options.direction || new THREE.Vector3(0.5, 0.8, -0.6)).normalize();

        // Shader uniforms
        this.uniforms = {
            uTime: { value: 0 },
            uCoreColor: { value: new THREE.Color(options.coreColor || 0xffffff) },
            uGlowColor: { value: new THREE.Color(options.glowColor || 0xffd27d) },
            uRadius: { value: 0.12 },        // Sharp solid white circle radius
            uGlowRadius: { value: 0.49 },    // Expansive outer glow boundary
            uGlowIntensity: { value: 2.8 }   // Glow vibrancy
        };

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            uniform vec3 uCoreColor;
            uniform vec3 uGlowColor;
            uniform float uRadius;
            uniform float uGlowRadius;
            uniform float uGlowIntensity;
            varying vec2 vUv;

            void main() {
                vec2 center = vec2(0.5, 0.5);
                float dist = length(vUv - center);

                if (dist > 0.5) {
                    discard;
                }

                // Sharp, anti-aliased solid pure white circle
                float edgeSmooth = 0.002;
                float coreMask = 1.0 - smoothstep(uRadius - edgeSmooth, uRadius + edgeSmooth, dist);

                // Multi-layered wide smooth outer glow (bright intense inner rim + wide soft falloff)
                float glowDist = max(0.0, dist - uRadius);
                float normGlow = clamp(glowDist / (uGlowRadius - uRadius), 0.0, 1.0);
                
                // Fast inner falloff + long diffuse tail
                float innerGlow = pow(1.0 - normGlow, 4.0) * 1.8;
                float wideGlow = pow(1.0 - normGlow, 1.6) * 0.8;
                float totalGlow = (innerGlow + wideGlow) * uGlowIntensity;

                // Color grading: bright warm white near the edge transitioning to golden amber outward
                vec3 glowColor = mix(uGlowColor, vec3(1.0, 0.96, 0.85), clamp(innerGlow * 0.5, 0.0, 1.0));

                vec3 finalColor = mix(glowColor * totalGlow, uCoreColor, coreMask);
                float finalAlpha = clamp(coreMask + totalGlow * 0.85, 0.0, 1.0);

                // Soft fade at mesh boundary to avoid any clipping edge
                finalAlpha *= smoothstep(0.5, 0.45, dist);

                if (finalAlpha <= 0.002) {
                    discard;
                }

                gl_FragColor = vec4(finalColor, finalAlpha);
            }
        `;

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });

        const geometry = new THREE.PlaneGeometry(size, size);
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.renderOrder = -1; // Render behind scene geometry

        this.sunDirection = sunDirection;
        this.distance = distance;

        // Position mesh in direction
        this.updatePosition();

        this.scene.add(this.mesh);

        // Sun direction reference light
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.0);
        this.directionalLight.position.copy(this.sunDirection).multiplyScalar(100);
        this.directionalLight.castShadow = false;
        this.scene.add(this.directionalLight);
    }

    updatePosition() {
        if (this.camera) {
            // Keep the sun locked relative to camera position to simulate infinite celestial distance
            this.mesh.position.copy(this.camera.position).addScaledVector(this.sunDirection, this.distance);
            this.mesh.quaternion.copy(this.camera.quaternion);
        }
    }

    update(delta = 0.016) {
        this.uniforms.uTime.value += delta;
        this.updatePosition();
    }

    setDirection(dirVector) {
        this.sunDirection.copy(dirVector).normalize();
        this.directionalLight.position.copy(this.sunDirection).multiplyScalar(50);
        this.updatePosition();
    }
}
