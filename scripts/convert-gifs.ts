import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const gifsDir = join(__dirname, '../public/gifs');

// Check if ffmpeg is available on the system (e.g. local dev vs remote CI/Vercel)
const hasFfmpeg = spawnSync('which', ['ffmpeg']).status === 0;

if (!hasFfmpeg) {
  console.log('[Media] ffmpeg not found in environment — skipping automatic conversion.');
} else if (existsSync(gifsDir)) {
  const files = readdirSync(gifsDir);
  for (const file of files) {
    if (file.endsWith('.gif')) {
      const name = file.replace(/\.gif$/, '');
      const gifPath = join(gifsDir, file);
      const mp4Path = join(gifsDir, `${name}.mp4`);

      // Convert if mp4 doesn't exist or is older than the gif
      let shouldConvert = false;
      if (!existsSync(mp4Path)) {
        shouldConvert = true;
      } else {
        const gifStat = statSync(gifPath);
        const mp4Stat = statSync(mp4Path);
        if (gifStat.mtimeMs > mp4Stat.mtimeMs) {
          shouldConvert = true;
        }
      }

      if (shouldConvert) {
        console.log(`[Media] Converting ${file} -> ${name}.mp4...`);
        const res = spawnSync(
          'ffmpeg',
          [
            '-i',
            gifPath,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-crf',
            '22',
            '-movflags',
            '+faststart',
            '-y',
            mp4Path,
          ],
          { stdio: 'inherit' }
        );

        if (res.status === 0) {
          console.log(`[Media] ✓ Successfully generated ${name}.mp4`);
        } else {
          console.warn(`[Media] ⚠ Could not convert ${file}`);
        }
      }
    }
  }
}
