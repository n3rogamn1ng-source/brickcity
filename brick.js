import * as THREE from 'three';

// ----------------------------------------------------
// 32-Preset Color Palette (Curated Bright & Classic Toy Colors)
// ----------------------------------------------------
export const PALETTE = {
    // Primaries & Vibrant
    Red: 0xff0000,
    Crimson: 0xc41230,
    Maroon: 0x8b0000,
    Coral: 0xff6b6b,
    Orange: 0xff8800,
    Amber: 0xffa500,
    Gold: 0xffd700,
    Yellow: 0xffff00,
    Lemon: 0xf4f460,
    Lime: 0xa6e22e,
    Green: 0x00ff00,
    Forest: 0x228b22,
    Olive: 0x6b8e23,
    Mint: 0x50fa7b,
    Teal: 0x00ffff,
    Cyan: 0x00e5ff,
    Sky: 0x60a5fa,
    Blue: 0x0066ff,
    Navy: 0x002288,
    Indigo: 0x4b0082,
    Purple: 0xb000ff,
    Violet: 0x7c3aed,
    Lavender: 0xdf80ff,
    Magenta: 0xff00ff,
    Pink: 0xff40a0,
    Rose: 0xf43f5e,
    // Earth & Neutrals
    White: 0xffffff,
    Silver: 0xd4d4d8,
    Grey: 0x9ca3af,
    Slate: 0x64748b,
    Dust: 0xe6dcd0,
    Tan: 0xffe4b5,
    Sand: 0xd4b886,
    Brown: 0xb5651d,
    Coffee: 0x6f4e37,
    Black: 0x222222
};

export const PALETTE_LIST = Object.values(PALETTE);
export const PALETTE_NAMES = Object.keys(PALETTE);

const textureLoader = new THREE.TextureLoader();
const studTexture = textureLoader.load('./assets/studd.png');
studTexture.wrapS = THREE.RepeatWrapping;
studTexture.wrapT = THREE.RepeatWrapping;
studTexture.colorSpace = THREE.NoColorSpace;
studTexture.generateMipmaps = false;
studTexture.minFilter = THREE.NearestFilter;
studTexture.magFilter = THREE.NearestFilter;

export function createWedgeGeometry(width, height, depth) {
    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;

    const vertices = new Float32Array([
        // Bottom Face
        -w, -h,  d, // 0
         w, -h,  d, // 1
         w, -h, -d, // 2
        -w, -h, -d, // 3

        // Back Face
         w, -h, -d, // 4
        -w, -h, -d, // 5
        -w,  h, -d, // 6
         w,  h, -d, // 7

        // Slope Face
         w, -h,  d, // 8
        -w, -h,  d, // 9
        -w,  h, -d, // 10
         w,  h, -d, // 11

        // Left Face
        -w, -h,  d, // 12
        -w, -h, -d, // 13
        -w,  h, -d, // 14

        // Right Face
         w, -h,  d, // 15
         w, -h, -d, // 16
         w,  h, -d, // 17
    ]);

    const indices = [
        // Bottom
        0, 2, 1,
        0, 3, 2,

        // Back
        4, 5, 6,
        4, 6, 7,

        // Slope
        8, 10, 9,
        8, 11, 10,

        // Left
        12, 14, 13,

        // Right
        15, 16, 17
    ];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

export function createStudMaterial(width, depth, brickColorHex = 0x00ff00) {
    const brickColor = new THREE.Color(brickColorHex);

    return new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
            uTexture: { value: studTexture },
            uColor: { value: brickColor },
            uOpacity: { value: 1.0 },
            uUseTexture: { value: 1.0 },
            uBaseRepeat: { value: new THREE.Vector2(width / 2, depth / 2) }
        },
        vertexShader: `
            uniform vec2 uBaseRepeat;
            varying vec2 vUv;
            void main() {
                float scaleX = length(modelMatrix[0].xyz);
                float scaleZ = length(modelMatrix[2].xyz);
                vUv = uv * uBaseRepeat * vec2(scaleX, scaleZ);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uTexture;
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uUseTexture;
            varying vec2 vUv;
            void main() {
                vec3 finalColor;
                if (uUseTexture > 0.5) {
                    vec4 texColor = texture2D(uTexture, vUv);
                    float lum = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
                    float diff = lum - (126.0 / 255.0);
                    finalColor = clamp(uColor + vec3(diff * 1.2), 0.0, 1.0);
                } else {
                    finalColor = uColor;
                }
                gl_FragColor = vec4(finalColor, uOpacity);
            }
        `
    });
}

