// Unified AR Controller
// WebXR-only controller (Variant Launch handles iOS WebXR viewer)

// ============================================================================
// STATE
// ============================================================================
let currentARSystem = null;
let capabilities = null;

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const startButton = document.getElementById('start-button');
const resetButton = document.getElementById('reset-button');
const logoContainer = document.getElementById('logo-container');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutorialContinueButton = document.getElementById('tutorial-continue-button');
const tutorialCameraVideo = document.getElementById('tutorial-camera-video');

// ============================================================================
// CAMERA STREAM STATE
// ============================================================================
let tutorialCameraStream = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initializeAR() {
    // Detect platform and AR capabilities
    if (!window.PlatformDetector) {
        throw new Error('Platform detector not loaded. Please ensure platform-detector.js is loaded first.');
    }
    
    capabilities = await window.PlatformDetector.detectARCapabilities();
    
    console.log('Initializing AR system:', capabilities.useWebXR ? 'WebXR' : 'None');

    // If WebXR is not available, show a helpful message and bail out
    if (!capabilities.webxrSupported || !capabilities.useWebXR) {
        const msg = 'WebXR immersive-ar is not supported on this device or browser.\n\n' +
            'Please open this experience in a WebXR-capable browser. On iOS, use the Variant Launch viewer; ' +
            'on Android, use Chrome.';
        if (window.Toast) {
            window.Toast.error(msg, 'WebXR Not Supported', 10000);
        } else {
            alert(msg);
        }

        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = 'Start AR';
        }
        if (resetButton) {
            resetButton.classList.add('hidden');
        }
        return;
    }
    
    // Hide start button and logo
    if (startButton) {
        startButton.classList.add('hidden');
    }
    if (logoContainer) {
        logoContainer.classList.add('hidden');
    }
    
    // Show reset button and close button for WebXR
    if (resetButton) {
        resetButton.classList.remove('hidden');
    }
    const closeButton = document.getElementById('close-button');
    if (closeButton) {
        // Ensure close button is in overlay UI for iOS WebXR (if overlay exists)
        const overlayUI = document.getElementById('xr-overlay-ui');
        if (overlayUI && closeButton.parentElement !== overlayUI) {
            overlayUI.appendChild(closeButton);
            console.log('Close button moved to overlay UI');
        }
        closeButton.classList.remove('hidden');
    }
    
    try {
        // Load and initialize WebXR
        await loadWebXR();
        
        // Ensure reset button is visible after successful initialization
        if (resetButton) {
            resetButton.classList.remove('hidden');
            console.log('Reset button should be visible');
        }
        
        // Show instruction for WebXR users
        const instruction = document.getElementById('webxr-instruction');
        if (instruction) {
            instruction.classList.remove('hidden');
            // Auto-hide after animation completes
            setTimeout(() => {
                instruction.classList.add('hidden');
            }, 4000);
        }
    } catch (error) {
        console.error('Failed to initialize AR system:', error);
        
        // Show error message
        const errorMessage = error.message || 'Unknown error occurred';
        const fullMessage = `${errorMessage}\n\nPlease check:\n- Camera permissions are granted\n- Required files exist\n- Camera is not being used by another app\n- You're using a modern browser`;
        if (window.Toast) {
            window.Toast.error(fullMessage, 'AR Initialization Failed', 10000);
        } else {
            alert(`Failed to start AR:\n\n${fullMessage}`);
        }
        
        // Re-enable start button and show logo
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = 'Start AR';
            startButton.classList.remove('hidden');
        }
        if (logoContainer) {
            logoContainer.classList.remove('hidden');
        }
        
        // Hide reset button and close button on error
        if (resetButton) {
            resetButton.classList.add('hidden');
        }
        const closeButton = document.getElementById('close-button');
        if (closeButton) {
            closeButton.classList.add('hidden');
        }
        
        throw error;
    }
}

// ============================================================================
// LOAD WEBXR
// ============================================================================

