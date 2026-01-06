// WebXR + Three.js AR Application
// Provides AR experience on Android devices with camera passthrough

// ============================================================================
// EXPORT IMMEDIATELY
// ============================================================================
if (typeof window !== 'undefined') {
    window.WebXRAR = window.WebXRAR || {};
    window.WebXRAR._scriptLoaded = true;
    window.WebXRAR._scriptLoadTime = Date.now();
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let isAnchored = false;
let xrSession = null;
let xrReferenceSpace = null;
let xrHitTestSource = null;
let currentSurfaceType = null; // 'floor' or 'wall'

// ============================================================================
// THREE.JS SCENE SETUP
// ============================================================================
let scene, camera, renderer;
let contentGroup;
let cubeMesh;
let reticle; // Visual indicator for placement
let reticleFloorGeometry; // Ring geometry for floor
let reticleWallGeometry; // Crosshair geometry for wall
let reticleMaterial; // Material that changes color
let animationTime = 0;

// ============================================================================
// DOM ELEMENTS
// ============================================================================
let arContainer = null;

function getDOMElements() {
    if (!arContainer) {
        arContainer = document.getElementById('ar-container');
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initWebXR() {
    getDOMElements();
    
    if (!arContainer) {
        throw new Error('AR container element not found. Ensure #ar-container exists in the DOM.');
    }
    
    if (typeof THREE === 'undefined') {
        throw new Error('THREE.js is not loaded. Please ensure Three.js is loaded before this script.');
    }
    
    // Check WebXR support
    if (!navigator.xr) {
        throw new Error('WebXR is not supported on this device. Please use an Android device with Chrome.');
    }

    const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!isSupported) {
        throw new Error('WebXR immersive-ar is not supported on this device.');
    }

    console.log('WebXR supported, initializing...');

    // Create Three.js scene
    scene = new THREE.Scene();
    // IMPORTANT: Background must be null for AR camera passthrough
    scene.background = null;
    
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    
    // Create WebGL renderer with XR support
    // CRITICAL: alpha must be true for camera passthrough
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        powerPreference: 'high-performance'
    });
    
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    
    // Set clear color with 0 alpha for transparency
    renderer.setClearColor(0x000000, 0);
    
    // Style the canvas
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    arContainer.appendChild(canvas);

    // Create content group for AR objects
    contentGroup = new THREE.Group();
    contentGroup.visible = false; // Hidden until placed
    scene.add(contentGroup);

    // Create a cube to display
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00,
        metalness: 0.3,
        roughness: 0.6
    });
    cubeMesh = new THREE.Mesh(geometry, material);
    cubeMesh.position.set(0, 0.05, 0); // Raise slightly above surface
    contentGroup.add(cubeMesh);

    // Create reticle geometries for floor and wall
    // Floor: Ring geometry
    reticleFloorGeometry = new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2);
    
    // Wall: Crosshair geometry (plus shape) - create manually with BufferGeometry
    const crosshairSize = 0.07;
    const crosshairThickness = 0.01;
    const halfSize = crosshairSize;
    const halfThick = crosshairThickness / 2;
    
    // Create vertices for a plus shape (crosshair)
    // Horizontal line: 4 vertices forming a rectangle
    // Vertical line: 4 vertices forming a rectangle
    const vertices = new Float32Array([
        // Horizontal line (centered at y=0)
        -halfSize, -halfThick, 0,  // 0: bottom-left
        halfSize, -halfThick, 0,   // 1: bottom-right
        halfSize, halfThick, 0,    // 2: top-right
        -halfSize, halfThick, 0,   // 3: top-left
        // Vertical line (centered at x=0, but offset to avoid overlap)
        -halfThick, -halfSize, 0,  // 4: bottom-left
        halfThick, -halfSize, 0,   // 5: bottom-right
        halfThick, halfSize, 0,    // 6: top-right
        -halfThick, halfSize, 0    // 7: top-left
    ]);
    
    // Create indices for two quads
    const indices = new Uint16Array([
        // Horizontal quad
        0, 1, 2,
        0, 2, 3,
        // Vertical quad
        4, 5, 6,
        4, 6, 7
    ]);
    
    reticleWallGeometry = new THREE.BufferGeometry();
    reticleWallGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    reticleWallGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    reticleWallGeometry.computeVertexNormals();
    reticleWallGeometry.rotateX(-Math.PI / 2);
    
    // Create reticle material (color will change based on surface type)
    reticleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, // Cyan for floor (default)
        opacity: 0.8,
        transparent: true
    });
    
    // Start with floor geometry
    reticle = new THREE.Mesh(reticleFloorGeometry, reticleMaterial);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Start WebXR session
    try {
        console.log('Requesting WebXR session...');
        
        // Request session - don't require any specific reference space
        // We'll request the reference space after session starts
        xrSession = await navigator.xr.requestSession('immersive-ar', {
            optionalFeatures: ['local', 'local-floor', 'hit-test', 'dom-overlay'],
            domOverlay: { root: document.body }
        });

        console.log('WebXR session started successfully');
        console.log('Session features:', xrSession.enabledFeatures);
        
        // Connect renderer to XR session
        await renderer.xr.setSession(xrSession);
        console.log('Renderer connected to XR session');
        
        // Try different reference space types in order of preference
        const referenceSpaceTypes = ['local-floor', 'local', 'viewer'];
        
        for (const spaceType of referenceSpaceTypes) {
            try {
                xrReferenceSpace = await xrSession.requestReferenceSpace(spaceType);
                console.log(`Reference space obtained: ${spaceType}`);
                break;
            } catch (e) {
                console.warn(`Reference space '${spaceType}' not supported, trying next...`);
            }
        }
        
        if (!xrReferenceSpace) {
            throw new Error('No supported reference space type found on this device.');
        }
        
        // Try to set up hit-test source for surface detection
        const hasHitTest = xrSession.enabledFeatures && 
                          Array.isArray(xrSession.enabledFeatures) && 
                          xrSession.enabledFeatures.includes('hit-test');
        
        if (hasHitTest) {
            try {
                const viewerSpace = await xrSession.requestReferenceSpace('viewer');
                xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
                console.log('Hit-test source created - tap surfaces to place content');
            } catch (hitTestError) {
                console.warn('Hit-test setup failed:', hitTestError);
            }
        } else {
            console.log('Hit-test not available - content will be placed in front of camera on tap');
        }

        // Handle session end
        xrSession.addEventListener('end', () => {
            console.log('WebXR session ended');
            xrSession = null;
            xrHitTestSource = null;
            isAnchored = false;
        });

        // Set up render loop - Three.js handles XR rendering automatically
        renderer.setAnimationLoop(onXRFrame);
        console.log('Render loop started - camera feed should be visible');

        // Handle window resize
        window.addEventListener('resize', onWindowResize);
        
        // Set up tap-to-place interaction
        setupTapToPlace();

    } catch (error) {
        console.error('Failed to start WebXR session:', error);
        throw error;
    }
}

