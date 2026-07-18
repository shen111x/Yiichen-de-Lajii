# Three.js vendor files

This directory contains the Three.js files used by DeLajii Terminal.

- Package: `three`
- Version: `0.185.1`
- Source: the official npm package
- License: MIT; see `LICENSE`

Only the WebGL module, GLTF/OBJ/MTL loaders, and the two utilities required by
GLTFLoader are included. The site loads these files directly through the import
map in `../index.html`; no runtime CDN transformation or Vite build is required.
