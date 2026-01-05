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

// ============================================================================
// THREE.JS SCENE SETUP
// ============================================================================
let scene, camera, renderer;
let contentGroup;
let cubeMesh;
let reticle; // Visual indicator for placement
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

    // Create reticle for hit-test visualization
    const reticleGeometry = new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2);
    const reticleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        opacity: 0.8,
        transparent: true
    });
    reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
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
                    reticle.visible = true;
                    reticle.matrix.fromArray(hitPose.transform.matrix);
                }
            } else {
                reticle.visible = false;
            }
        } catch (error) {
            // Hit-test might fail occasionally, just hide reticle
            reticle.visible = false;
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
    if (xrHitTestSource) {
        reticle.visible = true;
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


