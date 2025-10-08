# Leaflet Module Resolution Fix

## Problem

When trying to access the library page, you encountered this error:

```
Build Error: Module not found: Can't resolve 'react-leaflet'
```

Even though the packages were installed in `node_modules`.

## Root Cause

Next.js was trying to bundle Leaflet (a client-side only library) during server-side rendering (SSR). Even though we used `dynamic import` with `ssr: false`, Next.js still analyzes all imports during the build phase to understand dependencies.

Leaflet requires browser APIs (like `window` and `document`) which don't exist on the server, causing the build to fail when Next.js tried to resolve these modules for the server bundle.

## Solution

Updated `next.config.js` to explicitly exclude Leaflet packages from the server-side webpack bundle:

```javascript
webpack: (config, { isServer }) => {
  // ... existing config

  // Exclude Leaflet and related packages from server-side bundle
  if (isServer) {
    config.externals.push({
      'leaflet': 'commonjs leaflet',
      'react-leaflet': 'commonjs react-leaflet',
      'react-leaflet-cluster': 'commonjs react-leaflet-cluster',
    });
  }

  return config;
}
```

This tells webpack:
- ✅ On the **client-side**: Bundle these packages normally
- ✅ On the **server-side**: Don't try to bundle them (they won't be needed anyway)

## Files Changed

1. **next.config.js** - Added webpack externals configuration for Leaflet packages

## Verification

The dev server now starts successfully without errors:

```bash
npm run dev
# ✓ Ready in 1872ms
```

You can now:
1. Visit http://localhost:3000
2. Navigate to the Library page
3. Switch to Map view
4. See the interactive map with place markers

## How Map Loading Works Now

1. **Library page loads** → Server renders HTML without map
2. **Client hydrates** → React takes over in browser
3. **Map view selected** → Dynamic import triggers
4. **Leaflet loads** → Only in browser, with access to window/document
5. **Map renders** → Shows OpenStreetMap tiles and place markers

## Why Dynamic Import + SSR: false Wasn't Enough

Even with `ssr: false`, Next.js still needs to:
1. Parse the file to understand its structure
2. Analyze imports for code splitting
3. Build a dependency graph
4. Create client-side chunks

During this analysis, it tried to resolve `react-leaflet`, which failed because webpack was trying to bundle it for the server too.

The webpack externals configuration tells Next.js: "Don't even try to bundle these on the server."

## Testing the Map Feature

Once your server is running, test the map:

```bash
# 1. Start dev server
npm run dev

# 2. Open in browser
open http://localhost:3000/library

# 3. Switch view to Map
# Click the Map icon in the view switcher

# 4. Verify map loads
# You should see:
# - OpenStreetMap tiles
# - Marker clusters for places with coordinates
# - Popups when clicking markers
```

## For Docker Users

The same fix applies when running in Docker:

```bash
# Rebuild container to pick up the config change
npm run docker:dev:build
```

The webpack configuration is read during the build process, so both local and Docker environments benefit from this fix.

## Related Files

- `src/components/library/place-map-view.tsx` - Wrapper with dynamic import
- `src/components/library/place-map-internal.tsx` - Actual map component
- `src/components/library/library-client.tsx` - View switcher integration
- `next.config.js` - Webpack configuration

## Additional Notes

This pattern applies to any client-side only library:
- Chart libraries that need Canvas
- Libraries that access localStorage
- Libraries that use browser-specific APIs

If you add more client-only packages in the future, add them to the webpack externals configuration in the same way.

## Quick Reference

**Problem**: Client-only package fails to resolve during build
**Solution**: Add to webpack externals with `isServer` check
**Location**: `next.config.js` → `webpack` → `config.externals.push()`
