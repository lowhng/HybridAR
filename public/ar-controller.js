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
        // Load the WebXR script
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'main-webxr.js';
            script.onload = async () => {
                console.log('WebXR script loaded');
                // Wait a bit for the module to be exported
                await new Promise(resolve => setTimeout(resolve, 100));
                
                if (typeof window.WebXRAR === 'undefined') {
                    reject(new Error('WebXRAR module not exported. Check console for errors.'));
                    return;
                }
                
                try {
                    await window.WebXRAR.init();
                    currentARSystem = 'webxr';
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            script.onerror = () => {
                reject(new Error('Failed to load WebXR implementation script'));
            };
            document.body.appendChild(script);
        });
    } else {
        // Already loaded, just initialize
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

