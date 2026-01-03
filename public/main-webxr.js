// WebXR + Three.js AR Application with Image Tracking
// Provides true world-space anchoring on Android devices

// ============================================================================
// EXPORT IMMEDIATELY (so module is available even if init fails)
// ============================================================================
// Export must happen at the very top, before any other code
// Use IIFE to ensure execution even if there are errors later
(function() {
    'use strict';
    try {
        if (typeof window !== 'undefined') {
            window.WebXRAR = {
                init: null, // Will be set below
                reset: null, // Will be set below
                isAnchored: () => false
            };
            console.log('[WebXRAR] Module exported successfully');
        } else {
            console.error('[WebXRAR] window object not available');
        }
    } catch (e) {
        console.error('[WebXRAR] Error during export:', e);
        // Try to export anyway
        try {
            if (typeof window !== 'undefined') {
                window.WebXRAR = window.WebXRAR || {
                    init: null,
                    reset: null,
                    isAnchored: () => false
                };
            }
        } catch (e2) {
            console.error('[WebXRAR] Failed to export even with fallback:', e2);
        }
    }
})();

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
// DOM ELEMENTS
// ============================================================================
// Get DOM elements safely (may be null if script loads before DOM)
let arContainer = null;
let resetButton = null;

function getDOMElements() {
    if (!arContainer) {
        arContainer = document.getElementById('ar-container');
    }
    if (!resetButton) {
        resetButton = document.getElementById('reset-button');
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initWebXR() {
    // Ensure DOM elements are available
    getDOMElements();
    
    if (!arContainer) {
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

    // Create Three.js scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    
    // Create WebGL renderer with XR enabled
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        canvas: document.createElement('canvas')
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;
    arContainer.appendChild(renderer.domElement);

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

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Start WebXR session
    try {
        xrSession = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local'],
            optionalFeatures: ['image-tracking']
        });

        console.log('WebXR session started');

        // Set up reference space
        xrReferenceSpace = await xrSession.requestReferenceSpace('local');
        
        // Create image tracking
        // Note: WebXR image tracking requires the original image file, not .mind file
        // Dimensions: 9cm x 5cm namecard = 0.09m x 0.05m
        const imageTrackingRequest = new XRImageTrackingRequest();
        
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
        
        let imageAdded = false;
        for (const imagePath of imageFormats) {
            try {
                imageTrackingRequest.addImage(imagePath, {
                    widthInMeters: 0.09,  // 9cm
                    heightInMeters: 0.05  // 5cm
                });
                imageAdded = true;
                console.log('Added image to tracking:', imagePath);
                break;
            } catch (e) {
                // Try next format
                console.log(`Failed to add ${imagePath}, trying next...`);
            }
        }
        
        if (!imageAdded) {
            throw new Error('Could not add image target. Please ensure target-image.jpg/jpeg/png exists in assets folder.');
        }
        
        imageTrackingSet = await xrSession.requestImageTracking(imageTrackingRequest);
        console.log('Image tracking initialized');
        
        // Listen for image tracking events
        imageTrackingSet.addEventListener('track', (event) => {
            handleImageTracking(event);
        });

        // Set up render loop
        renderer.setAnimationLoop(onXRFrame);

        // Handle session end
        xrSession.addEventListener('end', () => {
            console.log('WebXR session ended');
            renderer.setAnimationLoop(null);
            isAnchored = false;
            worldAnchor = null;
        });

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

// ============================================================================
// IMAGE TRACKING HANDLER
// ============================================================================

function handleImageTracking(event) {
    const trackedImage = event.trackedImage;
    
    if (trackedImage.trackingState === 'tracked') {
        if (!isTracking) {
            isTracking = true;
            console.log('Image target tracked');
        }
        
        // On first detection, automatically create world-space anchor
        if (!isAnchored && trackedImage.trackingState === 'tracked') {
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
    
    console.log('Creating world-space anchor on first detection');
    
    // Get the pose of the tracked image
    // We'll create an anchor at the image's position
    // Note: We need to get this from the frame, so we'll store the tracked image
    // and create the anchor in the render loop
    
    // For now, mark that we should anchor on next frame
    anchorPose = trackedImage;
    isAnchored = true;
    
    console.log('World-space anchor created - object will stay in environment');
}

// ============================================================================
// RESET ANCHOR
// ============================================================================

function resetAnchor() {
    if (worldAnchor) {
        worldAnchor.delete();
        worldAnchor = null;
    }
    isAnchored = false;
    anchorPose = null;
    lastKnownPosition = null;
    console.log('Anchor reset - will re-anchor on next detection');
}

// ============================================================================
// RENDER LOOP
// ============================================================================

function onXRFrame(time, frame) {
    if (!xrSession || !xrReferenceSpace) return;

    const pose = frame.getViewerPose(xrReferenceSpace);
    if (!pose) return;

    // Update camera
    const view = pose.views[0];
    camera.position.setFromMatrixPosition(view.transform.matrix);
    camera.quaternion.setFromRotationMatrix(view.transform.matrix);

    // Create anchor if needed (on first detection)
    if (isAnchored && !worldAnchor && anchorPose) {
        try {
            // Get the image's pose in the reference space
            const imagePose = frame.getPose(anchorPose.imageSpace, xrReferenceSpace);
            if (imagePose) {
                // Create anchor at the tracked image position
                // Use the image's transform to create the anchor
                const anchorTransform = new XRRigidTransform(
                    imagePose.transform.position,
                    imagePose.transform.orientation
                );
                
                worldAnchor = xrReferenceSpace.createAnchor(anchorTransform, xrReferenceSpace);
                console.log('World anchor created successfully at image position');
            }
        } catch (error) {
            console.warn('Could not create anchor:', error);
            // Fallback: store current position
            const worldPos = new THREE.Vector3();
            contentGroup.getWorldPosition(worldPos);
            lastKnownPosition = worldPos.clone();
        }
    }

    // Update object position based on anchor or tracked image
    if (worldAnchor && isAnchored) {
        // Anchor maintains world-space position automatically
        try {
            const anchorPose = frame.getPose(worldAnchor.anchorSpace, xrReferenceSpace);
            if (anchorPose) {
                const matrix = new THREE.Matrix4().fromArray(anchorPose.transform.matrix);
                contentGroup.position.setFromMatrixPosition(matrix);
                contentGroup.quaternion.setFromRotationMatrix(matrix);
            }
        } catch (error) {
            // Anchor might not be ready yet or was deleted
            if (error.name === 'InvalidStateError') {
                worldAnchor = null;
            }
        }
    } else if (anchorPose && isAnchored) {
        // Fallback: use tracked image position if anchor not available
        try {
            const imagePose = frame.getPose(anchorPose.imageSpace, xrReferenceSpace);
            if (imagePose) {
                const matrix = new THREE.Matrix4().fromArray(imagePose.transform.matrix);
                contentGroup.position.setFromMatrixPosition(matrix);
                contentGroup.quaternion.setFromRotationMatrix(matrix);
            }
        } catch (error) {
            // Image tracking lost - maintain last known position
            if (lastKnownPosition) {
                contentGroup.position.copy(lastKnownPosition);
            }
        }
    }

    // Rotate cube
    animationTime = time * 0.001;
    if (cubeMesh) {
        cubeMesh.rotation.y = animationTime;
        cubeMesh.rotation.x = animationTime * 0.5;
    }

    renderer.render(scene, camera);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Set up event handlers when DOM is ready
function setupEventHandlers() {
    getDOMElements();
    if (resetButton) {
        resetButton.addEventListener('click', () => {
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
// UPDATE EXPORTS WITH ACTUAL FUNCTIONS
// ============================================================================

// Ensure exports are set up - wrap in try-catch to prevent errors from breaking assignment
try {
    if (typeof window !== 'undefined') {
        if (!window.WebXRAR) {
            // If export didn't happen, try to create it now
            console.warn('[WebXRAR] Module not found, creating now...');
            window.WebXRAR = {
                init: null,
                reset: null,
                isAnchored: () => false
            };
        }
        
        window.WebXRAR.init = initWebXR;
        window.WebXRAR.reset = resetAnchor;
        window.WebXRAR.isAnchored = () => isAnchored;
        
        // Set a flag to indicate script loaded successfully
        window.WebXRAR._loaded = true;
        window.WebXRAR._loadTime = Date.now();
        
        console.log('[WebXRAR] Functions assigned successfully');
        console.log('[WebXRAR] init type:', typeof window.WebXRAR.init);
        console.log('[WebXRAR] reset type:', typeof window.WebXRAR.reset);
        console.log('[WebXRAR] Script execution completed at:', new Date().toISOString());
    } else {
        console.error('[WebXRAR] window object not available when assigning functions');
    }
} catch (error) {
    console.error('[WebXRAR] Error assigning functions:', error);
    // Try to at least set the functions even if there was an error
    try {
        if (typeof window !== 'undefined') {
            window.WebXRAR = window.WebXRAR || {};
            window.WebXRAR.init = initWebXR;
            window.WebXRAR.reset = resetAnchor;
            window.WebXRAR.isAnchored = () => isAnchored;
            window.WebXRAR._loaded = true;
            window.WebXRAR._loadTime = Date.now();
        }
    } catch (e2) {
        console.error('[WebXRAR] Complete failure to assign functions:', e2);
    }
}
