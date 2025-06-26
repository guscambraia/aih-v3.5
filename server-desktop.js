
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Configurar caminhos para versão desktop
const userDataPath = process.env.USER_DATA_PATH || __dirname;
const dbPath = path.join(userDataPath, 'db');

// Garantir que a pasta db existe
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
}

// Configurar variável de ambiente para o banco de dados
process.env.DB_PATH = path.join(dbPath, 'aih.db');

// Importar módulos após configurar caminhos
const { initDB, run, get, all } = require('./database-desktop');
const { verificarToken, login, cadastrarUsuario, loginAdmin, alterarSenhaAdmin, listarUsuarios, excluirUsuario } = require('./auth');
const { rateLimitMiddleware, validateInput } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares de segurança e otimização
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Headers de segurança
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(express.static('public'));

// Inicializar banco
initDB();

// Inicializar sistema de manutenção
const { scheduleMaintenance } = require('./cleanup');
scheduleMaintenance();

// Inicializar monitoramento
const { logPerformance } = require('./monitor');
setTimeout(logPerformance, 30000);

// Middleware para logs
const logAcao = async (usuarioId, acao) => {
    await run('INSERT INTO logs_acesso (usuario_id, acao) VALUES (?, ?)', [usuarioId, acao]);
};

// Rotas de autenticação
app.post('/api/login', async (req, res) => {
    try {
        const { nome, senha } = req.body;
        const result = await login(nome, senha);
        await logAcao(result.usuario.id, 'Login');
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// Login de administrador
app.post('/api/admin/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const result = await loginAdmin(usuario, senha);
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// Listar usuários (apenas admin)
app.get('/api/admin/usuarios', verificarToken, async (req, res) => {
    try {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const usuarios = await listarUsuarios();
        res.json({ usuarios });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cadastrar usuário (apenas admin)
app.post('/api/admin/usuarios', verificarToken, async (req, res) => {
    try {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const { nome, matricula, senha } = req.body;
        const usuario = await cadastrarUsuario(nome, matricula, senha);
        res.json({ success: true, usuario });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Excluir usuário (apenas admin)
app.delete('/api/admin/usuarios/:id', verificarToken, async (req, res) => {
    try {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        await excluirUsuario(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Alterar senha do administrador
app.post('/api/admin/alterar-senha', verificarToken, async (req, res) => {
    try {
        if (req.usuario.tipo !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const { novaSenha } = req.body;
        await alterarSenhaAdmin(novaSenha);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Dashboard aprimorado com filtro por competência
app.get('/api/dashboard', verificarToken, async (req, res) => {
    try {
        const competencia = req.query.competencia || getCompetenciaAtual();
        
        const entradasSUS = await get(`
            SELECT COUNT(DISTINCT m.aih_id) as count 
            FROM movimentacoes m
            WHERE m.tipo = 'entrada_sus' 
            AND m.competencia = ?
        `, [competencia]);
        
        const saidasHospital = await get(`
            SELECT COUNT(DISTINCT m.aih_id) as count 
            FROM movimentacoes m
            WHERE m.tipo = 'saida_hospital' 
            AND m.competencia = ?
        `, [competencia]);
        
        const emProcessamentoCompetencia = (entradasSUS.count || 0) - (saidasHospital.count || 0);
        
        const finalizadasCompetencia = await get(`
            SELECT COUNT(*) as count 
            FROM aihs 
            WHERE status IN (1, 4) 
            AND competencia = ?
        `, [competencia]);
        
        const comPendenciasCompetencia = await get(`
            SELECT COUNT(*) as count 
            FROM aihs 
            WHERE status IN (2, 3) 
            AND competencia = ?
        `, [competencia]);
        
        const totalEntradasSUS = await get(`
            SELECT COUNT(DISTINCT aih_id) as count 
            FROM movimentacoes 
            WHERE tipo = 'entrada_sus'
        `);
        
        const totalSaidasHospital = await get(`
            SELECT COUNT(DISTINCT aih_id) as count 
            FROM movimentacoes 
            WHERE tipo = 'saida_hospital'
        `);
        
        const totalEmProcessamento = (totalEntradasSUS.count || 0) - (totalSaidasHospital.count || 0);
        
        const totalFinalizadasGeral = await get(`
            SELECT COUNT(*) as count 
            FROM aihs 
            WHERE status IN (1, 4)
        `);
        
        const totalAIHsGeral = await get(`
            SELECT COUNT(*) as count 
            FROM aihs
        `);
        
        const totalAIHsCompetencia = await get(`
            SELECT COUNT(*) as count 
            FROM aihs 
            WHERE competencia = ?
        `, [competencia]);
        
        const competenciasDisponiveis = await all(`
            SELECT DISTINCT competencia 
            FROM aihs 
            ORDER BY 
                CAST(SUBSTR(competencia, 4, 4) AS INTEGER) DESC,
                CAST(SUBSTR(competencia, 1, 2) AS INTEGER) DESC
        `);
        
        const valoresCompetencia = await get(`
            SELECT 
                SUM(valor_inicial) as valor_inicial_total,
                SUM(valor_atual) as valor_atual_total,
                AVG(valor_inicial - valor_atual) as media_glosa
            FROM aihs 
            WHERE competencia = ?
        `, [competencia]);
        
        res.json({
            competencia_selecionada: competencia,
            competencias_disponiveis: competenciasDisponiveis.map(c => c.competencia),
            em_processamento_competencia: emProcessamentoCompetencia,
            finalizadas_competencia: finalizadasCompetencia.count,
            com_pendencias_competencia: comPendenciasCompetencia.count,
            total_aihs_competencia: totalAIHsCompetencia.count,
            total_entradas_sus: totalEntradasSUS.count,
            total_saidas_hospital: totalSaidasHospital.count,
            total_em_processamento_geral: totalEmProcessamento,
            total_finalizadas_geral: totalFinalizadasGeral.count,
            total_aihs_geral: totalAIHsGeral.count,
            valores_competencia: {
                inicial: valoresCompetencia.valor_inicial_total || 0,
                atual: valoresCompetencia.valor_atual_total || 0,
                media_glosa: valoresCompetencia.media_glosa || 0
            }
        });
    } catch (err) {
        console.error('Erro no dashboard:', err);
        res.status(500).json({ error: err.message });
    }
});

// Helper para obter competência atual
const getCompetenciaAtual = () => {
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    return `${mes}/${ano}`;
};

// Buscar AIH
app.get('/api/aih/:numero', verificarToken, async (req, res) => {
    try {
        const aih = await get(
            'SELECT * FROM aihs WHERE numero_aih = ?',
            [req.params.numero]
        );
        
        if (!aih) {
            return res.status(404).json({ error: 'AIH não encontrada' });
        }
        
        const atendimentos = await all(
            'SELECT numero_atendimento FROM atendimentos WHERE aih_id = ?',
            [aih.id]
        );
        
        const movimentacoes = await all(
            'SELECT * FROM movimentacoes WHERE aih_id = ? ORDER BY data_movimentacao DESC',
            [aih.id]
        );
        
        const glosas = await all(
            'SELECT * FROM glosas WHERE aih_id = ? AND ativa = 1',
            [aih.id]
        );
        
        res.json({
            ...aih,
            atendimentos: atendimentos.map(a => a.numero_atendimento),
            movimentacoes,
            glosas
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rota para backup do banco de dados
app.get('/api/backup', verificarToken, (req, res) => {
    const dbFile = path.join(dbPath, 'aih.db');
    const filename = `backup-aih-${new Date().toISOString().split('T')[0]}.db`;
    
    res.download(dbFile, filename, (err) => {
        if (err) {
            console.error('Erro no download do backup:', err);
            res.status(500).json({ error: 'Erro ao fazer backup' });
        }
    });
});

// Incluir todas as outras rotas do arquivo original...
// [Aqui você incluiria todas as outras rotas do server.js original]

// Servir SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Servidor desktop rodando em http://127.0.0.1:${PORT}`);
});
