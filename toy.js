import * as THREE from 'three';
import { PALETTE } from './brick.js';

export class ToySerializer {
    constructor(brickManager) {
        this.brickManager = brickManager;
    }

    exportToy() {
        const lines = ['# brik toy format v1'];

        const getColorName = (hex) => {
            for (const [name, val] of Object.entries(PALETTE)) {
                if (val === hex) return name;
            }
            return `#${hex.toString(16).padStart(6, '0')}`;
        };

        this.brickManager.bricksGroup.children.forEach((mesh) => {
            if (mesh.userData && mesh.userData.part) {
                const type = mesh.userData.primitiveType || 'brick';
                const x = mesh.position.x;
                const y = mesh.position.y;
                const z = mesh.position.z;
                const color = getColorName(mesh.userData.part.colorHex);

                const rx = Math.round((mesh.rotation.x * 180) / Math.PI);
                const ry = Math.round((mesh.rotation.y * 180) / Math.PI);
                const rz = Math.round((mesh.rotation.z * 180) / Math.PI);

                if (rx !== 0 || ry !== 0 || rz !== 0) {
                    lines.push(`${type} ${x} ${y} ${z} ${color} ${rx} ${ry} ${rz}`);
                } else {
                    lines.push(`${type} ${x} ${y} ${z} ${color}`);
                }
            }
        });

        return lines.join('\n');
    }

    saveToyFile(filename = 'my_build.toy') {
        const content = this.exportToy();
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.toy') ? filename : `${filename}.toy`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    loadToyData(text) {
        if (!text || typeof text !== 'string') return false;

        // Support backward compatibility for JSON .toy / .map
        if (text.trim().startsWith('{')) {
            try {
                const json = JSON.parse(text);
                if (json.parts && Array.isArray(json.parts)) {
                    this.brickManager.clear();
                    json.parts.forEach((p) => {
                        const pos = p.position || [0, 0, 0];
                        const rot = p.rotation || [0, 0, 0];
                        const color = p.color !== undefined ? p.color : 0x00ff00;
                        let part;
                        if (p.type === 'ball') {
                            part = this.brickManager.createBall(pos[0], pos[1], pos[2], color);
                        } else if (p.type === 'wedge') {
                            part = this.brickManager.createWedge(pos[0], pos[1], pos[2], color);
                        } else {
                            part = this.brickManager.createBrick(pos[0], pos[1], pos[2], color);
                        }
                        if (part && part.threeMesh) {
                            part.threeMesh.rotation.set(rot[0], rot[1], rot[2]);
                            if (p.opacity !== undefined) {
                                part.setOpacity(p.opacity);
                            }
                            if (p.textureApplied !== undefined) {
                                part.setTextureApplied(p.textureApplied);
                            }
                        }
                    });
                    return true;
                }
            } catch (e) {}
        }

        const lines = text.split('\n');
        this.brickManager.clear();

        for (let rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#') || line.startsWith('//')) continue;

            const tokens = line.split(/\s+/);
            if (tokens.length < 5) continue;

            const type = tokens[0].toLowerCase();
            const x = parseFloat(tokens[1]) || 0;
            const y = parseFloat(tokens[2]) || 0;
            const z = parseFloat(tokens[3]) || 0;
            const colorToken = tokens[4];

            let colorHex = PALETTE[colorToken];
            if (colorHex === undefined) {
                if (colorToken.startsWith('#')) {
                    colorHex = parseInt(colorToken.slice(1), 16);
                } else if (colorToken.startsWith('0x')) {
                    colorHex = parseInt(colorToken, 16);
                } else {
                    colorHex = 0xffffff;
                }
            }

            const rx = (parseFloat(tokens[5]) || 0) * (Math.PI / 180);
            const ry = (parseFloat(tokens[6]) || 0) * (Math.PI / 180);
            const rz = (parseFloat(tokens[7]) || 0) * (Math.PI / 180);

            let part;
            if (type === 'ball') {
                part = this.brickManager.createBall(x, y, z, colorHex);
            } else if (type === 'wedge') {
                part = this.brickManager.createWedge(x, y, z, colorHex);
            } else if (type === 'baseplate') {
                part = this.brickManager.createBaseplate(x, y, z, colorHex, 64, 64);
            } else {
                part = this.brickManager.createBrick(x, y, z, colorHex);
            }

            if (part && part.threeMesh) {
                part.threeMesh.rotation.set(rx, ry, rz);
            }
        }

        return true;
    }

    openToyFile(onLoadCallback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.toy,.txt,.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    this.loadToyData(event.target.result);
                    if (onLoadCallback) onLoadCallback();
                } catch (err) {
                    console.error('Failed to parse .toy file:', err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
}
