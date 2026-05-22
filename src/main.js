const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');

// Resolve ffmpeg/ffprobe paths
function getFfmpegPath() {
  try {
    return require('ffmpeg-static');
  } catch (e) {
    return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  }
}

function getFfprobePath() {
  try {
    return require('ffprobe-static').path;
  } catch (e) {
    return process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  }
}

const ffmpegPath = getFfmpegPath();
const ffprobePath = getFfprobePath();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // needed for local video files
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Sélectionner le répertoire des rushs'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-output-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Sélectionner le répertoire de sortie'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('scan-directory', async (event, dirPath) => {
  const videoExts = ['.mp4', '.mov', '.avi', '.mxf', '.mts', '.m2ts', '.mkv',
    '.wmv', '.flv', '.webm', '.r3d', '.braw', '.arw', '.dng'];
  
  try {
    const files = fs.readdirSync(dirPath);
    const videos = files
      .filter(f => videoExts.includes(path.extname(f).toLowerCase()))
      .sort()
      .map(f => ({
        name: f,
        path: path.join(dirPath, f),
        status: 'pending'
      }));
    return videos;
  } catch (e) {
    return [];
  }
});

ipcMain.handle('get-video-info', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ], (err, stdout) => {
      if (err) {
        resolve({ duration: 0, width: 0, height: 0, codec: 'unknown', fps: 25 });
        return;
      }
      try {
        const info = JSON.parse(stdout);
        const videoStream = info.streams?.find(s => s.codec_type === 'video') || {};
        const format = info.format || {};
        
        let fps = 25;
        if (videoStream.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/');
          fps = parts.length === 2 ? parseFloat(parts[0]) / parseFloat(parts[1]) : parseFloat(parts[0]);
        }

        resolve({
          duration: parseFloat(format.duration) || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          codec: videoStream.codec_name || 'unknown',
          fps: fps,
          bitrate: parseInt(format.bit_rate) || 0,
          size: parseInt(format.size) || 0,
          format: format.format_name || 'unknown'
        });
      } catch (e) {
        resolve({ duration: 0, width: 0, height: 0, codec: 'unknown', fps: 25 });
      }
    });
  });
});

// Find nearest I-frame before a given time
ipcMain.handle('find-nearest-iframe', async (event, filePath, time, direction) => {
  return new Promise((resolve) => {
    // Use ffprobe to find keyframes around the given time
    const searchStart = Math.max(0, time - 10);
    execFile(ffprobePath, [
      '-v', 'quiet',
      '-select_streams', 'v:0',
      '-show_frames',
      '-show_entries', 'frame=pkt_pts_time,key_frame',
      '-read_intervals', `%+#500`, // read up to 500 frames from start
      '-skip_frame', 'noref',
      filePath
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) {
        resolve(time);
        return;
      }
      // Parse keyframe times
      const keyframes = [];
      const lines = stdout.split('\n');
      let currentTime = null;
      let isKey = false;
      for (const line of lines) {
        if (line.startsWith('pkt_pts_time=')) {
          currentTime = parseFloat(line.split('=')[1]);
        } else if (line.startsWith('key_frame=')) {
          isKey = line.split('=')[1].trim() === '1';
          if (isKey && currentTime !== null) {
            keyframes.push(currentTime);
          }
          currentTime = null;
        }
      }
      
      if (keyframes.length === 0) {
        resolve(time);
        return;
      }

      // Find nearest keyframe
      if (direction === 'before') {
        const before = keyframes.filter(t => t <= time);
        resolve(before.length > 0 ? before[before.length - 1] : time);
      } else {
        const after = keyframes.filter(t => t >= time);
        resolve(after.length > 0 ? after[0] : time);
      }
    });
  });
});

ipcMain.handle('export-clips', async (event, clips, outputDir) => {
  const results = [];
  
  for (const clip of clips) {
    if (clip.status === 'deleted') {
      results.push({ name: clip.name, success: true, skipped: true });
      continue;
    }

    const outputPath = path.join(outputDir, clip.name);
    
    try {
      if (clip.status === 'full') {
        // Copy file entirely preserving metadata
        await copyFilePreserving(clip.path, outputPath);
        results.push({ name: clip.name, success: true });
      } else if (clip.status === 'partial') {
        // Cut with ffmpeg, stream copy (no re-encode), cut on I-frames
        await cutVideo(clip.path, outputPath, clip.inPoint, clip.outPoint);
        results.push({ name: clip.name, success: true });
      }
    } catch (e) {
      results.push({ name: clip.name, success: false, error: e.message });
    }

    event.sender.send('export-progress', {
      current: results.length,
      total: clips.filter(c => c.status !== 'deleted').length,
      name: clip.name
    });
  }

  return results;
});

function copyFilePreserving(src, dest) {
  return new Promise((resolve, reject) => {
    fs.copyFile(src, dest, (err) => {
      if (err) reject(err);
      else {
        // Preserve timestamps
        const stat = fs.statSync(src);
        fs.utimesSync(dest, stat.atime, stat.mtime);
        resolve();
      }
    });
  });
}

function cutVideo(inputPath, outputPath, inPoint, outPoint) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', String(inPoint),
      '-to', String(outPoint),
      '-i', inputPath,
      '-c', 'copy',          // stream copy: no re-encode
      '-avoid_negative_ts', '1',
      '-map_metadata', '0',  // copy all metadata
      '-movflags', '+faststart',
      outputPath
    ];

    execFile(ffmpegPath, args, { timeout: 3600000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

ipcMain.handle('open-file', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});
