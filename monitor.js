
const { get } = require('./database');

// Estatísticas de performance
const getPerformanceStats = async () => {
    try {
        const stats = await get(`
            SELECT 
                (SELECT COUNT(*) FROM aihs) as total_aihs,
                (SELECT COUNT(*) FROM movimentacoes) as total_movimentacoes,
                (SELECT COUNT(*) FROM glosas WHERE ativa = 1) as total_glosas_ativas,
                (SELECT COUNT(*) FROM usuarios) as total_usuarios
        `);
        
        const dbSize = await get("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
        
        return {
            ...stats,
            db_size_mb: Math.round((dbSize.size || 0) / (1024 * 1024) * 100) / 100,
            timestamp: new Date().toISOString()
        };
    } catch (err) {
        console.error('Erro ao obter estatísticas:', err);
        return null;
    }
};

// Log de performance (executar periodicamente)
const logPerformance = async () => {
    const stats = await getPerformanceStats();
    if (stats) {
        console.log(`📊 Stats: ${stats.total_aihs} AIHs, ${stats.total_movimentacoes} movimentações, DB: ${stats.db_size_mb}MB`);
        
        // Alertar se banco estiver muito grande (>500MB)
        if (stats.db_size_mb > 500) {
            console.warn('⚠️  Banco de dados grande detectado. Considere arquivamento.');
        }
    }
};

// Agendar monitoramento a cada hora
setInterval(logPerformance, 60 * 60 * 1000);

module.exports = { getPerformanceStats, logPerformance };
