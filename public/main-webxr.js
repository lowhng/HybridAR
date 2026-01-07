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
let wireModel = null; // Wire.glb model
let placedSurfaceType = null; // 'wall' or 'floor' - surface type when content was placed
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
    
    // Check WebXR support with defensive checks
    if (!navigator.xr) {
        const error = 'WebXR is not supported on this device. Please use an Android device with Chrome or iOS with Variant Launch.';
        console.error(error);
        if (window.Toast) {
            window.Toast.error(error, 'WebXR Not Available', 8000);
        }
        throw new Error(error);
    }
    
    // Ensure navigator.xr has the required methods
    if (typeof navigator.xr.isSessionSupported !== 'function') {
        const error = 'WebXR API is not properly initialized. Please refresh the page and try again.';
        console.error(error);
        if (window.Toast) {
            window.Toast.error(error, 'WebXR API Error', 8000);
        }
        throw new Error(error);
    }

    let isSupported = false;
    try {
        isSupported = await navigator.xr.isSessionSupported('immersive-ar');
    } catch (supportError) {
        console.error('Error checking session support:', supportError);
        const error = `Failed to check WebXR support: ${supportError.message || supportError}`;
        if (window.Toast) {
            window.Toast.error(error, 'WebXR Check Failed', 8000);
        }
        throw new Error(error);
    }
    
    if (!isSupported) {
        const error = 'WebXR immersive-ar is not supported on this device.';
        console.error(error);
        if (window.Toast) {
            window.Toast.error(error, 'WebXR Session Not Supported', 8000);
        }
        throw new Error(error);
    }

    console.log('WebXR supported, initializing...');
    if (window.Toast) {
        window.Toast.info('WebXR is supported, starting initialization...', 'Initializing', 3000);
    }

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
    
    // CRITICAL for iOS: Ensure XR is properly configured
    // Some iOS WebXR viewers need explicit configuration
    if (renderer.xr) {
        renderer.xr.enabled = true;
        // Don't set autoUpdate to false - iOS needs automatic updates
        console.log('WebXR renderer configured');
    }
    
    // Set clear color with 0 alpha for transparency
    // This is essential for camera passthrough to show through
    renderer.setClearColor(0x000000, 0);
    
    // Ensure output encoding is correct for AR
    renderer.outputEncoding = THREE.sRGBEncoding;
    
    // Style the canvas - CRITICAL for iOS: must be visible and properly sized
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '1';
    // Ensure canvas is visible (not hidden)
    canvas.style.visibility = 'visible';
    canvas.style.opacity = '1';
    
    // Append canvas to container
    arContainer.appendChild(canvas);
    
    // Force a reflow to ensure canvas is in DOM and visible before session starts
    // This is especially important for iOS
    canvas.offsetHeight; // Trigger reflow
    
    console.log('Canvas created and appended:', {
        width: canvas.width,
        height: canvas.height,
        display: canvas.style.display,
        visibility: canvas.style.visibility,
        inDOM: document.body.contains(canvas)
    });

    // Create content group for AR objects
    contentGroup = new THREE.Group();
    contentGroup.visible = false; // Hidden until placed
    scene.add(contentGroup);

    // Note: Objects will be created dynamically based on surface type when placed

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
        console.log('Canvas ready:', {
            width: renderer.domElement.width,
            height: renderer.domElement.height,
            visible: renderer.domElement.style.visibility !== 'hidden'
        });
        
        // CRITICAL for iOS/Variant Launch: Give the SDK a moment to be fully ready
        // This prevents the SDK from trying to process session requests before it's initialized
        const platform = window.PlatformDetector?.detectPlatform?.() || { isIOS: false };
        if (platform.isIOS) {
            console.log('iOS detected - waiting for Variant Launch SDK to be fully ready...');
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Ensure navigator.xr.requestSession exists and is a function
        if (typeof navigator.xr.requestSession !== 'function') {
            throw new Error('navigator.xr.requestSession is not available. The WebXR API may not be fully initialized.');
        }
        
        // Request session - don't require any specific reference space
        // We'll request the reference space after session starts.
        // NOTE: We intentionally avoid requesting DOM overlay here because
        // some iOS WebXR viewers (including Variant Launch) can show a black
        // screen if dom-overlay is requested but not fully supported.
        // 
        // CRITICAL for Variant Launch SDK: Ensure session options are properly structured
        // The SDK may try to access requiredFeatures, so we explicitly set it to an empty array
        // to prevent "undefined is not an object" errors
        const sessionOptions = {
            requiredFeatures: [], // Explicitly set to empty array to prevent SDK errors
            optionalFeatures: ['local', 'local-floor', 'hit-test']
        };
        
        // Ensure the options object is properly structured and not null/undefined
        // This prevents the SDK from receiving undefined when it expects an object
        if (!sessionOptions || typeof sessionOptions !== 'object') {
            throw new Error('Session options object is invalid');
        }
        
        console.log('Requesting session with options:', sessionOptions);
        
        // Wrap in try-catch to provide better error messages
        try {
            xrSession = await navigator.xr.requestSession('immersive-ar', sessionOptions);
        } catch (sessionError) {
            // Provide more detailed error information
            console.error('Session request failed:', sessionError);
            console.error('Session error details:', {
                name: sessionError.name,
                message: sessionError.message,
                stack: sessionError.stack
            });
            
            if (sessionError.message && sessionError.message.includes('requiredFeatures')) {
                throw new Error('WebXR session request failed due to feature configuration. This may be a Variant Launch SDK initialization issue. Please try refreshing the page.');
            }
            
            // Re-throw with additional context
            const enhancedError = new Error(`Failed to start WebXR session: ${sessionError.message || sessionError}`);
            enhancedError.originalError = sessionError;
            throw enhancedError;
        }

        console.log('WebXR session started successfully');
        console.log('Session features:', xrSession.enabledFeatures);
        console.log('Session object:', xrSession);
        
        if (window.Toast) {
            window.Toast.success('WebXR session started!', 'Session Active', 3000);
        }
        
        // CRITICAL for iOS: Ensure canvas is still visible before connecting renderer
        const canvas = renderer.domElement;
        if (canvas.style.visibility === 'hidden' || canvas.style.display === 'none') {
            console.warn('Canvas was hidden, making it visible again');
            canvas.style.visibility = 'visible';
            canvas.style.display = 'block';
        }
        
        // Connect renderer to XR session
        await renderer.xr.setSession(xrSession);
        console.log('Renderer connected to XR session');
        
        // Force an immediate render to ensure camera feed appears
        // This is especially important for iOS
        renderer.render(scene, camera);
        console.log('Initial render completed');
        
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
                // Request hit-test source - some devices may support vertical planes
                // Try to create hit-test source that can detect both horizontal and vertical planes
                try {
                    xrHitTestSource = await xrSession.requestHitTestSource({ 
                        space: viewerSpace,
                        // Some implementations support offsetRay for better detection
                        // but this is optional and may not be supported
                    });
                    console.log('Hit-test source created - tap surfaces to place content');
                } catch (hitTestError) {
                    // Fallback: try without options
                    xrHitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
                    console.log('Hit-test source created (fallback method)');
                }
            } catch (hitTestError) {
                console.warn('Hit-test setup failed:', hitTestError);
                console.warn('Note: Some Android devices may only detect horizontal surfaces (floors)');
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
        // CRITICAL: The render loop must be set for the camera feed to appear
        renderer.setAnimationLoop(onXRFrame);
        console.log('Render loop started - camera feed should be visible');
        
        if (window.Toast) {
            window.Toast.info('Render loop started. Camera feed should appear shortly...', 'Rendering', 4000);
        }
        
        // Force an immediate frame render to kickstart the loop (iOS sometimes needs this)
        requestAnimationFrame(() => {
            console.log('Animation frame requested - render loop should be active');
            // Double-check that the loop is actually running
            if (renderer.xr.isPresenting) {
                console.log('XR is presenting - camera feed should be visible');
                if (window.Toast) {
                    window.Toast.success('XR is presenting! Camera feed should be visible.', 'AR Active', 3000);
                }
            } else {
                console.warn('XR is not presenting yet - this might be normal during initialization');
                if (window.Toast) {
                    window.Toast.warning('XR not presenting yet. This may be normal during initialization.', 'Initializing', 4000);
                }
            }
        });

        // Handle window resize
        window.addEventListener('resize', onWindowResize);
        
        // Set up tap-to-place interaction
        setupTapToPlace();

    } catch (error) {
        console.error('Failed to start WebXR session:', error);
        // Show error in toast if available
        if (window.Toast) {
            window.Toast.error(
                `WebXR Session Error: ${error.message}\n\n${error.stack ? error.stack.substring(0, 300) : ''}`,
                'WebXR Initialization Failed',
                10000
            );
        }
        throw error;
    }
}

