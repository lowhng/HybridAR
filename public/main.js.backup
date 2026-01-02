// MindAR + Three.js Web AR Application
// Image tracking with freeze/reposition functionality

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let isTracking = false;           // Whether image target is currently detected
let isFrozen = false;             // Whether 3D object is frozen in world space
let frozenWorldMatrix = null;     // Stores world transform when frozen

// ============================================================================
// THREE.JS SCENE SETUP
// ============================================================================
let scene, camera, renderer;
let anchorGroup;      // Attached to MindAR's image target anchor (updates with tracking)
let contentGroup;     // Contains the 3D cube, can be detached/reattached
let cubeMesh;         // The actual 3D cube mesh
let anchor;           // MindAR anchor reference
let frozenAnchorPosition = null;  // Anchor's world position when frozen
let frozenRelativePosition = null; // Object's position relative to anchor when frozen

// ============================================================================
// MINDAR CONTROLLER
// ============================================================================
let mindarThree;

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const startButton = document.getElementById('start-button');
const modalOverlay = document.getElementById('modal-overlay');
const keepHereButton = document.getElementById('keep-here-button');
const repositionButton = document.getElementById('reposition-button');
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
            // Use label if available, otherwise use generic name
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
    // Request camera permission first to get device labels
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            // Stop the stream immediately, we just needed permission for labels
            stream.getTracks().forEach(track => track.stop());
            enumerateCameras();
        })
        .catch(() => {
            // If permission denied, still try to enumerate (labels will be empty)
            enumerateCameras();
        });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
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
        console.log('Camera access granted, stream:', testStream);
        
        // Stop the test stream - MindAR will create its own
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
    // The targets.mind file should be generated using MindAR's target creator:
    // https://hiukim.github.io/mind-ar-js-doc/tools/compile
    mindarThree = new MindARThree({
        container: arContainer,
        imageTargetSrc: './assets/targets.mind',
        uiScanning: 'no', // Disable default scanning UI
    });

    // Get Three.js renderer, scene, and camera from MindAR
    // MindAR creates its own renderer that handles camera video feed
    ({ renderer, scene, camera } = mindarThree);

    // ============================================================================
    // SCENE GRAPH ARCHITECTURE
    // ============================================================================
    // Scene structure:
    // Scene
    //   └── anchorGroup (attached to MindAR anchor, updates with tracking)
    //       └── contentGroup (contains 3D cube)
    //           └── cube mesh

    // Create anchor group - this will be attached to MindAR's image target anchor
    anchorGroup = new THREE.Group();
    
    // Create content group - contains our 3D content, can be detached/reattached
    contentGroup = new THREE.Group();

    // ============================================================================
    // CREATE 3D CUBE
    // ============================================================================
    // Create a simple textured cube - make it larger and more visible
    // In MindAR, units are typically in meters. Make cube 20cm (0.2m) for good visibility
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    
    // Load texture (fallback to colored material if texture not available)
    let textureLoaded = false;
    const textureLoader = new THREE.TextureLoader();
    const cubeTexture = textureLoader.load(
        './assets/cube.png',
        // onLoad callback
        () => {
            console.log('Cube texture loaded');
            textureLoaded = true;
            // Update material when texture loads
            if (cubeMesh) {
                cubeMesh.material.map = cubeTexture;
                cubeMesh.material.needsUpdate = true;
            }
        },
        // onProgress callback
        undefined,
        // onError callback
        () => {
            console.warn('Cube texture not found, using colored material');
            textureLoaded = false;
        }
    );
    
    // Create material with bright, visible color
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00, // Bright green for high visibility
        metalness: 0.2,
        roughness: 0.6,
    });
    
    // Also create a wireframe material for debugging
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000, // Red wireframe
        wireframe: true
    });
    
    // Set texture if it loads synchronously (unlikely but possible)
    if (textureLoaded && cubeTexture) {
        material.map = cubeTexture;
    }
    
    cubeMesh = new THREE.Mesh(geometry, material);
    // Position cube centered on the image target (slightly above)
    cubeMesh.position.set(0, 0.1, 0); // 10cm above the target center
    
    // Add wireframe for debugging (optional - can remove later)
    const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
    wireframeMesh.position.copy(cubeMesh.position);
    
    console.log('Cube created:', cubeMesh);
    console.log('Cube position:', cubeMesh.position);
    console.log('Cube geometry:', geometry);
    console.log('Cube material color:', material.color.getHexString());
    
    // Add both cube and wireframe to content group
    contentGroup.add(cubeMesh);
    contentGroup.add(wireframeMesh);
    console.log('Cube and wireframe added to contentGroup');
    
    // Add content group to anchor group
    anchorGroup.add(contentGroup);
    console.log('contentGroup added to anchorGroup');

    // ============================================================================
    // LIGHTING
    // ============================================================================
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Directional light for shadows and depth
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // ============================================================================
    // MINDAR ANCHOR SETUP
    // ============================================================================
    // MindAR provides anchors for each image target
    // We attach our anchorGroup to the first (and only) anchor
    // The anchor has a .group property that we attach our content to
    anchor = mindarThree.addAnchor(0);
    
    console.log('Anchor created:', anchor);
    console.log('Anchor group:', anchor.group);
    
    // Attach anchorGroup to MindAR anchor's group
    // When the image target is detected, MindAR will update the anchor's transform
    // This causes anchorGroup (and its children) to move with the target
    anchor.group.add(anchorGroup);
    
    console.log('anchorGroup added to anchor.group');
    console.log('Anchor group children after add:', anchor.group.children.length);
    console.log('Scene structure:', {
        sceneChildren: scene.children.length,
        anchorGroupInScene: anchor.group.parent === scene || scene.children.includes(anchor.group)
    });

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================
    
    // MindAR detection events
    anchor.onTargetFound = () => {
        console.log('Target found!');
        isTracking = true;
        
        // Debug: Verify cube is in the scene
        console.log('Scene children count:', scene.children.length);
        console.log('Anchor group children:', anchor.group.children.length);
        console.log('AnchorGroup children:', anchorGroup.children.length);
        console.log('ContentGroup children:', contentGroup.children.length);
        console.log('Cube mesh:', cubeMesh);
        console.log('Cube visible:', cubeMesh.visible);
        console.log('Cube position (world):', cubeMesh.getWorldPosition(new THREE.Vector3()));
        console.log('ContentGroup position (world):', contentGroup.getWorldPosition(new THREE.Vector3()));
        
        // Show modal when target is detected
        modalOverlay.classList.remove('hidden');
    };
    
    anchor.onTargetLost = () => {
        console.log('Target lost');
        isTracking = false;
        // Hide modal when target is lost
        modalOverlay.classList.add('hidden');
    };

    // Keep Here button - freeze object in current world position
    keepHereButton.addEventListener('click', () => {
        freezeObject();
    });

    // Reposition button - reattach object to image target
    repositionButton.addEventListener('click', () => {
        repositionObject();
    });

    // ============================================================================
    // ANIMATION LOOP
    // ============================================================================
    // Start the AR session (this will request camera permission)
    try {
        await mindarThree.start();
        console.log('AR session started successfully');
    } catch (startError) {
        console.error('Failed to start AR session:', startError);
        // Provide more specific error messages
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
    
    // Set up animation loop
    let animationTime = 0;
    renderer.setAnimationLoop(() => {
        animationTime += 0.01;
        
        // Rotate the cube to make it more visible
        if (cubeMesh && !isFrozen) {
            cubeMesh.rotation.y = animationTime;
            cubeMesh.rotation.x = animationTime * 0.5;
        }
        
        if (isFrozen && frozenRelativePosition && frozenAnchorPosition) {
            // IMPORTANT LIMITATION: MindAR is image-tracking only, not SLAM-based
            // It cannot track the camera's position in world space when the target is lost
            // This means true world-space anchoring is not possible with MindAR alone
            
            // Workaround: Use the anchor as a reference point to maintain relative positioning
            // This works best when the image target remains visible
            // When the target is lost, world-space anchoring cannot be maintained
            
            if (isTracking) {
                // Target is still visible - we can maintain world-space position relative to anchor
                anchor.group.updateMatrixWorld(true);
                const currentAnchorPosition = new THREE.Vector3();
                anchor.group.getWorldPosition(currentAnchorPosition);
                
                // Calculate the object's target world position
                // It should stay at: originalAnchorPosition + relativeOffset
                const targetWorldPosition = new THREE.Vector3();
                targetWorldPosition.addVectors(frozenAnchorPosition, frozenRelativePosition);
                
                // Update object position to maintain world-space location
                // As the anchor moves (camera moves), we keep the object at the same world position
                contentGroup.position.copy(targetWorldPosition);
                contentGroup.updateMatrix();
            }
            // If target is lost (isTracking = false), we can't maintain world-space anchoring
            // because MindAR doesn't track camera position without the target
        }
        // If not frozen, MindAR automatically updates anchorGroup transform
        // and contentGroup follows naturally as a child
        
        renderer.render(scene, camera);
    });

    // Hide start button and camera selector after initialization
    startButton.classList.add('hidden');
    cameraSelector.classList.add('hidden');
}

