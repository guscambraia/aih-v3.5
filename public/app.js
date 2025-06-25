// Estado da aplicação
let state = {
    token: localStorage.getItem('token'),
    usuario: null,
    aihAtual: null,
    telaAnterior: null,
    glosasPendentes: []
};

// API Helper
const api = async (endpoint, options = {}) => {
    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(state.token && { 'Authorization': `Bearer ${state.token}` }),
            ...options.headers
        }
    };

    try {
        const response = await fetch(`/api${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro na requisição');
        }

        return data;
    } catch (err) {
        console.error('Erro API:', err);
        throw err;
    }
};

// Navegação
const mostrarTela = (telaId) => {
    document.querySelectorAll('.tela').forEach(tela => {
        tela.classList.remove('ativa');
    });
    document.getElementById(telaId).classList.add('ativa');
};

const voltarTelaPrincipal = () => {
    mostrarTela('telaPrincipal');
    carregarDashboard();
};

const voltarTelaAnterior = () => {
    if (state.telaAnterior) {
        mostrarTela(state.telaAnterior);

        // Se voltando para tela de movimentação, recarregar dados para atualizar glosas
        if (state.telaAnterior === 'telaMovimentacao') {
            // Usar setTimeout para garantir que a tela foi renderizada
            setTimeout(() => {
                carregarDadosMovimentacao();
            }, 100);
        }
        // Se voltando para tela de informações AIH, recarregar AIH atualizada
        else if (state.telaAnterior === 'telaInfoAIH' && state.aihAtual) {
            api(`/aih/${state.aihAtual.numero_aih}`)
                .then(aih => {
                    state.aihAtual = aih;
                    mostrarInfoAIH(aih);
                })
                .catch(err => console.error('Erro ao recarregar AIH:', err));
        }
    }
};

// Modal
const mostrarModal = (titulo, mensagem) => {
    return new Promise((resolve) => {
        const modalTitulo = document.getElementById('modalTitulo');
        const modalMensagem = document.getElementById('modalMensagem');
        const modal = document.getElementById('modal');

        if (!modalTitulo || !modalMensagem || !modal) {
            console.error('Elementos do modal não encontrados');
            resolve(false);
            return;
        }

        modalTitulo.textContent = titulo;
        modalMensagem.textContent = mensagem;
        modal.classList.add('ativo');

        const btnSim = document.getElementById('modalBtnSim');
        const btnNao = document.getElementById('modalBtnNao');

        const fecharModal = (resultado) => {
            modal.classList.remove('ativo');
            btnSim.removeEventListener('click', simHandler);
            btnNao.removeEventListener('click', naoHandler);
            resolve(resultado);
        };

        const simHandler = () => fecharModal(true);
        const naoHandler = () => fecharModal(false);

        btnSim.addEventListener('click', simHandler);
        btnNao.addEventListener('click', naoHandler);
    });
};

// Login
document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const nome = document.getElementById('loginUsuario').value;
        const senha = document.getElementById('loginSenha').value;

        const result = await api('/login', {
            method: 'POST',
            body: JSON.stringify({ nome, senha })
        });

        state.token = result.token;
        state.usuario = result.usuario;
        localStorage.setItem('token', result.token);

        document.getElementById('nomeUsuario').textContent = result.usuario.nome;
        mostrarTela('telaPrincipal');
        carregarDashboard();
    } catch (err) {
        alert('Erro no login: ' + err.message);
    }
});

// Cadastrar usuário
document.getElementById('linkCadastrar').addEventListener('click', async (e) => {
    e.preventDefault();

    const nome = prompt('Nome de usuário:');
    if (!nome) return;

    const senha = prompt('Senha:');
    if (!senha) return;

    try {
        await api('/cadastrar', {
            method: 'POST',
            body: JSON.stringify({ nome, senha })
        });
        alert('Usuário cadastrado com sucesso!');
    } catch (err) {
        alert('Erro ao cadastrar: ' + err.message);
    }
});

// Logout
document.getElementById('btnSair').addEventListener('click', () => {
    state.token = null;
    state.usuario = null;
    localStorage.removeItem('token');
    mostrarTela('telaLogin');
});

// Helpers
const getStatusDescricao = (status) => {
    const descricoes = {
        1: 'Finalizada com aprovação direta',
        2: 'Ativa com aprovação indireta',
        3: 'Ativa em discussão',
        4: 'Finalizada após discussão'
    };
    return descricoes[status] || 'Desconhecido';
};

// Obter competência atual
const getCompetenciaAtual = () => {
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    return `${mes}/${ano}`;
};

// Animar números
const animarNumero = (elementId, valorFinal) => {
    const elemento = document.getElementById(elementId);
    const valorInicial = parseInt(elemento.textContent) || 0;
    const duracao = 1000; // 1 segundo
    const incremento = (valorFinal - valorInicial) / (duracao / 16);
    let valorAtual = valorInicial;

    const timer = setInterval(() => {
        valorAtual += incremento;
        if ((incremento > 0 && valorAtual >= valorFinal) || 
            (incremento < 0 && valorAtual <= valorFinal)) {
            valorAtual = valorFinal;
            clearInterval(timer);
        }
        elemento.textContent = Math.round(valorAtual);
    }, 16);
};

// Dashboard aprimorado com seletor de competência
const carregarDashboard = async (competenciaSelecionada = null) => {
    try {
        // Se não foi passada competência, usar a atual
        const competencia = competenciaSelecionada || getCompetenciaAtual();

        // Buscar dados do dashboard com a competência
        const dados = await api(`/dashboard?competencia=${competencia}`);

        // Criar/atualizar seletor de competência
        let seletorContainer = document.querySelector('.seletor-competencia-container');
        if (!seletorContainer) {
            // Criar container do seletor apenas se não existir
            const dashboardContainer = document.querySelector('.dashboard');
            seletorContainer = document.createElement('div');
            seletorContainer.className = 'seletor-competencia-container';
            dashboardContainer.parentNode.insertBefore(seletorContainer, dashboardContainer);
        }

        // Sempre atualizar o conteúdo do seletor
        seletorContainer.innerHTML = `
            <div class="seletor-competencia">
                <label for="selectCompetencia">Competência:</label>
                <select id="selectCompetencia" onchange="carregarDashboard(this.value)">
                    ${dados.competencias_disponiveis.map(comp => 
                        `<option value="${comp}" ${comp === competencia ? 'selected' : ''}>${comp}</option>`
                    ).join('')}
                </select>
                <span class="competencia-info">📅 Visualizando dados de ${competencia}</span>
            </div>
        `;

        // Atualizar cards do dashboard
        const dashboard = document.querySelector('.dashboard');
        dashboard.innerHTML = `
            <!-- Card 1: Em Processamento na Competência -->
            <div class="stat-card">
                <div class="stat-icon">📊</div>
                <h3>Em Processamento</h3>
                <p class="stat-number" id="emProcessamentoCompetencia">${dados.em_processamento_competencia}</p>
                <p class="stat-subtitle">AIHs em análise em ${competencia}</p>
                <p class="stat-detail">Entradas SUS - Saídas Hospital</p>
            </div>

            <!-- Card 2: Finalizadas na Competência -->
            <div class="stat-card success">
                <div class="stat-icon">✅</div>
                <h3>Finalizadas</h3>
                <p class="stat-number" id="finalizadasCompetencia">${dados.finalizadas_competencia}</p>
                <p class="stat-subtitle">AIHs concluídas em ${competencia}</p>
                <p class="stat-detail">Status 1 e 4</p>
            </div>

            <!-- Card 3: Com Pendências na Competência -->
            <div class="stat-card warning">
                <div class="stat-icon">⚠️</div>
                <h3>Com Pendências</h3>
                <p class="stat-number" id="comPendenciasCompetencia">${dados.com_pendencias_competencia}</p>
                <p class="stat-subtitle">AIHs com glosas em ${competencia}</p>
                <p class="stat-detail">Status 2 e 3</p>
            </div>

            <!-- Card 4: Total Geral em Processamento -->
            <div class="stat-card info">
                <div class="stat-icon">🏥</div>
                <h3>Total em Processamento</h3>
                <p class="stat-number" id="totalProcessamentoGeral">${dados.total_em_processamento_geral}</p>
                <p class="stat-subtitle">Desde o início do sistema</p>
                <p class="stat-detail">Total: ${dados.total_entradas_sus} entradas - ${dados.total_saidas_hospital} saídas</p>
            </div>

            <!-- Card 5: Total Finalizadas (Histórico Geral) -->
            <div class="stat-card success" style="border-left: 4px solid #10b981;">
                <div class="stat-icon">🎯</div>
                <h3>Total Finalizadas</h3>
                <p class="stat-number" id="totalFinalizadasGeral">${dados.total_finalizadas_geral}</p>
                <p class="stat-subtitle">Desde o início do sistema</p>
                <p class="stat-detail">AIHs concluídas (Status 1 e 4)</p>
            </div>

            <!-- Card 6: Total Geral Cadastradas -->
            <div class="stat-card" style="border-left: 4px solid #6366f1;">
                <div class="stat-icon">📈</div>
                <h3>Total Cadastradas</h3>
                <p class="stat-number" id="totalAIHsGeral">${dados.total_aihs_geral}</p>
                <p class="stat-subtitle">Desde o início do sistema</p>
                <p class="stat-detail">Todas as AIHs do sistema</p>
            </div>
        `;

        // Adicionar seção de resumo financeiro
        const resumoFinanceiro = document.createElement('div');
        resumoFinanceiro.className = 'resumo-financeiro';
        resumoFinanceiro.innerHTML = `
            <h3>💰 Resumo Financeiro - ${competencia}</h3>
            <div class="resumo-cards">
                <div class="resumo-card">
                    <span class="resumo-label">Valor Inicial Total</span>
                    <span class="resumo-valor">R$ ${dados.valores_competencia.inicial.toFixed(2)}</span>
                </div>
                <div class="resumo-card">
                    <span class="resumo-label">Valor Atual Total</span>
                    <span class="resumo-valor">R$ ${dados.valores_competencia.atual.toFixed(2)}</span>
                </div>
                <div class="resumo-card">
                    <span class="resumo-label">Média de Glosas</span>
                    <span class="resumo-valor" style="color: var(--danger)">R$ ${dados.valores_competencia.media_glosa.toFixed(2)}</span>
                </div>
                <div class="resumo-card">
                    <span class="resumo-label">Total de AIHs</span>
                    <span class="resumo-valor">${dados.total_aihs_competencia}</span>
                </div>
            </div>
        `;

        // Adicionar após o dashboard
        const dashboardContainer = document.querySelector('.dashboard');
        const resumoExistente = document.querySelector('.resumo-financeiro');
        if (resumoExistente) {
            resumoExistente.remove();
        }
        dashboardContainer.parentNode.insertBefore(resumoFinanceiro, dashboardContainer.nextSibling);

        // Animar números (opcional)
        animarNumeros();

    } catch (err) {
        console.error('Erro ao carregar dashboard:', err);
        // Mostrar mensagem de erro no dashboard
        document.querySelector('.dashboard').innerHTML = `
            <div class="erro-dashboard">
                <p>⚠️ Erro ao carregar dados do dashboard</p>
                <button onclick="carregarDashboard()">Tentar novamente</button>
            </div>
        `;
    }
};

// Função auxiliar para animar os números
const animarNumeros = () => {
    const numeros = document.querySelectorAll('.stat-number');
    numeros.forEach(elemento => {
        const valorFinal = parseInt(elemento.textContent);
        let valorAtual = 0;
        const incremento = valorFinal / 30;

        const timer = setInterval(() => {
            valorAtual += incremento;
            if (valorAtual >= valorFinal) {
                valorAtual = valorFinal;
                clearInterval(timer);
            }
            elemento.textContent = Math.round(valorAtual);
        }, 30);
    });
};

// Mostrar informações da AIH
const mostrarInfoAIH = (aih) => {
    const content = document.getElementById('infoAIHContent');

    // Calcular diferença de valor
    const diferencaValor = aih.valor_inicial - aih.valor_atual;
    const percentualDiferenca = ((diferencaValor / aih.valor_inicial) * 100).toFixed(1);

    content.innerHTML = `
        <div class="info-card">
            <h3>📋 AIH ${aih.numero_aih}</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <p><strong>Status:</strong> <span class="status-badge status-${aih.status}">${getStatusDescricao(aih.status)}</span></p>
                <p><strong>Competência:</strong> ${aih.competencia}</p>
                <p><strong>Valor Inicial:</strong> R$ ${aih.valor_inicial.toFixed(2)}</p>
                <p><strong>Valor Atual:</strong> R$ ${aih.valor_atual.toFixed(2)}</p>
                <p><strong>Diferença:</strong> <span style="color: ${diferencaValor > 0 ? '#ef4444' : '#10b981'}">
                    R$ ${Math.abs(diferencaValor).toFixed(2)} (${percentualDiferenca}%)
                </span></p>
                <p><strong>Atendimentos:</strong> ${aih.atendimentos.length}</p>
            </div>
            <div style="margin-top: 1rem;">
                <strong>Números de Atendimento:</strong>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                    ${aih.atendimentos.map(at => `
                        <span style="background: #e0e7ff; color: #4f46e5; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem;">
                            ${at}
                        </span>
                    `).join('')}
                </div>
            </div>
        </div>

        <div style="margin-top: 2rem;">
            <h4 style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                <span style="display: flex; align-items: center; gap: 0.5rem;">
                    📊 Histórico de Movimentações
                    <span style="background: #6366f1; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem;">
                        ${aih.movimentacoes.length}
                    </span>
                </span>
                <div style="display: flex; gap: 0.5rem; margin-left: auto;">
                    <button onclick="exportarHistoricoMovimentacoes('csv')" 
                            style="background: linear-gradient(135deg, #059669 0%, #047857 100%); 
                                   color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; 
                                   cursor: pointer; font-size: 0.875rem; display: flex; align-items: center; gap: 0.25rem;">
                        📄 CSV
                    </button>
                    <button onclick="exportarHistoricoMovimentacoes('xlsx')" 
                            style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); 
                                   color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; 
                                   cursor: pointer; font-size: 0.875rem; display: flex; align-items: center; gap: 0.25rem;">
                        📊 Excel (XLS)
                    </button>
                </div>
            </h4>
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Status</th>
                        <th>Valor</th>
                        <th>Profissionais</th>
                    </tr>
                </thead>
                <tbody>
                    ${aih.movimentacoes.map(mov => {
                        const profissionais = [];
                        if (mov.prof_medicina) profissionais.push(`Med: ${mov.prof_medicina}`);
                        if (mov.prof_enfermagem) profissionais.push(`Enf: ${mov.prof_enfermagem}`);
                        if (mov.prof_fisioterapia) profissionais.push(`Fis: ${mov.prof_fisioterapia}`);
                        if (mov.prof_bucomaxilo) profissionais.push(`Buco: ${mov.prof_bucomaxilo}`);

                        return `
                            <tr>
                                <td>${new Date(mov.data_movimentacao).toLocaleDateString('pt-BR')}</td>
                                <td>
                                    <span style="display: flex; align-items: center; gap: 0.5rem;">
                                        ${mov.tipo === 'entrada_sus' ? '📥' : '📤'}
                                        ${mov.tipo === 'entrada_sus' ? 'Entrada SUS' : 'Saída Hospital'}
                                    </span>
                                </td>
                                <td><span class="status-badge status-${mov.status_aih}">${getStatusDescricao(mov.status_aih)}</span></td>
                                <td>R$ ${(mov.valor_conta || 0).toFixed(2)}</td>
                                <td style="font-size: 0.875rem;">${profissionais.join(' | ') || '-'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>

        ${aih.glosas.length > 0 ? `
            <div style="margin-top: 2rem; background: #fef3c7; padding: 1.5rem; border-radius: 12px; border-left: 4px solid #f59e0b;">
                <h4 style="color: #92400e; margin-bottom: 1rem;">
                    ⚠️ Glosas Ativas (${aih.glosas.length})
                </h4>
                <div style="display: grid; gap: 0.75rem;">
                    ${aih.glosas.map(g => `
                        <div style="background: white; padding: 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${g.linha}</strong> - ${g.tipo}
                                <span style="color: #64748b; font-size: 0.875rem; margin-left: 1rem;">
                                    Por: ${g.profissional}
                                </span>
                            </div>
                            <span style="font-size: 0.75rem; color: #92400e;">
                                ${new Date(g.criado_em).toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;

    mostrarTela('telaInfoAIH');
};

// Menu Principal
document.getElementById('btnInformarAIH').addEventListener('click', () => {
    mostrarTela('telaInformarAIH');
});

document.getElementById('btnBuscarAIH').addEventListener('click', () => {
    mostrarTela('telaPesquisa');
});

document.getElementById('btnBackup').addEventListener('click', async () => {
    const modal = document.getElementById('modal');
    const modalContent = modal.querySelector('.modal-content');

    modalContent.innerHTML = `
        <h3>🗄️ Backup e Exportação</h3>
        <p>Escolha uma opção:</p>
        <div style="display: grid; gap: 1rem; margin-top: 2rem;">
            <button onclick="fazerBackup()" 
                    style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                           padding: 1.5rem; font-size: 1.1rem; display: flex; align-items: center; gap: 1rem;">
                <span style="font-size: 2rem;">💾</span>
                <div style="text-align: left;">
                    <strong>Backup Completo</strong>
                    <br>
                    <span style="font-size: 0.875rem; opacity: 0.9;">Baixar banco de dados SQLite</span>
                </div>
            </button>
            <button onclick="exportarDados('csv')" 
                    style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                           padding: 1.5rem; font-size: 1.1rem; display: flex; align-items: center; gap: 1rem;">
                <span style="font-size: 2rem;">📄</span>
                <div style="text-align: left;">
                    <strong>Exportar CSV</strong>
                    <br>
                    <span style="font-size: 0.875rem; opacity: 0.9;">Dados em formato planilha</span>
                </div>
            </button>
            <button onclick="exportarDados('json')" 
                    style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); 
                           padding: 1.5rem; font-size: 1.1rem; display: flex; align-items: center; gap: 1rem;">
                <span style="font-size: 2rem;">📊</span>
                <div style="text-align: left;">
                    <strong>Exportar JSON</strong>
                    <br>
                    <span style="font-size: 0.875rem; opacity: 0.9;">Dados estruturados</span>
                </div>
            </button>
            <button onclick="document.getElementById('modal').classList.remove('ativo')" 
                    style="background: linear-gradient(135deg, #64748b 0%, #475569 100%);">
                Cancelar
            </button>
        </div>
    `;

    modal.classList.add('ativo');
});

document.getElementById('btnConfiguracoes').addEventListener('click', () => {
    mostrarTela('telaConfiguracoes');
    carregarProfissionais();
    carregarTiposGlosaConfig();
});

// Buscar AIH
document.getElementById('formBuscarAIH').addEventListener('submit', async (e) => {
    e.preventDefault();

    const numero = document.getElementById('numeroBuscarAIH').value;

    try {
        const aih = await api(`/aih/${numero}`);
        state.aihAtual = aih;

        if (aih.status === 1 || aih.status === 4) {
            const continuar = await mostrarModal(
                'AIH Finalizada',
                'Esta AIH está finalizada. É uma reassinatura/reapresentação?'
            );

            if (!continuar) {
                document.getElementById('numeroBuscarAIH').value = '';
                return;
            }
        }

        mostrarInfoAIH(aih);
    } catch (err) {
        if (err.message.includes('não encontrada')) {
            // Nova AIH
            document.getElementById('cadastroNumeroAIH').value = numero;
            state.telaAnterior = 'telaInformarAIH';
            mostrarTela('telaCadastroAIH');
        } else {
            alert('Erro: ' + err.message);
        }
    }
});

// Cadastrar AIH
document.getElementById('btnAddAtendimento').addEventListener('click', () => {
    const container = document.getElementById('atendimentosContainer');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'atendimento-input';
    input.placeholder = 'Número do atendimento';
    container.appendChild(input);
});

// Cadastrar AIH
document.getElementById('formCadastroAIH').addEventListener('submit', async (e) => {
    e.preventDefault();

    const numeroAIH = document.getElementById('cadastroNumeroAIH').value.trim();

    // Validação do número da AIH (deve ter 13 dígitos)
    if (numeroAIH.length !== 13) {
        const continuar = await mostrarModal(
            'Atenção - Número da AIH',
            `O número da AIH informado tem ${numeroAIH.length} dígitos, mas o padrão são 13 dígitos. Deseja continuar o cadastro mesmo assim?`
        );

        if (!continuar) {
            return;
        }
    }

    const atendimentos = Array.from(document.querySelectorAll('.atendimento-input'))
        .map(input => input.value.trim())
        .filter(val => val);

    if (atendimentos.length === 0) {
        alert('Informe pelo menos um número de atendimento');
        return;
    }

    try {
        const dados = {
            numero_aih: numeroAIH,
            valor_inicial: parseFloat(document.getElementById('cadastroValor').value),
            competencia: document.getElementById('cadastroCompetencia').value,
            atendimentos
        };

        const result = await api('/aih', {
            method: 'POST',
            body: JSON.stringify(dados)
        });

        alert('AIH cadastrada com sucesso!');

        // Buscar a AIH recém-cadastrada
        const aih = await api(`/aih/${dados.numero_aih}`);
        state.aihAtual = aih;
        mostrarInfoAIH(aih);
    } catch (err) {
        alert('Erro ao cadastrar: ' + err.message);
    }
});

// Preencher competência com o mês atual
document.getElementById('cadastroCompetencia').value = getCompetenciaAtual();

// Nova movimentação
document.getElementById('btnNovaMovimentacao').addEventListener('click', () => {
    state.telaAnterior = 'telaInfoAIH';
    mostrarTela('telaMovimentacao');
    carregarDadosMovimentacao();
});

// Carregue dados necessários para movimentação
const carregarDadosMovimentacao = async () => {
    try {
        // 1. Exibir status atual da AIH de forma destacada
        if (state.aihAtual) {
            const statusAtualDiv = document.getElementById('statusAtualAIH');
            if (statusAtualDiv) {
                statusAtualDiv.innerHTML = `
                    <div class="status-atual-destaque">
                        <h3 style="color: #374151; margin-bottom: 0.5rem;">📋 AIH ${state.aihAtual.numero_aih}</h3>
                        <p style="color: #6b7280; margin-bottom: 1rem;">Status Atual:</p>
                        <span class="status-badge-grande status-${state.aihAtual.status}">
                            ${getStatusDescricao(state.aihAtual.status)}
                        </span>
                        <p style="color: #6b7280; margin-top: 0.5rem; font-size: 0.875rem;">
                            Competência: ${state.aihAtual.competencia} | Valor: R$ ${state.aihAtual.valor_atual.toFixed(2)}
                        </p>
                    </div>
                `;
            }
        }

        // 2. Exibir lembrete sobre os status
        const lembreteStatusDiv = document.getElementById('lembreteStatus');
        if (lembreteStatusDiv) {
            lembreteStatusDiv.innerHTML = `
                <div class="lembrete-status">
                    <h4 style="color: #78350f; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span>💡</span> Guia de Status da AIH
                    </h4>
                    <p style="color: #78350f; margin-bottom: 1rem; font-size: 0.9rem;">
                        Escolha o status correto para esta movimentação:
                    </p>
                    <div class="status-grid">
                        <div class="status-item">
                            <div class="status-numero">1</div>
                            <div>
                                <strong style="color: #065f46;">Finalizada com aprovação direta</strong>
                                <p>AIH foi aprovada sem necessidade de discussão ou correções. Processo encerrado com sucesso.</p>
                            </div>
                        </div>
                        <div class="status-item">
                            <div class="status-numero">2</div>
                            <div>
                                <strong style="color: #c2410c;">Ativa com aprovação indireta</strong>
                                <p>AIH aprovada, mas com pequenos ajustes ou observações que não impedem a liberação.</p>
                            </div>
                        </div>
                        <div class="status-item">
                            <div class="status-numero">3</div>
                            <div>
                                <strong style="color: #b91c1c;">Ativa em discussão</strong>
                                <p>AIH em processo de análise, com pendências que precisam ser resolvidas antes da aprovação.</p>
                            </div>
                        </div>
                        <div class="status-item">
                            <div class="status-numero">4</div>
                            <div>
                                <strong style="color: #5b21b6;">Finalizada após discussão</strong>
                                <p>AIH finalizada após processo de discussão e resolução de pendências. Processo encerrado.</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // 3. Carregar profissionais
        const profResult = await api('/profissionais');
        const profissionais = profResult.profissionais;

        // 4. Obter profissionais da última movimentação ANTES de preencher os selects
        let profissionaisPreSelecionados = null;
        if (state.aihAtual && state.aihAtual.movimentacoes && state.aihAtual.movimentacoes.length > 0) {
            const movimentacoesOrdenadas = [...state.aihAtual.movimentacoes].sort((a, b) => 
                new Date(b.data_movimentacao) - new Date(a.data_movimentacao)
            );
            profissionaisPreSelecionados = movimentacoesOrdenadas[0];
            console.log('Profissionais a pré-selecionar:', profissionaisPreSelecionados);
        }

        // 5. Preencher selects COM pré-seleção integrada
        const especialidades = [
            { id: 'movProfMedicina', nome: 'Medicina', campo: 'prof_medicina' },
            { id: 'movProfEnfermagem', nome: 'Enfermagem', campo: 'prof_enfermagem' },
            { id: 'movProfFisioterapia', nome: 'Fisioterapia', campo: 'prof_fisioterapia' },
            { id: 'movProfBucomaxilo', nome: 'Bucomaxilo', campo: 'prof_bucomaxilo' }
        ];

        especialidades.forEach(esp => {
            const select = document.getElementById(esp.id);
            if (select) {
                // Limpar select
                select.innerHTML = `<option value="">Selecione - ${esp.nome}</option>`;

                // Adicionar profissionais da especialidade
                const profsDaEspecialidade = profissionais.filter(p => 
                    p.especialidade.toLowerCase() === esp.nome.toLowerCase()
                );

                profsDaEspecialidade.forEach(prof => {
                    const selected = (profissionaisPreSelecionados && 
                                    profissionaisPreSelecionados[esp.campo] === prof.nome) ? 'selected' : '';
                    select.innerHTML += `<option value="${prof.nome}" ${selected}>${prof.nome}</option>`;
                });

                // Log da pré-seleção
                if (profissionaisPreSelecionados && profissionaisPreSelecionados[esp.campo]) {
                    console.log(`✅ Pré-seleção aplicada: ${esp.id} = ${profissionaisPreSelecionados[esp.campo]}`);
                }
            }
        });

        // 6. Carregar próxima movimentação possível
        if (state.aihAtual) {
            const proximaMovResult = await api(`/aih/${state.aihAtual.id}/proxima-movimentacao`);

            // Configurar o tipo de movimentação automaticamente
            const tipoSelect = document.getElementById('movTipo');
            if (tipoSelect) {
                tipoSelect.innerHTML = `<option value="${proximaMovResult.proximo_tipo}">${proximaMovResult.descricao}</option>`;
                tipoSelect.disabled = true; // Não permite alteração
            }

            // Exibir explicação
            const explicacaoDiv = document.getElementById('explicacaoMovimentacao');
            if (explicacaoDiv) {
                explicacaoDiv.innerHTML = `
                    <div class="info-box">
                        <h4>📝 Próxima Movimentação</h4>
                        <p><strong>${proximaMovResult.descricao}</strong></p>
                        <p class="explicacao">${proximaMovResult.explicacao}</p>
                        ${proximaMovResult.ultima_movimentacao ? 
                            `<p class="historico">Última movimentação: ${proximaMovResult.ultima_movimentacao === 'entrada_sus' ? 'Entrada na Auditoria SUS' : 'Saída para Auditoria Hospital'}</p>` : 
                            '<p class="historico">Esta será a primeira movimentação desta AIH.</p>'
                        }
                    </div>
                `;
            }
        }

        // 7. Preencher dados da AIH atual
        if (state.aihAtual) {
            document.getElementById('movCompetencia').value = state.aihAtual.competencia;
            document.getElementById('movValor').value = state.aihAtual.valor_atual;
        }

        // 8. Carregar e exibir glosas existentes (sempre por último)
        await carregarGlosas();

    } catch (err) {
        console.error('Erro ao carregar dados:', err);
    }
};

// Carregar profissionais nos selects (função auxiliar para compatibilidade)
const carregarProfissionaisSelects = async () => {
    try {
        const response = await api('/profissionais');
        const profissionais = response.profissionais;

        // Preencher select de pesquisa
        const pesquisaProf = document.getElementById('pesquisaProfissional');
        if (pesquisaProf) {
            pesquisaProf.innerHTML = '<option value="">Todos os profissionais</option>';
            profissionais.forEach(prof => {
                pesquisaProf.innerHTML += `<option value="${prof.nome}">${prof.nome} - ${prof.especialidade}</option>`;
            });
        }

        // Preencher select de glosas
        const glosaProf = document.getElementById('glosaProfissional');
        if (glosaProf) {
            glosaProf.innerHTML = '<option value="">Selecione o profissional</option>';
            profissionais.forEach(prof => {
                glosaProf.innerHTML += `<option value="${prof.nome}">${prof.nome} - ${prof.especialidade}</option>`;
            });
        }
    } catch (err) {
        console.error('Erro ao carregar profissionais:', err);
    }
};

// Gerenciar glosas
document.getElementById('btnGerenciarGlosas').addEventListener('click', () => {
    state.telaAnterior = 'telaMovimentacao';
    mostrarTela('telaPendencias');
    carregarGlosas();
});

const carregarGlosas = async () => {
    if (!state.aihAtual || !state.aihAtual.id) {
        console.error('AIH atual não definida');
        return;
        }

    const container = document.getElementById('glosasAtuais');
    const listaGlosasMovimentacao = document.getElementById('listaGlosas');

    try {
        const response = await api(`/aih/${state.aihAtual.id}/glosas`);
        state.glosasPendentes = response.glosas;

        // Carregar tipos de glosa e profissionais para os selects
        await carregarTiposGlosa();
        await carregarProfissionaisSelects();

        // Atualizar na tela de pendências
        if (container) {
            container.innerHTML = response.glosas.map(g => `
                <div class="glosa-item">
                    <div>
                        <strong>${g.linha}</strong> - ${g.tipo}
                        <br>
                        <span style="color: #64748b; font-size: 0.875rem;">
                            Por: ${g.profissional} | Quantidade: ${g.quantidade || 1}
                        </span>
                    </div>
                    <button onclick="removerGlosa(${g.id})" class="btn-danger" style="padding: 0.5rem 1rem;">
                        Remover
                    </button>
                </div>
            `).join('') || '<p>Nenhuma pendência/glosa ativa</p>';        }

        // Atualizar também na tela de movimentação
        if (listaGlosasMovimentacao) {
            if (response.glosas.length > 0) {
                listaGlosasMovimentacao.innerHTML = `
                    <div style="background: #fef3c7; padding: 1rem; border-radius: 8px; border-left: 4px solid #f59e0b;">
                        <h4 style="color: #92400e; margin-bottom: 0.75rem;">
                            ⚠️ Pendências/Glosas Ativas (${response.glosas.length})
                        </h4>
                        ${response.glosas.map(g => `
                            <div style="background: white; margin-bottom: 0.5rem; padding: 0.75rem; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>${g.linha}</strong> - ${g.tipo}
                                    <br>
                                    <span style="color: #64748b; font-size: 0.875rem;">
                                        Por: ${g.profissional} | Qtd: ${g.quantidade || 1}
                                    </span>
                                </div>
                                <span style="color: #92400e; font-size: 0.75rem;">
                                    ${new Date(g.criado_em).toLocaleDateString('pt-BR')}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                listaGlosasMovimentacao.innerHTML = `
                    <div style="background: #d1fae5; padding: 1rem; border-radius: 8px; border-left: 4px solid #10b981;">
                        <p style="color: #064e3b; margin: 0;">
                            ✅ Nenhuma pendência/glosa ativa
                        </p>
                    </div>
                `;
            }
        }
    } catch (err) {
        console.error('Erro ao carregar glosas:', err);
        if (container) {
            container.innerHTML = '<p style="color: #ef4444;">Erro ao carregar glosas</p>';
        }
        if (listaGlosasMovimentacao) {
            listaGlosasMovimentacao.innerHTML = '<p style="color: #ef4444;">Erro ao carregar glosas</p>';
        }
    }
};

// Carregar tipos de glosa
const carregarTiposGlosa = async () => {
    try {
        const response = await api('/tipos-glosa');
        const select = document.getElementById('glosaTipo');
        if (select) {
            select.innerHTML = '<option value="">Selecione o tipo de glosa</option>';
            response.tipos.forEach(tipo => {
                select.innerHTML += `<option value="${tipo.descricao}">${tipo.descricao}</option>`;
            });
        }
    } catch (err) {
        console.error('Erro ao carregar tipos de glosa:', err);
    }
};

window.removerGlosa = async (id) => {
    try {
        await api(`/glosas/${id}`, { method: 'DELETE' });
        carregarGlosas();
    } catch (err) {
        alert('Erro ao remover glosa: ' + err.message);
    }
};

// Nova glosa
document.getElementById('formNovaGlosa').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const dados = {
            linha: document.getElementById('glosaLinha').value,
            tipo: document.getElementById('glosaTipo').value,
            profissional: document.getElementById('glosaProfissional').value,
            quantidade: parseInt(document.getElementById('glosaQuantidade').value) || 1
        };

        await api(`/aih/${state.aihAtual.id}/glosas`, {
            method: 'POST',
            body: JSON.stringify(dados)
        });

        // Limpar formulário
        document.getElementById('formNovaGlosa').reset();
        document.getElementById('glosaQuantidade').value = 1;

        // Recarregar glosas imediatamente
        await carregarGlosas();

        // Mostrar confirmação
        alert('Pendência/Glosa adicionada com sucesso!');
    } catch (err) {
        alert('Erro ao adicionar pendência/glosa: ' + err.message);
    }
});

