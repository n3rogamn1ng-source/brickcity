import * as THREE from 'three';
import { ThreejsRendererEngine } from './render.js';
import { FlyCamera, SimpleGizmo } from './controls.js';
import { BrickManager, Part, BallPart, PALETTE, PALETTE_LIST, createStudMaterial } from './brick.js';
import { ToySerializer } from './toy.js';

// 1. Renderer engine service
const rendererEngine = new ThreejsRendererEngine();

// 2. BrickManager service
const brickManager = new BrickManager(rendererEngine.scene);

// 3. Toy Serializer (.toy save & load)
const toy = new ToySerializer(brickManager);

// 4. History Manager for Undo/Redo (lightweight state snapshots)
class HistoryManager {
    constructor(toySerializer, maxHistory = 100) {
        this.toy = toySerializer;
        this.maxHistory = maxHistory;
        this.undoStack = [];
        this.redoStack = [];
        this.isApplyingState = false;
    }

    saveState() {
        if (this.isApplyingState) return;
        const state = this.toy.exportToy();
        
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === state) {
            return;
        }

        this.undoStack.push(state);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length <= 1) return;
        const currentState = this.undoStack.pop();
        this.redoStack.push(currentState);

        const prevState = this.undoStack[this.undoStack.length - 1];
        
        this.isApplyingState = true;
        this.toy.loadToyData(prevState);
        this.isApplyingState = false;

        window.dispatchEvent(new CustomEvent('historyChanged'));
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const nextState = this.redoStack.pop();
        this.undoStack.push(nextState);

        this.isApplyingState = true;
        this.toy.loadToyData(nextState);
        this.isApplyingState = false;

        window.dispatchEvent(new CustomEvent('historyChanged'));
    }
}

const history = new HistoryManager(toy);

// Expose globally for console testing
window.rendererEngine = rendererEngine;
window.brickManager = brickManager;
window.toy = toy;
window.Part = Part;
window.BallPart = BallPart;
window.PALETTE = PALETTE;
window.historyManager = history;

// Spawn initial test parts (sitting flush at y = 0.5 directly on baseplate studs)
brickManager.createBrick(0, 0.5, 0, PALETTE.Green);
brickManager.createBrick(4, 0.5, 0, PALETTE.Red);
brickManager.createBall(-4, 1.0, 0, PALETTE.Blue);

// 64x64 studs baseplate created as a real Part brick instance (fully selectable, recolorable, deletable)
const baseplate = brickManager.createBaseplate(0, -0.5, 0, PALETTE.Grey, 64, 64);
window.baseplate = baseplate;

history.saveState();

const flyCamera = new FlyCamera(rendererEngine.camera, rendererEngine.domElement);
const clock = new THREE.Clock();

const gizmo = new SimpleGizmo(rendererEngine.scene, rendererEngine.camera, rendererEngine.domElement);

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();

    // Disable camera movement while dragging the gizmo
    flyCamera.enabled = !gizmo.activeAxis;

    flyCamera.update(delta);
    rendererEngine.render();
}
animate();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ----------------------------------------------------
// Building Color State
// ----------------------------------------------------
let activeBuildColor = PALETTE.Red;

rendererEngine.domElement.addEventListener('mousedown', (event) => {
    // Only interact on left click without right-click fly
    if (event.button !== 0 || flyCamera.isRightMouseDown) return;

    const rect = rendererEngine.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, rendererEngine.camera);

    // Check if clicking gizmo handle
    if (gizmo.gizmoGroup.visible) {
        const gizmoHits = raycaster.intersectObjects(gizmo.gizmoGroup.children, true);
        if (gizmoHits.length > 0) return;
    }

    // Check intersection with bricks
    const intersects = raycaster.intersectObjects(brickManager.bricksGroup.children, true);

    if (intersects.length > 0) {
        let hitObject = intersects[0].object;

        const isMultiSelect = event.shiftKey || event.ctrlKey;
        gizmo.attach(hitObject, isMultiSelect);
    } else {
        if (!event.shiftKey && !event.ctrlKey) {
            gizmo.detach();
        }
    }
    updateSliderFromSelection();
});

// UI Button handlers for .toy Save & Load
const saveBtn = document.getElementById('save-btn');
const loadBtn = document.getElementById('load-btn');

if (saveBtn) {
    saveBtn.addEventListener('click', () => {
        toy.saveToyFile('my_build.toy');
    });
}

if (loadBtn) {
    loadBtn.addEventListener('click', () => {
        toy.openToyFile(() => {
            history.saveState();
        });
    });
}

