
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Usar caminho específico para desktop
const dbPath = process.env.DB_PATH || path.join(__dirname, 'db', 'aih.db');
const dbDir = path.dirname(dbPath);

// Garantir que a pasta db existe
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Criar conexão com configurações otimizadas
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Erro ao conectar:', err);
    else console.log(`Conectado ao banco SQLite em: ${dbPath}`);
});

// Configurações de performance do SQLite
db.serialize(() => {
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA synchronous = NORMAL");
    db.run("PRAGMA cache_size = 10000");
    db.run("PRAGMA temp_store = MEMORY");
    db.run("PRAGMA mmap_size = 268435456");
    db.run("PRAGMA optimize");
});

// Inicializar tabelas (mesma lógica do database.js original)
const initDB = () => {
    db.serialize(() => {
        // Usuarios
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT UNIQUE NOT NULL,
            matricula TEXT UNIQUE NOT NULL,
            senha_hash TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`ALTER TABLE usuarios ADD COLUMN matricula TEXT`, (err) => {
            // Ignora erro se coluna já existe
        });

        // Administradores
        db.run(`CREATE TABLE IF NOT EXISTS administradores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE NOT NULL,
            senha_hash TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            ultima_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // AIHs
        db.run(`CREATE TABLE IF NOT EXISTS aihs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_aih TEXT UNIQUE NOT NULL,
            valor_inicial REAL NOT NULL,
            valor_atual REAL NOT NULL,
            status INTEGER NOT NULL DEFAULT 3,
            competencia TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            usuario_cadastro_id INTEGER,
            FOREIGN KEY (usuario_cadastro_id) REFERENCES usuarios(id)
        )`);

        // Atendimentos
        db.run(`CREATE TABLE IF NOT EXISTS atendimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aih_id INTEGER NOT NULL,
            numero_atendimento TEXT NOT NULL,
            FOREIGN KEY (aih_id) REFERENCES aihs(id)
        )`);

        // Movimentações
        db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aih_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
            usuario_id INTEGER NOT NULL,
            valor_conta REAL,
            competencia TEXT,
            prof_medicina TEXT,
            prof_enfermagem TEXT,
            prof_fisioterapia TEXT,
            prof_bucomaxilo TEXT,
            status_aih INTEGER NOT NULL,
            observacoes TEXT,
            FOREIGN KEY (aih_id) REFERENCES aihs(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )`);
        
        db.run(`ALTER TABLE movimentacoes ADD COLUMN observacoes TEXT`, (err) => {
            // Ignora erro se coluna já existe
        });

        // Glosas
        db.run(`CREATE TABLE IF NOT EXISTS glosas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aih_id INTEGER NOT NULL,
            linha TEXT NOT NULL,
            tipo TEXT NOT NULL,
            profissional TEXT NOT NULL,
            quantidade INTEGER DEFAULT 1,
            ativa INTEGER DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (aih_id) REFERENCES aihs(id)
        )`);

        // Profissionais
        db.run(`CREATE TABLE IF NOT EXISTS profissionais (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            especialidade TEXT NOT NULL
        )`);

        // Tipos de Glosa
        db.run(`CREATE TABLE IF NOT EXISTS tipos_glosa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descricao TEXT UNIQUE NOT NULL
        )`);

        // Logs de Acesso
        db.run(`CREATE TABLE IF NOT EXISTS logs_acesso (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            acao TEXT NOT NULL,
            data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )`);

        // Popular tipos de glosa padrão
        db.run(`INSERT OR IGNORE INTO tipos_glosa (descricao) VALUES 
            ('Material não autorizado'),
            ('Quantidade excedente'),
            ('Procedimento não autorizado'),
            ('Falta de documentação'),
            ('Divergência de valores')`);

        // Criar administrador padrão
        const bcrypt = require('bcryptjs');
        bcrypt.hash('admin', 10, (err, hash) => {
            if (!err) {
                db.run(`INSERT OR IGNORE INTO administradores (usuario, senha_hash) VALUES (?, ?)`, 
                    ['admin', hash]);
            }
        });

        // Criar índices (mesmos do original)
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_aih_numero ON aihs(numero_aih)`);
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_nome ON usuarios(nome)`);
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_matricula ON usuarios(matricula)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_aih_status_competencia ON aihs(status, competencia)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_aih_competencia_criado ON aihs(competencia, criado_em DESC)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_mov_aih_data ON movimentacoes(aih_id, data_movimentacao DESC)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_glosas_aih_ativa ON glosas(aih_id, ativa)`);
        
        console.log('Banco de dados desktop inicializado');
    });
};

// Funções auxiliares (iguais ao original)
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

module.exports = { db, initDB, run, get, all };
