// MindAR + Three.js Web AR Application
// Image tracking - keeps object in place when target is lost

// Wrap in IIFE to prevent variable conflicts with other scripts
(function() {
'use strict';

// ============================================================================
// EXPORT IMMEDIATELY (so module is available even if init fails)
// ============================================================================
window.MindARAR = {
    init: null, // Will be set below
    reset: null // Will be set below
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let isTracking = false;           // Whether image target is currently detected
let lastKnownPosition = null;     // Stores last known world position when target is lost
let lastKnownQuaternion = null;  // Stores last known rotation
let lastKnownScale = null;        // Stores last known scale

// ============================================================================
// THREE.JS SCENE SETUP
// ============================================================================
let scene, camera, renderer;
let anchorGroup;      // Attached to MindAR's image target anchor (updates with tracking)
let contentGroup;     // Contains the 3D cube
let cubeMesh;         // The actual 3D cube mesh
let anchor;           // MindAR anchor reference

// ============================================================================
// MINDAR CONTROLLER
// ============================================================================
let mindarThree;

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const arContainer = document.getElementById('ar-container');
const cameraSelector = document.getElementById('camera-selector');
const cameraSelect = document.getElementById('camera-select');

// ============================================================================
// CAMERA ENUMERATION
// ============================================================================

async function enumerateCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        console.log('Available cameras:', videoDevices);
        
        // Clear existing options
        cameraSelect.innerHTML = '';
        
        if (videoDevices.length === 0) {
            cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            return;
        }
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Default (Auto-select)';
        cameraSelect.appendChild(defaultOption);
        
        // Add each camera as an option
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            const label = device.label || `Camera ${index + 1}`;
            option.textContent = label;
            cameraSelect.appendChild(option);
        });
        
        // Show camera selector if multiple cameras
        if (videoDevices.length > 1) {
            cameraSelector.classList.remove('hidden');
        }
        
        return videoDevices;
    } catch (error) {
        console.error('Error enumerating cameras:', error);
        cameraSelect.innerHTML = '<option value="">Error loading cameras</option>';
        return [];
    }
}