// ============================================================================
// TAP TO PLACE
// ============================================================================

function setupTapToPlace() {
    if (!xrSession) return;
    
    xrSession.addEventListener('select', (event) => {
        if (!isAnchored) {
            if (reticle.visible) {
                // Place content at reticle position (hit-test available)
                contentGroup.position.setFromMatrixPosition(reticle.matrix);
                contentGroup.visible = true;
                isAnchored = true;
                reticle.visible = false;
                console.log('Content placed at detected surface');
            } else if (!xrHitTestSource) {
                // Fallback: place content 1 meter in front of camera
                // This is used when hit-test is not available
                const frame = renderer.xr.getFrame();
                if (frame) {
                    const pose = frame.getViewerPose(xrReferenceSpace);
                    if (pose) {
                        const view = pose.views[0];
                        if (view) {
                            // Get camera position and direction
                            const matrix = new THREE.Matrix4().fromArray(view.transform.matrix);
                            const position = new THREE.Vector3();
                            const direction = new THREE.Vector3(0, 0, -1);
                            
                            position.setFromMatrixPosition(matrix);
                            direction.applyMatrix4(matrix);
                            direction.sub(position).normalize();
                            
                            // Place 1 meter in front of camera, at same height
                            contentGroup.position.copy(position);
                            contentGroup.position.addScaledVector(direction, 1.0);
                            contentGroup.position.y -= 0.3; // Lower slightly
                            contentGroup.visible = true;
                            isAnchored = true;
                            console.log('Content placed in front of camera');
                        }
                    }
                }
            }
        }
    });
}

// ============================================================================
// SURFACE TYPE DETECTION
// ============================================================================

/**
 * Detects if a surface is a wall or floor based on the hit-test pose
 * @param {XRPose} hitPose - The pose from hit-test result
 * @returns {string} 'wall' or 'floor'
 */
function detectSurfaceType(hitPose) {
    if (!hitPose || !hitPose.transform) {
        return 'floor'; // Default to floor
    }
    
    // Extract transform matrix
    const matrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
    
    // Extract the Z-axis (normal vector) from the transform matrix
    // In a 4x4 transform matrix, the Z-axis is in the third column (indices 8, 9, 10)
    const normal = new THREE.Vector3();
    normal.setFromMatrixColumn(matrix, 2);
    normal.normalize();
    
    // Up vector (Y-axis)
    const up = new THREE.Vector3(0, 1, 0);
    
    // Calculate dot product to determine angle
    // If normal is pointing up (floor), dot product is close to 1
    // If normal is horizontal (wall), dot product is close to 0
    const dotProduct = Math.abs(normal.dot(up));
    
    // Threshold: if dot product < 0.5, it's a wall (normal is mostly horizontal)
    // Otherwise, it's a floor (normal is mostly vertical/up)
    const surfaceType = dotProduct < 0.5 ? 'wall' : 'floor';
    
    return surfaceType;
}

