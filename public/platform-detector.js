// Platform Detection Module
// Detects Android/iOS and WebXR support for hybrid AR routing

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
        console.log('WebXR not available (navigator.xr is undefined)');
        return false;
    }
    
    try {
        const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
        console.log('WebXR immersive-ar support:', isSupported);
        return isSupported;
    } catch (error) {
        console.error('Error checking WebXR support:', error);
        return false;
    }
}

// ============================================================================
// IMAGE TRACKING FEATURE CHECK
// ============================================================================

async function checkImageTrackingSupport() {
    if (!navigator.xr) {
        return false;
    }
    
    try {
        // Check if image tracking is available as a feature
        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local'],
            optionalFeatures: ['image-tracking']
        });
        
        // If we got here, image tracking might be available
        // We'll need to actually try to use it to know for sure
        session.end();
        return true;
    } catch (error) {
        console.log('Image tracking not available:', error);
        return false;
    }
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

async function detectARCapabilities() {
    const platform = detectPlatform();
    const webxrSupported = await checkWebXRSupport();
    
    const capabilities = {
        platform,
        webxrSupported,
        useWebXR: platform.isAndroid && webxrSupported,
        useMindAR: !webxrSupported || platform.isIOS
    };
    
    console.log('AR Capabilities Detection:', {
        platform: platform.isIOS ? 'iOS' : platform.isAndroid ? 'Android' : 'Other',
        webxrSupported,
        willUse: capabilities.useWebXR ? 'WebXR' : 'MindAR'
    });
    
    return capabilities;
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectPlatform, checkWebXRSupport, detectARCapabilities };
} else {
    window.PlatformDetector = {
        detectPlatform,
        checkWebXRSupport,
        detectARCapabilities
    };
}




