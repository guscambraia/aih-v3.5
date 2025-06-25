
const { run, get } = require('./database');

// Limpeza de logs antigos (manter apenas 90 dias)
const cleanupOldLogs = async () => {
    try {
        const result = await run(`
            DELETE FROM logs_acesso 
            WHERE data_hora < datetime('now', '-90 days')
        `);
        console.log(`Logs limpos: ${result.changes} registros removidos`);
    } catch (err) {
        console.error('Erro na limpeza de logs:', err);
    }
};

// Otimizar banco de dados
const optimizeDatabase = async () => {
    try {
        await run('VACUUM'); // Reorganizar e compactar
        await run('ANALYZE'); // Atualizar estatísticas
        console.log('Banco otimizado com sucesso');
    } catch (err) {
        console.error('Erro na otimização:', err);
    }
};

// Executar manutenção (deve ser chamado periodicamente)
const runMaintenance = async () => {
    console.log('Iniciando manutenção do banco...');
    await cleanupOldLogs();
    await optimizeDatabase();
    console.log('Manutenção concluída');
};

// Agendar manutenção a cada 7 dias
const scheduleMaintenance = () => {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    setInterval(runMaintenance, SEVEN_DAYS);
    
    // Executar na inicialização se necessário
    setTimeout(runMaintenance, 60000); // 1 minuto após iniciar
};

module.exports = { cleanupOldLogs, optimizeDatabase, runMaintenance, scheduleMaintenance };