// ============================================================================
// FREEZE OBJECT (Keep Here)
// ============================================================================
function freezeObject() {
    if (!isTracking || isFrozen) return;
    
    console.log('Freezing object in current world position');
    
    // Ensure matrices are up to date before capturing
    anchor.group.updateMatrixWorld(true);
    contentGroup.updateMatrixWorld(true);
    
    // Capture the anchor's current world position (this is our reference point)
    frozenAnchorPosition = new THREE.Vector3();
    anchor.group.getWorldPosition(frozenAnchorPosition);
    
    // Capture the object's current world position
    const objectWorldPosition = new THREE.Vector3();
    contentGroup.getWorldPosition(objectWorldPosition);
    
    // Calculate the object's position relative to the anchor
    // This is the offset from anchor to object in world space
    frozenRelativePosition = new THREE.Vector3();
    frozenRelativePosition.subVectors(objectWorldPosition, frozenAnchorPosition);
    
    // Capture rotation and scale
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    contentGroup.getWorldQuaternion(worldQuaternion);
    contentGroup.getWorldScale(worldScale);
    
    // Store the full world matrix for reference
    frozenWorldMatrix = new THREE.Matrix4();
    frozenWorldMatrix.compose(objectWorldPosition, worldQuaternion, worldScale);
    
    // Detach contentGroup from anchorGroup (removes it from tracking hierarchy)
    anchorGroup.remove(contentGroup);
    
    // Set the contentGroup's transform to its world position
    // We'll update this in the animation loop based on anchor movement
    contentGroup.position.copy(objectWorldPosition);
    contentGroup.quaternion.copy(worldQuaternion);
    contentGroup.scale.copy(worldScale);
    contentGroup.updateMatrix();
    
    // Add contentGroup directly to scene - it's now anchored in world space
    scene.add(contentGroup);
    
    isFrozen = true;
    modalOverlay.classList.add('hidden');
    
    console.log('Object frozen - attempting world-space anchoring');
    console.log('Anchor position:', frozenAnchorPosition);
    console.log('Object position:', objectWorldPosition);
    console.log('Relative offset:', frozenRelativePosition);
    console.warn('LIMITATION: MindAR is image-tracking only (not SLAM-based).');
    console.warn('True world-space anchoring requires camera position tracking, which MindAR does not provide.');
    console.warn('The object will stay anchored relative to the image target, but may drift when the target is lost.');
    console.warn('For true world-space anchoring, consider using WebXR with ARCore/ARKit (requires mobile device).');
}

