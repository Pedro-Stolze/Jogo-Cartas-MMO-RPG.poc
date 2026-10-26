const REALMS = ["Fadas", "Orcs", "Natureza", "Dragões", "Tribo", "Animais", "Fogo"];
const DECK_COUNTS = { "Comum": 18, "Rara": 7, "Épica": 4, "Lendária": 1 };
const ART_FOLDERS = {
  "Fadas": "fadas", "Orcs": "orcs", "Natureza": "natureza", "Dragões": "dragoes",
  "Tribo": "tribo", "Animais": "animais", "Fogo": "fogo"
};
const MAX_FIELD = 5;
const MAX_ENERGY = 10;
const $ = (selector) => document.querySelector(selector);

let cardCatalog = [];
let game = null;
let toastTimer = 0;
let aiTimer = 0;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const cardDescription = (card) => card.description.replace(/^descri[cç][aã]o visual:\s*/i, "");
const makeUid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const shuffle = (items) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

async function initialize() {
  try {
    const response = await fetch("data/cards.json");
    if (!response.ok) throw new Error(`Falha ao carregar as cartas (${response.status}).`);
    cardCatalog = (await response.json()).map((card) => {
      const kingdom = card.kingdom.replace("Drag?", `Drag\u00f5`);
      const artFolder = ART_FOLDERS[kingdom];
      if (!artFolder) throw new Error(`Reino sem pasta de ilustrações: ${kingdom}.`);
      return {
        ...card,
        kingdom,
        image: `assets/card-art/${artFolder}/${String(card.id).padStart(3, "0")}.jpg`
      };
    });
    fillRealmOptions();
  } catch (error) {
    $("#setup-form").innerHTML = `<p class="intro">Não foi possível carregar as cartas. Abra o jogo pelo servidor local indicado nas instruções.</p>`;
    console.error(error);
  }
}

function fillRealmOptions() {
  for (const selector of [$("#player-kingdom"), $("#ai-kingdom")]) {
    selector.innerHTML = REALMS.map((realm) => `<option value="${escapeHtml(realm)}">${escapeHtml(realm)}</option>`).join("");
  }
  $("#player-kingdom").value = "Fadas";
  $("#ai-kingdom").value = "Orcs";
}

function buildDeck(realm) {
  const realmCards = cardCatalog.filter((card) => card.kingdom === realm);
  const deck = [];
  for (const [rarity, count] of Object.entries(DECK_COUNTS)) {
    const pool = realmCards.filter((card) => card.rarity === rarity);
    if (!pool.length) throw new Error(`O reino ${realm} não tem cartas ${rarity}.`);
    for (let i = 0; i < count; i++) deck.push({ ...pool[i % pool.length], uid: makeUid() });
  }
  return shuffle(deck);
}

function canPlayCard(player, card, owner) {
  if (card.cost > player.energy) return false;
  if (card.type === "Criatura" && (player.field.length >= MAX_FIELD || player.creaturesPlayed >= 2)) return false;
  if (card.type === "Equipamento" && (player.equipmentPlayed >= 1 || !player.field.some((unit) => !unit.equipment))) return false;
  if (card.type === "Montaria" && (player.mountPlayed >= 1 || !player.field.some((unit) => !unit.mount))) return false;
  const rule = cardTargetRule(card);
  if (rule && !game.players[rule === "ally" ? owner : 1 - owner].field.length) return false;
  return true;
}

function newPlayer(name, realm) {
  const player = {
    name, realm, life: 20, deck: buildDeck(realm), hand: [], field: [], permanents: [],
    energy: 0, maxEnergy: 0, turns: 0, creaturesPlayed: 0, equipmentPlayed: 0,
    mountPlayed: 0, graveyard: []
  };
  for (let i = 0; i < 5; i++) player.hand.push(player.deck.pop());
  return player;
}

function startGame(event) {
  event.preventDefault();
  clearTimeout(aiTimer);
  game = {
    players: [
      newPlayer("Você", $("#player-kingdom").value),
      newPlayer("IA", $("#ai-kingdom").value)
    ],
    active: 0, turn: 1, pendingCard: null, selectedAttacker: null,
    messages: [], finished: false, logSequence: 0
  };
  $("#setup").hidden = true;
  $("#game").hidden = false;
  addLog(`O duelo começou: ${game.players[0].realm} contra ${game.players[1].realm}.`);
  beginTurn(0);
}