document.getElementById('btnSalvarGlosas').addEventListener('click', async () => {
    try {
        // Atualizar a AIH atual com as glosas mais recentes
        if (state.aihAtual) {
            const aihAtualizada = await api(`/aih/${state.aihAtual.numero_aih}`);
            state.aihAtual = aihAtualizada;
        }

        // Voltar para tela anterior
        voltarTelaAnterior();

        // Se voltou para movimentação, forçar atualização das glosas
        if (state.telaAnterior === 'telaMovimentacao') {
            setTimeout(async () => {
                await carregarGlosas();
            }, 200);
        }
    } catch (err) {
        console.error('Erro ao atualizar AIH:', err);
        voltarTelaAnterior();
    }
});

// Salvar movimentação
document.getElementById('formMovimentacao').addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Verificar se há mudança de status
    const novoStatus = parseInt(document.getElementById('movStatus').value);
    const statusAtual = state.aihAtual.status;
    
    if (novoStatus !== statusAtual) {
        const confirmarMudanca = await mostrarModal(
            'Confirmação de Mudança de Status',
            `O status da AIH será alterado de "${getStatusDescricao(statusAtual)}" para "${getStatusDescricao(novoStatus)}". Confirma esta alteração?`
        );

        if (!confirmarMudanca) {
            return;
        }
    }

    // 2. Verificar glosas pendentes
    if (state.glosasPendentes && state.glosasPendentes.length > 0) {
        const continuar = await mostrarModal(
            'Aviso',
            'Existem glosas/pendências nesta AIH. Deseja continuar sem revisar?'
        );

        if (!continuar) return;
    }

    try {
        const dados = {
            tipo: document.getElementById('movTipo').value,
            status_aih: novoStatus,
            valor_conta: parseFloat(document.getElementById('movValor').value),
            competencia: document.getElementById('movCompetencia').value,
            prof_medicina: document.getElementById('movProfMedicina').value,
            prof_enfermagem: document.getElementById('movProfEnfermagem').value,
            prof_fisioterapia: document.getElementById('movProfFisioterapia').value,
            prof_bucomaxilo: document.getElementById('movProfBucomaxilo').value,
            observacoes: document.getElementById('movObservacoes')?.value || ''
        };

        await api(`/aih/${state.aihAtual.id}/movimentacao`, {
            method: 'POST',
            body: JSON.stringify(dados)
        });

        alert('Movimentação registrada com sucesso!');

        // Recarregar AIH
        const aih = await api(`/aih/${state.aihAtual.numero_aih}`);
        state.aihAtual = aih;
        mostrarInfoAIH(aih);
    } catch (err) {
        alert('Erro ao salvar movimentação: ' + err.message);
    }
});