// ----------------------------------------------------
// Dye Swatch Bar UI
// ----------------------------------------------------
const dyeBar = document.getElementById('dye-bar');
if (dyeBar) {
    for (const [name, hex] of Object.entries(PALETTE)) {
        const hexStr = `#${hex.toString(16).padStart(6, '0')}`;
        const swatch = document.createElement('div');
        swatch.className = 'dye-swatch';
        swatch.style.backgroundColor = hexStr;
        swatch.title = name;

        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            activeBuildColor = hex;

            if (gizmo.selectedObjects.size > 0) {
                gizmo.selectedObjects.forEach((mesh) => {
                    if (mesh.userData && mesh.userData.part) {
                        mesh.userData.part.recolor(hex);
                    }
                });
                history.saveState();
            }
        });

        dyeBar.appendChild(swatch);
    }
}

// ----------------------------------------------------
// UI-Free Spawning & Editing Keyboard Shortcuts
// ----------------------------------------------------
function getSpawnPositionInFrontOfCamera(distance = 10) {
    const dir = new THREE.Vector3();
    rendererEngine.camera.getWorldDirection(dir);
    const spawnPos = new THREE.Vector3().copy(rendererEngine.camera.position).addScaledVector(dir, distance);
    // Snap spawn position to grid
    return {
        x: Math.round(spawnPos.x / 2) * 2,
        y: Math.max(0, Math.round(spawnPos.y)),
        z: Math.round(spawnPos.z / 2) * 2
    };
}

window.addEventListener('keydown', (e) => {
    // Prevent interfering if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();

    // Ctrl + Z -> Undo, Ctrl + Shift + Z / Ctrl + Y -> Redo
    if (e.ctrlKey && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            history.redo();
        } else {
            history.undo();
        }
    }
    else if (e.ctrlKey && key === 'y') {
        e.preventDefault();
        history.redo();
    }

    // 'B' key -> Spawn a new Brick in front of camera
    else if (key === 'b' && !e.ctrlKey) {
        const pos = getSpawnPositionInFrontOfCamera(10);
        const brick = brickManager.createBrick(pos.x, pos.y, pos.z, PALETTE.Green);
        gizmo.attach(brick.threeMesh, false);
        updateSliderFromSelection();
        history.saveState();
    }

    // 'N' key (or 'V') -> Spawn a new Ball in front of camera
    else if (key === 'n' && !e.ctrlKey) {
        const pos = getSpawnPositionInFrontOfCamera(10);
        const ball = brickManager.createBall(pos.x, pos.y + 0.5, pos.z, PALETTE.Blue);
        gizmo.attach(ball.threeMesh, false);
        updateSliderFromSelection();
        history.saveState();
    }

    // 'M' key -> Spawn a new Wedge in front of camera
    else if (key === 'm' && !e.ctrlKey) {
        const pos = getSpawnPositionInFrontOfCamera(10);
        const wedge = brickManager.createWedge(pos.x, pos.y, pos.z, PALETTE.Yellow);
        gizmo.attach(wedge.threeMesh, false);
        updateSliderFromSelection();
        history.saveState();
    }

    // Ctrl + D -> Duplicate all selected objects
    else if (e.ctrlKey && key === 'd') {
        e.preventDefault();
        if (gizmo.selectedObjects.size > 0) {
            const newlyCreated = [];
            gizmo.selectedObjects.forEach((mesh) => {
                if (mesh.userData && mesh.userData.part) {
                    const original = mesh.userData.part;
                    const pos = mesh.position;
                    const rot = mesh.rotation;
                    const scale = mesh.scale;
                    const color = original.colorHex;

                    let clone;
                    if (mesh.userData.primitiveType === 'ball') {
                        clone = brickManager.createBall(pos.x + 2, pos.y, pos.z, color);
                    } else if (mesh.userData.primitiveType === 'wedge') {
                        clone = brickManager.createWedge(pos.x + 2, pos.y, pos.z, color, original.width, original.height, original.depth);
                    } else {
                        clone = brickManager.createBrick(pos.x + 2, pos.y, pos.z, color, original.width, original.height, original.depth);
                    }

                    clone.threeMesh.rotation.copy(rot);
                    clone.threeMesh.scale.copy(scale);
                    if (original.opacity !== undefined) {
                        clone.setOpacity(original.opacity);
                    }
                    if (original.textureApplied !== undefined) {
                        clone.setTextureApplied(original.textureApplied);
                    }
                    newlyCreated.push(clone.threeMesh);
                }
            });

            gizmo.detach();
            newlyCreated.forEach((m) => gizmo.attach(m, true));
            updateSliderFromSelection();
            history.saveState();
        }
    }

    // Delete or Backspace -> Delete all selected objects
    else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (gizmo.selectedObjects.size > 0) {
            const toDelete = Array.from(gizmo.selectedObjects);
            gizmo.detach();
            toDelete.forEach((mesh) => {
                if (mesh.userData && mesh.userData.part) {
                    mesh.userData.part.destroy();
                }
            });
            updateSliderFromSelection();
            history.saveState();
        }
    }

    // 'F' key -> Spin horizontally, Shift + 'F' -> Pitch/flip vertically, Alt + 'F' -> Roll side-to-side
    else if (key === 'f' && !e.ctrlKey) {
        if (gizmo.selectedObjects.size > 0) {
            gizmo.selectedObjects.forEach((mesh) => {
                if (e.shiftKey) {
                    mesh.rotation.x += Math.PI / 2;
                } else if (e.altKey) {
                    mesh.rotation.z += Math.PI / 2;
                } else {
                    mesh.rotation.y += Math.PI / 2;
                }
            });
            gizmo.updateGizmoPosition();
            history.saveState();
        }
    }

    // 'G' key -> Rotate side-to-side (Z-axis roll)
    else if (key === 'g' && !e.ctrlKey) {
        if (gizmo.selectedObjects.size > 0) {
            gizmo.selectedObjects.forEach((mesh) => {
                mesh.rotation.z += Math.PI / 2;
            });
            gizmo.updateGizmoPosition();
            history.saveState();
        }
    }

    // 'H' key -> Toggle help text overlay
    else if (key === 'h' && !e.ctrlKey) {
        const helpEl = document.getElementById('help-text');
        if (helpEl) {
            helpEl.style.display = helpEl.style.display === 'block' ? 'none' : 'block';
        }
    }
});