export class BasePart {
    constructor() {
        this.threeMesh = null;
        this.colorHex = 0xffffff;
        this.opacity = 1.0;
        this.textureApplied = true;
    }

    get Position() {
        return this.threeMesh ? this.threeMesh.position : null;
    }

    set Position(pos) {
        if (this.threeMesh) {
            this.threeMesh.position.set(pos.x, pos.y, pos.z);
        }
    }

    destroy() {
        if (this.threeMesh) {
            if (this.threeMesh.parent) {
                this.threeMesh.parent.remove(this.threeMesh);
            }
            if (this.threeMesh.geometry) {
                this.threeMesh.geometry.dispose();
            }
        }
    }

    toJSON() {
        return {
            type: this.threeMesh ? this.threeMesh.userData.primitiveType : 'brick',
            position: this.threeMesh ? [this.threeMesh.position.x, this.threeMesh.position.y, this.threeMesh.position.z] : [0, 0, 0],
            rotation: this.threeMesh ? [this.threeMesh.rotation.x, this.threeMesh.rotation.y, this.threeMesh.rotation.z] : [0, 0, 0],
            scale: this.threeMesh ? [this.threeMesh.scale.x, this.threeMesh.scale.y, this.threeMesh.scale.z] : [1, 1, 1],
            color: this.colorHex,
            opacity: this.opacity,
            textureApplied: this.textureApplied
        };
    }
}

export class Part extends BasePart {
    constructor(x = 0, y = 0, z = 0, colorHex = 0x00ff00, width = 2, height = 1, depth = 4, primitiveType = 'brick') {
        super();
        this.colorHex = colorHex;
        this.width = width;
        this.height = height;
        this.depth = depth;

        const color = new THREE.Color(colorHex);
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const sideMat = new THREE.MeshBasicMaterial({ color });
        const topMat = createStudMaterial(width, depth, colorHex);

        const materials = [
            sideMat,
            sideMat,
            topMat,
            sideMat,
            sideMat,
            sideMat
        ];

        this.threeMesh = new THREE.Mesh(geometry, materials);
        this.threeMesh.position.set(x, y, z);
        this.threeMesh.castShadow = true;
        this.threeMesh.receiveShadow = false;
        this.threeMesh.userData.part = this;
        this.threeMesh.userData.primitiveType = primitiveType;
    }

    recolor(colorHex) {
        this.colorHex = colorHex;
        const color = new THREE.Color(colorHex);
        if (Array.isArray(this.threeMesh.material)) {
            this.threeMesh.material.forEach((mat) => {
                if (mat.uniforms && mat.uniforms.uColor) {
                    mat.uniforms.uColor.value.copy(color);
                } else if (mat.color) {
                    mat.color.copy(color);
                }
            });
        }
    }

    setOpacity(opacity) {
        this.opacity = opacity;
        if (Array.isArray(this.threeMesh.material)) {
            this.threeMesh.material.forEach((mat) => {
                mat.transparent = opacity < 1.0;
                if (mat.uniforms && mat.uniforms.uOpacity) {
                    mat.uniforms.uOpacity.value = opacity;
                } else if (mat.opacity !== undefined) {
                    mat.opacity = opacity;
                }
                mat.needsUpdate = true;
            });
        }
    }

    setTextureApplied(applied) {
        this.textureApplied = applied;
        if (Array.isArray(this.threeMesh.material)) {
            this.threeMesh.material.forEach((mat) => {
                if (mat.uniforms && mat.uniforms.uUseTexture !== undefined) {
                    mat.uniforms.uUseTexture.value = applied ? 1.0 : 0.0;
                }
            });
        }
    }

    resize(width, height, depth) {
        this.width = width;
        this.height = height;
        this.depth = depth;

        if (this.threeMesh.geometry) {
            this.threeMesh.geometry.dispose();
        }
        this.threeMesh.geometry = new THREE.BoxGeometry(width, height, depth);

        if (Array.isArray(this.threeMesh.material)) {
            const oldTop = this.threeMesh.material[2];
            if (oldTop) oldTop.dispose();

            const topMat = createStudMaterial(width, depth, this.colorHex);
            this.threeMesh.material[2] = topMat;
        }

        this.setOpacity(this.opacity);
        this.setTextureApplied(this.textureApplied);
    }
}

export class BallPart extends BasePart {
    constructor(x = 0, y = 0, z = 0, colorHex = 0x0000ff) {
        super();
        this.colorHex = colorHex;

        const geometry = new THREE.SphereGeometry(1, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: colorHex });