// ============================================================================
// CONTENT CREATION
// ============================================================================

/**
 * Creates or loads the appropriate 3D object based on surface type
 * @param {string} surfaceType - 'wall' or 'floor'
 */
async function createContentForSurface(surfaceType) {
    // Clear existing content
    while (contentGroup.children.length > 0) {
        const child = contentGroup.children[0];
        contentGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
            } else {
                child.material.dispose();
            }
        }
        if (child.dispose) child.dispose();
    }
    
    cubeMesh = null;
    wireModel = null;
    placedSurfaceType = surfaceType;
    
    if (surfaceType === 'wall') {
        // Load wire.glb for walls
        // Check if GLTFLoader is available (might be loaded asynchronously)
        // Wait a bit for GLTFLoader to load if it's not immediately available
        let GLTFLoader = THREE?.GLTFLoader || window.THREE?.GLTFLoader;
        
        if (!GLTFLoader) {
            // Wait up to 2 seconds for GLTFLoader to load
            for (let i = 0; i < 20; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                GLTFLoader = THREE?.GLTFLoader || window.THREE?.GLTFLoader;
                if (GLTFLoader) break;
            }
        }
        
        if (!GLTFLoader) {
            console.error('GLTFLoader not available after waiting. Falling back to green box.');
            createGreenBox();
            return;
        }
        
        const loader = new GLTFLoader();
        try {
            const gltf = await new Promise((resolve, reject) => {
                loader.load(
                    './assets/wire.glb',
                    (gltf) => resolve(gltf),
                    undefined,
                    (error) => reject(error)
                );
            });
            
            wireModel = gltf.scene;
            wireModel.position.set(0, 0, 0);
            // Scale if needed - adjust based on your model size
            wireModel.scale.set(1, 1, 1);
            contentGroup.add(wireModel);
            console.log('Wire.glb loaded for wall');
        } catch (error) {
            console.error('Failed to load wire.glb:', error);
            console.log('Falling back to green box');
            createGreenBox();
        }
    } else {
        // Create green box for floors
        createGreenBox();
    }
}

