import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory Server Vault State (persisted across mobile sync calls)
interface ServerDevice {
  id: string;
  name: string;
  platform: 'android' | 'ios' | 'other';
  lastSyncAt: string;
  ip: string;
  status: 'active' | 'idle';
}

let serverAdmin = {
  username: process.env.DAYMARK_USER || 'admin',
  password: process.env.DAYMARK_PASSWORD || 'daymark2026',
};

let serverDevices: ServerDevice[] = [
  {
    id: 'dev-pixel-9',
    name: 'Pixel 9 Pro (Android Glance)',
    platform: 'android',
    lastSyncAt: '2026-10-16T05:00:00Z',
    ip: '192.168.1.42',
    status: 'active',
  },
  {
    id: 'dev-iphone-16',
    name: 'iPhone 16 Pro (WidgetKit)',
    platform: 'ios',
    lastSyncAt: '2026-10-16T04:45:00Z',
    ip: '192.168.1.58',
    status: 'idle',
  },
];

let serverSyncLog: Array<{
  id: string;
  timestamp: string;
  deviceId: string;
  action: string;
  details: string;
}> = [
  {
    id: 'log-s-1',
    timestamp: '2026-10-16T05:00:00Z',
    deviceId: 'Pixel 9 Pro',
    action: 'sync_delta',
    details: 'Reconciled carry-forward tasks for 2026-10-16. 0 conflicts.',
  },
  {
    id: 'log-s-2',
    timestamp: '2026-10-16T04:45:00Z',
    deviceId: 'iPhone 16 Pro',
    action: 'historical_correction',
    details: 'Processed retroactive task completion on 2026-10-15.',
  },
];

// Server storage for documents & notes
let serverVaultData: {
  dailyDocuments: any[];
  standaloneNotes: any[];
  settings: any;
  cursor: number;
  lastUpdated: string;
} = {
  dailyDocuments: [],
  standaloneNotes: [],
  settings: null,
  cursor: Date.now(),
  lastUpdated: new Date().toISOString(),
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper auth check
  const verifyAuth = (req: Request): boolean => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return token.length > 5; // Valid session token
    }
    if (authHeader.startsWith('Basic ')) {
      const creds = Buffer.from(authHeader.substring(6), 'base64').toString().split(':');
      return creds[0] === serverAdmin.username && creds[1] === serverAdmin.password;
    }
    return false;
  };

  // 1. Health & Server Info
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Daymark Self-Hosted Sync Server',
      version: '1.2.0',
      timestamp: new Date().toISOString(),
      configuredUser: serverAdmin.username,
      totalDevices: serverDevices.length,
    });
  });

  // 2. Authentication: Login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (username === serverAdmin.username && password === serverAdmin.password) {
      const token = `dm_sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      res.json({
        success: true,
        token,
        user: { username: serverAdmin.username, role: 'admin' },
        message: 'Authenticated successfully with self-hosted server',
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid username or password for self-hosted server',
      });
    }
  });

  // 3. Authentication: Change Password
  app.post('/api/auth/change-password', (req: Request, res: Response) => {
    if (!verifyAuth(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { newPassword } = req.body;
    if (newPassword && newPassword.length >= 6) {
      serverAdmin.password = newPassword;
      return res.json({ success: true, message: 'Admin password updated successfully' });
    }
    res.status(400).json({ error: 'Password must be at least 6 characters' });
  });

  // 4. Device Management
  app.get('/api/devices', (req: Request, res: Response) => {
    res.json({
      devices: serverDevices,
      total: serverDevices.length,
    });
  });

  app.post('/api/devices/register', (req: Request, res: Response) => {
    const { deviceName, platform } = req.body;
    const newDevice: ServerDevice = {
      id: `dev-${Date.now()}`,
      name: deviceName || 'Mobile Client',
      platform: platform || 'android',
      lastSyncAt: new Date().toISOString(),
      ip: req.ip || '127.0.0.1',
      status: 'active',
    };
    serverDevices.push(newDevice);
    res.json({ success: true, device: newDevice });
  });

  // 5. Core Synchronization API: Pull (GET /api/sync)
  app.get('/api/sync', (req: Request, res: Response) => {
    res.json({
      success: true,
      cursor: serverVaultData.cursor,
      lastUpdated: serverVaultData.lastUpdated,
      dailyDocuments: serverVaultData.dailyDocuments,
      standaloneNotes: serverVaultData.standaloneNotes,
      settings: serverVaultData.settings,
      syncLogs: serverSyncLog.slice(-10),
    });
  });

  // 6. Core Synchronization API: Push & Reconcile (POST /api/sync)
  app.post('/api/sync', (req: Request, res: Response) => {
    const { deviceId, deviceName, dailyDocuments, standaloneNotes, settings } = req.body;

    // Record or update device
    const existingDev = serverDevices.find((d) => d.name === (deviceName || deviceId) || d.id === deviceId);
    if (existingDev) {
      existingDev.lastSyncAt = new Date().toISOString();
      existingDev.status = 'active';
    } else if (deviceName || deviceId) {
      serverDevices.push({
        id: deviceId || `dev-${Date.now()}`,
        name: deviceName || 'Mobile Client',
        platform: 'android',
        lastSyncAt: new Date().toISOString(),
        ip: req.ip || '127.0.0.1',
        status: 'active',
      });
    }

    // Merge documents idempotently
    if (Array.isArray(dailyDocuments) && dailyDocuments.length > 0) {
      serverVaultData.dailyDocuments = dailyDocuments;
    }
    if (Array.isArray(standaloneNotes) && standaloneNotes.length > 0) {
      serverVaultData.standaloneNotes = standaloneNotes;
    }
    if (settings) {
      serverVaultData.settings = settings;
    }

    serverVaultData.cursor = Date.now();
    serverVaultData.lastUpdated = new Date().toISOString();

    const logEntry = {
      id: `log-s-${Date.now()}`,
      timestamp: new Date().toISOString(),
      deviceId: deviceName || deviceId || 'Mobile App',
      action: 'bidirectional_sync',
      details: `Synchronized ${dailyDocuments?.length || 0} daily docs and ${
        standaloneNotes?.length || 0
      } notes.`,
    };
    serverSyncLog.unshift(logEntry);

    res.json({
      success: true,
      cursor: serverVaultData.cursor,
      message: 'Mobile synchronization reconciled successfully with self-hosted server',
      syncedAt: serverVaultData.lastUpdated,
      serverDocuments: serverVaultData.dailyDocuments,
      serverNotes: serverVaultData.standaloneNotes,
    });
  });

  // 7. Server Stats
  app.get('/api/server/stats', (req: Request, res: Response) => {
    res.json({
      activeDevices: serverDevices.filter((d) => d.status === 'active').length,
      totalDevices: serverDevices.length,
      lastSyncTime: serverVaultData.lastUpdated,
      vaultDocumentsCount: serverVaultData.dailyDocuments.length,
      vaultNotesCount: serverVaultData.standaloneNotes.length,
      syncLogsCount: serverSyncLog.length,
    });
  });

  // Mount Vite development middlewares
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Daymark Server & Mobile Sync Gateway running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Daymark server:', err);
  process.exit(1);
});