// Botão cancelar movimentação
document.getElementById('btnCancelarMovimentacao').addEventListener('click', async () => {
    const confirmarCancelamento = await mostrarModal(
        'Cancelar Movimentação',
        'Tem certeza que deseja cancelar esta movimentação? Todas as alterações serão perdidas.'
    );

    if (confirmarCancelamento) {
        voltarTelaAnterior();
    }
});

// Pesquisa avançada
document.getElementById('formPesquisa').addEventListener('submit', async (e) => {
    e.preventDefault();

    const status = Array.from(document.querySelectorAll('#formPesquisa input[type="checkbox"]:checked'))
        .map(cb => parseInt(cb.value));

    const filtros = {
        numero_aih: document.getElementById('pesquisaNumeroAIH').value,
        status,
        competencia: document.getElementById('pesquisaCompetencia').value,
        data_inicio: document.getElementById('pesquisaDataInicio').value,
        data_fim: document.getElementById('pesquisaDataFim').value,
        valor_min: document.getElementById('pesquisaValorMin').value,
        valor_max: document.getElementById('pesquisaValorMax').value,
        profissional: document.getElementById('pesquisaProfissional').value
    };

    // Remover filtros vazios
    Object.keys(filtros).forEach(key => {
        if (!filtros[key] || (Array.isArray(filtros[key]) && filtros[key].length === 0)) {
            delete filtros[key];
        }
    });

    try {
        const response = await api('/pesquisar', {
            method: 'POST',
            body: JSON.stringify({ filtros })
        });

        const container = document.getElementById('resultadosPesquisa');

        if (response.resultados.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #64748b; margin-top: 2rem;">Nenhum resultado encontrado</p>';
            return;
        }

        container.innerHTML = `
            <h3 style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem;">
                <span>📊 Resultados Encontrados</span>
                <span style="background: #6366f1; color: white; padding: 0.5rem 1rem; border-radius: 9999px;">
                    ${response.resultados.length} AIHs
                </span>
            </h3>

            <div style="display: grid; gap: 1rem; margin-bottom: 2rem;">
                ${response.resultados.map(r => `
                    <div style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); 
                                display: flex; justify-content: space-between; align-items: center; 
                                transition: all 0.3s; cursor: pointer; border: 2px solid transparent;"
                         onmouseover="this.style.borderColor='#6366f1'; this.style.transform='translateY(-2px)'"
                         onmouseout="this.style.borderColor='transparent'; this.style.transform='translateY(0)'"
                         onclick="abrirAIH('${r.numero_aih}')">
                        <div>
                            <h4 style="color: #1e293b; margin-bottom: 0.5rem;">AIH ${r.numero_aih}</h4>
                            <div style="display: flex; gap: 2rem; color: #64748b; font-size: 0.875rem;">
                                <span>📅 ${r.competencia}</span>
                                <span>💰 R$ ${r.valor_atual.toFixed(2)}</span>
                                <span>📆 ${new Date(r.criado_em).toLocaleDateString('pt-BR')}</span>
                                ${r.total_glosas > 0 ? `<span>⚠️ ${r.total_glosas} glosa(s)</span>` : ''}
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <span class="status-badge status-${r.status}">${getStatusDescricao(r.status)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button onclick="exportarResultados('csv')" class="btn-success">
                    📄 Exportar CSV
                </button>
                <button onclick="exportarResultados('excel')" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                    📊 Exportar Excel
                </button>
                <button onclick="exportarResultados('json')" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
                    🔧 Exportar JSON
                </button>
                <button onclick="window.print()" style="background: linear-gradient(135deg, #64748b 0%, #475569 100%);">
                    🖨️ Imprimir
                </button>
            </div>
        `;
    } catch (err) {
        alert('Erro na pesquisa: ' + err.message);
    }
});

window.abrirAIH = async (numero) => {
    try {
        const aih = await api(`/aih/${numero}`);
        state.aihAtual = aih;
        mostrarInfoAIH(aih);
    } catch (err) {
        alert('Erro ao abrir AIH: ' + err.message);
    }
};

window.exportarResultados = (formato) => {
    exportarDados(formato);
};

// Função para fazer backup com autenticação
window.fazerBackup = async () => {
    try {
        const response = await fetch('/api/backup', {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao fazer backup');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-aih-${new Date().toISOString().split('T')[0]}.db`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        document.getElementById('modal').classList.remove('ativo');
    } catch (err) {
        alert('Erro ao fazer backup: ' + err.message);
    }
};

// Função para exportar dados com autenticação
window.exportarDados = async (formato) => {
    try {
        const response = await fetch(`/api/export/${formato}`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao exportar dados');
        }

        let filename = `export-aih-${new Date().toISOString().split('T')[0]}`;
        let blob;

        if (formato === 'json') {
            const data = await response.json();
            blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            filename += '.json';
        } else if (formato === 'excel') {
            blob = await response.blob();
            filename += '.xls';
        } else {
            blob = await response.blob();
            filename += '.csv';
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Fechar modal se estiver aberto
        const modal = document.getElementById('modal');
        if (modal.classList.contains('ativo')) {
            modal.classList.remove('ativo');
        }
    } catch (err) {
        alert('Erro ao exportar: ' + err.message);
    }
};

// Configurações - Profissionais
const carregarProfissionais = async () => {
    try {
        const response = await api('/profissionais');
        const container = document.getElementById('listaProfissionais');

        container.innerHTML = response.profissionais.map(p => `
            <div class="glosa-item">
                <span>${p.nome} - ${p.especialidade}</span>
                <button onclick="removerProfissional(${p.id})" class="btn-danger" style="padding: 0.25rem 0.75rem;">Remover</button>
            </div>
        `).join('') || '<p>Nenhum profissional cadastrado</p>';
    } catch (err) {
        console.error('Erro ao carregar profissionais:', err);
    }
};

window.removerProfissional = async (id) => {
    if (!confirm('Deseja remover este profissional?')) return;

    try {
        await api(`/profissionais/${id}`, { method: 'DELETE' });
        carregarProfissionais();
    } catch (err) {
        alert('Erro ao remover profissional: ' + err.message);
    }
};

document.getElementById('formNovoProfissional').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const dados = {
            nome: document.getElementById('profNome').value,
            especialidade: document.getElementById('profEspecialidade').value
        };

        await api('/profissionais', {
            method: 'POST',
            body: JSON.stringify(dados)
        });

        document.getElementById('formNovoProfissional').reset();
        carregarProfissionais();
    } catch (err) {
        alert('Erro ao adicionar profissional: ' + err.message);
    }
});

