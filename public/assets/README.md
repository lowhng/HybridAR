# Assets Directory

This directory contains the 3D model assets for the WebXR AR experience.

## 3D Model Files

### wire.glb
- **Purpose**: 3D wire model displayed on wall surfaces
- **Format**: GLB (binary GLTF)
- **Usage**: Automatically loaded when user places content on a wall surface

### puddle.glb
- **Purpose**: 3D puddle model displayed on floor surfaces
- **Format**: GLB (binary GLTF)
- **Usage**: Automatically loaded when user places content on a floor surface

### wireori.glb
- **Purpose**: Alternative wire model (backup/original version)
- **Format**: GLB (binary GLTF)
- **Usage**: Available for use if needed

## File Structure

```
/assets
  wire.glb          (3D model for wall surfaces)
  puddle.glb        (3D model for floor surfaces)
  wireori.glb       (Alternative wire model)
```

## Notes

- All models are automatically scaled and positioned when placed in AR
- Models are loaded using Three.js GLTFLoader
- Models should be optimized for web use (reasonable file sizes)