/**
 * Updates reticle appearance based on surface type
 * @param {string} surfaceType - 'wall' or 'floor'
 */
function updateReticleAppearance(surfaceType) {
    if (currentSurfaceType === surfaceType) {
        return; // No change needed
    }
    
    currentSurfaceType = surfaceType;
    
    // Update geometry
    const oldGeometry = reticle.geometry;
    if (surfaceType === 'wall') {
        reticle.geometry = reticleWallGeometry;
        reticleMaterial.color.setHex(0xff6b35); // Orange/red for wall
    } else {
        reticle.geometry = reticleFloorGeometry;
        reticleMaterial.color.setHex(0x00ffff); // Cyan/blue for floor
    }
    
    // Dispose old geometry if it's not one of our shared geometries
    if (oldGeometry !== reticleFloorGeometry && oldGeometry !== reticleWallGeometry) {
        oldGeometry.dispose();
    }
}

// ============================================================================
// RENDER LOOP
// ============================================================================

let frameCount = 0;

function onXRFrame(timestamp, frame) {
    frameCount++;
    
    // Log periodically to confirm render loop is running
    if (frameCount % 300 === 0) {
        console.log('WebXR render loop active - frame:', frameCount);
    }
    
    // CRITICAL: Always render even if we don't have a pose
    // This keeps the XR session alive and shows the camera feed
    
    if (!frame) {
        renderer.render(scene, camera);
        return;
    }

    // Update reticle position from hit-test (only if not anchored and hit-test available)
    if (xrHitTestSource && !isAnchored) {
        try {
            const hitTestResults = frame.getHitTestResults(xrHitTestSource);
            
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const hitPose = hit.getPose(xrReferenceSpace);
                
                if (hitPose) {
                    // Detect surface type
                    const surfaceType = detectSurfaceType(hitPose);
                    updateReticleAppearance(surfaceType);
                    
                    reticle.visible = true;
                    reticle.matrix.fromArray(hitPose.transform.matrix);
                }
            } else {
                reticle.visible = false;
                currentSurfaceType = null;
            }
        } catch (error) {
            // Hit-test might fail occasionally, just hide reticle
            reticle.visible = false;
            currentSurfaceType = null;
        }
    } else if (!xrHitTestSource && !isAnchored) {
        // No hit-test available - show reticle in center as tap indicator
        // Position it 1m in front of camera
        const pose = frame.getViewerPose(xrReferenceSpace);
        if (pose && pose.views && pose.views.length > 0) {
            const view = pose.views[0];
            const matrix = new THREE.Matrix4().fromArray(view.transform.matrix);
            const position = new THREE.Vector3();
            const direction = new THREE.Vector3(0, 0, -1);
            
            position.setFromMatrixPosition(matrix);
            direction.applyMatrix4(matrix);
            direction.sub(position).normalize();
            
            // Position reticle 1m in front
            reticle.position.copy(position);
            reticle.position.addScaledVector(direction, 1.0);
            reticle.lookAt(position);
            reticle.visible = true;
            reticle.matrixAutoUpdate = true;
            
            // Default to floor appearance when no hit-test
            updateReticleAppearance('floor');
        }
    }

    // Animate the cube
    if (cubeMesh && isAnchored) {
        animationTime = timestamp * 0.001;
        cubeMesh.rotation.y = animationTime;
        cubeMesh.rotation.x = animationTime * 0.5;
    }

    // Render - Three.js WebXRManager handles camera automatically
    renderer.render(scene, camera);
}

// ============================================================================
// WINDOW RESIZE
// ============================================================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// RESET ANCHOR
// ============================================================================

function resetAnchor() {
    isAnchored = false;
    contentGroup.visible = false;
    
    // Reset reticle state properly
    if (xrHitTestSource) {
        // When hit-test is available, use matrix updates from hit-test
        reticle.matrixAutoUpdate = false;
        reticle.visible = true;
        // Reset surface type so it will be detected again
        currentSurfaceType = null;
    } else {
        // When no hit-test, use position-based updates
        reticle.matrixAutoUpdate = true;
        reticle.visible = true;
        // Default to floor appearance
        updateReticleAppearance('floor');
    }
    
    console.log('Anchor reset - tap to place again');
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.WebXRAR = {
        init: initWebXR,
        reset: resetAnchor,
        isAnchored: () => isAnchored,
        _scriptLoaded: true,
        _loaded: true,
        _loadTime: Date.now()
    };
}