// Configurações - Tipos de Glosa
const carregarTiposGlosaConfig = async () => {
    try {
        const response = await api('/tipos-glosa');
        const container = document.getElementById('listaTiposGlosa');

        container.innerHTML = response.tipos.map(t => `
            <div class="glosa-item">
                <span>${t.descricao}</span>
                <button onclick="removerTipoGlosa(${t.id})" class="btn-danger" style="padding: 0.25rem 0.75rem;">Remover</button>
            </div>
        `).join('') || '<p>Nenhum tipo de glosa cadastrado</p>';
    } catch (err) {
        console.error('Erro ao carregar tipos de glosa:', err);
    }
};

window.removerTipoGlosa = async (id) => {
    if (!confirm('Deseja remover este tipo de glosa?')) return;

    try {
        await api(`/tipos-glosa/${id}`, { method: 'DELETE' });
        carregarTiposGlosaConfig();
    } catch (err) {
        alert('Erro ao remover tipo de glosa: ' + err.message);
    }
};

document.getElementById('formNovoTipoGlosa').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        const dados = {
            descricao: document.getElementById('tipoGlosaDescricao').value
        };

        await api('/tipos-glosa', {
            method: 'POST',
            body: JSON.stringify(dados)
        });

        document.getElementById('formNovoTipoGlosa').reset();
        carregarTiposGlosaConfig();
    } catch (err) {
        alert('Erro ao adicionar tipo de glosa: ' + err.message);
    }
});