/**
 * Creates a green box (default content for floors)
 */
function createGreenBox() {
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00,
        metalness: 0.3,
        roughness: 0.6
    });
    cubeMesh = new THREE.Mesh(geometry, material);
    cubeMesh.position.set(0, 0.05, 0); // Raise slightly above surface
    contentGroup.add(cubeMesh);
    console.log('Green box created for floor');
}

// ============================================================================
// TAP TO PLACE
// ============================================================================

function setupTapToPlace() {
    if (!xrSession) return;
    
    xrSession.addEventListener('select', async () => {
        // If we have a visible reticle (hit-test result), always (re)place the
        // content at that location and choose the asset based on the currently
        // detected surface type. This allows:
        // - First tap on a wall → spawn wire.glb
        // - Second tap on the floor → replace with green cube
        if (reticle.visible) {
            const surfaceType = currentSurfaceType || 'floor'; // Default to floor if not detected
            
            // Create appropriate content based on surface type
            await createContentForSurface(surfaceType);
            
            contentGroup.position.setFromMatrixPosition(reticle.matrix);
            contentGroup.visible = true;
            isAnchored = true;
            console.log(`Content placed or updated at detected surface (${surfaceType})`);
            return;
        }
        
        // Fallback: if we don't have hit-test, place 1 meter in front of camera
        if (!xrHitTestSource) {
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
                        
                        // Default to floor when no hit-test
                        await createContentForSurface('floor');
                        
                        // Place 1 meter in front of camera, at same height
                        contentGroup.position.copy(position);
                        contentGroup.position.addScaledVector(direction, 1.0);
                        contentGroup.position.y -= 0.3; // Lower slightly
                        contentGroup.visible = true;
                        isAnchored = true;
                        console.log('Content placed in front of camera (floor default, no hit-test)');
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
    
    // Extract the Y-axis (up vector) from the transform matrix
    // The Y-axis of the transform tells us the orientation of the surface
    // For a floor (horizontal), Y-axis points up (close to world Y: 0, 1, 0)
    // For a wall (vertical), Y-axis points horizontally (Y component close to 0)
    const upVector = new THREE.Vector3();
    upVector.setFromMatrixColumn(matrix, 1);
    upVector.normalize();
    
    // World up vector
    const worldUp = new THREE.Vector3(0, 1, 0);
    
    // Calculate dot product to determine how vertical the surface is
    // If Y-axis is pointing up (floor), dot product is close to 1
    // If Y-axis is horizontal (wall), dot product is close to 0
    const dotProduct = Math.abs(upVector.dot(worldUp));
    
    // Also check the Y component directly as an alternative method
    const yComponent = Math.abs(upVector.y);
    
    // Debug logging (can be removed later)
    if (frameCount % 60 === 0) {
        console.log('Surface detection - Y-axis:', 
            `(${upVector.x.toFixed(2)}, ${upVector.y.toFixed(2)}, ${upVector.z.toFixed(2)})`, 
            'dot product:', dotProduct.toFixed(2), 
            'Y component:', yComponent.toFixed(2));
    }
    
    // Threshold: if Y component < 0.7, it's a wall (Y-axis is mostly horizontal)
    // Otherwise, it's a floor (Y-axis is mostly vertical/up)
    // Using Y component directly as it's more reliable
    // Lower threshold (0.5) to be more sensitive to walls
    const surfaceType = yComponent < 0.5 ? 'wall' : 'floor';
    
    // Additional check: if the surface normal (Z-axis) is pointing horizontally
    // This is a secondary check for wall detection
    const zAxis = new THREE.Vector3();
    zAxis.setFromMatrixColumn(matrix, 2);
    zAxis.normalize();
    const zVertical = Math.abs(zAxis.dot(worldUp));
    
    // If Z-axis is also horizontal (not pointing up/down), it's more likely a wall
    if (yComponent < 0.7 && zVertical < 0.7) {
        return 'wall';
    }
    
    return surfaceType;
    
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
    
    // Log first few frames to confirm render loop is running (especially important for iOS debugging)
    if (frameCount === 1) {
        console.log('WebXR render loop started - first frame rendered');
        if (window.Toast) {
            window.Toast.success('First frame rendered!', 'Render Loop Active', 2000);
        }
    } else if (frameCount <= 5 || frameCount % 300 === 0) {
        console.log('WebXR render loop active - frame:', frameCount, 'hasFrame:', !!frame);
    }
    
    // CRITICAL: Always render even if we don't have a pose
    // This keeps the XR session alive and shows the camera feed
    // On iOS, the camera feed might not appear if we don't render every frame
    
    if (!frame) {
        // Still render even without frame to keep session alive
        renderer.render(scene, camera);
        return;
    }
    
    // Ensure we have a valid session
    if (!xrSession) {
        console.warn('No XR session in render loop');
        renderer.render(scene, camera);
        return;
    }

    // Update reticle position from hit-test whenever available
    // (even after content has been placed) so the user can tap again
    // to move/replace content on a new surface.
    if (xrHitTestSource) {
        try {
            const hitTestResults = frame.getHitTestResults(xrHitTestSource);
            
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const hitPose = hit.getPose(xrReferenceSpace);
                
                if (hitPose) {
                    // Detect surface type
                    const surfaceType = detectSurfaceType(hitPose);
                    
                    // Log surface type changes
                    if (surfaceType !== currentSurfaceType) {
                        console.log('Surface type detected:', surfaceType);
                    }
                    
                    updateReticleAppearance(surfaceType);
                    
                    reticle.visible = true;
                    reticle.matrix.fromArray(hitPose.transform.matrix);
                    reticle.matrixAutoUpdate = false; // Ensure this is set correctly
                }
            } else {
                reticle.visible = false;
                currentSurfaceType = null;
            }
        } catch (error) {
            // Hit-test might fail occasionally, just hide reticle
            console.warn('Hit-test error:', error);
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

    // Animate the cube (only if it's a cube, not wire model)
    if (cubeMesh && isAnchored) {
        animationTime = timestamp * 0.001;
        cubeMesh.rotation.y = animationTime;
        cubeMesh.rotation.x = animationTime * 0.5;
    }
    
    // Wire model stays static (no rotation)

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
    console.log('Reset button pressed - resetting anchor...');
    
    isAnchored = false;
    placedSurfaceType = null;
    
    // Force hide the content group and all its children
    if (contentGroup) {
        contentGroup.visible = false;
        // Also reset position to ensure it's not visible
        contentGroup.position.set(0, 0, 0);
        contentGroup.rotation.set(0, 0, 0);
        contentGroup.scale.set(1, 1, 1);
        
        // Clear all children
        while (contentGroup.children.length > 0) {
            const child = contentGroup.children[0];
            contentGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
            if (child.traverse) {
                child.traverse((obj) => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(mat => mat.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                });
            }
            if (child.dispose) child.dispose();
        }
        
        console.log('Content group cleared and position reset');
    }
    
    // Reset references
    cubeMesh = null;
    wireModel = null;
    
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
    
    console.log('Anchor reset complete - isAnchored:', isAnchored, 'contentGroup.visible:', contentGroup ? contentGroup.visible : 'N/A');
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


