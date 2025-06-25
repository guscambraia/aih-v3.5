const express = require('express');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');
const { initDB, run, get, all } = require('./database');
const { verificarToken, login, cadastrarUsuario, loginAdmin, alterarSenhaAdmin, listarUsuarios, excluirUsuario } = require('./auth');
const { rateLimitMiddleware, validateInput } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares de segurança e otimização
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' })); // Limitar tamanho do payload
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Aplicar rate limiting globalmente
app.use(rateLimitMiddleware);

// Validação de entrada
app.use('/api', validateInput);

// Headers de segurança
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
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
setTimeout(logPerformance, 30000); // Log inicial após 30s

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
        // Pegar competência da query ou usar atual
        const competencia = req.query.competencia || getCompetenciaAtual();
        
        // 1. AIH em processamento na competência
        // (entrada_sus - saida_hospital) na competência específica
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
        
        // 2. AIH finalizadas na competência (status 1 e 4)
        const finalizadasCompetencia = await get(`
            SELECT COUNT(*) as count 
            FROM aihs 
            WHERE status IN (1, 4) 
            AND competencia = ?
        `, [competencia]);
        
        // 3. AIH com pendências/glosas na competência (status 2 e 3)
        const comPendenciasCompetencia = await get(`
            SELECT COUNT(*) as count 
            FROM aihs 
            WHERE status IN (2, 3) 
            AND competencia = ?
        `, [competencia]);
        
        // 4. Total geral de entradas SUS vs saídas Hospital (desde o início)
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
        
        // 5. Total de AIHs finalizadas desde o início (status 1 e 4)
        const totalFinalizadasGeral = await get(`
            SELECT COUNT(*) as count 
            FROM aihs 
            WHERE status IN (1, 4)
        `);
        
        // 6. Total de AIHs cadastradas desde o início
        const totalAIHsGeral = await get(`
            SELECT COUNT(*) as count 
            FROM aihs
        `);
        
        // Dados adicionais para contexto
        const totalAIHsCompetencia = await get(`
            SELECT COUNT(*) as count 
            FROM aihs 
            WHERE competencia = ?
        `, [competencia]);
        
        // Lista de competências disponíveis
        const competenciasDisponiveis = await all(`
            SELECT DISTINCT competencia 
            FROM aihs 
            ORDER BY 
                CAST(SUBSTR(competencia, 4, 4) AS INTEGER) DESC,
                CAST(SUBSTR(competencia, 1, 2) AS INTEGER) DESC
        `);
        
        // Estatísticas de valores para a competência
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
            
            // Métricas da competência
            em_processamento_competencia: emProcessamentoCompetencia,
            finalizadas_competencia: finalizadasCompetencia.count,
            com_pendencias_competencia: comPendenciasCompetencia.count,
            total_aihs_competencia: totalAIHsCompetencia.count,
            
            // Métricas gerais (desde o início)
            total_entradas_sus: totalEntradasSUS.count,
            total_saidas_hospital: totalSaidasHospital.count,
            total_em_processamento_geral: totalEmProcessamento,
            total_finalizadas_geral: totalFinalizadasGeral.count,
            total_aihs_geral: totalAIHsGeral.count,
            
            // Valores financeiros da competência
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

// Cadastrar AIH
app.post('/api/aih', verificarToken, async (req, res) => {
    try {
        const { numero_aih, valor_inicial, competencia, atendimentos } = req.body;
        
        console.log('📝 Dados recebidos no servidor:', { 
            numero_aih, 
            valor_inicial, 
            competencia, 
            atendimentos, 
            tipo_atendimentos: typeof atendimentos,
            eh_array: Array.isArray(atendimentos)
        });
        
        // Validar dados de entrada
        if (!numero_aih || !valor_inicial || !competencia) {
            console.log('❌ Dados obrigatórios faltando');
            return res.status(400).json({ error: 'Dados obrigatórios não informados' });
        }
        
        // Processar atendimentos - aceitar tanto array quanto string
        let atendimentosProcessados = [];
        
        if (typeof atendimentos === 'string') {
            // Se vier como string, separar por vírgula ou quebra de linha
            atendimentosProcessados = atendimentos.split(/[,\n\r]/)
                .map(a => a.trim())
                .filter(a => a);
        } else if (Array.isArray(atendimentos)) {
            atendimentosProcessados = atendimentos
                .map(a => String(a).trim())
                .filter(a => a);
        }
        
        console.log('🔄 Atendimentos processados:', atendimentosProcessados);
        
        if (atendimentosProcessados.length === 0) {
            console.log('❌ Nenhum atendimento válido encontrado');
            return res.status(400).json({ error: 'Pelo menos um número de atendimento deve ser informado' });
        }
        
        // Verificar se já existe
        const existe = await get('SELECT id FROM aihs WHERE numero_aih = ?', [numero_aih]);
        if (existe) {
            console.log('❌ AIH já existe');
            return res.status(400).json({ error: 'AIH já cadastrada' });
        }
        
        // Inserir AIH com status 3 (Ativa em discussão)
        const result = await run(
            `INSERT INTO aihs (numero_aih, valor_inicial, valor_atual, competencia, usuario_cadastro_id, status) 
             VALUES (?, ?, ?, ?, ?, 3)`,
            [numero_aih, parseFloat(valor_inicial), parseFloat(valor_inicial), competencia, req.usuario.id]
        );
        
        // Inserir atendimentos processados
        for (const atend of atendimentosProcessados) {
            if (atend && atend.trim()) {
                await run(
                    'INSERT INTO atendimentos (aih_id, numero_atendimento) VALUES (?, ?)',
                    [result.id, atend.trim()]
                );
                console.log(`📋 Atendimento inserido: ${atend.trim()}`);
            }
        }
        
        // Primeira movimentação (entrada SUS) - OBRIGATÓRIA para nova AIH
        await run(
            `INSERT INTO movimentacoes (aih_id, tipo, usuario_id, valor_conta, competencia, status_aih, observacoes, data_movimentacao) 
             VALUES (?, 'entrada_sus', ?, ?, ?, 3, ?, CURRENT_TIMESTAMP)`,
            [result.id, req.usuario.id, parseFloat(valor_inicial), competencia, 'Entrada inicial da AIH na Auditoria SUS']
        );
        
        await logAcao(req.usuario.id, `Cadastrou AIH ${numero_aih}`);
        
        console.log(`✅ AIH ${numero_aih} cadastrada com sucesso - ID: ${result.id} - Atendimentos: ${atendimentosProcessados.length}`);
        
        res.json({ success: true, id: result.id, numero_aih, atendimentos_inseridos: atendimentosProcessados.length });
    } catch (err) {
        console.error('❌ Erro ao cadastrar AIH:', err);
        res.status(500).json({ error: err.message });
    }
});

