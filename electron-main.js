
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;
const PORT = 5000;

// Configurar pasta de dados do usuário
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'db');

// Criar pasta db se não existir
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
}

// Copiar banco de dados se não existir
const sourceBD = path.join(__dirname, 'db', 'aih.db');
const targetDB = path.join(dbPath, 'aih.db');

if (fs.existsSync(sourceBD) && !fs.existsSync(targetDB)) {
    fs.copyFileSync(sourceBD, targetDB);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        title: 'Sistema de Controle de AIH',
        show: false
    });

    // Aguardar servidor iniciar antes de carregar a página
    setTimeout(() => {
        mainWindow.loadURL(`http://localhost:${PORT}`);
        mainWindow.show();
    }, 3000);

    // Configurar menu
    createMenu();

    // Eventos da janela
    mainWindow.on('closed', () => {
        mainWindow = null;
        if (serverProcess) {
            serverProcess.kill();
        }
    });

    // Abrir links externos no navegador padrão
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

function startServer() {
    const serverScript = path.join(__dirname, 'server-desktop.js');
    
    serverProcess = spawn('node', [serverScript], {
        env: {
            ...process.env,
            USER_DATA_PATH: userDataPath,
            PORT: PORT
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (data) => {
        console.log(`Server: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`Server Error: ${data}`);
    });

    serverProcess.on('close', (code) => {
        console.log(`Server process exited with code ${code}`);
    });
}

function createMenu() {
    const template = [
        {
            label: 'Arquivo',
            submenu: [
                {
                    label: 'Nova Janela',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        createWindow();
                    }
                },
                {
                    label: 'Backup',
                    click: async () => {
                        const result = await dialog.showSaveDialog(mainWindow, {
                            defaultPath: `backup-aih-${new Date().toISOString().split('T')[0]}.db`,
                            filters: [
                                { name: 'Database', extensions: ['db'] }
                            ]
                        });

                        if (!result.canceled) {
                            try {
                                fs.copyFileSync(targetDB, result.filePath);
                                dialog.showMessageBox(mainWindow, {
                                    type: 'info',
                                    title: 'Backup',
                                    message: 'Backup criado com sucesso!'
                                });
                            } catch (err) {
                                dialog.showErrorBox('Erro', 'Erro ao criar backup: ' + err.message);
                            }
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Sair',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Editar',
            submenu: [
                { role: 'undo', label: 'Desfazer' },
                { role: 'redo', label: 'Refazer' },
                { type: 'separator' },
                { role: 'cut', label: 'Recortar' },
                { role: 'copy', label: 'Copiar' },
                { role: 'paste', label: 'Colar' },
                { role: 'selectall', label: 'Selecionar Tudo' }
            ]
        },
        {
            label: 'Visualizar',
            submenu: [
                { role: 'reload', label: 'Recarregar' },
                { role: 'forceReload', label: 'Forçar Recarregamento' },
                { role: 'toggleDevTools', label: 'Ferramentas do Desenvolvedor' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Zoom Normal' },
                { role: 'zoomIn', label: 'Aumentar Zoom' },
                { role: 'zoomOut', label: 'Diminuir Zoom' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Tela Cheia' }
            ]
        },
        {
            label: 'Ajuda',
            submenu: [
                {
                    label: 'Sobre',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Sobre',
                            message: 'Sistema de Controle de AIH',
                            detail: 'Versão 1.0.0\nDesenvolvido por Gustavo Cambraia'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Eventos do app
app.whenReady().then(() => {
    startServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});

// Prevenir navegação não autorizada
app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        
        if (parsedUrl.origin !== `http://localhost:${PORT}`) {
            event.preventDefault();
        }
    });
});
