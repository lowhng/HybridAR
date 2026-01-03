// WebXR + Three.js AR Application
// Uses standard WebXR APIs: anchors and hit-testing for world-space AR
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
let isAnchored = false;
let xrSession = null;
let xrReferenceSpace = null;
let viewerSpace = null;
let hitTestSource = null;
let worldAnchor = null;
let anchorTransform = null;

// ============================================================================
// THREE.JS SCENE SETUP
// ============================================================================
let scene, camera, renderer;
let contentGroup;
let cubeMesh;
let animationTime = 0;
let reticle = null;

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
    _webxr_arContainer.appendChild(renderer.domElement);

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

    // Create reticle (indicator for where content will be placed)
    const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const reticleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
    });
    reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Start WebXR session with anchors and hit-test features
    try {
        // Request session with anchors and hit-test (standard WebXR features)
        const sessionInit = {
            requiredFeatures: ['local'],
            optionalFeatures: ['anchors', 'hit-test']
        };

        xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);

        console.log('WebXR session started');
        console.log('Enabled features:', Array.from(xrSession.enabledFeatures));

        // Set up reference space
        xrReferenceSpace = await xrSession.requestReferenceSpace('local');
        
        // Get viewer space for hit-testing
        viewerSpace = await xrSession.requestReferenceSpace('viewer');

        // Set up hit-test source if available
        if (xrSession.enabledFeatures.has('hit-test')) {
            try {
                hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
                console.log('Hit-test source created');
            } catch (error) {
                console.warn('Hit-test not available:', error);
            }
        }

        // Set up render loop
        renderer.setAnimationLoop(onXRFrame);

        // Handle session end
        xrSession.addEventListener('end', () => {
            console.log('WebXR session ended');
            renderer.setAnimationLoop(null);
            isAnchored = false;
            worldAnchor = null;
            hitTestSource = null;
            contentGroup.visible = false;
            reticle.visible = false;
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Auto-place content after a short delay if hit-test is available
        // Otherwise, place at a fixed position
        if (!hitTestSource) {
            // No hit-test available, place content at fixed position
            setTimeout(() => {
                placeContentAtFixedPosition();
            }, 1000);
        }

    } catch (error) {
        console.error('Failed to start WebXR session:', error);
        throw error;
    }
}

// Place content at a fixed position (fallback when hit-test unavailable)
async function placeContentAtFixedPosition() {
    if (isAnchored || !xrReferenceSpace) return;

    try {
        // Place content 1 meter in front of the viewer
        const position = { x: 0, y: 0, z: -1, w: 1 };
        const orientation = { x: 0, y: 0, z: 0, w: 1 };
        const transform = new XRRigidTransform(position, orientation);

        if (xrSession.enabledFeatures.has('anchors') && xrReferenceSpace.createAnchor) {
            // Create anchor if available (WebXR Anchors API)
            try {
                const anchor = await xrReferenceSpace.createAnchor(transform, xrReferenceSpace);
                worldAnchor = anchor;
                anchorTransform = transform;
                isAnchored = true;
                contentGroup.visible = true;
                console.log('Content anchored at fixed position');
            } catch (error) {
                console.warn('Could not create anchor, using transform:', error);
                // Fallback: just use the transform
                anchorTransform = transform;
                isAnchored = true;
                contentGroup.visible = true;
            }
        } else {
            // No anchors, just use transform
            anchorTransform = transform;
            isAnchored = true;
            contentGroup.visible = true;
        }
    } catch (error) {
        console.error('Failed to place content:', error);
    }
}

// Assign init function immediately after definition
if (typeof window !== 'undefined' && window.WebXRAR) {
    window.WebXRAR.init = initWebXR;
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
    anchorTransform = null;
    contentGroup.visible = false;
    reticle.visible = false;
    console.log('Anchor reset - content will be re-placed');
    
    // Re-place content if hit-test is available
    if (hitTestSource) {
        // Will be placed on next hit-test result
    } else {
        // Re-place at fixed position
        setTimeout(() => {
            placeContentAtFixedPosition();
        }, 500);
    }
}

// Assign reset function immediately after definition
if (typeof window !== 'undefined' && window.WebXRAR) {
    window.WebXRAR.reset = resetAnchor;
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

    // Perform hit-test if available and not yet anchored
    if (hitTestSource && !isAnchored) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);
        
        if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const hitPose = hit.getPose(xrReferenceSpace);
            
            if (hitPose) {
                // Show reticle at hit position
                reticle.visible = true;
                const matrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
                reticle.matrix.copy(matrix);
                
                // Auto-place content after a brief moment
                if (!isAnchored) {
                    setTimeout(() => {
                        if (!isAnchored && hitTestSource) {
                            placeContentAtHit(hit);
                        }
                    }, 500);
                }
            }
        } else {
            reticle.visible = false;
        }
    }

    // Update content position based on anchor or transform
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
                isAnchored = false;
                contentGroup.visible = false;
            }
        }
    } else if (anchorTransform && isAnchored) {
        // Use stored transform (fallback when anchors not available)
        const matrix = new THREE.Matrix4().fromArray(anchorTransform.matrix);
        contentGroup.position.setFromMatrixPosition(matrix);
        contentGroup.quaternion.setFromRotationMatrix(matrix);
    }

    // Rotate cube
    animationTime = time * 0.001;
    if (cubeMesh) {
        cubeMesh.rotation.y = animationTime;
        cubeMesh.rotation.x = animationTime * 0.5;
    }

    renderer.render(scene, camera);
}

// Place content at hit-test result
async function placeContentAtHit(hit) {
    if (isAnchored || !xrReferenceSpace) return;

    try {
        const hitPose = hit.getPose(xrReferenceSpace);
        if (!hitPose) return;

        const transform = new XRRigidTransform(
            hitPose.transform.position,
            hitPose.transform.orientation
        );

        if (xrSession.enabledFeatures.has('anchors') && xrReferenceSpace.createAnchor) {
            // Create anchor at hit position (WebXR Anchors API)
            try {
                const anchor = await xrReferenceSpace.createAnchor(transform, xrReferenceSpace);
                worldAnchor = anchor;
                anchorTransform = transform;
                isAnchored = true;
                contentGroup.visible = true;
                reticle.visible = false;
                console.log('Content anchored at hit position');
            } catch (error) {
                console.warn('Could not create anchor, using transform:', error);
                anchorTransform = transform;
                isAnchored = true;
                contentGroup.visible = true;
                reticle.visible = false;
            }
        } else {
            // No anchors, just use transform
            anchorTransform = transform;
            isAnchored = true;
            contentGroup.visible = true;
            reticle.visible = false;
        }
    } catch (error) {
        console.error('Failed to place content at hit:', error);
    }
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

