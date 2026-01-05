// WebXR + Three.js AR Application with Image Tracking
// Provides true world-space anchoring on Android devices

// ============================================================================
// EXPORT IMMEDIATELY (so module is available even if init fails)
// ============================================================================
// CRITICAL: This must be the FIRST executable code in this file
// Multiple export attempts to ensure it works even if one fails
// Use both dot notation and bracket notation for maximum compatibility

// Primary export attempt
try {
    if (typeof window !== 'undefined') {
        window.WebXRAR = window.WebXRAR || {};
        window.WebXRAR.init = window.WebXRAR.init || null;
        window.WebXRAR.reset = window.WebXRAR.reset || null;
        window.WebXRAR.isAnchored = window.WebXRAR.isAnchored || (function() { return false; });
        window.WebXRAR._scriptLoaded = true;
        window.WebXRAR._scriptLoadTime = Date.now();
    }
} catch(e) {
    // Fallback 1: Bracket notation
    try {
        if (typeof window !== 'undefined') {
            window['WebXRAR'] = window['WebXRAR'] || {};
            window['WebXRAR']['init'] = window['WebXRAR']['init'] || null;
            window['WebXRAR']['reset'] = window['WebXRAR']['reset'] || null;
            window['WebXRAR']['isAnchored'] = window['WebXRAR']['isAnchored'] || (function() { return false; });
            window['WebXRAR']['_scriptLoaded'] = true;
            window['WebXRAR']['_scriptLoadTime'] = Date.now();
        }
    } catch(e2) {
        // Fallback 2: globalThis
        try {
            var global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
            if (global) {
                global['WebXRAR'] = global['WebXRAR'] || {};
                global['WebXRAR']['_scriptLoaded'] = true;
                global['WebXRAR']['_scriptLoadTime'] = Date.now();
            }
        } catch(e3) {
            // Last resort: eval (only if absolutely necessary)
            try {
                eval('(typeof window !== "undefined" ? window : globalThis).WebXRAR = (typeof window !== "undefined" ? window : globalThis).WebXRAR || {};');
            } catch(e4) {}
        }
    }
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let isTracking = false;
let isAnchored = false;
let xrSession = null;
let xrReferenceSpace = null;
let imageTrackingSet = null;
let worldAnchor = null;
let anchorPose = null;
let lastKnownPosition = null;

// ============================================================================
// THREE.JS SCENE SETUP
// ============================================================================
let scene, camera, renderer;
let contentGroup;
let cubeMesh;
let animationTime = 0;

// ============================================================================
// DOM ELEMENTS (prefixed to avoid collision with ar-controller.js)
// ============================================================================
// Get DOM elements safely (may be null if script loads before DOM)
let _webxr_arContainer = null;
let _webxr_resetButton = null;

function getDOMElements() {
    if (!_webxr_arContainer) {
        _webxr_arContainer = document.getElementById('ar-container');
    }
    if (!_webxr_resetButton) {
        _webxr_resetButton = document.getElementById('reset-button');
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initWebXR() {
    // Ensure DOM elements are available
    getDOMElements();
    
    if (!_webxr_arContainer) {
        throw new Error('AR container element not found. Ensure #ar-container exists in the DOM.');
    }
    
    // Check if THREE.js is loaded
    if (typeof THREE === 'undefined') {
        throw new Error('THREE.js is not loaded. Please ensure Three.js is loaded before this script.');
    }
    
    // Check WebXR support
    if (!navigator.xr) {
        throw new Error('WebXR is not supported on this device. Please use an Android device with Chrome.');
    }

    // Check if immersive-ar is supported
    const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!isSupported) {
        throw new Error('WebXR immersive-ar is not supported on this device.');
    }

    // CRITICAL FIX 1: Request camera permissions before starting WebXR session
    // Android Chrome requires explicit camera permission for WebXR camera feed
    console.log('Requesting camera permissions...');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Stop the test stream immediately - we just needed permission
        stream.getTracks().forEach(track => track.stop());
        console.log('Camera permissions granted');
    } catch (permError) {
        console.error('Camera permission error:', permError);
        if (permError.name === 'NotAllowedError' || permError.name === 'PermissionDeniedError') {
            throw new Error('Camera permission denied. Please allow camera access in your browser settings and try again.');
        } else if (permError.name === 'NotFoundError') {
            throw new Error('No camera found. Please ensure your device has a camera.');
        } else {
            throw new Error(`Camera access failed: ${permError.message || permError.name}. WebXR requires camera access to display the AR view.`);
        }
    }

    // Create Three.js scene with transparent background
    scene = new THREE.Scene();
    // CRITICAL FIX 2: Explicitly set scene background to null/transparent
    // This ensures the camera feed shows through
    scene.background = null;
    scene.fog = null;
    
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    
    // Create WebGL renderer with XR enabled
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,  // Transparent background for AR camera feed
        canvas: document.createElement('canvas')
    });
    
    // CRITICAL FIX 3: Use more robust viewport sizing for Android
    const width = Math.max(window.innerWidth, screen.width || 640);
    const height = Math.max(window.innerHeight, screen.height || 480);
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // Cap pixel ratio for performance
    renderer.xr.enabled = true;
    
    // Ensure renderer clears with transparent background
    renderer.setClearColor(0x000000, 0); // Black with 0 alpha = transparent
    
    // Append canvas to container
    const canvas = renderer.domElement;
    // CRITICAL FIX 4a: Ensure canvas has proper styling for Android
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    _webxr_arContainer.appendChild(canvas);
    
    // CRITICAL FIX 4b: Ensure canvas is visible and rendered before proceeding
    // Android Chrome needs the canvas to be in the DOM and visible before XR session connection
    console.log('Ensuring canvas is ready...');
    await new Promise(resolve => {
        // Wait for next frame to ensure canvas is rendered
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Verify canvas is actually in the DOM and has dimensions
                if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
                    console.warn('Canvas has zero dimensions, forcing size...');
                    canvas.style.width = width + 'px';
                    canvas.style.height = height + 'px';
                }
                console.log('Canvas ready:', {
                    width: canvas.offsetWidth,
                    height: canvas.offsetHeight,
                    inDOM: document.body.contains(canvas) || _webxr_arContainer.contains(canvas),
                    display: window.getComputedStyle(canvas).display,
                    visibility: window.getComputedStyle(canvas).visibility
                });
                resolve();
            });
        });
    });

    // Create content group
    contentGroup = new THREE.Group();
    scene.add(contentGroup);

    // Create cube
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00,
        metalness: 0.2,
        roughness: 0.6
    });
    cubeMesh = new THREE.Mesh(geometry, material);
    cubeMesh.position.set(0, 0.1, 0);
    contentGroup.add(cubeMesh);
    contentGroup.visible = false; // Hide until anchored

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Start WebXR session
    try {
        // Request session with image tracking as optional feature
        const sessionOptions = {
            requiredFeatures: ['local'],
            optionalFeatures: ['image-tracking']
        };
        
        console.log('Requesting WebXR session...');
        xrSession = await navigator.xr.requestSession('immersive-ar', sessionOptions);

        console.log('WebXR session started');
        // enabledFeatures is already an array
        console.log('Enabled features:', xrSession.enabledFeatures);
        
        // CRITICAL FIX 5: Verify session state before connecting renderer
        if (xrSession.state !== 'running' && xrSession.state !== 'visible') {
            console.warn('Session state is:', xrSession.state, '- waiting for running state...');
            // Wait a brief moment for session to be ready (Android sometimes needs this)
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // CRITICAL FIX 6: Connect renderer to XR session - this makes camera feed appear
        // On Android, this must happen after canvas is visible and session is ready
        console.log('Connecting renderer to XR session...');
        renderer.xr.setSession(xrSession);
        
        // Verify connection was successful
        if (!renderer.xr.isPresenting) {
            console.warn('Renderer not presenting after setSession - this may cause issues');
        } else {
            console.log('Renderer successfully connected to XR session');
        }

        // Set up reference space
        xrReferenceSpace = await xrSession.requestReferenceSpace('local');
        
        // Initialize image tracking if available
        // enabledFeatures is an array, not a Set
        const hasImageTracking = xrSession.enabledFeatures && 
                                 Array.isArray(xrSession.enabledFeatures) && 
                                 xrSession.enabledFeatures.includes('image-tracking');
        
        if (hasImageTracking) {
            await initializeImageTracking();
        } else {
            console.warn('Image tracking not available, using hit-test fallback');
            // Fallback: Use hit-testing for initial placement
            await initializeHitTestFallback();
        }

        // Set up render loop
        console.log('Starting render loop...');
        renderer.setAnimationLoop(onXRFrame);
        
        // CRITICAL FIX 9: Remove manual render - WebXR animation loop handles rendering
        // Manual render calls can interfere with XR rendering
        console.log('Render loop started - camera feed should appear shortly');

        // Handle session end
        xrSession.addEventListener('end', () => {
            console.log('WebXR session ended - this may cause black screen');
            console.log('Session end reason - check if this was unexpected');
            renderer.setAnimationLoop(null);
            renderer.xr.setSession(null);  // Disconnect renderer from session
            isAnchored = false;
            worldAnchor = null;
        });
        
        // CRITICAL FIX 11: Monitor session state changes
        // Android sometimes ends the session prematurely - log when this happens
        if (xrSession.addEventListener) {
            xrSession.addEventListener('visibilitychange', () => {
                console.log('WebXR session visibility changed:', xrSession.visibilityState);
                if (xrSession.visibilityState === 'hidden') {
                    console.warn('Session became hidden - camera feed may disappear');
                }
            });
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

    } catch (error) {
        console.error('Failed to start WebXR session:', error);
        throw error;
    }
}

// Assign init function immediately after definition
if (typeof window !== 'undefined' && window.WebXRAR) {
    window.WebXRAR.init = initWebXR;
}

// ============================================================================
// IMAGE TRACKING INITIALIZATION
// ============================================================================

async function initializeImageTracking() {
    // Try to load the image target
    // User needs to provide target-image in assets folder (jpg, jpeg, or png)
    const imageFormats = [
        './assets/target-image.jpg',
        './assets/target-image.jpeg',
        './assets/target-image.png',
        './assets/target.jpg',
        './assets/target.jpeg',
        './assets/target.png'
    ];
    
    let imageBitmap = null;
    let imagePath = null;
    
    // Try to load image as ImageBitmap
    for (const imagePathTry of imageFormats) {
        try {
            const response = await fetch(imagePathTry);
            if (response.ok) {
                const blob = await response.blob();
                imageBitmap = await createImageBitmap(blob);
                imagePath = imagePathTry;
                console.log('Loaded image for tracking:', imagePathTry);
                break;
            }
        } catch (e) {
            console.log(`Failed to load ${imagePathTry}, trying next...`);
        }
    }
    
    if (!imageBitmap) {
        throw new Error('Could not load image target. Please ensure target-image.jpg/jpeg/png exists in assets folder.');
    }
    
    // Register image for tracking using WebXR Image Tracking API
    // Note: WebXR Image Tracking API is experimental and may vary by browser
    // Dimensions: 9cm x 5cm namecard = 0.09m x 0.05m
    try {
        // The WebXR Image Tracking API structure may vary
        // Try different possible API patterns
        
        // Pattern 1: requestImageTracking as a method on session
        if (typeof xrSession.requestImageTracking === 'function') {
            try {
                const trackedImages = await xrSession.requestImageTracking({
                    images: [{
                        image: imageBitmap,
                        widthInMeters: 0.09,  // 9cm
                        heightInMeters: 0.05   // 5cm
                    }]
                });
                imageTrackingSet = trackedImages;
                console.log('Image tracking initialized via requestImageTracking');
                return;
            } catch (e) {
                console.log('requestImageTracking failed, trying alternatives:', e);
            }
        }
        
        // Pattern 2: Image tracking might be set up differently
        // Store image bitmap for use in render loop
        // Some implementations track images automatically if they're in the session
        window._webxr_trackedImageBitmap = imageBitmap;
        window._webxr_imageDimensions = { width: 0.09, height: 0.05 };
        console.log('Image loaded, will attempt tracking in render loop');
        
        // Note: If image tracking API is not available, we'll use hit-test fallback
        // The render loop will check for getImageTrackingResults() on each frame
        
    } catch (error) {
        console.error('Failed to initialize image tracking:', error);
        console.log('Falling back to hit-test based placement');
        await initializeHitTestFallback();
    }
}

// ============================================================================
// HIT-TEST FALLBACK (when image tracking not available)
// ============================================================================

async function initializeHitTestFallback() {
    try {
        // Request viewer space for hit-testing
        const viewerSpace = await xrSession.requestReferenceSpace('viewer');
        
        // Try to create hit-test source
        if (xrSession.requestHitTestSource) {
            const hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
            console.log('Hit-test source created for fallback placement');
            // Store for use in render loop
            window._webxr_hitTestSource = hitTestSource;
        }
    } catch (error) {
        console.warn('Hit-test not available:', error);
        // Will use fixed position fallback
    }
}

// ============================================================================
// IMAGE TRACKING HANDLER
// ============================================================================

function handleImageTracking(trackedImage) {
    if (trackedImage.trackingState === 'tracked') {
        if (!isTracking) {
            isTracking = true;
            console.log('Image target tracked');
        }
        
        // On first detection, automatically create world-space anchor
        if (!isAnchored) {
            createWorldAnchor(trackedImage);
        }
    } else {
        if (isTracking) {
            isTracking = false;
            console.log('Image target lost');
        }
    }
}

// ============================================================================
// WORLD-SPACE ANCHORING
// ============================================================================

function createWorldAnchor(trackedImage) {
    if (isAnchored || !xrReferenceSpace) {
        return;
    }
    
    console.log('Preparing to create world-space anchor on first detection');
    
    // Store the tracked image - anchor will be created in render loop
    // where we have access to the frame
    anchorPose = trackedImage;
    
    // Mark that we should anchor on next frame
    // The actual anchor creation happens in onXRFrame where we have frame access
}

// ============================================================================
// RESET ANCHOR
// ============================================================================

function resetAnchor() {
    if (worldAnchor) {
        try {
            worldAnchor.delete();
        } catch (error) {
            console.warn('Error deleting anchor:', error);
        }
        worldAnchor = null;
    }
    isAnchored = false;
    anchorPose = null;
    lastKnownPosition = null;
    contentGroup.visible = false;
    console.log('Anchor reset - will re-anchor on next detection');
}

// Assign reset function immediately after definition
if (typeof window !== 'undefined' && window.WebXRAR) {
    window.WebXRAR.reset = resetAnchor;
}

// ============================================================================
// RENDER LOOP
// ============================================================================

// Frame counter for debugging
let _webxr_frameCount = 0;

function onXRFrame(time, frame) {
    _webxr_frameCount++;
    
    // Log periodically to verify render loop is running
    if (_webxr_frameCount % 300 === 0) { // Every ~5 seconds at 60fps
        console.log('Render loop active - frame:', _webxr_frameCount, 'session state:', xrSession?.state);
    }
    
    if (!xrSession || !xrReferenceSpace) {
        // CRITICAL FIX 7: Log early returns for debugging
        if (!xrSession) console.warn('onXRFrame: xrSession is null');
        if (!xrReferenceSpace) console.warn('onXRFrame: xrReferenceSpace is null');
        return;
    }

    // CRITICAL FIX 10: DO NOT return early if pose is null!
    // On Android, pose might not be available immediately, but we MUST continue
    // the animation loop to keep the session alive and show the camera feed.
    // In WebXR mode, Three.js automatically renders - we don't need to call render manually.
    const pose = frame.getViewerPose(xrReferenceSpace);
    if (!pose) {
        // Log occasionally to avoid spam
        if (Math.random() < 0.01) { // Log ~1% of the time
            console.warn('onXRFrame: Viewer pose not available (animation loop continues for camera feed)');
        }
        // CRITICAL: Do NOT return early! Continue to the render call at the end.
        // The animation loop must continue to keep the camera feed visible.
        // We'll just skip camera/pose updates but still render.
    }

    // Update camera with pose data (only if pose is available)
    if (pose && pose.views && pose.views.length > 0) {
        const view = pose.views[0];
        if (view && view.transform && view.transform.matrix) {
            camera.position.setFromMatrixPosition(view.transform.matrix);
            camera.quaternion.setFromRotationMatrix(view.transform.matrix);
        }
    }

    // Handle image tracking results if available
    // Check if image tracking is enabled and the API is available
    // enabledFeatures is an array, not a Set
    const hasImageTracking = xrSession.enabledFeatures && 
                             Array.isArray(xrSession.enabledFeatures) && 
                             xrSession.enabledFeatures.includes('image-tracking');
    const hasImageTrackingAPI = typeof frame.getImageTrackingResults === 'function';
    
    if (hasImageTracking && hasImageTrackingAPI) {
        let imageTrackingResults;
        try {
            imageTrackingResults = frame.getImageTrackingResults();
        } catch (error) {
            console.warn('getImageTrackingResults failed:', error);
            imageTrackingResults = [];
        }
        
        for (const result of imageTrackingResults) {
            if (result.trackingState === 'tracked') {
                handleImageTracking(result);
                
                // Get the image's pose
                const imagePose = frame.getPose(result.imageSpace, xrReferenceSpace);
                if (imagePose) {
                    // On first detection, create world-space anchor
                    if (!isAnchored && !worldAnchor) {
                        try {
                            // Create anchor at the tracked image position
                            const anchorTransform = new XRRigidTransform(
                                imagePose.transform.position,
                                imagePose.transform.orientation
                            );
                            
                            // Use frame.createAnchor if available (WebXR Anchors API)
                            if (frame.createAnchor) {
                                frame.createAnchor(anchorTransform, xrReferenceSpace).then((anchor) => {
                                    worldAnchor = anchor;
                                    isAnchored = true;
                                    contentGroup.visible = true;
                                    console.log('World anchor created successfully at image position');
                                }).catch((error) => {
                                    console.warn('Could not create anchor:', error);
                                    // Fallback: store transform
                                    anchorPose = result;
                                    isAnchored = true;
                                    contentGroup.visible = true;
                                });
                            } else if (xrReferenceSpace.createAnchor) {
                                // Alternative: createAnchor on reference space
                                try {
                                    worldAnchor = xrReferenceSpace.createAnchor(anchorTransform, xrReferenceSpace);
                                    isAnchored = true;
                                    contentGroup.visible = true;
                                    console.log('World anchor created via reference space');
                                } catch (error) {
                                    console.warn('Could not create anchor:', error);
                                    anchorPose = result;
                                    isAnchored = true;
                                    contentGroup.visible = true;
                                }
                            } else {
                                // No anchor API available, use transform directly
                                anchorPose = result;
                                isAnchored = true;
                                contentGroup.visible = true;
                            }
                        } catch (error) {
                            console.warn('Error creating anchor:', error);
                            anchorPose = result;
                            isAnchored = true;
                            contentGroup.visible = true;
                        }
                    }
                    
                    // Update object position based on anchor or tracked image
                    if (worldAnchor && isAnchored) {
                        // Anchor maintains world-space position automatically
                        try {
                            const anchorPoseFrame = frame.getPose(worldAnchor.anchorSpace, xrReferenceSpace);
                            if (anchorPoseFrame) {
                                const matrix = new THREE.Matrix4().fromArray(anchorPoseFrame.transform.matrix);
                                contentGroup.position.setFromMatrixPosition(matrix);
                                contentGroup.quaternion.setFromRotationMatrix(matrix);
                                // Store last known position
                                lastKnownPosition = contentGroup.position.clone();
                            }
                        } catch (error) {
                            // Anchor might not be ready yet or was deleted
                            if (error.name === 'InvalidStateError') {
                                worldAnchor = null;
                            }
                        }
                    } else if (anchorPose && isAnchored) {
                        // Use tracked image position if anchor not available
                        const matrix = new THREE.Matrix4().fromArray(imagePose.transform.matrix);
                        contentGroup.position.setFromMatrixPosition(matrix);
                        contentGroup.quaternion.setFromRotationMatrix(matrix);
                        lastKnownPosition = contentGroup.position.clone();
                    }
                }
            }
        }
    } else {
        // Fallback: Use hit-test for initial placement
        const hitTestSource = window._webxr_hitTestSource;
        if (hitTestSource && !isAnchored) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const hitPose = hit.getPose(xrReferenceSpace);
                if (hitPose) {
                    // Create anchor at hit position
                    try {
                        const anchorTransform = new XRRigidTransform(
                            hitPose.transform.position,
                            hitPose.transform.orientation
                        );
                        
                        if (frame.createAnchor) {
                            frame.createAnchor(anchorTransform, xrReferenceSpace).then((anchor) => {
                                worldAnchor = anchor;
                                isAnchored = true;
                                console.log('World anchor created at hit-test position');
                            });
                        } else {
                            // Store transform
                            anchorPose = { transform: hitPose.transform };
                            isAnchored = true;
                        }
                    } catch (error) {
                        console.warn('Could not create anchor from hit-test:', error);
                    }
                }
            }
        }
        
        // Update position if anchored
        if (worldAnchor && isAnchored) {
            try {
                const anchorPoseFrame = frame.getPose(worldAnchor.anchorSpace, xrReferenceSpace);
                if (anchorPoseFrame) {
                    const matrix = new THREE.Matrix4().fromArray(anchorPoseFrame.transform.matrix);
                    contentGroup.position.setFromMatrixPosition(matrix);
                    contentGroup.quaternion.setFromRotationMatrix(matrix);
                }
            } catch (error) {
                if (error.name === 'InvalidStateError') {
                    worldAnchor = null;
                }
            }
        } else if (anchorPose && isAnchored && anchorPose.transform) {
            const matrix = new THREE.Matrix4().fromArray(anchorPose.transform.matrix);
            contentGroup.position.setFromMatrixPosition(matrix);
            contentGroup.quaternion.setFromRotationMatrix(matrix);
        }
    }

    // Rotate cube
    animationTime = time * 0.001;
    if (cubeMesh) {
        cubeMesh.rotation.y = animationTime;
        cubeMesh.rotation.x = animationTime * 0.5;
    }

    // Render the scene - Three.js XR renderer handles camera feed automatically
    renderer.render(scene, camera);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Set up event handlers when DOM is ready
function setupEventHandlers() {
    getDOMElements();
    if (_webxr_resetButton) {
        _webxr_resetButton.addEventListener('click', () => {
            resetAnchor();
        });
    }
}

// Try to set up handlers immediately, or wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEventHandlers);
} else {
    setupEventHandlers();
}

// ============================================================================
// FINALIZE EXPORTS
// ============================================================================

// Final assignment to ensure everything is set (functions already assigned above)
// This is a safeguard in case the earlier assignments didn't execute
if (typeof window !== 'undefined') {
    if (!window.WebXRAR) {
        // Emergency fallback - create module if it doesn't exist
        window.WebXRAR = {
            init: null,
            reset: null,
            isAnchored: () => false,
            _scriptLoaded: false
        };
    }
    
    // Ensure functions are assigned (they should already be from above)
    if (typeof initWebXR === 'function') {
        window.WebXRAR.init = initWebXR;
    }
    if (typeof resetAnchor === 'function') {
        window.WebXRAR.reset = resetAnchor;
    }
    window.WebXRAR.isAnchored = () => isAnchored;
    
    // Mark script as fully loaded
    window.WebXRAR._loaded = true;
    window.WebXRAR._loadTime = Date.now();
    window.WebXRAR._scriptLoaded = true;
}