// ============================================================================
// REPOSITION OBJECT (Reattach to Target)
// ============================================================================
function repositionObject() {
    if (!isFrozen) return;
    
    console.log('Repositioning object to image target');
    
    // Remove contentGroup from scene
    scene.remove(contentGroup);
    
    // Reset transform to default (relative to anchor)
    contentGroup.position.set(0, 0.5, 0);
    contentGroup.quaternion.set(0, 0, 0, 1);
    contentGroup.scale.set(1, 1, 1);
    contentGroup.updateMatrix();
    
    // Reattach to anchorGroup
    anchorGroup.add(contentGroup);
    
    isFrozen = false;
    frozenWorldMatrix = null;
    frozenAnchorPosition = null;
    frozenRelativePosition = null;
    
    // Show modal again if target is still being tracked
    if (isTracking) {
        modalOverlay.classList.remove('hidden');
    }
    
    console.log('Object reattached to image target');
}

// ============================================================================
// START APPLICATION
// ============================================================================

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupApp);
} else {
    setupApp();
}

function setupApp() {
    // Verify libraries are loaded
    if (typeof THREE === 'undefined') {
        console.error('THREE.js is not defined');
        startButton.textContent = 'Error: Three.js not loaded';
        startButton.disabled = true;
        return;
    }
    
    if (typeof MindARThree === 'undefined') {
        console.error('MindARThree is not defined');
        startButton.textContent = 'Error: MindAR not loaded';
        startButton.disabled = true;
        alert('MindAR library failed to load. Please:\n1. Check your internet connection\n2. Refresh the page\n3. Check browser console for errors\n4. Try disabling ad blockers');
        return;
    }
    
    console.log('Libraries loaded successfully');
    console.log('THREE:', typeof THREE);
    console.log('MindARThree:', typeof MindARThree);
    
    startButton.addEventListener('click', async () => {
        try {
            // Double-check libraries before starting
            if (typeof MindARThree === 'undefined') {
                throw new Error('MindARThree is not defined. Please refresh the page.');
            }
            
            // Disable button to prevent multiple clicks
            startButton.disabled = true;
            startButton.textContent = 'Starting...';
            
            await init();
        } catch (error) {
            console.error('Failed to initialize AR:', error);
            
            // Show detailed error message
            const errorMessage = error.message || 'Unknown error occurred';
            alert(`Failed to start AR:\n\n${errorMessage}\n\nPlease check:\n- Camera permissions are granted\n- targets.mind file exists\n- Camera is not being used by another app\n- You're using a modern browser`);
            
            // Re-enable button so user can try again
            startButton.disabled = false;
            startButton.textContent = 'Start AR';
        }
    });
}

