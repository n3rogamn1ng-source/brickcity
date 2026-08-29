import * as THREE from 'three';

// ----------------------------------------------------
// 1. Fly Camera
// ----------------------------------------------------
export class FlyCamera {
    constructor(camera, domElement, moveSpeed = 5, lookSpeed = 0.002) {
        this.camera = camera;
        this.domElement = domElement;
        this.moveSpeed = moveSpeed;
        this.lookSpeed = lookSpeed;

        this.moveState = {
            forward: 0,
            back: 0,
            left: 0,
            right: 0,
            up: 0,
            down: 0
        };

        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.isRightMouseDown = false;
        this.enabled = true;

        this.initEvents();
    }

    initEvents() {
        // Prevent default context menu on right click
        this.domElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        // Mouse Down for Right Click
        this.domElement.addEventListener('mousedown', (event) => {
            if (event.button === 2) {
                this.isRightMouseDown = true;
            }
        });

        // Mouse Up
        window.addEventListener('mouseup', (event) => {
            if (event.button === 2) {
                this.isRightMouseDown = false;
            }
        });

        // Mouse Look on Right Click Drag
        window.addEventListener('mousemove', (event) => {
            if (!this.isRightMouseDown) return;

            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;

            this.euler.setFromQuaternion(this.camera.quaternion);

            this.euler.y -= movementX * this.lookSpeed;
            this.euler.x -= movementY * this.lookSpeed;

            // Clamp vertical rotation (-90 to 90 degrees)
            this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));

            this.camera.quaternion.setFromEuler(this.euler);
        });

        // Keyboard Movement
        window.addEventListener('keydown', (event) => this.onKeyDown(event));
        window.addEventListener('keyup', (event) => this.onKeyUp(event));
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': this.moveState.forward = 1; break;
            case 'KeyS': this.moveState.back = 1; break;
            case 'KeyA': this.moveState.left = 1; break;
            case 'KeyD': this.moveState.right = 1; break;
            case 'Space': this.moveState.up = 1; break;
            case 'ShiftLeft':
            case 'ShiftRight': this.moveState.down = 1; break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': this.moveState.forward = 0; break;
            case 'KeyS': this.moveState.back = 0; break;
            case 'KeyA': this.moveState.left = 0; break;
            case 'KeyD': this.moveState.right = 0; break;
            case 'Space': this.moveState.up = 0; break;
            case 'ShiftLeft':
            case 'ShiftRight': this.moveState.down = 0; break;
        }
    }

    update(delta) {
        if (!this.enabled) return;

        const moveDistance = this.moveSpeed * delta;
        const actualMove = new THREE.Vector3();

        if (this.moveState.forward) actualMove.z -= 1;
        if (this.moveState.back) actualMove.z += 1;
        if (this.moveState.left) actualMove.x -= 1;
        if (this.moveState.right) actualMove.x += 1;
        if (this.moveState.up) actualMove.y += 1;
        if (this.moveState.down) actualMove.y -= 1;

        actualMove.normalize();

        const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const upDir = new THREE.Vector3(0, 1, 0);

        const velocity = new THREE.Vector3();
        velocity.addScaledVector(forwardDir, -actualMove.z);
        velocity.addScaledVector(rightDir, actualMove.x);
        velocity.addScaledVector(upDir, actualMove.y);

        this.camera.position.addScaledVector(velocity, moveDistance);
    }
}

// ----------------------------------------------------
// 2. Simple Axis Gizmo with Multi-Selection Support
// ----------------------------------------------------
export class SimpleGizmo {
    constructor(scene, camera, domElement) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;

        this.selectedObjects = new Set();
        this.activeAxis = null;
        this.initialPositions = new Map();
        this.accumulatedOffset = 0;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Line.threshold = 0.25;
        this.mouse = new THREE.Vector2();

        this.gizmoGroup = new THREE.Group();
        this.gizmoGroup.visible = false;
        this.scene.add(this.gizmoGroup);