// ----------------------------------------------------
// UI Controls: Transparency Slider, Texture Checkbox, & Size Dropdown
// ----------------------------------------------------
const opacitySlider = document.getElementById('opacity-slider');
const textureCheckbox = document.getElementById('texture-checkbox');
const sizePresetSelect = document.getElementById('size-preset');

function updateSliderFromSelection() {
    if (gizmo.selectedObjects.size > 0) {
        const lastSelected = Array.from(gizmo.selectedObjects).pop();
        if (lastSelected && lastSelected.userData && lastSelected.userData.part) {
            const part = lastSelected.userData.part;
            if (opacitySlider) {
                opacitySlider.value = part.opacity !== undefined ? part.opacity : 1.0;
            }
            if (textureCheckbox) {
                textureCheckbox.checked = part.textureApplied !== undefined ? part.textureApplied : true;
            }
            if (sizePresetSelect && part.width !== undefined && part.depth !== undefined) {
                const presetKey = `${part.width}x${part.depth}`;
                sizePresetSelect.value = presetKey;
            }
        }
    } else {
        if (opacitySlider) opacitySlider.value = 1.0;
        if (textureCheckbox) textureCheckbox.checked = true;
        if (sizePresetSelect) sizePresetSelect.value = '2x4';
    }
}

if (opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (gizmo.selectedObjects.size > 0) {
            gizmo.selectedObjects.forEach((mesh) => {
                if (mesh.userData && mesh.userData.part) {
                    mesh.userData.part.setOpacity(val);
                }
            });
        }
    });

    // Save history state once the user stops sliding (releases mouse)
    opacitySlider.addEventListener('change', () => {
        history.saveState();
    });
}

if (textureCheckbox) {
    textureCheckbox.addEventListener('change', (e) => {
        const val = e.target.checked;
        if (gizmo.selectedObjects.size > 0) {
            gizmo.selectedObjects.forEach((mesh) => {
                if (mesh.userData && mesh.userData.part) {
                    mesh.userData.part.setTextureApplied(val);
                }
            });
            history.saveState();
        }
    });
}

if (sizePresetSelect) {
    sizePresetSelect.addEventListener('change', (e) => {
        const preset = e.target.value;
        const dimensions = preset.split('x').map(Number);
        if (dimensions.length === 2) {
            const w = dimensions[0];
            const d = dimensions[1];
            if (gizmo.selectedObjects.size > 0) {
                gizmo.selectedObjects.forEach((mesh) => {
                    if (mesh.userData && mesh.userData.part) {
                        const part = mesh.userData.part;
                        const h = part.height !== undefined ? part.height : 1.0;
                        part.resize(w, h, d);
                    }
                });
                gizmo.updateGizmoPosition();
                history.saveState();
            }
        }
    });
}

// ----------------------------------------------------
// Global Editor Events (Move Completion & History Updates)
// ----------------------------------------------------
window.addEventListener('objectMoveEnd', () => {
    history.saveState();
});

window.addEventListener('historyChanged', () => {
    gizmo.detach();
    updateSliderFromSelection();
});


