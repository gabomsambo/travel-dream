# Complete Leaflet Fix - All Issues Resolved

## Problems Encountered

### 1. Initial Error
```
Module not found: Can't resolve 'react-leaflet'
```

### 2. Second Error (After First Fix)
```
Module not found: Can't resolve 'leaflet/dist/leaflet.css'
Module not found: Can't resolve 'react-leaflet'
```

## Root Causes

1. **Server-Side Resolution**: Next.js was trying to bundle Leaflet packages during server-side rendering, but Leaflet requires browser APIs
2. **CSS Import**: CSS import in the component was being resolved during build, causing module resolution failures
3. **Package Lock**: package-lock.json was out of sync with package.json after installing Leaflet packages

## Complete Solution

### 1. Update next.config.js

Added configuration to exclude Leaflet from server-side bundle and enable transpilation:

```javascript
const nextConfig = {
  transpilePackages: ['leaflet', 'react-leaflet', 'react-leaflet-cluster'],
  webpack: (config, { isServer }) => {
    // Don't attempt to bundle Leaflet on server-side
    if (isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        'leaflet': false,
        'react-leaflet': false,
        'react-leaflet-cluster': false,
      };
    }
    return config;
  },
}
```

**What this does:**
- `transpilePackages`: Tells Next.js to transpile these ESM packages
- `webpack.resolve.alias`: Sets packages to `false` on server, preventing resolution

### 2. Move CSS Import to Global Stylesheet

**Before** (in component):
```tsx
// src/components/library/place-map-internal.tsx
import 'leaflet/dist/leaflet.css'
```

**After** (in global CSS):
```css
/* src/styles/globals.css */
@import 'leaflet/dist/leaflet.css';
```

**Why**: Global CSS imports are handled differently by Next.js and don't cause module resolution issues.

### 3. Update package-lock.json

```bash
npm install
```

This synchronized package-lock.json with package.json after installing Leaflet dependencies.

### 4. Rebuild Docker Container

```bash
docker-compose down
docker-compose up --build -d
```

## Files Modified

1. **next.config.js**
   - Added `transpilePackages` configuration
   - Updated webpack config to alias Leaflet packages to `false` on server

2. **src/styles/globals.css**
   - Added `@import 'leaflet/dist/leaflet.css';`

3. **src/components/library/place-map-internal.tsx**
   - Removed `import 'leaflet/dist/leaflet.css'`

4. **package-lock.json**
   - Regenerated to sync with package.json

## Verification

After applying all fixes:

✅ Docker builds successfully
✅ Next.js starts without errors
✅ Library page loads correctly
✅ Map view renders with Leaflet
✅ No module resolution errors

```bash
# Check logs
docker-compose logs travel-dreams

# Output:
✓ Ready in 3.9s
```

## How to Test

1. **Access the application**:
   ```
   http://localhost:3000
   ```

2. **Navigate to Library page**:
   ```
   http://localhost:3000/library
   ```

3. **Switch to Map view**:
   - Click the Map icon in the view switcher
   - Map should load with OpenStreetMap tiles
   - Places with coordinates appear as markers

4. **Test interactions**:
   - Click markers to see place popups
   - Pan and zoom the map
   - Click "View Details" in popups

## Why This Approach Works

### transpilePackages
Leaflet and react-leaflet are ESM modules that need transpilation for Next.js. This ensures they're properly bundled for the client.

### webpack.resolve.alias = false
Setting packages to `false` tells webpack: "Don't try to resolve these on the server." This prevents:
- Server-side import errors
- Window/document undefined errors
- Build failures during SSR analysis

### Global CSS Import
CSS imports in global stylesheets are handled by Next.js's CSS pipeline, which:
- Doesn't trigger module resolution in components
- Works correctly with dynamic imports
- Loads once for the entire app

### Dynamic Import with ssr: false
The component wrapper already uses:
```tsx
const PlaceMapInternal = dynamic(() => import('./place-map-internal'), {
  ssr: false,
});
```

Combined with the webpack config, this ensures:
- No server-side execution
- No server-side bundling
- Client-only loading

## Troubleshooting

### If Map Still Doesn't Load

1. **Clear Next.js cache**:
   ```bash
   docker-compose exec travel-dreams rm -rf .next
   docker-compose restart travel-dreams
   ```

2. **Check browser console** for errors

3. **Verify CSS loaded**:
   - Open browser DevTools → Network
   - Look for `leaflet.css` in loaded files

### If Build Fails Again

1. **Ensure package-lock.json is committed**:
   ```bash
   git add package-lock.json
   git commit -m "Update package-lock.json for Leaflet"
   ```

2. **Clean rebuild**:
   ```bash
   docker-compose down -v
   docker-compose build --no-cache
   docker-compose up -d
   ```

## Related Documentation

- **DOCKER.md** - Complete Docker setup guide
- **LEAFLET_FIX.md** - Initial fix attempt (superseded by this doc)
- **next.config.js** - See inline comments for Leaflet configuration

## Summary

The complete fix required three changes:

1. ✅ Configure webpack to exclude Leaflet from server bundle
2. ✅ Move CSS import to global stylesheet
3. ✅ Sync package-lock.json

All changes are now in place and the map feature works correctly in both local and Docker environments.