// Obter próxima movimentação possível
app.get('/api/aih/:id/proxima-movimentacao', verificarToken, async (req, res) => {
    try {
        const aihId = req.params.id;
        
        // Buscar última movimentação
        const ultimaMovimentacao = await get(
            'SELECT tipo FROM movimentacoes WHERE aih_id = ? ORDER BY data_movimentacao DESC LIMIT 1',
            [aihId]
        );
        
        let proximoTipo, proximaDescricao, explicacao;
        
        if (!ultimaMovimentacao) {
            // Primeira movimentação sempre é entrada SUS
            proximoTipo = 'entrada_sus';
            proximaDescricao = 'Entrada na Auditoria SUS';
            explicacao = 'Esta é a primeira movimentação da AIH. Deve ser registrada como entrada na Auditoria SUS.';
        } else if (ultimaMovimentacao.tipo === 'entrada_sus') {
            // Se última foi entrada SUS, próxima deve ser saída hospital
            proximoTipo = 'saida_hospital';
            proximaDescricao = 'Saída para Auditoria Hospital';
            explicacao = 'A última movimentação foi entrada na Auditoria SUS. A próxima deve ser saída para Auditoria Hospital.';
        } else {
            // Se última foi saída hospital, próxima deve ser entrada SUS
            proximoTipo = 'entrada_sus';
            proximaDescricao = 'Entrada na Auditoria SUS';
            explicacao = 'A última movimentação foi saída para Hospital. A próxima deve ser entrada na Auditoria SUS.';
        }
        
        res.json({
            proximo_tipo: proximoTipo,
            descricao: proximaDescricao,
            explicacao: explicacao,
            ultima_movimentacao: ultimaMovimentacao?.tipo || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Nova movimentação
app.post('/api/aih/:id/movimentacao', verificarToken, async (req, res) => {
    try {
        const aihId = req.params.id;
        const {
            tipo, status_aih, valor_conta, competencia,
            prof_medicina, prof_enfermagem, prof_fisioterapia, prof_bucomaxilo, observacoes
        } = req.body;
        
        // Validar se o tipo está correto conforme a sequência
        const ultimaMovimentacao = await get(
            'SELECT tipo FROM movimentacoes WHERE aih_id = ? ORDER BY data_movimentacao DESC LIMIT 1',
            [aihId]
        );
        
        let tipoPermitido;
        if (!ultimaMovimentacao) {
            tipoPermitido = 'entrada_sus';
        } else if (ultimaMovimentacao.tipo === 'entrada_sus') {
            tipoPermitido = 'saida_hospital';
        } else {
            tipoPermitido = 'entrada_sus';
        }
        
        if (tipo !== tipoPermitido) {
            return res.status(400).json({ 
                error: `Tipo de movimentação inválido. Esperado: ${tipoPermitido}, recebido: ${tipo}` 
            });
        }
        
        // Inserir movimentação
        await run(
            `INSERT INTO movimentacoes 
             (aih_id, tipo, usuario_id, valor_conta, competencia, 
              prof_medicina, prof_enfermagem, prof_fisioterapia, prof_bucomaxilo, status_aih, observacoes) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [aihId, tipo, req.usuario.id, valor_conta, competencia,
             prof_medicina, prof_enfermagem, prof_fisioterapia, prof_bucomaxilo, status_aih, observacoes]
        );
        
        // Atualizar AIH
        await run(
            'UPDATE aihs SET status = ?, valor_atual = ? WHERE id = ?',
            [status_aih, valor_conta, aihId]
        );
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Glosas
app.get('/api/aih/:id/glosas', verificarToken, async (req, res) => {
    try {
        const glosas = await all(
            'SELECT * FROM glosas WHERE aih_id = ? AND ativa = 1',
            [req.params.id]
        );
        res.json({ glosas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/aih/:id/glosas', verificarToken, async (req, res) => {
    try {
        const { linha, tipo, profissional, quantidade } = req.body;
        const result = await run(
            'INSERT INTO glosas (aih_id, linha, tipo, profissional, quantidade) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, linha, tipo, profissional, quantidade || 1]
        );
        res.json({ success: true, id: result.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/glosas/:id', verificarToken, async (req, res) => {
    try {
        await run('UPDATE glosas SET ativa = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tipos de Glosa
app.get('/api/tipos-glosa', verificarToken, async (req, res) => {
    try {
        const tipos = await all('SELECT * FROM tipos_glosa ORDER BY descricao');
        res.json({ tipos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tipos-glosa', verificarToken, async (req, res) => {
    try {
        const { descricao } = req.body;
        const result = await run('INSERT INTO tipos_glosa (descricao) VALUES (?)', [descricao]);
        res.json({ success: true, id: result.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tipos-glosa/:id', verificarToken, async (req, res) => {
    try {
        await run('DELETE FROM tipos_glosa WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pesquisa avançada
app.post('/api/pesquisar', verificarToken, async (req, res) => {
    try {
        const { filtros } = req.body;
        let sql = `SELECT a.*, COUNT(g.id) as total_glosas 
                   FROM aihs a 
                   LEFT JOIN glosas g ON a.id = g.aih_id AND g.ativa = 1 
                   WHERE 1=1`;
        const params = [];
        
        if (filtros.status?.length) {
            sql += ` AND a.status IN (${filtros.status.map(() => '?').join(',')})`;
            params.push(...filtros.status);
        }
        
        if (filtros.competencia) {
            sql += ' AND a.competencia = ?';
            params.push(filtros.competencia);
        }
        
        if (filtros.data_inicio) {
            sql += ' AND a.criado_em >= ?';
            params.push(filtros.data_inicio);
        }
        
        if (filtros.data_fim) {
            sql += ' AND a.criado_em <= ?';
            params.push(filtros.data_fim + ' 23:59:59');
        }
        
        if (filtros.valor_min) {
            sql += ' AND a.valor_atual >= ?';
            params.push(filtros.valor_min);
        }
        
        if (filtros.valor_max) {
            sql += ' AND a.valor_atual <= ?';
            params.push(filtros.valor_max);
        }
        
        if (filtros.numero_aih) {
            sql += ' AND a.numero_aih LIKE ?';
            params.push(`%${filtros.numero_aih}%`);
        }
        
        if (filtros.profissional) {
            sql += ` AND a.id IN (
                SELECT DISTINCT aih_id FROM movimentacoes 
                WHERE prof_medicina LIKE ? OR prof_enfermagem LIKE ? 
                OR prof_fisioterapia LIKE ? OR prof_bucomaxilo LIKE ?
            )`;
            const prof = `%${filtros.profissional}%`;
            params.push(prof, prof, prof, prof);
        }
        
        sql += ' GROUP BY a.id ORDER BY a.criado_em DESC';
        
        const resultados = await all(sql, params);
        res.json({ resultados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Profissionais
app.get('/api/profissionais', verificarToken, async (req, res) => {
    try {
        const profissionais = await all('SELECT * FROM profissionais');
        res.json({ profissionais });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/profissionais', verificarToken, async (req, res) => {
    try {
        const { nome, especialidade } = req.body;
        const result = await run(
            'INSERT INTO profissionais (nome, especialidade) VALUES (?, ?)',
            [nome, especialidade]
        );
        res.json({ success: true, id: result.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/profissionais/:id', verificarToken, async (req, res) => {
    try {
        await run('DELETE FROM profissionais WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Backup
app.get('/api/backup', verificarToken, (req, res) => {
    const dbPath = path.join(__dirname, 'db', 'aih.db');
    res.download(dbPath, `backup-aih-${new Date().toISOString().split('T')[0]}.db`);
});

// Export melhorado
app.get('/api/export/:formato', verificarToken, async (req, res) => {
    try {
        const aihs = await all(`
            SELECT a.*, COUNT(g.id) as total_glosas,
                   GROUP_CONCAT(DISTINCT at.numero_atendimento) as atendimentos
            FROM aihs a
            LEFT JOIN glosas g ON a.id = g.aih_id AND g.ativa = 1
            LEFT JOIN atendimentos at ON a.id = at.aih_id
            GROUP BY a.id
        `);
        
        if (req.params.formato === 'json') {
            res.json(aihs);
        } else if (req.params.formato === 'csv') {
            const csv = [
                'numero_aih,valor_inicial,valor_atual,status,competencia,total_glosas,atendimentos,criado_em',
                ...aihs.map(a => 
                    `${a.numero_aih},${a.valor_inicial},${a.valor_atual},${a.status},${a.competencia},${a.total_glosas},"${a.atendimentos || ''}",${a.criado_em}`
                )
            ].join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=export-aih.csv');
            res.send(csv);
        } else if (req.params.formato === 'excel') {
            // Criar workbook Excel real (XLS compatível)
            const worksheet = XLSX.utils.json_to_sheet(aihs.map(a => ({
                'Número AIH': a.numero_aih,
                'Valor Inicial': a.valor_inicial,
                'Valor Atual': a.valor_atual,
                'Status': getStatusExcel(a.status),
                'Competência': a.competencia,
                'Total Glosas/Pendências': a.total_glosas,
                'Atendimentos': a.atendimentos || '',
                'Criado em': new Date(a.criado_em).toLocaleDateString('pt-BR')
            })));
            
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'AIHs');
            
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
            
            res.setHeader('Content-Type', 'application/vnd.ms-excel');
            res.setHeader('Content-Disposition', 'attachment; filename=export-aih.xls');
            res.send(buffer);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper para status no Excel
const getStatusExcel = (status) => {
    const statusMap = {
        1: 'Finalizada com aprovação direta',
        2: 'Ativa com aprovação indireta',
        3: 'Ativa em discussão',
        4: 'Finalizada após discussão'
    };
    return statusMap[status] || 'Desconhecido';
};

// Relatórios aprimorados com filtros por período
app.post('/api/relatorios/:tipo', verificarToken, async (req, res) => {
    try {
        const tipo = req.params.tipo;
        const { data_inicio, data_fim, competencia } = req.body;
        let resultado = {};
        
        // Construir filtros de período
        let filtroWhere = '';
        let params = [];
        
        if (competencia) {
            filtroWhere = ' AND competencia = ?';
            params.push(competencia);
        } else if (data_inicio && data_fim) {
            filtroWhere = ' AND DATE(criado_em) BETWEEN ? AND ?';
            params.push(data_inicio, data_fim);
        } else if (data_inicio) {
            filtroWhere = ' AND DATE(criado_em) >= ?';
            params.push(data_inicio);
        } else if (data_fim) {
            filtroWhere = ' AND DATE(criado_em) <= ?';
            params.push(data_fim);
        }
        
        switch(tipo) {
            case 'tipos-glosa-periodo':
                resultado = await all(`
                    SELECT g.tipo, COUNT(*) as total_ocorrencias, 
                           SUM(g.quantidade) as quantidade_total,
                           GROUP_CONCAT(DISTINCT g.profissional) as profissionais
                    FROM glosas g
                    JOIN aihs a ON g.aih_id = a.id
                    WHERE g.ativa = 1 ${filtroWhere}
                    GROUP BY g.tipo
                    ORDER BY total_ocorrencias DESC
                `, params);
                break;
                
            case 'aihs-profissional-periodo':
                // AIHs auditadas por profissional no período
                let sqlAihs = `
                    SELECT 
                        CASE 
                            WHEN m.prof_medicina IS NOT NULL THEN m.prof_medicina
                            WHEN m.prof_enfermagem IS NOT NULL THEN m.prof_enfermagem
                            WHEN m.prof_fisioterapia IS NOT NULL THEN m.prof_fisioterapia
                            WHEN m.prof_bucomaxilo IS NOT NULL THEN m.prof_bucomaxilo
                        END as profissional,
                        CASE 
                            WHEN m.prof_medicina IS NOT NULL THEN 'Medicina'
                            WHEN m.prof_enfermagem IS NOT NULL THEN 'Enfermagem'
                            WHEN m.prof_fisioterapia IS NOT NULL THEN 'Fisioterapia'
                            WHEN m.prof_bucomaxilo IS NOT NULL THEN 'Bucomaxilo'
                        END as especialidade,
                        COUNT(DISTINCT m.aih_id) as total_aihs_auditadas,
                        COUNT(*) as total_movimentacoes
                    FROM movimentacoes m
                    JOIN aihs a ON m.aih_id = a.id
                    WHERE (m.prof_medicina IS NOT NULL 
                       OR m.prof_enfermagem IS NOT NULL 
                       OR m.prof_fisioterapia IS NOT NULL 
                       OR m.prof_bucomaxilo IS NOT NULL)
                `;
                
                if (competencia) {
                    sqlAihs += ' AND m.competencia = ?';
                } else if (data_inicio && data_fim) {
                    sqlAihs += ' AND DATE(m.data_movimentacao) BETWEEN ? AND ?';
                } else if (data_inicio) {
                    sqlAihs += ' AND DATE(m.data_movimentacao) >= ?';
                } else if (data_fim) {
                    sqlAihs += ' AND DATE(m.data_movimentacao) <= ?';
                }
                
                sqlAihs += ` GROUP BY profissional, especialidade
                            ORDER BY total_aihs_auditadas DESC`;
                
                resultado = await all(sqlAihs, params);
                break;
                
            case 'glosas-profissional-periodo':
                // Glosas por profissional no período
                resultado = await all(`
                    SELECT g.profissional,
                           COUNT(*) as total_glosas,
                           SUM(g.quantidade) as quantidade_total,
                           GROUP_CONCAT(DISTINCT g.tipo) as tipos_glosa,
                           COUNT(DISTINCT g.tipo) as tipos_diferentes
                    FROM glosas g
                    JOIN aihs a ON g.aih_id = a.id
                    WHERE g.ativa = 1 ${filtroWhere}
                    GROUP BY g.profissional
                    ORDER BY total_glosas DESC
                `, params);
                break;
                
            case 'valores-glosas-periodo':
                // Análise financeira das glosas no período
                const valoresGlosas = await get(`
                    SELECT 
                        COUNT(DISTINCT a.id) as aihs_com_glosas,
                        SUM(a.valor_inicial) as valor_inicial_total,
                        SUM(a.valor_atual) as valor_atual_total,
                        SUM(a.valor_inicial - a.valor_atual) as total_glosas,
                        AVG(a.valor_inicial - a.valor_atual) as media_glosa_por_aih,
                        MIN(a.valor_inicial - a.valor_atual) as menor_glosa,
                        MAX(a.valor_inicial - a.valor_atual) as maior_glosa
                    FROM aihs a
                    WHERE EXISTS (SELECT 1 FROM glosas g WHERE g.aih_id = a.id AND g.ativa = 1)
                    ${filtroWhere}
                `, params);
                
                const totalAihs = await get(`
                    SELECT COUNT(*) as total,
                           SUM(valor_inicial) as valor_inicial_periodo,
                           SUM(valor_atual) as valor_atual_periodo
                    FROM aihs a
                    WHERE 1=1 ${filtroWhere}
                `, params);
                
                resultado = {
                    ...valoresGlosas,
                    total_aihs_periodo: totalAihs.total,
                    valor_inicial_periodo: totalAihs.valor_inicial_periodo,
                    valor_atual_periodo: totalAihs.valor_atual_periodo,
                    percentual_aihs_com_glosas: totalAihs.total > 0 ? 
                        ((valoresGlosas.aihs_com_glosas / totalAihs.total) * 100).toFixed(2) : 0
                };
                break;
                
            case 'estatisticas-periodo':
                // Estatísticas gerais do período
                const stats = await get(`
                    SELECT 
                        COUNT(*) as total_aihs,
                        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as aprovacao_direta,
                        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as aprovacao_indireta,
                        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as em_discussao,
                        SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as finalizada_pos_discussao,
                        AVG(valor_inicial) as valor_medio_inicial,
                        AVG(valor_atual) as valor_medio_atual,
                        SUM(valor_inicial) as valor_total_inicial,
                        SUM(valor_atual) as valor_total_atual
                    FROM aihs a
                    WHERE 1=1 ${filtroWhere}
                `, params);
                
                const totalGlosasPeriodo = await get(`
                    SELECT COUNT(*) as total_glosas,
                           COUNT(DISTINCT aih_id) as aihs_com_glosas
                    FROM glosas g
                    JOIN aihs a ON g.aih_id = a.id
                    WHERE g.ativa = 1 ${filtroWhere}
                `, params);
                
                const movimentacoesPeriodo = await get(`
                    SELECT 
                        COUNT(*) as total_movimentacoes,
                        SUM(CASE WHEN tipo = 'entrada_sus' THEN 1 ELSE 0 END) as entradas_sus,
                        SUM(CASE WHEN tipo = 'saida_hospital' THEN 1 ELSE 0 END) as saidas_hospital
                    FROM movimentacoes m
                    JOIN aihs a ON m.aih_id = a.id
                    WHERE 1=1 ${filtroWhere.replace('competencia', 'm.competencia').replace('criado_em', 'm.data_movimentacao')}
                `, params);
                
                resultado = {
                    ...stats,
                    ...totalGlosasPeriodo,
                    ...movimentacoesPeriodo,
                    diferenca_valores: (stats.valor_total_inicial || 0) - (stats.valor_total_atual || 0),
                    percentual_glosas: stats.total_aihs > 0 ? 
                        ((totalGlosasPeriodo.aihs_com_glosas / stats.total_aihs) * 100).toFixed(2) : 0
                };
                break;
                
            // Manter relatórios existentes para compatibilidade
            case 'acessos':
                resultado = await all(`
                    SELECT u.nome, COUNT(l.id) as total_acessos, 
                           MAX(l.data_hora) as ultimo_acesso
                    FROM logs_acesso l
                    JOIN usuarios u ON l.usuario_id = u.id
                    WHERE l.acao = 'Login'
                    GROUP BY u.id
                    ORDER BY total_acessos DESC
                `);
                break;
                
            case 'glosas-profissional':
                resultado = await all(`
                    SELECT profissional, COUNT(*) as total_glosas,
                           SUM(quantidade) as total_itens
                    FROM glosas
                    WHERE ativa = 1
                    GROUP BY profissional
                    ORDER BY total_glosas DESC
                `);
                break;
                
            case 'aihs-profissional':
                resultado = await all(`
                    SELECT 
                        COALESCE(prof_medicina, prof_enfermagem, prof_fisioterapia, prof_bucomaxilo) as profissional,
                        COUNT(DISTINCT aih_id) as total_aihs,
                        COUNT(*) as total_movimentacoes
                    FROM movimentacoes
                    WHERE prof_medicina IS NOT NULL 
                       OR prof_enfermagem IS NOT NULL 
                       OR prof_fisioterapia IS NOT NULL 
                       OR prof_bucomaxilo IS NOT NULL
                    GROUP BY profissional
                    ORDER BY total_aihs DESC
                `);
                break;
                
            case 'aprovacoes':
                resultado = await all(`
                    SELECT 
                        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as aprovacao_direta,
                        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as aprovacao_indireta,
                        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as em_discussao,
                        SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as finalizada_pos_discussao,
                        COUNT(*) as total
                    FROM aihs
                `);
                break;
                
            case 'tipos-glosa':
                resultado = await all(`
                    SELECT tipo, COUNT(*) as total, SUM(quantidade) as quantidade_total
                    FROM glosas
                    WHERE ativa = 1
                    GROUP BY tipo
                    ORDER BY total DESC
                `);
                break;
                
            case 'analise-preditiva':
                const mediaTempo = await get(`
                    SELECT AVG(JULIANDAY(CURRENT_TIMESTAMP) - JULIANDAY(criado_em)) as media_dias
                    FROM aihs WHERE status IN (1, 4)
                `);
                
                const tendenciaGlosas = await all(`
                    SELECT strftime('%Y-%m', criado_em) as mes, COUNT(*) as total
                    FROM glosas
                    WHERE ativa = 1
                    GROUP BY mes
                    ORDER BY mes DESC
                    LIMIT 6
                `);
                
                const valorMedioGlosa = await get(`
                    SELECT AVG(a.valor_inicial - a.valor_atual) as valor_medio
                    FROM aihs a
                    WHERE EXISTS (SELECT 1 FROM glosas g WHERE g.aih_id = a.id AND g.ativa = 1)
                `);
                
                resultado = {
                    tempo_medio_processamento: Math.round(mediaTempo.media_dias || 0),
                    tendencia_glosas: tendenciaGlosas,
                    valor_medio_glosa: valorMedioGlosa.valor_medio || 0,
                    previsao: "Com base nos dados, espera-se manter a média de processamento"
                };
                break;
        }
        
        res.json({ tipo, resultado, filtros: { data_inicio, data_fim, competencia } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exportar histórico de movimentações de uma AIH
app.get('/api/aih/:id/movimentacoes/export/:formato', verificarToken, async (req, res) => {
    try {
        const aihId = req.params.id;
        const formato = req.params.formato;
        
        // Buscar dados da AIH
        const aih = await get('SELECT numero_aih FROM aihs WHERE id = ?', [aihId]);
        if (!aih) {
            return res.status(404).json({ error: 'AIH não encontrada' });
        }
        
        // Buscar movimentações com detalhes
        const movimentacoes = await all(`
            SELECT 
                m.*,
                u.nome as usuario_nome
            FROM movimentacoes m
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            WHERE m.aih_id = ?
            ORDER BY m.data_movimentacao DESC
        `, [aihId]);
        
        const nomeArquivo = `historico-movimentacoes-AIH-${aih.numero_aih}-${new Date().toISOString().split('T')[0]}`;
        
        if (formato === 'csv') {
            const csv = [
                'Data,Tipo,Status,Valor,Competencia,Prof_Medicina,Prof_Enfermagem,Prof_Fisioterapia,Prof_Bucomaxilo,Usuario,Observacoes',
                ...movimentacoes.map(m => 
                    `"${new Date(m.data_movimentacao).toLocaleString('pt-BR')}","${m.tipo === 'entrada_sus' ? 'Entrada SUS' : 'Saída Hospital'}","${getStatusExcel(m.status_aih)}","${m.valor_conta || 0}","${m.competencia || ''}","${m.prof_medicina || ''}","${m.prof_enfermagem || ''}","${m.prof_fisioterapia || ''}","${m.prof_bucomaxilo || ''}","${m.usuario_nome || ''}","${(m.observacoes || '').replace(/"/g, '""')}"`
                )
            ].join('\n');
            
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}.csv`);
            res.send('\ufeff' + csv); // BOM para UTF-8
            
        } else if (formato === 'xlsx') {
            const dadosFormatados = movimentacoes.map(m => ({
                'Data': new Date(m.data_movimentacao).toLocaleString('pt-BR'),
                'Tipo': m.tipo === 'entrada_sus' ? 'Entrada na Auditoria SUS' : 'Saída para Auditoria Hospital',
                'Status': getStatusExcel(m.status_aih),
                'Valor da Conta': m.valor_conta || 0,
                'Competência': m.competencia || '',
                'Profissional Medicina': m.prof_medicina || '',
                'Profissional Enfermagem': m.prof_enfermagem || '',
                'Profissional Fisioterapia': m.prof_fisioterapia || '',
                'Profissional Bucomaxilo': m.prof_bucomaxilo || '',
                'Usuário Responsável': m.usuario_nome || '',
                'Observações': m.observacoes || ''
            }));
            
            const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, `Histórico AIH ${aih.numero_aih}`);
            
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
            
            res.setHeader('Content-Type', 'application/vnd.ms-excel');
            res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}.xls`);
            res.send(buffer);
        } else {
            res.status(400).json({ error: 'Formato não suportado' });
        }
        
    } catch (err) {
        console.error('Erro ao exportar histórico:', err);
        res.status(500).json({ error: err.message });
    }
});

