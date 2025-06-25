const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-aih-2024';

// Criar hash de senha
const hashSenha = async (senha) => {
    return await bcrypt.hash(senha, 10);
};

// Verificar senha
const verificarSenha = async (senha, hash) => {
    return await bcrypt.compare(senha, hash);
};

// Gerar token JWT
const gerarToken = (usuario) => {
    return jwt.sign(
        { id: usuario.id, nome: usuario.nome },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

// Verificar token
const verificarToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// Login
const login = async (nome, senha) => {
    const usuario = await get('SELECT * FROM usuarios WHERE nome = ?', [nome]);
    
    if (!usuario) {
        throw new Error('Usuário não encontrado');
    }
    
    const senhaValida = await verificarSenha(senha, usuario.senha_hash);
    
    if (!senhaValida) {
        throw new Error('Senha incorreta');
    }
    
    return {
        token: gerarToken(usuario),
        usuario: { id: usuario.id, nome: usuario.nome }
    };
};

// Cadastrar usuário
const cadastrarUsuario = async (nome, senha) => {
    const usuarioExiste = await get('SELECT id FROM usuarios WHERE nome = ?', [nome]);
    
    if (usuarioExiste) {
        throw new Error('Usuário já existe');
    }
    
    const senhaHash = await hashSenha(senha);
    const result = await run(
        'INSERT INTO usuarios (nome, senha_hash) VALUES (?, ?)',
        [nome, senhaHash]
    );
    
    return { id: result.id, nome };
};

module.exports = {
    verificarToken,
    login,
    cadastrarUsuario
};