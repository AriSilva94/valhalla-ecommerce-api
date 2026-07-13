'use strict';

// ---------------------------------------------------------------------------
// Source data — transcribed verbatim from the frontend project at
// C:\Users\ariov\Desktop\projetos\valhalla-ecommerce
// (app/lib/data.ts, app/components/Store.tsx, app/layout.tsx).
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: 'smartphones', name: 'Smartphones', description: 'Os lançamentos que você quer' },
  { id: 'notebooks', name: 'Notebooks', description: 'Trabalho, estudo e jogos' },
  { id: 'tablets', name: 'Tablets', description: 'Tela grande, vida leve' },
  { id: 'smartwatches', name: 'Smartwatches', description: 'Saúde e estilo no pulso' },
  { id: 'audio', name: 'Áudio', description: 'Som que envolve' },
  { id: 'acessorios', name: 'Acessórios', description: 'Complete o seu setup' },
  { id: 'games', name: 'Games', description: 'Em breve no catálogo' },
];

const BRANDS = ['Samsung', 'Apple', 'Xiaomi', 'Lenovo', 'Acer', 'JBL', 'Logitech', 'Baseus', 'Redragon'];

const PRODUCTS = [
  { id: 's25u', name: 'Galaxy S25 Ultra', brand: 'Samsung', cat: 'smartphones', price: 6799, old: 7499, tag: null, stock: 'in', vl: 'Armazenamento',
    colors: [{ n: 'Titânio Preto', hex: '#2b2b30', av: true }, { n: 'Titânio Cinza', hex: '#8a8a90', av: true }, { n: 'Titânio Violeta', hex: '#7c6fa0', av: true }],
    vars: [{ l: '256 GB', d: 0, av: true }, { l: '512 GB', d: 700, av: true }, { l: '1 TB', d: 1800, av: false }],
    specs: [['Tela', '6.9" QHD+ 120 Hz'], ['Câmera', '200 MP + 50 MP + 12 MP'], ['Bateria', '5.000 mAh'], ['Processador', 'Snapdragon 8 Elite']],
    desc: 'O topo de linha da Samsung com S Pen integrada, câmera de 200 MP e IA no dia a dia.', w: '12 meses Samsung Brasil' },
  { id: 'ip16p', name: 'iPhone 16 Pro', brand: 'Apple', cat: 'smartphones', price: 9299, old: null, tag: 'NOVO', stock: 'low', vl: 'Armazenamento',
    colors: [{ n: 'Titânio Deserto', hex: '#c2a88a', av: true }, { n: 'Titânio Natural', hex: '#b6b4ae', av: true }, { n: 'Titânio Preto', hex: '#2f2f31', av: false }],
    vars: [{ l: '128 GB', d: 0, av: true }, { l: '256 GB', d: 800, av: true }, { l: '512 GB', d: 2000, av: true }],
    specs: [['Tela', '6.3" Super Retina XDR'], ['Chip', 'A18 Pro'], ['Câmera', '48 MP Fusion'], ['Bateria', 'Até 27h de vídeo']],
    desc: 'Titânio, botão de câmera dedicado e o chip mais rápido já colocado em um iPhone.', w: '12 meses Apple Brasil' },
  { id: 'x14t', name: 'Xiaomi 14T Pro', brand: 'Xiaomi', cat: 'smartphones', price: 3899, old: 4299, tag: null, stock: 'in', vl: 'Armazenamento',
    colors: [{ n: 'Preto', hex: '#232326', av: true }, { n: 'Cinza Titã', hex: '#9a9aa2', av: true }],
    vars: [{ l: '256 GB', d: 0, av: true }, { l: '512 GB', d: 400, av: true }],
    specs: [['Tela', '6.67" AMOLED 144 Hz'], ['Câmera', 'Leica 50 MP tripla'], ['Bateria', '5.000 mAh · 120 W'], ['Processador', 'Dimensity 9300+']],
    desc: 'Câmeras Leica, carregamento de 120 W e desempenho de flagship pagando menos.', w: '12 meses Xiaomi Brasil' },
  { id: 'mba', name: 'MacBook Air M4 13"', brand: 'Apple', cat: 'notebooks', price: 10999, old: null, tag: 'NOVO', stock: 'in', vl: 'Memória',
    colors: [{ n: 'Meia-noite', hex: '#2e3642', av: true }, { n: 'Estelar', hex: '#d9d2c5', av: true }, { n: 'Prateado', hex: '#c9cacc', av: true }],
    vars: [{ l: '16 GB / 256 GB', d: 0, av: true }, { l: '16 GB / 512 GB', d: 1300, av: true }, { l: '24 GB / 512 GB', d: 2500, av: true }],
    specs: [['Tela', '13.6" Liquid Retina'], ['Chip', 'Apple M4'], ['Bateria', 'Até 18 horas'], ['Peso', '1,24 kg']],
    desc: 'Silencioso, leve e absurdamente rápido: o notebook para quem quer esquecer o carregador.', w: '12 meses Apple Brasil' },
  { id: 'ideapad', name: 'Lenovo IdeaPad Slim 5', brand: 'Lenovo', cat: 'notebooks', price: 3399, old: 3799, tag: null, stock: 'in', vl: 'Configuração',
    colors: [{ n: 'Cinza Ártico', hex: '#a9adb3', av: true }, { n: 'Azul Abismo', hex: '#3b4a63', av: true }],
    vars: [{ l: 'Ryzen 5 · 16 GB · 512 GB', d: 0, av: true }, { l: 'Ryzen 7 · 16 GB · 1 TB', d: 900, av: true }],
    specs: [['Tela', '15.3" WUXGA'], ['Processador', 'AMD Ryzen 5 8645HS'], ['Memória', '16 GB DDR5'], ['SSD', '512 GB NVMe']],
    desc: 'O custo-benefício queridinho para estudo e trabalho, com teclado numérico e tela grande.', w: '12 meses Lenovo Brasil' },
  { id: 'nitro', name: 'Acer Nitro V15 RTX 4050', brand: 'Acer', cat: 'notebooks', price: 5499, old: null, tag: 'NOVO', stock: 'in', vl: 'Configuração',
    colors: [{ n: 'Preto Obsidian', hex: '#1c1c1f', av: true }],
    vars: [{ l: 'i5 · 16 GB · 512 GB', d: 0, av: true }, { l: 'i7 · 16 GB · 1 TB', d: 1100, av: true }],
    specs: [['Tela', '15.6" FHD 144 Hz'], ['GPU', 'GeForce RTX 4050'], ['Processador', 'Intel Core i5-13420H'], ['Memória', '16 GB DDR5']],
    desc: 'Roda os títulos do momento em alta taxa de quadros sem estourar o orçamento.', w: '12 meses Acer Brasil' },
  { id: 'ipad11', name: 'iPad 11ª geração', brand: 'Apple', cat: 'tablets', price: 4199, old: null, tag: null, stock: 'in', vl: 'Armazenamento',
    colors: [{ n: 'Azul', hex: '#5f7fae', av: true }, { n: 'Rosa', hex: '#d9a3b2', av: true }, { n: 'Prateado', hex: '#c9cacc', av: true }],
    vars: [{ l: '128 GB Wi-Fi', d: 0, av: true }, { l: '256 GB Wi-Fi', d: 700, av: true }],
    specs: [['Tela', '10.9" Liquid Retina'], ['Chip', 'A16 Bionic'], ['Câmera', '12 MP'], ['Conector', 'USB-C']],
    desc: 'O tablet para tudo: aula, série, desenho e trabalho leve, com suporte à Apple Pencil.', w: '12 meses Apple Brasil' },
  { id: 'tabs10', name: 'Galaxy Tab S10 FE', brand: 'Samsung', cat: 'tablets', price: 3149, old: 3499, tag: null, stock: 'in', vl: 'Armazenamento',
    colors: [{ n: 'Grafite', hex: '#4b4b50', av: true }, { n: 'Prata', hex: '#c6c6cb', av: true }],
    vars: [{ l: '128 GB', d: 0, av: true }, { l: '256 GB', d: 450, av: true }],
    specs: [['Tela', '10.9" 90 Hz'], ['Bateria', '8.000 mAh'], ['S Pen', 'Inclusa na caixa'], ['Resistência', 'IP68']],
    desc: 'Vem com S Pen na caixa e resistência à água — perfeito para estudo e produtividade.', w: '12 meses Samsung Brasil' },
  { id: 'aws10', name: 'Apple Watch Series 10', brand: 'Apple', cat: 'smartwatches', price: 4699, old: null, tag: 'NOVO', stock: 'in', vl: 'Caixa',
    colors: [{ n: 'Preto Espacial', hex: '#2c2c2e', av: true }, { n: 'Ouro Rosa', hex: '#d8b3a5', av: true }],
    vars: [{ l: '42 mm GPS', d: 0, av: true }, { l: '46 mm GPS', d: 400, av: true }],
    specs: [['Tela', 'Retina sempre ativa'], ['Saúde', 'ECG + apneia do sono'], ['Resistência', '50 m'], ['Bateria', '18 horas']],
    desc: 'A tela maior e mais fina de um Apple Watch, com sensores de saúde de última geração.', w: '12 meses Apple Brasil' },
  { id: 'gw7', name: 'Galaxy Watch7', brand: 'Samsung', cat: 'smartwatches', price: 1999, old: 2299, tag: null, stock: 'in', vl: 'Caixa',
    colors: [{ n: 'Verde', hex: '#4a5d4e', av: true }, { n: 'Creme', hex: '#e3dccb', av: true }],
    vars: [{ l: '40 mm BT', d: 0, av: true }, { l: '44 mm BT', d: 300, av: true }],
    specs: [['Tela', 'Super AMOLED'], ['Saúde', 'BioActive Sensor'], ['Bateria', '425 mAh'], ['Sistema', 'Wear OS']],
    desc: 'Monitoramento completo de saúde e treinos com integração total ao Galaxy.', w: '12 meses Samsung Brasil' },
  { id: 'jbl770', name: 'JBL Tune 770NC', brand: 'JBL', cat: 'audio', price: 549, old: 699, tag: null, stock: 'in', vl: 'Modelo',
    colors: [{ n: 'Preto', hex: '#222226', av: true }, { n: 'Azul', hex: '#3d5a8a', av: true }, { n: 'Branco', hex: '#e8e8ea', av: true }],
    vars: [{ l: 'Padrão', d: 0, av: true }],
    specs: [['Tipo', 'Over-ear sem fio'], ['ANC', 'Cancelamento ativo'], ['Bateria', 'Até 70 h'], ['Conexão', 'Bluetooth 5.3']],
    desc: 'Cancelamento de ruído e até 70 horas de bateria com o grave característico da JBL.', w: '12 meses JBL Brasil' },
  { id: 'app2', name: 'AirPods Pro 2', brand: 'Apple', cat: 'audio', price: 2199, old: null, tag: null, stock: 'low', vl: 'Modelo',
    colors: [{ n: 'Branco', hex: '#eceff1', av: true }],
    vars: [{ l: 'USB-C', d: 0, av: true }],
    specs: [['ANC', '2× mais potente'], ['Áudio', 'Adaptativo + Espacial'], ['Bateria', 'Até 30 h com estojo'], ['Extra', 'Função aparelho auditivo']],
    desc: 'O fone da Apple com áudio adaptativo e o melhor cancelamento de ruído da categoria.', w: '12 meses Apple Brasil' },
  { id: 'sb510', name: 'Soundbar JBL Cinema SB510', brand: 'JBL', cat: 'audio', price: 1899, old: null, tag: null, stock: 'out', vl: 'Modelo',
    colors: [{ n: 'Preto', hex: '#1e1e21', av: true }],
    vars: [{ l: '3.1 canais', d: 0, av: true }],
    specs: [['Canais', '3.1 com subwoofer'], ['Potência', '420 W'], ['Conexão', 'HDMI eARC'], ['Extra', 'Dolby Digital']],
    desc: 'Som de cinema na sala com subwoofer sem fio e 420 W de potência.', w: '12 meses JBL Brasil' },
  { id: 'gan65', name: 'Carregador GaN 65W', brand: 'Baseus', cat: 'acessorios', price: 199, old: 249, tag: null, stock: 'in', vl: 'Modelo',
    colors: [{ n: 'Preto', hex: '#232326', av: true }, { n: 'Branco', hex: '#eceff1', av: true }],
    vars: [{ l: '2× USB-C + USB-A', d: 0, av: true }],
    specs: [['Potência', '65 W GaN'], ['Portas', '2× USB-C · 1× USB-A'], ['Proteção', 'Sobrecarga e temperatura'], ['Tamanho', 'Ultra compacto']],
    desc: 'Carrega notebook, celular e fone ao mesmo tempo em um corpo minúsculo.', w: '6 meses' },
  { id: 'pb20', name: 'Power Bank 20.000 mAh', brand: 'Baseus', cat: 'acessorios', price: 329, old: null, tag: null, stock: 'in', vl: 'Modelo',
    colors: [{ n: 'Preto', hex: '#232326', av: true }],
    vars: [{ l: '22.5 W · USB-C', d: 0, av: true }],
    specs: [['Capacidade', '20.000 mAh'], ['Potência', '22.5 W'], ['Display', 'Digital de carga'], ['Portas', 'USB-C + 2× USB-A']],
    desc: 'Uma semana de tranquilidade: carga rápida para até três aparelhos ao mesmo tempo.', w: '6 meses' },
  { id: 'mx3s', name: 'Mouse Logitech MX Master 3S', brand: 'Logitech', cat: 'acessorios', price: 579, old: 649, tag: null, stock: 'in', vl: 'Modelo',
    colors: [{ n: 'Grafite', hex: '#3a3a3e', av: true }, { n: 'Cinza Claro', hex: '#c9c9cd', av: true }],
    vars: [{ l: 'Padrão', d: 0, av: true }],
    specs: [['Sensor', '8.000 DPI'], ['Cliques', '90% mais silenciosos'], ['Bateria', '70 dias'], ['Conexão', 'Bluetooth + Bolt']],
    desc: 'O mouse favorito de quem trabalha: scroll MagSpeed e conforto para o dia inteiro.', w: '12 meses Logitech' },
  { id: 'kumara', name: 'Teclado Mecânico Redragon Kumara', brand: 'Redragon', cat: 'acessorios', price: 399, old: null, tag: null, stock: 'in', vl: 'Switch',
    colors: [{ n: 'Preto', hex: '#232326', av: true }, { n: 'Branco', hex: '#e8e8ea', av: true }],
    vars: [{ l: 'Switch Red', d: 0, av: true }, { l: 'Switch Brown', d: 0, av: true }, { l: 'Switch Blue', d: 0, av: false }],
    specs: [['Formato', 'TKL 87 teclas'], ['Switch', 'Outemu mecânico'], ['Iluminação', 'RGB'], ['Layout', 'ABNT2']],
    desc: 'O mecânico de entrada mais recomendado do Brasil, agora com RGB e layout ABNT2.', w: '12 meses Redragon' },
  { id: 'buds3', name: 'Galaxy Buds3 Pro', brand: 'Samsung', cat: 'audio', price: 1399, old: 1599, tag: 'NOVO', stock: 'in', vl: 'Modelo',
    colors: [{ n: 'Prata', hex: '#c9c9cd', av: true }, { n: 'Branco', hex: '#eceff1', av: true }],
    vars: [{ l: 'Padrão', d: 0, av: true }],
    specs: [['ANC', 'Adaptativo'], ['Áudio', 'Hi-Fi 24 bit'], ['Bateria', 'Até 30 h com estojo'], ['Extra', 'Interprete ao vivo']],
    desc: 'Design de haste com luz, áudio Hi-Fi e tradução simultânea no ouvido.', w: '12 meses Samsung Brasil' },
];