function activePlayer() { return game.players[game.active]; }
function otherPlayer() { return game.players[1 - game.active]; }
function findUnit(owner, uid) { return game.players[owner].field.find((unit) => unit.uid === uid); }
function stat(unit, key) {
  const bonus = unit.bonuses?.[key] || 0;
  const temporary = unit.temporary?.[key] || 0;
  let personal = 0;
  const effect = unit.effect.toLowerCase();
  const statKey = key === "attack" ? "atk" : key === "defense" ? "def" : key === "speed" ? "vel" : "";
  if (statKey) {
    const eachMatch = effect.match(new RegExp(`recebe \\+(\\d+)\\s*${statKey} para cada (fada|orc|dragão|animal|natureza|índio|tribo)`));
    if (eachMatch) {
      const aliases = { fada: "Fadas", orc: "Orcs", dragão: "Dragões", animal: "Animais", natureza: "Natureza", índio: "Tribo", tribo: "Tribo" };
      const allies = game.players[unit.owner].field.filter((ally) => ally.realm === aliases[eachMatch[2]]);
      personal += Number(eachMatch[1]) * allies.length;
    }
    const conditional = effect.match(new RegExp(`recebe \\+(\\d+)\\s*${statKey} se houver outro (animal|orc|dragão|fada)`));
    if (conditional) {
      const aliases = { animal: "Animais", orc: "Orcs", dragão: "Dragões", fada: "Fadas" };
      if (game.players[unit.owner].field.some((ally) => ally.uid !== unit.uid && ally.realm === aliases[conditional[2]])) personal += Number(conditional[1]);
    }
    const halfHealth = effect.match(new RegExp(`recebe \\+(\\d+)\\s*${statKey} enquanto tiver metade da vida`));
    if (halfHealth && unit.currentHealth <= unit.healthMax / 2) personal += Number(halfHealth[1]);
    if (key === "defense" && /recebe \+1 def enquanto estiver equipado/.test(effect) && (unit.equipment || unit.mount)) personal += 1;
  }
  const auraSources = [...game.players[unit.owner].field, ...game.players[unit.owner].permanents];
  const aura = auraSources.reduce((total, source) => {
    if (source === unit) return total;
    const sourceEffect = source.effect.toLowerCase();
    if (statKey && /(todos|todas|outros|aliados|aliadas|suas criaturas|seus animais)/i.test(sourceEffect)) {
      const match = sourceEffect.match(new RegExp(`\\+(\\d+)\\s*${statKey}`));
      const realmMatch = /(fadas|fada|orcs|orc|dragões|dragão|animais|animal|natureza|índios|índio|tribo)/i.exec(sourceEffect);
      const realmAliases = { fada: "Fadas", fadas: "Fadas", orc: "Orcs", orcs: "Orcs", dragão: "Dragões", dragões: "Dragões", animal: "Animais", animais: "Animais", natureza: "Natureza", índio: "Tribo", índios: "Tribo", tribo: "Tribo" };
      const appliesToRealm = !realmMatch || unit.realm === realmAliases[realmMatch[1].toLowerCase()];
      if (match && appliesToRealm) return total + Number(match[1]);
    }
    if (key === "attack" && unit.mount && /montarias aliadas recebem \+(\d+) atk/.test(sourceEffect)) return total + Number(sourceEffect.match(/montarias aliadas recebem \+(\d+) atk/)[1]);
    return total;
  }, 0);
  return (unit[key] || 0) + bonus + temporary + personal + aura;
}

function maxHealth(unit) {
  const supportHealth = [...game.players[unit.owner].field, ...game.players[unit.owner].permanents].reduce((total, source) => {
    if (source === unit) return total;
    const match = source.effect.toLowerCase().match(/\+(\d+)\s*vida/);
    if (match && /(todas|todos|aliados|criaturas)/i.test(source.effect)) {
      const realm = /(natureza|fadas|orcs|dragões|animais)/i.exec(source.effect);
      if (!realm || { natureza: "Natureza", fadas: "Fadas", orcs: "Orcs", dragões: "Dragões", animais: "Animais" }[realm[1].toLowerCase()] === unit.realm) return total + Number(match[1]);
    }
    return total;
  }, 0);
  return Math.max(0, unit.healthMax + (unit.bonuses?.health || 0) + supportHealth);
}

function beginTurn(playerIndex) {
  if (game.finished) return;
  game.active = playerIndex;
  game.pendingCard = null;
  game.selectedAttacker = null;
  const player = game.players[playerIndex];
  player.turns++;
  player.maxEnergy = Math.min(player.turns, MAX_ENERGY);
  player.energy = player.maxEnergy;
  player.creaturesPlayed = 0;
  player.equipmentPlayed = 0;
  player.mountPlayed = 0;
  for (const unit of player.field) {
    unit.attacked = false;
    unit.attacksMade = 0;
    unit.ready = true;
  }
  applyStartOfTurn(playerIndex);
  if (!drawCard(playerIndex)) return;
  addLog(`${player.name} começa o turno ${player.turns} com ${player.energy} de energia e compra 1 carta.`);
  render();
  if (playerIndex === 1) {
    setStatus("A IA está planejando sua jogada…");
    aiTimer = setTimeout(runAiTurn, 550);
  } else {
    setStatus("Jogue cartas, depois ataque usando suas criaturas mais velozes primeiro.");
  }
}

function drawCard(playerIndex) {
  const player = game.players[playerIndex];
  if (!player.deck.length) {
    finishGame(1 - playerIndex, `${player.name} não conseguiu comprar uma carta e ficou sem baralho.`);
    return false;
  }
  player.hand.push(player.deck.pop());
  return true;
}

function addLog(message) {
  if (!game) return;
  game.messages.unshift({ id: ++game.logSequence, message });
  game.messages = game.messages.slice(0, 40);
  const compact = $("#battle-log");
  if (compact) compact.innerHTML = game.messages.slice(0, 3).map((item) => escapeHtml(item.message)).join("<br>");
}

