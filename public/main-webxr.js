// WebXR + Three.js AR Application
// Provides AR experience on Android devices with camera passthrough

// ============================================================================
// EXPORT IMMEDIATELY
// ============================================================================
// Define debugMode and debugLog early to ensure they're always available
let debugMode = false;

/**
 * Logs a debug message only if debug mode is enabled
 * Defined early to ensure it's always available
 * @param {...any} args - Arguments to pass to console.log
 */
function debugLog(...args) {
    if (debugMode) {
        console.log(...args);
    }
}

if (typeof window !== 'undefined') {
    window.WebXRAR = window.WebXRAR || {};
    window.WebXRAR._scriptLoaded = true;
    window.WebXRAR._scriptLoadTime = Date.now();
    
    // Debug: Log Three.js and GLTFLoader availability at script load time
    console.log('=== main-webxr.js loaded ===');
    console.log('THREE available:', typeof THREE !== 'undefined');
    console.log('THREE.GLTFLoader available:', typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined');
    
    if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader === 'undefined') {
        console.warn('WARNING: THREE exists but THREE.GLTFLoader is not defined!');
        console.warn('This means GLTFLoader.js script may not have loaded correctly.');
        console.warn('Check that <script src="...GLTFLoader.js"> is in the HTML BEFORE main-webxr.js');
    }
}

// ============================================================================
// GLTF LOADER SETUP (simple and straightforward)
// ============================================================================
// Create a single GLTFLoader instance that will be used throughout the app
let gltfLoader = null;

/**
 * Initialize the GLTFLoader - simple check and create instance
 */
function initGLTFLoader() {
    if (gltfLoader) {
        return gltfLoader; // Already initialized, reuse instance
    }
    
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
        console.error('❌ GLTFLoader not available! Make sure GLTFLoader.js script is loaded after Three.js');
        if (window.Toast) {
            window.Toast.error('GLTFLoader not found. 3D models cannot be loaded. Please refresh the page.', 'Loader Error', 8000);
        }
        return null;
    }
    
    try {
        gltfLoader = new THREE.GLTFLoader();
        console.log('✅ GLTFLoader initialized');
        return gltfLoader;
    } catch (e) {
        console.error('❌ Failed to create GLTFLoader instance:', e);
        if (window.Toast) {
            window.Toast.error('Failed to initialize GLTFLoader. Please refresh the page.', 'Loader Error', 8000);
        }
        return null;
    }
}

/**
 * Load a GLB/GLTF model - simple and straightforward
 * @param {string} url - Path to the GLB file
 * @returns {Promise<Object>} - The loaded GLTF object with scene property
 */
function loadModel(url) {
    return new Promise((resolve, reject) => {
        // Initialize loader if needed
        if (!gltfLoader) {
            gltfLoader = initGLTFLoader();
        }
        
        if (!gltfLoader) {
            reject(new Error('GLTFLoader not available. Please ensure GLTFLoader.js is loaded.'));
            return;
        }
        
        // Load the model
        gltfLoader.load(
            url,
            (gltf) => {
                console.log('✅ Model loaded successfully:', url);
                resolve(gltf);
            },
            (progress) => {
                // Progress callback (optional)
                if (progress.total > 0) {
                    const percent = Math.round((progress.loaded / progress.total) * 100);
                    console.log(`Loading ${url}: ${percent}%`);
                }
            },
            (error) => {
                console.error('❌ Failed to load model:', url, error);
                reject(new Error(`Failed to load model from ${url}: ${error.message || error}`));
            }
        );
    });
}

/**
 * Load a mesh from a GLB file (returns first child like bouncing-band)
 * @param {string} url - Path to the GLB file
 * @returns {Promise<THREE.Object3D>} - The first child of the loaded scene
 */
