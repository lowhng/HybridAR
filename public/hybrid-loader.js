// Hybrid AR Loader
// Detects platform and uses WebXR (Android) or MindAR (iOS) accordingly

// ============================================================================
// PLATFORM DETECTION
// ============================================================================
function detectPlatform() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    
    // Detect Android
    const isAndroid = /android/i.test(userAgent);
    
    return {
        isIOS,
        isAndroid,
        isMobile: isIOS || isAndroid
    };
}

// ============================================================================
// WEBXR SUPPORT CHECK
// ============================================================================
async function checkWebXRSupport() {
    if (!navigator.xr) {
        return false;
    }
    
    try {
        const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
        return isSupported;
    } catch (error) {
        console.error('Error checking WebXR support:', error);
        return false;
    }
}

// ============================================================================
// MAIN LOADER
// ============================================================================
async function loadARImplementation() {
    const platform = detectPlatform();
    const webxrSupported = await checkWebXRSupport();
    
    console.log('Platform detection:', platform);
    console.log('WebXR support:', webxrSupported);
    
    // Decision logic:
    // - Android with WebXR: Use WebXR (true world-space anchoring)
    // - iOS or no WebXR: Use MindAR (works but limited anchoring)
    
    if (platform.isAndroid && webxrSupported) {
        console.log('✅ Using WebXR (Android) - True world-space anchoring available');
        return 'webxr';
    } else {
        console.log('📱 Using MindAR (iOS or fallback) - Image tracking only');
        if (platform.isIOS) {
            console.log('ℹ️ iOS Safari does not support WebXR. Using MindAR fallback.');
            console.log('ℹ️ World-space anchoring is limited on iOS with MindAR.');
        }
        return 'mindar';
    }
}

// ============================================================================
// INITIALIZE APPROPRIATE AR SYSTEM
// ============================================================================
async function initializeAR() {
    const implementation = await loadARImplementation();
    
    if (implementation === 'webxr') {
        // Load WebXR implementation
        // Note: WebXR image tracking requires different image format than MindAR
        // You'll need to prepare images for WebXR separately
        console.log('Loading WebXR implementation...');
        
        // For now, show a message that WebXR requires additional setup
        const startButton = document.getElementById('start-button');
        if (startButton) {
            startButton.textContent = 'WebXR Detected (Setup Required)';
            startButton.disabled = true;
            alert('WebXR is detected on your Android device!\n\n' +
                  'However, WebXR image tracking requires:\n' +
                  '1. Images prepared in WebXR format (different from .mind files)\n' +
                  '2. Physical dimensions of the image target\n' +
                  '3. Additional setup in the code\n\n' +
                  'For now, the app will use MindAR. To enable WebXR, you\'ll need to:\n' +
                  '- Convert your image targets to WebXR format\n' +
                  '- Update the WebXR initialization code\n\n' +
                  'Falling back to MindAR...');
        }
        
        // Fall back to MindAR for now
        return initializeMindAR();
    } else {
        // Use MindAR (works on both iOS and Android)
        return initializeMindAR();
    }
}

function initializeMindAR() {
    // Load the existing MindAR implementation
    console.log('Initializing MindAR...');
    
    // The existing main.js will handle MindAR initialization
    // This function is just a placeholder for the hybrid approach
    return true;
}

// Export for use
window.loadARImplementation = loadARImplementation;
window.initializeAR = initializeAR;
window.detectPlatform = detectPlatform;
window.checkWebXRSupport = checkWebXRSupport;



