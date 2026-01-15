# WebXR AR Experience

A web-based Augmented Reality application using WebXR and Three.js for immersive AR experiences.

## Features

- WebXR immersive AR support (iOS via Variant Launch, Android via Chrome)
- 3D model visualization with surface detection (walls and floors)
- Interactive quiz system
- Mobile-friendly interface
- Real-time AR tracking

## Deployment to Vercel

### Option 1: Using Vercel CLI (Recommended)

1. Install Vercel CLI (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. For production deployment:
   ```bash
   vercel --prod
   ```

### Option 2: Using Vercel Dashboard

1. Push your code to GitHub, GitLab, or Bitbucket
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "Add New Project"
4. Import your repository
5. **Important**: In the project settings, set the **Root Directory** to `public`
6. Click "Deploy"

### Option 3: Using GitHub Integration

1. Connect your GitHub account to Vercel
2. Import the repository
3. Set **Root Directory** to `public` in project settings
4. Vercel will automatically deploy on every push

## Important Notes

- The application requires HTTPS to access the camera (Vercel provides this automatically)
- WebXR immersive-ar support is required (iOS uses Variant Launch SDK, Android uses Chrome)
- 3D models (GLB files) are stored in the `assets` folder

## Local Development

To run locally:

```bash
npm run dev
```

Or use any static file server:

```bash
npx serve public
```

## File Structure

```
MindAR/
├── public/
│   ├── assets/
│   │   ├── wire.glb       # 3D model for wall surfaces
│   │   ├── puddle.glb     # 3D model for floor surfaces
│   │   └── wireori.glb    # Alternative wire model
│   ├── index.html
│   ├── main-webxr.js     # WebXR AR implementation
│   ├── ar-controller.js  # AR system controller
│   ├── quiz.js           # Quiz system
│   └── styles.css
├── vercel.json
├── package.json
└── README.md
```

## Requirements

- Modern browser with WebXR support
- iOS: Variant Launch viewer (SDK included)
- Android: Chrome browser with WebXR support
- HTTPS connection (required for camera access)