const FAQS = [
  { q: 'Como funciona a compra?', a: 'Você monta sua lista de interesse no site, revisa e é redirecionado ao WhatsApp com a mensagem pronta. Um atendente confirma disponibilidade, forma de pagamento e entrega — tudo na conversa.' },
  { q: 'Quais formas de pagamento vocês aceitam?', a: 'Pix, cartão de crédito (com parcelamento), débito e dinheiro na retirada. As condições são combinadas diretamente com o atendente.' },
  { q: 'Os produtos são originais e têm garantia?', a: 'Sim. Trabalhamos apenas com produtos originais, lacrados e com nota fiscal. A garantia é a de fábrica de cada marca, a partir de 6 meses.' },
  { q: 'Vocês entregam?', a: 'Fazemos retirada na loja em Macapá-AP e entregas combinadas com o atendente. Prazo e valor do frete são confirmados antes de fechar a compra.' },
  { q: 'Os preços do site são finais?', a: 'Os preços exibidos são valores à vista de referência. O valor final, descontos e parcelamento são confirmados no atendimento.' },
  { q: 'Posso trocar ou devolver um produto?', a: 'Sim, seguimos o Código de Defesa do Consumidor: 7 dias para arrependimento em compras remotas e troca imediata em caso de defeito de fábrica.' },
];