async function loadWebXR() {
    console.log('Loading WebXR implementation...');
    
    // Check if WebXR module is loaded
    if (typeof window.WebXRAR === 'undefined') {
        // Load the WebXR script with cache busting
        return new Promise(async (resolve, reject) => {
            // First, verify the script file exists by trying to fetch it
            const scriptPath = 'main-webxr.js';
            try {
                const response = await fetch(scriptPath, { method: 'HEAD' });
                if (!response.ok && response.status !== 0) {
                    reject(new Error('WebXR script file not found. Please ensure main-webxr.js exists in the public folder.'));
                    return;
                }
            } catch (fetchError) {
                // Fetch might fail due to CORS, but that's okay - script tag should still work
                console.warn('Could not verify script exists via fetch (this is usually okay):', fetchError);
            }
            
            const script = document.createElement('script');
            // Add cache busting timestamp to force fresh load
            const cacheBuster = '?v=' + Date.now() + '&t=' + Math.random();
            // Use same path pattern as other scripts in index.html (no ./ prefix)
            script.src = scriptPath + cacheBuster;
            script.async = false; // Ensure synchronous execution
            script.defer = false; // Don't defer execution
            script.type = 'text/javascript'; // Explicit type
            
            // Set up error handler before appending
            script.onerror = (error) => {
                console.error('Script load error:', error);
                console.error('Failed to load script:', script.src);
                const errorMsg = 'Failed to load WebXR script file. ' +
                    'This could mean:\n' +
                    '1. The file main-webxr.js is missing\n' +
                    '2. There is a network connectivity issue\n' +
                    '3. The file path is incorrect\n\n' +
                    'Please check that the file exists and try refreshing the page.';
                reject(new Error(errorMsg));
            };
            
            // Wrap onload in try-catch to catch any errors
            script.onload = async () => {
                try {
                    console.log('WebXR script loaded from:', script.src);
                    
                    // Give the script time to execute - scripts execute synchronously when loaded
                    // But we'll wait a bit to be safe
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Check immediately
                    let webxrModule = window.WebXRAR || window['WebXRAR'];
                    if (webxrModule) {
                        console.log('WebXRAR found immediately after load');
                    } else {
                        console.warn('WebXRAR not found immediately, waiting...');
                    }
                    
                    // Wait a bit more for the module to be exported
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Check multiple times with increasing delays
                    let attempts = 0;
                    const maxAttempts = 30; // Increased attempts for mobile
                    while (typeof webxrModule === 'undefined' && attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        webxrModule = window.WebXRAR || window['WebXRAR'];
                        attempts++;
                    }
                    
                    // webxrModule already defined above, just verify it exists
                    if (typeof webxrModule === 'undefined') {
                        // Try one more time with bracket notation
                        webxrModule = window['WebXRAR'];
                    }
                    
                    if (typeof webxrModule === 'undefined') {
                        // Try to provide helpful error message
                        const scriptError = 'The WebXR script loaded but the module was not exported.\n\n' +
                            'Possible causes:\n' +
                            '1. JavaScript syntax error in main-webxr.js\n' +
                            '2. The script file is empty or corrupted\n' +
                            '3. Browser security restrictions\n\n' +
                            'Try:\n' +
                            '- Refreshing the page\n' +
                            '- Clearing browser cache\n' +
                            '- Using a different browser';
                        reject(new Error(scriptError));
                        return;
                    }
                    
                    // Update reference
                    window.WebXRAR = webxrModule;
                    
                    // Check if script loaded flag is set (but don't fail if it's not - might be old version)
                    if (!webxrModule._scriptLoaded) {
                        // Script loaded but flag not set - might be an old cached version or error
                        // Still try to proceed if init function exists
                        if (!webxrModule.init) {
                            const incompleteError = 'The WebXR script loaded but initialization is incomplete. ' +
                                'The script may have a JavaScript error. Please try refreshing the page.';
                            reject(new Error(incompleteError));
                            return;
                        }
                    }
                    
                    // Verify init function exists and is a function
                    if (!window.WebXRAR.init) {
                        reject(new Error('WebXRAR.init is not defined. The script may have an error preventing function assignment.'));
                        return;
                    }
                    
                    if (typeof window.WebXRAR.init !== 'function') {
                        reject(new Error('WebXRAR.init is not a function. The script may have an error.'));
                        return;
                    }
                    
                    try {
                        await window.WebXRAR.init();
                        currentARSystem = 'webxr';
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                } catch (error) {
                    console.error('Error in script onload handler:', error);
                    reject(new Error('Error loading WebXR script: ' + error.message));
                }
            };
            
            // Append to head instead of body for better compatibility
            const head = document.head || document.getElementsByTagName('head')[0];
            if (head) {
                head.appendChild(script);
            } else {
                document.body.appendChild(script);
            }
        });
    } else {
        // Already loaded, just initialize
        console.log('WebXRAR already loaded, initializing...');
        if (typeof window.WebXRAR === 'undefined' || !window.WebXRAR.init) {
            throw new Error('WebXRAR module not properly initialized. Please refresh the page.');
        }
        await window.WebXRAR.init();
        currentARSystem = 'webxr';
    }
}

// ============================================================================
// RESET FUNCTION
// ============================================================================

function resetAR() {
    if (!currentARSystem) {
        console.warn('No AR system initialized');
        return;
    }
    
    if (currentARSystem === 'webxr') {
        if (window.WebXRAR && window.WebXRAR.reset) {
            window.WebXRAR.reset();
            console.log('WebXR anchor reset');
        }
    }
}

// ============================================================================
// TUTORIAL FUNCTIONS
// ============================================================================

async function showTutorial() {
    // Reset continue button state
    if (tutorialContinueButton) {
        tutorialContinueButton.disabled = false;
        tutorialContinueButton.textContent = 'Continue';
    }
    
    // Hide start button and logo
    if (startButton) {
        startButton.classList.add('hidden');
    }
    if (logoContainer) {
        logoContainer.classList.add('hidden');
    }
    
    // Request camera access and start video stream
    try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const constraints = {
                video: {
                    facingMode: 'environment', // Use back camera
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            tutorialCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (tutorialCameraVideo && tutorialCameraStream) {
                tutorialCameraVideo.srcObject = tutorialCameraStream;
                // Video will autoplay due to autoplay attribute
                console.log('Camera stream started for tutorial');
            }
        }
    } catch (error) {
        console.warn('Could not access camera for tutorial background:', error);
        // Continue without camera background - tutorial will show with default background
    }
    
    // Show tutorial overlay
    if (tutorialOverlay) {
        tutorialOverlay.classList.remove('hidden');
    }
}

function hideTutorial() {
    if (tutorialOverlay) {
        tutorialOverlay.classList.add('hidden');
    }
    
    // Stop camera stream
    if (tutorialCameraStream) {
        tutorialCameraStream.getTracks().forEach(track => track.stop());
        tutorialCameraStream = null;
    }
    
    if (tutorialCameraVideo) {
        tutorialCameraVideo.srcObject = null;
    }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

if (startButton) {
    startButton.addEventListener('click', () => {
        console.log('Start AR button clicked');
        showTutorial();
    });
}

if (tutorialContinueButton) {
    tutorialContinueButton.addEventListener('click', async () => {
        try {
            console.log('Tutorial continue button clicked');
            tutorialContinueButton.disabled = true;
            tutorialContinueButton.textContent = 'Starting...';
            
            // Hide tutorial (this will also stop the camera stream)
            hideTutorial();
            
            // Add a small delay to ensure UI updates
            await new Promise(resolve => setTimeout(resolve, 50));
            
            await initializeAR();
            console.log('AR initialization completed successfully');
        } catch (error) {
            console.error('Failed to initialize AR:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // Show user-friendly error in toast (debug mode only)
            if (window.Toast) {
                window.Toast.error(
                    `${error.message}\n\n${error.stack ? error.stack.substring(0, 200) : ''}`,
                    'Failed to Start AR',
                    10000,
                    true
                );
            } else {
                alert(`Failed to start AR:\n\n${error.message}\n\nCheck the console for more details.`);
            }
            
            // Show tutorial again (will reset button state)
            await showTutorial();
            
            // Also show start button and logo as fallback
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = 'Start AR';
                startButton.classList.remove('hidden');
            }
            if (logoContainer) {
                logoContainer.classList.remove('hidden');
            }
        }
    });
}

if (resetButton) {
    resetButton.addEventListener('click', () => {
        resetAR();
    });
}

// ============================================================================
// EXPORT
// ============================================================================

window.ARController = {
    init: initializeAR,
    reset: resetAR,
    getCurrentSystem: () => currentARSystem,
    getCapabilities: () => capabilities
};