        this.createArrows();
        this.initEvents();
    }

    createArrows() {
        const length = 2.5;

        // X Axis (Red)
        this.arrowX = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            length,
            0xff0000,
            0.6,
            0.25
        );
        this.arrowX.line.userData.axis = 'x';
        this.arrowX.cone.userData.axis = 'x';

        // Y Axis (Green)
        this.arrowY = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 0),
            length,
            0x00ff00,
            0.6,
            0.25
        );
        this.arrowY.line.userData.axis = 'y';
        this.arrowY.cone.userData.axis = 'y';

        // Z Axis (Blue)
        this.arrowZ = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, 0),
            length,
            0x0000ff,
            0.6,
            0.25
        );
        this.arrowZ.line.userData.axis = 'z';
        this.arrowZ.cone.userData.axis = 'z';

        this.gizmoGroup.add(this.arrowX, this.arrowY, this.arrowZ);

        // Render on top
        this.gizmoGroup.traverse((child) => {
            if (child.isMesh || child.isLine) {
                child.renderOrder = 999;
            }
        });
    }

    get attachedObject() {
        // Returns the first/primary selected object for backward compatibility
        if (this.selectedObjects.size === 0) return null;
        return this.selectedObjects.values().next().value;
    }

    updateGizmoPosition() {
        if (this.selectedObjects.size === 0) {
            this.gizmoGroup.visible = false;
            return;
        }

        const center = new THREE.Vector3();
        const bbox = new THREE.Box3();
        let first = true;

        this.selectedObjects.forEach((obj) => {
            center.add(obj.position);
            if (first) {
                bbox.setFromObject(obj);
                first = false;
            } else {
                const tempBox = new THREE.Box3().setFromObject(obj);
                bbox.union(tempBox);
            }
        });
        center.divideScalar(this.selectedObjects.size);

        this.gizmoGroup.position.copy(center);
        this.gizmoGroup.visible = true;

        // Calculate bounding box dimensions
        const size = new THREE.Vector3();
        bbox.getSize(size);

        const exposedLength = 1.5; // Constant distance the arrows extend past the faces
        const headLength = 0.6;
        const headWidth = 0.25;

        const halfX = size.x / 2;
        const halfY = size.y / 2;
        const halfZ = size.z / 2;

        this.arrowX.setLength(halfX + exposedLength, headLength, headWidth);
        this.arrowY.setLength(halfY + exposedLength, headLength, headWidth);
        this.arrowZ.setLength(halfZ + exposedLength, headLength, headWidth);
    }

    attach(object, isMultiSelect = false) {
        if (!isMultiSelect) {
            this.selectedObjects.clear();
        }

        if (object) {
            if (isMultiSelect && this.selectedObjects.has(object)) {
                // Toggle off if already selected in multi-select mode
                this.selectedObjects.delete(object);
            } else {
                this.selectedObjects.add(object);
            }
        }

        this.updateGizmoPosition();
    }

    detach() {
        this.selectedObjects.clear();
        this.gizmoGroup.visible = false;
        this.activeAxis = null;
    }

    initEvents() {
        this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', () => {
            if (this.activeAxis) {
                window.dispatchEvent(new CustomEvent('objectMoveEnd'));
            }
            this.activeAxis = null;
        });
    }

    onMouseDown(e) {
        if (this.selectedObjects.size === 0 || e.button !== 0) return;

        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.gizmoGroup.children, true);

        if (intersects.length > 0) {
            e.stopImmediatePropagation();
            this.activeAxis = intersects[0].object.userData.axis;
            this.initialPositions.clear();
            this.selectedObjects.forEach((obj) => {
                this.initialPositions.set(obj, obj.position.clone());
            });
            this.accumulatedOffset = 0;
        }
    }

    onMouseMove(e) {
        if (this.selectedObjects.size === 0 || !this.activeAxis) return;

        const axisVector = new THREE.Vector3(
            this.activeAxis === 'x' ? 1 : 0,
            this.activeAxis === 'y' ? 1 : 0,
            this.activeAxis === 'z' ? 1 : 0
        );

        const start3D = this.gizmoGroup.position.clone();
        const end3D = start3D.clone().add(axisVector);

        const start2D = start3D.clone().project(this.camera);
        const end2D = end3D.clone().project(this.camera);

        const screenDir = new THREE.Vector2(
            (end2D.x - start2D.x) * this.domElement.clientWidth * 0.5,
            -(end2D.y - start2D.y) * this.domElement.clientHeight * 0.5
        );

        const screenLen = screenDir.length();
        if (screenLen < 0.0001) return;

        screenDir.normalize();

        const mouseDelta = new THREE.Vector2(e.movementX || 0, e.movementY || 0);
        const dot = mouseDelta.dot(screenDir);

        const sensitivity = 0.04;
        this.accumulatedOffset += dot * sensitivity;

        // Stud snapping: X/Z snaps in 1-stud intervals (1.0), Y snaps flush to baseplate (0.5, 1.5, 2.5...)
        const step = 1.0;
        const snappedDelta = Math.round(this.accumulatedOffset / step) * step;

        this.selectedObjects.forEach((obj) => {
            const initPos = this.initialPositions.get(obj);
            if (initPos) {
                const target = initPos[this.activeAxis] + snappedDelta;
                if (this.activeAxis === 'y') {
                    // Snaps to exact brick height intervals (...-1.5, -0.5, 0.5, 1.5, 2.5...)
                    const layer = Math.round(target - 0.5);
                    obj.position.y = layer + 0.5;
                } else {
                    obj.position[this.activeAxis] = Math.round(target);
                }
            }
        });

        this.updateGizmoPosition();
        window.dispatchEvent(new CustomEvent('objectMoved'));
    }
}