async function loadMesh(url) {
    const gltf = await loadModel(url);
    return gltf.scene.children[0];
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let isAnchored = false;
let xrSession = null;
let xrReferenceSpace = null;
let xrHitTestSource = null;
let currentSurfaceType = null; // 'floor' or 'wall'
let currentModelType = null; // 'wire-model', 'green-cube' (puddle model), etc.
let isExitingToQuiz = false; // Flag to prevent returnToStartScreen when exiting to quiz
// debugMode is defined at the top of the file to ensure it's always available

// ============================================================================
// THREE.JS SCENE SETUP
// ============================================================================
let scene, camera, renderer;
let contentGroup;
let cubeMesh;
let wireModel = null; // Wire.glb model
let puddleModel = null; // Puddle.glb model
let placedSurfaceType = null; // 'wall' or 'floor' - surface type when content was placed
let reticle; // Visual indicator for placement
let reticleFloorGeometry; // Ring geometry for floor
let reticleWallGeometry; // Crosshair geometry for wall
let reticleMaterial; // Material that changes color
let animationTime = 0;

// ============================================================================
// GAZE DETECTION STATE
// ============================================================================
let gazeTimer = 0; // Time in milliseconds user has been looking at model
let isGazingAtModel = false;
let lastGazeCheckTime = 0;
const GAZE_THRESHOLD_MS = 2000; // 2 seconds
const GAZE_ANGLE_THRESHOLD = Math.PI / 6; // 30 degrees (in radians)
let raycaster = null; // Will be initialized after THREE is available

// ============================================================================
// AUTO-SPAWN STATE
// ============================================================================
let autoSpawnTimer = 0; // Time since AR session started (in milliseconds)
let hasAutoSpawned = false; // Whether auto-spawn has occurred
let autoSpawnTime = 0; // Random time between 3-5 seconds (in milliseconds)
let autoSpawnDistance = 3.0; // Distance threshold in meters to determine if user is "too far"
let spawnCooldown = 2000; // Cooldown time in milliseconds before allowing another spawn
let lastSpawnAttemptTime = 0; // Timestamp of last spawn attempt
let autoSpawnPosition = null; // Position where model was auto-spawned
let surfaceDetectionTime = 0; // Timestamp when surface was first detected
let lastReticlePosition = null; // Last reticle position for stability checking
let surfaceStabilityDuration = 1500; // Minimum time (ms) surface must be stable before auto-spawn
let reticleStabilityThreshold = 0.05; // Maximum position change (meters) to consider reticle stable

// ============================================================================
// DOM ELEMENTS
// ============================================================================
let arContainer = null;
let overlayRoot = null;
let overlayUI = null;

function getDOMElements() {
    if (!arContainer) {
        arContainer = document.getElementById('ar-container');
    }
}

/**
 * Creates or ensures the XR overlay root element exists
 * This overlay will be used for DOM overlay in WebXR sessions
 */
function ensureOverlayRoot() {
    // Check if overlay already exists
    overlayRoot = document.getElementById('xr-overlay');
    
    if (!overlayRoot) {
        // Create overlay root
        overlayRoot = document.createElement('div');
        overlayRoot.id = 'xr-overlay';
        
        // Style the overlay root - full screen, pointer-events: none by default
        overlayRoot.style.position = 'fixed';
        overlayRoot.style.top = '0';
        overlayRoot.style.left = '0';
        overlayRoot.style.width = '100%';
        overlayRoot.style.height = '100%';
        overlayRoot.style.pointerEvents = 'none';
        overlayRoot.style.zIndex = '99999';
        
        // Create UI container inside overlay
        overlayUI = document.createElement('div');
        overlayUI.id = 'xr-overlay-ui';
        overlayUI.style.pointerEvents = 'auto';
        
        overlayRoot.appendChild(overlayUI);
        document.body.appendChild(overlayRoot);
        
        debugLog('Overlay root created');
    } else {
        // Overlay exists, find or create UI container
        overlayUI = document.getElementById('xr-overlay-ui');
        if (!overlayUI) {
            overlayUI = document.createElement('div');
            overlayUI.id = 'xr-overlay-ui';
            overlayUI.style.pointerEvents = 'auto';
            overlayRoot.appendChild(overlayUI);
        }
        debugLog('Overlay root found');
    }
    
    // Move reset button into overlay UI if it exists and isn't already there
    const resetButton = document.getElementById('reset-button');
    if (resetButton && resetButton.parentElement !== overlayUI) {
        overlayUI.appendChild(resetButton);
        debugLog('Reset button moved into overlay UI');
    }
    
    // Move close button into overlay UI if it exists and isn't already there
    const closeButton = document.getElementById('close-button');
    if (closeButton && closeButton.parentElement !== overlayUI) {
        overlayUI.appendChild(closeButton);
        debugLog('Close button moved into overlay UI');
    }
    
    // Move quiz button into overlay UI if it exists and isn't already there
    const quizButton = document.getElementById('quiz-button');
    if (quizButton && quizButton.parentElement !== overlayUI) {
        overlayUI.appendChild(quizButton);
        debugLog('Quiz button moved into overlay UI');
    }
    
    // Ensure toast container is accessible (can be sibling or inside overlay)
    const toastContainer = document.getElementById('toast-container');
    if (toastContainer && !overlayRoot.contains(toastContainer)) {
        // Keep toast container as sibling to overlay (it has its own z-index)
        // Just ensure it's in the DOM
        if (!document.body.contains(toastContainer)) {
            document.body.appendChild(toastContainer);
        }
    }
    
    return overlayRoot;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initWebXR() {
    getDOMElements();
    
    if (!arContainer) {
        throw new Error('AR container element not found. Ensure #ar-container exists in the DOM.');
    }
    
    // Set up debug toggle event listener
    const debugCheckbox = document.getElementById('debug-checkbox');
    if (debugCheckbox) {
        debugCheckbox.addEventListener('change', (e) => {
            debugMode = e.target.checked;
            console.log('Debug mode:', debugMode ? 'enabled' : 'disabled');
        });
        // Initialize debug mode from checkbox state
        debugMode = debugCheckbox.checked;
    }
    
    // Create/ensure overlay root exists for DOM overlay support
    ensureOverlayRoot();
    
    // Ensure close button is in overlay UI if it's visible (for iOS WebXR)
    const closeButton = document.getElementById('close-button');
    if (closeButton && !closeButton.classList.contains('hidden') && overlayUI) {
        if (closeButton.parentElement !== overlayUI) {
            overlayUI.appendChild(closeButton);
            debugLog('Close button moved to overlay UI during init');
        }
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

    debugLog('WebXR supported, initializing...');
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
        debugLog('WebXR renderer configured');
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
    
    debugLog('Canvas created and appended:', {
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

    // Add lighting - increased intensity to address darkness
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1); // Increased from 0.7 to 1.0
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // Increased from 0.8 to 1.2
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);
    directionalLight.castShadow = false; // shadows often darken AR scenes
    
    // Add additional fill light to reduce darkness
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);
    

    // Start WebXR session
    try {
        debugLog('Requesting WebXR session...');
        debugLog('Canvas ready:', {
            width: renderer.domElement.width,
            height: renderer.domElement.height,
            visible: renderer.domElement.style.visibility !== 'hidden'
        });
        
        // CRITICAL for iOS/Variant Launch: Give the SDK a moment to be fully ready
        // This prevents the SDK from trying to process session requests before it's initialized
        const platform = window.PlatformDetector?.detectPlatform?.() || { isIOS: false };
        if (platform.isIOS) {
            debugLog('iOS detected - waiting for Variant Launch SDK to be fully ready...');
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Ensure navigator.xr.requestSession exists and is a function
        if (typeof navigator.xr.requestSession !== 'function') {
            throw new Error('navigator.xr.requestSession is not available. The WebXR API may not be fully initialized.');
        }
        
        // Request session - don't require any specific reference space.
        // We'll request the reference space after session starts.
        //
        // IMPORTANT (UI VISIBILITY):
        // - Always attempt DOM overlay for both iOS and Android to keep HTML UI visible.
        // - Use dedicated overlay root (#xr-overlay) instead of document.body.
        // - If dom-overlay fails, retry without it (fallback ensures AR still works).
        //
        // Base options used everywhere
        const baseSessionOptions = {
            requiredFeatures: [], // Explicitly set to empty array to prevent SDK errors
            optionalFeatures: ['local', 'local-floor', 'hit-test', 'dom-overlay']
        };
        
        // Always attempt DOM overlay for both iOS and Android
        // Use the dedicated overlay root element
        const platformName = platform.isIOS ? 'iOS' : platform.isAndroid ? 'Android' : 'Other';
        debugLog(`Requesting session with dom-overlay (platform: ${platformName})`);
        
        let sessionOptionsToUse = {
            ...baseSessionOptions,
            domOverlay: { root: overlayRoot }
        };
        
        // Ensure the options object is properly structured and not null/undefined
        if (!sessionOptionsToUse || typeof sessionOptionsToUse !== 'object') {
            throw new Error('Session options object is invalid');
        }
        
        debugLog('Requesting session with options:', sessionOptionsToUse);
        
        // Wrap in try-catch to provide better error messages
        let triedDomOverlay = true;
        try {
            xrSession = await navigator.xr.requestSession('immersive-ar', sessionOptionsToUse);
            
            // Check if dom-overlay is actually active
            if (xrSession.enabledFeatures && xrSession.enabledFeatures.includes('dom-overlay')) {
                debugLog('DOM overlay active; HTML UI should be visible');
            } else {
                debugLog('DOM overlay requested but not enabled in session');
            }
        } catch (sessionError) {
            // If dom-overlay caused the failure, retry once without it
            if (
                triedDomOverlay &&
                (sessionError.name === 'NotSupportedError' ||
                 (sessionError.message && sessionError.message.includes('dom-overlay')) ||
                 (sessionError.message && sessionError.message.includes('domOverlay')))
            ) {
                console.warn('DOM overlay failed, retrying without dom-overlay');
                const fallbackOptions = {
                    ...baseSessionOptions,
                    optionalFeatures: baseSessionOptions.optionalFeatures.filter(f => f !== 'dom-overlay')
                };
                debugLog('Retrying session with options:', fallbackOptions);
                try {
                    xrSession = await navigator.xr.requestSession('immersive-ar', fallbackOptions);
                    console.warn('Session started without DOM overlay - HTML UI may not be visible in AR');
                    if (window.Toast) {
                        window.Toast.warning('DOM overlay not available. UI buttons may not appear in AR view.', 'Limited UI', 5000);
                    }
                } catch (fallbackError) {
                    // Fallback also failed, throw original error
                    throw sessionError;
                }
            } else {
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
        }

        debugLog('WebXR session started successfully');
        debugLog('Session features:', xrSession.enabledFeatures);
        debugLog('Session object:', xrSession);
        
        // Initialize auto-spawn state
        autoSpawnTimer = 0;
        hasAutoSpawned = false;
        autoSpawnTime = (3000 + Math.random() * 2000); // Random time between 3-5 seconds
        lastSpawnAttemptTime = 0;
        autoSpawnPosition = null;
        surfaceDetectionTime = 0;
        lastReticlePosition = null;
        
        if (window.Toast) {
            window.Toast.success('WebXR session started!', 'Session Active', 3000);
        }
        
        // Prevent overlay taps from triggering XR select events
        if (overlayRoot) {
            // Add beforexrselect listener to prevent XR select on overlay
            overlayRoot.addEventListener('beforexrselect', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            
            // Also prevent on the UI container
            if (overlayUI) {
                overlayUI.addEventListener('beforexrselect', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            }
            
            // Add click/touch handlers to buttons to stop propagation
            const resetButton = document.getElementById('reset-button');
            if (resetButton) {
                const stopPropagation = (e) => {
                    e.stopPropagation();
                };
                resetButton.addEventListener('click', stopPropagation);
                resetButton.addEventListener('touchstart', stopPropagation);
                resetButton.addEventListener('pointerdown', stopPropagation);
            }
            
            // Add click/touch handlers to quiz button to stop propagation and handle click
            const quizButton = document.getElementById('quiz-button');
            if (quizButton) {
                const stopPropagation = (e) => {
                    e.stopPropagation();
                };
                quizButton.addEventListener('click', stopPropagation);
                quizButton.addEventListener('touchstart', stopPropagation);
                quizButton.addEventListener('pointerdown', stopPropagation);
                
                // Add click handler for quiz button
                quizButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (window.WebXRAR && window.WebXRAR.exitToQuiz) {
                        window.WebXRAR.exitToQuiz();
                    }
                });
            }
            
            // Handle any close button if it exists
            const closeButton = document.getElementById('close-button');
            if (closeButton) {
                const stopPropagation = (e) => {
                    e.stopPropagation();
                };
                closeButton.addEventListener('click', stopPropagation);
                closeButton.addEventListener('touchstart', stopPropagation);
                closeButton.addEventListener('pointerdown', stopPropagation);
                
                // Close button returns to start screen
                closeButton.addEventListener('click', () => {
                    returnToStartScreen();
                });
            }
            
            debugLog('Overlay event handlers attached to prevent XR select');
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
        debugLog('Renderer connected to XR session');
        
        // Force an immediate render to ensure camera feed appears
        // This is especially important for iOS
        renderer.render(scene, camera);
        debugLog('Initial render completed');
        
        // Try different reference space types in order of preference
        const referenceSpaceTypes = ['local-floor', 'local', 'viewer'];
        
        for (const spaceType of referenceSpaceTypes) {
            try {
                xrReferenceSpace = await xrSession.requestReferenceSpace(spaceType);
                debugLog(`Reference space obtained: ${spaceType}`);
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
            // Only return to start screen if we're not exiting to quiz
            // (exitARToQuiz handles its own UI transitions)
            if (!isExitingToQuiz) {
                returnToStartScreen();
            }
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
        // Remove any existing listener first to avoid duplicates
        if (window.removeEventListener && onWindowResize) {
            window.removeEventListener('resize', onWindowResize);
        }
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
    console.log(`Creating content for surface type: ${surfaceType}`);
    
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
    
    cubeMesh = null;
    wireModel = null;
    puddleModel = null;
    placedSurfaceType = surfaceType;
    
    // Track model type for quiz system
    // Note: Using 'green-cube' for floor to maintain quiz system compatibility
    // (even though we're now loading puddle.glb instead of a green cube)
    currentModelType = surfaceType === 'wall' ? 'wire-model' : 'green-cube';
    
    if (surfaceType === 'wall') {
        // Load wire.glb for walls - using bouncing-band pattern
        console.log('Loading wire.glb for wall surface...');
        
        if (window.Toast) {
            window.Toast.info('Loading wire model...', 'Loading', 2000);
        }
        
        try {
            // Initialize the loader if not already done
            if (!gltfLoader) {
                gltfLoader = initGLTFLoader();
            }
            
            if (!gltfLoader) {
                throw new Error('GLTFLoader not available - check that Three.js and GLTFLoader scripts are loaded');
            }
            
            console.log('=== WIRE.GLB LOADING START ===');
            console.log('Using loadModel() function (bouncing-band pattern)');
            
            // Use the loadModel function (bouncing-band pattern)
            const gltf = await loadModel('/assets/wire.glb');
            
            console.log('=== WIRE.GLB LOADED SUCCESSFULLY ===');
            console.log('GLTF object:', gltf);
            console.log('Scene children count:', gltf.scene ? gltf.scene.children.length : 0);
            
            // Clone the scene so each spawn gets a fresh copy with reset rotation
            wireModel = gltf.scene.clone();
            
            if (!wireModel) {
                throw new Error('gltf.scene is null or undefined');
            }
            
            // Calculate bounding box to understand model size
            const box = new THREE.Box3().setFromObject(wireModel);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            console.log('Model bounding box size:', size);
            console.log('Model center:', center);
            
            // Reset position and scale for fresh spawn
            // Don't reset rotation - preserve model's original rotation from GLB file
            wireModel.position.set(0, 0, 0);
            wireModel.scale.set(1, 1, 1);
            
            // Auto-scale model - similar to bouncing-band's approach
            const maxDimension = Math.max(size.x, size.y, size.z);
            if (maxDimension > 0) {
                const targetSize = 0.3; // Target 30cm for largest dimension
                const scaleFactor = (targetSize / maxDimension) * 0.7; // Scale down to 0.7x size
                wireModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
                console.log(`Auto-scaled model by factor: ${scaleFactor.toFixed(2)}`);
            } else {
                wireModel.scale.set(1, 1, 1);
            }
            
            // Center the model
            wireModel.position.sub(center.multiplyScalar(wireModel.scale.x));
            
            // Make sure model is visible
            wireModel.visible = true;
            wireModel.traverse((child) => {
                if (child.isMesh) {
                    child.visible = true;
                }
            });
            
            contentGroup.add(wireModel);
            console.log('=== WIRE.GLB ADDED TO SCENE ===');
            
            if (window.Toast) {
                window.Toast.success('Wire model placed!', 'Success', 3000);
            }
        } catch (error) {
            console.error('=== FAILED TO LOAD WIRE.GLB ===');
            console.error('Error:', error?.message || String(error));
            
            if (window.Toast) {
                window.Toast.error(`Failed to load wire model: ${error?.message || 'Unknown error'}`, 'Load Error', 6000);
            }
            
            console.log('Falling back to orange box for wall');
            createWallPlaceholder();
        }
    } else {
        // Load puddle.glb for floors - using bouncing-band pattern
        console.log('Loading puddle.glb for floor surface...');
        
        if (window.Toast) {
            window.Toast.info('Loading puddle model...', 'Loading', 2000);
        }
        
        try {
            // Initialize the loader if not already done
            if (!gltfLoader) {
                gltfLoader = initGLTFLoader();
            }
            
            if (!gltfLoader) {
                throw new Error('GLTFLoader not available - check that Three.js and GLTFLoader scripts are loaded');
            }
            
            console.log('=== PUDDLE.GLB LOADING START ===');
            console.log('Using loadModel() function (bouncing-band pattern)');
            
            // Use the loadModel function (bouncing-band pattern)
            const gltf = await loadModel('/assets/puddle.glb');
            
            console.log('=== PUDDLE.GLB LOADED SUCCESSFULLY ===');
            console.log('GLTF object:', gltf);
            console.log('Scene children count:', gltf.scene ? gltf.scene.children.length : 0);
            
            // Clone the scene so each spawn gets a fresh copy with reset rotation
            puddleModel = gltf.scene.clone();
            
            if (!puddleModel) {
                throw new Error('gltf.scene is null or undefined');
            }
            
            // Calculate bounding box to understand model size
            const box = new THREE.Box3().setFromObject(puddleModel);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            console.log('Model bounding box size:', size);
            console.log('Model center:', center);
            
            // Reset position and scale for fresh spawn
            // Don't reset rotation - preserve model's original rotation from GLB file
            puddleModel.position.set(0, 0, 0);
            puddleModel.scale.set(1, 1, 1);
            
            // Auto-scale model - make it larger for floor visibility
            const maxDimension = Math.max(size.x, size.y, size.z);
            if (maxDimension > 0) {
                const targetSize = 0.5; // Target 50cm for largest dimension (larger than wire model for floor visibility)
                const scaleFactor = targetSize / maxDimension;
                puddleModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
                console.log(`Auto-scaled puddle model by factor: ${scaleFactor.toFixed(2)}`);
                console.log(`Puddle model target size: ${targetSize}m, original max dimension: ${maxDimension.toFixed(3)}m`);
            } else {
                puddleModel.scale.set(1, 1, 1);
            }
            
            // Position the model on the floor surface
            // First center the model (same as wire model)
            puddleModel.position.sub(center.multiplyScalar(puddleModel.scale.x));
            
            // Then adjust Y position so the model sits on the floor
            // The model is now centered, but we need to move it so the bottom is at Y=0
            // Calculate the bottom of the bounding box after scaling
            const scaledSize = size.clone().multiplyScalar(puddleModel.scale.x);
            // The current position.y is the center, so move down by half the height
            // Then add a small offset to ensure visibility above floor
            const floorOffset = 0.01; // 1cm above floor
            puddleModel.position.y = scaledSize.y / 2 + floorOffset;
            
            console.log('Puddle model position:', puddleModel.position);
            console.log('Puddle model scale:', puddleModel.scale);
            console.log('Puddle model scaled size:', scaledSize);
            
            // Make sure model is visible and materials are properly set
            puddleModel.visible = true;
            puddleModel.traverse((child) => {
                if (child.isMesh) {
                    child.visible = true;
                    // Ensure materials are not transparent and are visible
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat) {
                                    mat.transparent = false;
                                    mat.opacity = 1.0;
                                    mat.visible = true;
                                }
                            });
                        } else {
                            child.material.transparent = false;
                            child.material.opacity = 1.0;
                            child.material.visible = true;
                        }
                    }
                }
            });
            
            contentGroup.add(puddleModel);
            console.log('=== PUDDLE.GLB ADDED TO SCENE ===');
            console.log('ContentGroup children count:', contentGroup.children.length);
            console.log('ContentGroup visible:', contentGroup.visible);
            console.log('PuddleModel visible:', puddleModel.visible);
            
            // Verify final bounding box after all transformations
            const finalBox = new THREE.Box3().setFromObject(puddleModel);
            const finalSize = finalBox.getSize(new THREE.Vector3());
            const finalCenter = finalBox.getCenter(new THREE.Vector3());
            console.log('Final puddle model bounding box size:', finalSize);
            console.log('Final puddle model bounding box center:', finalCenter);
            
            if (window.Toast) {
                window.Toast.success('Puddle model placed!', 'Success', 3000);
            }
        } catch (error) {
            console.error('=== FAILED TO LOAD PUDDLE.GLB ===');
            console.error('Error:', error?.message || String(error));
            
            if (window.Toast) {
                window.Toast.error(`Failed to load puddle model: ${error?.message || 'Unknown error'}`, 'Load Error', 6000);
            }
            
            console.log('Falling back to green box for floor');
            createGreenBox();
        }
    }
}

/**
 * Creates an orange box as placeholder for walls (when wire.glb fails to load)
 */
function createWallPlaceholder() {
    console.log('=== CREATING WALL PLACEHOLDER (ORANGE BOX) ===');
    console.log('This means wire.glb failed to load or GLTFLoader is not available');
    
    const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.02); // Flatter box for wall
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff6b35, // Orange color for wall
        metalness: 0.3,
        roughness: 0.6
    });
    cubeMesh = new THREE.Mesh(geometry, material);
    cubeMesh.position.set(0, 0, 0);
    cubeMesh.visible = true;
    contentGroup.add(cubeMesh);
    
    console.log('Orange wall placeholder created and added to contentGroup');
    console.log('Content group visible:', contentGroup.visible);
    console.log('Content group children count:', contentGroup.children.length);
    
    if (window.Toast) {
        window.Toast.warning('Using placeholder instead of wire.glb', 'Model Not Loaded', 4000);
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

/**
 * Checks if user is too far from the auto-spawned model
 * @param {THREE.Vector3} userPosition - Current user/camera position
 * @returns {boolean} True if user is too far from spawn location
 */
function checkUserDistanceFromSpawn(userPosition) {
    if (!autoSpawnPosition || !userPosition) {
        return false;
    }
    
    const distance = userPosition.distanceTo(autoSpawnPosition);
    return distance > autoSpawnDistance;
}

/**
 * Infers surface type based on camera gaze direction
 * Looking mostly horizontal = wall, looking down = floor
 * @returns {string} 'wall' or 'floor'
 */
function inferSurfaceTypeFromGaze(direction) {
    // direction.y indicates vertical component:
    // - Near 0 = looking horizontally (wall)
    // - Negative = looking down (floor)
    // - Positive = looking up (ceiling)
    const lookingDownThreshold = -0.3; // Looking down more than ~17 degrees
    const lookingHorizontalThreshold = 0.3; // Looking within ~17 degrees of horizontal
    
    if (direction.y > lookingDownThreshold && direction.y < lookingHorizontalThreshold) {
        // Looking mostly horizontal - likely aiming at a wall
        return 'wall';
    } else if (direction.y <= lookingDownThreshold) {
        // Looking down - likely aiming at floor
        return 'floor';
    } else {
        // Looking up - default to wall (ceiling could work too)
        return 'wall';
    }
}

function setupTapToPlace() {
    if (!xrSession) return;
    
    xrSession.addEventListener('select', async () => {
        // If we have a visible reticle (hit-test result), always (re)place the
        // content at that location and choose the asset based on the currently
        // detected surface type. This allows:
        // - First tap on a wall → spawn wire.glb
        // - Second tap on the floor → replace with green cube
        if (reticle.visible && currentSurfaceType) {
            // Create appropriate content based on detected surface type
            await createContentForSurface(currentSurfaceType);
            
            // CRITICAL: Reset all transforms before applying new ones
            // This ensures each spawn starts fresh and doesn't retain previous rotation
            contentGroup.position.set(0, 0, 0);
            contentGroup.rotation.set(0, 0, 0);
            contentGroup.scale.set(1, 1, 1);
            contentGroup.quaternion.set(0, 0, 0, 1); // Reset quaternion to identity
            contentGroup.matrix.identity();
            
            // CRITICAL: Copy the reticle's matrix directly to ensure perfect alignment
            // The reticle is already correctly oriented with the detected surface
            contentGroup.matrix.copy(reticle.matrix);
            
            // Extract position and rotation from the matrix
            contentGroup.position.setFromMatrixPosition(reticle.matrix);
            
            // Extract quaternion from reticle matrix to ensure exact same orientation
            const reticleQuaternion = new THREE.Quaternion();
            reticleQuaternion.setFromRotationMatrix(reticle.matrix);
            contentGroup.quaternion.copy(reticleQuaternion);
            
            // For wall surfaces, rotate the content 90 degrees upward to face outward from the wall
            // The model is currently facing downward, so we rotate around X-axis
            if (currentSurfaceType === 'wall') {
                const upwardRotation = new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(1, 0, 0),
                  -Math.PI / 2
                );
              
                // apply AFTER current orientation (local space)
                contentGroup.quaternion.multiply(upwardRotation);
              }
            
            contentGroup.matrixAutoUpdate = true;
            contentGroup.visible = true;
            isAnchored = true;
            console.log(`Content placed at detected surface (${currentSurfaceType})`);
            return;
        }
        
        // Fallback: If hit-test didn't detect a surface (e.g., looking at a wall
        // on devices that only support floor detection), place content in front
        // of camera and infer surface type from gaze direction
        const frame = renderer.xr.getFrame();
        if (frame) {
            const pose = frame.getViewerPose(xrReferenceSpace);
            if (pose && pose.views && pose.views.length > 0) {
                const view = pose.views[0];
                // Get camera position and direction
                const matrix = new THREE.Matrix4().fromArray(view.transform.matrix);
                const position = new THREE.Vector3();
                const direction = new THREE.Vector3(0, 0, -1);
                
                position.setFromMatrixPosition(matrix);
                direction.applyMatrix4(matrix);
                direction.sub(position).normalize();
                
                // Infer surface type from where the camera is pointing
                const inferredSurfaceType = inferSurfaceTypeFromGaze(direction);
                console.log(`No hit-test result - inferring surface type from gaze: ${inferredSurfaceType}`);
                console.log(`Camera direction: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})`);
                
                // Create content for inferred surface type
                await createContentForSurface(inferredSurfaceType);
                
                // Place at distance in front of camera
                const placementDistance = 1.0; // 1 meter
                const targetPosition = new THREE.Vector3();
                targetPosition.copy(position);
                targetPosition.addScaledVector(direction, placementDistance);
                
                // Adjust vertical position based on surface type
                if (inferredSurfaceType === 'floor') {
                    // Lower content to approximate floor level
                    targetPosition.y = position.y - 1.0; // Assume ~1m below camera is floor
                }
                // For walls, keep at the aimed position
                
                // Set position and make model face camera direction
                contentGroup.position.copy(targetPosition);
                contentGroup.lookAt(position); // Face towards camera
                contentGroup.matrixAutoUpdate = true;
                contentGroup.visible = true;
                isAnchored = true;
                console.log(`Content placed in front of camera as ${inferredSurfaceType}`);
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
        debugLog('WebXR render loop started - first frame rendered');
        if (window.Toast) {
            window.Toast.success('First frame rendered!', 'Render Loop Active', 2000);
        }
    } else if (frameCount <= 5 || frameCount % 300 === 0) {
        debugLog('WebXR render loop active - frame:', frameCount, 'hasFrame:', !!frame);
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
                        debugLog('Surface type detected:', surfaceType);
                        // Reset stability tracking when surface type changes
                        surfaceDetectionTime = 0;
                        lastReticlePosition = null;
                    }
                    
                    updateReticleAppearance(surfaceType);
                    
                    reticle.visible = debugMode; // Only show reticle in debug mode
                    reticle.matrix.fromArray(hitPose.transform.matrix);
                    reticle.matrixAutoUpdate = false; // Ensure this is set correctly
                    
                    // Track surface stability for auto-spawn
                    const currentReticlePosition = new THREE.Vector3();
                    currentReticlePosition.setFromMatrixPosition(reticle.matrix);
                    
                    if (lastReticlePosition === null) {
                        // First detection of this surface
                        surfaceDetectionTime = timestamp;
                        lastReticlePosition = currentReticlePosition.clone();
                    } else {
                        // Check if reticle position is stable (hasn't moved much)
                        const positionChange = currentReticlePosition.distanceTo(lastReticlePosition);
                        if (positionChange > reticleStabilityThreshold) {
                            // Position changed significantly - reset stability timer
                            surfaceDetectionTime = timestamp;
                            lastReticlePosition = currentReticlePosition.clone();
                        } else {
                            // Position is stable - update last position but keep detection time
                            lastReticlePosition = currentReticlePosition.clone();
                        }
                    }
                }
            } else {
                reticle.visible = false;
                currentSurfaceType = null;
                // Reset stability tracking when no surface detected
                surfaceDetectionTime = 0;
                lastReticlePosition = null;
            }
        } catch (error) {
            // Hit-test might fail occasionally, just hide reticle
            console.warn('Hit-test error:', error);
            reticle.visible = false;
            currentSurfaceType = null;
        }
    } else if (!isAnchored) {
        // Hit-test available but no surface detected (e.g., looking at wall on device
        // that only supports floor detection), OR no hit-test available at all.
        // Show a "tap anyway" reticle in front of camera
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
            reticle.visible = debugMode; // Only show reticle in debug mode
            reticle.matrixAutoUpdate = true;
            
            // Infer surface type from gaze direction for reticle appearance
            const inferredType = inferSurfaceTypeFromGaze(direction);
            updateReticleAppearance(inferredType);
            
            // Update currentSurfaceType so tap handler knows what we're aiming at
            // But set it to null so tap handler uses inference instead of hit-test
            currentSurfaceType = null;
            // Reset stability tracking when using fallback reticle (no hit-test)
            surfaceDetectionTime = 0;
            lastReticlePosition = null;
        }
    }

    // Auto-spawn logic: spawn model after 3-5 seconds based on user gaze
    if (!isAnchored && xrSession) {
        const pose = frame.getViewerPose(xrReferenceSpace);
        if (pose && pose.views && pose.views.length > 0) {
            const view = pose.views[0];
            const matrix = new THREE.Matrix4().fromArray(view.transform.matrix);
            const cameraPosition = new THREE.Vector3();
            const cameraDirection = new THREE.Vector3(0, 0, -1);
            
            cameraPosition.setFromMatrixPosition(matrix);
            cameraDirection.applyMatrix4(matrix);
            cameraDirection.sub(cameraPosition).normalize();
            
            // Update auto-spawn timer
            if (autoSpawnTimer === 0) {
                autoSpawnTimer = timestamp;
            }
            
            const elapsedTime = timestamp - autoSpawnTimer;
            
            // Check if user is too far from previous spawn (if one exists)
            const isTooFar = hasAutoSpawned && checkUserDistanceFromSpawn(cameraPosition);
            const canSpawnAgain = isTooFar && (timestamp - lastSpawnAttemptTime > spawnCooldown);
            
            // Check if surface is stable (detected and stable for required duration)
            const surfaceStable = currentSurfaceType !== null && 
                                 surfaceDetectionTime > 0 && 
                                 (timestamp - surfaceDetectionTime) >= surfaceStabilityDuration;
            
            // Auto-spawn if:
            // 1. Haven't spawned yet AND time has elapsed (3-5 seconds) AND surface is stable
            // 2. OR user is too far from previous spawn and cooldown has passed AND surface is stable
            const shouldSpawn = ((!hasAutoSpawned && elapsedTime >= autoSpawnTime) || canSpawnAgain) && surfaceStable;
            
            if (shouldSpawn) {
                // Use reticle position/orientation if available (even if invisible)
                // This ensures correct orientation matching tap-to-place behavior
                let useReticle = false;
                let spawnSurfaceType = null;
                
                // Check if reticle has valid matrix (it's updated even when invisible)
                // Only use reticle if we have a detected surface (not fallback)
                if (reticle && reticle.matrix && currentSurfaceType && lastReticlePosition !== null) {
                    // Verify reticle matrix is not identity (has been set by hit-test)
                    const reticlePos = new THREE.Vector3();
                    reticlePos.setFromMatrixPosition(reticle.matrix);
                    // If reticle position is not at origin, it's been set by hit-test
                    if (reticlePos.lengthSq() > 0.01) {
                        useReticle = true;
                        spawnSurfaceType = currentSurfaceType;
                    }
                }
                
                // Only spawn if we have a stable detected surface
                if (!spawnSurfaceType) {
                    // If we don't have a stable surface, don't spawn (wait for stable detection)
                    debugLog('Auto-spawn skipped: no stable surface detected');
                    return; // Exit early - don't spawn
                }
                
                // Create and place content using reticle matrix (like tap-to-place)
                (async () => {
                    try {
                        await createContentForSurface(spawnSurfaceType);
                        
                        // CRITICAL: Reset all transforms before applying new ones
                        // This ensures each spawn starts fresh and doesn't retain previous rotation
                        contentGroup.position.set(0, 0, 0);
                        contentGroup.rotation.set(0, 0, 0);
                        contentGroup.scale.set(1, 1, 1);
                        contentGroup.quaternion.set(0, 0, 0, 1);
                        contentGroup.matrix.identity();
                        
                        if (useReticle && reticle && reticle.matrix) {
                            // Use reticle matrix directly (same as tap-to-place)
                            // This ensures perfect alignment with the detected surface
                            contentGroup.matrix.copy(reticle.matrix);
                            
                            // Extract position and rotation from the matrix
                            contentGroup.position.setFromMatrixPosition(reticle.matrix);
                            
                            // Extract quaternion from reticle matrix to ensure exact same orientation
                            const reticleQuaternion = new THREE.Quaternion();
                            reticleQuaternion.setFromRotationMatrix(reticle.matrix);
                            contentGroup.quaternion.copy(reticleQuaternion);
                            
                            // For wall surfaces, rotate the content 90 degrees upward to face outward from the wall
                            if (spawnSurfaceType === 'wall') {
                                const upwardRotation = new THREE.Quaternion().setFromAxisAngle(
                                    new THREE.Vector3(1, 0, 0),
                                    -Math.PI / 2
                                );
                                // apply AFTER current orientation (local space)
                                contentGroup.quaternion.multiply(upwardRotation);
                            }
                            
                            // Store spawn position for distance checking
                            autoSpawnPosition = contentGroup.position.clone();
                        } else {
                            // Fallback: place in front of camera (no hit-test available)
                            const placementDistance = 1.0; // 1 meter
                            const spawnPosition = new THREE.Vector3();
                            spawnPosition.copy(cameraPosition);
                            spawnPosition.addScaledVector(cameraDirection, placementDistance);
                            
                            // Adjust vertical position based on surface type
                            if (spawnSurfaceType === 'floor') {
                                spawnPosition.y = cameraPosition.y - 1.0; // Assume ~1m below camera is floor
                            }
                            
                            // Position content at spawn location
                            contentGroup.position.copy(spawnPosition);
                            
                            // For wall surfaces, rotate to face outward
                            if (spawnSurfaceType === 'wall') {
                                // Make model face camera direction
                                contentGroup.lookAt(cameraPosition);
                                // Rotate 90 degrees upward to face outward from wall
                                const upwardRotation = new THREE.Quaternion().setFromAxisAngle(
                                    new THREE.Vector3(1, 0, 0),
                                    -Math.PI / 2
                                );
                                contentGroup.quaternion.multiply(upwardRotation);
                            } else {
                                // For floor, just face camera
                                contentGroup.lookAt(cameraPosition);
                            }
                            
                            // Store spawn position for distance checking
                            autoSpawnPosition = spawnPosition.clone();
                        }
                        
                        contentGroup.matrixAutoUpdate = true;
                        contentGroup.visible = true;
                        isAnchored = true;
                        hasAutoSpawned = true;
                        lastSpawnAttemptTime = timestamp;
                        
                        debugLog(`Auto-spawned ${spawnSurfaceType} model using ${useReticle ? 'reticle' : 'fallback'} placement`);
                    } catch (error) {
                        console.error('Error during auto-spawn:', error);
                    }
                })();
            }
        }
    }

    // Animate the cube (only if it's a cube, not wire model or puddle model)
    if (cubeMesh && isAnchored) {
        animationTime = timestamp * 0.001;
        cubeMesh.rotation.y = animationTime;
        cubeMesh.rotation.x = animationTime * 0.5;
    }
    
    // Wire model and puddle model stay static (no rotation)

    // Update gaze detection
    if (isAnchored) {
        updateGazeDetection(frame, timestamp);
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
// GAZE DETECTION
// ============================================================================

/**
 * Checks if the user is looking at the 3D model
 * Uses raycasting from camera center with angle threshold
 * @param {XRFrame} frame - Current XR frame
 * @returns {boolean} True if user is gazing at the model
 */
function checkGazeAtModel(frame) {
    if (!isAnchored || !contentGroup || !contentGroup.visible) {
        return false;
    }

    if (!frame || !xrReferenceSpace) {
        return false;
    }

    try {
        const pose = frame.getViewerPose(xrReferenceSpace);
        if (!pose || !pose.views || pose.views.length === 0) {
            return false;
        }

        const view = pose.views[0];
        const viewMatrix = new THREE.Matrix4().fromArray(view.transform.matrix);
        
        // Get camera position and forward direction
        const cameraPosition = new THREE.Vector3();
        const cameraForward = new THREE.Vector3(0, 0, -1);
        cameraPosition.setFromMatrixPosition(viewMatrix);
        cameraForward.applyMatrix4(viewMatrix);
        cameraForward.sub(cameraPosition).normalize();

        // Get model center position in world space
        contentGroup.updateMatrixWorld(true);
        const modelCenter = new THREE.Vector3();
        contentGroup.getWorldPosition(modelCenter);

        // Calculate direction from camera to model
        const toModel = new THREE.Vector3();
        toModel.subVectors(modelCenter, cameraPosition);
        const distance = toModel.length();
        
        // Check if model is too far (optional - can adjust threshold)
        if (distance > 5.0) {
            return false;
        }
        
        toModel.normalize();

        // Calculate angle between camera forward and direction to model
        const angle = Math.acos(THREE.MathUtils.clamp(cameraForward.dot(toModel), -1, 1));

        // Check if model is within angle threshold
        if (angle > GAZE_ANGLE_THRESHOLD) {
            return false;
        }

        // Check if model is in front of camera (not behind)
        if (cameraForward.dot(toModel) < 0) {
            return false;
        }

        // Initialize raycaster if needed
        if (!raycaster && typeof THREE !== 'undefined') {
            raycaster = new THREE.Raycaster();
        }

        if (raycaster) {
            // Perform raycast to check if model is actually visible (not occluded)
            raycaster.set(cameraPosition, toModel);
            const intersects = raycaster.intersectObject(contentGroup, true);
            
            // If raycast hits the model, user is looking at it
            return intersects.length > 0;
        }

        // Fallback: if raycaster not available, just check angle
        return true;
    } catch (error) {
        console.warn('Gaze detection error:', error);
        return false;
    }
}

/**
 * Updates gaze timer and button visibility
 * @param {XRFrame} frame - Current XR frame
 * @param {number} timestamp - Current timestamp
 */
function updateGazeDetection(frame, timestamp) {
    if (!isAnchored || !currentModelType) {
        // Reset gaze if no model is placed
        gazeTimer = 0;
        isGazingAtModel = false;
        hideQuizButton();
        return;
    }

    const deltaTime = lastGazeCheckTime > 0 ? timestamp - lastGazeCheckTime : 16; // ~60fps default
    lastGazeCheckTime = timestamp;

    const isGazing = checkGazeAtModel(frame);

    if (isGazing) {
        if (!isGazingAtModel) {
            // Just started gazing
            isGazingAtModel = true;
            gazeTimer = 0;
        }
        gazeTimer += deltaTime;

        // Show button after threshold
        if (gazeTimer >= GAZE_THRESHOLD_MS) {
            showQuizButton();
        }
    } else {
        // Not gazing - reset timer
        if (isGazingAtModel) {
            isGazingAtModel = false;
            gazeTimer = 0;
            hideQuizButton();
        }
    }
}

/**
 * Shows the quiz button
 */
function showQuizButton() {
    const quizButton = document.getElementById('quiz-button');
    if (quizButton) {
        // Ensure button is in overlay UI for iOS WebXR
        if (overlayUI && quizButton.parentElement !== overlayUI) {
            overlayUI.appendChild(quizButton);
            debugLog('Quiz button moved to overlay UI');
        }
        quizButton.classList.remove('hidden');
    }
}


/**
 * Hides the quiz button
 */
function hideQuizButton() {
    const quizButton = document.getElementById('quiz-button');
    if (quizButton) {
        quizButton.classList.add('hidden');
    }
}

/**
 * Exits AR and shows quiz view
 */
async function exitARToQuiz() {
    if (!currentModelType) {
        console.warn('No model type available for quiz');
        return;
    }

    // Store model type before ending session (session end event will reset it)
    const modelTypeForQuiz = currentModelType;

    // Set flag to prevent returnToStartScreen from being called
    isExitingToQuiz = true;

    // Hide quiz button
    hideQuizButton();

    // End XR session
    if (xrSession) {
        xrSession.end();
        xrSession = null;
    }

    // Stop render loop
    if (renderer && renderer.setAnimationLoop) {
        renderer.setAnimationLoop(null);
    }

    // Show quiz view using the stored model type
    if (window.QuizSystem && window.QuizSystem.showQuiz) {
        try {
            await window.QuizSystem.showQuiz(modelTypeForQuiz);
        } catch (error) {
            console.error('Error showing quiz:', error);
            // Reset flag if quiz failed to show
            isExitingToQuiz = false;
        }
    } else {
        console.error('QuizSystem not available');
        // Reset flag if quiz system is not available
        isExitingToQuiz = false;
    }
}

// ============================================================================
// CLEANUP & RESOURCE MANAGEMENT
// ============================================================================

/**
 * Comprehensive cleanup function to dispose of all resources and reset state
 * This prevents memory leaks and ensures a clean state when closing AR
 */
function cleanupARResources() {
    console.log('Cleaning up AR resources...');
    
    // Stop render loop first
    if (renderer && renderer.setAnimationLoop) {
        renderer.setAnimationLoop(null);
    }
    
    // Clean up content group and all spawned objects
    if (contentGroup) {
        contentGroup.visible = false;
        
        // Reset transform
        contentGroup.position.set(0, 0, 0);
        contentGroup.rotation.set(0, 0, 0);
        contentGroup.scale.set(1, 1, 1);
        contentGroup.matrix.identity();
        contentGroup.matrixAutoUpdate = true;
        
        // Dispose all children and their resources
        while (contentGroup.children.length > 0) {
            const child = contentGroup.children[0];
            contentGroup.remove(child);
            
            // Dispose geometry
            if (child.geometry) {
                child.geometry.dispose();
            }
            
            // Dispose material(s)
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        if (mat) mat.dispose();
                    });
                } else {
                    child.material.dispose();
                }
            }
            
            // Traverse and dispose all nested objects
            if (child.traverse) {
                child.traverse((obj) => {
                    if (obj.geometry) {
                        obj.geometry.dispose();
                    }
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(mat => {
                                if (mat) mat.dispose();
                            });
                        } else {
                            obj.material.dispose();
                        }
                    }
                    // Dispose textures if they exist
                    if (obj.material && obj.material.map) {
                        obj.material.map.dispose();
                    }
                    if (obj.material && obj.material.normalMap) {
                        obj.material.normalMap.dispose();
                    }
                    if (obj.material && obj.material.emissiveMap) {
                        obj.material.emissiveMap.dispose();
                    }
                });
            }
            
            // Call dispose if available
            if (child.dispose && typeof child.dispose === 'function') {
                try {
                    child.dispose();
                } catch (e) {
                    console.warn('Error disposing child:', e);
                }
            }
        }
        
        console.log('Content group cleaned up');
    }
    
    // Clean up reticle
    if (reticle) {
        reticle.visible = false;
        reticle.position.set(0, 0, 0);
        reticle.rotation.set(0, 0, 0);
        reticle.scale.set(1, 1, 1);
        reticle.matrix.identity();
    }
    
    // Reset model references (these are clones, so they're already disposed above)
    cubeMesh = null;
    wireModel = null;
    puddleModel = null;
    
    // Reset all state variables
    isAnchored = false;
    placedSurfaceType = null;
    currentSurfaceType = null;
    currentModelType = null;
    isExitingToQuiz = false;
    
    // Reset gaze detection
    gazeTimer = 0;
    isGazingAtModel = false;
    lastGazeCheckTime = 0;
    
    // Reset auto-spawn state
    autoSpawnTimer = 0;
    hasAutoSpawned = false;
    autoSpawnTime = 0;
    lastSpawnAttemptTime = 0;
    autoSpawnPosition = null;
    surfaceDetectionTime = 0;
    lastReticlePosition = null;
    
    // Reset animation time
    animationTime = 0;
    
    // Clean up XR resources
    xrHitTestSource = null;
    xrReferenceSpace = null;
    
    console.log('AR resources cleaned up');
}