const POLICIES = [
  { q: 'Política de privacidade', a: 'Usamos seu nome apenas para montar a mensagem do WhatsApp e personalizar o atendimento. Não armazenamos dados de pagamento — nenhuma transação acontece neste site. Seus dados de conversa ficam protegidos pelo WhatsApp.' },
  { q: 'Política de trocas e devoluções', a: 'Você tem 7 dias corridos após o recebimento para desistir da compra (CDC, art. 49). Produtos com defeito de fábrica são trocados imediatamente mediante análise. O produto deve estar com a embalagem e os acessórios originais.' },
  { q: 'Política de garantia', a: 'Todos os produtos possuem garantia de fábrica (6 a 12 meses conforme a marca). A Valhalla intermedia o acionamento da garantia junto à assistência autorizada quando necessário.' },
  { q: 'Política de entrega e retirada', a: 'Retirada na loja com hora marcada, sem custo. Entregas em Macapá e região são combinadas com o atendente; o frete é informado antes da confirmação da compra.' },
];

const HOMEPAGE_DATA = {
  hero: {
    eyebrow: 'Oferta da semana',
    headline: 'GALAXY S25 ULTRA com desconto de R$ 700 à vista',
    subtext: 'Garanta o seu direto com nosso time no WhatsApp. Atendimento rápido, produto original e garantia de fábrica.',
    ctaLabel: 'Garanta o seu!',
    ctaLink: '/p/galaxy-s25-ultra',
    secondaryCtaLabel: 'Explorar categorias',
    secondaryCtaLink: '/categorias',
    trustBadges: [
      { text: 'Produtos originais' },
      { text: 'Garantia de fábrica' },
      { text: 'Atendimento humano' },
    ],
  },
  benefits: [
    { icon: '✓', title: 'Produtos originais', description: 'Lacrados, com nota fiscal e garantia de fábrica.' },
    { icon: '⚡', title: 'Atendimento rápido', description: 'Resposta em minutos no WhatsApp, com gente de verdade.' },
    { icon: '%', title: 'Preço negociável', description: 'Condições especiais no Pix e no combo — é só perguntar.' },
    { icon: '↺', title: 'Troca garantida', description: '7 dias para arrependimento e troca imediata por defeito.' },
  ],
  steps: [
    { number: '01', title: 'Escolha seus produtos', description: 'Navegue pelo catálogo e adicione o que quiser à sua lista de interesse.' },
    { number: '02', title: 'Revise sua lista', description: 'Confira itens, variações e quantidades, e informe seu nome.' },
    { number: '03', title: 'Finalize no WhatsApp', description: 'Enviamos a mensagem pronta — o atendente confirma tudo e fecha com você.' },
  ],
  testimonials: [
    { quote: 'Comprei meu S25 pelo site e em 10 minutos já estava tudo certo no WhatsApp. Atendimento nota mil.', authorName: 'Rafael M.', authorLocation: 'Macapá-AP' },
    { quote: 'Preço melhor que os marketplaces e ainda retirei no mesmo dia. Virei cliente.', authorName: 'Camila S.', authorLocation: 'Santana-AP' },
    { quote: 'Tive dúvida entre dois notebooks e o atendente me explicou tudo com paciência. Recomendo demais.', authorName: 'João P.', authorLocation: 'Macapá-AP' },
  ],
  whatsappBanner: {
    headline: 'SIGA NOSSO CANAL NO WHATSAPP!',
    text: 'Novidades em primeira mão, promoções exclusivas, dicas e tutoriais — direto no seu WhatsApp.',
    buttonLabel: 'Clique e siga nosso canal!',
    buttonLink: 'https://wa.me/559684235663?text=' + encodeURIComponent('Olá, equipe Valhalla Tecnologia! Gostaria de falar com um atendente.'),
  },
};