// Enumerate cameras on page load
if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            stream.getTracks().forEach(track => track.stop());
            enumerateCameras();
        })
        .catch(() => {
            enumerateCameras();
        });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initMindAR() {
    // Check if we're on HTTPS or localhost (required for camera access)
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
        throw new Error('Camera access requires HTTPS or localhost. Please access this page via HTTPS or localhost.');
    }

    // Check if targets.mind file exists first
    try {
        const response = await fetch('./assets/targets.mind');
        if (!response.ok) {
            throw new Error(`targets.mind file not found (${response.status}). Please ensure the file exists in /assets/targets.mind`);
        }
    } catch (error) {
        if (error.message.includes('targets.mind')) {
            throw error;
        }
        throw new Error(`Failed to load targets.mind: ${error.message}`);
    }

    // Check camera availability
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported in this browser. Please use a modern browser with WebRTC support.');
    }
    
    // Test camera access before initializing MindAR
    console.log('Testing camera access...');
    let testStream = null;
    try {
        const constraints = cameraSelect.value 
            ? { video: { deviceId: { exact: cameraSelect.value } } }
            : { video: { facingMode: 'user' } };
        
        testStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Camera access granted');
        
        testStream.getTracks().forEach(track => track.stop());
    } catch (testError) {
        console.error('Camera test failed:', testError);
        if (testError.name === 'NotAllowedError' || testError.name === 'PermissionDeniedError') {
            throw new Error('Camera permission denied. Please allow camera access in your browser settings and try again.');
        } else if (testError.name === 'NotFoundError' || testError.name === 'DevicesNotFoundError') {
            throw new Error('No camera found. Please ensure your camera is connected and not being used by another application.');
        } else if (testError.name === 'NotReadableError' || testError.name === 'TrackStartError') {
            throw new Error('Camera is already in use by another application. Please close other applications using the camera.');
        } else {
            throw new Error(`Camera access failed: ${testError.message || testError.name}`);
        }
    }

    // Initialize MindAR Image Tracking
    mindarThree = new MindARThree({
        container: arContainer,
        imageTargetSrc: './assets/targets.mind',
        uiScanning: 'no',
    });

    // Get Three.js renderer, scene, and camera from MindAR
    ({ renderer, scene, camera } = mindarThree);

    // Create anchor group - attached to MindAR's image target anchor
    anchorGroup = new THREE.Group();
    
    // Create content group - contains our 3D content
    contentGroup = new THREE.Group();

    // ============================================================================
    // CREATE 3D CUBE
    // ============================================================================
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    
    // Load texture (fallback to colored material if texture not available)
    const textureLoader = new THREE.TextureLoader();
    const cubeTexture = textureLoader.load(
        './assets/cube.png',
        () => {
            console.log('Cube texture loaded');
            if (cubeMesh) {
                cubeMesh.material.map = cubeTexture;
                cubeMesh.material.needsUpdate = true;
            }
        },
        undefined,
        () => {
            console.warn('Cube texture not found, using colored material');
        }
    );
    
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        metalness: 0.2,
        roughness: 0.6,
    });
    
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        wireframe: true
    });
    
    cubeMesh = new THREE.Mesh(geometry, material);
    cubeMesh.position.set(0, 0.1, 0);
    
    const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
    wireframeMesh.position.copy(cubeMesh.position);
    
    contentGroup.add(cubeMesh);
    contentGroup.add(wireframeMesh);
    anchorGroup.add(contentGroup);

    // ============================================================================
    // LIGHTING
    // ============================================================================
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // ============================================================================
    // MINDAR ANCHOR SETUP
    // ============================================================================
    anchor = mindarThree.addAnchor(0);
    anchor.group.add(anchorGroup);

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================
    
    anchor.onTargetFound = () => {
        console.log('Target found!');
        isTracking = true;
        
        // When target is found, resume tracking (contentGroup is already attached to anchorGroup)
        // No need to do anything special - MindAR will update the transform automatically
    };
    
    anchor.onTargetLost = () => {
        console.log('Target lost - keeping object in last known position');
        isTracking = false;
        
        // Capture the last known position before target is lost
        contentGroup.updateMatrixWorld(true);
        lastKnownPosition = new THREE.Vector3();
        lastKnownQuaternion = new THREE.Quaternion();
        lastKnownScale = new THREE.Vector3();
        
        contentGroup.getWorldPosition(lastKnownPosition);
        contentGroup.getWorldQuaternion(lastKnownQuaternion);
        contentGroup.getWorldScale(lastKnownScale);
        
        // Detach from anchorGroup and add directly to scene
        // This keeps the object visible in its last known position
        anchorGroup.remove(contentGroup);
        scene.add(contentGroup);
        
        // Set the contentGroup's local transform to match its world transform
        contentGroup.position.copy(lastKnownPosition);
        contentGroup.quaternion.copy(lastKnownQuaternion);
        contentGroup.scale.copy(lastKnownScale);
        contentGroup.updateMatrix();
        
        console.log('Object kept in last known position:', lastKnownPosition);
    };

    // ============================================================================
    // ANIMATION LOOP
    // ============================================================================
    try {
        await mindarThree.start();
        console.log('AR session started successfully');
    } catch (startError) {
        console.error('Failed to start AR session:', startError);
        if (startError.name === 'NotAllowedError' || startError.name === 'PermissionDeniedError') {
            throw new Error('Camera permission denied. Please allow camera access in your browser settings and try again.');
        } else if (startError.name === 'NotFoundError' || startError.name === 'DevicesNotFoundError') {
            throw new Error('No camera found. Please ensure your camera is connected and not being used by another application.');
        } else if (startError.name === 'NotReadableError' || startError.name === 'TrackStartError') {
            throw new Error('Camera is already in use by another application. Please close other applications using the camera.');
        } else if (startError.message) {
            throw new Error(`Camera error: ${startError.message}`);
        } else {
            throw new Error(`Failed to start camera: ${startError.name || 'Unknown error'}`);
        }
    }
    
    let animationTime = 0;
    renderer.setAnimationLoop(() => {
        animationTime += 0.01;
        
        // Rotate the cube
        if (cubeMesh) {
            cubeMesh.rotation.y = animationTime;
            cubeMesh.rotation.x = animationTime * 0.5;
        }
        
        // If target is lost, object stays in last known position
        // (already handled in onTargetLost - no additional updates needed)
        
        // If target is found again, reattach to anchorGroup
        if (isTracking && contentGroup.parent !== anchorGroup) {
            // Target was found - reattach to anchorGroup for tracking
            scene.remove(contentGroup);
            
            // Reset to default position relative to anchor
            contentGroup.position.set(0, 0.1, 0);
            contentGroup.quaternion.set(0, 0, 0, 1);
            contentGroup.scale.set(1, 1, 1);
            contentGroup.updateMatrix();
            
            anchorGroup.add(contentGroup);
            
            // Clear last known position
            lastKnownPosition = null;
            lastKnownQuaternion = null;
            lastKnownScale = null;
        }
        
        renderer.render(scene, camera);
    });
    
    // Hide camera selector after AR session starts
    if (cameraSelector) {
        cameraSelector.classList.add('hidden');
    }
}

// ============================================================================
// UPDATE EXPORTS WITH ACTUAL FUNCTIONS
// ============================================================================

window.MindARAR.init = initMindAR;
window.MindARAR.reset = () => {
    // Reset not needed for MindAR - it always tracks when target is visible
    console.log('Reset not applicable for MindAR - always tracking when target visible');
};

})(); // End IIFE - isolates scope to prevent conflicts