// ============================================================================
// RETURN TO START SCREEN
// ============================================================================

/**
 * Returns to the start screen by ending the AR session and showing the start button
 */
function returnToStartScreen() {
    console.log('Returning to start screen...');
    
    // Comprehensive cleanup of all AR resources
    cleanupARResources();
    
    // End XR session if still active
    if (xrSession) {
        try {
            xrSession.end();
        } catch (e) {
            console.warn('Error ending session:', e);
        }
        xrSession = null;
    }
    
    // Show start button and logo
    const startButton = document.getElementById('start-button');
    const logoContainer = document.getElementById('logo-container');
    if (startButton) {
        startButton.disabled = false;
        startButton.textContent = 'Start AR';
        startButton.classList.remove('hidden');
    }
    if (logoContainer) {
        logoContainer.classList.remove('hidden');
    }
    
    // Hide reset button and close button
    const resetButton = document.getElementById('reset-button');
    const closeButton = document.getElementById('close-button');
    if (resetButton) {
        resetButton.classList.add('hidden');
    }
    if (closeButton) {
        closeButton.classList.add('hidden');
    }
    
    // Hide quiz button
    hideQuizButton();
    
    // Hide webxr instruction
    const instruction = document.getElementById('webxr-instruction');
    if (instruction) {
        instruction.classList.add('hidden');
    }
    
    console.log('Returned to start screen');
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
            // Also reset position, rotation, and matrix to ensure it's not visible
            contentGroup.position.set(0, 0, 0);
            contentGroup.rotation.set(0, 0, 0);
            contentGroup.scale.set(1, 1, 1);
            contentGroup.matrix.identity();
            contentGroup.matrixAutoUpdate = true;
        
        // Clear all children with proper resource disposal
        while (contentGroup.children.length > 0) {
            const child = contentGroup.children[0];
            contentGroup.remove(child);
            
            // Dispose geometry
            if (child.geometry) {
                child.geometry.dispose();
            }
            
            // Dispose material(s)
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => {
                        if (mat) mat.dispose();
                    });
                } else {
                    child.material.dispose();
                }
            }
            
            // Traverse and dispose all nested objects including textures
            if (child.traverse) {
                child.traverse((obj) => {
                    if (obj.geometry) {
                        obj.geometry.dispose();
                    }
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(mat => {
                                if (mat) mat.dispose();
                            });
                        } else {
                            obj.material.dispose();
                        }
                    }
                    // Dispose textures if they exist
                    if (obj.material && obj.material.map) {
                        obj.material.map.dispose();
                    }
                    if (obj.material && obj.material.normalMap) {
                        obj.material.normalMap.dispose();
                    }
                    if (obj.material && obj.material.emissiveMap) {
                        obj.material.emissiveMap.dispose();
                    }
                });
            }
            
            // Call dispose if available
            if (child.dispose && typeof child.dispose === 'function') {
                try {
                    child.dispose();
                } catch (e) {
                    console.warn('Error disposing child:', e);
                }
            }
        }
        
        console.log('Content group cleared and position reset');
    }
    
    // Reset references
    cubeMesh = null;
    wireModel = null;
    puddleModel = null;
    currentModelType = null;
    
    // Reset gaze detection
    gazeTimer = 0;
    isGazingAtModel = false;
    hideQuizButton();
    
    // Reset auto-spawn state
    autoSpawnTimer = 0;
    hasAutoSpawned = false;
    autoSpawnTime = (3000 + Math.random() * 2000); // Random time between 3-5 seconds
    lastSpawnAttemptTime = 0;
    autoSpawnPosition = null;
    surfaceDetectionTime = 0;
    lastReticlePosition = null;
    
    // Reset reticle state properly
    if (xrHitTestSource) {
        // When hit-test is available, use matrix updates from hit-test
        reticle.matrixAutoUpdate = false;
        reticle.visible = debugMode; // Only show reticle in debug mode
        // Reset surface type so it will be detected again
        currentSurfaceType = null;
    } else {
        // When no hit-test, use position-based updates
        reticle.matrixAutoUpdate = true;
        reticle.visible = debugMode; // Only show reticle in debug mode
        // Default to floor appearance
        updateReticleAppearance('floor');
    }
    
    debugLog('Anchor reset complete - isAnchored:', isAnchored, 'contentGroup.visible:', contentGroup ? contentGroup.visible : 'N/A');
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.WebXRAR = {
        init: initWebXR,
        reset: resetAnchor,
        isAnchored: () => isAnchored,
        exitToQuiz: exitARToQuiz,
        getCurrentModelType: () => currentModelType,
        debugMode: () => debugMode,
        setDebugMode: (enabled) => { debugMode = enabled; },
        _scriptLoaded: true,
        _loaded: true,
        _loadTime: Date.now()
    };
}

// Quiz button click handler will be set up after overlay is created
// The handler is attached in the ensureOverlayRoot section where other button handlers are set up
