import {execSync, spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {getConfigDir, getCacheDir, loadConfig} from '@mutimemoagent/sdk';

export interface DashboardOptionsCLI {
  port?: string;
}

/**
 * `memograph dashboard` — 启动仪表盘
 *
 * 使用 Vite 提供的预览服务器 (dashboard 目录需要先构建好)
 * 或直接启动 Caddy/Nginx 静态服务器
 */
export async function dashboardCommand(options: DashboardOptionsCLI): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║         Memograph Dashboard              ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  const port = parseInt(options.port || '4173', 10);
  const workspaceRoot = path.resolve(
    import.meta.url
      .replace(/^file:\/\//, '')
      .replace(/\\/g, '/')
      .replace(/\/cli\/dist\/.*$/, '')
  );

  const dashboardDir = path.join(workspaceRoot, 'dashboard', 'dist');

  try {
    // 检查 dashboard 是否已构建
    if (!fs.existsSync(dashboardDir) || !fs.existsSync(path.join(dashboardDir, 'index.html'))) {
      console.log('  🏗️  Dashboard not built. Building...');
      console.log('');

      try {
        execSync('pnpm --filter dashboard build', {
          cwd: workspaceRoot,
          stdio: 'inherit',
        });
      } catch {
        console.log('  ⚠️  Could not build dashboard automatically.');
        console.log('  💡 Try: cd dashboard && npm run build');
        console.log('  💡 Or run: pnpm --filter dashboard build');
        console.log('');
        console.log('  Starting fallback server...');
      }
    }

    // 配置数据
    const configDir = getConfigDir();
    const cacheDir = getCacheDir();

    console.log('  🚀 Starting dashboard...');
    console.log(`     Port:    ${port}`);
    console.log(`     Config:  ${configDir}`);
    console.log(`     Cache:   ${cacheDir}`);
    console.log('');

    if (fs.existsSync(dashboardDir)) {
      // 使用预览服务器 (使用 Vite preview)
      const previewServer = spawn(
        'npx',
        ['vite', 'preview', '--port', String(port), '--strictPort'],
        {
          cwd: path.join(workspaceRoot, 'dashboard'),
          stdio: 'inherit',
          shell: true,
        }
      );

      previewServer.on('error', (err) => {
        console.log('  ⚠️  Vite preview failed, starting static file server...');
        startFallbackServer(dashboardDir, port);
      });

      previewServer.on('exit', (code) => {
        if (code !== 0) {
          console.log(`  ⚠️  Preview server exited with code ${code}, starting fallback...`);
          startFallbackServer(dashboardDir, port);
        }
      });

      console.log(`  ✅ Dashboard running at http://localhost:${port}`);
      console.log('  Press Ctrl+C to stop');
      console.log('');
    } else {
      startFallbackServer(dashboardDir, port);
    }
  } catch (err) {
    console.error('  ❌ Failed to start dashboard:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * 回退方案: 使用 Node.js 内置 http 模块提供静态文件
 */
function startFallbackServer(dashboardDir: string, port: number): void {
  console.log('  📁 Starting built-in static file server...');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const http = require('node:http');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const url = require('node:url');

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req: any, res: any) => {
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    // 默认 index.html
    if (pathname === '/') pathname = '/index.html';

    const filePath = path.join(dashboardDir, pathname);
    const ext = path.extname(filePath);

    fs.readFile(filePath, (err: Error | null, data: Buffer) => {
      if (err) {
        // SPA fallback: 返回 index.html
        fs.readFile(path.join(dashboardDir, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.end(data2);
        });
        return;
      }
      res.writeHead(200, {'Content-Type': mimeTypes[ext] || 'application/octet-stream'});
      res.end(data);
    });
  });

  server.listen(port, () => {
    console.log(`  ✅ Dashboard running at http://localhost:${port}`);
    console.log('  Press Ctrl+C to stop');
    console.log('');
  });
}