function setStatus(message) {
  $("#status-message").textContent = message;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function render() {
  if (!game) return;
  const player = game.players[0];
  const ai = game.players[1];
  $("#turn-label").textContent = `${game.active === 0 ? "Seu turno" : "Turno da IA"} · Rodada ${game.turn}`;
  $("#ai-name").textContent = ai.realm;
  $("#player-name").textContent = player.realm;
  $("#ai-life").textContent = ai.life;
  $("#player-life").textContent = player.life;
  $("#ai-energy").textContent = `${ai.energy} / ${ai.maxEnergy}`;
  $("#player-energy").textContent = `${player.energy} / ${player.maxEnergy}`;
  $("#ai-deck-count").textContent = ai.deck.length;
  $("#player-deck-count").textContent = player.deck.length;
  $("#ai-hand-count").textContent = ai.hand.length;
  $("#player-hand-count").textContent = player.hand.length;
  $("#ai-field-count").textContent = `${ai.field.length} / ${MAX_FIELD}`;
  $("#player-field-count").textContent = `${player.field.length} / ${MAX_FIELD}`;
  $("#ai-board").innerHTML = renderBoard(ai, 1);
  $("#player-board").innerHTML = renderBoard(player, 0);
  $("#ai-permanents").innerHTML = renderPermanents(ai);
  $("#player-permanents").innerHTML = renderPermanents(player);
  $("#player-hand").innerHTML = player.hand.map((card) => renderHandCard(card)).join("");
  $("#event-log").innerHTML = game.messages.map((item) => `<div class="log-entry">${escapeHtml(item.message)}</div>`).join("");
  $("#end-turn").disabled = game.finished || game.active !== 0;
  $("#cancel-action").hidden = !game.pendingCard && game.selectedAttacker === null;
  $("#cancel-action").textContent = game.selectedAttacker !== null ? "Cancelar ataque" : "Cancelar seleção";
  $("#cancel-action").hidden = game.active !== 0 || (!game.pendingCard && game.selectedAttacker === null);
}

function renderHandCard(card) {
  const canAfford = game.active === 0 && !game.finished && canPlayCard(game.players[0], card, 0);
  const art = escapeHtml(card.image);
  const stats = card.type === "Criatura"
    ? `<div class="card-stats"><span>⚔ ${card.attack}</span><span>◆ ${card.defense}</span><span>♥ ${card.health}</span><span>➤ ${card.speed}</span></div>`
    : "";
  const details = [card.name, card.kingdom, cardDescription(card), card.effect].filter(Boolean).join("\n");
  return `<button class="hand-card" type="button" data-card-id="${escapeHtml(card.uid)}" ${canAfford ? "" : "disabled"} title="${escapeHtml(details)}" aria-label="${escapeHtml(details)}">
    <span class="hand-art"><img src="${art}" alt="" loading="lazy"></span>
    <span class="card-cost">${card.cost}</span><span class="card-kingdom">${escapeHtml(card.kingdom)}</span><span class="card-rarity">${escapeHtml(card.rarity)}</span>
    <span class="hand-card-content"><span class="card-name">${escapeHtml(card.name)}</span><span class="card-type">${escapeHtml(card.type)}</span>${stats}<span class="card-effect"><b>HABILIDADE</b> ${escapeHtml(card.effect)}</span><span class="card-description">${escapeHtml(cardDescription(card))}</span></span>
  </button>`;
}

function canBeAttacker(unit) {
  return (unit.attacksMade || 0) < (unit.attacksPerTurn || 1) && !unit.sleepTurns && !unit.noAttackTurns && unit.ready;
}

function attackPriority(unit) {
  return /ataca primeiro durante combates/i.test(unit.effect) ? MAX_ENERGY + 1 : stat(unit, "speed");
}

function fastestReadyAttacker(owner) {
  const units = game.players[owner].field.filter((unit) => canBeAttacker(unit));
  return units.sort((a, b) => attackPriority(b) - attackPriority(a))[0] || null;
}

function canChooseAttacker(unit, owner) {
  const fastest = fastestReadyAttacker(owner);
  return Boolean(fastest && canBeAttacker(unit) && attackPriority(unit) === attackPriority(fastest));
}

function renderBoard(player, owner) {
  return player.field.map((unit) => {
    const selected = game.selectedAttacker === unit.uid;
    const isTarget = game.pendingCard && game.active === 0 && targetOwnerForPending() === owner;
    const isFastest = game.active === 0 && owner === 0 && canChooseAttacker(unit, 0);
    const healthClass = unit.currentHealth <= Math.max(1, unit.healthMax / 2) ? "wounded" : "";
    const healthMaximum = maxHealth(unit);
    const healthPercent = Math.max(0, Math.min(100, healthMaximum ? unit.currentHealth / healthMaximum * 100 : 0));
    const sleep = unit.sleepTurns > 0 ? `<span class="sleep-badge">Zzz</span>` : "";
    const hint = selected ? "Escolha um alvo inimigo" : (isFastest ? "Mais veloz — clique para atacar" : "");
    const details = [unit.name, unit.kingdom, cardDescription(unit), unit.effect].filter(Boolean).join("\n");
    const feedback = unit.feedback && unit.feedbackUntil > Date.now() ? ` ${unit.feedback}-flash` : "";
    const card = `<div class="unit-card ${selected ? "selected" : ""} ${isTarget ? "targetable" : ""} ${isFastest ? "attacker" : ""}${feedback}" data-unit-id="${escapeHtml(unit.uid)}" data-owner="${owner}" role="button" tabindex="0" title="${escapeHtml(details)}" aria-label="${escapeHtml(details)}">
      <div class="unit-art"><img src="${escapeHtml(unit.image)}" alt="" loading="lazy"></div><span class="realm-badge">${escapeHtml(unit.kingdom)}</span>${sleep}
      <div class="unit-content"><span class="unit-name">${escapeHtml(unit.name)}</span><span class="unit-description">${escapeHtml(cardDescription(unit))}</span>
        <span class="unit-state"><span title="Ataque">⚔ ${stat(unit, "attack")}</span><span title="Defesa">◆ ${stat(unit, "defense")}</span><span class="${healthClass}" title="Vida atual / máxima">♥ ${unit.currentHealth}/${healthMaximum}</span><span title="Velocidade">➤ ${stat(unit, "speed")}</span></span>
        <span class="unit-health-track" aria-label="Vida: ${unit.currentHealth} de ${healthMaximum}"><span style="width:${healthPercent}%"></span></span>
        <span class="unit-effect">${escapeHtml(unit.effect || "Sem habilidade especial.")}</span><span class="unit-hint">${hint}</span></div>
    </div>`;
    return card;
  }).join("");
}

function renderPermanents(player) {
  return player.permanents.map((card) => `<span class="permanent-chip">${escapeHtml(card.type)} · ${escapeHtml(card.name)}</span>`).join("");
}

function cardTargetRule(card) {
  const text = card.effect.toLowerCase();
  if (card.type === "Equipamento" || card.type === "Montaria") return "ally";
  if (card.type !== "Feitiço") return null;
  if (/(todas as criaturas inimigas|todos os inimigos|criaturas inimigas perdem|cause \d+ de dano a todas)/i.test(text)) return null;
  if (/(criatura inimiga|alvo inimigo|qualquer alvo|dano verdadeiro)/i.test(text)) return "enemy";
  if (/(uma criatura aliada|criatura aliada|de uma criatura|aliado)/i.test(text) && !/(todos|todas)/i.test(text)) return "ally";
  if (/uma criatura recebe/i.test(text)) return "ally";
  if (/(uma criatura inimiga|coloque uma criatura)/i.test(text)) return "enemy";
  return null;
}

function targetOwnerForPending() {
  const card = game.players[0].hand.find((item) => item.uid === game.pendingCard);
  const rule = card && cardTargetRule(card);
  if (rule === "ally") return 0;
  if (rule === "enemy") return 1;
  return null;
}

function selectCard(cardUid) {
  if (game.active !== 0 || game.finished) return;
  const player = game.players[0];
  const card = player.hand.find((item) => item.uid === cardUid);
  if (!card) return;
  if (card.cost > player.energy) return showToast("Você não tem energia suficiente para essa carta.");
  if (card.type === "Criatura" && (player.field.length >= MAX_FIELD || player.creaturesPlayed >= 2)) {
    return showToast(player.field.length >= MAX_FIELD ? "Seu campo já tem 5 criaturas." : "Você já jogou 2 criaturas neste turno.");
  }
  if (card.type === "Equipamento" && player.equipmentPlayed >= 1) return showToast("Você só pode jogar 1 equipamento por turno.");
  if (card.type === "Montaria" && player.mountPlayed >= 1) return showToast("Você só pode jogar 1 montaria por turno.");
  const rule = cardTargetRule(card);
  if (rule && !game.players[rule === "ally" ? 0 : 1].field.length) return showToast("Não há criatura válida para escolher.");
  game.pendingCard = cardUid;
  game.selectedAttacker = null;
  if (rule) {
    setStatus(`Escolha uma criatura ${rule === "ally" ? "aliada" : "inimiga"} destacada no campo.`);
    render();
    return;
  }
  game.pendingCard = null;
  playCard(0, cardUid, null);
}

function makeUnit(card, owner, ready = false) {
  return {
    ...card, owner, currentHealth: card.health, healthMax: card.health,
    bonuses: { attack: 0, defense: 0, speed: 0, health: 0 }, equipment: null, mount: null,
    temporary: { attack: 0, defense: 0, speed: 0, health: 0 },
    attacksMade: 0, attacksPerTurn: /atacar uma segunda vez/i.test(card.effect) ? 2 : 1,
    noAttackTurns: 0,
    attacked: false, ready, sleepTurns: 0
  };
}

function playCard(owner, cardUid, targetUid) {
  const player = game.players[owner];
  const index = player.hand.findIndex((item) => item.uid === cardUid);
  if (index < 0) return;
  const card = player.hand[index];
  if (card.cost > player.energy) return;
  const rule = cardTargetRule(card);
  const targetOwner = rule === "ally" ? owner : 1 - owner;
  const target = targetUid ? findUnit(targetOwner, targetUid) : null;
  if (rule && !target) return;

  player.energy -= card.cost;
  player.hand.splice(index, 1);
  if (card.type === "Criatura") {
    if (player.field.length >= MAX_FIELD || player.creaturesPlayed >= 2) {
      player.hand.splice(index, 0, card);
      player.energy += card.cost;
      return showToast("Limite de criaturas deste turno atingido.");
    }
    const unit = makeUnit(card, owner, /atacar imediatamente|atacar imediatamente ao entrar/i.test(card.effect));
    player.field.push(unit);
    player.creaturesPlayed++;
    addLog(`${player.name} invocou ${card.name}.`);
    if (/(ao entrar|quando entra|ao ser invocada)/i.test(card.effect)) resolveEffect(unit, owner, "summon");
  } else if (card.type === "Equipamento" || card.type === "Montaria") {
    if (!target) {
      player.hand.splice(index, 0, card);
      player.energy += card.cost;
      return;
    }
    const slot = card.type === "Equipamento" ? "equipment" : "mount";
    if (target[slot]) {
      player.hand.splice(index, 0, card);
      player.energy += card.cost;
      return showToast(`Essa criatura já tem ${card.type === "Equipamento" ? "um equipamento" : "uma montaria"}.`);
    }
    target[slot] = card;
    applyItemStats(target, card);
    if (card.type === "Equipamento") player.equipmentPlayed++;
    else player.mountPlayed++;
    addLog(`${player.name} equipou ${target.name} com ${card.name}.`);
    if (/atacar imediatamente/i.test(card.effect)) target.ready = true;
  } else if (card.type === "Suporte") {
    player.permanents.push(card);
    addLog(`${player.name} colocou ${card.name} em campo.`);
  } else {
    addLog(`${player.name} lançou ${card.name}.`);
    resolveEffect(card, owner, "cast", target);
  }
  if (owner === 0) setStatus(`${card.name} foi jogada.`);
  render();
  checkWinner();
}

function applyItemStats(unit, card) {
  const effect = card.effect;
  const keys = [
    ["attack", /(?:\+|recebe\s+\+)(\d+)\s*ATK/i],
    ["defense", /(?:\+|recebe\s+\+)(\d+)\s*DEF/i],
    ["speed", /(?:\+|recebe\s+\+)(\d+)\s*VEL/i],
    ["health", /(?:\+|recebe\s+\+)(\d+)\s*VIDA/i]
  ];
  for (const [key, pattern] of keys) {
    const match = effect.match(pattern);
    if (match) {
      unit.bonuses[key] += Number(match[1]);
      if (key === "health") unit.currentHealth += Number(match[1]);
    }
  }
  if (unit.currentHealth > unit.healthMax + unit.bonuses.health) unit.currentHealth = unit.healthMax + unit.bonuses.health;
}

function resolveEffect(card, owner, trigger, target = null) {
  const text = card.effect;
  const lower = text.toLowerCase();
  if (trigger === "attack" && !/(ao atacar|quando ataca)/i.test(lower)) return;

  const amountMatch = lower.match(/(?:cure|cura|cure|cause|causa|causar|recebe|reduz|perde|perdem)\s+(\d+)/i)
    || lower.match(/\+(\d+)/);
  const amount = amountMatch ? Number(amountMatch[1]) : 1;
  const allEnemies = /(todas as criaturas inimigas|todos os inimigos|criaturas inimigas)/i.test(lower) && /(dano|dormir|perdem|congel|sono)/i.test(lower);
  const allAllies = /(todos os aliados|todas as criaturas aliadas|todos os aliados|todas as criaturas|todos os orcs|todos os dragões|todos os animais|todos os seus feitiços|suas criaturas recebem|seus animais recebem|aliados recebem)/i.test(lower);

  if (/não pode atacar/i.test(lower) && !/dorm|sono|atordo/i.test(lower)) {
    const unit = target || [...game.players[1 - owner].field].sort((a, b) => stat(b, "attack") - stat(a, "attack"))[0];
    if (unit) {
      unit.noAttackTurns = Math.max(unit.noAttackTurns, 1);
      addLog(`${unit.name} não poderá atacar no próximo turno.`);
    }
    return;
  }

  if (/dorm|sono|atordo/i.test(lower)) {
    const enemyField = game.players[1 - owner].field;
    const selectedTargets = trigger === "attack"
      ? target && target.currentHealth > 0 ? [target] : []
      : allEnemies ? enemyField : target ? [target] : /criatura inimiga/i.test(lower) ? [...enemyField].sort((a, b) => stat(b, "attack") - stat(a, "attack")).slice(0, 1) : [];
    for (const unit of selectedTargets.slice(0, /até 2|dois/i.test(lower) ? 2 : selectedTargets.length)) {
      const duration = (lower.match(/(\d+)\s+turno/) || [])[1] ? Number(lower.match(/(\d+)\s+turno/)[1]) : 1;
      unit.sleepTurns = Math.max(unit.sleepTurns, duration);
      addLog(`${unit.name} foi colocada para dormir.`);
    }
    return;
  }

  if (/cause \d+ de dano|causa \d+ de dano|cause dano|dano verdadeiro/i.test(lower)) {
    if (trigger === "attack" && /dano adicional/i.test(lower)) return;
    const damage = amount;
    const targets = allEnemies ? [...game.players[1 - owner].field] : target ? [target] : [];
    for (const unit of targets) {
      const actual = /verdadeiro/i.test(lower) ? damage : Math.max(0, damage - stat(unit, "defense"));
      damageUnit(unit, actual, card.name);
    }
    applyStatReduction(lower, owner, target);
    checkWinner();
    return;
  }

  if (/cure|cura|curar/i.test(lower)) {
    const allies = game.players[owner].field;
    const validTarget = target && target.owner === owner && allies.some((unit) => unit.uid === target.uid) ? target : null;
    const targets = /todos|todas/i.test(lower) ? allies : validTarget ? [validTarget] : [...allies].sort((a, b) => a.currentHealth - b.currentHealth).slice(0, 1);
    let restored = 0;
    for (const unit of targets) {
      const value = /completamente/i.test(lower) ? maxHealth(unit) : amount;
      const healed = Math.min(value, maxHealth(unit) - unit.currentHealth);
      if (healed > 0) {
        unit.currentHealth += healed;
        restored += healed;
        showUnitFeedback(unit, "heal");
        addLog(`${card.name} curou ${healed} de VIDA de ${unit.name}.`);
      }
    }
    if (!restored) addLog(`${card.name} não restaurou vida: nenhum aliado precisava de cura.`);
    if (/compra 1 carta|compre 1 carta/i.test(lower)) {
      drawCard(owner);
      addLog(`${game.players[owner].name} comprou uma carta pelo efeito de ${card.name}.`);
    }
    return;
  }

  if (/invoc|invoque|invocar/i.test(lower) && /espírito|animal comum|recruta orc/i.test(lower)) {
    const count = /dois|2/i.test(lower) ? 2 : 1;
    const tokenName = /recruta orc/i.test(lower) ? "Recruta Orc" : /animal/i.test(lower) ? "Animal Comum" : "Espírito Ancestral";
    for (let i = 0; i < count && game.players[owner].field.length < MAX_FIELD; i++) {
      const token = { ...card, uid: makeUid(), name: tokenName, type: "Criatura", attack: 2, defense: 2, health: 2, speed: 2, cost: 0, effect: "", owner };
      game.players[owner].field.push(makeUnit(token, owner, true));
    }
    addLog(`${card.name} invocou ${count} aliado(s).`);
    return;
  }

  if (/compra 1 carta|compre 1 carta/i.test(lower)) {
    drawCard(owner);
    addLog(`${game.players[owner].name} comprou uma carta pelo efeito de ${card.name}.`);
  }

  if (/(perde|perdem|reduz\w*)\s+\d+\s*(vel|atk|def)/i.test(lower)) {
    applyStatReduction(lower, owner, target);
  }

  if (trigger !== "attack" && /\+\d+\s*(atk|def|vel|vida)/i.test(lower)) {
    const statMatches = [...lower.matchAll(/\+(\d+)\s*(atk|def|vel|vida)/g)];
    const chosenTargets = target ? [target] : allAllies ? game.players[owner].field.filter((unit) => {
      const realmMatch = /(fada|orc|dragão|animal|natureza|índio|tribo)/i.exec(lower);
      const realmAliases = { fada: "Fadas", orc: "Orcs", dragão: "Dragões", animal: "Animais", natureza: "Natureza", índio: "Tribo", tribo: "Tribo" };
      return !realmMatch || unit.realm === realmAliases[realmMatch[1].toLowerCase()];
    }) : [];
    for (const unit of chosenTargets) {
      for (const [, value, key] of statMatches) {
        const statKey = { atk: "attack", def: "defense", vel: "speed", vida: "health" }[key];
        const bucket = /(até o fim|até o final|próximo turno|neste turno)/i.test(lower) ? unit.temporary : unit.bonuses;
        if (statKey && bucket) bucket[statKey] += Number(value);
      }
    }
    if (chosenTargets.length) addLog(`${card.name} fortaleceu as criaturas aliadas.`);
  }
}

function applyStatReduction(effect, owner, target) {
  const match = effect.match(/(?:perde|perdem|reduz\w*)\s+(\d+)\s*(vel|atk|def)/i);
  if (!match) return;
  const field = /(criatura inimiga|criaturas inimigas|alvo)/i.test(effect) ? game.players[1 - owner].field : target ? [target] : [];
  const key = { atk: "attack", def: "defense", vel: "speed" }[match[2].toLowerCase()];
  for (const unit of field) {
    const bucket = /próximo turno/i.test(effect) ? unit.temporary : unit.bonuses;
    bucket[key] -= Number(match[1]);
  }
}

function applyStartOfTurn(owner) {
  for (const unit of [...game.players[owner].field, ...game.players[owner].permanents]) {
    const effect = unit.effect.toLowerCase();
    if (!/(início do turno|início do seu turno|uma vez por turno)/i.test(effect)) continue;
    if (/quando .* (?:for destruído|atacar)/i.test(effect)) continue;
    if (/recebe \+1 vida/i.test(effect)) {
      unit.healthMax += 1;
      unit.currentHealth += 1;
      addLog(`${unit.name} recebeu +1 VIDA.`);
    } else {
      resolveEffect(unit, owner, "start");
    }
  }
}

function damageUnit(unit, amount, source) {
  unit.currentHealth -= amount;
  if (amount > 0) showUnitFeedback(unit, "damage");
  addLog(`${source} causou ${amount} de dano a ${unit.name}.`);
  if (unit.currentHealth <= 0) destroyUnit(unit, source);
}

function showUnitFeedback(unit, type) {
  unit.feedback = type;
  unit.feedbackUntil = Date.now() + 850;
  const feedbackUntil = unit.feedbackUntil;
  setTimeout(() => {
    if (!game || unit.feedbackUntil !== feedbackUntil) return;
    unit.feedback = "";
    render();
  }, 850);
}

function destroyUnit(unit, source) {
  const player = game.players[unit.owner];
  const effect = unit.effect.toLowerCase();
  const index = player.field.findIndex((item) => item.uid === unit.uid);
  if (index === -1) return;
  player.field.splice(index, 1);
  player.graveyard.push(unit, unit.equipment, unit.mount);
  addLog(`${unit.name} foi derrotada por ${source}.`);
  if (/quando destruíd[oa], retorna à sua mão/.test(effect)) {
    player.hand.push({ ...unit, uid: makeUid(), owner: undefined, currentHealth: undefined, healthMax: undefined, bonuses: undefined, temporary: undefined, attacked: undefined, ready: undefined, sleepTurns: undefined, equipment: undefined, mount: undefined });
    addLog(`${unit.name} retornou à mão.`);
  }
  if (/quando destruíd[oa] causa \d+ de dano/.test(effect)) {
    const damage = Number((effect.match(/causa (\d+) de dano/) || [])[1]);
    const target = [...game.players[1 - unit.owner].field].sort((a, b) => a.currentHealth - b.currentHealth)[0];
    if (target) damageUnit(target, damage, unit.name);
  }
  if (unit.realm === "Animais" && player.permanents.some((card) => /quando um animal aliado for destruído/i.test(card.effect))) {
    const token = { ...unit, uid: makeUid(), name: "Animal Comum", type: "Criatura", attack: 2, defense: 2, health: 2, speed: 2, effect: "", cost: 0 };
    if (player.field.length < MAX_FIELD) player.field.push(makeUnit(token, unit.owner, true));
  }
}

function attack(attacker, defender) {
  if (!attacker || !canBeAttacker(attacker)) return;
  const owner = attacker.owner;
  const enemy = game.players[1 - owner];
  if (enemy.field.length && !defender) return;
  const text = attacker.effect.toLowerCase();
  const attackBonusMatch = text.match(/recebe \+(\d+) atk ao atacar|ao atacar[^.]*?recebe \+(\d+) atk/);
  const attackBonus = attackBonusMatch && !/recebe \+\d+ atk ao atacar criaturas com vel menor/i.test(text)
    ? Number(attackBonusMatch[1] || attackBonusMatch[2])
    : 0;
  const temporaryBonus = text.match(/ao atacar[^.]*?recebe \+(\d+) atk[^.]*até o (?:fim|final) do turno/);
  if (temporaryBonus) attacker.temporary.attack += Number(temporaryBonus[1]);
  if (!enemy.field.length) {
    const damage = stat(attacker, "attack") + (temporaryBonus ? 0 : attackBonus);
    enemy.life -= damage;
    attacker.attacksMade = (attacker.attacksMade || 0) + 1;
    showUnitFeedback(attacker, "attack");
    addLog(`${attacker.name} atacou diretamente: ${damage} de dano à vida de ${enemy.name}.`);
    resolveEffect(attacker, owner, "attack", null);
    if (owner === 0) setStatus(`${attacker.name} atacou diretamente. Escolha outra ação ou encerre o turno.`);
    render();
    checkWinner();
    return;
  }
  if (!defender) return;
  const conditionalAttackBonus = (/recebe \+\d+ atk ao atacar criaturas com vel menor/i.test(text) && stat(defender, "speed") < stat(attacker, "speed") ? Number((text.match(/recebe \+(\d+) atk ao atacar criaturas com vel menor/i) || [])[1]) : 0)
    + (defender.sleepTurns > 0 && /criaturas dormindo recebem \+(\d+) de dano/i.test([...game.players[owner].field, ...game.players[owner].permanents].map((unit) => unit.effect.toLowerCase()).join(" ")) ? Number([...game.players[owner].field, ...game.players[owner].permanents].map((unit) => unit.effect.toLowerCase()).join(" ").match(/criaturas dormindo recebem \+(\d+) de dano/)[1]) : 0);
  const ignoresDefense = /ignoram bônus de def|ignoram.*def/i.test(text);
  const defense = ignoresDefense ? 0 : stat(defender, "defense");
  const additionalDamage = Number((text.match(/causa (\d+) de dano adicional/i) || [])[1] || 0);
  const dealt = Math.max(0, stat(attacker, "attack") + (temporaryBonus ? 0 : attackBonus) + conditionalAttackBonus - defense) + additionalDamage;
  showUnitFeedback(attacker, "attack");
  if (/ao atacar recebe \+1 def|quando ataca recebe \+1 def/i.test(text)) attacker.temporary.defense += 1;
  for (const source of game.players[owner].field) {
    if (source.realm === attacker.realm && /sempre que um animal aliado atacar|quando um animal aliado atacar/i.test(source.effect.toLowerCase())) attacker.temporary.attack += 1;
  }
  const defenderWasAlive = defender.currentHealth > 0;
  damageUnit(defender, dealt, attacker.name);
  resolveEffect(attacker, owner, "attack", defender.currentHealth > 0 ? defender : null);
  if (defenderWasAlive && defender.currentHealth > 0 && attacker.currentHealth > 0 && !defender.sleepTurns) {
    const retaliation = Math.max(0, stat(defender, "attack") - stat(attacker, "defense"));
    damageUnit(attacker, retaliation, defender.name);
  }
  attacker.attacksMade = (attacker.attacksMade || 0) + 1;
  if (/quando destrói uma criatura recebe \+1 atk/i.test(text) && defender.currentHealth <= 0) {
    attacker.bonuses.attack += 1;
    addLog(`${attacker.name} recebeu +1 ATK permanente.`);
  }
  if (/quando destrói uma criatura,? compre 1 carta|quando destrói uma criatura,? compra 1 carta/i.test(text) && defender.currentHealth <= 0) {
    drawCard(owner);
    addLog(`${attacker.name} comprou uma carta.`);
  }
  if (owner === 0) setStatus(`${attacker.name} concluiu o ataque.`);
  render();
  checkWinner();
}

function checkWinner() {
  if (game.finished) return;
  const lostPlayer = game.players.findIndex((player) => player.life <= 0);
  if (lostPlayer !== -1) finishGame(1 - lostPlayer, `${game.players[lostPlayer].name} ficou sem vida.`);
}

function finishGame(winner, reason) {
  if (game.finished) return;
  game.finished = true;
  game.pendingCard = null;
  game.selectedAttacker = null;
  clearTimeout(aiTimer);
  addLog(reason);
  render();
  setTimeout(() => openDialog(winner === 0 ? "Vitória!" : "Derrota", `<p>${escapeHtml(reason)}</p><p>${winner === 0 ? "Você venceu o duelo." : "A IA venceu desta vez."}</p><button class="primary-button" type="button" id="dialog-restart">Jogar novamente →</button>`), 250);
}

function finishTurn() {
  if (game.active !== 0 || game.finished || game.pendingCard || game.selectedAttacker) return;
  endTurn(0);
}

function endTurn(owner) {
  for (const unit of game.players[owner].field) {
    unit.temporary = { attack: 0, defense: 0, speed: 0, health: 0 };
    if (unit.sleepTurns > 0) unit.sleepTurns--;
    if (unit.noAttackTurns > 0) unit.noAttackTurns--;
  }
  const next = 1 - owner;
  if (next === 0) game.turn++;
  beginTurn(next);
}

function onBoardClick(event) {
  const boardCard = event.target.closest(".unit-card");
  if (!boardCard || game.finished || game.active !== 0) return;
  const owner = Number(boardCard.dataset.owner);
  const uid = boardCard.dataset.unitId;
  if (game.pendingCard) {
    const card = game.players[0].hand.find((item) => item.uid === game.pendingCard);
    const rule = card && cardTargetRule(card);
    const expectedOwner = rule === "ally" ? 0 : 1;
    if (owner !== expectedOwner) return showToast(`Escolha uma criatura ${expectedOwner === 0 ? "aliada" : "inimiga"}.`);
    const pendingCard = game.pendingCard;
    game.pendingCard = null;
    playCard(0, pendingCard, uid);
    return;
  }
  if (game.selectedAttacker) {
    if (owner !== 1) return showToast("Escolha uma criatura inimiga para atacar.");
    const attacker = findUnit(0, game.selectedAttacker);
    const defender = findUnit(1, uid);
    game.selectedAttacker = null;
    attack(attacker, defender);
    return;
  }
  if (owner === 0) {
    const fastest = fastestReadyAttacker(0);
    if (!canChooseAttacker(findUnit(0, uid), 0)) return showToast(fastest ? `Primeiro ataque com a criatura mais veloz: ${fastest.name}.` : "Essa criatura não pode atacar neste turno.");
    if (game.players[1].field.length) {
      game.selectedAttacker = uid;
      setStatus(`${findUnit(0, uid).name} selecionada. Escolha uma criatura inimiga.`);
      render();
    } else {
      attack(fastest, null, true);
    }
  }
}

function playPendingCard() {
  if (!game.pendingCard) return;
  game.pendingCard = null;
  game.selectedAttacker = null;
  setStatus("Seleção cancelada.");
  render();
}

function chooseAiCard(player) {
  const options = player.hand.filter((card) => canPlayCard(player, card, 1));
  const priority = { "Criatura": 5, "Feitiço": 4, "Equipamento": 3, "Montaria": 2, "Suporte": 1 };
  return options.sort((a, b) => priority[b.type] - priority[a.type] || b.cost - a.cost)[0];
}

function aiTarget(card) {
  const rule = cardTargetRule(card);
  if (rule === "ally") return game.players[1].field.filter((unit) => card.type !== "Feitiço" ? !unit[card.type === "Equipamento" ? "equipment" : "mount"] : true).sort((a, b) => a.currentHealth - b.currentHealth)[0];
  if (rule === "enemy") return game.players[0].field.sort((a, b) => a.currentHealth - b.currentHealth)[0];
  return null;
}

function runAiTurn() {
  if (game.finished || game.active !== 1) return;
  const player = game.players[1];
  let actionCount = 0;
  const playNext = () => {
    if (game.finished || game.active !== 1) return;
    const card = chooseAiCard(player);
    if (card && actionCount++ < 12) {
      const target = aiTarget(card);
      if (!cardTargetRule(card) || target) playCard(1, card.uid, target?.uid || null);
      render();
      aiTimer = setTimeout(playNext, 480);
      return;
    }
    attackWithAi();
  };
  playNext();
}

function attackWithAi() {
  if (game.finished || game.active !== 1) return;
  const attacker = fastestReadyAttacker(1);
  if (!attacker) {
    addLog("A IA encerrou o turno.");
    aiTimer = setTimeout(() => endTurn(1), 650);
    return;
  }
  const enemies = game.players[0].field;
  if (!enemies.length) attack(attacker, null, true);
  else {
    const target = [...enemies].sort((a, b) => a.currentHealth - b.currentHealth || stat(b, "attack") - stat(a, "attack"))[0];
    attack(attacker, target);
  }
  aiTimer = setTimeout(attackWithAi, 500);
}

function openDialog(title, content) {
  $("#dialog-title").textContent = title;
  $("#dialog-content").innerHTML = content;
  $("#dialog").hidden = false;
  const restart = $("#dialog-restart");
  if (restart) restart.addEventListener("click", () => {
    $("#dialog").hidden = true;
    $("#game").hidden = true;
    $("#setup").hidden = false;
    game = null;
  });
}

function showRules() {
  openDialog("Regras da partida", `<ul>
    <li>Cada jogador começa com 20 de vida, compra 5 cartas e usa um deck de 30 cartas.</li>
    <li>A cada turno, a energia é restaurada e aumenta em 1 até o máximo de 10; compre 1 carta no início do turno.</li>
    <li>O deck de teste segue a proporção do manual: 18 comuns, 7 raras, 4 épicas e 1 lendária. As cartas se repetem quando necessário.</li>
    <li>Você pode jogar até 2 criaturas, 1 equipamento e 1 montaria por turno. O campo comporta até 5 criaturas; cada uma recebe 1 equipamento e 1 montaria.</li>
    <li>Criaturas recém-invocadas não atacam, exceto quando uma habilidade permite. Ataque com a criatura disponível de maior velocidade primeiro.</li>
    <li>Dano de combate = ATK do atacante − DEF do defensor (mínimo 0); a criatura defensora contra-ataca. Sem criaturas inimigas, ataques atingem o jogador.</li>
    <li>Feitiços e habilidades seguem o texto das cartas. Sono impede a criatura de agir durante o próximo turno dela.</li>
    <li>Vença ao zerar a vida rival ou quando o adversário precisar comprar e não tiver cartas.</li>
  </ul><p>O manual não define relações de vantagem entre reinos; por isso, nenhum bônus de reino é aplicado.</p>`);
}

$("#setup-form").addEventListener("submit", startGame);
$("#end-turn").addEventListener("click", finishTurn);
$("#cancel-action").addEventListener("click", playPendingCard);
$("#player-hand").addEventListener("click", (event) => {
  const button = event.target.closest(".hand-card");
  if (button) selectCard(button.dataset.cardId);
});
$("#ai-board").addEventListener("click", onBoardClick);
$("#player-board").addEventListener("click", onBoardClick);
$("#rules-button").addEventListener("click", showRules);
$("#close-dialog").addEventListener("click", () => { $("#dialog").hidden = true; });
$("#dialog").addEventListener("click", (event) => { if (event.target === $("#dialog")) $("#dialog").hidden = true; });
$("#back-to-menu").addEventListener("click", () => {
  clearTimeout(aiTimer);
  game = null;
  $("#game").hidden = true;
  $("#setup").hidden = false;
});
$("#new-game").addEventListener("click", (event) => {
  event.preventDefault();
  clearTimeout(aiTimer);
  game = null;
  $("#game").hidden = true;
  $("#setup").hidden = false;
});

initialize();
