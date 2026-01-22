// Toast Notification System
// Displays errors and logs on screen for debugging (especially useful on iOS)

// ============================================================================
// TOAST UTILITY
// ============================================================================

let toastContainer = null;
let toastCount = 0;
const MAX_TOASTS = 5; // Maximum number of toasts to show at once

/**
 * Check if debug mode is enabled
 * @returns {boolean} True if debug mode is enabled
 */
function isDebugMode() {
    // Check if WebXRAR is available and debug mode is enabled
    if (typeof window !== 'undefined' && window.WebXRAR && typeof window.WebXRAR.debugMode === 'function') {
        return window.WebXRAR.debugMode();
    }
    return false;
}

function getToastContainer() {
    if (!toastContainer) {
        toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            // Create container if it doesn't exist
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
    }
    return toastContainer;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'error', 'warning', 'info', 'success' (default: 'info')
 * @param {number} duration - Duration in milliseconds (0 = don't auto-remove, default: 5000)
 * @param {string} title - Optional title for the toast
 * @param {boolean} isDebug - If true, only show when debug mode is enabled (default: false)
 */
function showToast(message, type = 'info', duration = 5000, title = null, isDebug = false) {
    // Skip debug toasts if debug mode is not enabled
    if (isDebug && !isDebugMode()) {
        return null;
    }
    
    const container = getToastContainer();
    
    // Limit number of toasts
    const existingToasts = container.querySelectorAll('.toast');
    if (existingToasts.length >= MAX_TOASTS) {
        // Remove oldest toast
        existingToasts[0].remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toastCount++;
    const toastId = `toast-${toastCount}`;
    toast.id = toastId;
    
    // Build toast content
    let content = '';
    if (title) {
        content += `<div class="toast-title">${escapeHtml(title)}</div>`;
    }
    content += `<div class="toast-message">${escapeHtml(String(message))}</div>`;
    content += `<button class="toast-close" onclick="document.getElementById('${toastId}').remove()">×</button>`;
    
    toast.innerHTML = content;
    
    // Add to container
    container.appendChild(toast);
    
    // Auto-remove after duration (if specified)
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('fade-out');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }
        }, duration);
    }
    
    return toast;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show error toast
 * @param {boolean} isDebug - If true, only show when debug mode is enabled (default: false)
 */
function showError(message, title = 'Error', duration = 8000, isDebug = false) {
    return showToast(message, 'error', duration, title, isDebug);
}

/**
 * Show warning toast
 * @param {boolean} isDebug - If true, only show when debug mode is enabled (default: false)
 */
function showWarning(message, title = 'Warning', duration = 6000, isDebug = false) {
    return showToast(message, 'warning', duration, title, isDebug);
}

/**
 * Show info toast
 * @param {boolean} isDebug - If true, only show when debug mode is enabled (default: false)
 */
function showInfo(message, title = 'Info', duration = 4000, isDebug = false) {
    return showToast(message, 'info', duration, title, isDebug);
}

/**
 * Show success toast
 * @param {boolean} isDebug - If true, only show when debug mode is enabled (default: false)
 */
function showSuccess(message, title = 'Success', duration = 3000, isDebug = false) {
    return showToast(message, 'success', duration, title, isDebug);
}

// ============================================================================
// CONSOLE INTERCEPTION
// ============================================================================

// Store original console methods
const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console)
};

// Intercept console.error and show toast (only in debug mode)
console.error = function(...args) {
    originalConsole.error(...args);
    // Only show console errors as toasts in debug mode
    if (isDebugMode()) {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
        
        // Truncate very long messages
        const displayMessage = message.length > 300 ? message.substring(0, 300) + '...' : message;
        showError(displayMessage, 'Console Error', 10000, true);
    }
};

// Intercept console.warn and show toast (only in debug mode)
console.warn = function(...args) {
    originalConsole.warn(...args);
    // Only show console warnings as toasts in debug mode
    if (isDebugMode()) {
        const message = args.map(arg => String(arg)).join(' ');
        const displayMessage = message.length > 300 ? message.substring(0, 300) + '...' : message;
        showWarning(displayMessage, 'Console Warning', 6000, true);
    }
};

// Optionally intercept console.log for important messages
// (commented out to avoid spam, but can be enabled for debugging)
/*
console.log = function(...args) {
    originalConsole.log(...args);
    // Only show logs that contain certain keywords
    const message = args.map(arg => String(arg)).join(' ');
    if (message.includes('Error') || message.includes('Failed') || message.includes('WebXR')) {
        const displayMessage = message.length > 200 ? message.substring(0, 200) + '...' : message;
        showInfo(displayMessage, 'Log', 3000);
    }
};
*/

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Global error handler (only show in debug mode)
window.addEventListener('error', (event) => {
    const errorMessage = `${event.message}\n${event.filename}:${event.lineno}:${event.colno}`;
    if (isDebugMode()) {
        showError(errorMessage, 'JavaScript Error', 10000, true);
    }
    originalConsole.error('Global error:', event);
});

// Unhandled promise rejection handler (only show in debug mode)
window.addEventListener('unhandledrejection', (event) => {
    const errorMessage = event.reason ? 
        (event.reason.message || String(event.reason)) : 
        'Unhandled Promise Rejection';
    if (isDebugMode()) {
        showError(errorMessage, 'Promise Rejection', 10000, true);
    }
    originalConsole.error('Unhandled rejection:', event.reason);
});

// ============================================================================
// EXPORT
// ============================================================================

if (typeof window !== 'undefined') {
    window.Toast = {
        show: showToast,
        error: showError,
        warning: showWarning,
        info: showInfo,
        success: showSuccess
    };
}

