# MindAR Image Tracking

A web-based Augmented Reality application using MindAR and Three.js for image tracking.

## Features

- Image target tracking using MindAR
- 3D cube visualization with freeze/reposition functionality
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

- The `targets.mind` file must be generated using the [MindAR target creator](https://hiukim.github.io/mind-ar-js-doc/tools/compile)
- The application requires HTTPS to access the camera (Vercel provides this automatically)
- Make sure the `targets.mind` file is included in your repository

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
│   │   ├── targets.mind    # AR tracking target (required)
│   │   └── cube.png       # Cube texture (optional)
│   ├── index.html
│   ├── main.js
│   └── styles.css
├── vercel.json
├── package.json
└── README.md
```

## Requirements

- Modern browser with WebRTC support (for camera access)
- HTTPS connection (required for camera access)
- Image target file (`targets.mind`)