const SITE_SETTINGS_DATA = {
  whatsappNumber: '559684235663',
  showTopBar: true,
  topBarText: 'Produtos originais com garantia • Atendimento humano pelo WhatsApp',
  showFab: true,
  footerTagline: 'Eletrônicos originais com atendimento humano pelo WhatsApp. Macapá - AP.',
  footerLinkColumns: [
    {
      title: 'Institucional',
      links: [
        { label: 'Sobre a empresa', url: '/sobre' },
        { label: 'Perguntas frequentes', url: '/faq' },
        { label: 'Políticas da empresa', url: '/politicas' },
        { label: 'Contato', url: '/contato' },
      ],
    },
  ],
  footerLegalText: '© 2026 Valhalla Tecnologia · CNPJ 00.000.000/0001-00 · Imagens meramente ilustrativas',
  contactEmail: 'contato@valhallatecnologia.com.br',
  contactAddress: 'Macapá - AP (retirada com hora marcada)',
  contactHours: 'seg. a sáb., 9h às 19h',
  aboutEyebrow: 'Sobre a empresa',
  aboutHeadline: 'Tecnologia de verdade, atendimento de gente.',
  aboutText: 'A Valhalla Tecnologia nasceu em Macapá-AP para facilitar o acesso a eletrônicos originais com preço justo. Aqui não tem robô de checkout: você escolhe no site e fecha negócio conversando com um atendente que entende do assunto.',
  aboutStats: [
    { value: '+5 mil', label: 'clientes atendidos pelo WhatsApp' },
    { value: '100%', label: 'produtos originais com nota fiscal' },
    { value: '4,9★', label: 'avaliação média dos clientes' },
  ],
  defaultSeo: {
    metaTitle: 'Valhalla Tecnologia — Eletrônicos originais com atendimento pelo WhatsApp',
    metaDescription: 'Catálogo de eletrônicos originais em Macapá-AP. Monte sua lista de interesse e finalize a compra com um atendente pelo WhatsApp.',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toSlug(str) {
  return str
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function hasAlreadySeeded() {
  const pluginStore = strapi.store({
    environment: strapi.config.environment,
    type: 'type',
    name: 'setup',
  });
  return !!(await pluginStore.get({ key: 'initHasRun' }));
}

async function markSeeded() {
  const pluginStore = strapi.store({
    environment: strapi.config.environment,
    type: 'type',
    name: 'setup',
  });
  await pluginStore.set({ key: 'initHasRun', value: true });
}

async function setPublicPermissions(newPermissions) {
  const publicRole = await strapi.query('plugin::users-permissions.role').findOne({
    where: { type: 'public' },
  });

  const allPermissionsToCreate = [];
  Object.keys(newPermissions).forEach((controller) => {
    const actions = newPermissions[controller];
    const permissionsToCreate = actions.map((action) =>
      strapi.query('plugin::users-permissions.permission').create({
        data: {
          action: `api::${controller}.${controller}.${action}`,
          role: publicRole.id,
        },
      })
    );
    allPermissionsToCreate.push(...permissionsToCreate);
  });
  await Promise.all(allPermissionsToCreate);
}

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedCategories() {
  const map = {};
  for (const c of CATEGORIES) {
    map[c.id] = await strapi.documents('api::category.category').create({
      data: { name: c.name, description: c.description, slug: c.id },
    });
  }
  return map;
}

async function seedBrands() {
  const map = {};
  for (const name of BRANDS) {
    map[name] = await strapi.documents('api::brand.brand').create({ data: { name, slug: toSlug(name) } });
  }
  return map;
}

async function seedTag() {
  return strapi.documents('api::tag.tag').create({ data: { name: 'Novo', slug: 'novo' } });
}

async function seedProducts(categoriesById, brandsByName, tagNovo) {
  const map = {};
  for (const p of PRODUCTS) {
    map[p.id] = await strapi.documents('api::product.product').create({
      status: 'published',
      data: {
        name: p.name,
        slug: toSlug(p.name),
        brand: brandsByName[p.brand].documentId,
        category: categoriesById[p.cat].documentId,
        tags: p.tag === 'NOVO' ? [tagNovo.documentId] : [],
        basePrice: p.price,
        variantGroupLabel: p.vl,
        specs: p.specs.map(([key, value]) => ({ key, value })),
        description: p.desc,
        warranty: p.w,
      },
    });
  }
  return map;
}

async function seedProductVariants(productsById) {
  let count = 0;
  for (const p of PRODUCTS) {
    const productEntry = productsById[p.id];
    const productIsOut = p.stock === 'out';
    for (const color of p.colors) {
      for (const variant of p.vars) {
        const sku = `VLH-${p.id.toUpperCase()}-${slugify(color.n)}-${slugify(variant.l)}`;
        await strapi.documents('api::product-variant.product-variant').create({
          status: 'published',
          data: {
            product: productEntry.documentId,
            sku,
            color: { name: color.n, hex: color.hex },
            configLabel: variant.l,
            price: p.price + variant.d,
            compareAtPrice: p.old ? p.old + variant.d : null,
            // "out of stock" at the product level overrides individual
            // color/variant availability; otherwise each combination's
            // availability is the AND of its own color and config flags.
            // There is no per-variant "low stock" state yet — that's the
            // future job of the (currently unused) stockQuantity field.
            available: productIsOut ? false : (color.av && variant.av),
          },
        });
        count += 1;
      }
    }
  }
  return count;
}

async function seedHomepage() {
  return strapi.documents('api::homepage.homepage').create({ data: HOMEPAGE_DATA });
}

async function seedSiteSettings() {
  return strapi.documents('api::site-setting.site-setting').create({ data: SITE_SETTINGS_DATA });
}

async function seedFaqs() {
  for (const [i, f] of FAQS.entries()) {
    await strapi.documents('api::faq.faq').create({ data: { question: f.q, answer: f.a, order: i } });
  }
}

async function seedPolicies() {
  for (const p of POLICIES) {
    await strapi.documents('api::policy.policy').create({ data: { title: p.q, body: p.a, slug: toSlug(p.q) } });
  }
}

async function seedEcommerce() {
  await setPublicPermissions({
    brand: ['find', 'findOne'],
    category: ['find', 'findOne'],
    tag: ['find', 'findOne'],
    product: ['find', 'findOne'],
    'product-variant': ['find', 'findOne'],
    homepage: ['find', 'findOne'],
    'site-setting': ['find', 'findOne'],
    faq: ['find', 'findOne'],
    policy: ['find', 'findOne'],
  });

  const categoriesById = await seedCategories();
  const brandsByName = await seedBrands();
  const tagNovo = await seedTag();
  const productsById = await seedProducts(categoriesById, brandsByName, tagNovo);
  const variantCount = await seedProductVariants(productsById);
  await seedHomepage();
  await seedSiteSettings();
  await seedFaqs();
  await seedPolicies();

  console.log(
    `Seeded ${CATEGORIES.length} categories, ${BRANDS.length} brands, 1 tag, ` +
    `${PRODUCTS.length} products, ${variantCount} product variants, homepage, ` +
    `site settings, ${FAQS.length} FAQs, ${POLICIES.length} policies.`
  );
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  const alreadySeeded = await hasAlreadySeeded();

  if (alreadySeeded) {
    console.log('Seed data has already been imported. Clear the database first to reimport.');
    return;
  }

  console.log('Seeding Valhalla e-commerce data...');
  await seedEcommerce();
  await markSeeded();
  console.log('Done.');
}

async function main() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  app.log.level = 'error';

  await run();
  await app.destroy();

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
