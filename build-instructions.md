
# Sistema AIH Desktop - Instruções de Build

## Preparação

1. **Instalar dependências:**
```bash
npm install --save-dev electron electron-builder
npm install
```

2. **Criar pasta de assets:**
```bash
mkdir assets
```

3. **Adicionar ícones:**
- `assets/icon.ico` (Windows - 256x256px)
- `assets/icon.icns` (macOS)
- `assets/icon.png` (Linux - 512x512px)

## Scripts de Build

### Desenvolvimento
```bash
# Executar em modo desenvolvimento
npm run dev
```

### Produção

```bash
# Build para Windows
npm run build-win

# Build para macOS
npm run build-mac

# Build para Linux
npm run build-linux

# Build para todas as plataformas
npm run build-all

# Apenas empacotar (sem instalador)
npm run pack
```

## Estrutura de Arquivos

```
sistema-aih-desktop/
├── electron-main.js          # Processo principal do Electron
├── server-desktop.js         # Servidor Express adaptado
├── database-desktop.js       # Database com paths dinâmicos
├── package-desktop.json      # Configurações do Electron
├── assets/                   # Ícones da aplicação
├── public/                   # Frontend (HTML/CSS/JS)
├── auth.js                   # Autenticação
├── middleware.js             # Middlewares
├── cleanup.js                # Limpeza automática
├── monitor.js                # Monitoramento
└── dist/                     # Builds gerados
```

## Características da Versão Desktop

### Vantagens
- **Offline completo:** Funciona sem internet
- **Dados locais:** Banco SQLite na pasta do usuário
- **Performance:** Não depende de navegador
- **Integração OS:** Menu nativo, atalhos, notificações
- **Backup fácil:** Botão no menu para exportar dados
- **Múltiplas janelas:** Suporte a várias instâncias

### Diferenças da Versão Web
- Servidor Express roda como processo filho
- Banco de dados salvo em `%APPDATA%` (Windows) ou `~/.config` (Linux/Mac)
- Menu nativo da aplicação
- Função de backup integrada
- Auto-update (configurável)

## Distribuição

### Windows
- Gera arquivo `.exe` e instalador NSIS
- Instala em `Program Files`
- Dados em `%APPDATA%/sistema-aih-desktop`

### macOS
- Gera arquivo `.dmg`
- Instala em `/Applications`
- Dados em `~/Library/Application Support/sistema-aih-desktop`

### Linux
- Gera AppImage portátil
- Dados em `~/.config/sistema-aih-desktop`

## Configurações Avançadas

### Auto-update
Para habilitar auto-update, configure um servidor de releases ou use GitHub Releases:

```javascript
// No electron-main.js
const { autoUpdater } = require('electron-updater');

autoUpdater.checkForUpdatesAndNotify();
```

### Assinatura de Código
Para distribuição comercial, configure assinatura:

```json
// No package-desktop.json
"build": {
  "win": {
    "certificateFile": "cert.p12",
    "certificatePassword": "password"
  },
  "mac": {
    "identity": "Developer ID Application: Seu Nome"
  }
}
```

## Troubleshooting

### Problemas Comuns

1. **SQLite não encontrado:**
   - Verificar se sqlite3 está compilado para Electron
   - Usar `electron-rebuild` se necessário

2. **Paths incorretos:**
   - Verificar se `USER_DATA_PATH` está sendo definido
   - Confirmar permissões de escrita na pasta de dados

3. **Porta ocupada:**
   - Verificar se porta 5000 está disponível
   - Alterar PORT em `electron-main.js` se necessário

### Logs de Debug
```bash
# Executar com logs detalhados
DEBUG=* npm run dev
```