// Relatórios
document.getElementById('btnRelatorios').addEventListener('click', () => {
    mostrarTela('telaRelatorios');
    document.getElementById('resultadoRelatorio').innerHTML = '';
});

window.gerarRelatorio = async (tipo) => {
    try {
        // Capturar filtros de período
        const dataInicio = document.getElementById('relatorioDataInicio')?.value || '';
        const dataFim = document.getElementById('relatorioDataFim')?.value || '';
        const competencia = document.getElementById('relatorioCompetencia')?.value || '';
        
        const filtros = {
            data_inicio: dataInicio,
            data_fim: dataFim,
            competencia: competencia
        };
        
        // Usar POST para enviar filtros
        const response = await api(`/relatorios/${tipo}`, {
            method: 'POST',
            body: JSON.stringify(filtros)
        });
        
        const container = document.getElementById('resultadoRelatorio');
        
        // Mostrar período selecionado
        let periodoTexto = '';
        if (competencia) {
            periodoTexto = `Competência: ${competencia}`;
        } else if (dataInicio && dataFim) {
            periodoTexto = `Período: ${new Date(dataInicio).toLocaleDateString('pt-BR')} a ${new Date(dataFim).toLocaleDateString('pt-BR')}`;
        } else if (dataInicio) {
            periodoTexto = `A partir de: ${new Date(dataInicio).toLocaleDateString('pt-BR')}`;
        } else if (dataFim) {
            periodoTexto = `Até: ${new Date(dataFim).toLocaleDateString('pt-BR')}`;
        } else {
            periodoTexto = 'Todos os períodos';
        }

        let conteudo = '';

        switch(tipo) {
            case 'tipos-glosa-periodo':
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            📊 Tipos de Glosa Mais Comuns - ${periodoTexto}
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Tipo de Glosa</th>
                                    <th>Total de Ocorrências</th>
                                    <th>Quantidade Total</th>
                                    <th>Profissionais Envolvidos</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${response.resultado.map(r => `
                                    <tr>
                                        <td>${r.tipo}</td>
                                        <td>${r.total_ocorrencias}</td>
                                        <td>${r.quantidade_total}</td>
                                        <td style="font-size: 0.875rem;">${r.profissionais.split(',').slice(0, 3).join(', ')}${r.profissionais.split(',').length > 3 ? '...' : ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                break;
                
            case 'aihs-profissional-periodo':
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            🏥 AIHs Auditadas por Profissional - ${periodoTexto}
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Profissional</th>
                                    <th>Especialidade</th>
                                    <th>AIHs Auditadas</th>
                                    <th>Total Movimentações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${response.resultado.map(r => `
                                    <tr>
                                        <td>${r.profissional}</td>
                                        <td>${r.especialidade}</td>
                                        <td>${r.total_aihs_auditadas}</td>
                                        <td>${r.total_movimentacoes}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                break;
                
            case 'glosas-profissional-periodo':
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            📋 Glosas por Profissional - ${periodoTexto}
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Profissional</th>
                                    <th>Total Glosas</th>
                                    <th>Quantidade Total</th>
                                    <th>Tipos Diferentes</th>
                                    <th>Principais Tipos</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${response.resultado.map(r => `
                                    <tr>
                                        <td>${r.profissional}</td>
                                        <td>${r.total_glosas}</td>
                                        <td>${r.quantidade_total}</td>
                                        <td>${r.tipos_diferentes}</td>
                                        <td style="font-size: 0.875rem;">${r.tipos_glosa.split(',').slice(0, 2).join(', ')}${r.tipos_glosa.split(',').length > 2 ? '...' : ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                break;
                
            case 'valores-glosas-periodo':
                const dados = response.resultado;
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            💰 Análise Financeira de Glosas - ${periodoTexto}
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
                            <div class="stat-card">
                                <h4>Total AIHs com Glosas</h4>
                                <p class="stat-number">${dados.aihs_com_glosas || 0}</p>
                                <p class="stat-subtitle">${dados.percentual_aihs_com_glosas}% do total</p>
                            </div>
                            <div class="stat-card">
                                <h4>Valor Total de Glosas</h4>
                                <p class="stat-number">R$ ${(dados.total_glosas || 0).toFixed(2)}</p>
                                <p class="stat-subtitle">Diferença entre inicial e atual</p>
                            </div>
                            <div class="stat-card">
                                <h4>Média por AIH com Glosa</h4>
                                <p class="stat-number">R$ ${(dados.media_glosa_por_aih || 0).toFixed(2)}</p>
                                <p class="stat-subtitle">Valor médio de glosa</p>
                            </div>
                            <div class="stat-card">
                                <h4>Maior Glosa</h4>
                                <p class="stat-number">R$ ${(dados.maior_glosa || 0).toFixed(2)}</p>
                                <p class="stat-subtitle">Menor: R$ ${(dados.menor_glosa || 0).toFixed(2)}</p>
                            </div>
                        </div>
                        <div style="margin-top: 2rem; background: #f8fafc; padding: 1.5rem; border-radius: 8px;">
                            <h4>Resumo Financeiro</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
                                <div>
                                    <strong>Valor Inicial Total:</strong><br>
                                    R$ ${(dados.valor_inicial_total || 0).toFixed(2)}
                                </div>
                                <div>
                                    <strong>Valor Atual Total:</strong><br>
                                    R$ ${(dados.valor_atual_total || 0).toFixed(2)}
                                </div>
                                <div>
                                    <strong>Total de AIHs no Período:</strong><br>
                                    ${dados.total_aihs_periodo || 0}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                break;
                
            case 'estatisticas-periodo':
                const stats = response.resultado;
                const totalStats = stats.total_aihs || 1;
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            📈 Estatísticas do Período - ${periodoTexto}
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
                            <div class="stat-card">
                                <h4>Total de AIHs</h4>
                                <p class="stat-number">${stats.total_aihs}</p>
                                <p class="stat-subtitle">No período selecionado</p>
                            </div>
                            <div class="stat-card success">
                                <h4>Aprovação Direta</h4>
                                <p class="stat-number">${stats.aprovacao_direta}</p>
                                <p class="stat-subtitle">${((stats.aprovacao_direta/totalStats)*100).toFixed(1)}%</p>
                            </div>
                            <div class="stat-card warning">
                                <h4>Em Discussão</h4>
                                <p class="stat-number">${stats.em_discussao}</p>
                                <p class="stat-subtitle">${((stats.em_discussao/totalStats)*100).toFixed(1)}%</p>
                            </div>
                            <div class="stat-card info">
                                <h4>Total de Glosas</h4>
                                <p class="stat-number">${stats.total_glosas}</p>
                                <p class="stat-subtitle">${stats.percentual_glosas}% das AIHs</p>
                            </div>
                        </div>
                        <div style="margin-top: 2rem;">
                            <h4>Movimentações no Período</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
                                <div class="info-card">
                                    <h5>Total de Movimentações</h5>
                                    <p style="font-size: 1.5rem; font-weight: bold;">${stats.total_movimentacoes}</p>
                                </div>
                                <div class="info-card">
                                    <h5>Entradas SUS</h5>
                                    <p style="font-size: 1.5rem; font-weight: bold; color: #059669;">${stats.entradas_sus}</p>
                                </div>
                                <div class="info-card">
                                    <h5>Saídas Hospital</h5>
                                    <p style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${stats.saidas_hospital}</p>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 2rem; background: #f8fafc; padding: 1.5rem; border-radius: 8px;">
                            <h4>Resumo Financeiro</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-top: 1rem;">
                                <div>
                                    <strong>Valor Médio Inicial:</strong><br>
                                    R$ ${(stats.valor_medio_inicial || 0).toFixed(2)}
                                </div>
                                <div>
                                    <strong>Valor Médio Atual:</strong><br>
                                    R$ ${(stats.valor_medio_atual || 0).toFixed(2)}
                                </div>
                                <div>
                                    <strong>Diferença Total:</strong><br>
                                    <span style="color: #dc2626;">R$ ${(stats.diferenca_valores || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                break;

            // Manter relatórios existentes
            case 'acessos':
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            👥 Relatório de Acessos ao Sistema
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Usuário</th>
                                    <th>Total de Acessos</th>
                                    <th>Último Acesso</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${response.resultado.map(r => `
                                    <tr>
                                        <td>${r.nome}</td>
                                        <td>${r.total_acessos}</td>
                                        <td>${new Date(r.ultimo_acesso).toLocaleString('pt-BR')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                break;

            case 'glosas-profissional':
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            📋 Glosas por Profissional
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Profissional</th>
                                    <th>Total de Glosas</th>
                                    <th>Quantidade de Itens</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${response.resultado.map(r => `
                                    <tr>
                                        <td>${r.profissional}</td>
                                        <td>${r.total_glosas}</td>
                                        <td>${r.total_itens}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                break;

            case 'aihs-profissional':
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            🏥 AIHs Auditadas por Profissional
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Profissional</th>
                                    <th>Total de AIHs</th>
                                    <th>Total de Movimentações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${response.resultado.map(r => `
                                    <tr>
                                        <td>${r.profissional}</td>
                                        <td>${r.total_aihs}</td>
                                        <td>${r.total_movimentacoes}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                break;

            case 'aprovacoes':
                const dadosAprov = response.resultado[0];
                const totalAprov = dadosAprov.total || 1;
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            ✅ Estatísticas de Aprovações
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
                            <div class="stat-card">
                                <h4>Aprovação Direta</h4>
                                <p class="stat-number">${dadosAprov.aprovacao_direta}</p>
                                <p class="stat-subtitle">${((dadosAprov.aprovacao_direta/totalAprov)*100).toFixed(1)}%</p>
                            </div>
                            <div class="stat-card">
                                <h4>Aprovação Indireta</h4>
                                <p class="stat-number">${dadosAprov.aprovacao_indireta}</p>
                                <p class="stat-subtitle">${((dadosAprov.aprovacao_indireta/totalAprov)*100).toFixed(1)}%</p>
                            </div>
                            <div class="stat-card">
                                <h4>Em Discussão</h4>
                                <p class="stat-number">${dadosAprov.em_discussao}</p>
                                <p class="stat-subtitle">${((dadosAprov.em_discussao/totalAprov)*100).toFixed(1)}%</p>
                            </div>
                            <div class="stat-card">
                                <h4>Finalizada Pós-Discussão</h4>
                                <p class="stat-number">${dadosAprov.finalizada_pos_discussao}</p>
                                <p class="stat-subtitle">${((dadosAprov.finalizada_pos_discussao/totalAprov)*100).toFixed(1)}%</p>
                            </div>
                        </div>
                    </div>
                `;
                break;

            case 'tipos-glosa':
                conteudo = `
                    <div class="relatorio-content">
                        <h3>
                            📊 Tipos de Glosa Mais Frequentes
                            <button onclick="exportarRelatorio('${tipo}')" class="btn-success" style="font-size: 0.875rem;">
                                Exportar Excel
                            </button>
                        </h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Tipo de Glosa</th>
                                    <th>Total de Ocorrências</th>
                                    <th>Quantidade Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${response.resultado.map(r => `
                                    <tr>
                                        <td>${r.tipo}</td>
                                        <td>${r.total}</td>
                                        <td>${r.quantidade_total}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                break;

            case 'analise-preditiva':
                const pred = response.resultado;
                conteudo = `
                    <div class="relatorio-content">
                        <h3>🔮 Análise Preditiva</h3>
                        <div style="display: grid; gap: 1.5rem; margin-top: 1.5rem;">
                            <div class="info-card">
                                <h4>Tempo Médio de Processamento</h4>
                                <p style="font-size: 2rem; font-weight: bold; color: var(--primary);">
                                    ${pred.tempo_medio_processamento} dias
                                </p>
                                <p style="color: #64748b;">Média de dias para finalizar AIHs</p>
                            </div>

                            <div class="info-card">
                                <h4>Valor Médio de Glosas</h4>
                                <p style="font-size: 2rem; font-weight: bold; color: var(--danger);">
                                    R$ ${pred.valor_medio_glosa.toFixed(2)}
                                </p>
                                <p style="color: #64748b;">Valor médio perdido por AIH com glosa</p>
                            </div>

                            <div class="info-card">
                                <h4>Tendência de Glosas (Últimos 6 meses)</h4>
                                <div style="display: flex; gap: 1rem; align-items: flex-end; height: 100px; margin-top: 1rem;">
                                    ${pred.tendencia_glosas.map(t => `
                                        <div style="flex: 1; background: var(--primary); height: ${(t.total/Math.max(...pred.tendencia_glosas.map(x => x.total)))*100}px;
                                                    border-radius: 4px 4px 0 0; position: relative;">
                                            <span style="position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%);
                                                         font-size: 0.75rem; color: #64748b; white-space: nowrap;">
                                                ${t.mes}
                                            </span>
                                            <span style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%);
                                                         font-size: 0.875rem; font-weight: 600; color: var(--primary);">
                                                ${t.total}
                                            </span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <div class="info-card">
                                <h4>Previsão</h4>
                                <p>${pred.previsao}</p>
                            </div>
                        </div>
                    </div>
                `;
                break;
        }

        container.innerHTML = conteudo;
        container.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        alert('Erro ao gerar relatório: ' + err.message);
    }
};

window.limparFiltrosRelatorio = () => {
    document.getElementById('relatorioDataInicio').value = '';
    document.getElementById('relatorioDataFim').value = '';
    document.getElementById('relatorioCompetencia').value = '';
    document.getElementById('resultadoRelatorio').innerHTML = '';
};

window.exportarRelatorio = async (tipo) => {
    try {
        // Capturar filtros de período para relatórios filtrados
        const dataInicio = document.getElementById('relatorioDataInicio')?.value || '';
        const dataFim = document.getElementById('relatorioDataFim')?.value || '';
        const competencia = document.getElementById('relatorioCompetencia')?.value || '';
        
        const filtros = {
            data_inicio: dataInicio,
            data_fim: dataFim,
            competencia: competencia
        };
        
        // Verificar se é um relatório que suporta filtros por período
        const relatoriosComFiltros = [
            'tipos-glosa-periodo', 
            'aihs-profissional-periodo', 
            'glosas-profissional-periodo', 
            'valores-glosas-periodo', 
            'estatisticas-periodo'
        ];
        
        let response;
        
        if (relatoriosComFiltros.includes(tipo)) {
            // Usar POST para relatórios com filtros
            response = await fetch(`/api/relatorios/${tipo}/export`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(filtros)
            });
        } else {
            // Usar GET para relatórios sem filtros (compatibilidade)
            response = await fetch(`/api/relatorios/${tipo}/export`, {
                headers: {
                    'Authorization': `Bearer ${state.token}`
                }
            });
        }

        if (!response.ok) {
            throw new Error('Erro ao exportar relatório');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        // Nome do arquivo com período se aplicável
        let nomeArquivo = `relatorio-${tipo}-${new Date().toISOString().split('T')[0]}`;
        if (competencia) {
            nomeArquivo += `-${competencia.replace('/', '-')}`;
        } else if (dataInicio && dataFim) {
            nomeArquivo += `-${dataInicio}-a-${dataFim}`;
        }
        nomeArquivo += '.xls';
        
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (err) {
        alert('Erro ao exportar relatório: ' + err.message);
    }
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se tem token
    if (state.token) {
        // Pequeno delay para garantir que o DOM está pronto
        setTimeout(() => {
            mostrarTela('telaPrincipal');
            carregarDashboard();
            carregarProfissionaisSelects();
        }, 100);
    } else {
        mostrarTela('telaLogin');
    }

    // Preencher competência padrão nos formulários
    const camposCompetencia = ['cadastroCompetencia', 'movCompetencia', 'pesquisaCompetencia'];
    camposCompetencia.forEach(id => {
        const campo = document.getElementById(id);
        if (campo && !campo.value) {
            campo.value = getCompetenciaAtual();
        }
    });
});

const getTipoDescricao = (tipo) => {
    switch (tipo) {
        case 'entrada_sus':
            return 'Entrada na Auditoria SUS';
        case 'saida_hospital':
            return 'Saída para o Hospital';
        default:
            return 'Tipo Desconhecido';
    }
};

// Adiciona a função exportarHistoricoMovimentacoes
window.exportarHistoricoMovimentacoes = async (formato) => {
    if (!state.aihAtual || !state.aihAtual.movimentacoes) {
        alert('Não há histórico de movimentações para exportar.');
        return;
    }

    try {
        // Preparar dados para exportação
        const dadosExportacao = state.aihAtual.movimentacoes.map(mov => ({
            Data: new Date(mov.data_movimentacao).toLocaleDateString('pt-BR'),
            Tipo: getTipoDescricao(mov.tipo),
            Status: getStatusDescricao(mov.status_aih),
            Valor: mov.valor_conta ? mov.valor_conta.toFixed(2) : '0,00',
            Competencia: mov.competencia || '-',
            Observações: mov.observacoes || '-'
        }));

        // Converter para o formato desejado
        let blob;
        let filename = `historico-movimentacoes-aih-${state.aihAtual.numero_aih}-${new Date().toISOString().split('T')[0]}`;

        if (formato === 'csv') {
            // CSV
            const csvRows = [
                Object.keys(dadosExportacao[0]).join(','), // Header
                ...dadosExportacao.map(row => Object.values(row).join(',')) // Data rows
            ];
            const csvString = csvRows.join('\n');
            blob = new Blob([csvString], { type: 'text/csv' });
            filename += '.csv';
        } else if (formato === 'xlsx') {
            // XLSX (Excel) - Requer uma biblioteca como SheetJS (não incluída aqui)
            // Como não podemos incluir bibliotecas externas, simulamos a exportação para CSV
            // e alertamos o usuário.
            alert('Exportação para Excel (xlsx) não suportada nesta versão. Será exportado em formato CSV.');
            const csvRows = [
                Object.keys(dadosExportacao[0]).join(','), // Header
                ...dadosExportacao.map(row => Object.values(row).join(',')) // Data rows
            ];
            const csvString = csvRows.join('\n');
            blob = new Blob([csvString], { type: 'text/csv' });
            filename += '.csv';

        } else {
            alert('Formato de exportação não suportado.');
            return;
        }

        // Criar link para download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error('Erro ao exportar histórico de movimentações:', error);
        alert('Erro ao exportar histórico de movimentações: ' + error.message);
    }
};