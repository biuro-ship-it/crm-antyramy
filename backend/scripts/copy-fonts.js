const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'fonts');
const dest = path.join(__dirname, '..', 'dist', 'fonts');

fs.mkdirSync(dest, { recursive: true });
for (const file of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
}
console.log('Fonts copied to dist/fonts');
