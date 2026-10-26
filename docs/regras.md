# Regras do prototipo

Esta versão segue o Manual do Jogador do projeto. Quando o manual não define uma interação, o protótipo não inventa uma vantagem entre reinos.

## Preparacao

- Cada jogador começa com 20 de vida e compra 5 cartas.
- O baralho tem 30 cartas: 18 comuns, 7 raras, 4 épicas e 1 lendária. Quando um reino não tem cartas suficientes de uma raridade, as cartas escritas dessa raridade são reutilizadas.
- O primeiro jogador começa com 1 de energia.

## Turno

No início do próprio turno, o jogador recupera toda a energia, aumenta a energia máxima em 1 (até 10), ativa os efeitos de início de turno e compra uma carta.

Durante o turno, pode jogar ate 2 criaturas, 1 equipamento e 1 montaria. O campo pode ter ate 5 criaturas, cada uma com espaco para um equipamento e uma montaria. Feiticos podem ser jogados enquanto houver energia.

## Combate

- Criaturas invocadas nao atacam no mesmo turno, exceto quando o efeito permite.
- Ataque primeiro com a criatura disponível de maior velocidade. Empates podem ser resolvidos em qualquer ordem.
- O dano de ataque é ATK menos DEF, no mínimo zero. A criatura defensora revida usando a mesma regra.
- Habilidades disparadas por um ataque são resolvidas durante o combate; dano adicional é aplicado uma única vez e efeitos de sono podem impedir o contra-ataque.
- Habilidades de cura restauram vida de criaturas aliadas, sem ultrapassar a vida máxima. O campo mostra a vida atual, os atributos, a habilidade e a descrição visual das cartas.
- Sem criaturas inimigas, o ataque causa dano direto ao jogador rival.
- Sono impede uma criatura de atacar durante o proximo turno dela.

## Vitoria

Vence quem reduzir a vida rival a zero ou quando o rival precisar comprar uma carta e o baralho estiver vazio.

## Limites do prototipo

O manual cita vantagem e fraqueza entre reinos, mas não especifica as combinações. Também existem efeitos em texto livre cuja resolução automática pode variar; os efeitos definidos pelas regras básicas e os efeitos implementados no jogo são aplicados localmente pela IA simples.
