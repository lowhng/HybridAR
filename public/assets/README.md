# Assets Directory

This directory contains the assets needed for the MindAR image tracking application.

## Required Files

### targets.mind
- **Purpose**: Image target file for MindAR image tracking
- **How to generate**:
  1. Visit the MindAR target creator: https://hiukim.github.io/mind-ar-js-doc/tools/compile
  2. Upload an image (JPG or PNG) that you want to use as a tracking target
  3. Download the generated `.mind` file
  4. Place it in this directory as `targets.mind`

### target-image.jpg (or .png)
- **Purpose**: Original image file for WebXR image tracking (Android devices)
- **Format**: JPG or PNG image (same image used to create targets.mind)
- **Physical Dimensions**: 9cm x 5cm (0.09m x 0.05m) - namecard size
- **How to add**: Use the same image file that you used to generate targets.mind
- **Note**: Required for WebXR functionality on Android. The app will fall back to MindAR if this file is not available.

### cube.png
- **Purpose**: Texture image for the 3D cube
- **Format**: PNG image (recommended: 512x512 or 1024x1024 pixels)
- **Note**: This is optional - if not provided, the cube will use a solid color material

## File Structure

```
/assets
  targets.mind       (required - generate using MindAR target creator)
  target-image.jpg   (required for WebXR - same image as used for targets.mind)
  cube.png           (optional - texture for 3D cube)
```

