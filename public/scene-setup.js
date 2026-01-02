// Shared Scene Setup for Three.js
// Common code for cube creation, lighting, etc. (optional optimization)

// ============================================================================
// CREATE CUBE
// ============================================================================

function createCube() {
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    
    // Load texture (fallback to colored material if texture not available)
    const textureLoader = new THREE.TextureLoader();
    const cubeTexture = textureLoader.load(
        './assets/cube.png',
        () => {
            console.log('Cube texture loaded');
        },
        undefined,
        () => {
            console.warn('Cube texture not found, using colored material');
        }
    );
    
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        metalness: 0.2,
        roughness: 0.6,
    });
    
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        wireframe: true
    });
    
    const cubeMesh = new THREE.Mesh(geometry, material);
    cubeMesh.position.set(0, 0.1, 0);
    
    const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
    wireframeMesh.position.copy(cubeMesh.position);
    
    return { cubeMesh, wireframeMesh };
}

// ============================================================================
// CREATE LIGHTING
// ============================================================================

function createLighting(scene) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);
    
    return { ambientLight, directionalLight };
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createCube, createLighting };
} else {
    window.SceneSetup = {
        createCube,
        createLighting
    };
}