// Exportar relatórios com filtros por período
app.post('/api/relatorios/:tipo/export', verificarToken, async (req, res) => {
    try {
        const tipo = req.params.tipo;
        const { data_inicio, data_fim, competencia } = req.body;
        let dados = [];
        let nomeArquivo = `relatorio-${tipo}-${new Date().toISOString().split('T')[0]}`;
        
        // Construir filtros de período
        let filtroWhere = '';
        let params = [];
        
        if (competencia) {
            filtroWhere = ' AND competencia = ?';
            params.push(competencia);
            nomeArquivo += `-${competencia.replace('/', '-')}`;
        } else if (data_inicio && data_fim) {
            filtroWhere = ' AND DATE(criado_em) BETWEEN ? AND ?';
            params.push(data_inicio, data_fim);
            nomeArquivo += `-${data_inicio}-a-${data_fim}`;
        } else if (data_inicio) {
            filtroWhere = ' AND DATE(criado_em) >= ?';
            params.push(data_inicio);
            nomeArquivo += `-a-partir-${data_inicio}`;
        } else if (data_fim) {
            filtroWhere = ' AND DATE(criado_em) <= ?';
            params.push(data_fim);
            nomeArquivo += `-ate-${data_fim}`;
        }
        
        switch(tipo) {
            case 'tipos-glosa-periodo':
                dados = await all(`
                    SELECT 
                        g.tipo as 'Tipo de Glosa',
                        COUNT(*) as 'Total Ocorrencias', 
                        SUM(g.quantidade) as 'Quantidade Total',
                        GROUP_CONCAT(DISTINCT g.profissional) as 'Profissionais Envolvidos'
                    FROM glosas g
                    JOIN aihs a ON g.aih_id = a.id
                    WHERE g.ativa = 1 ${filtroWhere}
                    GROUP BY g.tipo
                    ORDER BY COUNT(*) DESC
                `, params);
                break;
                
            case 'aihs-profissional-periodo':
                let sqlAihs = `
                    SELECT 
                        CASE 
                            WHEN m.prof_medicina IS NOT NULL THEN m.prof_medicina
                            WHEN m.prof_enfermagem IS NOT NULL THEN m.prof_enfermagem
                            WHEN m.prof_fisioterapia IS NOT NULL THEN m.prof_fisioterapia
                            WHEN m.prof_bucomaxilo IS NOT NULL THEN m.prof_bucomaxilo
                        END as 'Profissional',
                        CASE 
                            WHEN m.prof_medicina IS NOT NULL THEN 'Medicina'
                            WHEN m.prof_enfermagem IS NOT NULL THEN 'Enfermagem'
                            WHEN m.prof_fisioterapia IS NOT NULL THEN 'Fisioterapia'
                            WHEN m.prof_bucomaxilo IS NOT NULL THEN 'Bucomaxilo'
                        END as 'Especialidade',
                        COUNT(DISTINCT m.aih_id) as 'Total AIHs Auditadas',
                        COUNT(*) as 'Total Movimentacoes'
                    FROM movimentacoes m
                    JOIN aihs a ON m.aih_id = a.id
                    WHERE (m.prof_medicina IS NOT NULL 
                       OR m.prof_enfermagem IS NOT NULL 
                       OR m.prof_fisioterapia IS NOT NULL 
                       OR m.prof_bucomaxilo IS NOT NULL)
                `;
                
                if (competencia) {
                    sqlAihs += ' AND m.competencia = ?';
                } else if (data_inicio && data_fim) {
                    sqlAihs += ' AND DATE(m.data_movimentacao) BETWEEN ? AND ?';
                } else if (data_inicio) {
                    sqlAihs += ' AND DATE(m.data_movimentacao) >= ?';
                } else if (data_fim) {
                    sqlAihs += ' AND DATE(m.data_movimentacao) <= ?';
                }
                
                sqlAihs += ` GROUP BY Profissional, Especialidade
                            ORDER BY COUNT(DISTINCT m.aih_id) DESC`;
                
                dados = await all(sqlAihs, params);
                break;
                
            case 'glosas-profissional-periodo':
                dados = await all(`
                    SELECT 
                        g.profissional as 'Profissional',
                        COUNT(*) as 'Total Glosas',
                        SUM(g.quantidade) as 'Quantidade Total',
                        GROUP_CONCAT(DISTINCT g.tipo) as 'Tipos de Glosa',
                        COUNT(DISTINCT g.tipo) as 'Tipos Diferentes'
                    FROM glosas g
                    JOIN aihs a ON g.aih_id = a.id
                    WHERE g.ativa = 1 ${filtroWhere}
                    GROUP BY g.profissional
                    ORDER BY COUNT(*) DESC
                `, params);
                break;
                
            case 'valores-glosas-periodo':
                const valoresGlosas = await get(`
                    SELECT 
                        COUNT(DISTINCT a.id) as aihs_com_glosas,
                        SUM(a.valor_inicial) as valor_inicial_total,
                        SUM(a.valor_atual) as valor_atual_total,
                        SUM(a.valor_inicial - a.valor_atual) as total_glosas,
                        AVG(a.valor_inicial - a.valor_atual) as media_glosa_por_aih,
                        MIN(a.valor_inicial - a.valor_atual) as menor_glosa,
                        MAX(a.valor_inicial - a.valor_atual) as maior_glosa
                    FROM aihs a
                    WHERE EXISTS (SELECT 1 FROM glosas g WHERE g.aih_id = a.id AND g.ativa = 1)
                    ${filtroWhere}
                `, params);
                
                dados = [{
                    'AIHs com Glosas': valoresGlosas.aihs_com_glosas || 0,
                    'Valor Inicial Total': `R$ ${(valoresGlosas.valor_inicial_total || 0).toFixed(2)}`,
                    'Valor Atual Total': `R$ ${(valoresGlosas.valor_atual_total || 0).toFixed(2)}`,
                    'Total de Glosas': `R$ ${(valoresGlosas.total_glosas || 0).toFixed(2)}`,
                    'Média por AIH': `R$ ${(valoresGlosas.media_glosa_por_aih || 0).toFixed(2)}`,
                    'Menor Glosa': `R$ ${(valoresGlosas.menor_glosa || 0).toFixed(2)}`,
                    'Maior Glosa': `R$ ${(valoresGlosas.maior_glosa || 0).toFixed(2)}`
                }];
                break;
                
            case 'estatisticas-periodo':
                const stats = await get(`
                    SELECT 
                        COUNT(*) as total_aihs,
                        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as aprovacao_direta,
                        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as aprovacao_indireta,
                        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as em_discussao,
                        SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as finalizada_pos_discussao,
                        AVG(valor_inicial) as valor_medio_inicial,
                        AVG(valor_atual) as valor_medio_atual,
                        SUM(valor_inicial) as valor_total_inicial,
                        SUM(valor_atual) as valor_total_atual
                    FROM aihs a
                    WHERE 1=1 ${filtroWhere}
                `, params);
                
                const totalGlosasPeriodo = await get(`
                    SELECT COUNT(*) as total_glosas,
                           COUNT(DISTINCT aih_id) as aihs_com_glosas
                    FROM glosas g
                    JOIN aihs a ON g.aih_id = a.id
                    WHERE g.ativa = 1 ${filtroWhere}
                `, params);
                
                dados = [{
                    'Total AIHs': stats.total_aihs || 0,
                    'Aprovação Direta': stats.aprovacao_direta || 0,
                    'Aprovação Indireta': stats.aprovacao_indireta || 0,
                    'Em Discussão': stats.em_discussao || 0,
                    'Finalizada Pós-Discussão': stats.finalizada_pos_discussao || 0,
                    'Total Glosas': totalGlosasPeriodo.total_glosas || 0,
                    'AIHs com Glosas': totalGlosasPeriodo.aihs_com_glosas || 0,
                    'Valor Médio Inicial': `R$ ${(stats.valor_medio_inicial || 0).toFixed(2)}`,
                    'Valor Médio Atual': `R$ ${(stats.valor_medio_atual || 0).toFixed(2)}`,
                    'Valor Total Inicial': `R$ ${(stats.valor_total_inicial || 0).toFixed(2)}`,
                    'Valor Total Atual': `R$ ${(stats.valor_total_atual || 0).toFixed(2)}`,
                    'Diferença Total': `R$ ${((stats.valor_total_inicial || 0) - (stats.valor_total_atual || 0)).toFixed(2)}`
                }];
                break;
                
            // Relatórios originais (sem filtros)
            case 'acessos':
                dados = await all(`
                    SELECT u.nome as Usuario, COUNT(l.id) as 'Total Acessos', 
                           MAX(l.data_hora) as 'Ultimo Acesso'
                    FROM logs_acesso l
                    JOIN usuarios u ON l.usuario_id = u.id
                    WHERE l.acao = 'Login'
                    GROUP BY u.id
                    ORDER BY COUNT(l.id) DESC
                `);
                break;
                
            case 'glosas-profissional':
                dados = await all(`
                    SELECT profissional as Profissional, 
                           COUNT(*) as 'Total Glosas',
                           SUM(quantidade) as 'Quantidade Total'
                    FROM glosas
                    WHERE ativa = 1
                    GROUP BY profissional
                    ORDER BY COUNT(*) DESC
                `);
                break;
                
            case 'aihs-profissional':
                dados = await all(`
                    SELECT 
                        COALESCE(prof_medicina, prof_enfermagem, prof_fisioterapia, prof_bucomaxilo) as Profissional,
                        COUNT(DISTINCT aih_id) as 'Total AIHs',
                        COUNT(*) as 'Total Movimentacoes'
                    FROM movimentacoes
                    WHERE prof_medicina IS NOT NULL 
                       OR prof_enfermagem IS NOT NULL 
                       OR prof_fisioterapia IS NOT NULL 
                       OR prof_bucomaxilo IS NOT NULL
                    GROUP BY Profissional
                    ORDER BY COUNT(DISTINCT aih_id) DESC
                `);
                break;
                
            case 'aprovacoes':
                const aprovacoes = await get(`
                    SELECT 
                        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as aprovacao_direta,
                        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as aprovacao_indireta,
                        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as em_discussao,
                        SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as finalizada_pos_discussao,
                        COUNT(*) as total
                    FROM aihs
                `);
                dados = [
                    { Tipo: 'Aprovação Direta', Quantidade: aprovacoes.aprovacao_direta, Percentual: ((aprovacoes.aprovacao_direta/aprovacoes.total)*100).toFixed(1) + '%' },
                    { Tipo: 'Aprovação Indireta', Quantidade: aprovacoes.aprovacao_indireta, Percentual: ((aprovacoes.aprovacao_indireta/aprovacoes.total)*100).toFixed(1) + '%' },
                    { Tipo: 'Em Discussão', Quantidade: aprovacoes.em_discussao, Percentual: ((aprovacoes.em_discussao/aprovacoes.total)*100).toFixed(1) + '%' },
                    { Tipo: 'Finalizada Pós-Discussão', Quantidade: aprovacoes.finalizada_pos_discussao, Percentual: ((aprovacoes.finalizada_pos_discussao/aprovacoes.total)*100).toFixed(1) + '%' }
                ];
                break;
                
            case 'tipos-glosa':
                dados = await all(`
                    SELECT tipo as 'Tipo de Glosa', 
                           COUNT(*) as 'Total Ocorrencias', 
                           SUM(quantidade) as 'Quantidade Total'
                    FROM glosas
                    WHERE ativa = 1
                    GROUP BY tipo
                    ORDER BY COUNT(*) DESC
                `);
                break;
        }
        
        if (dados.length === 0) {
            return res.status(404).json({ error: 'Nenhum dado encontrado para o período selecionado' });
        }
        
        // Criar Excel real (XLS compatível)
        const worksheet = XLSX.utils.json_to_sheet(dados);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, tipo.charAt(0).toUpperCase() + tipo.slice(1));
        
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
        
        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}.xls`);
        res.send(buffer);
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exportar relatórios originais (sem filtros) - mantém compatibilidade
app.get('/api/relatorios/:tipo/export', verificarToken, async (req, res) => {
    try {
        const tipo = req.params.tipo;
        let dados = [];
        let nomeArquivo = `relatorio-${tipo}-${new Date().toISOString().split('T')[0]}`;
        
        switch(tipo) {
            case 'acessos':
                dados = await all(`
                    SELECT u.nome as Usuario, COUNT(l.id) as 'Total Acessos', 
                           MAX(l.data_hora) as 'Ultimo Acesso'
                    FROM logs_acesso l
                    JOIN usuarios u ON l.usuario_id = u.id
                    WHERE l.acao = 'Login'
                    GROUP BY u.id
                    ORDER BY COUNT(l.id) DESC
                `);
                break;
                
            case 'glosas-profissional':
                dados = await all(`
                    SELECT profissional as Profissional, 
                           COUNT(*) as 'Total Glosas',
                           SUM(quantidade) as 'Quantidade Total'
                    FROM glosas
                    WHERE ativa = 1
                    GROUP BY profissional
                    ORDER BY COUNT(*) DESC
                `);
                break;
                
            case 'aihs-profissional':
                dados = await all(`
                    SELECT 
                        COALESCE(prof_medicina, prof_enfermagem, prof_fisioterapia, prof_bucomaxilo) as Profissional,
                        COUNT(DISTINCT aih_id) as 'Total AIHs',
                        COUNT(*) as 'Total Movimentacoes'
                    FROM movimentacoes
                    WHERE prof_medicina IS NOT NULL 
                       OR prof_enfermagem IS NOT NULL 
                       OR prof_fisioterapia IS NOT NULL 
                       OR prof_bucomaxilo IS NOT NULL
                    GROUP BY Profissional
                    ORDER BY COUNT(DISTINCT aih_id) DESC
                `);
                break;
                
            case 'aprovacoes':
                const aprovacoes = await get(`
                    SELECT 
                        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as aprovacao_direta,
                        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as aprovacao_indireta,
                        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as em_discussao,
                        SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as finalizada_pos_discussao,
                        COUNT(*) as total
                    FROM aihs
                `);
                dados = [
                    { Tipo: 'Aprovação Direta', Quantidade: aprovacoes.aprovacao_direta, Percentual: ((aprovacoes.aprovacao_direta/aprovacoes.total)*100).toFixed(1) + '%' },
                    { Tipo: 'Aprovação Indireta', Quantidade: aprovacoes.aprovacao_indireta, Percentual: ((aprovacoes.aprovacao_indireta/aprovacoes.total)*100).toFixed(1) + '%' },
                    { Tipo: 'Em Discussão', Quantidade: aprovacoes.em_discussao, Percentual: ((aprovacoes.em_discussao/aprovacoes.total)*100).toFixed(1) + '%' },
                    { Tipo: 'Finalizada Pós-Discussão', Quantidade: aprovacoes.finalizada_pos_discussao, Percentual: ((aprovacoes.finalizada_pos_discussao/aprovacoes.total)*100).toFixed(1) + '%' }
                ];
                break;
                
            case 'tipos-glosa':
                dados = await all(`
                    SELECT tipo as 'Tipo de Glosa', 
                           COUNT(*) as 'Total Ocorrencias', 
                           SUM(quantidade) as 'Quantidade Total'
                    FROM glosas
                    WHERE ativa = 1
                    GROUP BY tipo
                    ORDER BY COUNT(*) DESC
                `);
                break;
        }
        
        if (dados.length === 0) {
            return res.status(404).json({ error: 'Nenhum dado encontrado' });
        }
        
        // Criar Excel real (XLS compatível)
        const worksheet = XLSX.utils.json_to_sheet(dados);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, tipo.charAt(0).toUpperCase() + tipo.slice(1));
        
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
        
        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}.xls`);
        res.send(buffer);
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Servir SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
});