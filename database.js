const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'aih.db');

// Criar conexão
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Erro ao conectar:', err);
    else console.log('Conectado ao banco SQLite');
});

// Inicializar tabelas
const initDB = () => {
    db.serialize(() => {
        // Usuarios
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT UNIQUE NOT NULL,
            senha_hash TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
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
        
        // Adicionar coluna observacoes se não existir (para bancos existentes)
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

        // Criar índices para otimização
        db.run(`CREATE INDEX IF NOT EXISTS idx_aih_numero ON aihs(numero_aih)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_aih_status ON aihs(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_aih_competencia ON aihs(competencia)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_aih_valor_atual ON aihs(valor_atual)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_aih_criado_em ON aihs(criado_em)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_movimentacoes_aih ON movimentacoes(aih_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo ON movimentacoes(tipo)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_movimentacoes_competencia ON movimentacoes(competencia)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes(data_movimentacao)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_glosas_aih ON glosas(aih_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_glosas_ativa ON glosas(ativa)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_atendimentos_aih ON atendimentos(aih_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_logs_usuario ON logs_acesso(usuario_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_logs_data ON logs_acesso(data_hora)`);
        
        console.log('Banco de dados inicializado');
    });
};

// Funções auxiliares
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

// Se executado diretamente, inicializa o banco
if (require.main === module) {
    const fs = require('fs');
    if (!fs.existsSync('./db')) {
        fs.mkdirSync('./db');
    }
    initDB();
}

module.exports = { db, initDB, run, get, all };