        this.threeMesh = new THREE.Mesh(geometry, material);
        this.threeMesh.position.set(x, y, z);
        this.threeMesh.castShadow = true;
        this.threeMesh.receiveShadow = false;
        this.threeMesh.userData.part = this;
        this.threeMesh.userData.primitiveType = 'ball';
    }

    recolor(colorHex) {
        this.colorHex = colorHex;
        if (this.threeMesh.material && this.threeMesh.material.color) {
            this.threeMesh.material.color.copy(new THREE.Color(colorHex));
        }
    }

    setOpacity(opacity) {
        this.opacity = opacity;
        if (this.threeMesh.material) {
            this.threeMesh.material.transparent = opacity < 1.0;
            this.threeMesh.material.opacity = opacity;
            this.threeMesh.material.needsUpdate = true;
        }
    }

    setTextureApplied(applied) {
        this.textureApplied = applied;
    }

    resize(width, height, depth) {
        const radius = width / 2;
        if (this.threeMesh.geometry) {
            this.threeMesh.geometry.dispose();
        }
        this.threeMesh.geometry = new THREE.SphereGeometry(radius, 32, 32);
    }
}

export class WedgePart extends BasePart {
    constructor(x = 0, y = 0, z = 0, colorHex = 0xffff00, width = 2, height = 1, depth = 4) {
        super();
        this.colorHex = colorHex;
        this.width = width;
        this.height = height;
        this.depth = depth;

        const geometry = createWedgeGeometry(width, height, depth);
        const material = new THREE.MeshBasicMaterial({ color: colorHex });

        this.threeMesh = new THREE.Mesh(geometry, material);
        this.threeMesh.position.set(x, y, z);
        this.threeMesh.castShadow = true;
        this.threeMesh.receiveShadow = false;
        this.threeMesh.userData.part = this;
        this.threeMesh.userData.primitiveType = 'wedge';
    }

    recolor(colorHex) {
        this.colorHex = colorHex;
        if (this.threeMesh.material && this.threeMesh.material.color) {
            this.threeMesh.material.color.copy(new THREE.Color(colorHex));
        }
    }

    setOpacity(opacity) {
        this.opacity = opacity;
        if (this.threeMesh.material) {
            this.threeMesh.material.transparent = opacity < 1.0;
            this.threeMesh.material.opacity = opacity;
            this.threeMesh.material.needsUpdate = true;
        }
    }

    setTextureApplied(applied) {
        this.textureApplied = applied;
    }

    resize(width, height, depth) {
        this.width = width;
        this.height = height;
        this.depth = depth;

        if (this.threeMesh.geometry) {
            this.threeMesh.geometry.dispose();
        }
        this.threeMesh.geometry = createWedgeGeometry(width, height, depth);
    }
}

export class BrickManager {
    constructor(scene) {
        this.scene = scene;
        this.bricksGroup = new THREE.Group();
        this.scene.add(this.bricksGroup);
    }

    createBrick(x = 0, y = 0, z = 0, colorHex = 0x00ff00, width = 2, height = 1, depth = 4) {
        const brick = new Part(x, y, z, colorHex, width, height, depth, 'brick');
        this.bricksGroup.add(brick.threeMesh);
        return brick;
    }

    createBaseplate(x = 0, y = -0.5, z = 0, colorHex = 0x9ca3af, studsX = 64, studsZ = 64) {
        const width = studsX * 2;
        const depth = studsZ * 2;
        const baseplate = new Part(x, y, z, colorHex, width, 1, depth, 'baseplate');
        this.bricksGroup.add(baseplate.threeMesh);
        return baseplate;
    }

    createBall(x = 0, y = 0, z = 0, colorHex = 0x0000ff) {
        const ball = new BallPart(x, y, z, colorHex);
        this.bricksGroup.add(ball.threeMesh);
        return ball;
    }

    createWedge(x = 0, y = 0, z = 0, colorHex = 0xffff00, width = 2, height = 1, depth = 4) {
        const wedge = new WedgePart(x, y, z, colorHex, width, height, depth);
        this.bricksGroup.add(wedge.threeMesh);
        return wedge;
    }

    clear() {
        while (this.bricksGroup.children.length > 0) {
            const obj = this.bricksGroup.children[0];
            if (obj.userData && obj.userData.part) {
                obj.userData.part.destroy();
            } else {
                this.bricksGroup.remove(obj);
            }
        }
    }
}
