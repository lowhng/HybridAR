// Platform Detection Module
// Detects platform and WebXR support for routing to WebXR (Variant Launch handles iOS viewer)

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
// VARIANT LAUNCH SDK INITIALIZATION CHECK
// ============================================================================

/**
 * Waits for Variant Launch SDK to be fully initialized
 * The SDK needs time to set up navigator.xr properly
 */
async function waitForVariantLaunchSDK() {
    const platform = detectPlatform();
    
    // Only wait for SDK on iOS (where Variant Launch is used)
    if (!platform.isIOS) {
        return true;
    }
    
    // Check if Variant Launch SDK script is present
    const scripts = Array.from(document.getElementsByTagName('script'));
    const hasVariantLaunch = scripts.some(script => 
        script.src && script.src.includes('launchar.app/sdk')
    );
    
    if (!hasVariantLaunch) {
        console.log('Variant Launch SDK not detected, skipping wait');
        return true;
    }
    
    console.log('Waiting for Variant Launch SDK to initialize...');
    
    // Wait for navigator.xr to be available
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    while (!navigator.xr && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (!navigator.xr) {
        console.warn('Variant Launch SDK did not initialize navigator.xr after waiting');
        return false;
    }
    
    // Additional wait to ensure SDK is fully ready
    // The SDK might need a moment to set up internal state
    await new Promise(resolve => setTimeout(resolve, 300));
    
    console.log('Variant Launch SDK appears to be ready');
    return true;
}

// ============================================================================
// WEBXR SUPPORT CHECK
// ============================================================================

async function checkWebXRSupport() {
    // Wait for Variant Launch SDK to initialize first (especially important for iOS)
    await waitForVariantLaunchSDK();
    
    if (!navigator.xr) {
        console.log('WebXR not available (navigator.xr is undefined)');
        return false;
    }
    
    // Add defensive check - ensure navigator.xr has the expected methods
    if (typeof navigator.xr.isSessionSupported !== 'function') {
        console.error('navigator.xr.isSessionSupported is not a function');
        return false;
    }
    
    try {
        const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
        console.log('WebXR immersive-ar support:', isSupported);
        return isSupported;
    } catch (error) {
        console.error('Error checking WebXR support:', error);
        // Log more details about the error for debugging
        if (error.message) {
            console.error('Error message:', error.message);
        }
        if (error.stack) {
            console.error('Error stack:', error.stack);
        }
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
        // With Variant Launch, iOS gets a WebXR-capable viewer, so we always prefer WebXR
        useWebXR: webxrSupported
    };
    
    console.log('AR Capabilities Detection:', {
        platform: platform.isIOS ? 'iOS' : platform.isAndroid ? 'Android' : 'Other',
        webxrSupported,
        willUse: capabilities.useWebXR ? 'WebXR' : 'None (no fallback)'
    });
    
    return capabilities;
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectPlatform, checkWebXRSupport, detectARCapabilities, waitForVariantLaunchSDK };
} else {
    window.PlatformDetector = {
        detectPlatform,
        checkWebXRSupport,
        detectARCapabilities,
        waitForVariantLaunchSDK
    };
}




