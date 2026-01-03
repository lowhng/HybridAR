// Unified AR Controller
// Routes to WebXR or MindAR based on platform detection

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
// Note: cameraSelector is also declared in main-mindar.js, but in different scope

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initializeAR() {
    // Detect platform and AR capabilities
    if (!window.PlatformDetector) {
        throw new Error('Platform detector not loaded. Please ensure platform-detector.js is loaded first.');
    }
    
    capabilities = await window.PlatformDetector.detectARCapabilities();
    
    console.log('Initializing AR system:', capabilities.useWebXR ? 'WebXR' : 'MindAR');
    
    // Hide start button and camera selector
    if (startButton) {
        startButton.classList.add('hidden');
    }
    const cameraSelectorEl = document.getElementById('camera-selector');
    if (cameraSelectorEl) {
        cameraSelectorEl.classList.add('hidden');
    }
    
    // Show/hide reset button based on system
    if (resetButton) {
        if (capabilities.useWebXR) {
            resetButton.classList.remove('hidden');
        } else {
            resetButton.classList.add('hidden');
        }
    }
    
    try {
        if (capabilities.useWebXR) {
            // Load and initialize WebXR
            await loadWebXR();
        } else {
            // Load and initialize MindAR
            await loadMindAR();
        }
    } catch (error) {
        console.error('Failed to initialize AR system:', error);
        
        // Show error message
        const errorMessage = error.message || 'Unknown error occurred';
        alert(`Failed to start AR:\n\n${errorMessage}\n\nPlease check:\n- Camera permissions are granted\n- Required files exist\n- Camera is not being used by another app\n- You're using a modern browser`);
        
        // Re-enable start button
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = 'Start AR';
            startButton.classList.remove('hidden');
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
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            // Add cache busting timestamp to force fresh load
            const cacheBuster = '?v=' + Date.now() + '&t=' + Math.random();
            script.src = './main-webxr.js' + cacheBuster;
            script.async = false; // Ensure synchronous execution
            script.defer = false; // Don't defer execution
            
            // Set up error handler before appending
            script.onerror = (error) => {
                console.error('Script load error:', error);
                console.error('Failed to load script:', script.src);
                reject(new Error('Failed to load WebXR implementation script. Check that main-webxr.js exists and is accessible.'));
            };
            
            // Wrap onload in try-catch to catch any errors
            script.onload = async () => {
                try {
                    console.log('WebXR script loaded from:', script.src);
                    
                    // Check immediately
                    if (typeof window.WebXRAR !== 'undefined') {
                        console.log('WebXRAR found immediately after load');
                    } else {
                        console.warn('WebXRAR not found immediately, waiting...');
                    }
                    
                    // Wait a bit for the module to be exported
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Check multiple times with increasing delays
                    let attempts = 0;
                    const maxAttempts = 30; // Increased attempts for mobile
                    while (typeof window.WebXRAR === 'undefined' && attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        attempts++;
                    }
                    
                    // Check if module exists
                    if (typeof window.WebXRAR === 'undefined') {
                        // Try to provide helpful error message
                        const scriptError = 'The WebXR script failed to load or execute. This could be due to:\n' +
                            '1. JavaScript error in main-webxr.js\n' +
                            '2. Network issue loading the script\n' +
                            '3. Browser compatibility issue\n\n' +
                            'Please try refreshing the page or check your internet connection.';
                        reject(new Error(scriptError));
                        return;
                    }
                    
                    // Check if script loaded flag is set
                    if (!window.WebXRAR._scriptLoaded) {
                        // Script loaded but didn't complete - might have an error
                        const incompleteError = 'The WebXR script loaded but did not complete initialization. ' +
                            'There may be a JavaScript error preventing the module from being set up correctly.';
                        reject(new Error(incompleteError));
                        return;
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
// LOAD MINDAR
// ============================================================================

async function loadMindAR() {
    console.log('Loading MindAR implementation...');
    
    // Verify MindAR library is loaded
    if (typeof MindARThree === 'undefined') {
        throw new Error('MindAR library not loaded. Please ensure mindar-image-three.prod.js is loaded.');
    }
    
    // Check if MindAR module is loaded
    if (typeof window.MindARAR === 'undefined') {
        // Load the MindAR script
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'main-mindar.js';
            script.onload = async () => {
                console.log('MindAR script loaded');
                // Wait a bit for the module to be exported
                await new Promise(resolve => setTimeout(resolve, 100));
                
                if (typeof window.MindARAR === 'undefined') {
                    reject(new Error('MindARAR module not exported. Check console for errors.'));
                    return;
                }
                
                try {
                    await window.MindARAR.init();
                    currentARSystem = 'mindar';
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            script.onerror = () => {
                reject(new Error('Failed to load MindAR implementation script'));
            };
            document.body.appendChild(script);
        });
    } else {
        // Already loaded, just initialize
        if (typeof window.MindARAR === 'undefined' || !window.MindARAR.init) {
            throw new Error('MindARAR module not properly initialized. Please refresh the page.');
        }
        await window.MindARAR.init();
        currentARSystem = 'mindar';
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
    } else {
        // MindAR doesn't need reset - it always tracks when target is visible
        console.log('Reset not applicable for MindAR');
    }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

if (startButton) {
    startButton.addEventListener('click', async () => {
        try {
            startButton.disabled = true;
            startButton.textContent = 'Starting...';
            await initializeAR();
        } catch (error) {
            console.error('Failed to initialize AR:', error);
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = 'Start AR';
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

