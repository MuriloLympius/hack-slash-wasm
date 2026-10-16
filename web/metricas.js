// Métricas da run: nomes na ordem do enum M_* em src/estado.c. Usado pelo main.js (guarda no navegador) e por tools/.
export const INIMIGOS = ['rato', 'atirador', 'investidor', 'mini-boss', 'boss', 'explosivo', 'escudeiro', 'invocador', 'torreta', 'barril'];
export const ITENS = ['espada', 'machado', 'lanca', 'pistola', 'rifle', 'escopeta', 'eclipse', 'tectonico', 'dragao', 'escudo',
  'choque', 'adagas', 'martelo', 'boxe', 'foice', 'botas', 'coracao-de-ferro', 'luva-da-furia', 'cavaleiro', 'coracao', 'lua',
  'foice-carta', 'passaros', 'sol', 'caixao', 'crianca', 'lirios', 'ancora', 'cobra', 'chicote', 'urso'];
const ARMAS = ITENS.slice(0, 15), SALAS = ['inicial', 'comum', 'mini', 'boss', 'tesouro', 'loja'];
const EVENTOS = ['-', 'acertos', 'acertos-fortes', 'mortes', 'mortes-chefe', 'golpes', 'tiros-pistola', 'tiros-rifle', 'tiros-escopeta',
  'dashes', 'feridas', 'portas', 'itens-pegos', 'tiros-inimigos', 'chefe-fase', 'salas-limpas', 'recargas', 'golpes-no-escudo',
  'rebatidas', 'moedas', 'explosoes', 'bloqueios', 'aparos', 'furias', 'cargas', 'raios', 'teleportes', 'preparacoes'];
const lista = (pre, nomes, n = nomes.length) => Array.from({ length: n }, (_, i) => `${pre}.${nomes[i] ?? i}`);
export const NOMES = ['seed-hi', 'seed-lo', 'visual', 'morte-por', 'andar', 'tempo', 'tempo-combate', 'distancia', 'dano-feito',
  'dano-efeitos', 'dano-levado', 'cura', 'moedas-gastas', 'compras', 'trocas-de-arma', 'elites-mortas', 'arma', 'arma-de-fogo',
  'vida-max', 'moedas',
  ...lista('eventos', EVENTOS, 32), ...lista('salas-limpas', SALAS), ...lista('mortos', INIMIGOS, 9), ...lista('ferido-por', INIMIGOS),
  ...lista('levado-andar', [1, 2, 3, 4, 5, 6, 7, '8+']), ...lista('levado-sala', SALAS), ...lista('tempo-andar', [1, 2, 3, 4, 5, 6, 7, '8+']),
  ...lista('tempo-arma', ARMAS), ...lista('dano-arma', ARMAS), ...lista('mortes-arma', ARMAS), ...lista('itens', ITENS)];

// Lê a run atual do wasm como objeto curto: só o que não é zero, arredondado; seed e nomes já resolvidos.
export function lerMetricas(g) {
  const v = new Float32Array(g.memory.buffer, g.met_ptr(), g.met_count()), r = {};
  for (let i = 4; i < v.length; i++) if (v[i]) r[NOMES[i]] = Math.round(v[i] * 100) / 100;
  r.seed = v[0] * 65536 + v[1];
  r.visual = v[2];
  r['morte-por'] = v[3] >= 0 ? INIMIGOS[v[3]] : null;
  r.arma = ITENS[v[16]]; r['arma-de-fogo'] = ITENS[v[17]];
  return r;
}
